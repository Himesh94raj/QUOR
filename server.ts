import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { DbSchema, User, Campaign, Submission, ClipperProfile, CreatorProfile, WalletTransaction, PayoutRequest, ContactMessage, FinancialLedgerEntry, ClipperBalance, ViewPayoutEvent, AuditEvent, FraudEvent, PaymentRecord } from "./src/types.js";
import {
  detectPlatform,
  normalizeSocialUrl,
  extractContentId,
  validateSubmissionUrl
} from "./src/services/socialUrlService.js";
import {
  analyzeViewUpdate,
  analyzeSubmissionCreation
} from "./src/services/fraudDetectionService.js";
import {
  getProviderForPlatform
} from "./src/services/viewVerificationService.js";
import {
  recordAuditEvent,
  validateCampaignTransition,
  validateSubmissionTransition
} from "./src/services/stateMachineService.js";
import { getPaymentProvider } from "./src/services/paymentProvider.js";
import { getKycProvider } from "./src/services/kycProvider.js";


const FILE_PATH = path.join(process.cwd(), "database.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL environment variable.");
}
if (!supabaseKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("========== SUPABASE DEBUG ==========");
console.log("SUPABASE URL:", supabaseUrl);
console.log("SERVICE ROLE PRESENT:", !!supabaseKey);
console.log("SERVICE ROLE PREFIX:", supabaseKey ? supabaseKey.substring(0, 20) : "MISSING");
console.log("====================================");

const JWT_SECRET = process.env.JWT_SECRET || "use-a-long-random-secret-value";

// Rate limiter for login endpoints (max 5 login attempts per IP per 15 mins)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: "Too many login attempts from this IP, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Zod Validation Schemas
const signupSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["creator", "clipper"])
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
});

const clipperProfileSchema = z.object({
  upiId: z.string().optional().nullable(),
  instagramHandle: z.string().optional().nullable(),
  youtubeHandle: z.string().optional().nullable(),
  kycAadhaar: z.string().optional().nullable(),
  kycPan: z.string().optional().nullable(),
  kycDocUrl: z.string().optional().nullable()
});

const creatorProfileSchema = z.object({
  channelUrl: z.string().optional().nullable()
});

const walletDepositSchema = z.object({
  amount: z.union([z.number(), z.string()]).refine(val => {
    const num = typeof val === "number" ? val : parseFloat(val);
    return !isNaN(num) && num > 0;
  }, { message: "Amount must be a positive number." })
});

const campaignCreationSchema = z.object({
  title: z.string().min(1, "Campaign title is required"),
  sourceVideoUrl: z.string().url("Source video must be a valid URL"),
  cpm: z.union([z.number(), z.string()]).transform(val => typeof val === "number" ? val : parseFloat(val)).refine(val => val > 0, "CPM must be a positive number"),
  budget: z.union([z.number(), z.string()]).transform(val => typeof val === "number" ? val : parseFloat(val)).refine(val => val > 0, "Budget must be a positive number"),
  instructions: z.string().min(1, "Campaign instructions are required"),
  platform: z.enum(["instagram", "youtube", "both", "facebook", "twitter"]),
  minDuration: z.union([z.number(), z.string()]).transform(val => typeof val === "number" ? val : parseFloat(val)).refine(val => val > 0, "Minimum duration must be a positive number"),
  deadline: z.string().min(1, "Deadline is required"),
  iconUrl: z.string().url().optional().nullable(),
  campaignType: z.enum(["both", "ugc", "clipping"]).optional().nullable()
});

const payoutRequestSchema = z.object({
  amount: z.union([z.number(), z.string()]).transform(val => typeof val === "number" ? val : parseFloat(val)).refine(val => val >= 500, "Minimum withdrawal threshold is ₹500.")
});


let isSyncing = false;

// Async helper to sync to Supabase
const syncToSupabase = async (db: DbSchema) => {
  if (isSyncing) {
    console.log("Supabase Sync: Skipping execution because a sync is already in progress to prevent race conditions.");
    return;
  }
  isSyncing = true;
  try {
    console.log("Supabase: Initiating sync in safe dependency order...");

    // 1. Try to sync individual users table first (Parent of profiles, campaigns, etc.)
    try {
      if (db.users && db.users.length > 0) {
        // Fetch all existing users from Supabase to align IDs and prevent duplicate email conflicts
        const { data: supabaseUsers, error: fetchErr } = await supabase
          .from("users")
          .select("id, email");

        const emailToSupabaseIdMap = new Map<string, string>();
        if (!fetchErr && supabaseUsers) {
          for (const sUser of supabaseUsers) {
            if (sUser.email) {
              emailToSupabaseIdMap.set(sUser.email.toLowerCase(), sUser.id);
            }
          }
        }

        let dbModified = false;

        // Dedup local db.users by email internally before mapping
        const uniqueLocalUsers: User[] = [];
        const seenLocalEmails = new Set<string>();
        for (const u of db.users) {
          const emailLower = u.email.toLowerCase();
          if (!seenLocalEmails.has(emailLower)) {
            seenLocalEmails.add(emailLower);
            uniqueLocalUsers.push(u);
          } else {
            dbModified = true; // removed local duplicate
          }
        }
        db.users = uniqueLocalUsers;

        // Check for mismatches between local IDs and Supabase IDs for matching emails
        for (const user of db.users) {
          const emailLower = user.email.toLowerCase();
          const existingSupabaseId = emailToSupabaseIdMap.get(emailLower);
          if (existingSupabaseId && existingSupabaseId !== user.id) {
            const oldId = user.id;
            const newId = existingSupabaseId;
            console.log(`Supabase Sync: Resolving ID mismatch for ${user.email}. Aligning local ID ${oldId} to Supabase ID ${newId}`);

            user.id = newId;
            dbModified = true;

            // Cascade ID updates to other tables in local memory database
            // clipperProfiles
            if (db.clipperProfiles && db.clipperProfiles[oldId]) {
              const profile = db.clipperProfiles[oldId];
              profile.userId = newId;
              db.clipperProfiles[newId] = profile;
              delete db.clipperProfiles[oldId];
            }

            // creatorProfiles
            if (db.creatorProfiles && db.creatorProfiles[oldId]) {
              const profile = db.creatorProfiles[oldId];
              profile.userId = newId;
              db.creatorProfiles[newId] = profile;
              delete db.creatorProfiles[oldId];
            }

            // campaigns
            if (db.campaigns) {
              db.campaigns.forEach(c => {
                if (c.creatorId === oldId) {
                  c.creatorId = newId;
                }
              });
            }

            // submissions
            if (db.submissions) {
              db.submissions.forEach(s => {
                if (s.clipperId === oldId) {
                  s.clipperId = newId;
                }
              });
            }

            // walletHistory
            if (db.walletHistory) {
              db.walletHistory.forEach(w => {
                if (w.userId === oldId) {
                  w.userId = newId;
                }
              });
            }

            // payoutRequests
            if (db.payoutRequests) {
              db.payoutRequests.forEach(p => {
                if (p.clipperId === oldId) {
                  p.clipperId = newId;
                }
              });
            }
          }
        }

        // Save adjusted database to prevent future mismatches and keep local JSON and related tables in complete sync
        if (dbModified) {
          fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
          console.log("Supabase Sync: Successfully aligned local user IDs and relation keys with Supabase");
        }

        const rows = db.users
          .filter(u => u.password)
          .map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            password: u.password,
            role: u.role,
            status: u.status || "active",
            status_reason: u.statusReason || "",
            created_at: u.createdAt
          }));

        if (rows.length > 0) {
          const { error } = await supabase.from("users").upsert(rows, { onConflict: "id" });
          if (error) {
            console.warn("Supabase: 'users' table sync skipped:", error.message);
          } else {
            console.log(`Supabase: Synced ${rows.length} users successfully`);
          }
        }
      }
    } catch (e: any) {
      console.warn("Supabase users sync exception:", e.message || e);
    }

    // 2. Try to sync clipper_profiles table
    try {
      if (db.clipperProfiles && Object.keys(db.clipperProfiles).length > 0) {
        const rows = Object.values(db.clipperProfiles).map(p => ({
          user_id: p.userId,
          upi_id: p.upiId,
          instagram_handle: p.instagramHandle,
          youtube_handle: p.youtubeHandle,
          kyc_status: p.kycStatus,
          kyc_doc_url: p.kycDocUrl,
          kyc_aadhaar: p.kycAadhaar,
          kyc_pan: p.kycPan
        }));
        const { error } = await supabase.from("clipper_profiles").upsert(rows, { onConflict: "user_id" });
        if (error) {
          console.warn("Supabase: 'clipper_profiles' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} clipper_profiles successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase clipper_profiles sync exception:", e.message || e);
    }

    // 3. Try to sync creator_profiles table
    try {
      if (db.creatorProfiles && Object.keys(db.creatorProfiles).length > 0) {
        const rows = Object.values(db.creatorProfiles).map(p => ({
          user_id: p.userId,
          channel_url: p.channelUrl,
          wallet_balance: p.walletBalance
        }));
        const { error } = await supabase.from("creator_profiles").upsert(rows, { onConflict: "user_id" });
        if (error) {
          console.warn("Supabase: 'creator_profiles' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} creator_profiles successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase creator_profiles sync exception:", e.message || e);
    }

    // 4. Try to sync campaigns table
    try {
      if (db.campaigns && db.campaigns.length > 0) {
        const rows = db.campaigns.map(c => ({
          id: c.id,
          creator_id: c.creatorId,
          creator_name: c.creatorName,
          title: c.title,
          source_video_url: c.sourceVideoUrl,
          cpm: c.cpm,
          budget: c.budget,
          spent: c.spent,
          instructions: c.instructions,
          platform: c.platform,
          deadline: c.deadline,
          status: c.status,
          created_at: c.createdAt
        }));
        const { error } = await supabase.from("campaigns").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'campaigns' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} campaigns successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase campaigns sync exception:", e.message || e);
    }

    // 5. Try to sync submissions table
    try {
      if (db.submissions && db.submissions.length > 0) {
        const rows = db.submissions.map(s => ({
          id: s.id,
          campaign_id: s.campaignId,
          campaign_title: s.campaignTitle,
          clipper_id: s.clipperId,
          clipper_name: s.clipperName,
          submitted_url: s.submittedUrl,
          status: s.status,
          feedback: s.feedback || "",
          approved_at: s.approvedAt || null,
          views: s.views,
          last_fetched_views: s.lastFetchedViews || null
        }));
        const { error } = await supabase.from("submissions").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'submissions' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} submissions successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase submissions sync exception:", e.message || e);
    }

    // 6. Try to sync wallet_history table
    try {
      if (db.walletHistory && db.walletHistory.length > 0) {
        const rows = db.walletHistory.map(w => ({
          id: w.id,
          user_id: w.userId,
          type: w.type,
          amount: w.amount,
          status: w.status,
          description: w.description,
          created_at: w.createdAt
        }));
        const { error } = await supabase.from("wallet_history").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'wallet_history' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} wallet_history rows successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase wallet_history sync exception:", e.message || e);
    }

    // 7. Try to sync payout_requests table
    try {
      if (db.payoutRequests && db.payoutRequests.length > 0) {
        const rows = db.payoutRequests.map(p => ({
          id: p.id,
          clipper_id: p.clipperId,
          clipper_name: p.clipperName,
          upi_id: p.upiId,
          amount: p.amount,
          status: p.status,
          created_at: p.createdAt
        }));
        const { error } = await supabase.from("payout_requests").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'payout_requests' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} payout_requests successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase payout_requests sync exception:", e.message || e);
    }

    // 8. Try to sync contacts / tickets table
    try {
      if (db.contacts && db.contacts.length > 0) {
        const rows = db.contacts.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          subject: c.subject,
          message: c.message,
          created_at: c.createdAt
        }));
        const { error } = await supabase.from("contacts").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'contacts' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} contacts successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase contacts sync exception:", e.message || e);
    }

    // 9. Try to sync entire state to a master backup table at the end
    try {
      const { error } = await supabase
        .from("trov_state")
        .upsert({ id: "current", state: db, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) {
        console.warn("Supabase: 'trov_state' sync skipped or failed (table might not exist yet):", error.message);
      } else {
        console.log("Supabase: Entire database state synced successfully to 'trov_state'");
      }
    } catch (e: any) {
      console.warn("Supabase 'trov_state' sync exception:", e.message || e);
    }

  } catch (err: any) {
    console.error("General Supabase sync failure:", err.message || err);
  } finally {
    isSyncing = false;
  }
};

