import { supabase, dbProvider, loadDb } from "./db.js";
import { PaymentRecord, FinancialLedgerEntry, WebhookEventRecord } from "../types.js";

function reconstructCreatorBalance(userId: string, ledger: FinancialLedgerEntry[]): number {
  let balance = 0;
  for (const entry of ledger) {
    if (entry.userId === userId && entry.status === "completed") {
      if (entry.referenceType === "deposit") {
        balance += entry.amount;
      } else if (entry.referenceType === "refund") {
        balance += entry.amount;
      } else if (entry.referenceType === "escrow_lock") {
        balance -= entry.amount;
      }
    }
  }
  return Math.round(balance * 100) / 100;
}

export interface ReconciliationReport {
  totalPaymentsChecked: number;
  reconciledPayments: number;
  mismatches: {
    type: string;
    paymentId?: string;
    providerOrderId?: string;
    details: string;
  }[];
  duplicateRecords: {
    type: string;
    id: string;
    details: string;
  }[];
  orphanWebhookEvents: {
    id: string;
    provider: string;
    eventType: string;
    details: string;
  }[];
  ledgerMismatches: {
    userId: string;
    profileBalance: number;
    reconstructedBalance: number;
    details: string;
  }[];
  status: "RECONCILED" | "WARNING" | "CRITICAL";
}

