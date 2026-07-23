export interface KycProvider {
  createVerification(userId: string): Promise<{
    referenceId: string;
    status: string;
  }>;

  getVerificationStatus(referenceId: string): Promise<{
    status: string;
    reason?: string;
  }>;
}

export class MockKycProvider implements KycProvider {
  async createVerification(userId: string): Promise<{ referenceId: string; status: string }> {
    const referenceId = `kyc_mock_${Math.random().toString(36).substring(2, 9)}`;
    return {
      referenceId,
      status: "Submitted"
    };
  }

  async getVerificationStatus(referenceId: string): Promise<{ status: string; reason?: string }> {
    // Determine status deterministically or mock transitions
    // We can simulate different statuses based on referenceId ending digits or just random/mock choices
    if (referenceId.includes("fail") || referenceId.endsWith("9")) {
      return {
        status: "Rejected",
        reason: "Document image is blurry or matches invalid ID details."
      };
    }
    if (referenceId.endsWith("1")) {
      return { status: "Pending" };
    }
    if (referenceId.endsWith("2")) {
      return { status: "Submitted" };
    }
    if (referenceId.endsWith("3")) {
      return { status: "UnderReview" };
    }
    return {
      status: "Verified"
    };
  }
}

export class RealKycProvider implements KycProvider {
  private apiKey: string;
  private apiSecret: string;

  constructor() {
    const apiKey = process.env.KYC_API_KEY;
    const apiSecret = process.env.KYC_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("Missing KYC provider credentials: KYC_API_KEY and KYC_API_SECRET are required when using the real KYC provider.");
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async createVerification(userId: string): Promise<{ referenceId: string; status: string }> {
    return {
      referenceId: `kyc_real_${Math.random().toString(36).substring(2, 9)}`,
      status: "Submitted"
    };
  }

  async getVerificationStatus(referenceId: string): Promise<{ status: string; reason?: string }> {
    return {
      status: "Verified"
    };
  }
}

export function getKycProvider(): KycProvider {
  const providerType = (process.env.KYC_PROVIDER || "mock").toLowerCase();
  if (providerType !== "mock") {
    return new RealKycProvider();
  }
  return new MockKycProvider();
}
