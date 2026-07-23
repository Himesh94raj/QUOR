import { runPaymentReconciliation } from "./services/paymentReconciliation.js";
import { loadDb, saveDb } from "./services/db.js";
import { PaymentRecord, FinancialLedgerEntry, WebhookEventRecord } from "./types.js";
import { auditRepository } from "./services/auditRepository.js";

const assert = (condition: boolean, msg: string) => {
  if (!condition) {
    console.error(`\x1b[31m❌ Assert Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }
};

async function testReconciliationSuite() {
  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;34m      QUOR PAYMENT RECONCILIATION TEST SUITE        \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");

  const originalDb = JSON.parse(JSON.stringify(loadDb()));

  try {
    // Helper to reset the db to a pristine state for each scenario
    const resetTestDb = () => {
      const db = loadDb();
      db.payments = [];
      db.financialLedger = [];
      db.webhookEvents = [];
      db.creatorProfiles = {
        "creator_test_1": { userId: "creator_test_1", channelUrl: "", walletBalance: 0 }
      };
      db.auditEvents = [];
      saveDb(db);
    };

    // --- Scenario 1: Fully Reconciled State ---
    console.log("👉 Scenario 1: Fully Reconciled State");
    resetTestDb();
    let db = loadDb();
    
    // Add 1 fully paid payment record
    const payment1: PaymentRecord = {
      id: "pay_1",
      provider: "mock",
      provider_order_id: "order_1",
      provider_payment_id: "pay_id_1",
      user_id: "creator_test_1",
      amount_paise: 50000, // 500 INR
      currency: "INR",
      status: "paid",
      verification_attempts: 1,
      created_at: new Date().toISOString(),
      paid_at: new Date().toISOString()
    };
    db.payments.push(payment1);

    // Add matching ledger entry
    const ledger1: FinancialLedgerEntry = {
      id: "led_1",
      referenceId: "payment-verify-pay_id_1",
      referenceType: "deposit",
      fromAccount: "platform_escrow",
      toAccount: "creator_wallet:creator_test_1",
      userId: "creator_test_1",
      amount: 500, // 500 INR
      status: "completed",
      description: "Payment deposit",
      createdAt: new Date().toISOString()
    };
    db.financialLedger.push(ledger1);

    // Set matching wallet balance
    db.creatorProfiles["creator_test_1"].walletBalance = 500;
    saveDb(db);

    let report = await runPaymentReconciliation();
    assert(report.status === "RECONCILED", `Expected status RECONCILED, got ${report.status}`);
    assert(report.totalPaymentsChecked === 1, "Expected 1 total payment checked");
    assert(report.reconciledPayments === 1, "Expected 1 reconciled payment");
    assert(report.mismatches.length === 0, "Expected no mismatches");
    assert(report.ledgerMismatches.length === 0, "Expected no ledger mismatches");
    console.log("\x1b[32m✔ Scenario 1 Passed successfully!\x1b[0m\n");


    // --- Scenario 2: Paid Payment but Missing Ledger Deposit ---
    console.log("👉 Scenario 2: Paid Payment but Missing Ledger Deposit");
    resetTestDb();
    db = loadDb();
    db.payments.push({
      ...payment1,
      provider_payment_id: "pay_id_2"
    });
    // Ledger is empty
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", `Expected CRITICAL status, got ${report.status}`);
    assert(report.mismatches.length === 1, "Expected 1 mismatch");
    assert(report.mismatches[0].type === "MISSING_LEDGER_DEPOSIT", `Expected MISSING_LEDGER_DEPOSIT mismatch, got ${report.mismatches[0].type}`);
    console.log("\x1b[32m✔ Scenario 2 Passed successfully!\x1b[0m\n");


    // --- Scenario 3: Ledger Deposit exists but Payment record is not paid ---
    console.log("👉 Scenario 3: Ledger Deposit exists but Payment record is not paid");
    resetTestDb();
    db = loadDb();
    db.payments.push({
      ...payment1,
      provider_payment_id: "pay_id_3",
      status: "created"
    });
    db.financialLedger.push({
      ...ledger1,
      referenceId: "payment-verify-pay_id_3"
    });
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", "Expected CRITICAL status");
    assert(report.mismatches.some(m => m.type === "LEDGER_WITHOUT_PAID_PAYMENT"), "Expected LEDGER_WITHOUT_PAID_PAYMENT mismatch");
    console.log("\x1b[32m✔ Scenario 3 Passed successfully!\x1b[0m\n");


    // --- Scenario 4: Amount mismatch between Payment and Ledger ---
    console.log("👉 Scenario 4: Amount mismatch between Payment and Ledger");
    resetTestDb();
    db = loadDb();
    db.payments.push({
      ...payment1,
      provider_payment_id: "pay_id_4",
      amount_paise: 50000 // 500 INR
    });
    db.financialLedger.push({
      ...ledger1,
      referenceId: "payment-verify-pay_id_4",
      amount: 400 // 400 INR (mismatch!)
    });
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", "Expected CRITICAL status");
    assert(report.mismatches.some(m => m.type === "AMOUNT_MISMATCH"), "Expected AMOUNT_MISMATCH mismatch");
    console.log("\x1b[32m✔ Scenario 4 Passed successfully!\x1b[0m\n");


    // --- Scenario 5: User ID mismatch between Payment and Ledger ---
    console.log("👉 Scenario 5: User ID mismatch between Payment and Ledger");
    resetTestDb();
    db = loadDb();
    db.payments.push({
      ...payment1,
      provider_payment_id: "pay_id_5",
      user_id: "creator_test_1"
    });
    db.financialLedger.push({
      ...ledger1,
      referenceId: "payment-verify-pay_id_5",
      userId: "some_other_user" // mismatch!
    });
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", "Expected CRITICAL status");
    assert(report.mismatches.some(m => m.type === "USER_MISMATCH"), "Expected USER_MISMATCH mismatch");
    console.log("\x1b[32m✔ Scenario 5 Passed successfully!\x1b[0m\n");


    // --- Scenario 6: Duplicate Provider Payment ID check ---
    console.log("👉 Scenario 6: Duplicate Provider Payment ID check");
    resetTestDb();
    db = loadDb();
    db.payments.push({ ...payment1, id: "pay_a", provider_payment_id: "dup_pay_id" });
    db.payments.push({ ...payment1, id: "pay_b", provider_payment_id: "dup_pay_id" });
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", "Expected CRITICAL status");
    assert(report.duplicateRecords.some(r => r.type === "DUPLICATE_PROVIDER_PAYMENT_ID"), "Expected DUPLICATE_PROVIDER_PAYMENT_ID duplicate check");
    console.log("\x1b[32m✔ Scenario 6 Passed successfully!\x1b[0m\n");


    // --- Scenario 7: Webhook Event has order ID but no corresponding payment record (Orphan Webhook) ---
    console.log("👉 Scenario 7: Webhook Event has order ID but no corresponding payment record (Orphan Webhook)");
    resetTestDb();
    db = loadDb();
    const webhook1: WebhookEventRecord = {
      id: "evt_orph_1",
      provider: "razorpay",
      event_type: "payment.captured",
      received_at: new Date().toISOString(),
      processing_status: "processed",
      payload: {
        orderId: "non_existent_order_id"
      }
    };
    db.webhookEvents.push(webhook1);
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "WARNING", `Expected WARNING status, got ${report.status}`);
    assert(report.orphanWebhookEvents.length === 1, "Expected 1 orphan webhook event");
    console.log("\x1b[32m✔ Scenario 7 Passed successfully!\x1b[0m\n");


    // --- Scenario 8: Wallet Balance mismatch with Ledger ---
    console.log("👉 Scenario 8: Wallet Balance mismatch with Ledger");
    resetTestDb();
    db = loadDb();
    db.payments.push(payment1);
    db.financialLedger.push(ledger1);
    // Ledger has completed deposit of 500 INR, but creator profile balance is set to 100 INR (mismatch!)
    db.creatorProfiles["creator_test_1"].walletBalance = 100;
    saveDb(db);

    report = await runPaymentReconciliation();
    assert(report.status === "CRITICAL", "Expected CRITICAL status");
    assert(report.ledgerMismatches.length === 1, "Expected 1 ledger mismatch");
    console.log("\x1b[32m✔ Scenario 8 Passed successfully!\x1b[0m\n");


    // --- Scenario 9: Audit Trail Logging Verifications ---
    console.log("👉 Scenario 9: Audit Trail Logging Verifications");
    resetTestDb();
    // Verify creation of audit log directly via repository
    await auditRepository.createEvent({
      id: "aud_test_1",
      actorUserId: "creator_test_1",
      actorRole: "creator",
      action: "PAYMENT_ORDER_CREATED",
      entityType: "payment",
      entityId: "pay_1",
      metadata: { amount: 50000 },
      createdAt: new Date().toISOString()
    });

    db = loadDb();
    const auditEvt = db.auditEvents.find(e => e.id === "aud_test_1");
    assert(auditEvt !== undefined, "Expected audit event to be created");
    assert(auditEvt?.action === "PAYMENT_ORDER_CREATED", "Expected action matching PAYMENT_ORDER_CREATED");
    console.log("\x1b[32m✔ Scenario 9 Passed successfully!\x1b[0m\n");

  } finally {
    // Restore original database
    saveDb(originalDb);
  }

  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;32m   🎉 ALL RECONCILIATION & AUDIT SCENARIOS PASSED!  \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");
}

testReconciliationSuite().catch(err => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
