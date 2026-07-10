---
name: CareerAI fake-flow patterns
description: How this app's "fake" payment/referral success flows were disguised, and where similar issues may still lurk.
---

The referral "instant claim" flow and the general payment-confirm flow both called endpoints
(`/api/verify-payment`, `/api/confirm-payment`) that do not exist in `server.ts`. In dev, these
requests fell through to Vite's SPA catch-all and returned a 200 HTML response, which the client
code treated as "success" — making the fake flow appear to work correctly during manual testing.

**Why:** This is easy to miss because the UI looked functional; only grepping `server.ts` for the
literal route strings revealed they were never defined. Response-status checks alone (`res.ok`)
are not sufficient proof a backend flow is real — verify the route exists server-side too.

**How to apply:** Before trusting any "it works" claim about a checkout/payment/registration flow,
grep the server file for the exact route path. If it's missing, the "success" is very likely a
fallback artifact, not real backend logic.

Update: both flows are now fully real. Referral claim requires 2 unclaimed, real
`referral_conversion` logs (bumped from 1). Payment now goes through a real bank-backed
gateway (WeChat/Alipay via an ICBC merchant service) with HMAC-signed requests — order
creation, active status polling, and an async notify callback are all implemented and
verified against the live gateway. See `careerai-payment-gateway.md` for integration details.
