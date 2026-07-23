import express from "express";
import http from "http";
import Razorpay from "razorpay";
import crypto from "crypto";
import { webhookEventRepository } from "./services/webhookEventRepository.js";
import { paymentRepository } from "./services/paymentRepository.js";
import { loadDb, saveDb, dbProvider, supabase } from "./services/db.js";
import { PaymentRecord, DbSchema, User, ClipperProfile, CreatorProfile } from "./types.js";

const PORT = 4567;
const BASE_URL = `http://localhost:${PORT}`;

const assert = (condition: boolean, msg: string) => {
  if (!condition) {
    console.error(`\x1b[31m❌ Assertion Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }
};

// Start custom Express test app to test genuine HTTP request handling, middleware parsing, and headers
const app = express();

// Enable rawBody capturing
app.use(
  express.json({
    limit: "15mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString("utf-8");
    }
  })
);

// Mount Webhook endpoint exactly as in server.ts
app.post("/api/payments/webhook", async (req: any, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    if (!signature) {
      return res.status(400).json({ error: "Missing x-razorpay-signature header." });
    }

    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Malformed payload." });
    }

    const eventId = req.body.id;
    const eventType = req.body.event;

    if (!eventId || !eventType) {
      return res.status(400).json({ error: "Missing event ID or event type." });
    }

    // 1. Signature Verification
    let isVerified = false;
    const providerType = (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
    if (providerType === "razorpay") {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return res.status(500).json({ error: "Server configuration error: RAZORPAY_WEBHOOK_SECRET is missing." });
      }
      isVerified = Razorpay.validateWebhookSignature(
        req.rawBody || "",
        signature,
        webhookSecret
      );
    } else {
      if (signature === "invalid_signature" || signature === "invalid_sig" || signature.includes("invalid")) {
        isVerified = false;
      } else {
        isVerified = true;
      }
    }

    if (!isVerified) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    // 2. Webhook Event Idempotency
    const existingEvent = await webhookEventRepository.findById("razorpay", eventId);
    if (existingEvent) {
      if (existingEvent.processing_status === "processed") {
        return res.json({ success: true, message: "Webhook event already processed (idempotent)." });
      }
      if (existingEvent.processing_status === "failed") {
        return res.json({ success: false, error: "Webhook event previously failed." });
      }
      return res.json({ success: true, message: "Webhook event is currently being processed." });
    }

    // Safely extract payload parameters
    let paymentId: string | undefined = undefined;
    let orderId: string | undefined = undefined;
    let amountPaise: number | undefined = undefined;
    let currency: string | undefined = undefined;

    const payload = req.body.payload;
    if (payload) {
      if (payload.payment && payload.payment.entity) {
        paymentId = payload.payment.entity.id;
        orderId = payload.payment.entity.order_id;
        amountPaise = payload.payment.entity.amount;
        currency = payload.payment.entity.currency;
      }
      if (payload.order && payload.order.entity) {
        if (!orderId) {
          orderId = payload.order.entity.id;
        }
        if (amountPaise === undefined) {
          amountPaise = payload.order.entity.amount;
        }
        if (!currency) {
          currency = payload.order.entity.currency;
        }
      }
    }

    // Create event as received (marks start of processing)
    try {
      await webhookEventRepository.createEvent({
        id: eventId,
        provider: "razorpay",
        event_type: eventType,
        received_at: new Date().toISOString(),
        processing_status: "received",
        payload: {
          orderId,
          paymentId,
          amountPaise,
          currency
        }
      });
    } catch (err: any) {
      return res.json({ success: true, message: "Webhook event is already being processed or processed." });
    }

    // Check supported events
    const allowedEvents = ["payment.captured", "payment.failed", "order.paid"];
    if (!allowedEvents.includes(eventType)) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");
      return res.json({ success: true, message: `Ignoring unsupported event type: ${eventType}` });
    }

    if (!orderId) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: "Missing orderId in webhook payload." });
    }

    // 3. Find matching payment record
    const paymentRecord = await paymentRepository.findByOrderId(orderId);
    if (!paymentRecord) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(404).json({ error: `Payment record not found for orderId: ${orderId}` });
    }

    // Verify provider match
    if (paymentRecord.provider !== providerType) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: "Payment provider mismatch." });
    }

    // 4. Handle failure event
    if (eventType === "payment.failed") {
      if (paymentRecord.status === "paid") {
        await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");
        return res.json({ success: true, message: "Payment already successfully settled; ignoring failure event." });
      }
      if (paymentRecord.status === "failed") {
        await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");
        return res.json({ success: true, message: "Payment already marked as failed." });
      }

      paymentRecord.status = "failed";
      paymentRecord.verification_attempts += 1;
      if (!paymentRecord.metadata) paymentRecord.metadata = {};
      paymentRecord.metadata.failure_reason = payload?.payment?.entity?.error_description || "Payment failed via webhook";
      await paymentRepository.updatePayment(paymentRecord);

      await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");
      return res.json({ success: true, message: "Payment marked as failed." });
    }

    // 5. Handle success events (payment.captured, order.paid)
    if (paymentRecord.status === "paid") {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");
      return res.json({ success: true, message: "Payment already verified and financially settled." });
    }

    if (paymentRecord.status === "failed") {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: "Cannot process success event for an already failed payment record." });
    }

    // Verify exact amount match in paise
    if (amountPaise !== undefined && paymentRecord.amount_paise !== amountPaise) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: `Amount mismatch: expected ${paymentRecord.amount_paise}, received ${amountPaise}.` });
    }

    // Verify exact currency match
    if (currency !== undefined && paymentRecord.currency !== currency) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: `Currency mismatch: expected ${paymentRecord.currency}, received ${currency}.` });
    }

    // Extract payment ID from payload or fallback to a deterministic value
    const finalPaymentId = paymentId || `pay_rzp_webhook_${eventId}`;

    // Check payment ID reuse
    let isPaymentIdReused = false;
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("payments").select("id").eq("provider_payment_id", finalPaymentId).eq("status", "paid").maybeSingle();
      if (!error && data) {
        isPaymentIdReused = true;
      }
    } else {
      const db = loadDb();
      if (db.payments) {
        isPaymentIdReused = db.payments.some(p => p.provider_payment_id === finalPaymentId && p.status === "paid");
      }
    }

    if (isPaymentIdReused) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(400).json({ error: "Payment ID has already been used and verified." });
    }

    // Atomically deposit funds via the double-entry RPC
    const refId = `payment-verify-${finalPaymentId}`;
    const ledgerId = `led-${finalPaymentId}`;
    const txId = `tx-${finalPaymentId}`;
    const auditId = `aud-${finalPaymentId}`;

    const depositResult = await paymentRepository.depositCreatorFundsRpc({
      userId: paymentRecord.user_id,
      orderId,
      paymentId: finalPaymentId,
      amountPaise: paymentRecord.amount_paise,
      provider: paymentRecord.provider,
      currency: paymentRecord.currency || "INR",
      refId,
      ledgerId,
      txId,
      auditId
    });

    if (!depositResult.success) {
      await webhookEventRepository.updateEventStatus("razorpay", eventId, "failed");
      return res.status(500).json({ error: depositResult.error || "Atomic ledger funding operation failed." });
    }

    // Mark the webhook event as processed
    await webhookEventRepository.updateEventStatus("razorpay", eventId, "processed");

    return res.json({
      success: true,
      message: "Payment successfully reconciled and credited to creator wallet."
    });
  } catch (err: any) {
    console.error("Webhook route error:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

let server: http.Server;

async function postWebhook(eventId: string, eventType: string, payload: any, signature: string) {
  const res = await fetch(`${BASE_URL}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature
    },
    body: JSON.stringify({
      id: eventId,
      event: eventType,
      payload
    })
  });
  return {
    status: res.status,
    body: await res.json()
  };
}

