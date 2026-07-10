---
name: CareerAI real payment gateway integration
description: How the WeChat/Alipay payment flow works via the ICBC-backed merchant gateway, and constraints to preserve.
---

The app charges via a custom merchant gateway (`payment.aieducenter.com`, ICBC-backed), not
Stripe. Credentials are `PAYMENT_API_KEY` / `PAYMENT_API_SECRET` env secrets, used to build
HMAC-SHA256 signed request headers (`src/lib/payment-client.ts`).

**Why:** The gateway has no sandbox/simulated success path — every "paid" status must come from
either (a) actively querying the gateway's order-status endpoint, or (b) its async notify
callback. There is no legitimate way to mark an order paid client-side.

**How to apply:**
- Frontend polls `GET /api/payments/:businessOrderNo/status` every ~6s (not tighter — the gateway
  doc asks for restrained polling frequency) rather than offering a manual "confirm success" button.
- The QR shown to the user is the real `qrCodeUrl` returned by the gateway on order creation —
  never regenerate/re-render it through a third-party QR image service.
- The async notify callback endpoint must always ack HTTP 200 (even on internal errors) and must
  be idempotent, since the gateway does not retry but may redeliver.
- Referral-based free unlock requires 2 real, unclaimed `referral_conversion` log entries (not 1) —
  keep frontend copy ("2 friends") and backend threshold (`REFERRALS_REQUIRED_PER_CREDIT` in
  `server.ts`) in sync if this changes again.
