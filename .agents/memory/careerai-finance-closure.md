---
name: CareerAI finance closure model
description: Recognition/ledger invariants for the admin 财务闭环 (entitlement/finance/cost ledgers, revenue allocation, reconciliation) — how money is counted and why.
---

# CareerAI finance-closure invariants

Append-only ledgers back the admin finance module (权益账本 / 资金账本 / 成本账本 = enhanced cost_events). State table `reconciliations` is the only one that gets UPDATEd (status lifecycle).

## Recognition model (do not "simplify" this)
- **Revenue is recognized at FULFILLMENT (the optimize-resume gate), NOT at payment.** Payment only records cash + a deferred liability.
- `deferred = (cashIn − refund) − recognizedNet`. Cash口径 and 履约口径 are *different accounts* — never sum the whole finance_ledger; always group by `entry_type`.
- Signs: PAYMENT_RECEIVED / REVENUE_ALLOCATED positive; REFUND / PAYMENT_FEE / REVENUE_REVERSAL stored negative (negate for display).
- Single purchase = 100% of net allocated to its task at fulfillment; refunds post a REVENUE_REVERSAL (append, never delete the original allocation).
- **Why:** matches PRD §8.7 accrual intent; lets 毛利 be measured against delivered work, not cash float.

## Idempotency (non-negotiable)
- Every ledger insert is keyed by `UNIQUE(entry_type, ref_type, ref_id)` + `ON CONFLICT DO NOTHING`. ref_type/ref_id must always be non-null (else Postgres NULL-uniqueness lets dupes through).
- Payment success fires from BOTH poll and callback, plus a startup backfill of status=2 payments — all must be safe to run repeatedly. Consume keyed by (consume, task, taskId); allocation unique on payment_id.

## Cost = micro-cents
- `costMicroCents = tokensIn*inputPerMillion + tokensOut*outputPerMillion` (price is 分 per 1M tokens → exact integer micro-分). `costCents = round(micro/1e6)`. Storing only rounded cents makes small calls collapse to ¥0 in aggregate — keep the bigint micro column.
- Effective price via effective-dated `model_prices` lookup; constant fallback must equal the seed row or a lookup miss silently changes cost.

## Timezone (bit me during verification)
- Business day = `Asia/Shanghai`. `bizDateOf` = `toLocaleDateString('en-CA', {timeZone:'Asia/Shanghai'})` over the JS Date. Container TZ=UTC and node-pg parses `timestamp without time zone` as UTC, so this is correct.
- **Gotcha:** psql `paid_at AT TIME ZONE 'Asia/Shanghai'` on a naive column gives a DIFFERENT (misleading) date than node-pg's interpretation. When checking bizDate logic, reason from the raw stored value + node-pg UTC parse, not from psql AT TIME ZONE.
- Reconciliation matches ledger↔source by paymentId/refundId, NOT by ledger date — avoids TZ drift in matching.

## Known gaps (as of build; see follow-up tasks)
- Partial refund BEFORE fulfillment: no allocation yet ⇒ no reversal, and payment stays status 2, so a later fulfillment recognizes the FULL amount → overstates recognizedNet, drives deferred negative. (Full refund before fulfillment sets payment status 6, which correctly blocks recognition.)
- Reconciliation keys refund bizDate off `refunds.updatedAt`, which mutates on any later row update — a refund can silently migrate business days after close. Needs a frozen succeeded-at timestamp.