export async function runPaymentReconciliation(): Promise<ReconciliationReport> {
  // 1. Load data
  let payments: PaymentRecord[] = [];
  let ledger: FinancialLedgerEntry[] = [];
  let webhooks: WebhookEventRecord[] = [];
  let creatorProfiles: Record<string, { userId: string; walletBalance: number }> = {};

  if (dbProvider === "supabase") {
    // Fetch payments
    const { data: payData, error: payErr } = await supabase.from("payments").select("*");
    if (payErr) throw payErr;
    payments = (payData || []).map(row => ({
      id: row.id,
      provider: row.provider,
      provider_order_id: row.provider_order_id,
      provider_payment_id: row.provider_payment_id || undefined,
      user_id: row.user_id,
      amount_paise: Number(row.amount_paise),
      currency: row.currency,
      status: row.status,
      verification_attempts: row.verification_attempts,
      created_at: row.created_at,
      paid_at: row.paid_at || undefined,
      metadata: row.metadata || undefined
    }));

    // Fetch financial ledger
    const { data: ledData, error: ledErr } = await supabase.from("financial_ledger").select("*");
    if (ledErr) throw ledErr;
    ledger = (ledData || []).map(row => ({
      id: row.id,
      referenceId: row.reference_id,
      referenceType: row.reference_type,
      fromAccount: row.from_account,
      toAccount: row.to_account,
      userId: row.user_id,
      amount: Number(row.amount) / 100, // convert paise to INR
      status: row.status,
      description: row.description || undefined,
      createdAt: row.created_at
    }));

    // Fetch webhook events
    const { data: webData, error: webErr } = await supabase.from("webhook_events").select("*");
    if (webErr) throw webErr;
    webhooks = (webData || []).map(row => ({
      id: row.id,
      provider: row.provider,
      event_type: row.event_type,
      received_at: row.received_at,
      processed_at: row.processed_at || undefined,
      processing_status: row.processing_status,
      payload: row.payload || undefined
    }));

    // Fetch creator profiles
    const { data: cpData, error: cpErr } = await supabase.from("creator_profiles").select("user_id, wallet_balance");
    if (cpErr) throw cpErr;
    (cpData || []).forEach(row => {
      creatorProfiles[row.user_id] = {
        userId: row.user_id,
        walletBalance: Number(row.wallet_balance) / 100
      };
    });
  } else {
    const db = loadDb();
    payments = db.payments || [];
    ledger = db.financialLedger || [];
    webhooks = db.webhookEvents || [];
    // Convert to the record format
    for (const [uid, prof] of Object.entries(db.creatorProfiles || {})) {
      creatorProfiles[uid] = {
        userId: uid,
        walletBalance: prof.walletBalance
      };
    }
  }

  const mismatches: ReconciliationReport["mismatches"] = [];
  const duplicateRecords: ReconciliationReport["duplicateRecords"] = [];
  const orphanWebhookEvents: ReconciliationReport["orphanWebhookEvents"] = [];
  const ledgerMismatches: ReconciliationReport["ledgerMismatches"] = [];

  const totalPaymentsChecked = payments.length;

  // Track provider payment ID occurrences and order ID occurrences for duplicates
  const paymentIdCounts: Record<string, string[]> = {}; // key is payment_id, value is list of payment.id
  const orderIdCounts: Record<string, string[]> = {}; // key is order_id, value is list of payment.id

  for (const p of payments) {
    if (p.provider_payment_id) {
      if (!paymentIdCounts[p.provider_payment_id]) paymentIdCounts[p.provider_payment_id] = [];
      paymentIdCounts[p.provider_payment_id].push(p.id);
    }
    if (p.provider_order_id) {
      if (!orderIdCounts[p.provider_order_id]) orderIdCounts[p.provider_order_id] = [];
      orderIdCounts[p.provider_order_id].push(p.id);
    }
  }

  // Record duplicate provider payment IDs
  for (const [providerPayId, pids] of Object.entries(paymentIdCounts)) {
    if (pids.length > 1) {
      duplicateRecords.push({
        type: "DUPLICATE_PROVIDER_PAYMENT_ID",
        id: providerPayId,
        details: `Provider payment ID '${providerPayId}' is associated with multiple payment records: ${pids.join(", ")}`
      });
    }
  }

  // Record duplicate provider order IDs
  for (const [providerOrderId, pids] of Object.entries(orderIdCounts)) {
    if (pids.length > 1) {
      duplicateRecords.push({
        type: "DUPLICATE_PROVIDER_ORDER_ID",
        id: providerOrderId,
        details: `Provider order ID '${providerOrderId}' is associated with multiple payment records: ${pids.join(", ")}`
      });
    }
  }

  // Check each payment record
  let reconciledPayments = 0;
  for (const p of payments) {
    let hasMismatch = false;

    // Check payment record exists without expected webhook or verification metadata (warning/mismatch if status is paid but provider_payment_id or paid_at is missing)
    if (p.status === "paid") {
      if (!p.provider_payment_id || !p.paid_at) {
        mismatches.push({
          type: "MISSING_METADATA",
          paymentId: p.id,
          providerOrderId: p.provider_order_id,
          details: `Payment marked paid but lacks expected provider_payment_id or paid_at metadata.`
        });
        hasMismatch = true;
      }

      // Check corresponding ledger deposit
      const matchingLedgerEntries = ledger.filter(
        e => e.referenceType === "deposit" && e.referenceId === `payment-verify-${p.provider_payment_id}`
      );

      if (matchingLedgerEntries.length === 0) {
        mismatches.push({
          type: "MISSING_LEDGER_DEPOSIT",
          paymentId: p.id,
          providerOrderId: p.provider_order_id,
          details: `Payment record marked paid with provider_payment_id '${p.provider_payment_id}' but no corresponding ledger deposit exists.`
        });
        hasMismatch = true;
      } else {
        // Check amount matches (ledger amount is in INR, payment in paise)
        const expectedINR = p.amount_paise / 100;
        for (const entry of matchingLedgerEntries) {
          if (entry.amount !== expectedINR) {
            mismatches.push({
              type: "AMOUNT_MISMATCH",
              paymentId: p.id,
              providerOrderId: p.provider_order_id,
              details: `Payment amount (${expectedINR} INR) does not match ledger deposit amount (${entry.amount} INR).`
            });
            hasMismatch = true;
          }
          if (entry.userId !== p.user_id) {
            mismatches.push({
              type: "USER_MISMATCH",
              paymentId: p.id,
              providerOrderId: p.provider_order_id,
              details: `Payment user ID '${p.user_id}' does not match ledger deposit user ID '${entry.userId}'.`
            });
            hasMismatch = true;
          }
        }
      }

      // Check currency mismatch
      if (p.currency !== "INR") {
        mismatches.push({
          type: "CURRENCY_MISMATCH",
          paymentId: p.id,
          providerOrderId: p.provider_order_id,
          details: `Currency '${p.currency}' is unsupported or mismatched (expected 'INR').`
        });
        hasMismatch = true;
      }
    } else {
      // payment is NOT paid (created or failed), verify no ledger entry exists
      const matchingLedgerEntries = ledger.filter(
        e => e.referenceType === "deposit" && e.referenceId === `payment-verify-${p.provider_payment_id}`
      );
      if (matchingLedgerEntries.length > 0 && p.provider_payment_id) {
        mismatches.push({
          type: "LEDGER_WITHOUT_PAID_PAYMENT",
          paymentId: p.id,
          providerOrderId: p.provider_order_id,
          details: `Ledger deposit exists for payment ID '${p.provider_payment_id}' but payment record status is '${p.status}'.`
        });
        hasMismatch = true;
      }
    }

    if (!hasMismatch) {
      reconciledPayments++;
    }
  }

  // Check for ledger deposit entry exists but matching payment record does not exist or is not paid
  for (const entry of ledger) {
    if (entry.referenceType === "deposit" && entry.referenceId.startsWith("payment-verify-")) {
      const providerPaymentId = entry.referenceId.replace("payment-verify-", "");
      const matchingPayment = payments.find(p => p.provider_payment_id === providerPaymentId);
      if (!matchingPayment) {
        mismatches.push({
          type: "ORPHAN_LEDGER_DEPOSIT",
          details: `Ledger deposit '${entry.id}' refers to provider payment ID '${providerPaymentId}' but no matching payment record exists.`
        });
      }
    }
  }

  // Webhook event exists without a corresponding payment record
  for (const w of webhooks) {
    let orderId: string | undefined = w.payload?.orderId;
    if (!orderId && w.payload) {
      if (w.payload.order && w.payload.order.entity) {
        orderId = w.payload.order.entity.id;
      } else if (w.payload.payment && w.payload.payment.entity) {
        orderId = w.payload.payment.entity.order_id;
      }
    }

    if (orderId) {
      const matchingPayment = payments.find(p => p.provider_order_id === orderId);
      if (!matchingPayment) {
        orphanWebhookEvents.push({
          id: w.id,
          provider: w.provider,
          eventType: w.event_type,
          details: `Webhook event '${w.id}' for order ID '${orderId}' has no matching payment record.`
        });
      }
    }
  }

  // Wallet balance differs from ledger-reconstructed balance
  const allUserIds = new Set<string>([
    ...Object.keys(creatorProfiles),
    ...ledger.filter(e => e.userId).map(e => e.userId!)
  ]);

  for (const uid of allUserIds) {
    const profile = creatorProfiles[uid];
    const profileBalance = profile ? profile.walletBalance : 0;
    const reconstructed = reconstructCreatorBalance(uid, ledger);

    if (Math.abs(profileBalance - reconstructed) > 0.01) {
      ledgerMismatches.push({
        userId: uid,
        profileBalance,
        reconstructedBalance: reconstructed,
        details: `Wallet balance (${profileBalance} INR) does not match ledger-reconstructed balance (${reconstructed} INR).`
      });
    }
  }

  // Overall status determination
  let status: ReconciliationReport["status"] = "RECONCILED";
  if (mismatches.length > 0 || duplicateRecords.length > 0 || ledgerMismatches.length > 0) {
    status = "CRITICAL";
  } else if (orphanWebhookEvents.length > 0) {
    status = "WARNING";
  }

  return {
    totalPaymentsChecked,
    reconciledPayments,
    mismatches,
    duplicateRecords,
    orphanWebhookEvents,
    ledgerMismatches,
    status
  };
}
