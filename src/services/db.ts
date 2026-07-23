import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { DbSchema } from "../types.js";

const FILE_PATH = path.join(process.cwd(), "database.json");

const supabaseUrl = process.env.SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

export const dbProvider = process.env.DATABASE_PROVIDER || "json";

if (dbProvider === "supabase") {
  if (!process.env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL environment variable.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export const loadDb = (): DbSchema => {
  if (!fs.existsSync(FILE_PATH)) {
    // If not found, create a minimal db schema
    const initialDb: DbSchema = {
      users: [],
      clipperProfiles: {},
      creatorProfiles: {},
      campaigns: [],
      submissions: [],
      walletHistory: [],
      payoutRequests: []
    };
    fs.writeFileSync(FILE_PATH, JSON.stringify(initialDb, null, 2), "utf8");
    return initialDb;
  }
  const raw = fs.readFileSync(FILE_PATH, "utf8");
  return JSON.parse(raw);
};

export const saveDb = (db: DbSchema) => {
  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2), "utf8");
};
