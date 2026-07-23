export type UserRole = "clipper" | "creator" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  createdAt: string;
  isOwnerAdmin?: boolean;
  clipperProfile?: ClipperProfile | null;
  creatorProfile?: CreatorProfile | null;
  submissions?: Submission[];
  campaigns?: Campaign[];
  walletHistory?: WalletTransaction[];
  status?: "active" | "suspended" | "banned" | null;
  statusUntil?: string | null;
  statusReason?: string | null;
}

export type KYCStatus = "Pending" | "Verified" | "Rejected";

export interface ClipperProfile {
  userId: string;
  upiId: string;
  instagramHandle: string;
  youtubeHandle: string;
  kycStatus: KYCStatus;
  kycDocUrl: string;
  kycAadhaar: string;
  kycPan: string;
}

export interface CreatorProfile {
  userId: string;
  channelUrl: string;
  walletBalance: number;
}

export type CampaignStatus = "Draft" | "Active" | "Paused" | "Completed";
export type CampaignPlatform = "instagram" | "youtube" | "both" | "facebook" | "twitter";

export interface Campaign {
  id: string;
  creatorId: string;
  creatorName: string;
  title: string;
  sourceVideoUrl: string;
  cpm: number; // in ₹ INR
  budget: number; // in ₹ INR
  spent: number; // in ₹ INR
  escrowBalance?: number; // in ₹ INR
  instructions: string;
  platform: CampaignPlatform;
  minDuration: number; // in seconds
  deadline: string;
  status: CampaignStatus;
  createdAt: string;
  iconUrl?: string;
  campaignType?: "ugc" | "clipping" | "both";
}

export type SubmissionStatus = "Pending" | "Approved" | "Rejected";

export interface Submission {
  id: string;
  campaignId: string;
  campaignTitle: string;
  clipperId: string;
  clipperName: string;
  submittedUrl: string;
  status: SubmissionStatus;
  feedback?: string;
  approvedAt: string | null;
  views: number;
  lastFetchedViews: string | null;
}

export type WalletTxType = "deposit" | "payment" | "withdrawal" | "commission";
export type WalletTxStatus = "Pending" | "Completed" | "Failed";

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTxType;
  amount: number;
  status: WalletTxStatus;
  description: string;
  createdAt: string;
}

export type PayoutStatus = "Processing" | "Completed" | "Failed";

export interface PayoutRequest {
  id: string;
  clipperId: string;
  clipperName: string;
  upiId: string;
  amount: number;
  status: PayoutStatus;
  createdAt: string;
}

export interface FinancialLedgerEntry {
  id: string;
  referenceId: string;
  referenceType:
    | "deposit"
    | "escrow_lock"
    | "escrow_release"
    | "clipper_earning"
    | "platform_fee"
    | "withdrawal_request"
    | "withdrawal_completed"
    | "withdrawal_failed"
    | "refund";

  fromAccount: string;
  toAccount: string;
  userId?: string;
  campaignId?: string;
  submissionId?: string;
  amount: number;
  status: "pending" | "completed" | "reversed";
  description: string;
  createdAt: string;
}

export interface ClipperBalance {
  userId: string;
  totalEarned: number;
  totalWithdrawn: number;
  pendingWithdrawal: number;
  availableBalance: number;
}

export interface ViewPayoutEvent {
  submissionId: string;
  previousViews: number;
  newViews: number;
  verifiedViews: number;
  grossAmount: number;
  clipperAmount: number;
  platformAmount: number;
  processedAt: string;
}

export interface DbSchema {
  users: User[];
  clipperProfiles: Record<string, ClipperProfile>; // key is userId
  creatorProfiles: Record<string, CreatorProfile>; // key is userId
  campaigns: Campaign[];
  submissions: Submission[];
  walletHistory: WalletTransaction[];
  payoutRequests: PayoutRequest[];
  contacts?: ContactMessage[];
  financialLedger?: FinancialLedgerEntry[];
  clipperBalances?: Record<string, ClipperBalance>;
  viewPayoutEvents?: ViewPayoutEvent[];
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}