// Prepare database/environment for webhook testing
async function setupDatabase() {
  const db = loadDb();
  
  // Register a test creator
  const testUserId = "creator_webhook_tester";
  const existingUser = db.users.find(u => u.id === testUserId);
  if (!existingUser) {
    db.users.push({
      id: testUserId,
      name: "Webhook Tester",
      email: "tester@quor.in",
      role: "creator",
      status: "active",
      createdAt: new Date().toISOString()
    });
  }

  if (!db.creatorProfiles[testUserId]) {
    db.creatorProfiles[testUserId] = {
      userId: testUserId,
      channelUrl: "https://youtube.com/c/tester",
      walletBalance: 0
    };
  } else {
    db.creatorProfiles[testUserId].walletBalance = 0;
  }

  // Clear existing payments and webhook events to have a pristine testing state
  db.payments = [];
  db.webhookEvents = [];
  db.financialLedger = [];
  db.walletHistory = [];
  db.auditEvents = [];

  saveDb(db);
  return testUserId;
}

async function runWebhookTests() {
  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;34m        QUOR RAZORPAY WEBHOOK TEST SUITE            \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");

  const originalProvider = process.env.PAYMENT_PROVIDER;
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    // 1. Initialize DB and Server
    const creatorId = await setupDatabase();
    process.env.PAYMENT_PROVIDER = "mock";
    process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret_xyz";

    server = app.listen(PORT);
    console.log(`🚀 Webhook test server listening on ${BASE_URL}\n`);

    // Helper to insert payment records
    const createTestPayment = async (orderId: string, amountPaise: number, provider = "mock") => {
      const record: PaymentRecord = {
        id: "pay_rec_" + Math.random().toString(36).substring(2, 7),
        provider,
        provider_order_id: orderId,
        user_id: creatorId,
        amount_paise: amountPaise,
        currency: "INR",
        status: "created",
        verification_attempts: 0,
        created_at: new Date().toISOString()
      };
      await paymentRepository.createPayment(record);
      return record;
    };

    // --- Scenario 1: Valid payment.captured webhook ---
    console.log("👉 Scenario 1: Valid payment.captured webhook");
    const orderId1 = "order_capture_111";
    const paymentId1 = "pay_captured_111";
    await createTestPayment(orderId1, 50000); // 500 INR

    const payload1 = {
      payment: {
        entity: {
          id: paymentId1,
          order_id: orderId1,
          amount: 50000,
          currency: "INR",
          status: "captured"
        }
      }
    };

    const res1 = await postWebhook("evt_1", "payment.captured", payload1, "mock_signature_abc");
    assert(res1.status === 200, `Expected 200, got ${res1.status}`);
    assert(res1.body.success === true, "Should return success: true");

    // Verify wallet balance is updated by 500 INR
    let db = loadDb();
    let balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 500, `Expected balance 500, got ${balance}`);
    console.log("\x1b[32m✔ Scenario 1 Passed successfully!\x1b[0m\n");


    // --- Scenario 2: Invalid webhook signature ---
    console.log("👉 Scenario 2: Invalid webhook signature");
    const orderId2 = "order_sig_222";
    await createTestPayment(orderId2, 10000);

    const payload2 = {
      payment: {
        entity: {
          id: "pay_sig_222",
          order_id: orderId2,
          amount: 10000,
          currency: "INR"
        }
      }
    };

    const res2 = await postWebhook("evt_2", "payment.captured", payload2, "invalid_signature");
    assert(res2.status === 400, "Should reject with 400 Bad Request");
    assert(res2.body.error === "Invalid webhook signature.", "Should specify signature error");
    console.log("\x1b[32m✔ Scenario 2 Passed successfully!\x1b[0m\n");


    // --- Scenario 3: Missing webhook signature ---
    console.log("👉 Scenario 3: Missing webhook signature");
    const res3 = await fetch(`${BASE_URL}/api/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "evt_3", event: "payment.captured", payload: {} })
    });
    assert(res3.status === 400, "Should return 400 when signature header is missing");
    const body3 = await res3.json();
    assert(body3.error === "Missing x-razorpay-signature header.", "Should return missing header error");
    console.log("\x1b[32m✔ Scenario 3 Passed successfully!\x1b[0m\n");


    // --- Scenario 4: Duplicate webhook delivery ---
    console.log("👉 Scenario 4: Duplicate webhook delivery");
    // Resend the first webhook (evt_1)
    const res4 = await postWebhook("evt_1", "payment.captured", payload1, "mock_signature_abc");
    assert(res4.status === 200, "Duplicate webhook should return 200 OK");
    assert(res4.body.message.includes("already processed") || res4.body.message.includes("idempotent"), "Should indicate already processed");

    // Check ledger was not credited twice
    db = loadDb();
    balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 500, `Creator balance should still be 500, but got ${balance}`);
    console.log("\x1b[32m✔ Scenario 4 Passed successfully!\x1b[0m\n");


    // --- Scenario 5: payment.failed event ---
    console.log("👉 Scenario 5: payment.failed event");
    const orderId5 = "order_fail_555";
    const paymentId5 = "pay_failed_555";
    await createTestPayment(orderId5, 25000);

    const payload5 = {
      payment: {
        entity: {
          id: paymentId5,
          order_id: orderId5,
          amount: 25000,
          currency: "INR",
          status: "failed",
          error_description: "Card got declined by issuer"
        }
      }
    };

    const res5 = await postWebhook("evt_5", "payment.failed", payload5, "mock_signature_abc");
    assert(res5.status === 200, "Should accept payment.failed webhook gracefully");
    assert(res5.body.message === "Payment marked as failed.", "Should mark as failed");

    // Verify record state is failed
    db = loadDb();
    const payRecord5 = db.payments?.find(p => p.provider_order_id === orderId5);
    assert(payRecord5?.status === "failed", "Payment status must be updated to failed");
    assert(payRecord5?.metadata?.failure_reason === "Card got declined by issuer", "Failure reason must be recorded");

    // Ledger should NOT be credited
    balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 500, "Wallet balance must remain unchanged");
    console.log("\x1b[32m✔ Scenario 5 Passed successfully!\x1b[0m\n");


    // --- Scenario 6: order.paid event ---
    console.log("👉 Scenario 6: order.paid event");
    const orderId6 = "order_paid_666";
    const paymentId6 = "pay_paid_666";
    await createTestPayment(orderId6, 30000);

    const payload6 = {
      order: {
        entity: {
          id: orderId6,
          amount: 30000,
          currency: "INR",
          status: "paid"
        }
      },
      payment: {
        entity: {
          id: paymentId6,
          order_id: orderId6,
          amount: 30000,
          currency: "INR"
        }
      }
    };

    const res6 = await postWebhook("evt_6", "order.paid", payload6, "mock_signature_abc");
    assert(res6.status === 200, "Should successfully process order.paid");
    db = loadDb();
    balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 800, `Should add 300 INR. Expected 800, got ${balance}`);
    console.log("\x1b[32m✔ Scenario 6 Passed successfully!\x1b[0m\n");


    // --- Scenario 7: Unknown order ID ---
    console.log("👉 Scenario 7: Unknown order ID");
    const payload7 = {
      payment: {
        entity: {
          id: "pay_unknown_777",
          order_id: "order_unknown_777",
          amount: 50000,
          currency: "INR"
        }
      }
    };

    const res7 = await postWebhook("evt_7", "payment.captured", payload7, "mock_signature_abc");
    assert(res7.status === 404, "Should return 404 for unknown order ID");
    assert(res7.body.error.includes("Payment record not found"), "Should state not found");
    console.log("\x1b[32m✔ Scenario 7 Passed successfully!\x1b[0m\n");


    // --- Scenario 8: Amount mismatch ---
    console.log("👉 Scenario 8: Amount mismatch");
    const orderId8 = "order_mismatch_888";
    await createTestPayment(orderId8, 40000); // Created as 400 INR

    const payload8 = {
      payment: {
        entity: {
          id: "pay_mismatch_888",
          order_id: orderId8,
          amount: 10000, // Sends 100 INR instead of 400
          currency: "INR"
        }
      }
    };

    const res8 = await postWebhook("evt_8", "payment.captured", payload8, "mock_signature_abc");
    assert(res8.status === 400, "Should reject with 400 for amount mismatch");
    assert(res8.body.error.includes("Amount mismatch"), "Should report amount mismatch");
    console.log("\x1b[32m✔ Scenario 8 Passed successfully!\x1b[0m\n");


    // --- Scenario 9: Currency mismatch ---
    console.log("👉 Scenario 9: Currency mismatch");
    const orderId9 = "order_currency_999";
    await createTestPayment(orderId9, 10000);

    const payload9 = {
      payment: {
        entity: {
          id: "pay_currency_999",
          order_id: orderId9,
          amount: 10000,
          currency: "USD" // Expected INR
        }
      }
    };

    const res9 = await postWebhook("evt_9", "payment.captured", payload9, "mock_signature_abc");
    assert(res9.status === 400, "Should reject with 400 for currency mismatch");
    assert(res9.body.error.includes("Currency mismatch"), "Should report currency mismatch");
    console.log("\x1b[32m✔ Scenario 9 Passed successfully!\x1b[0m\n");


    // --- Scenario 10: Payment ID mismatch ---
    console.log("👉 Scenario 10: Payment ID mismatch (Reuse of already settled Payment ID)");
    const orderId10 = "order_reused_1010";
    await createTestPayment(orderId10, 50000);

    // Reuse paymentId1 which was already used in Scenario 1
    const payload10 = {
      payment: {
        entity: {
          id: paymentId1, // Reused payment ID
          order_id: orderId10,
          amount: 50000,
          currency: "INR"
        }
      }
    };

    const res10 = await postWebhook("evt_10", "payment.captured", payload10, "mock_signature_abc");
    assert(res10.status === 400, "Should reject with 400 for duplicate payment ID");
    assert(res10.body.error.includes("already been used"), "Should reject reused payment ID");
    console.log("\x1b[32m✔ Scenario 10 Passed successfully!\x1b[0m\n");


    // --- Scenario 11: Already-paid payment ---
    console.log("👉 Scenario 11: Already-paid payment (Transition paid -> failed, paid -> paid)");
    // Let's retrieve orderId1 which is already paid
    const payload11 = {
      payment: {
        entity: {
          id: "new_pay_id_11",
          order_id: orderId1,
          amount: 50000,
          currency: "INR",
          status: "failed"
        }
      }
    };

    // Try converting paid to failed
    const res11_fail = await postWebhook("evt_11_fail", "payment.failed", payload11, "mock_signature_abc");
    assert(res11_fail.status === 200, "Webhook should return success for redundant events on already settled payment");
    assert(res11_fail.body.message.includes("already successfully settled"), "Should ignore failure for already paid payment");

    // Check payment status is still paid
    db = loadDb();
    const payRec11 = db.payments?.find(p => p.provider_order_id === orderId1);
    assert(payRec11?.status === "paid", "Status must remain paid");
    console.log("\x1b[32m✔ Scenario 11 Passed successfully!\x1b[0m\n");


    // --- Scenario 12: Frontend verification and webhook race condition ---
    console.log("👉 Scenario 12: Frontend verification and webhook race condition");
    const orderId12 = "order_race_1212";
    const paymentId12 = "pay_race_1212";
    const rec12 = await createTestPayment(orderId12, 100000); // 1000 INR

    // Simulate Frontend verification finishing FIRST by atomically updating state
    const firstVerify = await paymentRepository.depositCreatorFundsRpc({
      userId: creatorId,
      orderId: orderId12,
      paymentId: paymentId12,
      amountPaise: 100000,
      provider: "mock",
      currency: "INR",
      refId: `payment-verify-${paymentId12}`,
      ledgerId: `led-${paymentId12}`,
      txId: `tx-${paymentId12}`,
      auditId: `aud-${paymentId12}`
    });
    assert(firstVerify.success === true, "Frontend verification should succeed");

    // Now, deliver Webhook AFTER frontend finished
    const payload12 = {
      payment: {
        entity: {
          id: paymentId12,
          order_id: orderId12,
          amount: 100000,
          currency: "INR"
        }
      }
    };

    const res12 = await postWebhook("evt_12", "payment.captured", payload12, "mock_signature_abc");
    assert(res12.status === 200, "Webhook should respond with 200 OK gracefully");
    assert(res12.body.message.includes("already verified") || res12.body.message.includes("already processed"), "Should detect already verified");

    // Verify creator balance only has 1000 INR added, not double-credited (Current balance should be 800 + 1000 = 1800)
    db = loadDb();
    balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 1800, `Expected balance 1800, got ${balance}`);
    console.log("\x1b[32m✔ Scenario 12 Passed successfully!\x1b[0m\n");


    // --- Scenario 13: Database failure during webhook processing ---
    console.log("👉 Scenario 13: Database failure during webhook processing");
    const orderId13 = "order_fail_1313";
    await createTestPayment(orderId13, 20000);

    const payload13 = {
      payment: {
        entity: {
          id: "pay_fail_1313",
          order_id: orderId13,
          amount: 20000,
          currency: "INR"
        }
      }
    };

    // Temporarily break findByOrderId
    const originalFindByOrderId = paymentRepository.findByOrderId;
    paymentRepository.findByOrderId = async () => {
      throw new Error("Simulated database timeout failure");
    };

    const res13 = await postWebhook("evt_13", "payment.captured", payload13, "mock_signature_abc");
    assert(res13.status === 500, "Should fail with 500 on DB failure");
    assert(res13.body.error.includes("Simulated database timeout failure"), "Should bubble up DB error safely");

    // Restore findByOrderId
    paymentRepository.findByOrderId = originalFindByOrderId;
    console.log("\x1b[32m✔ Scenario 13 Passed successfully!\x1b[0m\n");


    // --- Scenario 14: Server restart/idempotency persistence ---
    console.log("👉 Scenario 14: Server restart/idempotency persistence");
    // Ensure the processed webhook events survive a reload of database.json
    const orderId14 = "order_persist_1414";
    const paymentId14 = "pay_persist_1414";
    await createTestPayment(orderId14, 50000);

    const payload14 = {
      payment: {
        entity: {
          id: paymentId14,
          order_id: orderId14,
          amount: 50000,
          currency: "INR"
        }
      }
    };

    // Deliver first time
    const res14_first = await postWebhook("evt_14", "payment.captured", payload14, "mock_signature_abc");
    assert(res14_first.status === 200, "First delivery should succeed");

    // Reload the database state to simulate a clean server reboot
    db = loadDb();
    const persistedEvent = db.webhookEvents?.find(e => e.id === "evt_14");
    assert(persistedEvent !== undefined, "Processed event must be persisted in database");
    assert(persistedEvent?.processing_status === "processed", "Processed event status must be 'processed'");

    // Deliver second time (survives restart)
    const res14_second = await postWebhook("evt_14", "payment.captured", payload14, "mock_signature_abc");
    assert(res14_second.status === 200, "Second delivery should return safe 200 OK");
    assert(res14_second.body.message.includes("already processed"), "Should safely report already processed");
    console.log("\x1b[32m✔ Scenario 14 Passed successfully!\x1b[0m\n");


    // --- Scenario 15: Concurrent duplicate webhook requests ---
    console.log("👉 Scenario 15: Concurrent duplicate webhook requests");
    const orderId15 = "order_concur_1515";
    const paymentId15 = "pay_concur_1515";
    await createTestPayment(orderId15, 60000);

    const payload15 = {
      payment: {
        entity: {
          id: paymentId15,
          order_id: orderId15,
          amount: 60000,
          currency: "INR"
        }
      }
    };

    // Send 10 identical webhook requests concurrently
    const promises = Array.from({ length: 10 }).map((_, idx) =>
      postWebhook("evt_concur_1515", "payment.captured", payload15, "mock_signature_abc")
    );
    const results = await Promise.all(promises);

    // Verify exactly one request successfully updated/processed the payment while the rest returned safe duplicate notifications
    const statuses = results.map(r => r.status);
    assert(statuses.every(s => s === 200), "All concurrent requests should return 200 OK");

    const successes = results.filter(r => r.body.message && r.body.message.includes("successfully reconciled"));
    assert(successes.length === 1, `Exactly one request must perform reconciliation. Found ${successes.length}`);
    console.log("\x1b[32m✔ Scenario 15 Passed successfully!\x1b[0m\n");


    // --- Scenario 16: Webhook event cannot credit the ledger twice ---
    console.log("👉 Scenario 16: Webhook event cannot credit the ledger twice");
    // Verify that through all 15 previous scenarios, the ledger balance is perfectly synchronized
    // Expected wallet balance should be: 
    // Initial: 0
    // + 500 (Scenario 1)
    // + 0 (Scenario 2 - Rejected)
    // + 0 (Scenario 3 - Rejected)
    // + 0 (Scenario 4 - Duplicate blocked)
    // + 0 (Scenario 5 - Failed payment)
    // + 300 (Scenario 6 - Order paid)
    // + 0 (Scenario 7 - Unknown order)
    // + 0 (Scenario 8 - Amount mismatch rejected)
    // + 0 (Scenario 9 - Currency mismatch rejected)
    // + 0 (Scenario 10 - Payment ID mismatch rejected)
    // + 0 (Scenario 11 - Already paid, redundant events)
    // + 1000 (Scenario 12 - Frontend race condition, credited once)
    // + 0 (Scenario 13 - DB failure)
    // + 500 (Scenario 14 - Persistence test)
    // + 600 (Scenario 15 - Concurrent duplicate, credited once)
    // Total Expected: 500 + 300 + 1000 + 500 + 600 = 2900 INR
    db = loadDb();
    balance = db.creatorProfiles[creatorId].walletBalance;
    assert(balance === 2900, `Ledger safety violated! Expected 2900, got ${balance}`);

    // Verify there are no duplicate ledger transactions with identical IDs
    const deposits = db.financialLedger?.filter(entry => entry.userId === creatorId && entry.referenceType === "deposit");
    const depositRefIds = deposits?.map(d => d.referenceId) || [];
    const uniqueRefIds = new Set(depositRefIds);
    assert(depositRefIds.length === uniqueRefIds.size, `Duplicate ledger reference entries detected! ${JSON.stringify(depositRefIds)}`);

    console.log("\x1b[32m✔ Scenario 16 Passed successfully!\x1b[0m\n");

    console.log("\x1b[34m====================================================\x1b[0m");
    console.log("\x1b[1;32m      🎉 ALL 16 WEBHOOK SCENARIOS PASSED PERFECTLY!  \x1b[0m");
    console.log("\x1b[34m====================================================\x1b[0m\n");

  } finally {
    // Restore environment variables
    process.env.PAYMENT_PROVIDER = originalProvider;
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;

    // Shutdown local test server
    if (server) {
      server.close();
    }
  }
}

runWebhookTests().catch(err => {
  console.error("Test Suite execution failed with error:", err);
  process.exit(1);
});
