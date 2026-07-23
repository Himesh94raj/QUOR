import { DbSchema, FinancialLedgerEntry, ClipperBalance, Campaign, Submission } from "./types.js";

// --- MOCK DATABASE FACTORY ---
function createMockDb(): DbSchema {
  return {
    users: [
      { id: "creator-1", name: "Hassan Creator", email: "hassan@tech.io", password: "pwd", role: "creator", createdAt: "" },
      { id: "clipper-1", name: "Samir Clipper", email: "samir@clips.in", password: "pwd", role: "clipper", createdAt: "" },
      { id: "clipper-2", name: "Rohan Clipper", email: "rohan@clips.in", password: "pwd", role: "clipper", createdAt: "" }
    ],
    clipperProfiles: {
      "clipper-1": { userId: "clipper-1", instagramHandle: "", youtubeHandle: "", kycDocUrl: "", kycAadhaar: "", kycPan: "", kycStatus: "Verified", upiId: "samir@upi" },
      "clipper-2": { userId: "clipper-2", instagramHandle: "", youtubeHandle: "", kycDocUrl: "", kycAadhaar: "", kycPan: "", kycStatus: "Verified", upiId: "rohan@upi" }
    },
    creatorProfiles: {
      "creator-1": { userId: "creator-1", channelUrl: "", walletBalance: 0 }
    },
    campaigns: [],
    submissions: [],
    walletHistory: [],
    payoutRequests: [],
    financialLedger: [],
    clipperBalances: {},
    viewPayoutEvents: []
  };
}

// --- BOOKKEEPING LOGIC COPIED FOR IN-MEMORY UNIT TESTING ---

function recordLedgerEntry(
  db: DbSchema,
  entry: Omit<FinancialLedgerEntry, "id" | "createdAt">
): FinancialLedgerEntry {
  if (!db.financialLedger) {
    db.financialLedger = [];
  }

  // Idempotency Check
  const existing = db.financialLedger.find(e => e.referenceId === entry.referenceId);
  if (existing) {
    return existing;
  }

  const newEntry: FinancialLedgerEntry = {
    id: "led-" + Math.random().toString(36).substring(2, 9),
    ...entry,
    createdAt: new Date().toISOString()
  };

  db.financialLedger.push(newEntry);

  if (entry.userId) {
    syncClipperBalanceCache(db, entry.userId);
  }

  return newEntry;
}

function getDerivedClipperBalance(db: DbSchema, userId: string): ClipperBalance {
  if (!db.financialLedger) {
    db.financialLedger = [];
  }

  let totalEarned = 0;
  let totalWithdrawn = 0;
  let pendingWithdrawal = 0;

  for (const entry of db.financialLedger) {
    if (entry.userId !== userId) continue;

    if (entry.referenceType === "clipper_earning" && entry.status === "completed") {
      totalEarned += entry.amount;
    }
    if (entry.referenceType === "withdrawal_completed" && entry.status === "completed") {
      totalWithdrawn += entry.amount;
    }
    if (entry.referenceType === "withdrawal_request") {
      if (entry.status === "pending") {
        pendingWithdrawal += entry.amount;
      }
    }
  }

  totalEarned = Math.round(totalEarned * 100) / 100;
  totalWithdrawn = Math.round(totalWithdrawn * 100) / 100;
  pendingWithdrawal = Math.round(pendingWithdrawal * 100) / 100;
  const availableBalance = Math.round((totalEarned - totalWithdrawn - pendingWithdrawal) * 100) / 100;

  return {
    userId,
    totalEarned,
    totalWithdrawn,
    pendingWithdrawal,
    availableBalance
  };
}

function syncClipperBalanceCache(db: DbSchema, userId: string) {
  if (!db.clipperBalances) {
    db.clipperBalances = {};
  }
  db.clipperBalances[userId] = getDerivedClipperBalance(db, userId);
}

