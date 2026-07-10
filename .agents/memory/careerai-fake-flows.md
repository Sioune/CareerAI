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

Fixed so far (referral only): registration now records real `referredBy`/`referral_conversion`
event logs server-side; claiming requires `/api/referrals/claim` to find a real, unclaimed
conversion. The broader fake payment-confirm flow (`handleConfirmPaymentSuccess`,
`isSandboxPayment`) was intentionally left untouched — it was out of scope for the task that
uncovered this, but should be revisited if payments become a real requirement.
