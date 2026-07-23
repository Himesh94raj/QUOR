import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { Submission } from "../types.js";

const mapRowToSubmission = (row: any): Submission => {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    clipperId: row.clipper_id,
    clipperName: row.clipper_name,
    submittedUrl: row.submitted_url,
    status: row.status,
    feedback: row.feedback || undefined,
    approvedAt: row.approved_at,
    views: row.views,
    lastFetchedViews: row.last_fetched_views,
    createdAt: row.created_at || new Date().toISOString()
  };
};

export const submissionRepository = {
  async findById(id: string): Promise<Submission | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("submissions").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRowToSubmission(data);
    } else {
      const db = loadDb();
      const sub = db.submissions.find(s => s.id === id);
      return sub || null;
    }
  },

  async getAll(): Promise<Submission[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("submissions").select("*").order("id", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToSubmission);
    } else {
      const db = loadDb();
      return db.submissions;
    }
  },

  async getByClipperId(clipperId: string): Promise<Submission[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("submissions").select("*").eq("clipper_id", clipperId).order("id", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToSubmission);
    } else {
      const db = loadDb();
      return db.submissions.filter(s => s.clipperId === clipperId);
    }
  },

  async getByCampaignId(campaignId: string): Promise<Submission[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("submissions").select("*").eq("campaign_id", campaignId).order("id", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToSubmission);
    } else {
      const db = loadDb();
      return db.submissions.filter(s => s.campaignId === campaignId);
    }
  },

  async createSubmission(sub: Submission): Promise<Submission> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("submissions").insert({
        id: sub.id,
        campaign_id: sub.campaignId,
        campaign_title: sub.campaignTitle,
        clipper_id: sub.clipperId,
        clipper_name: sub.clipperName,
        submitted_url: sub.submittedUrl,
        status: sub.status || "Pending",
        feedback: sub.feedback || "",
        approved_at: sub.approvedAt || null,
        views: sub.views || 0,
        last_fetched_views: sub.lastFetchedViews || null
      });
      if (error) throw error;
      return sub;
    } else {
      const db = loadDb();
      db.submissions.push(sub);
      saveDb(db);
      return sub;
    }
  },

  async updateSubmission(sub: Submission): Promise<Submission> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("submissions").update({
        campaign_title: sub.campaignTitle,
        status: sub.status,
        feedback: sub.feedback || "",
        approved_at: sub.approvedAt,
        views: sub.views,
        last_fetched_views: sub.lastFetchedViews
      }).eq("id", sub.id);
      if (error) throw error;
      return sub;
    } else {
      const db = loadDb();
      const idx = db.submissions.findIndex(s => s.id === sub.id);
      if (idx !== -1) {
        db.submissions[idx] = sub;
        saveDb(db);
      }
      return sub;
    }
  },

  async distributeViewPayoutRpc(params: {
    submissionId: string;
    addedViews: number;
    batchId: string;
    clipperRefId: string;
    platformRefId: string;
    clipperLedgerId: string;
    platformLedgerId: string;
    eventId: string;
  }): Promise<{ success: boolean; finalCost?: number; finalAddedViews?: number; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("distribute_view_payout", {
        p_submission_id: params.submissionId,
        p_added_views: params.addedViews,
        p_batch_id: params.batchId,
        p_clipper_ref_id: params.clipperRefId,
        p_platform_ref_id: params.platformRefId,
        p_clipper_ledger_id: params.clipperLedgerId,
        p_platform_ledger_id: params.platformLedgerId,
        p_event_id: params.eventId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return {
        success: data.success,
        finalCost: data.final_cost !== undefined ? Number(data.final_cost) / 100 : undefined,
        finalAddedViews: data.final_added_views
      };
    } else {
      // JSON in-memory simulation for test suites and local development
      const db = loadDb();
      const sub = db.submissions.find(s => s.id === params.submissionId);
      if (!sub) return { success: false, error: "Submission not found" };

      const campaign = db.campaigns.find(c => c.id === sub.campaignId);
      if (!campaign) return { success: false, error: "Campaign not found" };

      const remainingBudget = campaign.escrowBalance || 0;
      if (remainingBudget <= 0) return { success: false, error: "Campaign escrow balance is zero" };

      // Check idempotency
      if (!db.financialLedger) db.financialLedger = [];
      const isDup = db.financialLedger.some(l => l.referenceId === params.clipperRefId);
      if (isDup) {
        return { success: false, error: "Duplicate view payout detected (idempotency check)" };
      }

      const creatorCost = (params.addedViews / 1000) * campaign.cpm;
      const finalCost = Math.min(creatorCost, remainingBudget);
      const finalAddedViews = Math.round((finalCost / campaign.cpm) * 1000);
      const roundedCost = Math.round(finalCost * 100) / 100;

      if (roundedCost <= 0) return { success: false, error: "Payout amount too small" };

      const clipperShare = Math.round(roundedCost * 0.8 * 100) / 100;
      const platformFee = Math.round((roundedCost - clipperShare) * 100) / 100;

      // Update state
      sub.views += finalAddedViews;
      sub.lastFetchedViews = new Date().toISOString();
      campaign.escrowBalance = Math.round(((campaign.escrowBalance || 0) - roundedCost) * 100) / 100;
      campaign.spent = Math.round((campaign.spent + roundedCost) * 100) / 100;

      // Insert ledger entries
      db.financialLedger.push({
        id: params.clipperLedgerId,
        referenceId: params.clipperRefId,
        referenceType: "clipper_earning",
        fromAccount: `campaign_escrow:${campaign.id}`,
        toAccount: `clipper_earnings:${sub.clipperId}`,
        userId: sub.clipperId,
        amount: clipperShare,
        status: "completed",
        description: `Payout for ${sub.clipperName} views (+${finalAddedViews} views)`,
        createdAt: new Date().toISOString()
      });

      db.financialLedger.push({
        id: params.platformLedgerId,
        referenceId: params.platformRefId,
        referenceType: "platform_fee",
        fromAccount: `campaign_escrow:${campaign.id}`,
        toAccount: "QUOR Platform",
        userId: sub.clipperId,
        amount: platformFee,
        status: "completed",
        description: `Platform commission 20% for ${sub.clipperName} views`,
        createdAt: new Date().toISOString()
      });

      if (!db.viewPayoutEvents) db.viewPayoutEvents = [];
      db.viewPayoutEvents.push({
        submissionId: sub.id,
        previousViews: sub.views - finalAddedViews,
        newViews: sub.views,
        verifiedViews: finalAddedViews,
        grossAmount: roundedCost,
        clipperAmount: clipperShare,
        platformAmount: platformFee,
        processedAt: new Date().toISOString()
      });

      saveDb(db);
      return {
        success: true,
        finalCost: roundedCost,
        finalAddedViews
      };
    }
  }
};