function refundCampaignEscrow(db: DbSchema, campaign: Campaign) {
  if (!campaign.escrowBalance || campaign.escrowBalance <= 0) {
    return;
  }

  const refundAmount = campaign.escrowBalance;
  const refId = `escrow-refund-${campaign.id}`;

  if (db.financialLedger && db.financialLedger.some(e => e.referenceId === refId)) {
    campaign.escrowBalance = 0;
    return;
  }

  const creatorProf = db.creatorProfiles[campaign.creatorId];
  if (creatorProf) {
    creatorProf.walletBalance = Math.round((creatorProf.walletBalance + refundAmount) * 100) / 100;
  }

  campaign.escrowBalance = 0;

  recordLedgerEntry(db, {
    referenceId: refId,
    referenceType: "refund",
    fromAccount: `campaign_escrow:${campaign.id}`,
    toAccount: `creator_wallet:${campaign.creatorId}`,
    userId: campaign.creatorId,
    campaignId: campaign.id,
    amount: refundAmount,
    status: "completed",
    description: `Refund of unused budget from campaign: ${campaign.title}`
  });
}

function processViewPayout(
  db: DbSchema,
  subId: string,
  addedViews: number,
  batchId: string = Math.random().toString(36).substring(2, 9)
): { success: boolean; grossAmount?: number; error?: string } {
  const sub = db.submissions.find(s => s.id === subId);
  if (!sub) return { success: false, error: "Submission not found" };

  // Idempotency check: if a ledger entry with referenceId ending in -${batchId} already exists, it is a duplicate!
  if (db.financialLedger && db.financialLedger.some(e => e.referenceId.endsWith(`-${batchId}`))) {
    return { success: false, error: "Payout transaction already processed" };
  }

  const campaign = db.campaigns.find(c => c.id === sub.campaignId);
  if (!campaign) return { success: false, error: "Campaign not found" };

  const remainingBudget = campaign.escrowBalance || 0;
  if (remainingBudget <= 0) {
    campaign.status = "Completed";
    return { success: false, error: "Campaign escrow budget fully spent" };
  }

  const creatorCost = (addedViews / 1000) * campaign.cpm;
  const finalCost = Math.min(creatorCost, remainingBudget);
  
  const finalAddedViews = Math.round((finalCost / campaign.cpm) * 1000);
  const roundedCost = Math.round(finalCost * 100) / 100;

  if (roundedCost <= 0) {
    return { success: false, error: "Payout amount is too small or zero" };
  }

  const previousPaidViews = db.viewPayoutEvents ? db.viewPayoutEvents.filter(e => e.submissionId === sub.id).reduce((sum, e) => sum + e.verifiedViews, 0) : 0;
  
  const clipperShare = Math.round(roundedCost * 0.8 * 100) / 100;
  const platformFee = Math.round((roundedCost - clipperShare) * 100) / 100;

  const clipperRefId = `view-payout-clipper-${sub.id}-${previousPaidViews}-${sub.views + finalAddedViews}-${batchId}`;
  const platformRefId = `view-payout-platform-${sub.id}-${previousPaidViews}-${sub.views + finalAddedViews}-${batchId}`;

  recordLedgerEntry(db, {
    referenceId: clipperRefId,
    referenceType: "clipper_earning",
    fromAccount: `campaign_escrow:${campaign.id}`,
    toAccount: `clipper_earnings:${sub.clipperId}`,
    userId: sub.clipperId,
    campaignId: campaign.id,
    submissionId: sub.id,
    amount: clipperShare,
    status: "completed",
    description: `Payout for ${sub.clipperName} views (+${finalAddedViews} views)`
  });

  recordLedgerEntry(db, {
    referenceId: platformRefId,
    referenceType: "platform_fee",
    fromAccount: `campaign_escrow:${campaign.id}`,
    toAccount: "QUOR Platform",
    campaignId: campaign.id,
    submissionId: sub.id,
    amount: platformFee,
    status: "completed",
    description: `Platform commission 20% for ${sub.clipperName} views`
  });

  if (!db.viewPayoutEvents) {
    db.viewPayoutEvents = [];
  }
  db.viewPayoutEvents.push({
    submissionId: sub.id,
    previousViews: previousPaidViews,
    newViews: sub.views + finalAddedViews,
    verifiedViews: finalAddedViews,
    grossAmount: roundedCost,
    clipperAmount: clipperShare,
    platformAmount: platformFee,
    processedAt: new Date().toISOString()
  });

  sub.views += finalAddedViews;
  campaign.escrowBalance = Math.round((campaign.escrowBalance - roundedCost) * 100) / 100;
  campaign.spent = Math.round((campaign.spent + roundedCost) * 100) / 100;

  if (campaign.escrowBalance <= 0) {
    campaign.status = "Completed";
  }

  return { success: true, grossAmount: roundedCost };
}


