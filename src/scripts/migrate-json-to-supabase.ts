import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const FILE_PATH = path.join(process.cwd(), "database.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Cannot run migration.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`Local database file ${FILE_PATH} not found.`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));

  let usersMigrated = 0;
  let campaignsMigrated = 0;
  let submissionsMigrated = 0;
  let paymentsMigrated = 0;
  let ledgerEntriesMigrated = 0;
  let auditEventsMigrated = 0;
  let errorsCount = 0;
  let duplicatesSkipped = 0;

  const validUserIds = new Set<string>();
  const validCampaignIds = new Set<string>();
  const validSubmissionIds = new Set<string>();

  // 1. Migrate Users
  const emailsProcessed = new Set<string>();
  if (db.users && Array.isArray(db.users)) {
    for (const u of db.users) {
      const emailLower = u.email.toLowerCase();
      if (emailsProcessed.has(emailLower)) {
        duplicatesSkipped++;
        continue;
      }
      emailsProcessed.add(emailLower);

      try {
        const { error } = await supabase.from("users").upsert({
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          status: u.status || "active",
          status_reason: u.statusReason || "",
          status_until: u.statusUntil || null,
          created_at: u.createdAt || new Date().toISOString()
        }, { onConflict: "email" });

        if (error) {
          console.error(`Error migrating user ${u.email}:`, error.message);
          errorsCount++;
        } else {
          validUserIds.add(u.id);
          usersMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating user ${u.email}:`, e);
        errorsCount++;
      }
    }
  }

  // Helper to check user existence
  const hasUser = (id: string) => validUserIds.has(id);

  // 1A. Migrate Clipper Profiles
  if (db.clipperProfiles) {
    for (const [userId, cp] of Object.entries(db.clipperProfiles) as any) {
      if (!hasUser(userId)) {
        console.warn(`Orphaned clipper profile skipped for user: ${userId}`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("clipper_profiles").upsert({
          user_id: userId,
          upi_id: cp.upiId || "",
          instagram_handle: cp.instagramHandle || "",
          youtube_handle: cp.youtubeHandle || "",
          kyc_status: cp.kycStatus || "Pending",
          kyc_doc_url: cp.kycDocUrl || "",
          kyc_aadhaar: cp.kycAadhaar || "",
          kyc_pan: cp.kycPan || "",
          kyc_reference_id: cp.kycReferenceId || ""
        }, { onConflict: "user_id" });
        if (error) {
          console.error(`Error migrating clipper profile ${userId}:`, error.message);
          errorsCount++;
        }
      } catch (e: any) {
        console.error(`Exception migrating clipper profile ${userId}:`, e);
        errorsCount++;
      }
    }
  }

  // 1B. Migrate Creator Profiles
  if (db.creatorProfiles) {
    for (const [userId, cr] of Object.entries(db.creatorProfiles) as any) {
      if (!hasUser(userId)) {
        console.warn(`Orphaned creator profile skipped for user: ${userId}`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("creator_profiles").upsert({
          user_id: userId,
          channel_url: cr.channelUrl || "",
          wallet_balance: Math.round((cr.walletBalance || 0) * 100) // Convert to paise
        }, { onConflict: "user_id" });
        if (error) {
          console.error(`Error migrating creator profile ${userId}:`, error.message);
          errorsCount++;
        }
      } catch (e: any) {
        console.error(`Exception migrating creator profile ${userId}:`, e);
        errorsCount++;
      }
    }
  }

  // 2. Migrate Campaigns
  if (db.campaigns && Array.isArray(db.campaigns)) {
    for (const c of db.campaigns) {
      if (!hasUser(c.creatorId)) {
        console.warn(`Orphaned campaign ${c.id} skipped (no user ${c.creatorId})`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("campaigns").upsert({
          id: c.id,
          creator_id: c.creatorId,
          creator_name: c.creatorName,
          title: c.title,
          source_video_url: c.sourceVideoUrl,
          cpm: Math.round(c.cpm * 100),
          budget: Math.round(c.budget * 100),
          spent: Math.round((c.spent || 0) * 100),
          escrow_balance: Math.round((c.escrowBalance !== undefined ? c.escrowBalance : c.budget) * 100),
          instructions: c.instructions || "",
          platform: c.platform,
          min_duration: c.minDuration || 0,
          deadline: c.deadline,
          status: c.status,
          icon_url: c.iconUrl || null,
          campaign_type: c.campaignType || "clipping",
          created_at: c.createdAt || new Date().toISOString()
        }, { onConflict: "id" });

        if (error) {
          console.error(`Error migrating campaign ${c.id}:`, error.message);
          errorsCount++;
        } else {
          validCampaignIds.add(c.id);
          campaignsMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating campaign ${c.id}:`, e);
        errorsCount++;
      }
    }
  }

  // Helper check for campaign
  const hasCampaign = (id: string) => validCampaignIds.has(id);

  // 3. Migrate Submissions
  if (db.submissions && Array.isArray(db.submissions)) {
    for (const s of db.submissions) {
      if (!hasCampaign(s.campaignId)) {
        console.warn(`Orphaned submission ${s.id} skipped (no campaign ${s.campaignId})`);
        errorsCount++;
        continue;
      }
      if (!hasUser(s.clipperId)) {
        console.warn(`Orphaned submission ${s.id} skipped (no clipper ${s.clipperId})`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("submissions").upsert({
          id: s.id,
          campaign_id: s.campaignId,
          campaign_title: s.campaignTitle,
          clipper_id: s.clipperId,
          clipper_name: s.clipperName,
          submitted_url: s.submittedUrl,
          status: s.status,
          feedback: s.feedback || "",
          approved_at: s.approvedAt || null,
          views: s.views || 0,
          last_fetched_views: s.lastFetchedViews || null
        }, { onConflict: "id" });

        if (error) {
          console.error(`Error migrating submission ${s.id}:`, error.message);
          errorsCount++;
        } else {
          validSubmissionIds.add(s.id);
          submissionsMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating submission ${s.id}:`, e);
        errorsCount++;
      }
    }
  }

  const hasSubmission = (id: string) => validSubmissionIds.has(id);

  // 4. Migrate Payments
  if (db.payments && Array.isArray(db.payments)) {
    for (const p of db.payments) {
      if (!hasUser(p.user_id)) {
        console.warn(`Orphaned payment ${p.id} skipped (no user ${p.user_id})`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("payments").upsert({
          id: p.id,
          provider: p.provider,
          provider_order_id: p.provider_order_id,
          provider_payment_id: p.provider_payment_id || null,
          user_id: p.user_id,
          amount_paise: p.amount_paise,
          currency: p.currency || "INR",
          status: p.status,
          verification_attempts: p.verification_attempts || 0,
          created_at: p.created_at || new Date().toISOString(),
          paid_at: p.paid_at || null,
          metadata: p.metadata || null
        }, { onConflict: "provider_order_id" });

        if (error) {
          console.error(`Error migrating payment ${p.id}:`, error.message);
          errorsCount++;
        } else {
          paymentsMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating payment ${p.id}:`, e);
        errorsCount++;
      }
    }
  }

  // 5. Migrate Ledger Entries
  if (db.financialLedger && Array.isArray(db.financialLedger)) {
    for (const l of db.financialLedger) {
      if (l.userId && !hasUser(l.userId)) {
        console.warn(`Orphaned ledger entry ${l.id} skipped (no user ${l.userId})`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("financial_ledger").upsert({
          id: l.id,
          reference_id: l.referenceId,
          reference_type: l.referenceType,
          from_account: l.fromAccount,
          to_account: l.toAccount,
          user_id: l.userId,
          amount: Math.round(l.amount * 100), // convert to paise
          status: l.status,
          description: l.description || "",
          created_at: l.createdAt || new Date().toISOString()
        }, { onConflict: "id" });

        if (error) {
          console.error(`Error migrating ledger entry ${l.id}:`, error.message);
          errorsCount++;
        } else {
          ledgerEntriesMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating ledger entry ${l.id}:`, e);
        errorsCount++;
      }
    }
  }

  // 6. Migrate Audit Events
  if (db.auditEvents && Array.isArray(db.auditEvents)) {
    for (const a of db.auditEvents) {
      if (a.actorUserId && !hasUser(a.actorUserId)) {
        console.warn(`Orphaned audit event ${a.id} skipped (no actor ${a.actorUserId})`);
        errorsCount++;
        continue;
      }
      try {
        const { error } = await supabase.from("audit_events").upsert({
          id: a.id,
          actor_user_id: a.actorUserId,
          actor_role: a.actorRole,
          action: a.action,
          entity_type: a.entityType,
          entity_id: a.entityId,
          metadata: a.metadata || null,
          created_at: a.createdAt || new Date().toISOString()
        }, { onConflict: "id" });

        if (error) {
          console.error(`Error migrating audit event ${a.id}:`, error.message);
          errorsCount++;
        } else {
          auditEventsMigrated++;
        }
      } catch (e: any) {
        console.error(`Exception migrating audit event ${a.id}:`, e);
        errorsCount++;
      }
    }
  }

  // 7. Migrate Wallet History (For completeness)
  if (db.walletHistory && Array.isArray(db.walletHistory)) {
    for (const wh of db.walletHistory) {
      if (!hasUser(wh.userId)) continue;
      try {
        await supabase.from("wallet_history").upsert({
          id: wh.id,
          user_id: wh.userId,
          type: wh.type,
          amount: Math.round(wh.amount * 100),
          status: wh.status,
          description: wh.description || "",
          created_at: wh.createdAt || new Date().toISOString()
        }, { onConflict: "id" });
      } catch (e) {
        // ignore soft errors
      }
    }
  }

  // 8. Migrate Payout Requests (For completeness)
  if (db.payoutRequests && Array.isArray(db.payoutRequests)) {
    for (const pr of db.payoutRequests) {
      if (!hasUser(pr.clipperId)) continue;
      try {
        await supabase.from("payout_requests").upsert({
          id: pr.id,
          clipper_id: pr.clipperId,
          clipper_name: pr.clipperName,
          upi_id: pr.upiId,
          amount: Math.round(pr.amount * 100),
          status: pr.status,
          created_at: pr.createdAt || new Date().toISOString()
        }, { onConflict: "id" });
      } catch (e) {
        // ignore soft errors
      }
    }
  }

  // 9. Migrate Fraud Events
  if (db.fraudEvents && Array.isArray(db.fraudEvents)) {
    for (const fe of db.fraudEvents) {
      if (!hasSubmission(fe.submissionId) || !hasUser(fe.clipperId)) continue;
      try {
        await supabase.from("fraud_events").upsert({
          id: fe.id,
          submission_id: fe.submissionId,
          clipper_id: fe.clipperId,
          reason: fe.reason || fe.flags?.join(", ") || "Unknown",
          severity: fe.riskLevel || "medium",
          resolved: fe.resolved || false,
          created_at: fe.createdAt || new Date().toISOString()
        }, { onConflict: "id" });
      } catch (e) {
        // ignore soft errors
      }
    }
  }

  // Print migration report
  console.log("=========================================");
  console.log("             MIGRATION REPORT            ");
  console.log("=========================================");
  console.log(`Users migrated: ${usersMigrated}`);
  console.log(`Campaigns migrated: ${campaignsMigrated}`);
  console.log(`Submissions migrated: ${submissionsMigrated}`);
  console.log(`Payments migrated: ${paymentsMigrated}`);
  console.log(`Ledger entries migrated: ${ledgerEntriesMigrated}`);
  console.log(`Audit events migrated: ${auditEventsMigrated}`);
  console.log(`Errors: ${errorsCount}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}`);
  console.log("=========================================");
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
