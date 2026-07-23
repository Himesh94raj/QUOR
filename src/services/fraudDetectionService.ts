import { DbSchema, Submission } from "../types.js";
import { extractContentId } from "./socialUrlService.js";

export interface FraudAnalysisResult {
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  flags: string[];
  action: "allow" | "review" | "suspend";
}

/**
 * Analyzes a view increment or a submission for potential fraud.
 */
export function analyzeViewUpdate(
  db: DbSchema,
  submissionId: string,
  addedViews: number,
  lastVerifiedViews: number
): FraudAnalysisResult {
  const flags: string[] = [];
  let riskScore = 0;

  const sub = db.submissions.find(s => s.id === submissionId);
  if (!sub) {
    return {
      riskScore: 100,
      riskLevel: "critical",
      flags: ["SUBMISSION_NOT_FOUND"],
      action: "suspend"
    };
  }

  // Rule 1: Impossible view decreases (or negative deltas)
  if (addedViews < 0) {
    riskScore += 90;
    flags.push("NEGATIVE_VIEW_DELTA: Negative view addition of " + addedViews);
  }

  // Rule 2: Sudden explosive growth / abnormally high view velocity
  // E.g., adding more than 20,000 views in a single verification tick
  if (addedViews > 35000) {
    riskScore += 85;
    flags.push("CRITICAL_HIGH_VELOCITY: Unusually explosive view growth detected (+" + addedViews + " views)");
  } else if (addedViews > 10000) {
    riskScore += 50;
    flags.push("HIGH_VELOCITY: Elevated view increment velocity (+" + addedViews + " views)");
  } else if (addedViews > 5000) {
    riskScore += 25;
    flags.push("MODERATE_VELOCITY: Moderate spike in view growth (+" + addedViews + " views)");
  }

  // Rule 3: Repeated identical view patterns
  // Check the view payout history for this submission
  const subPayouts = db.viewPayoutEvents 
    ? db.viewPayoutEvents.filter(e => e.submissionId === submissionId)
    : [];
  if (subPayouts.length >= 2) {
    const last1 = subPayouts[subPayouts.length - 1].verifiedViews;
    const last2 = subPayouts[subPayouts.length - 2].verifiedViews;
    if (addedViews > 0 && addedViews === last1 && addedViews === last2) {
      riskScore += 45;
      flags.push("REPEATED_IDENTICAL_VIEW_PATTERN: Three identical view increments of " + addedViews);
    }
  }

  // Rule 4: Multiple submissions using identical content
  const contentId = extractContentId(sub.submittedUrl);
  if (contentId) {
    const duplicateSubs = db.submissions.filter(s => {
      if (s.id === submissionId) return false;
      const otherId = extractContentId(s.submittedUrl);
      return otherId === contentId;
    });

    if (duplicateSubs.length > 0) {
      // Check if different clippers submitted the same content (Sybil / Multi-account fraud)
      const uniqueClippedUsers = new Set(duplicateSubs.map(s => s.clipperId));
      uniqueClippedUsers.add(sub.clipperId);

      if (uniqueClippedUsers.size > 1) {
        riskScore += 75;
        flags.push("MULTI_ACCOUNT_CONTENT_SHARING: Same video content ID submitted by multiple clippers");
      } else {
        riskScore += 40;
        flags.push("DUPLICATE_CAMPAIGN_CONTENT: Clipper submitted identical video multiple times");
      }
    }
  }

  // Determine risk level & action
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let action: "allow" | "review" | "suspend" = "allow";

  if (riskScore >= 85) {
    riskLevel = "critical";
    action = "suspend";
  } else if (riskScore >= 60) {
    riskLevel = "high";
    action = "review";
  } else if (riskScore >= 30) {
    riskLevel = "medium";
    action = "review";
  }

  return {
    riskScore: Math.min(riskScore, 100),
    riskLevel,
    flags,
    action
  };
}

/**
 * Validates a submission at creation time for fraud.
 */
export function analyzeSubmissionCreation(
  db: DbSchema,
  clipperId: string,
  submittedUrl: string,
  campaignId: string
): FraudAnalysisResult {
  const flags: string[] = [];
  let riskScore = 0;

  const contentId = extractContentId(submittedUrl);
  if (!contentId) {
    return {
      riskScore: 90,
      riskLevel: "critical",
      flags: ["INVALID_URL_CONTENT_ID"],
      action: "suspend"
    };
  }

  // Check if this content ID is already submitted in the same campaign
  const sameCampaignDuplicate = db.submissions.find(s => {
    const cId = extractContentId(s.submittedUrl);
    return s.campaignId === campaignId && cId === contentId;
  });

  if (sameCampaignDuplicate) {
    riskScore += 95;
    flags.push("DUPLICATE_CONTENT_ID_IN_CAMPAIGN: This video has already been submitted to this campaign.");
  }

  // Check across all campaigns/users
  const totalOccurrences = db.submissions.filter(s => {
    return extractContentId(s.submittedUrl) === contentId;
  });

  if (totalOccurrences.length > 2) {
    riskScore += 40;
    flags.push("HIGH_FREQUENCY_CONTENT: This video has been submitted to " + totalOccurrences.length + " other campaigns.");
  }

  // Determine risk level & action
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  let action: "allow" | "review" | "suspend" = "allow";

  if (riskScore >= 85) {
    riskLevel = "critical";
    action = "suspend";
  } else if (riskScore >= 60) {
    riskLevel = "high";
    action = "review";
  } else if (riskScore >= 30) {
    riskLevel = "medium";
    action = "review";
  }

  return {
    riskScore: Math.min(riskScore, 100),
    riskLevel,
    flags,
    action
  };
}
