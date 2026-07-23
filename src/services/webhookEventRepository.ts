import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { WebhookEventRecord } from "../types.js";

const mapRowToWebhookEvent = (row: any): WebhookEventRecord => {
  return {
    id: row.id,
    provider: row.provider,
    event_type: row.event_type,
    received_at: row.received_at,
    processed_at: row.processed_at || undefined,
    processing_status: row.processing_status,
    payload: row.payload || undefined
  };
};

export const webhookEventRepository = {
  async findById(provider: string, id: string): Promise<WebhookEventRecord | null> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase
        .from("webhook_events")
        .select("*")
        .eq("provider", provider)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapRowToWebhookEvent(data);
    } else {
      const db = loadDb();
      if (!db.webhookEvents) return null;
      const event = db.webhookEvents.find(e => e.provider === provider && e.id === id);
      return event || null;
    }
  },

  async createEvent(event: WebhookEventRecord): Promise<WebhookEventRecord> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("webhook_events").insert({
        id: event.id,
        provider: event.provider,
        event_type: event.event_type,
        received_at: event.received_at || new Date().toISOString(),
        processed_at: event.processed_at || null,
        processing_status: event.processing_status || "received",
        payload: event.payload || null
      });
      if (error) throw error;
      return event;
    } else {
      const db = loadDb();
      if (!db.webhookEvents) db.webhookEvents = [];
      if (db.webhookEvents.some(e => e.provider === event.provider && e.id === event.id)) {
        throw new Error(`Duplicate webhook event: ${event.id}`);
      }
      db.webhookEvents.push(event);
      saveDb(db);
      return event;
    }
  },

  async updateEventStatus(
    provider: string,
    id: string,
    status: "received" | "processed" | "failed",
    processedAt?: string
  ): Promise<void> {
    if (dbProvider === "supabase") {
      const { error } = await supabase
        .from("webhook_events")
        .update({
          processing_status: status,
          processed_at: processedAt || new Date().toISOString()
        })
        .eq("provider", provider)
        .eq("id", id);
      if (error) throw error;
    } else {
      const db = loadDb();
      if (!db.webhookEvents) db.webhookEvents = [];
      const idx = db.webhookEvents.findIndex(e => e.provider === provider && e.id === id);
      if (idx !== -1) {
        db.webhookEvents[idx].processing_status = status;
        db.webhookEvents[idx].processed_at = processedAt || new Date().toISOString();
        saveDb(db);
      }
    }
  }
};
