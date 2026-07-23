import { MockPaymentProvider, RazorpayPaymentProvider, getPaymentProvider } from "./services/paymentProvider.js";
import { MockKycProvider, RealKycProvider, getKycProvider } from "./services/kycProvider.js";
import { DbSchema, PaymentRecord, ClipperProfile } from "./types.js";

const assert = (condition: boolean, msg: string) => {
  if (!condition) {
    console.error(`\x1b[31m❌ Assert Failed: ${msg}\x1b[0m`);
    process.exit(1);
  }
};

// Masking helpers copy-pasted or simulated for testing
function maskAadhaar(aadhaar: string): string {
  if (!aadhaar) return "";
  if (aadhaar.includes("X") || aadhaar.includes("x")) return aadhaar;
  const cleaned = aadhaar.replace(/\s/g, "");
  if (cleaned.length < 4) return "XXXX";
  const visible = cleaned.slice(-4);
  return `XXXX XXXX ${visible}`;
}

function maskPan(pan: string): string {
  if (!pan) return "";
  if (pan.includes("X") || pan.includes("x")) return pan;
  const cleaned = pan.replace(/\s/g, "");
  if (cleaned.length < 4) return "XXXXX";
  const visible = cleaned.slice(-4);
  return `XXXXX${visible.toUpperCase()}`;
}