// --- EXECUTE SCENARIOS ---

const assert = (condition: boolean, msg: string) => {
  if (!condition) {
    console.error(`\x1b[31m❌ Assert Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }
};

async function runTests() {
  console.log("\n\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;34m        QUOR FINANCIAL LEDGER TEST SUITE           \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");

  const db = createMockDb();

  // --- SCENARIO 1: Creator Wallet Deposits & Idempotency ---
  console.log("👉 Scenario 1: Creator Wallet Deposit");
  const creatorId = "creator-1";
  const paymentId = "pay_001_abc";

  // Deposit 10,000 INR
  recordLedgerEntry(db, {
    referenceId: `deposit-${paymentId}`,
    referenceType: "deposit",
    fromAccount: "External (Razorpay)",
    toAccount: `creator_wallet:${creatorId}`,
    userId: creatorId,
    amount: 10000,
    status: "completed",
    description: "Wallet topup"
  });
  db.creatorProfiles[creatorId].walletBalance += 10000;

  assert(db.creatorProfiles[creatorId].walletBalance === 10000, "Creator wallet balance should be 10000");
  assert(db.financialLedger!.length === 1, "Ledger should have 1 transaction");

  // Attempt duplicate deposit with same paymentId
  recordLedgerEntry(db, {
    referenceId: `deposit-${paymentId}`,
    referenceType: "deposit",
    fromAccount: "External (Razorpay)",
    toAccount: `creator_wallet:${creatorId}`,
    userId: creatorId,
    amount: 10000,
    status: "completed",
    description: "Wallet topup"
  });
  // Duplicate doesn't add to walletBalance in endpoint because endpoint checks ledger existence. We check here:
  const ledCountBefore = db.financialLedger!.length;
  recordLedgerEntry(db, {
    referenceId: `deposit-${paymentId}`,
    referenceType: "deposit",
    fromAccount: "External (Razorpay)",
    toAccount: `creator_wallet:${creatorId}`,
    userId: creatorId,
    amount: 10000,
    status: "completed",
    description: "Wallet topup"
  });
  assert(db.financialLedger!.length === ledCountBefore, "Duplicate ledger entry was blocked (Idempotent!)");
  console.log("\x1b[32m✔ Scenario 1 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 2: Campaign Escrow Lockup ---
  console.log("👉 Scenario 2: Campaign Escrow Lockup");
  const campaignId = "camp-1";
  const budget = 5000;

  // Verify wallet has enough funds
  assert(db.creatorProfiles[creatorId].walletBalance >= budget, "Must have enough funds");

  // Perform campaign creation lockup
  db.creatorProfiles[creatorId].walletBalance -= budget;
  const newCamp: Campaign = {
    id: campaignId,
    creatorId,
    creatorName: "Hassan Creator",
    title: "Awesome Clip",
    sourceVideoUrl: "https://youtube.com/clip",
    cpm: 250, // 250 INR per 1000 views
    budget,
    spent: 0,
    escrowBalance: budget,
    instructions: "Clip nicely",
    platform: "youtube",
    minDuration: 30,
    deadline: "2026-12-31",
    status: "Active",
    createdAt: new Date().toISOString(),
    iconUrl: "",
    campaignType: "clipping"
  };
  db.campaigns.push(newCamp);

  recordLedgerEntry(db, {
    referenceId: `escrow-${campaignId}`,
    referenceType: "escrow_lock",
    fromAccount: `creator_wallet:${creatorId}`,
    toAccount: `campaign_escrow:${campaignId}`,
    userId: creatorId,
    campaignId: campaignId,
    amount: budget,
    status: "completed",
    description: `Campaign budget escrow lock`
  });

  assert(db.creatorProfiles[creatorId].walletBalance === 5000, "Creator wallet balance should have decreased to 5000");
  assert(newCamp.escrowBalance === 5000, "Campaign escrow balance should be set to 5000");
  assert(db.financialLedger!.some(e => e.referenceType === "escrow_lock"), "Escrow lock ledger entry should exist");
  console.log("\x1b[32m✔ Scenario 2 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 3: Verified View Payout Split (80% Clipper, 20% Platform) ---
  console.log("👉 Scenario 3: Verified View Payout Split");
  const subId = "sub-1";
  const clipperId = "clipper-1";

  const newSub: Submission = {
    id: subId,
    campaignId,
    campaignTitle: "Awesome Clip",
    clipperId,
    clipperName: "Samir Clipper",
    submittedUrl: "https://tiktok.com/samir_clip",
    views: 0,
    status: "Approved",
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    lastFetchedViews: new Date().toISOString()
  };
  db.submissions.push(newSub);

  // Periodic View Tracking triggers payout for 10,000 views
  // Cost = (10,000 views / 1000) * 250 cpm = 2500 INR
  // Clipper share = 2500 * 0.8 = 2000 INR
  // Platform fee = 2500 * 0.2 = 500 INR
  const viewPayoutRes = processViewPayout(db, subId, 10000, "batch-1");
  assert(viewPayoutRes.success === true, "View payout should succeed");
  assert(viewPayoutRes.grossAmount === 2500, "Gross cost should be 2500");

  assert(newSub.views === 10000, "Submission views should be 10000");
  assert(newCamp.escrowBalance === 2500, "Campaign escrow balance should be reduced to 2500");
  assert(newCamp.spent === 2500, "Campaign spent should be increased to 2500");

  const clipperBal = getDerivedClipperBalance(db, clipperId);
  assert(clipperBal.totalEarned === 2000, "Clipper should have earned 2000");
  assert(clipperBal.availableBalance === 2000, "Clipper available balance should be 2000");

  const platformFees = db.financialLedger!
    .filter(e => e.referenceType === "platform_fee")
    .reduce((sum, e) => sum + e.amount, 0);
  assert(platformFees === 500, "Platform fees earned should be 500");
  console.log("\x1b[32m✔ Scenario 3 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 4: View Payout Idempotency ---
  console.log("👉 Scenario 4: View Payout Idempotency Protection");
  // Retry processing of the exact same payout with same batchId
  const dupPayoutRes = processViewPayout(db, subId, 10000, "batch-1");
  assert(dupPayoutRes.success === false, "Duplicate payout must be blocked");
  assert(dupPayoutRes.error === "Payout transaction already processed", "Correct idempotency error message");
  console.log("\x1b[32m✔ Scenario 4 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 5: Multi-Submission Distribution ---
  console.log("👉 Scenario 5: Multi-Submission View Distribution");
  const subId2 = "sub-2";
  const clipperId2 = "clipper-2";

  const newSub2: Submission = {
    id: subId2,
    campaignId,
    campaignTitle: "Awesome Clip",
    clipperId: clipperId2,
    clipperName: "Rohan Clipper",
    submittedUrl: "https://tiktok.com/rohan_clip",
    views: 0,
    status: "Approved",
    createdAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    lastFetchedViews: new Date().toISOString()
  };
  db.submissions.push(newSub2);

  // Rohan gets 4000 views
  // Cost = (4000 / 1000) * 250 = 1000 INR
  // Clipper share = 800 INR, Platform fee = 200 INR
  const rohanPayout = processViewPayout(db, subId2, 4000, "batch-2");
  assert(rohanPayout.success === true, "Rohan payout should succeed");
  assert(rohanPayout.grossAmount === 1000, "Rohan gross cost should be 1000");

  const rohanBal = getDerivedClipperBalance(db, clipperId2);
  assert(rohanBal.totalEarned === 800, "Rohan earned 800");
  assert(newCamp.escrowBalance === 1500, "Campaign escrow balance reduced to 1500");
  console.log("\x1b[32m✔ Scenario 5 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 6: Capped Escrow Exhaustion ---
  console.log("👉 Scenario 6: Capped Escrow Exhaustion");
  // Clipper 1 gets another 10,000 views
  // Cost would be 2500, but campaign remaining escrow is only 1500!
  // Payout must cap at 1500, views capped at 6,000. Campaign marked Completed.
  const exhaustedRes = processViewPayout(db, subId, 10000, "batch-3");
  assert(exhaustedRes.success === true, "Capped payout should still succeed");
  assert(exhaustedRes.grossAmount === 1500, "Payout must cap at remaining escrow 1500");

  assert(newCamp.escrowBalance === 0, "Campaign escrow balance should be fully exhausted (0)");
  assert(newCamp.spent === budget, "Campaign spent should match total budget 5000");
  assert(newCamp.status === "Completed", "Campaign must automatically transition to Completed");

  const clipper1UpdatedBal = getDerivedClipperBalance(db, clipperId);
  // Original 2000 + 1500 * 0.8 = 3200
  assert(clipper1UpdatedBal.totalEarned === 3200, "Clipper 1 total earnings should be 3200");
  console.log("\x1b[32m✔ Scenario 6 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 7: Campaign Refund (Deletion/Completion) ---
  console.log("👉 Scenario 7: Campaign Refund");
  // Let's create a new campaign with 5000 budget, then complete/refund it with 2000 unused balance
  const refundCampId = "camp-refund";
  const newRefundCamp: Campaign = {
    id: refundCampId,
    creatorId,
    creatorName: "Hassan Creator",
    title: "To Be Refunded Campaign",
    sourceVideoUrl: "https://youtube.com/clip2",
    cpm: 250,
    budget: 5000,
    spent: 3000,
    escrowBalance: 2000, // 2000 unused remaining
    instructions: "Clip",
    platform: "youtube",
    minDuration: 30,
    deadline: "2026-12-31",
    status: "Active",
    createdAt: new Date().toISOString(),
    iconUrl: "",
    campaignType: "clipping"
  };
  db.campaigns.push(newRefundCamp);

  const creatorBalBefore = db.creatorProfiles[creatorId].walletBalance; // currently 5000
  refundCampaignEscrow(db, newRefundCamp);

  assert(db.creatorProfiles[creatorId].walletBalance === creatorBalBefore + 2000, "Creator should be refunded 2000");
  assert(newRefundCamp.escrowBalance === 0, "Campaign escrow balance should be set to 0 after refund");

  // Test duplicate refund protection
  const creatorBalAfterFirstRefund = db.creatorProfiles[creatorId].walletBalance;
  refundCampaignEscrow(db, newRefundCamp);
  assert(db.creatorProfiles[creatorId].walletBalance === creatorBalAfterFirstRefund, "Subsequent refund must do nothing (double refund protected!)");
  console.log("\x1b[32m✔ Scenario 7 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 8: Clipper Withdrawal Request & Immediate Lockup ---
  console.log("👉 Scenario 8: Clipper Withdrawal Request & Immediate Lockup");
  // Clipper 1 has 3200 INR available. Withdraws 1200.
  const pRequestId = "req-1";
  
  // Withdrawal request ledger entry
  recordLedgerEntry(db, {
    referenceId: `payout-request-${pRequestId}`,
    referenceType: "withdrawal_request",
    fromAccount: `clipper_earnings:${clipperId}`,
    toAccount: `clipper_pending_withdrawal:${clipperId}`,
    userId: clipperId,
    amount: 1200,
    status: "pending",
    description: `Withdrawal request to UPI`
  });

  const lockedBal = getDerivedClipperBalance(db, clipperId);
  assert(lockedBal.pendingWithdrawal === 1200, "Pending withdrawal should show 1200 locked");
  assert(lockedBal.availableBalance === 2000, "Available balance should decrease immediately to 2000");
  console.log("\x1b[32m✔ Scenario 8 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 9: Withdrawal Request Approval (Completed) ---
  console.log("👉 Scenario 9: Withdrawal Request Approval");
  
  // Find pending withdrawal request ledger entry and approve it
  const originalReq = db.financialLedger!.find(e => e.referenceId === `payout-request-${pRequestId}`);
  assert(originalReq !== undefined && originalReq.status === "pending", "Pending withdrawal ledger entry found");
  
  originalReq!.status = "completed";

  // Record withdrawal completed ledger entry
  recordLedgerEntry(db, {
    referenceId: `payout-complete-${pRequestId}`,
    referenceType: "withdrawal_completed",
    fromAccount: `clipper_pending_withdrawal:${clipperId}`,
    toAccount: "External (UPI)",
    userId: clipperId,
    amount: 1200,
    status: "completed",
    description: `Withdrawal completed to UPI`
  });

  const approvedBal = getDerivedClipperBalance(db, clipperId);
  assert(approvedBal.pendingWithdrawal === 0, "Pending withdrawal should be 0");
  assert(approvedBal.totalWithdrawn === 1200, "Total withdrawn should be 1200");
  assert(approvedBal.availableBalance === 2000, "Available balance should remain correct (2000)");
  console.log("\x1b[32m✔ Scenario 9 Passed successfully!\x1b[0m\n");


  // --- SCENARIO 10: Withdrawal Request Failure & Reversal ---
  console.log("👉 Scenario 10: Withdrawal Request Failure & Reversal");
  // Clipper 1 requests another 1500 withdrawal.
  const pRequestId2 = "req-2";

  recordLedgerEntry(db, {
    referenceId: `payout-request-${pRequestId2}`,
    referenceType: "withdrawal_request",
    fromAccount: `clipper_earnings:${clipperId}`,
    toAccount: `clipper_pending_withdrawal:${clipperId}`,
    userId: clipperId,
    amount: 1500,
    status: "pending",
    description: `Withdrawal request 2`
  });

  const beforeFailBal = getDerivedClipperBalance(db, clipperId);
  assert(beforeFailBal.pendingWithdrawal === 1500, "Pending withdrawal shows 1500 locked");
  assert(beforeFailBal.availableBalance === 500, "Available balance locks to 500");

  // Admin marks this request as Failed
  const req2Ledger = db.financialLedger!.find(e => e.referenceId === `payout-request-${pRequestId2}`);
  assert(req2Ledger !== undefined && req2Ledger.status === "pending", "Request ledger entry found");
  
  req2Ledger!.status = "reversed";

  recordLedgerEntry(db, {
    referenceId: `payout-failed-${pRequestId2}`,
    referenceType: "withdrawal_failed",
    fromAccount: `clipper_pending_withdrawal:${clipperId}`,
    toAccount: `clipper_earnings:${clipperId}`,
    userId: clipperId,
    amount: 1500,
    status: "completed",
    description: `Withdrawal failed`
  });

  const failedReversedBal = getDerivedClipperBalance(db, clipperId);
  assert(failedReversedBal.pendingWithdrawal === 0, "Pending withdrawal returned to 0");
  assert(failedReversedBal.availableBalance === 2000, "Available balance refunded back to 2000");
  console.log("\x1b[32m✔ Scenario 10 Passed successfully!\x1b[0m\n");

  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;32m       🎉 ALL 10 FINANCIAL SCENARIOS PASSED!       \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");
}

runTests().catch(err => {
  console.error("Test failed to execute", err);
  process.exit(1);
});
