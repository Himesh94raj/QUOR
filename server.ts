import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { DbSchema, User, Campaign, Submission, ClipperProfile, CreatorProfile, WalletTransaction, PayoutRequest, ContactMessage } from "./src/types.js";

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

// Async helper to sync to Supabase
const syncToSupabase = async (db: DbSchema) => {
  try {
    console.log("Supabase: Initiating sync...");

    // 1. Try to sync entire state to a single master row as a general backup
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

    // 2. Try to sync individual users table
    try {
      if (db.users && db.users.length > 0) {
        const rows = db.users.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status || "active",
          status_reason: u.statusReason || "",
          created_at: u.createdAt
        }));
        const { error } = await supabase.from("users").upsert(rows, { onConflict: "id" });
        if (error) {
          console.warn("Supabase: 'users' table sync skipped:", error.message);
        } else {
          console.log(`Supabase: Synced ${rows.length} users successfully`);
        }
      }
    } catch (e: any) {
      console.warn("Supabase users sync exception:", e.message || e);
    }

    // 3. Try to sync campaigns table
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

    // 4. Try to sync submissions table
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

    // 5. Try to sync clipper_profiles table
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

    // 6. Try to sync creator_profiles table
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

    // 7. Try to sync wallet_history table
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

    // 8. Try to sync payout_requests table
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

    // 9. Try to sync contacts / tickets table
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

  } catch (err: any) {
    console.error("General Supabase sync failure:", err.message || err);
  }
};

