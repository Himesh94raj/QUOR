import Razorpay from "razorpay";
import crypto from "crypto";

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
  private webhookSecret: string;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!keyId || !keySecret || !webhookSecret) {
      throw new Error("Missing Razorpay credentials: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET are required when using the razorpay payment provider.");
    }

    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createOrder(input: {
    userId: string;
    amountPaise: number;
    currency: string;
  }): Promise<PaymentOrder> {
    if (!input.amountPaise || typeof input.amountPaise !== "number" || input.amountPaise <= 0 || !Number.isInteger(input.amountPaise)) {
      throw new Error("Invalid payment amount: amountPaise must be a positive integer representing paise.");
    }

    const instance = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret
    });

    const receipt = `receipt_user_${input.userId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    const order = await instance.orders.create({
      amount: input.amountPaise,
      currency: input.currency,
      receipt: receipt
    });

    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      receipt: order.receipt
    };
  }

  async verifyPayment(input: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<PaymentVerificationResult> {
    if (!input.orderId || !input.paymentId || !input.signature) {
      return {
        success: false,
        orderId: input.orderId,
        error: "Missing parameters for payment verification"
      };
    }

    try {
      const generatedSignature = crypto
        .createHmac("sha256", this.keySecret)
        .update(input.orderId + "|" + input.paymentId)
        .digest("hex");

      let isValid = false;
      try {
        if (typeof input.signature === "string" && generatedSignature.length === input.signature.length) {
          isValid = crypto.timingSafeEqual(
            Buffer.from(generatedSignature, "utf-8"),
            Buffer.from(input.signature, "utf-8")
          );
        }
      } catch (e) {
        isValid = false;
      }

      if (!isValid) {
        if (generatedSignature !== input.signature) {
          return {
            success: false,
            orderId: input.orderId,
            error: "Invalid Razorpay payment signature"
          };
        }
      }

      return {
        success: true,
        orderId: input.orderId,
        paymentId: input.paymentId
      };
    } catch (err: any) {
      return {
        success: false,
        orderId: input.orderId,
        error: `Signature verification failed: ${err.message}`
      };
    }
  }
}

export function getPaymentProvider(): PaymentProvider {
  const providerType = (process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
  if (providerType === "razorpay") {
    return new RazorpayPaymentProvider();
  } else if (providerType === "mock") {
    return new MockPaymentProvider();
  } else {
    throw new Error(`Unsupported payment provider: ${process.env.PAYMENT_PROVIDER}. Allowed providers are 'mock' or 'razorpay'.`);
  }
}
