import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { PaymentRecord } from "../types.js";

const mapRowToPayment = (row: any): PaymentRecord => {
  return {
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
  };
};

export const paymentRepository = {
  async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("payments").select("*").eq("provider_order_id", orderId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRowToPayment(data);
    } else {
      const db = loadDb();
      if (!db.payments) return null;
      const payment = db.payments.find(p => p.provider_order_id === orderId);
      return payment || null;
    }
  },

  async createPayment(payment: PaymentRecord): Promise<PaymentRecord> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("payments").insert({
        id: payment.id,
        provider: payment.provider,
        provider_order_id: payment.provider_order_id,
        provider_payment_id: payment.provider_payment_id || null,
        user_id: payment.user_id,
        amount_paise: payment.amount_paise,
        currency: payment.currency || "INR",
        status: payment.status || "created",
        verification_attempts: payment.verification_attempts || 0,
        created_at: payment.created_at || new Date().toISOString(),
        paid_at: payment.paid_at || null,
        metadata: payment.metadata || null
      });
      if (error) throw error;
      return payment;
    } else {
      const db = loadDb();
      if (!db.payments) db.payments = [];
      db.payments.push(payment);
      saveDb(db);
      return payment;
    }
  },

  async updatePayment(payment: PaymentRecord): Promise<PaymentRecord> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("payments").update({
        provider_payment_id: payment.provider_payment_id || null,
        status: payment.status,
        verification_attempts: payment.verification_attempts,
        paid_at: payment.paid_at || null,
        metadata: payment.metadata || null
      }).eq("provider_order_id", payment.provider_order_id);
      if (error) throw error;
      return payment;
    } else {
      const db = loadDb();
      if (!db.payments) db.payments = [];
      const idx = db.payments.findIndex(p => p.provider_order_id === payment.provider_order_id);
      if (idx !== -1) {
        db.payments[idx] = payment;
        saveDb(db);
      }
      return payment;
    }
  },

  async depositCreatorFundsRpc(params: {
    userId: string;
    orderId: string;
    paymentId: string;
    amountPaise: number;
    provider: string;
    currency: string;
    refId: string;
    ledgerId: string;
    txId: string;
    auditId: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("deposit_creator_funds", {
        p_user_id: params.userId,
        p_order_id: params.orderId,
        p_payment_id: params.paymentId,
        p_amount_paise: params.amountPaise,
        p_provider: params.provider,
        p_currency: params.currency,
        p_ref_id: params.refId,
        p_ledger_id: params.ledgerId,
        p_tx_id: params.txId,
        p_audit_id: params.auditId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: data.success };
    } else {
      // Local JSON simulation
      const db = loadDb();
      if (!db.payments) db.payments = [];
      const payment = db.payments.find(p => p.provider_order_id === params.orderId);
      if (!payment) return { success: false, error: "Payment record not found" };

      if (payment.status === "paid") {
        return { success: false, error: "Duplicate verification rejected: Already paid" };
      }

      if (payment.amount_paise !== params.amountPaise) {
        return { success: false, error: "Amount mismatch" };
      }

      payment.status = "paid";
      payment.provider_payment_id = params.paymentId;
      payment.paid_at = new Date().toISOString();
      payment.verification_attempts += 1;

      // Update creator wallet balance
      const creatorProfile = db.creatorProfiles[params.userId];
      if (!creatorProfile) return { success: false, error: "Creator profile not found" };

      const amountINR = params.amountPaise / 100;
      creatorProfile.walletBalance += amountINR;

      // Add financial ledger entry
      if (!db.financialLedger) db.financialLedger = [];
      db.financialLedger.push({
        id: params.ledgerId,
        referenceId: params.refId,
        referenceType: "deposit",
        fromAccount: `External (${params.provider})`,
        toAccount: `creator_wallet:${params.userId}`,
        userId: params.userId,
        amount: amountINR,
        status: "completed",
        description: `Deposit via Payment Gateway (Order ID: ${params.orderId}, Payment ID: ${params.paymentId})`,
        createdAt: new Date().toISOString()
      });

      // Add wallet history
      if (!db.walletHistory) db.walletHistory = [];
      db.walletHistory.push({
        id: params.txId,
        userId: params.userId,
        type: "deposit",
        amount: amountINR,
        status: "Completed",
        description: `Funded via ${params.provider} Payment Gateway`,
        createdAt: new Date().toISOString()
      });

      // Audit event
      if (!db.auditEvents) db.auditEvents = [];
      db.auditEvents.push({
        id: params.auditId,
        actorUserId: params.userId,
        actorRole: "creator",
        action: "PAYMENT_DEPOSIT_SUCCESS",
        entityType: "payment",
        entityId: payment.id,
        metadata: {
          amountPaise: params.amountPaise,
          orderId: params.orderId,
          paymentId: params.paymentId,
          provider: params.provider
        },
        createdAt: new Date().toISOString()
      });

      saveDb(db);
      return { success: true };
    }
  }
};
