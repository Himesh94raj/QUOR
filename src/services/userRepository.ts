import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { User, ClipperProfile, CreatorProfile } from "../types.js";

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        status: data.status,
        statusReason: data.status_reason,
        statusUntil: data.status_until,
        createdAt: data.created_at
      };
    } else {
      const db = loadDb();
      const user = db.users.find(u => u.id === id);
      return user || null;
    }
  },

  async findByEmail(email: string): Promise<User | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("users").select("*").ilike("email", email).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        status: data.status,
        statusReason: data.status_reason,
        statusUntil: data.status_until,
        createdAt: data.created_at
      };
    } else {
      const db = loadDb();
      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      return user || null;
    }
  },

  async createUser(user: User): Promise<User> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("users").insert({
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        status: user.status || "active",
        status_reason: user.statusReason || "",
        status_until: user.statusUntil || null,
        created_at: user.createdAt || new Date().toISOString()
      });
      if (error) throw error;
      return user;
    } else {
      const db = loadDb();
      db.users.push(user);
      saveDb(db);
      return user;
    }
  },

  async updateUser(user: User): Promise<User> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("users").update({
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        status: user.status,
        status_reason: user.statusReason,
        status_until: user.statusUntil
      }).eq("id", user.id);
      if (error) throw error;
      return user;
    } else {
      const db = loadDb();
      const idx = db.users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        db.users[idx] = user;
        saveDb(db);
      }
      return user;
    }
  },

  async findClipperProfile(userId: string): Promise<ClipperProfile | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("clipper_profiles").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        userId: data.user_id,
        upiId: data.upi_id,
        instagramHandle: data.instagram_handle,
        youtubeHandle: data.youtube_handle,
        kycStatus: data.kyc_status,
        kycDocUrl: data.kyc_doc_url,
        kycAadhaar: data.kyc_aadhaar,
        kycPan: data.kyc_pan,
        kycReferenceId: data.kyc_reference_id
      };
    } else {
      const db = loadDb();
      return db.clipperProfiles[userId] || null;
    }
  },

  async createOrUpdateClipperProfile(profile: ClipperProfile): Promise<ClipperProfile> {
    if (dbProvider === "supabase") {
      const row = {
        user_id: profile.userId,
        upi_id: profile.upiId,
        instagram_handle: profile.instagramHandle,
        youtube_handle: profile.youtubeHandle,
        kyc_status: profile.kycStatus,
        kyc_doc_url: profile.kycDocUrl,
        kyc_aadhaar: profile.kycAadhaar,
        kyc_pan: profile.kycPan,
        kyc_reference_id: profile.kycReferenceId
      };
      const { error } = await supabase.from("clipper_profiles").upsert(row, { onConflict: "user_id" });
      if (error) throw error;
      return profile;
    } else {
      const db = loadDb();
      db.clipperProfiles[profile.userId] = profile;
      saveDb(db);
      return profile;
    }
  },

  async findCreatorProfile(userId: string): Promise<CreatorProfile | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("creator_profiles").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        userId: data.user_id,
        channelUrl: data.channel_url,
        walletBalance: Number(data.wallet_balance) / 100 // convert paise to INR
      };
    } else {
      const db = loadDb();
      return db.creatorProfiles[userId] || null;
    }
  },

  async createOrUpdateCreatorProfile(profile: CreatorProfile): Promise<CreatorProfile> {
    if (dbProvider === "supabase") {
      const row = {
        user_id: profile.userId,
        channel_url: profile.channelUrl,
        wallet_balance: Math.round(profile.walletBalance * 100) // convert INR to paise
      };
      const { error } = await supabase.from("creator_profiles").upsert(row, { onConflict: "user_id" });
      if (error) throw error;
      return profile;
    } else {
      const db = loadDb();
      db.creatorProfiles[profile.userId] = profile;
      saveDb(db);
      return profile;
    }
  }
};
