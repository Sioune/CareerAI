---
name: CareerAI admin back-office scope decision
description: Phase-1 scope chosen for the admin module against a much larger enterprise PRD.
---

A PRD (`CareerAI_后台管理系统_PRD_v1.0`) specifies a full enterprise admin system: 8-role RBAC, MFA, audit logs, versioned prices/prompts/config, append-only entitlement/finance/cost ledgers, revenue allocation, CMS, AI provider/prompt management — an 8-week team build.

**Why:** Given the app's actual scale (single Express+React app, one dev), building the full PRD in one pass isn't realistic. User agreed to a phase-1 subset first.

**How to apply:** Phase-1 admin module (`/admin`, `src/admin/AdminApp.tsx`, admin API under `/api/admin/*` in `server.ts`) covers: business overview dashboard, user list/detail, task list, payment list, real refunds via the existing ICBC gateway client (`refunds` table, `createRefund`/`queryRefundStatus`), and referral ledger view.

Phase-2 (added later) layered in a subset of the deferred scope: simple RBAC (`admins.role` ∈ super_admin/operations/finance/customer_service/auditor, `requireRole()` middleware in server.ts, super_admin bypasses all checks), an append-only `audit_logs` table logging login/refund/role-change events, and a `cost_events` table that estimates Gemini token cost per AI call (illustrative unit pricing, not real billing) to compute gross margin on the finance tab.

Phase-3 added Maker-Checker (dual-approval) refunds: requesting a refund only creates a pending `refunds` row (status=0) with no gateway call; a separate admin must call the approve endpoint, which then invokes the real ICBC `createRefund`. Self-approval is blocked unless the approver is `super_admin`. Rejection has no such restriction (any authorized admin can reject). Still deferred: MFA, CMS/config versioning, AI prompt/model management, full financial ledger/revenue allocation, customer service tickets, risk control, notifications — check with the user before assuming these are in scope.
