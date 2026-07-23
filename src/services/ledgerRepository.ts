import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { FinancialLedgerEntry, ClipperBalance } from "../types.js";

const mapRowToLedger = (row: any): FinancialLedgerEntry => {
  return {
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
  };
};

export const ledgerRepository = {
  async getAll(): Promise<FinancialLedgerEntry[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("financial_ledger").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToLedger);
    } else {
      const db = loadDb();
      return db.financialLedger || [];
    }
  },

  async getByUserId(userId: string): Promise<FinancialLedgerEntry[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("financial_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToLedger);
    } else {
      const db = loadDb();
      return (db.financialLedger || []).filter(e => e.userId === userId);
    }
  },

  async createEntry(entry: FinancialLedgerEntry): Promise<FinancialLedgerEntry> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("financial_ledger").insert({
        id: entry.id,
        reference_id: entry.referenceId,
        reference_type: entry.referenceType,
        from_account: entry.fromAccount,
        to_account: entry.toAccount,
        user_id: entry.userId,
        amount: Math.round(entry.amount * 100), // convert INR to paise
        status: entry.status,
        description: entry.description || "",
        created_at: entry.createdAt || new Date().toISOString()
      });
      if (error) throw error;
      return entry;
    } else {
      const db = loadDb();
      if (!db.financialLedger) db.financialLedger = [];
      db.financialLedger.push(entry);
      saveDb(db);
      return entry;
    }
  },

  async getDerivedClipperBalance(userId: string): Promise<ClipperBalance> {
    let entries: FinancialLedgerEntry[] = [];
    
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("financial_ledger").select("*").eq("user_id", userId);
      if (error) throw error;
      entries = (data || []).map(mapRowToLedger);
    } else {
      const db = loadDb();
      entries = (db.financialLedger || []).filter(e => e.userId === userId);
    }

    let totalEarned = 0;
    let totalWithdrawn = 0;
    let pendingWithdrawal = 0;

    for (const entry of entries) {
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

    totalEarned = Math.round(totalEarned * 100) / 100;
    totalWithdrawn = Math.round(totalWithdrawn * 100) / 100;
    pendingWithdrawal = Math.round(pendingWithdrawal * 100) / 100;
    const availableBalance = Math.round((totalEarned - totalWithdrawn - pendingWithdrawal) * 100) / 100;

    return {
      userId,
      totalEarned,
      totalWithdrawn,
      pendingWithdrawal,
      availableBalance
    };
  }
};