// Helper to write database
const saveDb = (db: DbSchema) => {
  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  syncToSupabase(db).catch(err => {
    console.error("Supabase async backup trigger failed:", err);
  });
};

// Financial Ledger Helpers & Double-Entry Bookkeeping Engine

function recordLedgerEntry(
  db: DbSchema,
  entry: Omit<FinancialLedgerEntry, "id" | "createdAt">
): FinancialLedgerEntry {
  if (!db.financialLedger) {
    db.financialLedger = [];
  }

  // Check if referenceId already exists to ensure idempotency
  const existing = db.financialLedger.find(e => e.referenceId === entry.referenceId);
  if (existing) {
    return existing;
  }

  const newEntry: FinancialLedgerEntry = {
    id: "led-" + Math.random().toString(36).substring(2, 9),
    ...entry,
    createdAt: new Date().toISOString()
  };

  db.financialLedger.push(newEntry);

  // Sync cache
  if (entry.userId) {
    syncClipperBalanceCache(db, entry.userId);
  }

  return newEntry;
}

function getDerivedClipperBalance(db: DbSchema, userId: string): ClipperBalance {
  if (!db.financialLedger) {
    db.financialLedger = [];
  }

  let totalEarned = 0;
  let totalWithdrawn = 0;
  let pendingWithdrawal = 0;

  for (const entry of db.financialLedger) {
    if (entry.userId !== userId) continue;

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

function syncClipperBalanceCache(db: DbSchema, userId: string) {
  if (!db.clipperBalances) {
    db.clipperBalances = {};
  }
  db.clipperBalances[userId] = getDerivedClipperBalance(db, userId);
}

function refundCampaignEscrow(db: DbSchema, campaign: Campaign) {
  if (!campaign.escrowBalance || campaign.escrowBalance <= 0) {
    return;
  }

  const refundAmount = campaign.escrowBalance;
  const refId = `escrow-refund-${campaign.id}`;

  if (db.financialLedger && db.financialLedger.some(e => e.referenceId === refId)) {
    console.log(`Campaign ${campaign.id} already refunded. Skipping.`);
    campaign.escrowBalance = 0;
    return;
  }

  const creatorProf = db.creatorProfiles[campaign.creatorId];
  if (creatorProf) {
    creatorProf.walletBalance = Math.round((creatorProf.walletBalance + refundAmount) * 100) / 100;
  }

  campaign.escrowBalance = 0;

  recordLedgerEntry(db, {
    referenceId: refId,
    referenceType: "refund",
    fromAccount: `campaign_escrow:${campaign.id}`,
    toAccount: `creator_wallet:${campaign.creatorId}`,
    userId: campaign.creatorId,
    campaignId: campaign.id,
    amount: refundAmount,
    status: "completed",
    description: `Refund of unused budget from campaign: ${campaign.title}`
  });

  // Backward compatibility
  db.walletHistory.push({
    id: "tx-" + Math.random().toString(36).substring(2, 9),
    userId: campaign.creatorId,
    type: "deposit",
    amount: refundAmount,
    status: "Completed",
    description: `Refund of unused budget from campaign: ${campaign.title}`,
    createdAt: new Date().toISOString()
  });
}

function runFinancialMigration(db: DbSchema) {
  if (!db.financialLedger) {
    db.financialLedger = [];
  }
  if (!db.clipperBalances) {
    db.clipperBalances = {};
  }
  if (!db.viewPayoutEvents) {
    db.viewPayoutEvents = [];
  }

  // 1. Initial campaign escrow migration
  if (db.campaigns) {
    for (const c of db.campaigns) {
      if (c.escrowBalance === undefined) {
        c.escrowBalance = Math.max(0, Math.round((c.budget - c.spent) * 100) / 100);
      }
    }
  }

  // 2. Map old wallet history to ledger
  if (db.walletHistory) {
    for (const tx of db.walletHistory) {
      const refId = `migrated-tx-${tx.id}`;
      const alreadyExists = db.financialLedger.some(e => e.referenceId === refId);
      if (alreadyExists) continue;

      let refType: any = "deposit";
      let fromAcc = "External";
      let toAcc = `user_wallet:${tx.userId}`;
      let status: "pending" | "completed" | "reversed" = tx.status === "Completed" ? "completed" : "reversed";

      if (tx.type === "deposit") {
        refType = "deposit";
        fromAcc = "External (Razorpay)";
        toAcc = `creator_wallet:${tx.userId}`;
      } else if (tx.type === "payment") {
        if (tx.description.toLowerCase().includes("escrow lock")) {
          refType = "escrow_lock";
          fromAcc = `creator_wallet:${tx.userId}`;
          toAcc = "campaign_escrow";
        } else if (tx.description.toLowerCase().includes("refund")) {
          refType = "refund";
          fromAcc = "campaign_escrow";
          toAcc = `creator_wallet:${tx.userId}`;
        } else {
          // view payout / clipper earning simulation
          refType = "clipper_earning";
          fromAcc = "campaign_escrow";
          toAcc = `clipper_earnings:${tx.userId}`;
        }
      } else if (tx.type === "withdrawal") {
        refType = "withdrawal_completed";
        fromAcc = `clipper_pending_withdrawal:${tx.userId}`;
        toAcc = "External (UPI)";
      } else if (tx.type === "commission") {
        refType = "platform_fee";
        fromAcc = "campaign_escrow";
        toAcc = "QUOR Platform";
      }

      db.financialLedger.push({
        id: "led-" + Math.random().toString(36).substring(2, 9),
        referenceId: refId,
        referenceType: refType,
        fromAccount: fromAcc,
        toAccount: toAcc,
        userId: tx.userId,
        amount: tx.amount,
        status,
        description: tx.description,
        createdAt: tx.createdAt
      });
    }
  }

  // 3. Map payout requests to ledger withdrawal requests
  if (db.payoutRequests) {
    for (const p of db.payoutRequests) {
      const refId = `payout-request-${p.id}`;
      const alreadyExists = db.financialLedger.some(e => e.referenceId === refId);
      if (alreadyExists) continue;

      let status: "pending" | "completed" | "reversed" = "pending";
      if (p.status === "Completed") {
        status = "completed";
      } else if (p.status === "Failed") {
        status = "reversed";
      }

      db.financialLedger.push({
        id: "led-" + Math.random().toString(36).substring(2, 9),
        referenceId: refId,
        referenceType: "withdrawal_request",
        fromAccount: `clipper_earnings:${p.clipperId}`,
        toAccount: `clipper_pending_withdrawal:${p.clipperId}`,
        userId: p.clipperId,
        amount: p.amount,
        status,
        description: `Withdrawal request to UPI: ${p.upiId} (Migrated)`,
        createdAt: p.createdAt
      });

      // If completed, also make sure withdrawal_completed ledger entry exists
      if (p.status === "Completed") {
        const compRefId = `payout-complete-${p.id}`;
        if (!db.financialLedger.some(e => e.referenceId === compRefId)) {
          db.financialLedger.push({
            id: "led-" + Math.random().toString(36).substring(2, 9),
            referenceId: compRefId,
            referenceType: "withdrawal_completed",
            fromAccount: `clipper_pending_withdrawal:${p.clipperId}`,
            toAccount: "External (UPI)",
            userId: p.clipperId,
            amount: p.amount,
            status: "completed",
            description: `Withdrawal completed to UPI: ${p.upiId} (Migrated)`,
            createdAt: p.createdAt
          });
        }
      } else if (p.status === "Failed") {
        const failRefId = `payout-failed-${p.id}`;
        if (!db.financialLedger.some(e => e.referenceId === failRefId)) {
          db.financialLedger.push({
            id: "led-" + Math.random().toString(36).substring(2, 9),
            referenceId: failRefId,
            referenceType: "withdrawal_failed",
            fromAccount: `clipper_pending_withdrawal:${p.clipperId}`,
            toAccount: `clipper_earnings:${p.clipperId}`,
            userId: p.clipperId,
            amount: p.amount,
            status: "completed",
            description: `Withdrawal failed (Migrated)`,
            createdAt: p.createdAt
          });
        }
      }
    }
  }

  // Sync clipper balance caches
  const clipperUserIds = db.users.filter(u => u.role === "clipper").map(u => u.id);
  for (const cid of clipperUserIds) {
    syncClipperBalanceCache(db, cid);
  }
}

// Masking helpers for sensitive data
function maskAadhaar(aadhaar: string): string {
  if (!aadhaar) return "";
  if (aadhaar.includes("X") || aadhaar.includes("x")) return aadhaar;
  const cleaned = aadhaar.replace(/\s/g, "");
  if (cleaned.length < 4) return "XXXX";
  const visible = cleaned.slice(-4);
  return `XXXX XXXX ${visible}`;
}

function maskPan(pan: string): string {
  if (!pan) return "";
  if (pan.includes("X") || pan.includes("x")) return pan;
  const cleaned = pan.replace(/\s/g, "");
  if (cleaned.length < 4) return "XXXXX";
  const visible = cleaned.slice(-4);
  return `XXXXX${visible.toUpperCase()}`;
}

// Helper to load database
const loadDb = (): DbSchema => {
  let db: DbSchema;

  if (!fs.existsSync(FILE_PATH)) {
    const initialDb: DbSchema = {
      users: [
        {
          id: "admin-1",
          name: "QUOR Admin",
          email: "admin@quor.in",
          password: "admin",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
        {
          id: "owner-admin",
          name: "Owner Administrator",
          email: process.env.OWNER_EMAIL || "owner@quor.in",
          password: "password123",
          role: "admin",
          createdAt: new Date().toISOString(),
        },
        {
          id: "creator-hassan",
          name: "Hassan Choudhury",
          email: "hassan@tech.io",
          password: "password123",
          role: "creator",
          createdAt: new Date().toISOString(),
        },
        {
          id: "creator-shradha",
          name: "Shradha Khapra",
          email: "shradha@edtech.com",
          password: "password123",
          role: "creator",
          createdAt: new Date().toISOString(),
        },
        {
          id: "clipper-sam",
          name: "Samir Kulkarni",
          email: "samir@editor.com",
          password: "password123",
          role: "clipper",
          createdAt: new Date().toISOString(),
        },
        {
          id: "clipper-riya",
          name: "Riya Verma",
          email: "riya@editor.com",
          password: "password123",
          role: "clipper",
          createdAt: new Date().toISOString(),
        }
      ],
      clipperProfiles: {
        "clipper-sam": {
          userId: "clipper-sam",
          upiId: "samir@okaxis",
          instagramHandle: "sam_clips_tech",
          youtubeHandle: "sam_shorts",
          kycStatus: "Verified",
          kycDocUrl: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500&auto=format&fit=crop&q=60",
          kycAadhaar: "4567 8901 2345",
          kycPan: "ABCDE1234F"
        },
        "clipper-riya": {
          userId: "clipper-riya",
          upiId: "riya@okicici",
          instagramHandle: "riya_edits_ig",
          youtubeHandle: "riya_cuts_yt",
          kycStatus: "Pending",
          kycDocUrl: "https://images.unsplash.com/photo-1554415707-6e8cfc93fe23?w=500&auto=format&fit=crop&q=60",
          kycAadhaar: "9876 5432 1098",
          kycPan: "XYZW9876A"
        }
      },
      creatorProfiles: {
        "creator-hassan": {
          userId: "creator-hassan",
          channelUrl: "https://youtube.com/c/HassanTechShow",
          walletBalance: 15400,
        },
        "creator-shradha": {
          userId: "creator-shradha",
          channelUrl: "https://youtube.com/c/ApnaCollege",
          walletBalance: 8000,
        }
      },
      campaigns: [
        {
          id: "campaign-1",
          creatorId: "creator-hassan",
          creatorName: "Hassan Choudhury",
          title: "Ultimate 2026 AI Roadmap Video Clips",
          sourceVideoUrl: "https://www.youtube.com/watch?v=road123",
          cpm: 250,
          budget: 10000,
          spent: 2400,
          instructions: "Extract high-impact tips about AI agents. Keep clips between 20-55 seconds. Add bold auto-captions and a zoom transition on important points.",
          platform: "both",
          minDuration: 20,
          deadline: "2026-07-31",
          status: "Active",
          createdAt: new Date().toISOString()
        },
        {
          id: "campaign-2",
          creatorId: "creator-shradha",
          creatorName: "Shradha Khapra",
          title: "React 19 Hooks Tutorial Clips",
          sourceVideoUrl: "https://www.youtube.com/watch?v=react19",
          cpm: 200,
          budget: 5000,
          spent: 0,
          instructions: "Focus on the useActionState hook. Cut the code explanation down to 40 seconds. Highlight the loading boundary.",
          platform: "youtube",
          minDuration: 30,
          deadline: "2026-08-15",
          status: "Active",
          createdAt: new Date().toISOString()
        }
      ],
      submissions: [
        {
          id: "sub-1",
          campaignId: "campaign-1",
          campaignTitle: "Ultimate 2026 AI Roadmap Video Clips",
          clipperId: "clipper-sam",
          clipperName: "Samir Kulkarni",
          submittedUrl: "https://youtube.com/shorts/awesome_shorts_1",
          status: "Approved",
          feedback: "Great edits on this clip! Subtitles are extremely visible.",
          approvedAt: new Date().toISOString(),
          views: 12000,
          lastFetchedViews: new Date().toISOString(),
          createdAt: new Date().toISOString()
        },
        {
          id: "sub-2",
          campaignId: "campaign-2",
          campaignTitle: "React 19 Hooks Tutorial Clips",
          clipperId: "clipper-sam",
          clipperName: "Samir Kulkarni",
          submittedUrl: "https://instagram.com/reels/react19_speed",
          status: "Pending",
          views: 0,
          lastFetchedViews: null,
          approvedAt: null,
          createdAt: new Date().toISOString()
        }
      ],
      walletHistory: [
        {
          id: "tx-1",
          userId: "creator-hassan",
          type: "deposit",
          amount: 15400,
          status: "Completed",
          description: "Fund Added via Razorpay",
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          id: "tx-2",
          userId: "creator-hassan",
          type: "payment",
          amount: 2400,
          status: "Completed",
          description: "Payout for Samir Kulkarni (sub-1) views",
          createdAt: new Date().toISOString()
        },
        {
          id: "tx-3",
          userId: "clipper-sam",
          type: "payment",
          amount: 2400,
          status: "Completed",
          description: "Earned ₹1920 (80% from CPM ₹250 for 12,000 views, Platform Commission ₹480)",
          createdAt: new Date().toISOString()
        }
      ],
      payoutRequests: [
        {
          id: "payout-1",
          clipperId: "clipper-sam",
          clipperName: "Samir Kulkarni",
          upiId: "samir@okaxis",
          amount: 1000,
          status: "Completed",
          createdAt: new Date(Date.now() - 86400000).toISOString()
        }
      ]
    };
    db = initialDb;
    saveDb(initialDb);
  } else {
    try {
      const raw = fs.readFileSync(FILE_PATH, "utf8");
      db = JSON.parse(raw);
    } catch (e) {
      console.error("Error reading db client", e);
      db = {
        users: [],
        clipperProfiles: {},
        creatorProfiles: {},
        campaigns: [],
        submissions: [],
        walletHistory: [],
        payoutRequests: []
      };
    }
  }

  // Run financial double-entry ledger migration/updates
  runFinancialMigration(db);

  // Sanitize legacy Clipper profile sensitive data
  let sanitized = false;
  if (db.clipperProfiles) {
    for (const key of Object.keys(db.clipperProfiles)) {
      const profile = db.clipperProfiles[key];
      if (profile.kycAadhaar && !profile.kycAadhaar.startsWith("XXXX")) {
        profile.kycAadhaar = maskAadhaar(profile.kycAadhaar);
        sanitized = true;
      }
      if (profile.kycPan && !profile.kycPan.startsWith("XXXXX")) {
        profile.kycPan = maskPan(profile.kycPan);
        sanitized = true;
      }
    }
  }

  // Ensure all users have hashed passwords
  let updated = false;
  db.users = db.users.map((user) => {
    if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$") && !user.password.startsWith("$2y$")) {
      user.password = bcrypt.hashSync(user.password, 10);
      updated = true;
    }
    return user;
  });

  if (updated || sanitized) {
    saveDb(db);
  }

  return db;
};

const startServer = async () => {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON & cookies
  app.use(express.json({ limit: "15mb" }));

  // CORS configuration for cross-origin requests
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }
      if (
        origin === "https://quor.in" ||
        origin === "https://www.quor.in" ||
        origin === "http://localhost:5173" ||
        /^https:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/.test(origin) ||
        /^https:\/\/[a-zA-Z0-9-_.]+\.googleusercontent\.com$/.test(origin) ||
        /^http:\/\/localhost:\d+$/.test(origin) ||
        origin.includes("run.app")
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 200
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // Set up API routes
  
  // Custom Auth Middleware representation
  const authenticateUser = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized access. No session found." });
    }
    const token = authHeader.split(" ")[1];

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      return res.status(401).json({ error: "Invalid token. Please log in again." });
    }

    const userId = decoded?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Invalid token payload." });
    }

    try {
      // 1. Try fetching from Supabase first to support new registrations
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (user && !error) {
        const userStatus = user.status;
        const statusUntil = user.status_until || user.statusUntil;
        const statusReason = user.status_reason || user.statusReason;

        // Check suspension/ban status
        if (userStatus === "banned") {
          return res.status(403).json({ error: `This account has been PERMANENTLY BANNED. Reason: ${statusReason || "Policy violation"}` });
        }
        if (userStatus === "suspended" && statusUntil) {
          const untilDate = new Date(statusUntil);
          if (untilDate > new Date()) {
            return res.status(403).json({ error: `This account is SUSPENDED until ${untilDate.toLocaleString("en-IN")}. Reason: ${statusReason || "Temporary cool-off"}` });
          } else {
            // Automatically lift suspension in Supabase
            await supabase
              .from("users")
              .update({ status: "active", status_until: null, status_reason: "" })
              .eq("id", user.id);
            user.status = "active";
            user.status_until = null;
            user.status_reason = "";
          }
        }

        req.user = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status || "active",
          statusUntil: user.status_until || user.statusUntil || null,
          statusReason: user.status_reason || user.statusReason || "",
          createdAt: user.created_at || user.createdAt
        };
        return next();
      }
    } catch (e) {
      console.error("authenticateUser Supabase error:", e);
    }

    // 2. Fallback to local DB for legacy compatibility
    const db = loadDb();
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: "Session expired or invalid user." });
    }

    // Check suspension/ban status
    if (user.status === "banned") {
      return res.status(403).json({ error: `This account has been PERMANENTLY BANNED. Reason: ${user.statusReason || "Policy violation"}` });
    }
    if (user.status === "suspended" && user.statusUntil) {
      const untilDate = new Date(user.statusUntil);
      if (untilDate > new Date()) {
        return res.status(403).json({ error: `This account is SUSPENDED until ${untilDate.toLocaleString("en-IN")}. Reason: ${user.statusReason || "Temporary cool-off"}` });
      } else {
        // Automatically lift suspension
        user.status = "active";
        user.statusUntil = null;
        user.statusReason = "";
        saveDb(db);
      }
    }

    req.user = user;
    next();
  };

  // Reusable Middleware to restrict access to only the designated Owner Administrator
  const requireOwnerAdmin = (req: any, res: any, next: any) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized access. No session found." });
    }

    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) {
      console.error("ADMIN SECURITY CONFIG ERROR: OWNER_EMAIL environment variable is not defined!");
      return res.status(403).json({ error: "Access Forbidden. Administrator security configuration is missing." });
    }

    if (user.role !== "admin" || !user.email || user.email.toLowerCase() !== ownerEmail.toLowerCase()) {
      console.warn(`SECURITY ALERT: Unauthorized admin access attempt to restricted endpoint by user ${user.email || "unknown"} (role: ${user.role || "none"}). Required Owner: ${ownerEmail}`);
      return res.status(403).json({ error: "Access Denied. Only the designated Owner Administrator can perform this action." });
    }

    next();
  };

  // Auth Endpoints
  app.post("/api/auth/signup", async (req, res) => {
    try {
      if (req.body.role === "admin") {
        return res.status(403).json({ error: "Access Denied. Public users cannot register as Admin." });
      }

      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { name, email, password, role } = parsed.data;

      // 1. Check if email is already registered in Supabase
      const { data: existing, error: checkError } = await supabase
        .from("users")
        .select("*")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (checkError) {
        console.error("Supabase signup check error:", checkError);
        return res.status(500).json({ error: "Signup service unavailable." });
      }

      if (existing) {
        return res.status(400).json({ error: "Email is already registered." });
      }

      const userId = "user-" + Math.random().toString(36).substring(2, 9);
      const hashedPassword = bcrypt.hashSync(password, 10);
      const createdAt = new Date().toISOString();

      // 2. Insert into Supabase users table
      const { error: insertError } = await supabase
        .from("users")
        .insert([{
          id: userId,
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          role,
          status: "active",
          status_reason: "",
          created_at: createdAt
        }]);

      if (insertError) {
        console.error("Supabase user insert error:", insertError);
        return res.status(500).json({ error: "Failed to register user." });
      }

      // Also register inside local memory DB for safe local fallback parity
      const db = loadDb();
      db.users.push({
        id: userId,
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        createdAt,
        status: "active",
        statusReason: ""
      });

      // 3. Create profiles in Supabase and local DB
      if (role === "clipper") {
        const { error: profileErr } = await supabase
          .from("clipper_profiles")
          .insert([{
            user_id: userId,
            upi_id: "",
            instagram_handle: "",
            youtube_handle: "",
            kyc_status: "Pending",
            kyc_doc_url: "",
            kyc_aadhaar: "",
            kyc_pan: ""
          }]);
        if (profileErr) {
          console.warn("Supabase signup profile creation error:", profileErr);
        }

        db.clipperProfiles[userId] = {
          userId,
          upiId: "",
          instagramHandle: "",
          youtubeHandle: "",
          kycStatus: "Pending",
          kycDocUrl: "",
          kycAadhaar: "",
          kycPan: ""
        };
      } else if (role === "creator") {
        const { error: profileErr } = await supabase
          .from("creator_profiles")
          .insert([{
            user_id: userId,
            channel_url: "",
            wallet_balance: 0
          }]);
        if (profileErr) {
          console.warn("Supabase signup profile creation error:", profileErr);
        }

        db.creatorProfiles[userId] = {
          userId,
          channelUrl: "",
          walletBalance: 0
        };
      }

      recordAuditEvent(db, userId, role, "SIGNUP", "user", userId, { email, name });
      saveDb(db);

      const isOwnerAdmin = false;
      
      // Generate secure JWT token
      const token = jwt.sign(
        {
          userId,
          role
        },
        JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );

      res.status(201).json({
        id: userId,
        name,
        email,
        role,
        isOwnerAdmin,
        token
      });
    } catch (err: any) {
      console.error("Signup catch error:", err);
      res.status(500).json({ error: err.message || "Internal server error." });
    }
  });

  app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }
      const { email, password } = parsed.data;

      // 1. Query Supabase users table
      const { data: user, error } = await supabase
        .from("users")
        .select("*")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error("Supabase login error:", error);
        return res.status(500).json({ error: "Authentication service unavailable." });
      }

      // Auto-bootstrap any OWNER_EMAIL login as Admin in Supabase
      const ownerEmail = process.env.OWNER_EMAIL;
      if (user && ownerEmail && email.toLowerCase() === ownerEmail.toLowerCase() && user.role !== "admin") {
        user.role = "admin";
        await supabase
          .from("users")
          .update({ role: "admin" })
          .eq("id", user.id);
      }

      const isPasswordValid = user && bcrypt.compareSync(password, user.password);
      if (!user || !isPasswordValid) {
        const localDb = loadDb();
        recordAuditEvent(localDb, undefined, undefined, "LOGIN_FAILURE", "user", undefined, { email });
        saveDb(localDb);
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const userStatus = user.status;
      const statusUntil = user.status_until || user.statusUntil;
      const statusReason = user.status_reason || user.statusReason;

      // Check suspension/ban status
      if (userStatus === "banned") {
        const localDb = loadDb();
        recordAuditEvent(localDb, user.id, user.role, "LOGIN_FAILURE", "user", user.id, { email, reason: "banned" });
        saveDb(localDb);
        return res.status(403).json({ error: `This account has been PERMANENTLY BANNED. Reason: ${statusReason || "Policy violation"}` });
      }
      if (userStatus === "suspended" && statusUntil) {
        const untilDate = new Date(statusUntil);
        if (untilDate > new Date()) {
          const localDb = loadDb();
          recordAuditEvent(localDb, user.id, user.role, "LOGIN_FAILURE", "user", user.id, { email, reason: "suspended" });
          saveDb(localDb);
          return res.status(403).json({ error: `This account is SUSPENDED until ${untilDate.toLocaleString("en-IN")}. Reason: ${statusReason || "Temporary cool-off"}` });
        } else {
          // Lift suspension in Supabase
          await supabase
            .from("users")
            .update({ status: "active", status_until: null, status_reason: "" })
            .eq("id", user.id);
          user.status = "active";
          user.status_until = null;
          user.status_reason = "";
        }
      }

      const isOwnerAdmin = user.role === "admin" && user.email && ownerEmail && user.email.toLowerCase() === ownerEmail.toLowerCase() ? true : false;

      // Generate secure JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          role: user.role
        },
        JWT_SECRET,
        {
          expiresIn: "7d"
        }
      );

      const successDb = loadDb();
      recordAuditEvent(successDb, user.id, user.role, "LOGIN_SUCCESS", "user", user.id, { email });
      saveDb(successDb);

      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isOwnerAdmin,
        token
      });
    } catch (err: any) {
      console.error("Login catch error:", err);
      res.status(500).json({ error: err.message || "Internal server error." });
    }
  });

  app.get("/api/auth/me", authenticateUser, (req: any, res) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    const isOwnerAdmin = req.user.role === "admin" && req.user.email && ownerEmail && req.user.email.toLowerCase() === ownerEmail.toLowerCase() ? true : false;
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isOwnerAdmin
    });
  });

  // Profiles
  app.get("/api/clipper/profile", authenticateUser, (req: any, res) => {
    const db = loadDb();
    const profile = db.clipperProfiles[req.user.id] || {
      userId: req.user.id,
      upiId: "",
      instagramHandle: "",
      youtubeHandle: "",
      kycStatus: "Pending",
      kycDocUrl: "",
      kycAadhaar: "",
      kycPan: ""
    };
    res.json({ user: req.user, profile });
  });

  app.post("/api/clipper/profile", authenticateUser, (req: any, res) => {
    const parsed = clipperProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { upiId, instagramHandle, youtubeHandle, kycAadhaar, kycPan, kycDocUrl } = parsed.data;
    const db = loadDb();
    
    let profile = db.clipperProfiles[req.user.id];
    if (!profile) {
      profile = {
        userId: req.user.id,
        upiId: upiId || "",
        instagramHandle: instagramHandle || "",
        youtubeHandle: youtubeHandle || "",
        kycStatus: "Pending",
        kycDocUrl: kycDocUrl || "",
        kycAadhaar: kycAadhaar ? maskAadhaar(kycAadhaar) : "",
        kycPan: kycPan ? maskPan(kycPan) : ""
      };
      db.clipperProfiles[req.user.id] = profile;
    } else {
      profile.upiId = upiId ?? profile.upiId;
      profile.instagramHandle = instagramHandle ?? profile.instagramHandle;
      profile.youtubeHandle = youtubeHandle ?? profile.youtubeHandle;
      profile.kycAadhaar = kycAadhaar !== undefined && kycAadhaar !== null ? maskAadhaar(kycAadhaar) : profile.kycAadhaar;
      profile.kycPan = kycPan !== undefined && kycPan !== null ? maskPan(kycPan) : profile.kycPan;
      if (kycDocUrl) profile.kycDocUrl = kycDocUrl;
      
      // If updating onboarding first time, set status to Pending
      if (profile.kycStatus === "Rejected") {
        profile.kycStatus = "Pending";
      }
    }
    
    saveDb(db);
    res.json({ message: "Profile updated successfully.", profile });
  });

  app.get("/api/creator/profile", authenticateUser, (req: any, res) => {
    const db = loadDb();
    const profile = db.creatorProfiles[req.user.id] || {
      userId: req.user.id,
      channelUrl: "",
      walletBalance: 0,
    };
    res.json({ user: req.user, profile });
  });

  app.post("/api/creator/profile", authenticateUser, (req: any, res) => {
    const parsed = creatorProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { channelUrl } = parsed.data;
    const db = loadDb();
    
    let profile = db.creatorProfiles[req.user.id];
    if (!profile) {
      profile = {
        userId: req.user.id,
        channelUrl: channelUrl || "",
        walletBalance: 0
      };
      db.creatorProfiles[req.user.id] = profile;
    } else {
      profile.channelUrl = channelUrl ?? profile.channelUrl;
    }
    
    saveDb(db);
    res.json({ message: "Profile updated successfully.", profile });
  });

  // Wallet and Deposits
  app.post("/api/creator/wallet/deposit", authenticateUser, (req: any, res) => {
    const parsed = walletDepositSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const amount = typeof parsed.data.amount === "number" ? parsed.data.amount : parseFloat(parsed.data.amount);
    const paymentId = req.body.paymentId || Math.random().toString(36).substring(2, 9);
    const refId = `deposit-${paymentId}`;

    const db = loadDb();

    // Idempotency check
    if (db.financialLedger) {
      const existing = db.financialLedger.find(e => e.referenceId === refId);
      if (existing) {
        const profile = db.creatorProfiles[req.user.id] || { userId: req.user.id, channelUrl: "", walletBalance: 0 };
        return res.json({ message: "Wallet successfully funded (idempotent).", balance: profile.walletBalance });
      }
    }

    let profile = db.creatorProfiles[req.user.id];
    if (!profile) {
      profile = { userId: req.user.id, channelUrl: "", walletBalance: 0 };
      db.creatorProfiles[req.user.id] = profile;
    }

    profile.walletBalance = Math.round((profile.walletBalance + amount) * 100) / 100;

    const ledgerEntry = recordLedgerEntry(db, {
      referenceId: refId,
      referenceType: "deposit",
      fromAccount: "External (Razorpay)",
      toAccount: `creator_wallet:${req.user.id}`,
      userId: req.user.id,
      amount,
      status: "completed",
      description: `Fund Added via Razorpay (Payment ID: ${paymentId})`
    });

    const transaction: WalletTransaction = {
      id: "tx-" + paymentId,
      userId: req.user.id,
      type: "deposit",
      amount: amount,
      status: "Completed",
      description: `Fund Added via Razorpay Payment Gateway (UPI ID Simulation)`,
      createdAt: ledgerEntry.createdAt
    };

    db.walletHistory.push(transaction);
    saveDb(db);
    res.json({ message: "Wallet successfully funded.", balance: profile.walletBalance, transaction });
  });

  app.get("/api/wallet/history", authenticateUser, (req: any, res) => {
    const db = loadDb();
    const history = db.walletHistory.filter(t => t.userId === req.user.id || (req.user.role === 'admin'));
    res.json(history);
  });

  // --- STEP 4A PAYMENT AND KYC ENDPOINTS ---

  app.post("/api/payments/create-order", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "creator" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only authenticated creators can initiate payment orders." });
    }

    const { amountPaise, currency = "INR" } = req.body;
    if (!amountPaise || typeof amountPaise !== "number" || amountPaise <= 0 || !Number.isInteger(amountPaise)) {
      return res.status(400).json({ error: "Invalid payment amount: amountPaise must be a positive integer representing paise." });
    }

    try {
      const provider = getPaymentProvider();
      const order = await provider.createOrder({
        userId: req.user.id,
        amountPaise,
        currency
      });

      const db = loadDb();
      if (!db.payments) {
        db.payments = [];
      }

      const paymentRecord: PaymentRecord = {
        id: "pay-" + Math.random().toString(36).substring(2, 9),
        provider: process.env.PAYMENT_PROVIDER || "mock",
        provider_order_id: order.id,
        user_id: req.user.id,
        amount_paise: amountPaise,
        currency,
        status: "created",
        verification_attempts: 0,
        created_at: new Date().toISOString()
      };

      db.payments.push(paymentRecord);
      saveDb(db);

      res.status(201).json({
        provider: paymentRecord.provider,
        testMode: paymentRecord.provider === "mock",
        order,
        paymentRecord
      });
    } catch (err: any) {
      console.error("Create order failed:", err);
      res.status(500).json({ error: err.message || "Failed to create payment order." });
    }
  });

  app.post("/api/payments/verify", authenticateUser, async (req: any, res) => {
    const { orderId, paymentId, signature } = req.body;

    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Missing required parameters: orderId, paymentId, and signature are required." });
    }

    const db = loadDb();
    if (!db.payments) db.payments = [];

    const paymentRecord = db.payments.find(p => p.provider_order_id === orderId);
    if (!paymentRecord) {
      return res.status(404).json({ error: "Payment record not found for the specified orderId." });
    }

    if (paymentRecord.user_id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized: This payment order does not belong to you." });
    }

    if (paymentRecord.status === "paid") {
      return res.status(400).json({ error: "Duplicate verification rejected: This payment has already been verified and credited." });
    }

    paymentRecord.verification_attempts += 1;

    try {
      const provider = getPaymentProvider();
      const result = await provider.verifyPayment({
        orderId,
        paymentId,
        signature
      });

      if (!result.success) {
        paymentRecord.status = "failed";
        saveDb(db);
        return res.status(400).json({
          success: false,
          error: result.error || "Payment verification failed",
          provider: paymentRecord.provider,
          testMode: paymentRecord.provider === "mock"
        });
      }

      paymentRecord.status = "paid";
      paymentRecord.provider_payment_id = paymentId;
      paymentRecord.paid_at = new Date().toISOString();

      // Credit creator profile wallet balance
      let profile = db.creatorProfiles[req.user.id];
      if (!profile) {
        profile = { userId: req.user.id, channelUrl: "", walletBalance: 0 };
        db.creatorProfiles[req.user.id] = profile;
      }

      const amountINR = paymentRecord.amount_paise / 100;
      profile.walletBalance = Math.round((profile.walletBalance + amountINR) * 100) / 100;

      // Double-entry financial ledger
      const refId = `payment-verify-${paymentId}`;
      const ledgerEntry = recordLedgerEntry(db, {
        referenceId: refId,
        referenceType: "deposit",
        fromAccount: `External (${paymentRecord.provider})`,
        toAccount: `creator_wallet:${req.user.id}`,
        userId: req.user.id,
        amount: amountINR,
        status: "completed",
        description: `Deposit via Payment Gateway (Order ID: ${orderId}, Payment ID: ${paymentId})`
      });

      // Wallet transaction history
      const transaction: WalletTransaction = {
        id: "tx-" + paymentId,
        userId: req.user.id,
        type: "deposit",
        amount: amountINR,
        status: "Completed",
        description: `Funded via ${paymentRecord.provider} Payment Gateway`,
        createdAt: ledgerEntry.createdAt
      };
      db.walletHistory.push(transaction);

      // Audit event
      recordAuditEvent(db, req.user.id, req.user.role, "PAYMENT_DEPOSIT_SUCCESS", "payment", paymentRecord.id, {
        amountPaise: paymentRecord.amount_paise,
        amountINR,
        orderId,
        paymentId,
        provider: paymentRecord.provider
      });

      saveDb(db);

      res.json({
        success: true,
        provider: paymentRecord.provider,
        testMode: paymentRecord.provider === "mock",
        payment: paymentRecord,
        balance: profile.walletBalance,
        transaction
      });
    } catch (err: any) {
      console.error("Verification error:", err);
      res.status(500).json({ error: err.message || "Internal verification error." });
    }
  });

  app.post("/api/clipper/kyc/initiate", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "clipper") {
      return res.status(403).json({ error: "Only clippers can initiate KYC verification." });
    }

    const db = loadDb();
    let profile = db.clipperProfiles[req.user.id];
    if (!profile) {
      profile = {
        userId: req.user.id,
        upiId: "",
        instagramHandle: "",
        youtubeHandle: "",
        kycStatus: "Pending",
        kycDocUrl: "",
        kycAadhaar: "",
        kycPan: ""
      };
      db.clipperProfiles[req.user.id] = profile;
    }

    try {
      const provider = getKycProvider();
      const kycSession = await provider.createVerification(req.user.id);

      profile.kycReferenceId = kycSession.referenceId;
      profile.kycStatus = kycSession.status as any; // e.g. "Submitted"

      recordAuditEvent(db, req.user.id, req.user.role, "KYC_INITIATED", "user", req.user.id, {
        referenceId: kycSession.referenceId,
        status: kycSession.status
      });

      saveDb(db);

      res.status(201).json({
        success: true,
        provider: process.env.KYC_PROVIDER || "mock",
        testMode: (process.env.KYC_PROVIDER || "mock") === "mock",
        referenceId: kycSession.referenceId,
        status: kycSession.status
      });
    } catch (err: any) {
      console.error("KYC initiate failed:", err);
      res.status(500).json({ error: err.message || "Failed to initiate KYC verification." });
    }
  });

  app.get("/api/clipper/kyc/status", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "clipper") {
      return res.status(403).json({ error: "Only clippers can fetch KYC status." });
    }

    const db = loadDb();
    const profile = db.clipperProfiles[req.user.id];
    if (!profile) {
      return res.status(404).json({ error: "Clipper profile not found." });
    }

    if (!profile.kycReferenceId) {
      return res.json({
        status: profile.kycStatus,
        provider: process.env.KYC_PROVIDER || "mock",
        testMode: (process.env.KYC_PROVIDER || "mock") === "mock"
      });
    }

    try {
      const provider = getKycProvider();
      const statusResult = await provider.getVerificationStatus(profile.kycReferenceId);

      if (profile.kycStatus !== statusResult.status) {
        const oldStatus = profile.kycStatus;
        profile.kycStatus = statusResult.status as any;

        recordAuditEvent(db, req.user.id, req.user.role, "KYC_STATUS_UPDATED", "user", req.user.id, {
          oldStatus,
          newStatus: statusResult.status,
          reason: statusResult.reason
        });

        saveDb(db);
      }

      res.json({
        status: profile.kycStatus,
        reason: statusResult.reason,
        provider: process.env.KYC_PROVIDER || "mock",
        testMode: (process.env.KYC_PROVIDER || "mock") === "mock"
      });
    } catch (err: any) {
      console.error("Get KYC status failed:", err);
      res.status(500).json({ error: err.message || "Failed to fetch KYC verification status." });
    }
  });

  // Campaigns API
  app.get("/api/campaigns", (req, res) => {
    const db = loadDb();
    // Default show Active campaigns unless filtered
    const activeCampaigns = db.campaigns;
    res.json(activeCampaigns);
  });

  app.post("/api/campaigns", authenticateUser, (req: any, res) => {
    if (req.user.role !== "creator" && req.user.role !== "admin") {
      return res.status(403).json({ error: "Only Creators can create campaigns." });
    }
    const parsed = campaignCreationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const { title, sourceVideoUrl, cpm, budget, instructions, platform, minDuration, deadline, iconUrl, campaignType } = parsed.data;

    const db = loadDb();
    const creatorProf = db.creatorProfiles[req.user.id];
    if (!creatorProf || creatorProf.walletBalance < budget) {
      return res.status(400).json({ error: `Insufficient wallet balance. You need ₹${budget}, current balance is ₹${creatorProf?.walletBalance || 0}. Please top-up first!` });
    }

    const campaignId = "campaign-" + Math.random().toString(36).substring(2, 9);
    const refId = `escrow-${campaignId}`;

    // Deduct the budget upfront from wallet for campaign running guarantee
    creatorProf.walletBalance = Math.round((creatorProf.walletBalance - Number(budget)) * 100) / 100;

    const newCampaign: Campaign = {
      id: campaignId,
      creatorId: req.user.id,
      creatorName: req.user.name,
      title,
      sourceVideoUrl,
      cpm: Number(cpm),
      budget: Number(budget),
      spent: 0,
      escrowBalance: Number(budget),
      instructions,
      platform,
      minDuration: Number(minDuration),
      deadline,
      status: "Active",
      createdAt: new Date().toISOString(),
      iconUrl: iconUrl || "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150&auto=format&fit=crop&q=60",
      campaignType: campaignType || "clipping"
    };

    db.campaigns.push(newCampaign);

    // Record to financial ledger
    const ledgerEntry = recordLedgerEntry(db, {
      referenceId: refId,
      referenceType: "escrow_lock",
      fromAccount: `creator_wallet:${req.user.id}`,
      toAccount: `campaign_escrow:${campaignId}`,
      userId: req.user.id,
      campaignId: campaignId,
      amount: Number(budget),
      status: "completed",
      description: `Escrow lock of ₹${budget} for campaign: ${title}`
    });

    // Record traditional wallet deduction transaction
    const transaction: WalletTransaction = {
      id: "tx-" + campaignId,
      userId: req.user.id,
      type: "payment",
      amount: Number(budget),
      status: "Completed",
      description: `Escrow lock of ₹${budget} for campaign: ${title}`,
      createdAt: ledgerEntry.createdAt
    };
    db.walletHistory.push(transaction);

    // Write audit events for creation and funding
    recordAuditEvent(db, req.user.id, req.user.role, "CAMPAIGN_CREATION", "campaign", campaignId, { title, budget });
    recordAuditEvent(db, req.user.id, req.user.role, "CAMPAIGN_FUNDING", "campaign", campaignId, { amount: Number(budget) });

    saveDb(db);
    res.status(201).json({ message: "Campaign launched successfully!", campaign: newCampaign });
  });

  app.put("/api/campaigns/:id", authenticateUser, (req: any, res) => {
    const { id } = req.params;
    const { status, title, instructions, cpm } = req.body;
    const db = loadDb();
    const campaignIndex = db.campaigns.findIndex(c => c.id === id);
    if (campaignIndex === -1) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const campaign = db.campaigns[campaignIndex];
    if (req.user.role !== "admin" && campaign.creatorId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized operation." });
    }

    if (status) {
      const transitionResult = validateCampaignTransition(db, campaign, status, req.user.id, req.user.role);
      if (!transitionResult.allowed) {
        return res.status(400).json({ error: transitionResult.error });
      }

      const oldStatus = campaign.status;
      campaign.status = status;

      recordAuditEvent(db, req.user.id, req.user.role, "CAMPAIGN_STATUS_CHANGE", "campaign", campaign.id, {
        oldStatus,
        newStatus: status
      });

      if (status === "Completed" || status === "Cancelled") {
        refundCampaignEscrow(db, campaign);
        recordAuditEvent(db, req.user.id, req.user.role, "CAMPAIGN_ESCROW_REFUND", "campaign", campaign.id, {
          amount: campaign.escrowBalance || 0
        });
      }
    }
    if (title) campaign.title = title;
    if (instructions) campaign.instructions = instructions;
    if (cpm) campaign.cpm = Number(cpm);

    saveDb(db);
    res.json({ message: "Campaign updated.", campaign });
  });

  app.delete("/api/campaigns/:id", authenticateUser, (req: any, res) => {
    const { id } = req.params;
    const db = loadDb();
    const index = db.campaigns.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    const campaign = db.campaigns[index];
    if (req.user.role !== "admin" && campaign.creatorId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check financial ledger activity
    const hasFinancialActivity = db.financialLedger && db.financialLedger.some(
      e => e.campaignId === id && e.referenceType !== "escrow_lock"
    );
    if (hasFinancialActivity) {
      return res.status(400).json({ error: "Campaign cannot be deleted once it has financial ledger activity. You may cancel it instead." });
    }

    // Refund unused escrow balance traceably and securely using the new ledger
    refundCampaignEscrow(db, campaign);

    recordAuditEvent(db, req.user.id, req.user.role, "CAMPAIGN_DELETION", "campaign", campaign.id, {
      title: campaign.title
    });

    db.campaigns.splice(index, 1);
    saveDb(db);
    res.json({ message: "Campaign deleted and unused budget refunded successfully." });
  });

  // Clipper Submissions
  app.get("/api/submissions/my", authenticateUser, (req: any, res) => {
    const db = loadDb();
    const subs = db.submissions.filter(s => s.clipperId === req.user.id);
    res.json(subs);
  });

  app.get("/api/campaigns/:campaignId/submissions", authenticateUser, (req: any, res) => {
    const { campaignId } = req.params;
    const db = loadDb();
    const subList = db.submissions.filter(s => s.campaignId === campaignId);
    res.json(subList);
  });

  app.post("/api/campaigns/:campaignId/submissions", authenticateUser, (req: any, res) => {
    if (req.user.role !== "clipper") {
      return res.status(403).json({ error: "Only Clippers can make submissions." });
    }

    const { campaignId } = req.params;
    const { submittedUrl } = req.body;

    if (!submittedUrl) {
      return res.status(400).json({ error: "Please enter your public clip URL (Shorts/Reels)." });
    }

    const db = loadDb();
    const clipperProfile = db.clipperProfiles[req.user.id];

    // Fraud protection check - Only KYC Verified clippers can submit
    if (!clipperProfile || clipperProfile.kycStatus !== "Verified") {
      return res.status(403).json({ error: "Fraud Protection: You must complete and pass your KYC Verification under Profile before submitting clips!" });
    }

    const campaign = db.campaigns.find(c => c.id === campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    if (campaign.status !== "Active") {
      return res.status(400).json({ error: "This campaign is no longer active for submissions." });
    }

    // Social URL Validation & Platform Detection
    const urlValidation = validateSubmissionUrl(submittedUrl);
    if (!urlValidation.isValid) {
      return res.status(400).json({ error: urlValidation.error });
    }
    const normalizedUrl = urlValidation.normalizedUrl!;
    const contentId = urlValidation.contentId!;

    // Prevent duplicate submission of the same social content in the same campaign
    const duplicateContent = db.submissions.find(s => {
      if (s.campaignId !== campaignId) return false;
      const existingId = extractContentId(s.submittedUrl);
      return existingId === contentId;
    });
    if (duplicateContent) {
      return res.status(400).json({ error: "Duplicate Submission: This social media video content has already been submitted to this campaign." });
    }

    // Limit to one active submission per clipper per campaign
    const existingActive = db.submissions.find(s => s.campaignId === campaignId && s.clipperId === req.user.id && s.status !== "Rejected" && s.status !== "Suspended");
    if (existingActive) {
      return res.status(400).json({ error: "You already have an active submission for this campaign." });
    }

    // Fraud check on creation
    const fraudResult = analyzeSubmissionCreation(db, req.user.id, normalizedUrl, campaignId);
    if (fraudResult.action === "suspend") {
      return res.status(400).json({ error: `Submission blocked by fraud engine: ${fraudResult.flags.join(", ")}` });
    }

    const subId = "sub-" + Math.random().toString(36).substring(2, 9);
    const newSub: Submission = {
      id: subId,
      campaignId,
      campaignTitle: campaign.title,
      clipperId: req.user.id,
      clipperName: req.user.name,
      submittedUrl: normalizedUrl,
      status: "Submitted",
      views: 0,
      lastFetchedViews: null,
      approvedAt: null,
      createdAt: new Date().toISOString()
    };

    db.submissions.push(newSub);

    // If medium or high risk, record in fraudEvents queue
    if (fraudResult.riskScore >= 30) {
      if (!db.fraudEvents) {
        db.fraudEvents = [];
      }
      db.fraudEvents.push({
        id: "fraud-" + Math.random().toString(36).substring(2, 9),
        submissionId: subId,
        campaignId,
        clipperId: req.user.id,
        riskScore: fraudResult.riskScore,
        riskLevel: fraudResult.riskLevel,
        flags: fraudResult.flags,
        action: fraudResult.action,
        resolved: false,
        createdAt: new Date().toISOString()
      });
      recordAuditEvent(db, req.user.id, req.user.role, "FRAUD_FLAG_RAISED", "submission", subId, {
        riskScore: fraudResult.riskScore,
        flags: fraudResult.flags
      });
    }

    // Audit Event
    recordAuditEvent(db, req.user.id, req.user.role, "SUBMISSION_CREATION", "submission", subId, {
      campaignId,
      submittedUrl: normalizedUrl,
      contentId
    });

    saveDb(db);

    res.status(201).json({ message: "Clip submitted successfully! Waiting for creator approval.", submission: newSub });
  });

  app.post("/api/submissions/:id/review", authenticateUser, (req: any, res) => {
    const { id } = req.params;
    const { status, feedback } = req.body; // Approved / Rejected / UnderReview / Suspended

    if (!status || (status !== "Approved" && status !== "Rejected" && status !== "UnderReview" && status !== "Suspended" && status !== "Submitted")) {
      return res.status(400).json({ error: "Invalid status selection." });
    }

    const db = loadDb();
    const submission = db.submissions.find(s => s.id === id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found." });
    }

    const campaign = db.campaigns.find(c => c.id === submission.campaignId);
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    // Validate transition
    const transition = validateSubmissionTransition(db, submission, status, req.user.id, req.user.role);
    if (!transition.allowed) {
      return res.status(400).json({ error: transition.error });
    }

    const oldStatus = submission.status;
    submission.status = status;
    if (feedback) submission.feedback = feedback;

    if (status === "Approved" && !submission.approvedAt) {
      submission.approvedAt = new Date().toISOString();
      // Start initial mock view views
      submission.views = Math.floor(Math.random() * 50) + 10;
      submission.lastFetchedViews = new Date().toISOString();
    }

    // Audit Event
    recordAuditEvent(db, req.user.id, req.user.role, "SUBMISSION_REVIEW", "submission", submission.id, {
      oldStatus,
      newStatus: status,
      feedback
    });

    saveDb(db);
    res.json({ message: `Submission is successfully updated to ${status}!`, submission });
  });

  // Payout / Withdrawal requests
  app.get("/api/clipper/payouts", authenticateUser, (req: any, res) => {
    const db = loadDb();
    const payouts = db.payoutRequests.filter(p => p.clipperId === req.user.id || req.user.role === "admin");
    res.json(payouts);
  });

  app.post("/api/clipper/payouts", authenticateUser, (req: any, res) => {
    if (req.user.role !== "clipper") {
      return res.status(403).json({ error: "Only clippers can request withdrawals." });
    }

    const parsed = payoutRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const amount = parsed.data.amount;

    const db = loadDb();
    const clipperProfile = db.clipperProfiles[req.user.id];
    if (!clipperProfile || !clipperProfile.upiId) {
      return res.status(400).json({ error: "Please link your UPI ID in your Profile first before requesting withdrawals." });
    }

    const clipperBalance = getDerivedClipperBalance(db, req.user.id);
    const availableBalance = clipperBalance.availableBalance;

    if (amount > availableBalance) {
      return res.status(400).json({ error: `Insufficient earnings balance. Available is ₹${availableBalance.toFixed(2)}. Tried withdrawing ₹${amount}.` });
    }

    const payoutId = "payout-" + Math.random().toString(36).substring(2, 9);
    const refId = `payout-request-${payoutId}`;

    const newRequest: PayoutRequest = {
      id: payoutId,
      clipperId: req.user.id,
      clipperName: req.user.name,
      upiId: clipperProfile.upiId,
      amount: Number(amount),
      status: "Processing",
      createdAt: new Date().toISOString()
    };

    db.payoutRequests.push(newRequest);

    // Record withdrawal request to financial ledger (starts as pending)
    recordLedgerEntry(db, {
      referenceId: refId,
      referenceType: "withdrawal_request",
      fromAccount: `clipper_earnings:${req.user.id}`,
      toAccount: `clipper_pending_withdrawal:${req.user.id}`,
      userId: req.user.id,
      amount: Number(amount),
      status: "pending",
      description: `Withdrawal request to UPI: ${clipperProfile.upiId}`
    });

    saveDb(db);

    res.status(201).json({ message: "Withdrawal request submitted! Send to Admin for processing.", request: newRequest });
  });

  // Admin Queue Actions
  app.get("/api/admin/users", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    const enrichedUsers = db.users.map(u => {
      const clipperProfile = db.clipperProfiles[u.id] || null;
      const creatorProfile = db.creatorProfiles[u.id] || null;
      const submissions = db.submissions.filter(s => s.clipperId === u.id);
      const campaigns = db.campaigns.filter(c => c.creatorId === u.id);
      const walletHistory = db.walletHistory.filter(w => w.userId === u.id);
      return {
        ...u,
        clipperProfile,
        creatorProfile,
        submissions,
        campaigns,
        walletHistory
      };
    });
    res.json(enrichedUsers);
  });

  app.post("/api/admin/users/:userId/status", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const { userId } = req.params;
    const { status, durationDays, reason } = req.body; // status: "active", "suspended", "banned"

    const db = loadDb();
    const targetedUser = db.users.find(u => u.id === userId);
    if (!targetedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    if (targetedUser.role === "admin") {
      return res.status(400).json({ error: "Cannot suspend/ban other Administrators." });
    }

    targetedUser.status = status;
    targetedUser.statusReason = reason || "";

    if (status === "suspended") {
      const untilDate = new Date();
      if (durationDays === "permanent") {
        targetedUser.status = "banned";
        targetedUser.statusUntil = null;
      } else {
        const days = Number(durationDays);
        if (isNaN(days) || days <= 0) {
          return res.status(400).json({ error: "Invalid duration days value." });
        }
        untilDate.setDate(untilDate.getDate() + days);
        targetedUser.statusUntil = untilDate.toISOString();
      }
    } else if (status === "banned") {
      targetedUser.statusUntil = null;
    } else {
      targetedUser.statusUntil = null;
      targetedUser.status = "active";
    }

    saveDb(db);
    res.json({ message: `User status successfully updated to ${status}.`, user: targetedUser });
  });

  app.post("/api/admin/kyc/:userId", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const { userId } = req.params;
    const { status } = req.body; // Verified or Rejected

    const db = loadDb();
    const profile = db.clipperProfiles[userId];
    if (!profile) {
      return res.status(404).json({ error: "Clipper profile not found." });
    }

    profile.kycStatus = status;
    saveDb(db);
    res.json({ message: `Clipper KYC is successfully updated to ${status}.`, profile });
  });

  app.post("/api/admin/payouts/:payoutId", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const { payoutId } = req.params;
    const { status } = req.body; // Completed or Failed

    if (status !== "Completed" && status !== "Failed") {
      return res.status(400).json({ error: "Invalid status option. Must be 'Completed' or 'Failed'." });
    }

    const db = loadDb();
    const payout = db.payoutRequests.find(p => p.id === payoutId);
    if (!payout) {
      return res.status(404).json({ error: "Payout request not found." });
    }

    if (payout.status !== "Processing") {
      return res.status(400).json({ error: "Payout request has already been processed." });
    }

    payout.status = status;

    // Retrieve the original pending withdrawal request ledger entry
    const originalLedgerEntry = db.financialLedger ? db.financialLedger.find(
      e => e.referenceId === `payout-request-${payoutId}`
    ) : null;

    if (status === "Completed") {
      if (originalLedgerEntry) {
        originalLedgerEntry.status = "completed";
      }

      // Record withdrawal completed ledger entry
      recordLedgerEntry(db, {
        referenceId: `payout-complete-${payoutId}`,
        referenceType: "withdrawal_completed",
        fromAccount: `clipper_pending_withdrawal:${payout.clipperId}`,
        toAccount: "External (UPI)",
        userId: payout.clipperId,
        amount: payout.amount,
        status: "completed",
        description: `Withdrawal completed to UPI: ${payout.upiId}`
      });

      // Log wallet transaction for compatibility
      db.walletHistory.push({
        id: "tx-" + Math.random().toString(36).substring(2, 9),
        userId: payout.clipperId,
        type: "withdrawal",
        amount: payout.amount,
        status: "Completed",
        description: `Withdrawn to UPI: ${payout.upiId}`,
        createdAt: new Date().toISOString()
      });
    } else if (status === "Failed") {
      if (originalLedgerEntry) {
        originalLedgerEntry.status = "reversed";
      }

      // Record withdrawal failed ledger entry
      recordLedgerEntry(db, {
        referenceId: `payout-failed-${payoutId}`,
        referenceType: "withdrawal_failed",
        fromAccount: `clipper_pending_withdrawal:${payout.clipperId}`,
        toAccount: `clipper_earnings:${payout.clipperId}`,
        userId: payout.clipperId,
        amount: payout.amount,
        status: "completed",
        description: `Withdrawal failed. Refunded to available balance.`
      });

      // Log wallet transaction for compatibility
      db.walletHistory.push({
        id: "tx-" + Math.random().toString(36).substring(2, 9),
        userId: payout.clipperId,
        type: "deposit",
        amount: payout.amount,
        status: "Completed",
        description: `Withdrawn request failed. Refunded to available balance.`,
        createdAt: new Date().toISOString()
      });
    }

    // Force sync balance cache
    syncClipperBalanceCache(db, payout.clipperId);

    saveDb(db);
    res.json({ message: `Payout request marked as ${status}.`, payout });
  });

  app.get("/api/admin/audit-events", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    let events = db.auditEvents || [];

    const { userId, action, entityType, entityId, limit } = req.query;

    if (userId) {
      events = events.filter(e => e.actorUserId === userId);
    }
    if (action) {
      events = events.filter(e => e.action === action);
    }
    if (entityType) {
      events = events.filter(e => e.entityType === entityType);
    }
    if (entityId) {
      events = events.filter(e => e.entityId === entityId);
    }

    // Sort by createdAt desc
    events = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const limitNum = limit ? parseInt(limit as string, 10) : 100;
    res.json(events.slice(0, limitNum));
  });

  app.get("/api/admin/fraud/queue", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    const queue = db.fraudEvents || [];
    res.json(queue);
  });

  app.post("/api/admin/fraud/:id/resolve", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const { id } = req.params;
    const { action, notes } = req.body; // "approve" | "dismiss" | "suspend"

    if (!action || (action !== "approve" && action !== "dismiss" && action !== "suspend")) {
      return res.status(400).json({ error: "Invalid action. Must be 'approve', 'dismiss' or 'suspend'." });
    }

    const db = loadDb();
    if (!db.fraudEvents) {
      db.fraudEvents = [];
    }

    const event = db.fraudEvents.find(e => e.id === id);
    if (!event) {
      return res.status(404).json({ error: "Fraud event not found." });
    }

    event.resolved = true;
    event.resolvedAction = action;
    event.resolvedNotes = notes || "";
    event.resolvedAt = new Date().toISOString();
    event.resolvedBy = req.user.id;

    const sub = db.submissions.find(s => s.id === event.submissionId);
    if (sub) {
      if (action === "suspend") {
        sub.status = "Suspended";
      } else if (action === "approve") {
        sub.status = "Approved";
      } else if (action === "dismiss") {
        if (sub.status === "Suspended") {
          sub.status = "Approved";
        }
      }
    }

    // Audit Event
    recordAuditEvent(db, req.user.id, req.user.role, "FRAUD_RESOLUTION", "submission", event.submissionId, {
      fraudEventId: id,
      action,
      notes
    });

    saveDb(db);
    res.json({ message: "Fraud event successfully resolved.", event, submission: sub });
  });

  // VIEW TRACKING ENGINE (Manual Trigger or automatic increment)
  function processViewPayout(
    db: DbSchema,
    subId: string,
    addedViews: number,
    isBotRisk: boolean = false,
    batchId: string = Math.random().toString(36).substring(2, 9)
  ): { success: boolean; grossAmount?: number; error?: string } {
    const sub = db.submissions.find(s => s.id === subId);
    if (!sub) {
      return { success: false, error: "Submission not found" };
    }

    if (sub.status !== "Approved") {
      return { success: false, error: `Submission is not approved (Current: ${sub.status})` };
    }

    // Reject negative view deltas
    if (addedViews < 0) {
      return { success: false, error: "Negative view delta rejected" };
    }

    // Idempotency check: if a ledger entry with referenceId ending in -${batchId} already exists, it is a duplicate!
    if (db.financialLedger && db.financialLedger.some(e => e.referenceId.endsWith(`-${batchId}`))) {
      return { success: false, error: "Payout transaction already processed" };
    }

    const campaign = db.campaigns.find(c => c.id === sub.campaignId);
    if (!campaign) {
      return { success: false, error: "Campaign not found" };
    }

    if (campaign.status !== "Active") {
      return { success: false, error: "Campaign is not active" };
    }

    const remainingBudget = campaign.escrowBalance || 0;
    if (remainingBudget <= 0) {
      campaign.status = "Completed";
      return { success: false, error: "Campaign escrow budget fully spent" };
    }

    const previousPaidViews = db.viewPayoutEvents ? db.viewPayoutEvents.filter(e => e.submissionId === sub.id).reduce((sum, e) => sum + e.verifiedViews, 0) : 0;

    // Never pay twice for the same verified views / duplicate verification check
    const isDoublePay = db.viewPayoutEvents && db.viewPayoutEvents.some(
      e => e.submissionId === sub.id && e.previousViews === previousPaidViews && e.verifiedViews === addedViews && addedViews > 0
    );
    if (isDoublePay) {
      return { success: false, error: "Duplicate verification event detected. Views already paid." };
    }

    // Run fraud analysis
    const fraudResult = analyzeViewUpdate(db, subId, addedViews, previousPaidViews);

    if (fraudResult.action === "suspend") {
      sub.status = "Suspended";
      if (!db.fraudEvents) db.fraudEvents = [];
      db.fraudEvents.push({
        id: "fraud-" + Math.random().toString(36).substring(2, 9),
        submissionId: sub.id,
        campaignId: campaign.id,
        clipperId: sub.clipperId,
        riskScore: fraudResult.riskScore,
        riskLevel: fraudResult.riskLevel,
        flags: fraudResult.flags,
        action: "suspend",
        resolved: false,
        createdAt: new Date().toISOString()
      });
      recordAuditEvent(db, undefined, undefined, "FRAUD_CRITICAL_SUSPENDED", "submission", sub.id, {
        riskScore: fraudResult.riskScore,
        flags: fraudResult.flags
      });
      return { success: false, error: `Critical fraud level: ${fraudResult.flags.join(", ")}. Submission suspended.` };
    }

    if (fraudResult.riskLevel === "high") {
      if (!db.fraudEvents) db.fraudEvents = [];
      db.fraudEvents.push({
        id: "fraud-" + Math.random().toString(36).substring(2, 9),
        submissionId: sub.id,
        campaignId: campaign.id,
        clipperId: sub.clipperId,
        riskScore: fraudResult.riskScore,
        riskLevel: fraudResult.riskLevel,
        flags: fraudResult.flags,
        action: "review",
        resolved: false,
        createdAt: new Date().toISOString()
      });
      recordAuditEvent(db, undefined, undefined, "FRAUD_HIGH_RISK_PAUSED", "submission", sub.id, {
        riskScore: fraudResult.riskScore,
        flags: fraudResult.flags
      });
      return { success: false, error: "High risk fraud flagged, payout paused for review." };
    }

    if (fraudResult.riskLevel === "medium") {
      if (!db.fraudEvents) db.fraudEvents = [];
      db.fraudEvents.push({
        id: "fraud-" + Math.random().toString(36).substring(2, 9),
        submissionId: sub.id,
        campaignId: campaign.id,
        clipperId: sub.clipperId,
        riskScore: fraudResult.riskScore,
        riskLevel: fraudResult.riskLevel,
        flags: fraudResult.flags,
        action: "allow",
        resolved: false,
        createdAt: new Date().toISOString()
      });
      recordAuditEvent(db, undefined, undefined, "FRAUD_MEDIUM_RISK_FLAGGED", "submission", sub.id, {
        riskScore: fraudResult.riskScore,
        flags: fraudResult.flags
      });
    }

    const creatorCost = (addedViews / 1000) * campaign.cpm;
    const finalCost = Math.min(creatorCost, remainingBudget);
    
    const finalAddedViews = Math.round((finalCost / campaign.cpm) * 1000);
    const roundedCost = Math.round(finalCost * 100) / 100;

    if (roundedCost <= 0) {
      return { success: false, error: "Payout amount is too small or zero" };
    }
    
    // Distribute earnings: 80% to Clipper, 20% to Platform
    const clipperShare = Math.round(roundedCost * 0.8 * 100) / 100;
    const platformFee = Math.round((roundedCost - clipperShare) * 100) / 100;

    const clipperRefId = `view-payout-clipper-${sub.id}-${previousPaidViews}-${sub.views + finalAddedViews}-${batchId}`;
    const platformRefId = `view-payout-platform-${sub.id}-${previousPaidViews}-${sub.views + finalAddedViews}-${batchId}`;

    // Record to financial ledger (Clipper Share)
    recordLedgerEntry(db, {
      referenceId: clipperRefId,
      referenceType: "clipper_earning",
      fromAccount: `campaign_escrow:${campaign.id}`,
      toAccount: `clipper_earnings:${sub.clipperId}`,
      userId: sub.clipperId,
      campaignId: campaign.id,
      submissionId: sub.id,
      amount: clipperShare,
      status: "completed",
      description: `Payout for ${sub.clipperName} views (+${finalAddedViews} views)`
    });

    // Record to financial ledger (Platform Fee)
    recordLedgerEntry(db, {
      referenceId: platformRefId,
      referenceType: "platform_fee",
      fromAccount: `campaign_escrow:${campaign.id}`,
      toAccount: "QUOR Platform",
      campaignId: campaign.id,
      submissionId: sub.id,
      amount: platformFee,
      status: "completed",
      description: `Platform commission 20% for ${sub.clipperName} views`
    });

    // Log ViewPayoutEvent
    if (!db.viewPayoutEvents) {
      db.viewPayoutEvents = [];
    }
    db.viewPayoutEvents.push({
      submissionId: sub.id,
      previousViews: previousPaidViews,
      newViews: sub.views + finalAddedViews,
      verifiedViews: finalAddedViews,
      grossAmount: roundedCost,
      clipperAmount: clipperShare,
      platformAmount: platformFee,
      processedAt: new Date().toISOString()
    });

    sub.views += finalAddedViews;
    sub.lastFetchedViews = new Date().toISOString();
    
    campaign.escrowBalance = Math.round((campaign.escrowBalance - roundedCost) * 100) / 100;
    campaign.spent = Math.round((campaign.spent + roundedCost) * 100) / 100;

    if (campaign.escrowBalance <= 0) {
      campaign.status = "Completed";
    }

    // If bot detection happens, we still register but we can label it or flag it
    let desc = `Payout for ${sub.clipperName} views (+${finalAddedViews} views)`;
    if (isBotRisk) {
      desc += " - [FLAGGED: Unusually High Velocity detected - Fraud check triggered]";
    }

    // Record wallet payout transaction on creator for compatibility
    db.walletHistory.push({
      id: "tx-" + batchId,
      userId: campaign.creatorId,
      type: "payment",
      amount: roundedCost,
      status: "Completed",
      description: desc,
      createdAt: new Date().toISOString()
    });

    // View verification Audit Event
    recordAuditEvent(db, undefined, undefined, "VIEW_VERIFICATION", "submission", sub.id, {
      previousViews: previousPaidViews,
      addedViews: finalAddedViews,
      newViews: sub.views,
      grossAmount: roundedCost,
      riskLevel: fraudResult.riskLevel
    });

    return { success: true, grossAmount: roundedCost };
  }

  const executeViewTracking = () => {
    const db = loadDb();
    let updatedCount = 0;
    
    db.submissions.forEach(sub => {
      if (sub.status === "Approved") {
        const campaign = db.campaigns.find(c => c.id === sub.campaignId);
        if (campaign && campaign.status === "Active") {
          const isBotRisk = Math.random() < 0.05; // 5% chance
          const addedViews = isBotRisk ? 42000 : Math.floor(Math.random() * 1500) + 300;
          
          const result = processViewPayout(db, sub.id, addedViews, isBotRisk);
          if (result.success) {
            updatedCount++;
          }
        }
      }
    });

    if (updatedCount > 0) {
      saveDb(db);
    }
    return updatedCount;
  };

  app.post("/api/cron/track-views", (req, res) => {
    const ticks = executeViewTracking();
    res.json({ message: "View tracking cron run successful.", updatedClipsCount: ticks });
  });

  // Submit Contact Form Secure Ticket
  app.post("/api/contact", (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "Missing required contact form fields." });
    }
    const db = loadDb();
    if (!db.contacts) {
      db.contacts = [];
    }
    const ticketId = "TRV-" + Math.floor(Math.random() * 900000 + 100000);
    const newContact: ContactMessage = {
      id: ticketId,
      name,
      email,
      subject: subject || "General Inquiry",
      message,
      createdAt: new Date().toISOString()
    };
    db.contacts.push(newContact);
    saveDb(db);
    res.status(201).json({ success: true, ticketId, contact: newContact });
  });

  // Admin Financial Dashboard Endpoints
  app.get("/api/admin/finance/overview", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    
    const ledger = db.financialLedger || [];
    
    // 1. Total Deposits (completed "deposit" entries)
    const totalDeposits = ledger
      .filter(e => e.referenceType === "deposit" && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0);
      
    // 2. Total Escrow Locked (completed "escrow_lock" entries)
    const totalEscrowLocked = ledger
      .filter(e => e.referenceType === "escrow_lock" && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0);

    // 3. Total Escrow Released / Paid (completed "clipper_earning" + "platform_fee")
    const totalEscrowReleased = ledger
      .filter(e => (e.referenceType === "clipper_earning" || e.referenceType === "platform_fee") && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0);

    // 4. Total Platform Fees Earned (completed "platform_fee")
    const totalPlatformFees = ledger
      .filter(e => e.referenceType === "platform_fee" && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0);

    // 5. Total Withdrawals Completed (completed "withdrawal_completed")
    const totalWithdrawalsCompleted = ledger
      .filter(e => e.referenceType === "withdrawal_completed" && e.status === "completed")
      .reduce((sum, e) => sum + e.amount, 0);

    // 6. Total Pending Withdrawals (pending "withdrawal_request")
    const totalPendingWithdrawals = ledger
      .filter(e => e.referenceType === "withdrawal_request" && e.status === "pending")
      .reduce((sum, e) => sum + e.amount, 0);

    // 7. Reconstructed system balances
    const creatorWallets = Object.values(db.creatorProfiles).reduce((sum, p) => sum + (p.walletBalance || 0), 0);
    const campaignEscrows = db.campaigns.reduce((sum, c) => sum + (c.escrowBalance || 0), 0);
    
    const clipperUserIds = db.users.filter(u => u.role === "clipper").map(u => u.id);
    let clipperBalancesSum = 0;
    for (const cid of clipperUserIds) {
      const bal = getDerivedClipperBalance(db, cid);
      clipperBalancesSum += bal.availableBalance;
    }

    // Double-Entry Equation Check:
    // Assets (Total Deposits - Total Withdrawals) should equal Liabilities + Equity (Creator Wallets + Escrow Balances + Clipper Balances + Platform Earnings + Pending Withdrawals)
    const netAssets = totalDeposits - totalWithdrawalsCompleted;
    const netLiabilitiesAndEquity = creatorWallets + campaignEscrows + clipperBalancesSum + totalPlatformFees + totalPendingWithdrawals;
    const balanceDifference = Math.abs(netAssets - netLiabilitiesAndEquity);
    const isBalanced = balanceDifference < 1.0; // Allow 1 Rupee for minor rounding deviations

    res.json({
      overview: {
        totalDeposits: Math.round(totalDeposits * 100) / 100,
        totalEscrowLocked: Math.round(totalEscrowLocked * 100) / 100,
        totalEscrowReleased: Math.round(totalEscrowReleased * 100) / 100,
        totalPlatformFees: Math.round(totalPlatformFees * 100) / 100,
        totalWithdrawalsCompleted: Math.round(totalWithdrawalsCompleted * 100) / 100,
        totalPendingWithdrawals: Math.round(totalPendingWithdrawals * 100) / 100,
      },
      systemSanity: {
        netAssets: Math.round(netAssets * 100) / 100,
        creatorWallets: Math.round(creatorWallets * 100) / 100,
        campaignEscrows: Math.round(campaignEscrows * 100) / 100,
        clipperAvailableBalances: Math.round(clipperBalancesSum * 100) / 100,
        platformFees: Math.round(totalPlatformFees * 100) / 100,
        pendingWithdrawals: Math.round(totalPendingWithdrawals * 100) / 100,
        balanceDifference: Math.round(balanceDifference * 100) / 100,
        isBalanced
      }
    });
  });

  app.get("/api/admin/finance/ledger", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    const ledger = db.financialLedger || [];
    // Sort by descending createdAt time
    const sorted = [...ledger].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(sorted);
  });

  app.get("/api/admin/finance/pending-payouts", authenticateUser, requireOwnerAdmin, (req: any, res) => {
    const db = loadDb();
    const pending = db.payoutRequests.filter(p => p.status === "Processing");
    res.json(pending);
  });

  // System stats API for Admin & landing page counts
  app.get("/api/platform/stats", (req, res) => {
    const db = loadDb();
    
    // Count platform stats
    const totalViews = db.submissions.filter(s => s.status === 'Approved').reduce((acc, current) => acc + current.views, 0);
    const totalSpend = db.campaigns.reduce((acc, curr) => acc + curr.spent, 0);
    
    // Platform keeps 20% of CPM payout
    const platformEarningsShare = totalSpend * 0.20;

    res.json({
      clippersCount: db.users.filter(u => u.role === 'clipper').length,
      creatorsCount: db.users.filter(u => u.role === 'creator').length,
      campaignsCount: db.campaigns.length,
      activeCampaignsCount: db.campaigns.filter(c => c.status === 'Active').length,
      submissionsCount: db.submissions.length,
      totalViews,
      totalSpend,
      platformEarnings: platformEarningsShare,
      pendingPayoutsCount: db.payoutRequests.filter(p => p.status === 'Processing').length,
      pendingKycCount: Object.values(db.clipperProfiles).filter(p => p.kycStatus === 'Pending').length
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QUOR server running on port ${PORT}`);
  });
};

startServer().catch(err => {
  console.error("Critical server failure", err);
});
