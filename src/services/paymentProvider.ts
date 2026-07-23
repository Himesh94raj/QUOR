export interface PaymentOrder {
  id: string;
  amount: number; // in paise
  currency: string;
  status: string;
  receipt?: string;
  testMode?: boolean;
}

export interface PaymentVerificationResult {
  success: boolean;
  orderId: string;
  paymentId?: string;
  error?: string;
}

export interface PaymentProvider {
  createOrder(input: {
    userId: string;
    amountPaise: number;
    currency: string;
  }): Promise<PaymentOrder>;

  verifyPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentVerificationResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  async createOrder(input: {
    userId: string;
    amountPaise: number;
    currency: string;
  }): Promise<PaymentOrder> {
    const orderId = `order_mock_${Math.random().toString(36).substring(2, 9)}`;
    return {
      id: orderId,
      amount: input.amountPaise,
      currency: input.currency,
      status: "created",
      receipt: `receipt_user_${input.userId}`,
      testMode: true
    };
  }

  async verifyPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentVerificationResult> {
    // If the signature is "invalid_signature" or contains "fail", simulate failure
    if (input.signature === "invalid_signature" || input.signature.toLowerCase().includes("fail")) {
      return {
        success: false,
        orderId: input.orderId,
        error: "Invalid mock payment signature."
      };
    }

    return {
      success: true,
      orderId: input.orderId,
      paymentId: input.paymentId
    };
  }
}

export class RazorpayPaymentProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error("Missing Razorpay credentials: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when using the razorpay payment provider.");
    }

    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createOrder(input: {
    userId: string;
    amountPaise: number;
    currency: string;
  }): Promise<PaymentOrder> {
    // In future, we would import razorpay SDK or do a direct fetch:
    // const instance = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
    // const order = await instance.orders.create({ ... })
    // For now, we simulate API-like structure to show gateway readiness
    return {
      id: `order_rzp_${Math.random().toString(36).substring(2, 9)}`,
      amount: input.amountPaise,
      currency: input.currency,
      status: "created",
      receipt: `receipt_user_${input.userId}`
    };
  }

  async verifyPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentVerificationResult> {
    // In future, verify using crypto:
    // const hmac = crypto.createHmac("sha256", this.keySecret);
    // hmac.update(input.orderId + "|" + input.paymentId);
    // const generatedSignature = hmac.digest("hex");
    // const success = generatedSignature === input.signature;
    return {
      success: true,
      orderId: input.orderId,
      paymentId: input.paymentId
    };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const providerType = (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
  if (providerType === "razorpay") {
    return new RazorpayPaymentProvider();
  }
  return new MockPaymentProvider();
}
