import crypto from "crypto";

const PAYMENT_BASE_URL = "https://payment.aieducenter.com";

function apiKey(): string {
  const k = process.env.PAYMENT_API_KEY;
  if (!k) throw new Error("PAYMENT_API_KEY 未配置");
  return k;
}

function apiSecret(): string {
  const s = process.env.PAYMENT_API_SECRET;
  if (!s) throw new Error("PAYMENT_API_SECRET 未配置");
  return s;
}

export function isPaymentConfigured(): boolean {
  return !!process.env.PAYMENT_API_KEY && !!process.env.PAYMENT_API_SECRET;
}

function sha256Hex(data: string): string {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSha256Hex(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

function buildSignedHeaders(bodyRaw: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const bodyDigest = sha256Hex(bodyRaw);

  const signParams: Record<string, string> = {
    appId: apiKey(),
    bodyDigest,
    nonce,
    timestamp,
  };
  const stringToSign = Object.keys(signParams)
    .sort()
    .map((k) => `${k}=${signParams[k]}`)
    .join("&");
  const signature = hmacSha256Hex(stringToSign, apiSecret());

  return {
    "X-App-Id": apiKey(),
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Body-Digest": bodyDigest,
    "X-Sign": signature,
    "Content-Type": "application/json",
  };
}

async function paymentRequest(method: "GET" | "POST", path: string, body?: any): Promise<any> {
  const bodyRaw = body !== undefined ? JSON.stringify(body) : "";
  const headers = buildSignedHeaders(bodyRaw);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const resp = await fetch(`${PAYMENT_BASE_URL}${path}`, {
      method,
      headers,
      body: method === "POST" ? bodyRaw : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json || json.code !== 200) {
      const msg = json?.message || `支付服务请求失败 (HTTP ${resp.status})`;
      const err: any = new Error(msg);
      err.httpStatus = resp.status;
      err.paymentCode = json?.code;
      throw err;
    }
    return json.data;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error("支付服务请求超时，请稍后重试");
    }
    throw err;
  }
}

export interface CreatePaymentOrderParams {
  businessOrderNo: string;
  amount: number; // 分
  subject: string;
  body?: string;
  businessName?: string;
  notifyUrl: string;
  expiredSeconds?: number;
  attach?: string;
}

export async function createPaymentOrder(params: CreatePaymentOrderParams): Promise<any> {
  return paymentRequest("POST", "/api/v1/payments", params);
}

export async function queryPaymentStatus(paymentOrderNo: string): Promise<any> {
  return paymentRequest("POST", `/api/v1/payments/${encodeURIComponent(paymentOrderNo)}/query`);
}

export interface CreateRefundParams {
  businessOrderNo: string;
  paymentOrderNo: string;
  refundAmount: number;
  reason?: string;
  attach?: string;
  notifyUrl?: string;
  needAudit?: boolean;
}

export async function createRefund(params: CreateRefundParams): Promise<any> {
  return paymentRequest("POST", "/api/v1/refunds", params);
}

export async function queryRefundStatus(refundOrderNo: string): Promise<any> {
  return paymentRequest("GET", `/api/v1/refunds/${encodeURIComponent(refundOrderNo)}`);
}
