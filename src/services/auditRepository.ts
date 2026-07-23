import { supabase, dbProvider, loadDb, saveDb } from "./db.js";
import { AuditEvent } from "../types.js";

const mapRowToAudit = (row: any): AuditEvent => {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata || undefined,
    createdAt: row.created_at
  };
};

export const auditRepository = {
  async getAll(): Promise<AuditEvent[]> {
    if (dbProvider === "supabase") {
      const { data, error } = await supabase.from("audit_events").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map(mapRowToAudit);
    } else {
      const db = loadDb();
      return db.auditEvents || [];
    }
  },

  async createEvent(event: AuditEvent): Promise<AuditEvent> {
    if (dbProvider === "supabase") {
      const { error } = await supabase.from("audit_events").insert({
        id: event.id,
        actor_user_id: event.actorUserId,
        actor_role: event.actorRole,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId,
        metadata: event.metadata || null,
        created_at: event.createdAt || new Date().toISOString()
      });
      if (error) throw error;
      return event;
    } else {
      const db = loadDb();
      if (!db.auditEvents) db.auditEvents = [];
      db.auditEvents.push(event);
      saveDb(db);
      return event;
    }
  }
};