// Helper to write database
const saveDb = (db: DbSchema) => {
  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  syncToSupabase(db).catch(err => {
    console.error("Supabase async backup trigger failed:", err);
  });
};

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
          id: "aarav-admin",
          name: "Aarav Raut",
          email: "aarav63raut@gmail.com",
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
          lastFetchedViews: new Date().toISOString()
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
          approvedAt: null
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

  // Ensure all users have hashed passwords
  let updated = false;
  db.users = db.users.map((user) => {
    if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$") && !user.password.startsWith("$2y$")) {
      user.password = bcrypt.hashSync(user.password, 10);
      updated = true;
    }
    return user;
  });

  if (updated) {
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
    const userId = authHeader.split(" ")[1];

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

  // Auth Endpoints
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password || !role) {
        return res.status(400).json({ error: "Missing required signup fields." });
      }

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
          email,
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

      // 3. Create profiles in Supabase
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
      }

      res.status(201).json({
        id: userId,
        name,
        email,
        role,
      });
    } catch (err: any) {
      console.error("Signup catch error:", err);
      res.status(500).json({ error: err.message || "Internal server error." });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Please enter email and password." });
      }

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

      // Auto-bootstrap any aarav63raut@gmail.com login as Admin in Supabase
      if (user && email.toLowerCase() === "aarav63raut@gmail.com" && user.role !== "admin") {
        user.role = "admin";
        await supabase
          .from("users")
          .update({ role: "admin" })
          .eq("id", user.id);
      }

      const isPasswordValid = user && bcrypt.compareSync(password, user.password);
      if (!user || !isPasswordValid) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

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

      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } catch (err: any) {
      console.error("Login catch error:", err);
      res.status(500).json({ error: err.message || "Internal server error." });
    }
  });

  app.get("/api/auth/me", authenticateUser, (req: any, res) => {
    res.json({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
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
    const { upiId, instagramHandle, youtubeHandle, kycAadhaar, kycPan, kycDocUrl } = req.body;
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
        kycAadhaar: kycAadhaar || "",
        kycPan: kycPan || ""
      };
      db.clipperProfiles[req.user.id] = profile;
    } else {
      profile.upiId = upiId ?? profile.upiId;
      profile.instagramHandle = instagramHandle ?? profile.instagramHandle;
      profile.youtubeHandle = youtubeHandle ?? profile.youtubeHandle;
      profile.kycAadhaar = kycAadhaar ?? profile.kycAadhaar;
      profile.kycPan = kycPan ?? profile.kycPan;
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
    const { channelUrl } = req.body;
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
    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid transfer amount." });
    }
    const db = loadDb();
    let profile = db.creatorProfiles[req.user.id];
    if (!profile) {
      profile = { userId: req.user.id, channelUrl: "", walletBalance: 0 };
      db.creatorProfiles[req.user.id] = profile;
    }

    profile.walletBalance += parseFloat(amount);

    const transaction: WalletTransaction = {
      id: "tx-" + Math.random().toString(36).substring(2, 9),
      userId: req.user.id,
      type: "deposit",
      amount: parseFloat(amount),
      status: "Completed",
      description: `Fund Added via Razorpay Payment Gateway (UPI ID Simulation)`,
      createdAt: new Date().toISOString()
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
    const { title, sourceVideoUrl, cpm, budget, instructions, platform, minDuration, deadline, iconUrl, campaignType } = req.body;
    if (!title || !sourceVideoUrl || !cpm || !budget || !instructions || !platform || !minDuration || !deadline) {
      return res.status(400).json({ error: "Please provide all required campaign fields." });
    }

    const db = loadDb();
    const creatorProf = db.creatorProfiles[req.user.id];
    if (!creatorProf || creatorProf.walletBalance < budget) {
      return res.status(400).json({ error: `Insufficient wallet balance. You need ₹${budget}, current balance is ₹${creatorProf?.walletBalance || 0}. Please top-up first!` });
    }

    // Deduct the budget upfront from wallet for campaign running guarantee
    creatorProf.walletBalance -= Number(budget);

    const campaignId = "campaign-" + Math.random().toString(36).substring(2, 9);
    const newCampaign: Campaign = {
      id: campaignId,
      creatorId: req.user.id,
      creatorName: req.user.name,
      title,
      sourceVideoUrl,
      cpm: Number(cpm),
      budget: Number(budget),
      spent: 0,
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

    // Record wallet deduction transaction
    const transaction: WalletTransaction = {
      id: "tx-" + Math.random().toString(36).substring(2, 9),
      userId: req.user.id,
      type: "payment",
      amount: Number(budget),
      status: "Completed",
      description: `Escrow lock of ₹${budget} for campaign: ${title}`,
      createdAt: new Date().toISOString()
    };
    db.walletHistory.push(transaction);

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

    if (status) campaign.status = status;
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

    // Refund unspent wallet balance to creator
    const remainingBudget = campaign.budget - campaign.spent;
    if (remainingBudget > 0) {
      const creatorProf = db.creatorProfiles[campaign.creatorId];
      if (creatorProf) {
        creatorProf.walletBalance += remainingBudget;
        // Logs
        db.walletHistory.push({
          id: "tx-" + Math.random().toString(36).substring(2, 9),
          userId: campaign.creatorId,
          type: "deposit",
          amount: remainingBudget,
          status: "Completed",
          description: `Refund of unused budget from deleted campaign: ${campaign.title}`,
          createdAt: new Date().toISOString()
        });
      }
    }

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

    // Limit to one active submission per clipper per campaign
    const existingActive = db.submissions.find(s => s.campaignId === campaignId && s.clipperId === req.user.id);
    if (existingActive) {
      return res.status(400).json({ error: "You already have an active submission for this campaign." });
    }

    const newSub: Submission = {
      id: "sub-" + Math.random().toString(36).substring(2, 9),
      campaignId,
      campaignTitle: campaign.title,
      clipperId: req.user.id,
      clipperName: req.user.name,
      submittedUrl,
      status: "Pending",
      views: 0,
      lastFetchedViews: null,
      approvedAt: null
    };

    db.submissions.push(newSub);
    saveDb(db);

    res.status(201).json({ message: "Clip submitted successfully! Waiting for creator approval.", submission: newSub });
  });

  app.post("/api/submissions/:id/review", authenticateUser, (req: any, res) => {
    const { id } = req.params;
    const { status, feedback } = req.body; // Approved / Rejected

    if (!status || (status !== "Approved" && status !== "Rejected")) {
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

    if (req.user.role !== "admin" && campaign.creatorId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized review attempt." });
    }

    submission.status = status;
    if (feedback) submission.feedback = feedback;
    if (status === "Approved") {
      submission.approvedAt = new Date().toISOString();
      // Start initial mock view views
      submission.views = Math.floor(Math.random() * 50) + 10;
      submission.lastFetchedViews = new Date().toISOString();
    }

    saveDb(db);
    res.json({ message: `Submission is successfully ${status}!`, submission });
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

    const { amount } = req.body;
    if (!amount || isNaN(amount) || amount < 500) {
      return res.status(400).json({ error: "Minimum withdrawal threshold is ₹500." });
    }

    const db = loadDb();
    const clipperProfile = db.clipperProfiles[req.user.id];
    if (!clipperProfile || !clipperProfile.upiId) {
      return res.status(400).json({ error: "Please link your UPI ID in your Profile first before requesting withdrawals." });
    }

    // Calculate total net earnings
    // Let's compute earnings dynamically from approved submissions minus payouts
    const approvedSubs = db.submissions.filter(s => s.clipperId === req.user.id && s.status === "Approved");
    let totalEarned = 0;
    approvedSubs.forEach(sub => {
      const camp = db.campaigns.find(c => c.id === sub.campaignId);
      if (camp) {
        // Clipper role gets 80% (20% platform charge deducted)
        const netCmsRate = camp.cpm * 0.8;
        totalEarned += (sub.views / 1000) * netCmsRate;
      }
    });

    const totalWithdrawn = db.payoutRequests
      .filter(p => p.clipperId === req.user.id && p.status === "Completed")
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingWithdrawal = db.payoutRequests
      .filter(p => p.clipperId === req.user.id && p.status === "Processing")
      .reduce((sum, p) => sum + p.amount, 0);

    const availableBalance = totalEarned - totalWithdrawn - pendingWithdrawal;

    if (amount > availableBalance) {
      return res.status(400).json({ error: `Insufficient earnings balance. Available is ₹${availableBalance.toFixed(2)}. Tried withdrawing ₹${amount}.` });
    }

    const newRequest: PayoutRequest = {
      id: "payout-" + Math.random().toString(36).substring(2, 9),
      clipperId: req.user.id,
      clipperName: req.user.name,
      upiId: clipperProfile.upiId,
      amount: Number(amount),
      status: "Processing",
      createdAt: new Date().toISOString()
    };

    db.payoutRequests.push(newRequest);
    saveDb(db);

    res.status(201).json({ message: "Withdrawal request submitted! Send to Admin for processing.", request: newRequest });
  });

  // Admin Queue Actions
  app.get("/api/admin/users", authenticateUser, (req: any, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
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

  app.post("/api/admin/users/:userId/status", authenticateUser, (req: any, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
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

  app.post("/api/admin/kyc/:userId", authenticateUser, (req: any, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
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

  app.post("/api/admin/payouts/:payoutId", authenticateUser, (req: any, res) => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only." });
    const { payoutId } = req.params;
    const { status } = req.body; // Completed or Failed

    const db = loadDb();
    const payout = db.payoutRequests.find(p => p.id === payoutId);
    if (!payout) {
      return res.status(404).json({ error: "Payout request not found." });
    }

    payout.status = status;

    if (status === "Completed") {
      // Log wallet transaction for clipper historical tracing
      db.walletHistory.push({
        id: "tx-" + Math.random().toString(36).substring(2, 9),
        userId: payout.clipperId,
        type: "withdrawal",
        amount: payout.amount,
        status: "Completed",
        description: `Withdrawn to UPI: ${payout.upiId}`,
        createdAt: new Date().toISOString()
      });
    }

    saveDb(db);
    res.json({ message: `Payout request marked as ${status}.`, payout });
  });

  // VIEW TRACKING ENGINE (Manual Trigger or automatic increment)
  const executeViewTracking = () => {
    const db = loadDb();
    let updatedCount = 0;
    
    db.submissions.forEach(sub => {
      if (sub.status === "Approved") {
        const campaign = db.campaigns.find(c => c.id === sub.campaignId);
        if (campaign && campaign.status === "Active") {
          // Calculate budget remaining
          const remainingBudget = campaign.budget - campaign.spent;
          if (remainingBudget <= 0) {
            campaign.status = "Completed";
            return;
          }

          // Generate simulated periodic organic views (e.g., between 500 - 3500 views per tick)
          // Bot protection check velocity: once in a while generate huge bot check velocity (e.g. 50,000 views)
          const isBotRisk = Math.random() < 0.05; // 5% chance
          const addedViews = isBotRisk ? 42000 : Math.floor(Math.random() * 1500) + 300;
          
          const creatorCost = (addedViews / 1000) * campaign.cpm;
          const finalCost = Math.min(creatorCost, remainingBudget);
          
          // Re-calculate view proportion if scaled back by budget
          const finalAddedViews = Math.round((finalCost / campaign.cpm) * 1000);

          sub.views += finalAddedViews;
          sub.lastFetchedViews = new Date().toISOString();
          campaign.spent += finalCost;

          // Double check if campaign is fully spent
          if (campaign.spent >= campaign.budget) {
            campaign.status = "Completed";
          }

          // Distribute earnings: 80% to Clipper, 20% to Platform
          const clipperEarnings = finalCost * 0.8;
          const platformFee = finalCost * 0.2;

          // If bot detection happens, we still register but we can label it or flag it
          let desc = `Payout for Samir Kulkarni views (+${finalAddedViews} views)`;
          if (isBotRisk) {
            desc += " - [FLAGGED: Unusually High Velocity detected - Fraud check triggered]";
          }

          // Record wallet payout transaction on creator
          db.walletHistory.push({
            id: "tx-" + Math.random().toString(36).substring(2, 9),
            userId: campaign.creatorId,
            type: "payment",
            amount: finalCost,
            status: "Completed",
            description: desc,
            createdAt: new Date().toISOString()
          });

          updatedCount++;
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
