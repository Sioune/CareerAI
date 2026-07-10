---
name: CareerAI admin back-office scope decision
description: Phase-1 scope chosen for the admin module against a much larger enterprise PRD.
---

A PRD (`CareerAI_后台管理系统_PRD_v1.0`) specifies a full enterprise admin system: 8-role RBAC, MFA, audit logs, versioned prices/prompts/config, append-only entitlement/finance/cost ledgers, revenue allocation, CMS, AI provider/prompt management — an 8-week team build.

**Why:** Given the app's actual scale (single Express+React app, one dev), building the full PRD in one pass isn't realistic. User agreed to a phase-1 subset first.

**How to apply:** Phase-1 admin module (`/admin`, `src/admin/AdminApp.tsx`, admin API under `/api/admin/*` in `server.ts`) covers: single-role admin login (JWT, `admins` table, no RBAC yet), business overview dashboard, user list/detail, task list, payment list, real refunds via the existing ICBC gateway client (`refunds` table, `createRefund`/`queryRefundStatus`), and referral ledger view. RBAC multi-role, MFA, audit logging, CMS, AI prompt/model versioning, cost-event/ledger accounting, and Maker-Checker approvals from the PRD are explicitly deferred — check with the user before assuming they're in scope for further admin work on this project.
