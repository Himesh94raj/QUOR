import { DbSchema, Campaign, Submission, CampaignStatus, SubmissionStatus, AuditEvent } from "../types.js";

/**
 * Record an immutable event to the system audit trail.
 */
export function recordAuditEvent(
  db: DbSchema,
  actorUserId: string | undefined,
  actorRole: string | undefined,
  action: string,
  entityType: string,
  entityId: string | undefined,
  metadata?: Record<string, any>,
  ipHash?: string,
  userAgentHash?: string
): AuditEvent {
  if (!db.auditEvents) {
    db.auditEvents = [];
  }

  const newEvent: AuditEvent = {
    id: "aud-" + Math.random().toString(36).substring(2, 9),
    actorUserId,
    actorRole,
    action,
    entityType,
    entityId,
    metadata,
    ipHash: ipHash || "local-ip-hash",
    userAgentHash: userAgentHash || "local-ua-hash",
    createdAt: new Date().toISOString()
  };

  db.auditEvents.push(newEvent);
  return newEvent;
}

/**
 * Validates campaign state transition.
 */
export function validateCampaignTransition(
  db: DbSchema,
  campaign: Campaign,
  toStatus: CampaignStatus,
  actorUserId: string,
  actorRole: string
): { allowed: boolean; error?: string } {
  const fromStatus = campaign.status;
  if (fromStatus === toStatus) {
    return { allowed: true };
  }

  // Prevent transitions from terminal states
  if (fromStatus === "Completed") {
    return { allowed: false, error: "Cannot transition out of Completed campaign state." };
  }
  if (fromStatus === "Cancelled") {
    return { allowed: false, error: "Cannot transition out of Cancelled campaign state." };
  }

  // Active -> Draft is forbidden
  if (fromStatus === "Active" && toStatus === "Draft") {
    return { allowed: false, error: "Active campaigns cannot be reverted to Draft." };
  }

  // Active needs sufficient escrow funding
  if (toStatus === "Active") {
    const escrowBal = campaign.escrowBalance || 0;
    if (escrowBal <= 0) {
      return { allowed: false, error: "Sufficient escrow funding is required to set campaign to Active." };
    }
  }

  // Cancellation safety rules
  if (toStatus === "Cancelled") {
    const approvedSubs = db.submissions.filter(s => s.campaignId === campaign.id && s.status === "Approved");
    if (approvedSubs.length > 0) {
      return { allowed: false, error: "A campaign with active approved submissions cannot be cancelled." };
    }
  }

  // Allowed transitions
  const allowedTransitions: Record<CampaignStatus, CampaignStatus[]> = {
    Draft: ["Funded", "Cancelled", "Active"], // Let's support Draft -> Active directly if pre-funded
    Funded: ["Active", "Paused", "Cancelled"],
    Active: ["Paused", "Completed", "Cancelled"],
    Paused: ["Active", "Completed", "Cancelled"],
    Completed: [],
    Cancelled: []
  };

  const allowedList = allowedTransitions[fromStatus] || [];
  if (!allowedList.includes(toStatus)) {
    return { allowed: false, error: `Invalid transition from ${fromStatus} to ${toStatus}.` };
  }

  return { allowed: true };
}

/**
 * Validates submission state transition.
 */
export function validateSubmissionTransition(
  db: DbSchema,
  submission: Submission,
  toStatus: SubmissionStatus,
  actorUserId: string,
  actorRole: string
): { allowed: boolean; error?: string } {
  const fromStatus = submission.status;
  if (fromStatus === toStatus) {
    return { allowed: true };
  }

  const campaign = db.campaigns.find(c => c.id === submission.campaignId);
  if (!campaign) {
    return { allowed: false, error: "Associated campaign not found." };
  }

  // Only the campaign creator or authorized admin can review
  const isCreator = campaign.creatorId === actorUserId;
  const isAdmin = actorRole === "admin";
  if (!isCreator && !isAdmin) {
    return { allowed: false, error: "Only the campaign creator or an authorized administrator can review a submission." };
  }

  // A clipper cannot approve their own submission
  if (submission.clipperId === actorUserId && toStatus === "Approved") {
    return { allowed: false, error: "A clipper cannot approve their own submission." };
  }

  // A submission cannot be approved twice
  if ((fromStatus === "Approved" || fromStatus === "Pending") && toStatus === "Approved" && submission.approvedAt) {
    return { allowed: false, error: "A submission cannot be approved twice." };
  }

  // Lift suspensions only by Admin
  if (fromStatus === "Suspended" && toStatus !== "Suspended" && !isAdmin) {
    return { allowed: false, error: "Only an administrator can lift a submission suspension." };
  }

  return { allowed: true };
}
