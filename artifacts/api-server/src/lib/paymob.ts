/**
 * Paymob Payment Gateway Integration
 * Docs: https://developers.paymob.com/egypt/
 *
 * Flow:
 * 1. POST /api/paymob/intention  → get payment_key → return iframe URL to frontend
 * 2. Frontend opens iframe URL → customer pays
 * 3. Paymob sends webhook POST /api/paymob/webhook → we verify HMAC & update payment
 */

import crypto from "crypto";

export interface PaymobSettings {
  apiKey: string;
  integrationId: string;
  iframeId: string;
  hmacSecret: string;
}

export interface PaymobOrderItem {
  name: string;
  amount_cents: number;
  description?: string;
  quantity: number;
}

export interface PaymobBillingData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  country?: string;
  city?: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  postal_code?: string;
  state?: string;
}

// ─── Step 1: Authenticate and get auth_token ────────────────────────────────
export async function paymobAuthenticate(apiKey: string): Promise<string> {
  const res = await fetch("https://accept.paymob.com/api/auth/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paymob auth failed: ${err}`);
  }
  const data = await res.json();
  return data.token as string;
}

// ─── Step 2: Create order ────────────────────────────────────────────────────
export async function paymobCreateOrder(
  authToken: string,
  amountCents: number,
  items: PaymobOrderItem[]
): Promise<{ id: number }> {
  const res = await fetch("https://accept.paymob.com/api/ecommerce/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "EGP",
      items,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paymob order creation failed: ${err}`);
  }
  return res.json();
}

// ─── Step 3: Get payment key ─────────────────────────────────────────────────
export async function paymobGetPaymentKey(
  authToken: string,
  orderId: number,
  amountCents: number,
  integrationId: string,
  billing: PaymobBillingData
): Promise<string> {
  const res = await fetch("https://accept.paymob.com/api/acceptance/payment_keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: {
        first_name: billing.first_name || "N/A",
        last_name: billing.last_name || "N/A",
        email: billing.email,
        phone_number: billing.phone_number || "N/A",
        country: billing.country || "EG",
        city: billing.city || "Cairo",
        street: billing.street || "N/A",
        building: billing.building || "N/A",
        floor: billing.floor || "N/A",
        apartment: billing.apartment || "N/A",
        postal_code: billing.postal_code || "N/A",
        state: billing.state || "N/A",
      },
      currency: "EGP",
      integration_id: parseInt(integrationId),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Paymob payment key failed: ${err}`);
  }
  const data = await res.json();
  return data.token as string;
}

// ─── Build iframe URL ─────────────────────────────────────────────────────────
export function paymobIframeUrl(iframeId: string, paymentKey: string): string {
  return `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
}

// ─── Full flow: auth → order → payment key → iframe URL ──────────────────────
export async function createPaymobCheckout(
  settings: PaymobSettings,
  amountCents: number,
  billing: PaymobBillingData,
  items: PaymobOrderItem[]
): Promise<{ iframeUrl: string; paymobOrderId: number; paymentKey: string }> {
  const authToken = await paymobAuthenticate(settings.apiKey);
  const order = await paymobCreateOrder(authToken, amountCents, items);
  const paymentKey = await paymobGetPaymentKey(
    authToken,
    order.id,
    amountCents,
    settings.integrationId,
    billing
  );
  return {
    iframeUrl: paymobIframeUrl(settings.iframeId, paymentKey),
    paymobOrderId: order.id,
    paymentKey,
  };
}

// ─── HMAC Verification for webhook ───────────────────────────────────────────
// Paymob concatenates specific fields in a specific order then HMAC-SHA512
export function verifyPaymobHmac(
  hmacSecret: string,
  transactionData: Record<string, any>
): boolean {
  // The exact fields Paymob uses for HMAC (in this order)
  const fields = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order.id",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success",
  ];

  const msg = fields
    .map((field) => {
      if (field.includes(".")) {
        const [parent, child] = field.split(".");
        return transactionData[parent]?.[child] ?? "";
      }
      return transactionData[field] ?? "";
    })
    .join("");

  const computed = crypto
    .createHmac("sha512", hmacSecret)
    .update(msg)
    .digest("hex");

  return computed === transactionData.hmac;
}
