import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { PayoutRequest } from "../types.js";

const mapRowToPayout = (row: any): PayoutRequest => {
  return {
    id: row.id,
    clipperId: row.clipper_id,
    clipperName: row.clipper_name,
    upiId: row.upi_id,
    amount: Number(row.amount) / 100, // convert paise to INR
    status: row.status,
    createdAt: row.created_at
  };
};

export const payoutRepository = {
  async findById(id: string): Promise<PayoutRequest | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("payout_requests").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRowToPayout(data);
    } else {
      const db = loadDb();
      const payout = db.payoutRequests.find(p => p.id === id);
      return payout || null;
    }
  },

  async getAll(): Promise<PayoutRequest[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("payout_requests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToPayout);
    } else {
      const db = loadDb();
      return db.payoutRequests;
    }
  },

  async getByClipperId(clipperId: string): Promise<PayoutRequest[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("payout_requests").select("*").eq("clipper_id", clipperId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToPayout);
    } else {
      const db = loadDb();
      return db.payoutRequests.filter(p => p.clipperId === clipperId);
    }
  },

  async requestWithdrawalRpc(params: {
    payoutId: string;
    clipperId: string;
    clipperName: string;
    upiId: string;
    amount: number;
    ledgerId: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("request_withdrawal", {
        p_payout_id: params.payoutId,
        p_clipper_id: params.clipperId,
        p_clipper_name: params.clipperName,
        p_upi_id: params.upiId,
        p_amount_paise: Math.round(params.amount * 100),
        p_ledger_id: params.ledgerId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: data.success };
    } else {
      // Local JSON implementation
      const db = loadDb();
      if (!db.financialLedger) db.financialLedger = [];

      // Calculate available balance
      let totalEarned = 0;
      let totalWithdrawn = 0;
      let pendingWithdrawal = 0;

      for (const entry of db.financialLedger) {
        if (entry.userId !== params.clipperId) continue;
        if (entry.referenceType === "clipper_earning" && entry.status === "completed") {
          totalEarned += entry.amount;
        }
        if (entry.referenceType === "withdrawal_completed" && entry.status === "completed") {
          totalWithdrawn += entry.amount;
        }
        if (entry.referenceType === "withdrawal_request") {
          if (entry.status === "pending") {
            pendingWithdrawal += entry.amount;
          }
        }
      }

      const availableBalance = Math.round((totalEarned - totalWithdrawn - pendingWithdrawal) * 100) / 100;
      if (params.amount > availableBalance) {
        return { success: false, error: "Insufficient earnings balance" };
      }

      // Create payout request
      const newRequest: PayoutRequest = {
        id: params.payoutId,
        clipperId: params.clipperId,
        clipperName: params.clipperName,
        upiId: params.upiId,
        amount: params.amount,
        status: "Processing",
        createdAt: new Date().toISOString()
      };
      db.payoutRequests.push(newRequest);

      // Create ledger entry
      db.financialLedger.push({
        id: params.ledgerId,
        referenceId: `payout-request-${params.payoutId}`,
        referenceType: "withdrawal_request",
        fromAccount: `clipper_earnings:${params.clipperId}`,
        toAccount: `clipper_pending_withdrawal:${params.clipperId}`,
        userId: params.clipperId,
        amount: params.amount,
        status: "pending",
        description: `Withdrawal request to UPI: ${params.upiId}`,
        createdAt: new Date().toISOString()
      });

      saveDb(db);
      return { success: true };
    }
  },

  async completePayoutRpc(params: {
    payoutId: string;
    ledgerId: string;
    txId: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("complete_payout", {
        p_payout_id: params.payoutId,
        p_ledger_id: params.ledgerId,
        p_tx_id: params.txId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: data.success };
    } else {
      const db = loadDb();
      const payout = db.payoutRequests.find(p => p.id === params.payoutId);
      if (!payout) return { success: false, error: "Payout request not found" };

      if (payout.status !== "Processing") {
        return { success: false, error: "Payout request is not processing" };
      }

      payout.status = "Completed";

      // Update original ledger entry
      const originalLedgerEntry = (db.financialLedger || []).find(
        e => e.referenceId === `payout-request-${params.payoutId}`
      );
      if (originalLedgerEntry) {
        originalLedgerEntry.status = "completed";
      }

      // Record withdrawal completed ledger entry
      db.financialLedger.push({
        id: params.ledgerId,
        referenceId: `payout-complete-${params.payoutId}`,
        referenceType: "withdrawal_completed",
        fromAccount: `clipper_pending_withdrawal:${payout.clipperId}`,
        toAccount: "External (UPI)",
        userId: payout.clipperId,
        amount: payout.amount,
        status: "completed",
        description: `Withdrawal completed to UPI: ${payout.upiId}`,
        createdAt: new Date().toISOString()
      });

      // Record wallet history
      if (!db.walletHistory) db.walletHistory = [];
      db.walletHistory.push({
        id: params.txId,
        userId: payout.clipperId,
        type: "withdrawal",
        amount: payout.amount,
        status: "Completed",
        description: `Withdrawn to UPI: ${payout.upiId}`,
        createdAt: new Date().toISOString()
      });

      saveDb(db);
      return { success: true };
    }
  },

  async failPayoutRpc(params: {
    payoutId: string;
    ledgerId: string;
    txId: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("fail_payout", {
        p_payout_id: params.payoutId,
        p_ledger_id: params.ledgerId,
        p_tx_id: params.txId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: data.success };
    } else {
      const db = loadDb();
      const payout = db.payoutRequests.find(p => p.id === params.payoutId);
      if (!payout) return { success: false, error: "Payout request not found" };

      if (payout.status !== "Processing") {
        return { success: false, error: "Payout request is not processing" };
      }

      payout.status = "Failed";

      // Update original ledger entry
      const originalLedgerEntry = (db.financialLedger || []).find(
        e => e.referenceId === `payout-request-${params.payoutId}`
      );
      if (originalLedgerEntry) {
        originalLedgerEntry.status = "reversed";
      }

      // Record withdrawal failed ledger entry
      db.financialLedger.push({
        id: params.ledgerId,
        referenceId: `payout-failed-${params.payoutId}`,
        referenceType: "withdrawal_failed",
        fromAccount: `clipper_pending_withdrawal:${payout.clipperId}`,
        toAccount: `clipper_earnings:${payout.clipperId}`,
        userId: payout.clipperId,
        amount: payout.amount,
        status: "completed",
        description: `Withdrawal failed. Refunded to available balance.`,
        createdAt: new Date().toISOString()
      });

      // Record wallet history
      if (!db.walletHistory) db.walletHistory = [];
      db.walletHistory.push({
        id: params.txId,
        userId: payout.clipperId,
        type: "deposit",
        amount: payout.amount,
        status: "Completed",
        description: `Withdrawn request failed. Refunded to available balance.`,
        createdAt: new Date().toISOString()
      });

      saveDb(db);
      return { success: true };
    }
  }
};