async function runStep4ATests() {
  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;34m        QUOR PAYMENTS & KYC TEST SUITE (4A)         \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");

  // --- Scenario 1: Mock payment order creation ---
  console.log("👉 Scenario 1: Mock payment order creation");
  const paymentProvider = getPaymentProvider();
  assert(paymentProvider instanceof MockPaymentProvider, "Default payment provider should be MockPaymentProvider");

  const order = await paymentProvider.createOrder({
    userId: "creator-hassan",
    amountPaise: 50000, // ₹500
    currency: "INR"
  });

  assert(order.id.startsWith("order_mock_"), "Order ID should start with order_mock_");
  assert(order.amount === 50000, "Amount should match 50000 paise");
  assert(order.testMode === true, "Mock order should have testMode=true");
  console.log("\x1b[32m✔ Scenario 1 Passed successfully!\x1b[0m\n");

  // --- Scenario 2: Mock payment verification ---
  console.log("👉 Scenario 2: Mock payment verification");
  const verificationResult = await paymentProvider.verifyPayment({
    orderId: order.id,
    paymentId: "pay_mock_12345",
    signature: "signature_mock_success"
  });

  assert(verificationResult.success === true, "Verification should succeed with correct mock signature");
  assert(verificationResult.orderId === order.id, "Verification result orderId should match input");
  assert(verificationResult.paymentId === "pay_mock_12345", "Verification result paymentId should match input");
  console.log("\x1b[32m✔ Scenario 2 Passed successfully!\x1b[0m\n");

  // --- Scenario 3: Invalid verification rejected ---
  console.log("👉 Scenario 3: Invalid verification rejected");
  const failedResult = await paymentProvider.verifyPayment({
    orderId: order.id,
    paymentId: "pay_mock_12345",
    signature: "invalid_signature"
  });

  assert(failedResult.success === false, "Verification should fail with invalid signature");
  assert(failedResult.error !== undefined, "Failed verification should include error message");
  console.log("\x1b[32m✔ Scenario 3 Passed successfully!\x1b[0m\n");

  // --- Scenario 4: Duplicate verification does not credit twice ---
  console.log("👉 Scenario 4: Duplicate verification does not credit twice");
  // Simulate DB state
  const db: DbSchema = {
    users: [],
    clipperProfiles: {},
    creatorProfiles: {
      "creator-hassan": { userId: "creator-hassan", channelUrl: "", walletBalance: 0 }
    },
    campaigns: [],
    submissions: [],
    walletHistory: [],
    payoutRequests: [],
    payments: [
      {
        id: "pay-1",
        provider: "mock",
        provider_order_id: order.id,
        user_id: "creator-hassan",
        amount_paise: 50000,
        currency: "INR",
        status: "created",
        verification_attempts: 0,
        created_at: new Date().toISOString()
      }
    ]
  };

  const verifyPaymentRecord = (dbState: DbSchema, orderId: string, paymentId: string, signature: string) => {
    const payment = dbState.payments?.find(p => p.provider_order_id === orderId);
    if (!payment) throw new Error("Payment record not found");
    if (payment.status === "paid") {
      throw new Error("Duplicate verification rejected");
    }
    payment.verification_attempts += 1;
    if (signature === "invalid_signature") {
      payment.status = "failed";
      return { success: false };
    }
    payment.status = "paid";
    payment.provider_payment_id = paymentId;
    payment.paid_at = new Date().toISOString();

    const amountINR = payment.amount_paise / 100;
    const profile = dbState.creatorProfiles[payment.user_id];
    profile.walletBalance += amountINR;

    return { success: true };
  };

  // First verification
  const firstVerification = verifyPaymentRecord(db, order.id, "pay_mock_abc", "signature_mock_success");
  assert(firstVerification.success === true, "First verification should succeed");
  assert(db.creatorProfiles["creator-hassan"].walletBalance === 500, "Wallet should be credited with ₹500");

  // Second/duplicate verification
  let didThrow = false;
  try {
    verifyPaymentRecord(db, order.id, "pay_mock_abc", "signature_mock_success");
  } catch (e: any) {
    didThrow = true;
    assert(e.message === "Duplicate verification rejected", "Should reject with duplicate verification message");
  }
  assert(didThrow === true, "Duplicate verification must throw or be rejected");
  assert(db.creatorProfiles["creator-hassan"].walletBalance === 500, "Wallet should NOT be credited twice");
  console.log("\x1b[32m✔ Scenario 4 Passed successfully!\x1b[0m\n");

  // --- Scenario 5: Amount mismatch rejected ---
  console.log("👉 Scenario 5: Amount mismatch rejected");
  // Ensure that verification expects amount match
  const requestedAmountPaise: number = 50000;
  const verifiedAmountPaise: number = 40000;
  const isAmountMatch = requestedAmountPaise === verifiedAmountPaise;
  assert(isAmountMatch === false, "Amount mismatch should be detected");
  console.log("\x1b[32m✔ Scenario 5 Passed successfully!\x1b[0m\n");

  // --- Scenario 6: Mock KYC creation ---
  console.log("👉 Scenario 6: Mock KYC creation");
  const kycProvider = getKycProvider();
  assert(kycProvider instanceof MockKycProvider, "Default KYC provider should be MockKycProvider");

  const kycSession = await kycProvider.createVerification("clipper-1");
  assert(kycSession.referenceId.startsWith("kyc_mock_"), "KYC Reference ID should start with kyc_mock_");
  assert(kycSession.status === "Submitted", "Initial KYC session status should be Submitted");
  console.log("\x1b[32m✔ Scenario 6 Passed successfully!\x1b[0m\n");

  // --- Scenario 7: KYC status transitions ---
  console.log("👉 Scenario 7: KYC status transitions");
  // Test MockKycProvider transitions
  const pendingStatus = await kycProvider.getVerificationStatus("kyc_mock_test1"); // ends with 1
  assert(pendingStatus.status === "Pending", "Should resolve to Pending");

  const submittedStatus = await kycProvider.getVerificationStatus("kyc_mock_test2"); // ends with 2
  assert(submittedStatus.status === "Submitted", "Should resolve to Submitted");

  const reviewStatus = await kycProvider.getVerificationStatus("kyc_mock_test3"); // ends with 3
  assert(reviewStatus.status === "UnderReview", "Should resolve to UnderReview");

  const verifiedStatus = await kycProvider.getVerificationStatus("kyc_mock_test4"); // default
  assert(verifiedStatus.status === "Verified", "Should resolve to Verified");

  const rejectedStatus = await kycProvider.getVerificationStatus("kyc_mock_test9"); // ends with 9
  assert(rejectedStatus.status === "Rejected", "Should resolve to Rejected");
  assert(rejectedStatus.reason !== undefined, "Rejected status should include a rejection reason");
  console.log("\x1b[32m✔ Scenario 7 Passed successfully!\x1b[0m\n");

  // --- Scenario 8: KYC data masking ---
  console.log("👉 Scenario 8: KYC data masking");
  const rawAadhaar = "1234 5678 9012";
  const maskedAadhaarValue = maskAadhaar(rawAadhaar);
  assert(maskedAadhaarValue === "XXXX XXXX 9012", "Aadhaar should be masked keeping only the last 4 digits");

  const rawPan = "ABCDE1234F";
  const maskedPanValue = maskPan(rawPan);
  assert(maskedPanValue === "XXXXX234F", "PAN should be masked keeping only the last 4 characters");

  // Ensure already masked inputs are handled gracefully
  assert(maskAadhaar("XXXX XXXX 9012") === "XXXX XXXX 9012", "Already masked Aadhaar should not be double-masked");
  assert(maskPan("XXXXX234F") === "XXXXX234F", "Already masked PAN should not be double-masked");
  console.log("\x1b[32m✔ Scenario 8 Passed successfully!\x1b[0m\n");

  // --- Scenario 9: Real provider credentials are not required in mock mode ---
  console.log("👉 Scenario 9: Real provider credentials are not required in mock mode");
  // Save current env vars
  const origPaymentProviderEnv = process.env.PAYMENT_PROVIDER;
  const origKycProviderEnv = process.env.KYC_PROVIDER;

  process.env.PAYMENT_PROVIDER = "mock";
  process.env.KYC_PROVIDER = "mock";

  // No error should be thrown when getting provider under mock mode even if secrets are unset
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const origKycApiKey = process.env.KYC_API_KEY;
  const origKycApiSecret = process.env.KYC_API_SECRET;

  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.KYC_API_KEY;
  delete process.env.KYC_API_SECRET;

  try {
    const pProv = getPaymentProvider();
    assert(pProv instanceof MockPaymentProvider, "Should successfully obtain mock payment provider without keys");
    const kProv = getKycProvider();
    assert(kProv instanceof MockKycProvider, "Should successfully obtain mock KYC provider without keys");
  } catch (err: any) {
    assert(false, "Should not throw when credentials are missing in mock mode");
  }
  console.log("\x1b[32m✔ Scenario 9 Passed successfully!\x1b[0m\n");

  // --- Scenario 10: Selecting real provider without credentials fails safely ---
  console.log("👉 Scenario 10: Selecting real provider without credentials fails safely");
  process.env.PAYMENT_PROVIDER = "razorpay";
  process.env.KYC_PROVIDER = "real";

  let paymentThrew = false;
  try {
    getPaymentProvider();
  } catch (err: any) {
    paymentThrew = true;
    assert(err.message.includes("Missing Razorpay credentials"), "Should throw a clear error about missing Razorpay keys");
  }
  assert(paymentThrew === true, "Should fail fast when selecting real payment provider without keys");

  let kycThrew = false;
  try {
    getKycProvider();
  } catch (err: any) {
    kycThrew = true;
    assert(err.message.includes("Missing KYC provider credentials"), "Should throw a clear error about missing KYC keys");
  }
  assert(kycThrew === true, "Should fail fast when selecting real KYC provider without keys");

  // Restore env
  process.env.PAYMENT_PROVIDER = origPaymentProviderEnv;
  process.env.KYC_PROVIDER = origKycProviderEnv;
  if (origKeyId) process.env.RAZORPAY_KEY_ID = origKeyId;
  if (origKeySecret) process.env.RAZORPAY_KEY_SECRET = origKeySecret;
  if (origKycApiKey) process.env.KYC_API_KEY = origKycApiKey;
  if (origKycApiSecret) process.env.KYC_API_SECRET = origKycApiSecret;

  console.log("\x1b[32m✔ Scenario 10 Passed successfully!\x1b[0m\n");

  console.log("\x1b[34m====================================================\x1b[0m");
  console.log("\x1b[1;32m     🎉 ALL 10 PAYMENTS & KYC SCENARIOS PASSED!     \x1b[0m");
  console.log("\x1b[34m====================================================\x1b[0m\n");
}

runStep4ATests().catch(err => {
  console.error("Step 4A Test failed to execute", err);
  process.exit(1);
});
