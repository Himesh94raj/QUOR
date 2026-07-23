import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { Campaign } from "../types.js";

const mapRowToCampaign = (row: any): Campaign => {
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    title: row.title,
    sourceVideoUrl: row.source_video_url,
    cpm: Number(row.cpm) / 100, // convert paise to INR
    budget: Number(row.budget) / 100, // convert paise to INR
    spent: Number(row.spent) / 100, // convert paise to INR
    escrowBalance: row.escrow_balance !== undefined ? Number(row.escrow_balance) / 100 : undefined, // convert paise to INR
    instructions: row.instructions,
    platform: row.platform,
    minDuration: row.min_duration,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    iconUrl: row.icon_url,
    campaignType: row.campaign_type
  };
};

export const campaignRepository = {
  async findById(id: string): Promise<Campaign | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRowToCampaign(data);
    } else {
      const db = loadDb();
      const campaign = db.campaigns.find(c => c.id === id);
      return campaign || null;
    }
  },

  async getAll(): Promise<Campaign[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToCampaign);
    } else {
      const db = loadDb();
      return db.campaigns;
    }
  },

  async getByCreatorId(creatorId: string): Promise<Campaign[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("campaigns").select("*").eq("creator_id", creatorId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToCampaign);
    } else {
      const db = loadDb();
      return db.campaigns.filter(c => c.creatorId === creatorId);
    }
  },

  async createCampaign(campaign: Campaign): Promise<Campaign> {
    if (dbProvider === "supabase") {
      // Direct insertion (non-escrow lock version, though lockCampaignEscrow should be used for atomic flow)
      const { error } = await supabase.from("campaigns").insert({
        id: campaign.id,
        creator_id: campaign.creatorId,
        creator_name: campaign.creatorName,
        title: campaign.title,
        source_video_url: campaign.sourceVideoUrl,
        cpm: Math.round(campaign.cpm * 100),
        budget: Math.round(campaign.budget * 100),
        spent: Math.round(campaign.spent * 100),
        escrow_balance: Math.round((campaign.escrowBalance || campaign.budget) * 100),
        instructions: campaign.instructions,
        platform: campaign.platform,
        min_duration: campaign.minDuration,
        deadline: campaign.deadline,
        status: campaign.status,
        icon_url: campaign.iconUrl || null,
        campaign_type: campaign.campaignType || "clipping",
        created_at: campaign.createdAt || new Date().toISOString()
      });
      if (error) throw error;
      return campaign;
    } else {
      const db = loadDb();
      db.campaigns.push(campaign);
      saveDb(db);
      return campaign;
    }
  },

  async lockCampaignEscrowRpc(params: {
    campaignId: string;
    creatorId: string;
    creatorName: string;
    title: string;
    sourceVideoUrl: string;
    cpm: number;
    budget: number;
    instructions: string;
    platform: string;
    minDuration: number;
    deadline: string;
    campaignType: string;
    iconUrl: string | null;
    ledgerId: string;
    refId: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.rpc("lock_campaign_escrow", {
        p_campaign_id: params.campaignId,
        p_creator_id: params.creatorId,
        p_creator_name: params.creatorName,
        p_title: params.title,
        p_source_video_url: params.sourceVideoUrl,
        p_cpm_paise: Math.round(params.cpm * 100),
        p_budget_paise: Math.round(params.budget * 100),
        p_instructions: params.instructions,
        p_platform: params.platform,
        p_min_duration: params.minDuration,
        p_deadline: params.deadline,
        p_campaign_type: params.campaignType,
        p_icon_url: params.iconUrl,
        p_ledger_id: params.ledgerId,
        p_ref_id: params.refId
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: data.success };
    } else {
      // Local fallback logic in case it's called
      const db = loadDb();
      const creatorProfile = db.creatorProfiles[params.creatorId];
      if (!creatorProfile || creatorProfile.walletBalance < params.budget) {
        return { success: false, error: "Insufficient balance" };
      }

      // Lock funds
      creatorProfile.walletBalance -= params.budget;
      
      const campaign: Campaign = {
        id: params.campaignId,
        creatorId: params.creatorId,
        creatorName: params.creatorName,
        title: params.title,
        sourceVideoUrl: params.sourceVideoUrl,
        cpm: params.cpm,
        budget: params.budget,
        spent: 0,
        escrowBalance: params.budget,
        instructions: params.instructions,
        platform: params.platform as any,
        minDuration: params.minDuration,
        deadline: params.deadline,
        status: "Active",
        iconUrl: params.iconUrl || undefined,
        campaignType: params.campaignType as any,
        createdAt: new Date().toISOString()
      };
      
      db.campaigns.push(campaign);

      if (!db.financialLedger) db.financialLedger = [];
      db.financialLedger.push({
        id: params.ledgerId,
        referenceId: params.refId,
        referenceType: "escrow_lock",
        fromAccount: `creator_wallet:${params.creatorId}`,
        toAccount: `campaign_escrow:${params.campaignId}`,
        userId: params.creatorId,
        amount: params.budget,
        status: "completed",
        description: `Escrow lockup for campaign ${params.title}`,
        createdAt: new Date().toISOString()
      });

      saveDb(db);
      return { success: true };
    }
  },

  async updateCampaign(campaign: Campaign): Promise<Campaign> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("campaigns").update({
        creator_name: campaign.creatorName,
        title: campaign.title,
        source_video_url: campaign.sourceVideoUrl,
        cpm: Math.round(campaign.cpm * 100),
        budget: Math.round(campaign.budget * 100),
        spent: Math.round(campaign.spent * 100),
        escrow_balance: campaign.escrowBalance !== undefined ? Math.round(campaign.escrowBalance * 100) : null,
        instructions: campaign.instructions,
        platform: campaign.platform,
        min_duration: campaign.minDuration,
        deadline: campaign.deadline,
        status: campaign.status,
        icon_url: campaign.iconUrl || null,
        campaign_type: campaign.campaignType || "clipping"
      }).eq("id", campaign.id);
      if (error) throw error;
      return campaign;
    } else {
      const db = loadDb();
      const idx = db.campaigns.findIndex(c => c.id === campaign.id);
      if (idx !== -1) {
        db.campaigns[idx] = campaign;
        saveDb(db);
      }
      return campaign;
    }
  }
};
