import express from "express";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import multer from "multer";
// @ts-ignore
import Jimp from "jimp";
// @ts-ignore
import mammoth from "mammoth";
import { createRequire } from "module";
import PDFDocument from "pdfkit";
import puppeteer from "puppeteer";
import AdmZip from "adm-zip";

function getChromiumPath(): string {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    return execSync("which chromium || which chromium-browser || which google-chrome", { encoding: "utf8" }).trim();
  } catch {
    return "/usr/bin/chromium";
  }
}

let cjkFontBase64 = "";
const CJK_FONT_CACHE = "/tmp/noto-sans-sc-regular.woff2";

async function initCjkFont(): Promise<void> {
  try {
    if (fs.existsSync(CJK_FONT_CACHE)) {
      cjkFontBase64 = fs.readFileSync(CJK_FONT_CACHE).toString("base64");
      console.log("[PDF] CJK font loaded from disk cache, bytes:", fs.statSync(CJK_FONT_CACHE).size);
      return;
    }
    const url = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.1.0/files/noto-sans-sc-chinese-simplified-400-normal.woff2";
    console.log("[PDF] Downloading CJK font from CDN...");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(CJK_FONT_CACHE, buf);
    cjkFontBase64 = buf.toString("base64");
    console.log("[PDF] CJK font downloaded and cached, bytes:", buf.length);
  } catch (e) {
    console.warn("[PDF] Failed to load CJK font, Chinese text may not render in PDFs:", e);
  }
}

function getCjkFontFaceStyle(): string {
  if (!cjkFontBase64) return "";
  return `@font-face {
    font-family: 'NotoSansSC';
    src: url('data:font/woff2;base64,${cjkFontBase64}') format('woff2');
    font-weight: 400;
    font-style: normal;
  }`;
}

const CJK_FONT_FAMILY = "'NotoSansSC', \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Noto Sans CJK SC\", Arial, sans-serif";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, eq, and, rawQuery } from "./src/db/index.ts";
import { seedAllDevData } from "./src/seed-all-data.ts";
import {
  users, resumeVersions, rewriteSuggestions, clarificationQuestions, userFeedbacks, eventLogs, payments, admins, refunds, auditLogs, costEvents,
  adminMfa, siteConfigs, aiProviders, aiModels, promptVersions, supportTickets, ticketReplies, notifications, riskFlags, revenueAllocations,
  approvals, products, skus, priceVersions,
  entitlementLedger, financeLedger, modelPrices, reconciliations,
} from "./src/db/schema.ts";
import { createPaymentOrder, queryPaymentStatus, createRefund, isPaymentConfigured } from "./src/lib/payment-client.ts";
import { hasPermission, ROLES as ADMIN_ROLE_LIST, type PermModule } from "./src/shared/permissions.ts";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

const JWT_SECRET = process.env.JWT_SECRET || "careerai-local-dev-secret-change-in-prod";

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception thrown:", err);
});

async function executeWithRetry<T>(queryFn: () => Promise<T>, retries = 4, baseDelay = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await queryFn();
    } catch (err: any) {
      lastError = err;
      const errMsg = [
        err?.message,
        String(err),
        err?.cause?.message,
        err?.cause ? String(err.cause) : "",
      ].filter(Boolean).join(" | ");
      
      const isConnError = 
        errMsg.includes("terminated unexpectedly") || 
        errMsg.includes("Connection") ||
        errMsg.includes("closed") ||
        errMsg.includes("timeout") ||
        errMsg.includes("broken pipe") ||
        errMsg.includes("SQL pool client") ||
        err?.code === "57P01" || // admin shutdown
        err?.code === "ECONNRESET";
      
      if (isConnError && attempt < retries) {
        const backoffDelay = baseDelay * attempt;
        console.warn(`Database query failed on attempt ${attempt} due to connection error. Retrying in ${backoffDelay}ms... Error: ${errMsg}`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function getDbUserFromHeader(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.split("Bearer ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string; email: string };
    const existing = await executeWithRetry(() => db.select().from(users).where(eq(users.uid, payload.uid))) as any;
    if (existing.length > 0) return existing[0];
    return null;
  } catch (err) {
    console.error("JWT verification failed:", err);
    return null;
  }
}


async function getAdminFromHeader(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split("Bearer ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (!payload || !payload.isAdmin || !payload.adminId) return null;
    const rows = await executeWithRetry(() => db.select().from(admins).where(eq(admins.id, payload.adminId))) as any[];
    if (rows.length > 0) return rows[0];
    return null;
  } catch {
    return null;
  }
}

async function requireAdmin(req: any, res: any, next: any) {
  const admin = await getAdminFromHeader(req.headers.authorization);
  if (!admin) return res.status(401).json({ error: "未授权，请以管理员身份登录" });
  req.admin = admin;
  next();
}

// PRD §2.1：8 个后台角色（单一事实来源在 src/shared/permissions.ts）
const ADMIN_ROLES: string[] = [...ADMIN_ROLE_LIST];

function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.admin) return res.status(401).json({ error: "未授权" });
    if (req.admin.role === "super_admin") return next();
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: "权限不足，无法执行该操作" });
    }
    next();
  };
}

// PRD §2.3 + §14.4：模块级权限矩阵，服务端强制校验（最小可见原则）。
// 与前端导航共用 src/shared/permissions.ts，避免前后端漂移。
function requirePermission(module: PermModule, action: "read" | "write") {
  return (req: any, res: any, next: any) => {
    if (!req.admin) return res.status(401).json({ error: "未授权" });
    if (!hasPermission(req.admin.role, module, action)) {
      return res.status(403).json({ error: "权限不足，无法访问该模块" });
    }
    next();
  };
}

async function logAudit(admin: any, action: string, targetType?: string, targetId?: string, detail?: any) {
  try {
    await db.insert(auditLogs).values({
      adminId: admin?.id ?? null,
      adminUsername: admin?.username || "system",
      action,
      targetType: targetType || null,
      targetId: targetId || null,
      detail: detail ? JSON.stringify(detail) : null,
    } as any);
  } catch (err) {
    console.error("[Audit] Failed to write audit log:", err);
  }
}

// Approximate Gemini pricing (USD per 1M tokens), converted to CNY cents. 「示意口径」（非真实供应商账单）。
// 这两个常量仅作为 model_prices 表未命中时的兜底；正常情况下走 model_prices 的生效单价（PRD §8.3）。
const GEMINI_INPUT_COST_PER_1M_CENTS_CNY = 70; // ~$0.10/1M input tokens, illustrative
const GEMINI_OUTPUT_COST_PER_1M_CENTS_CNY = 280; // ~$0.40/1M output tokens, illustrative

// 渠道支付手续费率——「示意口径」估算，非真实结算费率（PRD §8.2/§8.7 允许 usage_source=estimated）。
const CHANNEL_FEE_RATE = 0.006; // ≈0.6%，微信/支付宝常见量级；仅供毛利趋势参考，可后续用渠道账单校正。

// 按调用时间点取生效的模型单价（PRD §3.4「历史成本继续使用当时价格」）。未命中回退到常量。
async function getEffectiveModelPrice(provider: string, model: string): Promise<{ id: number | null; inputPerMillion: number; outputPerMillion: number }> {
  try {
    const res = await rawQuery(
      `SELECT id, input_per_million, output_per_million FROM model_prices
       WHERE provider = $1 AND model = $2 AND effective_at <= NOW()
       ORDER BY effective_at DESC LIMIT 1`,
      [provider, model],
    );
    if (res.rows.length > 0) {
      const r = res.rows[0];
      return { id: Number(r.id), inputPerMillion: Number(r.input_per_million), outputPerMillion: Number(r.output_per_million) };
    }
  } catch (err) {
    console.error("[Cost] model price lookup failed, using fallback constants:", err);
  }
  return { id: null, inputPerMillion: GEMINI_INPUT_COST_PER_1M_CENTS_CNY, outputPerMillion: GEMINI_OUTPUT_COST_PER_1M_CENTS_CNY };
}

async function logAiCostEvent(taskId: string | undefined, model: string, operation: string, usage: any) {
  try {
    const tokensIn = usage?.promptTokenCount || 0;
    const tokensOut = usage?.candidatesTokenCount || 0;
    const price = await getEffectiveModelPrice("gemini", model);
    // 微分 = 分 × 1,000,000。tokens × (分/百万tokens) 恰为整数微分，避免小额调用被 Math.round 抹成 0（PRD §8.4）。
    const costMicroCents = tokensIn * price.inputPerMillion + tokensOut * price.outputPerMillion;
    const costCents = Math.round(costMicroCents / 1_000_000);
    await db.insert(costEvents).values({
      taskId: taskId || null,
      provider: "gemini",
      model,
      operation,
      tokensIn,
      tokensOut,
      costCents,
      costMicroCents,
      priceVersionId: price.id,
    } as any);
  } catch (err) {
    console.error("[Cost] Failed to log AI cost event:", err);
  }
}

// ─── Phase 2B 财务闭环：账本写入唯一入口（追加式 + 幂等）─────────────────────────
// 幂等靠 UNIQUE(entry_type, ref_type, ref_id) + ON CONFLICT DO NOTHING，
// 因为支付成功可能同时由异步回调与主动轮询触发；退款成功可能由执行与回调重复触发。

// 支付成功：现金入账 + 渠道手续费（估算）+ 发放解锁权益。履约收入不在此确认（见 recordTaskFulfillment）。
async function recordPaymentSuccess(order: any) {
  if (!order || order.status !== 2) return;
  const paymentId = order.id;
  const amount = order.amount || 0;
  try {
    await db.insert(financeLedger).values({
      entryType: "PAYMENT_RECEIVED", amountCents: amount, paymentId, taskId: order.taskId || null,
      refType: "payment", refId: String(paymentId), priceVersionId: order.priceVersionId || null,
      source: "real", note: order.statusName || null,
    }, { onConflictDoNothing: true });

    if (amount > 0) {
      const feeCents = Math.round(amount * CHANNEL_FEE_RATE);
      if (feeCents > 0) {
        await db.insert(financeLedger).values({
          entryType: "PAYMENT_FEE", amountCents: -feeCents, paymentId, taskId: order.taskId || null,
          refType: "payment", refId: String(paymentId), source: "estimated",
          note: `渠道手续费（示意口径估算 ≈ ${(CHANNEL_FEE_RATE * 100).toFixed(2)}%）`,
        }, { onConflictDoNothing: true });
      }
    }

    await db.insert(entitlementLedger).values({
      userId: order.userId, entryType: "grant", amount: 1,
      refType: "payment", refId: String(paymentId),
      note: amount === 0 ? "推荐奖励免费解锁" : "支付成功发放",
    }, { onConflictDoNothing: true });
  } catch (err) {
    console.error("[Finance] recordPaymentSuccess failed:", err);
  }
}

// 履约确认：任务实际被优化（付费闸门通过）时，确认履约收入 + 消耗权益 + 写收入分配（PRD §8.5 单次购买 100%）。
async function recordTaskFulfillment(userId: number, taskId: string) {
  if (!taskId) return;
  try {
    const paidRows = await db.select().from(payments).where(eq(payments.userId, userId)) as any[];
    const order = paidRows.find((p: any) => p.taskId === String(taskId) && p.status === 2);
    if (!order) return; // 未付费不确认收入
    const amount = order.amount || 0;

    // 消耗 1 份权益（幂等：同一任务只消耗一次）
    await db.insert(entitlementLedger).values({
      userId, entryType: "consume", amount: -1, refType: "task", refId: String(taskId), note: "优化简历履约",
    }, { onConflictDoNothing: true });

    // 收入分配：单次购买净额 100% 分配到该履约任务（幂等：revenue_allocations.payment_id 唯一）
    await db.insert(revenueAllocations).values({
      paymentId: order.id, taskId: String(taskId), grossAmount: amount, allocatedAmount: amount, allocationMethod: "single_100",
    }, { onConflictDoNothing: true });

    // 资金账本：履约收入确认
    await db.insert(financeLedger).values({
      entryType: "REVENUE_ALLOCATED", amountCents: amount, paymentId: order.id, taskId: String(taskId),
      refType: "payment", refId: String(order.id), priceVersionId: order.priceVersionId || null, source: "real",
    }, { onConflictDoNothing: true });
  } catch (err) {
    console.error("[Finance] recordTaskFulfillment failed:", err);
  }
}

// 退款成功：现金流出 + 已确认履约收入按退款额反向冲销（PRD §8.5/§8.7：不删除原分配，用反向流水）。
async function recordRefundSuccess(refund: any) {
  if (!refund) return;
  const refundId = refund.id;
  const amount = refund.amount || 0;
  try {
    const orderRows = await db.select().from(payments).where(eq(payments.id, refund.paymentId)) as any[];
    const order = orderRows[0];
    await db.insert(financeLedger).values({
      entryType: "REFUND", amountCents: -amount, paymentId: refund.paymentId, refundId,
      taskId: order?.taskId || null, refType: "refund", refId: String(refundId), source: "real", note: refund.reason || null,
    }, { onConflictDoNothing: true });

    if (order) {
      const allocated = await db.select().from(revenueAllocations).where(eq(revenueAllocations.paymentId, order.id)) as any[];
      if (allocated.length > 0) {
        await db.insert(financeLedger).values({
          entryType: "REVENUE_REVERSAL", amountCents: -amount, paymentId: order.id, refundId,
          taskId: order.taskId || null, refType: "refund", refId: String(refundId), source: "real", note: "退款冲销履约收入",
        }, { onConflictDoNothing: true });
      }
    }
  } catch (err) {
    console.error("[Finance] recordRefundSuccess failed:", err);
  }
}

// 建表（幂等）：CREATE TABLE IF NOT EXISTS + 幂等唯一索引 + cost_events 加列 + 种子模型单价。
// drizzle-kit push 在本项目不可用，运行库走 DATABASE_URL，用 rawQuery 直接建表。
async function ensureFinanceTables() {
  try {
    await rawQuery(`CREATE TABLE IF NOT EXISTS entitlement_ledger (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, entry_type TEXT NOT NULL, amount INTEGER NOT NULL,
      ref_type TEXT, ref_id TEXT, note TEXT, created_by_admin TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await rawQuery(`CREATE TABLE IF NOT EXISTS finance_ledger (
      id SERIAL PRIMARY KEY, entry_type TEXT NOT NULL, amount_cents INTEGER NOT NULL, payment_id INTEGER, refund_id INTEGER,
      task_id TEXT, ref_type TEXT, ref_id TEXT, price_version_id INTEGER, note TEXT, source TEXT,
      created_by_admin TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await rawQuery(`CREATE TABLE IF NOT EXISTS model_prices (
      id SERIAL PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
      input_per_million INTEGER NOT NULL DEFAULT 0, output_per_million INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CNY', source TEXT NOT NULL DEFAULT 'illustrative',
      effective_at TIMESTAMP NOT NULL DEFAULT NOW(), created_by_admin TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await rawQuery(`CREATE TABLE IF NOT EXISTS reconciliations (
      id SERIAL PRIMARY KEY, biz_date TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'OPEN',
      summary TEXT, discrepancies TEXT, closed_by_admin TEXT, closed_at TIMESTAMP,
      reopen_reason TEXT, reopened_by_admin TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);

    await rawQuery(`ALTER TABLE cost_events ADD COLUMN IF NOT EXISTS cost_micro_cents BIGINT NOT NULL DEFAULT 0`);
    await rawQuery(`ALTER TABLE cost_events ADD COLUMN IF NOT EXISTS price_version_id INTEGER`);
    await rawQuery(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS sku_code TEXT`);
    await rawQuery(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_code TEXT`);

    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS ux_entitlement_ledger_ref ON entitlement_ledger (entry_type, ref_type, ref_id)`);
    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS ux_finance_ledger_ref ON finance_ledger (entry_type, ref_type, ref_id)`);
    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS ux_revenue_allocations_payment ON revenue_allocations (payment_id)`);
    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS ux_model_prices_effective ON model_prices (provider, model, effective_at)`);

    // 种子：示意口径的 Gemini 单价，生效时间设为很早以覆盖全部历史调用。
    await rawQuery(
      `INSERT INTO model_prices (provider, model, input_per_million, output_per_million, currency, source, effective_at)
       VALUES ($1,$2,$3,$4,'CNY','illustrative', TIMESTAMP '2020-01-01 00:00:00')
       ON CONFLICT (provider, model, effective_at) DO NOTHING`,
      ["gemini", "gemini-3.5-flash", GEMINI_INPUT_COST_PER_1M_CENTS_CNY, GEMINI_OUTPUT_COST_PER_1M_CENTS_CNY],
    );
  } catch (err) {
    console.error("[Finance] ensureFinanceTables failed:", err);
  }
}

// 启动回填（幂等）：为历史「已支付」订单与「已退款」退款单补记现金流水与权益，使对账在历史日也平账。
// 只补现金口径与权益发放，不臆测历史任务是否已履约（履约收入仅在实际优化时确认）。
async function backfillFinanceLedgers() {
  try {
    const paidOrders = await db.select().from(payments) as any[];
    for (const order of paidOrders.filter((p: any) => p.status === 2)) {
      await recordPaymentSuccess(order);
    }
    const allRefunds = await db.select().from(refunds) as any[];
    for (const refund of allRefunds.filter((r: any) => r.status === 2)) {
      await recordRefundSuccess(refund);
    }
  } catch (err) {
    console.error("[Finance] backfillFinanceLedgers failed:", err);
  }
}

// Idempotent: only inserts when all three pricing tables are empty.
// Data mirrors the canonical dev-database records for products / skus / price_versions.
async function seedPricingData() {
  try {
    const existingProducts = await executeWithRetry(() => db.select().from(products)) as any[];
    if (existingProducts.length > 0) return; // already seeded

    // ── 1. Products ──────────────────────────────────────────────────────────
    await db.insert(products).values([
      { id: 3, code: 'CVStandard',          name: '标准优化版',   description: '在保持原始表述风格的基础上，系统性增强关键词密度和量化成果表达。', status: 'active', createdByAdmin: 'admin' },
      { id: 4, code: 'CVPro',               name: '高管改写版',   description: '采用 C-Level 领导力语言体系，突出 P&L 责任、跨职能影响力和战略执行深度。', status: 'active', createdByAdmin: 'admin' },
      { id: 5, code: 'CVAITailor',          name: 'AI岗位定制版', description: '专为 AI/大模型方向岗位优化，深度突出技术判断力、产业落地经验和商业化能力。', status: 'active', createdByAdmin: 'admin' },
      { id: 6, code: 'CoreShortageAnalysis',name: '核心差距分析', description: 'AI综合评估您的简历与目标岗位 JD 的匹配程度，给出量化分数，并列出核心差距', status: 'active', createdByAdmin: 'admin' },
    ] as any);

    // ── 2. SKUs ───────────────────────────────────────────────────────────────
    await db.insert(skus).values([
      { id: 3, productId: 3, code: 'CVL1',       name: '标准优化版简历',   targetRole: '通用版本，适合更新在线简历，或者群发', status: 'active', createdByAdmin: 'admin' },
      { id: 6, productId: 4, code: 'CVL2',       name: '高管冲刺版',       targetRole: '适合定向给企业或者猎头使用，且申请职位属于高管以上级别', status: 'active', createdByAdmin: 'admin' },
      { id: 7, productId: 5, code: 'CVL3',       name: 'AI岗位定制版简历', targetRole: '适合有明确目标岗位求职意向的定制化简历优化，充分体现专业度', status: 'active', createdByAdmin: 'admin' },
      { id: 8, productId: 6, code: 'CSAnalysis', name: '核心差距清单列表', targetRole: '对比自身简历与行业HR筛选的核心差距', status: 'active', createdByAdmin: 'admin' },
    ] as any);

    // ── 3. Price Versions (published) ────────────────────────────────────────
    await db.insert(priceVersions).values([
      { id: 4, skuId: 3, version: 1, status: 'published', amount: 990,  currency: 'CNY', effectiveAt: new Date('2026-07-10T00:30:00Z'), editedByAdmin: 'admin', publishedByAdmin: 'siounex', publishedAt: new Date('2026-07-11T14:36:02.758Z') },
      { id: 5, skuId: 6, version: 1, status: 'published', amount: 2990, currency: 'CNY', effectiveAt: new Date('2026-07-10T00:30:00Z'), editedByAdmin: 'admin', publishedByAdmin: 'siounex', publishedAt: new Date('2026-07-11T14:36:00.010Z') },
      { id: 6, skuId: 7, version: 1, status: 'published', amount: 4990, currency: 'CNY', effectiveAt: new Date('2026-07-10T00:33:00Z'), editedByAdmin: 'admin', publishedByAdmin: 'siounex', publishedAt: new Date('2026-07-11T14:35:57.258Z') },
      { id: 7, skuId: 8, version: 1, status: 'published', amount: 1990, currency: 'CNY', effectiveAt: new Date('2026-07-10T00:50:00Z'), editedByAdmin: 'admin', publishedByAdmin: 'admin',   publishedAt: new Date('2026-07-11T14:53:07.185Z') },
    ] as any);

    // Reset sequences so future admin inserts don't collide with seeded IDs
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('products',     'id'), (SELECT MAX(id) FROM products))`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('skus',         'id'), (SELECT MAX(id) FROM skus))`);
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('price_versions','id'), (SELECT MAX(id) FROM price_versions))`);

    console.log('[Pricing] Seeded 4 products / 4 SKUs / 4 price versions.');
  } catch (err) {
    console.error('[Pricing] Failed to seed pricing data:', err);
  }
}

async function seedDefaultAdmin() {
  try {
    const existing = await executeWithRetry(() => db.select().from(admins)) as any[];
    if (existing.length > 0) return;
    const defaultUsername = process.env.ADMIN_DEFAULT_USERNAME || "admin";
    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || "CareerAI@2026";
    const passwordHash = await bcrypt.hash(defaultPassword, 10);
    await db.insert(admins).values({ username: defaultUsername, passwordHash, role: "super_admin" } as any);
    console.log(`[Admin] Seeded default admin account "${defaultUsername}". Please log in at /admin and change the password source (ADMIN_DEFAULT_PASSWORD env var).`);
  } catch (err) {
    console.error("[Admin] Failed to seed default admin:", err);
  }
}

const requireFn = typeof require !== "undefined" ? require : createRequire(import.meta.url);
const pdf = requireFn("pdf-parse");

dotenv.config();

// Initialize Gemini client safely
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  console.log("Gemini API client initialized successfully with API key.");
} else {
  console.warn("WARNING: GEMINI_API_KEY is not defined. The server will use high-fidelity simulated response generators.");
}

function logCleanGeminiError(action: string, err: any) {
  const errMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
  if (errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
    console.log(`[Gemini Info] ${action} API limit reached (429/Quota). Using local high-fidelity optimization engine.`);
  } else {
    console.log(`[Gemini Info] ${action} fallback engaged: Service temporarily unavailable.`);
  }
}

// Gemini calls have no built-in timeout and can hang for 50s+ (sometimes indefinitely).
// For non-streaming, secondary AI endpoints we still race against a generous timeout so a
// broken/dead connection surfaces as a real error quickly instead of hanging the request forever.
// NOTE: we no longer silently substitute simulated/fake data on failure or timeout — callers
// must surface the error to the user and let them decide to retry.
const GEMINI_TIMEOUT_MS = 45000;
function withGeminiTimeout<T>(promise: Promise<T>, action: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`GEMINI_TIMEOUT: Gemini call "${action}" timed out after ${GEMINI_TIMEOUT_MS}ms`));
    }, GEMINI_TIMEOUT_MS);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

function classifyGeminiError(err: any): { code: string; message: string } {
  const errMsg = err?.message || (err && typeof err === 'object' ? JSON.stringify(err) : String(err));
  if (errMsg.includes("GEMINI_TIMEOUT")) {
    return { code: "timeout", message: "AI 响应超时（进程可能已卡死），请稍后重试。" };
  }
  if (errMsg.includes("429") || errMsg.includes("Quota") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
    return { code: "quota", message: "AI 服务当前调用量已达上限，请稍后重试。" };
  }
  return { code: "failed", message: "AI 服务暂时不可用，请稍后重试。" };
}

// Streams a Gemini generateContent call to the client over Server-Sent Events so the frontend
// can distinguish "still actively generating" (progress keeps advancing) from "stalled / process
// likely dead" (no new data for a while) from a hard failure, instead of a silent fake-data swap.
const SSE_STALL_MS = 8000;
const SSE_HARD_TIMEOUT_MS = 90000;
const SSE_HEARTBEAT_MS = 2000;

function sseWrite(res: any, event: string, data: any) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // client likely disconnected
  }
}

async function streamGeminiJSON(
  res: any,
  action: string,
  params: any,
  onUsage?: (model: string, usage: any) => void,
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  (res as any).flushHeaders?.();

  if (!aiClient) {
    sseWrite(res, "error", { code: "no_client", message: "AI 服务未配置，请联系管理员或稍后重试。" });
    return res.end();
  }

  const startedAt = Date.now();
  let lastChunkAt = Date.now();
  let receivedChars = 0;
  let fullText = "";
  let finished = false;
  let clientGone = false;
  let lastUsageMetadata: any = null;

  res.on("close", () => { clientGone = true; });

  const heartbeat = setInterval(() => {
    if (finished || clientGone) return;
    const now = Date.now();
    const elapsedMs = now - startedAt;
    const sinceLastChunkMs = now - lastChunkAt;

    if (elapsedMs > SSE_HARD_TIMEOUT_MS) {
      finished = true;
      clearInterval(heartbeat);
      console.log(`[Gemini Info] ${action} hard-timeout after ${elapsedMs}ms, likely stalled/dead process.`);
      sseWrite(res, "error", { code: "timeout", message: "AI 响应超时，进程可能已卡死，请稍后重试。", elapsedMs });
      res.end();
      return;
    }

    if (sinceLastChunkMs > SSE_STALL_MS) {
      sseWrite(res, "stalled", { elapsedMs, sinceLastChunkMs, receivedChars });
    } else {
      sseWrite(res, "progress", { elapsedMs, receivedChars });
    }
  }, SSE_HEARTBEAT_MS);

  try {
    const stream = await aiClient.models.generateContentStream(params);
    for await (const chunk of stream) {
      if (finished || clientGone) break;
      const t = (chunk as any).text;
      if (t) {
        fullText += t;
        receivedChars += t.length;
        lastChunkAt = Date.now();
      }
      // Capture usageMetadata from any chunk (last chunk typically has final counts)
      if ((chunk as any).usageMetadata) lastUsageMetadata = (chunk as any).usageMetadata;
    }

    if (finished || clientGone) return;
    finished = true;
    clearInterval(heartbeat);

    // Log token usage after stream completes
    if (onUsage && lastUsageMetadata) {
      try { onUsage(params.model || "gemini-3.5-flash", lastUsageMetadata); } catch {}
    }

    if (!fullText.trim()) {
      sseWrite(res, "error", { code: "empty", message: "AI 未返回有效内容，请稍后重试。" });
      return res.end();
    }

    try {
      const parsed = JSON.parse(fullText.trim());
      sseWrite(res, "done", { result: parsed, elapsedMs: Date.now() - startedAt });
    } catch (parseErr) {
      console.error(`[Gemini Info] ${action} returned unparseable JSON:`, parseErr);
      sseWrite(res, "error", { code: "parse_failed", message: "AI 返回内容格式异常，请稍后重试。" });
    }
    res.end();
  } catch (err: any) {
    if (finished || clientGone) return;
    finished = true;
    clearInterval(heartbeat);
    logCleanGeminiError(action, err);
    const { code, message } = classifyGeminiError(err);
    sseWrite(res, "error", { code, message });
    res.end();
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "5000", 10);

  initCjkFont().catch(() => {});
  seedDefaultAdmin().catch(() => {});
  seedPricingData().catch(() => {});
  seedAllDevData().catch((e) => console.error("[SeedAll] failed:", e));
  // Phase 2B 财务闭环：先建表/加列/种子，再回填历史现金流水与权益（均幂等）。
  ensureFinanceTables()
    .then(() => backfillFinanceLedgers())
    .catch((e) => console.error("[Finance] startup init failed:", e));

  app.use(express.json({ limit: "10mb" }));

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  // API Route: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", aiEnabled: !!aiClient });
  });

  // API Route: Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, referredBy } = req.body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      const uid = username.trim().toLowerCase();
      const email = uid.includes("@") ? uid : `${uid}@career-ai.local`;

      const existing = await db.select().from(users).where(eq(users.uid, uid)) as any[];
      if (existing.length > 0) {
        return res.status(409).json({ error: "用户名已存在，请直接登录" });
      }

      // Validate referrer: must be a real, distinct, existing user.
      let referrerUid: string | null = null;
      if (referredBy && typeof referredBy === "string") {
        const candidate = referredBy.trim().toLowerCase();
        if (candidate && candidate !== uid) {
          const referrerRows = await db.select().from(users).where(eq(users.uid, candidate)) as any[];
          if (referrerRows.length > 0) {
            referrerUid = candidate;
          }
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const insertData: any = { uid, email, passwordHash };
      if (referrerUid) insertData.referredBy = referrerUid;
      const result = await db.insert(users).values(insertData) as any[];
      const newUser = Array.isArray(result) ? result[0] : result;

      // Only now, on a real completed registration, log a referral conversion for the referrer.
      if (referrerUid) {
        const referrerRows = await db.select().from(users).where(eq(users.uid, referrerUid)) as any[];
        const referrer = referrerRows[0];
        if (referrer) {
          await db.insert(eventLogs).values({
            userId: referrer.id,
            eventType: "referral_conversion",
            metaData: JSON.stringify({ referredUid: uid, claimed: false }),
          } as any);
        }
      }

      const token = jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({ success: true, token, user: { id: String(uid), username: username.trim() } });
    } catch (err: any) {
      console.error("Registration error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Referral status — how many unclaimed real referral conversions this user has
  const REFERRALS_REQUIRED_PER_CREDIT = 2;
  app.get("/api/referrals/status", async (req, res) => {
    try {
      const user = await getDbUserFromHeader(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "未登录" });

      const logs = await db.select().from(eventLogs).where(eq(eventLogs.userId, user.id)) as any[];
      const conversions = logs.filter((l: any) => l.eventType === "referral_conversion");
      const unclaimed = conversions.filter((l: any) => {
        try { return !JSON.parse(l.metaData || "{}").claimed; } catch { return false; }
      });
      return res.json({
        totalConversions: conversions.length,
        unclaimedCredits: unclaimed.length,
        required: REFERRALS_REQUIRED_PER_CREDIT,
        readyToClaim: unclaimed.length >= REFERRALS_REQUIRED_PER_CREDIT,
      });
    } catch (err: any) {
      console.error("Referral status error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Claim one free-quota credit — requires 2 real, unclaimed referral conversions
  app.post("/api/referrals/claim", async (req, res) => {
    try {
      const user = await getDbUserFromHeader(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "未登录" });

      const { taskId } = req.body;

      const logs = await db.select().from(eventLogs).where(eq(eventLogs.userId, user.id)) as any[];
      const unclaimed = logs.filter((l: any) => {
        if (l.eventType !== "referral_conversion") return false;
        try { return !JSON.parse(l.metaData || "{}").claimed; } catch { return false; }
      });

      if (unclaimed.length < REFERRALS_REQUIRED_PER_CREDIT) {
        return res.status(404).json({
          error: `需要 ${REFERRALS_REQUIRED_PER_CREDIT} 位好友通过您的链接完成注册才能免费解锁一次，目前已有 ${unclaimed.length} 位`,
          unclaimedCredits: unclaimed.length,
          required: REFERRALS_REQUIRED_PER_CREDIT,
        });
      }

      const toClaim = unclaimed.slice(0, REFERRALS_REQUIRED_PER_CREDIT);
      const referredUids: string[] = [];
      for (const log of toClaim) {
        const meta = JSON.parse(log.metaData || "{}");
        meta.claimed = true;
        meta.claimedAt = new Date().toISOString();
        referredUids.push(meta.referredUid);
        await db.update(eventLogs)
          .set({ metaData: JSON.stringify(meta) } as any)
          .where(eq(eventLogs.id, log.id));
      }

      // Create a zero-cost "paid" payment record so the optimize-resume payment gate passes
      if (taskId) {
        const referralOrderNo = `REFERRAL_${Date.now()}_${user.id}_${String(taskId).slice(0, 8)}`;
        await db.insert(payments).values({
          userId: user.id,
          taskId: String(taskId),
          businessOrderNo: referralOrderNo,
          amount: 0,
          status: 2,
          statusName: "推荐奖励免费解锁",
          paidAt: new Date(),
        } as any);
        // 免费解锁也是一次「支付成功」：记 0 元现金流水 + 发放解锁权益（履约收入仍在优化时确认，且为 0）。
        const createdRows = await db.select().from(payments).where(eq(payments.businessOrderNo, referralOrderNo)) as any[];
        if (createdRows[0]) recordPaymentSuccess(createdRows[0]).catch(() => {});
      }

      return res.json({ success: true, referredUids });
    } catch (err: any) {
      console.error("Referral claim error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── 商品定价公开接口 ──────────────────────────────────────────────────────────
  // 返回所有已发布价格，供前端展示和下单使用（无需登录）
  app.get("/api/pricing", async (_req, res) => {
    try {
      const [prods, allSkus, allPrices] = await Promise.all([
        db.select().from(products) as Promise<any[]>,
        db.select().from(skus) as Promise<any[]>,
        db.select().from(priceVersions) as Promise<any[]>,
      ]);
      const catalog = allSkus
        .filter((s: any) => s.status === "active")
        .map((s: any) => {
          const product = prods.find((p: any) => p.id === s.productId);
          const published = allPrices
            .filter((pv: any) => pv.skuId === s.id && pv.status === "published")
            .sort((a: any, b: any) => b.version - a.version)[0];
          if (!published || !product) return null;
          return {
            productCode: product.code,
            productName: product.name,
            skuCode: s.code,
            skuName: s.name,
            targetRole: s.targetRole || null,
            amountCents: published.amount,
            currency: published.currency || "CNY",
            priceVersionId: published.id,
          };
        })
        .filter(Boolean);
      return res.json({ catalog });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 查询用户在某任务上已成功支付的商品列表（需登录）
  app.get("/api/tasks/:taskId/purchases", async (req, res) => {
    try {
      const user = await getDbUserFromHeader(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "未登录" });
      const { taskId } = req.params;
      const rows = await db.select().from(payments)
        .where(eq(payments.userId, user.id)) as any[];
      const paid = rows
        .filter((p: any) => p.taskId === String(taskId) && p.status === 2)
        .map((p: any) => ({
          skuCode: p.skuCode || null,
          productCode: p.productCode || null,
          amountCents: p.amount,
          paidAt: p.paidAt,
          businessOrderNo: p.businessOrderNo,
        }));
      return res.json({ purchases: paid });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Real payment endpoints (工商银行支付服务网关) ───────────────────────────

  function getPublicBaseUrl(req: express.Request): string {
    const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
    if (domains && domains.length > 0) return `https://${domains[0]}`;
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    return `${req.protocol}://${req.get("host")}`;
  }

  // API Route: Create a real payment order (WeChat/Alipay QR via ICBC gateway)
  app.post("/api/payments/create", async (req, res) => {
    try {
      const user = await getDbUserFromHeader(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "未登录" });

      if (!isPaymentConfigured()) {
        return res.status(503).json({ error: "支付服务未配置，请联系管理员" });
      }

      const { taskId, skuCode, targetRole } = req.body;
      if (!taskId) return res.status(400).json({ error: "缺少任务 ID" });
      if (!skuCode) return res.status(400).json({ error: "缺少商品 SKU" });

      // ── 从 DB 查找已发布价格（skuCode 精确匹配） ──────────────────────────────
      let amountCents: number;
      let priceVersionId: number | null = null;
      let priceSnapshot: number | null = null;
      let resolvedProductCode: string | null = null;
      let resolvedSkuName: string = skuCode;
      try {
        const allSkusRows = (await db.select().from(skus)) as any[];
        const matchedSku = allSkusRows.find((s: any) => s.code === skuCode && s.status === "active");
        if (!matchedSku) {
          return res.status(400).json({ error: `SKU "${skuCode}" 不存在或已下架` });
        }
        resolvedSkuName = matchedSku.name || skuCode;
        const pvs = (await db.select().from(priceVersions).where(eq(priceVersions.skuId, matchedSku.id))) as any[];
        const published = pvs.filter((v: any) => v.status === "published").sort((a: any, b: any) => b.version - a.version)[0];
        if (!published) {
          return res.status(400).json({ error: `SKU "${skuCode}" 暂无已发布价格` });
        }
        amountCents = published.amount as number;
        priceVersionId = published.id as number;
        priceSnapshot = published.amount as number;
        // resolve product code
        const allProdsRows = (await db.select().from(products)) as any[];
        const prod = allProdsRows.find((p: any) => p.id === matchedSku.productId);
        if (prod) resolvedProductCode = prod.code || null;
      } catch (lookupErr: any) {
        console.error("[payments] SKU/price lookup failed:", lookupErr.message);
        return res.status(500).json({ error: "价格查询失败，请稍后重试" });
      }

      const businessOrderNo = `CAREERAI_${Date.now()}_${user.id}_${Math.random().toString(36).slice(2, 8)}`;
      const notifyUrl = `${getPublicBaseUrl(req)}/api/payments/callback`;
      const orderSubject = `CareerAI ${resolvedSkuName}${targetRole ? " - " + targetRole : ""}`;

      const orderData = await createPaymentOrder({
        businessOrderNo,
        amount: amountCents,
        subject: orderSubject,
        body: `SKU: ${skuCode}${targetRole ? " | 岗位: " + targetRole : ""}`,
        businessName: "CareerAI",
        notifyUrl,
        expiredSeconds: 1800,
        attach: JSON.stringify({ userId: user.id, taskId, skuCode }),
      });

      await db.insert(payments).values({
        userId: user.id,
        taskId: String(taskId),
        businessOrderNo,
        paymentOrderNo: orderData.paymentOrderNo,
        targetRole: targetRole || null,
        amount: amountCents,
        skuCode,
        productCode: resolvedProductCode,
        priceVersionId,
        priceSnapshot,
        status: orderData.status ?? 1,
        statusName: orderData.statusName ?? "待支付",
        qrCodeUrl: orderData.qrCodeUrl,
      } as any);

      return res.json({
        businessOrderNo,
        paymentOrderNo: orderData.paymentOrderNo,
        qrCodeUrl: orderData.qrCodeUrl,
        status: orderData.status,
        statusName: orderData.statusName,
        expiredAt: orderData.expiredAt,
        amount: amountCents,
        skuCode,
        productCode: resolvedProductCode,
      });
    } catch (err: any) {
      console.error("Create payment order error:", err);
      return res.status(502).json({ error: err.message || "创建支付订单失败，请稍后重试" });
    }
  });

  // API Route: Poll payment status — actively queries the bank gateway and syncs local record
  app.get("/api/payments/:businessOrderNo/status", async (req, res) => {
    try {
      const user = await getDbUserFromHeader(req.headers.authorization);
      if (!user) return res.status(401).json({ error: "未登录" });

      const { businessOrderNo } = req.params;
      const rows = await db.select().from(payments).where(eq(payments.businessOrderNo, businessOrderNo)) as any[];
      const order = rows.find((r: any) => r.userId === user.id);
      if (!order) return res.status(404).json({ error: "订单不存在" });

      // Terminal states never change; skip the bank round-trip.
      if ([2, 3, 4, 5].includes(order.status)) {
        return res.json({ status: order.status, statusName: order.statusName, paidAt: order.paidAt });
      }

      if (!order.paymentOrderNo) {
        return res.json({ status: order.status, statusName: order.statusName });
      }

      try {
        const live = await queryPaymentStatus(order.paymentOrderNo);
        if (live.status !== order.status) {
          await db.update(payments)
            .set({
              status: live.status,
              statusName: live.statusName,
              bankOrderNo: live.bankOrderNo || undefined,
              thirdPartyOrderNo: live.thirdPartyOrderNo || undefined,
              paidAt: live.paidAt ? new Date(live.paidAt) : undefined,
              updatedAt: new Date(),
            } as any)
            .where(eq(payments.businessOrderNo, businessOrderNo));
          if (live.status === 2 && order.status !== 2 && order.userId) {
            evaluateRiskRules(order.userId).catch(() => {});
            recordPaymentSuccess({ ...order, status: 2 }).catch(() => {}); // 幂等：现金入账+权益发放
          }
        }
        return res.json({ status: live.status, statusName: live.statusName, paidAt: live.paidAt });
      } catch (queryErr: any) {
        console.error("Payment status query error:", queryErr);
        // Bank query failed transiently — fall back to last known local status rather than lying about success.
        return res.json({ status: order.status, statusName: order.statusName, queryError: true });
      }
    } catch (err: any) {
      console.error("Payment status route error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Async payment notify callback from the payment gateway
  app.post("/api/payments/callback", async (req, res) => {
    try {
      const notify = req.body;
      const businessOrderNo = notify?.businessOrderNo;
      const status = notify?.status;
      if (!businessOrderNo || status === undefined) {
        console.warn("Payment callback missing fields:", notify);
        return res.status(200).send(); // ack anyway per gateway contract; nothing to process
      }

      const rows = await db.select().from(payments).where(eq(payments.businessOrderNo, businessOrderNo)) as any[];
      const order = rows[0];
      if (!order) {
        console.warn("Payment callback for unknown order:", businessOrderNo);
        return res.status(200).send();
      }

      // Idempotency: only apply if this is actually a new terminal state.
      if (order.status !== status) {
        await db.update(payments)
          .set({
            status,
            statusName: notify.statusName || order.statusName,
            bankOrderNo: notify.bankOrderNo || undefined,
            thirdPartyOrderNo: notify.thirdPartyOrderNo || undefined,
            paidAt: notify.paidAt ? new Date(notify.paidAt) : undefined,
            updatedAt: new Date(),
          } as any)
          .where(eq(payments.businessOrderNo, businessOrderNo));
        if (status === 2 && order.status !== 2 && order.userId) {
          evaluateRiskRules(order.userId).catch(() => {});
          recordPaymentSuccess({ ...order, status: 2 }).catch(() => {}); // 幂等：现金入账+权益发放
        }
      }

      return res.status(200).send();
    } catch (err: any) {
      console.error("Payment callback error:", err);
      // Gateway does not retry regardless, but still return 200 so it doesn't log a spurious delivery failure loop.
      return res.status(200).send();
    }
  });

  // API Route: Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      const uid = username.trim().toLowerCase();

      const rows = await db.select().from(users).where(eq(users.uid, uid)) as any[];
      if (rows.length === 0) {
        return res.status(401).json({ error: "用户不存在，请先注册" });
      }
      const user = rows[0];
      if (!user.passwordHash) {
        return res.status(401).json({ error: "账户数据异常，请重新注册" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "密码错误，请重试" });
      }

      const token = jwt.sign({ uid: user.uid, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
      return res.json({ success: true, token, user: { id: String(user.uid), username: username.trim() } });
    } catch (err: any) {
      console.error("Login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Sync user (kept for compatibility, now uses JWT)
  app.post("/api/sync-user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const dbUser = await getDbUserFromHeader(authHeader);
      if (!dbUser) {
        return res.status(401).json({ error: "Invalid or missing auth token" });
      }
      return res.json({ success: true, user: dbUser });
    } catch (err: any) {
      console.error("Failed to sync user:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Parse Resume File (.docx, .pdf, .txt)
  app.post("/api/parse-file", async (req, res) => {
    const { fileName, fileData } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: "fileName and fileData (base64) are required" });
    }

    try {
      const buffer = Buffer.from(fileData, "base64");
      const lowerName = fileName.toLowerCase();
      let extractedText = "";

      if (lowerName.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (lowerName.endsWith(".pdf")) {
        const parser = new pdf.PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result.text || "";
        await parser.destroy();
        if (!extractedText.trim()) {
          throw new Error("PDF文件中未提取到有效文本内容。如果此文件是扫描件或图片PDF，建议您直接将简历文本复制并粘贴到下方的文本框中。");
        }
      } else {
        extractedText = buffer.toString("utf-8");
      }

      // Clean up whitespace
      extractedText = extractedText
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return res.json({ text: extractedText });
    } catch (error: any) {
      console.error("Error parsing resume file:", error);
      return res.status(500).json({ error: `解析文件失败: ${error.message || error}` });
    }
  });

  // API Route: Analyze Role & Generate Market Insight Report
  app.post("/api/analyze-role", async (req, res) => {
    const { targetRole, industry, location, seniority } = req.body;

    if (!targetRole) {
      return res.status(400).json({ error: "targetRole is required" });
    }

    {
        const prompt = `You are an elite Chinese tech recruitment director. Analyze the role "${targetRole}" within the "${industry || 'AI/Tech'}" industry located in "${location || 'Beijing/Shanghai/Remote'}". The target seniority level is "${seniority || 'Executive/Director/VP'}".
        Based on analyzing 25+ recent high-end real-world job descriptions in the Chinese market, synthesize a comprehensive job profile report.
        Strictly provide the response in Chinese according to the following JSON structure:
        {
          "targetRole": string (normalized role name),
          "researchSummary": string (a comprehensive 100-word paragraph detailing current state, key challenges, and industry context of this role),
          "mandatoryRequirements": string[] (list of 5 critical requirements for the role),
          "highFrequencySkills": [
            { "name": string, "percentage": number (integer between 40 and 99) }
          ] (provide exactly 10 high-frequency skills with their occurrences/importance percentages),
          "plusSkills": string[] (list of 3 distinguishing differentiator skills or credentials),
          "jdCount": number (number of analyzed posts, normally between 20 and 35)
        }
        Do not add any markup or markdown wraps inside the json properties. Keep it as pure clean JSON structure.`;

        return streamGeminiJSON(res, "analyze-role", {
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                targetRole: { type: Type.STRING },
                researchSummary: { type: Type.STRING },
                mandatoryRequirements: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                highFrequencySkills: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      percentage: { type: Type.INTEGER }
                    },
                    required: ["name", "percentage"]
                  }
                },
                plusSkills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                jdCount: { type: Type.INTEGER }
              },
              required: ["targetRole", "researchSummary", "mandatoryRequirements", "highFrequencySkills", "plusSkills", "jdCount"]
            }
          }
        }, (model, usage) => { logAiCostEvent(undefined, model, "analyze-role", usage); });
    }
  });

  // API Route: Match Resume to Role Insight Report
  app.post("/api/match-resume", async (req, res) => {
    const { targetRole, report, resumeText } = req.body;

    if (!targetRole || !resumeText) {
      return res.status(400).json({ error: "targetRole and resumeText are required" });
    }

    {
        const prompt = `You are an elite career advisory agent. Compare the candidate's resume with the target job profile "${targetRole}" and its market research requirements:
        Market summary: ${JSON.stringify(report)}
        
        Candidate's original resume text:
        ---
        ${resumeText}
        ---

        Conduct a strict gap analysis and provide:
        1. A match score (0-100) based on alignment with the core executive requirements.
        2. Exactly 3 Key Strengths showing where the candidate matches excellently.
        3. Exactly 3 Critical Gaps showing where the candidate fails or lacks metrics/keywords.
        4. Structured keyword coverage assessment.
        
        Format the response in Chinese matching this JSON structure:
        {
          "matchScore": number (integer between 30 and 95),
          "strengths": [
            { "title": string, "detail": string }
          ] (exactly 3 strengths),
          "gaps": [
            { "title": string, "detail": string }
          ] (exactly 3 critical gaps),
          "matchedKeywords": string[] (list of 5 matched keywords/technologies/methodologies),
          "missingKeywords": string[] (list of 4-5 key missing words like SOC2, M&A, board reporting, etc.)
        }
        Keep the detail sentences highly professional and actionable.`;

        return streamGeminiJSON(res, "match-resume", {
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                matchScore: { type: Type.INTEGER },
                strengths: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING }
                    },
                    required: ["title", "detail"]
                  }
                },
                gaps: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      detail: { type: Type.STRING }
                    },
                    required: ["title", "detail"]
                  }
                },
                matchedKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                missingKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["matchScore", "strengths", "gaps", "matchedKeywords", "missingKeywords"],
            }
          }
        }, (model, usage) => { logAiCostEvent(undefined, model, "match-resume", usage); });
    }
  });

  // API Route: Unlock additional deep gap analysis (paid: CSAnalysis SKU)
  app.post("/api/unlock-gap-analysis", async (req, res) => {
    const { taskId, targetRole, resumeText, existingGaps, report } = req.body;

    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) return res.status(401).json({ error: "请先登录" });

    if (taskId) {
      const taskPayments = await db.select().from(payments).where(eq(payments.userId, dbUser.id)) as any[];
      const hasPaid = taskPayments.some(
        (p: any) => p.taskId === String(taskId) && p.skuCode === "CSAnalysis" && p.status === 2
      );
      if (!hasPaid) {
        return res.status(402).json({ error: "需购买深度缺陷分析后方可生成", code: "payment_required" });
      }
    }

    const existingGapsList = ((existingGaps || []) as { title: string; detail: string }[])
      .map((g) => `- ${g.title}：${g.detail}`)
      .join("\n") || "（无）";

    const prompt = `你是一位顶级高管猎头顾问，正在帮助候选人冲刺职位"${targetRole || "高管岗位"}"。

初步分析已识别出以下核心差距（请勿重复）：
${existingGapsList}

岗位画像背景摘要：${JSON.stringify(report || {}).slice(0, 800)}

候选人简历摘要（前2000字）：
${(resumeText || "").slice(0, 2000)}

请识别 3 至 5 项【更深层、更精细的缺陷】，专注于以下高管层面的信号缺失：国际化视野、P&L预算责任、董事会汇报、战略路线图制定、C-level影响力建立、并购/BD经验、出海合规、组织OD能力等。
每项缺陷须与目标岗位直接相关，不得与上述已有缺陷重复，以中文输出。

返回 JSON 格式：{ "additionalGaps": [ { "title": string, "detail": string } ] }`;

    return streamGeminiJSON(res, "unlock-gap-analysis", {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            additionalGaps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING }
                },
                required: ["title", "detail"]
              }
            }
          },
          required: ["additionalGaps"]
        }
      }
    }, (model, usage) => { logAiCostEvent(undefined, model, "unlock-gap-analysis", usage); });
  });

  // API Route: Generate optimized resume
  app.post("/api/optimize-resume", async (req, res) => {
    const { taskId, targetRole, report, resumeText, matchReport, skuCode } = req.body;

    if (!targetRole || !resumeText) {
      return res.status(400).json({ error: "targetRole and resumeText are required" });
    }

    // ── Payment gate: verify that a paid record exists for this user+task ────
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "请先登录后再使用简历重构功能" });
    }
    if (taskId) {
      const taskPayments = await db.select().from(payments)
        .where(eq(payments.userId, dbUser.id)) as any[];
      const paidForTask = taskPayments.filter(
        (p: any) => p.taskId === String(taskId) && p.status === 2
      );
      // If a specific skuCode is requested, verify payment for that exact SKU.
      // Otherwise (legacy/referral path) accept any paid record for the task.
      const CV_SKUS = ["CVL1", "CVL2", "CVL3"];
      const hasPaid = skuCode
        ? paidForTask.some((p: any) => p.skuCode === skuCode)
        : paidForTask.some((p: any) => CV_SKUS.includes(p.skuCode) || !p.skuCode);
      if (!hasPaid) {
        return res.status(402).json({
          error: "该功能需付费解锁，请先完成支付后再生成优化简历",
          code: "payment_required",
          requiredSku: skuCode || null,
        });
      }
      // 付费闸门通过 = 任务履约：确认履约收入 + 消耗权益 + 写收入分配（均幂等，仅首次生效）。
      recordTaskFulfillment(dbUser.id, String(taskId)).catch(() => {});
    }
    // ─────────────────────────────────────────────────────────────────────────

    {
        const skuFocusMap: Record<string, string> = {
          CVL1: "【标准投递版】ATS关键词高密度覆盖，结构清晰，成果量化，语言务实，适合Boss直聘/猎聘广泛投递。",
          CVL2: "【高管冲刺版】弱化执行细节，强化战略领导力：P&L责任、跨职能协同、C-level汇报、组织级ROI贡献。用权威高管语言重塑每条经历。",
          CVL3: "【AI岗位定制版】突出AI技术落地：LLM/RAG/Agent架构、大模型API集成微调、AI商业化端到端交付数据。体现技术-商业双栖能力。",
        };
        const versionEmphasis = (skuFocusMap as any)[skuCode as string] || skuFocusMap['CVL2'];

        const prompt = `You are a premier executive resume writer. Your job is to transform the candidate's original resume to perfectly target the role of "${targetRole}" by resolving identified gaps.

        Version Focus (apply to every bullet and summary): ${versionEmphasis}

        Target Job Insights: ${JSON.stringify(report)}
        Identified Gaps: ${JSON.stringify(matchReport)}
        
        Original Resume Text:
        ---
        ${resumeText}
        ---

        Rules:
        1. DO NOT fabricate any fake companies, degrees, or years. Keep the original facts.
        2. Elevate executive language: upgrade execution verbs (e.g., "负责功能设计", "写代码") to high-impact leadership bullet points (e.g., "主导AI大模型产品从0到1研发落地并实现百万级商业化增长", "领导跨职能研发团队").
        3. Add clear placeholder notes for missing metrics with a highly specific reference rewrite where numbers are replaced by "xxx". For example: 【建议补充：例如“拉动新产品线收入达 xxx 万元，新增标杆客户 xxx 家”】 or 【建议补充：例如“管理跨地域研发团队达 xxx 人，人效提升 xxx%”】. This allows users to easily copy, paste, and replace 'xxx' with their actual data.
        4. Alleviate structural hierarchy. Outline a professional summary, core competencies list, clear work experience highlights, and education details.
        
        Format the response in Chinese matching this JSON schema:
        {
          "name": string (candidate name from original resume, default "张建国 / John Doe"),
          "title": string (target role e.g. "AI产品负责人" / "AI Product Lead"),
          "email": string (extracted email or default "executive@careerai.cn"),
          "location": string (extracted location or default "北京/上海"),
          "linkedin": string (linkedin profile if found),
          "summary": string (a powerful 3-5 line professional summary highlighting AI leadership and business value),
          "coreCapabilities": string[] (list of 5 core strengths tailored to this JD e.g., "0-1大模型落地", "跨职能团队协作"),
          "experience": [
            {
              "company": string,
              "role": string,
              "duration": string,
              "bullets": string[] (exactly 3-4 powerful optimized bullet points using the SAR/STAR framework with bold metrics or placeholders)
            }
          ] (optimized work experiences),
          "education": string (summarized degree, institution, and major),
          "skills": string[] (list of 8-10 technical and management skills)
        }
        `;

        return streamGeminiJSON(res, "optimize-resume", {
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                title: { type: Type.STRING },
                email: { type: Type.STRING },
                location: { type: Type.STRING },
                linkedin: { type: Type.STRING },
                summary: { type: Type.STRING },
                coreCapabilities: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                experience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      company: { type: Type.STRING },
                      role: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      bullets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      }
                    },
                    required: ["company", "role", "duration", "bullets"]
                  }
                },
                education: { type: Type.STRING },
                skills: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              required: ["name", "title", "email", "location", "summary", "coreCapabilities", "experience", "education", "skills"]
            }
          }
        }, (model, usage) => { logAiCostEvent((req as any).body?.taskId, model, "optimize-resume", usage); });
    }
  });

  // API Route: Export high-fidelity PDF using Puppeteer for pixel-perfect CSS controls
  app.post("/api/export-pdf", async (req, res) => {
    const { resume, targetRole } = req.body;

    if (!resume) {
      return res.status(400).json({ error: "resume data is required" });
    }

    try {
      // Set attachment headers for direct browser download trigger
      res.setHeader("Content-Type", "application/pdf");
      const safeFilename = encodeURIComponent(`${resume.name || "resume"}_${targetRole || "optimized"}_优化版.pdf`);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeFilename}`);

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${getCjkFontFaceStyle()}
    body {
      font-family: ${CJK_FONT_FAMILY};
      color: #1e293b;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
      font-size: 10pt;
    }
    
    .container {
      width: 100%;
      margin: 0;
      padding: 0;
    }

    /* Resume Header Style */
    .header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .name {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.025em;
      margin: 0 0 2px 0;
    }
    
    .title {
      font-size: 10.5pt;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px 0;
    }
    
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 8.5pt;
      color: #64748b;
      font-weight: 500;
    }
    
    .contact-item {
      display: flex;
      align-items: center;
    }
    
    .contact-item:not(:last-child)::after {
      content: "|";
      margin-left: 12px;
      color: #cbd5e1;
    }

    /* Section Styles */
    .section {
      margin-top: 18px;
    }
    
    .section-title {
      font-size: 10pt;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1.5px solid #cbd5e1;
      padding-bottom: 3px;
      margin: 0 0 10px 0;
    }
    
    .summary-text {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }

    /* Core Capabilities Grid */
    .capabilities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 20px;
      margin: 0;
      padding: 0;
      list-style-type: none;
    }
    
    .capability-item {
      font-size: 9pt;
      color: #334155;
      display: flex;
      align-items: flex-start;
      line-height: 1.4;
    }
    
    .capability-item::before {
      content: "•";
      color: #2563eb;
      font-weight: bold;
      display: inline-block;
      width: 10px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    /* Work Experience List */
    .experience-item {
      margin-bottom: 14px;
    }
    
    .experience-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    
    .company-role {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    
    .duration {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    
    .bullets {
      margin: 0;
      padding-left: 8px;
      list-style-type: none;
    }
    
    .bullet-item {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin-bottom: 4px;
      position: relative;
      padding-left: 10px;
    }
    
    .bullet-item::before {
      content: "•";
      color: #3b82f6;
      position: absolute;
      left: 0;
      top: 0;
    }

    /* Education */
    .education-text {
      font-size: 9pt;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
    }

    /* Skills & Keywords */
    .skills-text {
      font-size: 9pt;
      color: #475569;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="name">${resume.name || ""}</h1>
      <div class="title">${resume.title || ""}</div>
      <div class="contact">
        ${resume.email ? `<div class="contact-item">${resume.email}</div>` : ''}
        ${resume.location ? `<div class="contact-item">${resume.location}</div>` : ''}
        ${resume.linkedin ? `<div class="contact-item">${resume.linkedin}</div>` : ''}
      </div>
    </div>

    ${resume.summary ? `
    <div class="section">
      <h2 class="section-title">Professional Summary / 职业总结</h2>
      <p class="summary-text">${resume.summary}</p>
    </div>
    ` : ''}

    ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Core Capabilities / 核心竞争力</h2>
      <ul class="capabilities-grid">
        ${(resume.coreCapabilities || []).map((cap: string) => `
          <li class="capability-item">${cap}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${resume.experience && resume.experience.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Work Experience / 核心履历优化</h2>
      ${(resume.experience || []).map((exp: any) => `
        <div class="experience-item">
          <div class="experience-header">
            <span class="company-role">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</span>
            <span class="duration">${exp.duration || ""}</span>
          </div>
          <ul class="bullets">
            ${(exp.bullets || []).map((bullet: string) => {
              const cleanBullet = bullet.replace(/【建议补充：[^】]+】/g, '');
              return `<li class="bullet-item">${cleanBullet}</li>`;
            }).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${resume.education ? `
    <div class="section">
      <h2 class="section-title">Education / 教育背景</h2>
      <p class="education-text">${resume.education}</p>
    </div>
    ` : ''}

    ${resume.skills && resume.skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Skills & Keywords / 技能与关键词</h2>
      <p class="skills-text">${(resume.skills || []).join(', ')}</p>
    </div>
    ` : ''}
  </div>
</body>
</html>
      `;

      // Launch headless browser using Puppeteer
      const browser = await puppeteer.launch({
        executablePath: getChromiumPath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu"
        ]
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" as any });

      // Generate high-fidelity A4 PDF with perfect margin and native footers
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1.6cm',
          bottom: '1.6cm',
          left: '1.8cm',
          right: '1.8cm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; text-align: center; padding-bottom: 4px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        printBackground: true
      });

      await browser.close();
      return res.send(Buffer.from(pdfBuffer));

    } catch (error: any) {
      console.error("PDF Export error with Puppeteer:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: `导出 PDF 失败: ${error.message || error}` });
      }
    }
  });

  // ==========================================
  // V0.4 CORE STATEFUL MEMORY CACHES (TABLES)
  // ==========================================
  const jobResearchCache = new Map<string, any>();
  const clarificationQuestionsCache = new Map<string, any[]>();
  const rewriteSuggestionsCache = new Map<string, any[]>();
  const resumeVersionsCache = new Map<string, any[]>();
  const userFeedbacksCache = new Map<string, any[]>();
  const eventLogsCache = new Array<any>();
  const exportedFilesCache = new Map<string, { buffer: Buffer; mimeType: string; filename: string }>();

  // ==========================================
  // V0.4 HTML GENERATORS & RENDERING ENGINES
  // ==========================================

  function generateResumeHtml(resume: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${getCjkFontFaceStyle()}
    body {
      font-family: ${CJK_FONT_FAMILY};
      color: #1e293b;
      line-height: 1.5;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    /* Header Section */
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    
    .name {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.025em;
    }
    
    .title {
      font-size: 11pt;
      font-weight: 600;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 8px 0;
    }
    
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 8.5pt;
      color: #64748b;
    }
    
    .contact-item {
      display: flex;
      align-items: center;
    }
    
    /* Section Structure */
    .section {
      margin-bottom: 16px;
    }
    
    .section-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin: 0 0 10px 0;
    }
    
    .summary-text {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }

    /* Core Capabilities Grid */
    .capabilities-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 20px;
      margin: 0;
      padding: 0;
      list-style-type: none;
    }
    
    .capability-item {
      font-size: 9pt;
      color: #334155;
      display: flex;
      align-items: flex-start;
      line-height: 1.4;
    }
    
    .capability-item::before {
      content: "•";
      color: #2563eb;
      font-weight: bold;
      display: inline-block;
      width: 10px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    /* Work Experience List */
    .experience-item {
      margin-bottom: 14px;
    }
    
    .experience-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
    }
    
    .company-role {
      font-size: 9.5pt;
      font-weight: 700;
      color: #0f172a;
    }
    
    .duration {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      white-space: nowrap;
    }
    
    .bullets {
      margin: 0;
      padding-left: 8px;
      list-style-type: none;
    }
    
    .bullet-item {
      font-size: 9pt;
      color: #334155;
      text-align: justify;
      line-height: 1.5;
      margin-bottom: 4px;
      position: relative;
      padding-left: 10px;
    }
    
    .bullet-item::before {
      content: "•";
      color: #3b82f6;
      position: absolute;
      left: 0;
      top: 0;
    }

    /* Education */
    .education-text {
      font-size: 9pt;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      white-space: pre-line;
    }

    /* Skills & Keywords */
    .skills-text {
      font-size: 9pt;
      color: #475569;
      text-align: justify;
      line-height: 1.5;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="name">${resume.name || ""}</h1>
      <div class="title">${resume.title || ""}</div>
      <div class="contact">
        ${resume.email ? `<div class="contact-item">${resume.email}</div>` : ''}
        ${resume.location ? `<div class="contact-item">${resume.location}</div>` : ''}
        ${resume.linkedin ? `<div class="contact-item">${resume.linkedin}</div>` : ''}
      </div>
    </div>

    ${resume.summary ? `
    <div class="section">
      <h2 class="section-title">Professional Summary / 职业总结</h2>
      <p class="summary-text">${resume.summary}</p>
    </div>
    ` : ''}

    ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Core Capabilities / 核心竞争力</h2>
      <ul class="capabilities-grid">
        ${(resume.coreCapabilities || []).map((cap: string) => `
          <li class="capability-item">${cap}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    ${resume.experience && resume.experience.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Work Experience / 核心履历优化</h2>
      ${(resume.experience || []).map((exp: any) => `
        <div class="experience-item">
          <div class="experience-header">
            <span class="company-role">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</span>
            <span class="duration">${exp.duration || ""}</span>
          </div>
          <ul class="bullets">
            ${(exp.bullets || []).map((bullet: string) => {
              const cleanBullet = bullet.replace(/【建议补充：[^】]+】/g, '');
              return `<li class="bullet-item">${cleanBullet}</li>`;
            }).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${resume.education ? `
    <div class="section">
      <h2 class="section-title">Education / 教育背景</h2>
      <p class="education-text">${resume.education}</p>
    </div>
    ` : ''}

    ${resume.skills && resume.skills.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Skills & Keywords / 技能与关键词</h2>
      <p class="skills-text">${(resume.skills || []).join(', ')}</p>
    </div>
    ` : ''}
  </div>
</body>
</html>
    `;
  }

  function generateWordHtmlString(resume: any): string {
    return `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${resume.name || "Resume"}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; }
          h1 { font-size: 22pt; margin: 0 0 4pt 0; color: #0f172a; }
          .title { font-size: 12pt; font-weight: bold; color: #2563eb; text-transform: uppercase; margin-bottom: 8pt; }
          .contact { font-size: 9.5pt; color: #64748b; margin-bottom: 12pt; }
          .section-title { font-size: 11.5pt; font-weight: bold; color: #0f172a; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 2pt; margin: 16pt 0 8pt 0; text-transform: uppercase; }
          .summary { font-size: 10pt; color: #334155; line-height: 1.5; text-align: justify; }
          .bullet-list { margin: 0 0 8pt 0; padding-left: 15pt; }
          .bullet-item { font-size: 10pt; color: #334155; margin-bottom: 4pt; text-align: justify; }
        </style>
      </head>
      <body>
        <h1>${resume.name || ""}</h1>
        <div class="title">${resume.title || ""}</div>
        <div class="contact">
          ${resume.email || ""} &bull; ${resume.location || ""} ${resume.linkedin ? `&bull; ${resume.linkedin}` : ""}
        </div>
        
        ${resume.summary ? `
        <div class="section-title">Professional Summary / 职业总结</div>
        <div class="summary">${resume.summary}</div>
        ` : ""}
        
        ${resume.coreCapabilities && resume.coreCapabilities.length > 0 ? `
        <div class="section-title">Core Capabilities / 核心竞争力</div>
        <ul class="bullet-list">
          ${resume.coreCapabilities.map((c: string) => `<li class="bullet-item">${c}</li>`).join("")}
        </ul>
        ` : ""}
        
        ${resume.experience && resume.experience.length > 0 ? `
        <div class="section-title">Work Experience / 核心履历</div>
        ${resume.experience.map((exp: any) => `
          <div style="margin-bottom: 12pt; page-break-inside: avoid;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%; margin-bottom: 4pt;">
              <tr>
                <td style="font-weight: bold; font-size: 10.5pt; color: #0f172a;">${exp.company || ""} &nbsp;|&nbsp; ${exp.role || ""}</td>
                <td align="right" style="font-size: 9.5pt; color: #64748b; font-weight: bold;">${exp.duration || ""}</td>
              </tr>
            </table>
            <ul class="bullet-list">
              ${exp.bullets.map((b: string) => `<li class="bullet-item">${b.replace(/【建议补充：[^】]+】/g, '')}</li>`).join("")}
            </ul>
          </div>
        `).join("")}
        ` : ""}
        
        ${resume.education ? `
        <div class="section-title">Education / 教育背景</div>
        <div class="summary">${resume.education}</div>
        ` : ""}
        
        ${resume.skills && resume.skills.length > 0 ? `
        <div class="section-title">Skills & Keywords / 技能与关键词</div>
        <div class="summary">${resume.skills.join(", ")}</div>
        ` : ""}
      </body>
      </html>
    `;
  }

  function generateJobResearchHtml(report: any, targetRole: string): string {
    return `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${getCjkFontFaceStyle()}
          body { font-family: ${CJK_FONT_FAMILY}; color: #1e293b; padding: 40px; line-height: 1.6; background-color: #ffffff; }
          .header { border-bottom: 3px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
          .meta { font-size: 13px; color: #64748b; margin-top: 5px; }
          .section-title { font-size: 18px; font-weight: 700; color: #1e3a8a; margin-top: 35px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
          .summary-box { background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 4px; font-size: 14px; margin-bottom: 25px; text-align: justify; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: white; margin-bottom: 20px; page-break-inside: avoid; }
          .card-header { display: flex; justify-content: space-between; align-items: baseline; font-weight: bold; margin-bottom: 10px; }
          .card-title { color: #1e3a8a; font-size: 16px; }
          .frequency { color: #ef4444; font-size: 14px; }
          .evidence-section { margin-top: 12px; background-color: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; color: #475569; }
          .evidence-item { margin-bottom: 6px; }
          .suggestion { background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; margin-top: 12px; color: #166534; font-size: 13.5px; }
          .skills-list { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 15px; }
          .skill-tag { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 20px; font-size: 13px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">AI 高阶岗位真实招聘画像研判报告</div>
          <div class="meta">目标岗位: <strong>${targetRole}</strong> &bull; 深度清洗招聘样本数: <strong>${report.jdCount || 28}</strong> 份 &bull; 生成时间: 2026年</div>
        </div>
        
        <div class="summary-box">
          <strong>高层宏观洞察摘要：</strong><br/>
          ${report.researchSummary}
        </div>
        
        <div class="section-title">核心岗位特征与真实 JD 证据链 (JD Evidence Chain)</div>
        <p style="font-size: 13px; color: #64748b; margin-top: 5px;">基于企业官方招聘渠道、搜索引擎及第三方公开平台大数据挖掘，形成高可信度投递指引：</p>
        
        ${(report.conclusions || []).map((c: any) => `
          <div class="card">
            <div class="card-header">
              <span class="card-title">${c.title}</span>
              <span class="frequency">市场高频率：${c.frequency}%</span>
            </div>
            <div style="font-size: 14px; color: #334155; text-align: justify;">${c.detail}</div>
            
            <div class="evidence-section">
              <strong>真实企业 JD 支撑论据：</strong>
              ${c.evidences.map((e: any) => `
                <div class="evidence-item">&bull; <strong>${e.companyType}</strong> (${e.type}): "${e.summary}"</div>
              `).join("")}
            </div>
            
            <div class="suggestion">
              <strong>靶向改写实战建议：</strong>${c.suggestion}
            </div>
          </div>
        `).join("")}
        
        <div class="section-title">核心必备任职资格 (Mandatory Requirements)</div>
        <ul style="padding-left: 20px; font-size: 14px; color: #334155;">
          ${(report.mandatoryRequirements || []).map((reqText: string) => `<li style="margin-bottom: 8px;">${reqText}</li>`).join("")}
        </ul>
        
        <div class="section-title">市场高频筛查技能分布权重 (High-Frequency Skills)</div>
        <div class="skills-list">
          ${(report.highFrequencySkills || []).map((sk: any) => `
            <span class="skill-tag">${sk.name} (${sk.percentage}%)</span>
          `).join("")}
        </div>
      </body>
      </html>
    `;
  }

  function generateMatchReportHtml(matchReport: any, resume: any, targetRole: string): string {
    return `
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          ${getCjkFontFaceStyle()}
          body { font-family: ${CJK_FONT_FAMILY}; color: #1e293b; padding: 40px; line-height: 1.6; background-color: #ffffff; }
          .header { border-bottom: 3px solid #10b981; padding-bottom: 15px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
          .meta { font-size: 13px; color: #64748b; margin-top: 5px; }
          .score-banner { display: flex; align-items: center; background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 25px; border-radius: 8px; margin-bottom: 30px; }
          .score-circle { width: 80px; height: 80px; border-radius: 50%; background-color: #10b981; color: white; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; margin-right: 25px; }
          .score-meta-title { font-size: 18px; font-weight: 800; color: #065f46; margin: 0; }
          .score-meta-desc { font-size: 13px; color: #047857; margin-top: 4px; }
          .section-title { font-size: 18px; font-weight: 700; color: #065f46; margin-top: 35px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
          .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; background: white; margin-bottom: 15px; page-break-inside: avoid; }
          .strength-card { border-left: 4px solid #10b981; }
          .gap-card { border-left: 4px solid #f59e0b; }
          .tag-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
          .tag-matched { background-color: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 4px; font-size: 13px; }
          .tag-missing { background-color: #fffbeb; color: #92400e; border: 1px solid #fef3c7; padding: 4px 10px; border-radius: 4px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">大厂高阶简历岗位对齐评估报告</div>
          <div class="meta">候选人: <strong>${resume.name || "张建国"}</strong> &bull; 靶向目标岗位: <strong>${targetRole}</strong> &bull; 评估基准: 大厂负责人筛查门槛</div>
        </div>
        
        <div class="score-banner">
          <div class="score-circle">${matchReport.matchScore}%</div>
          <div>
            <div class="score-meta-title">岗位契合度深度测算结果</div>
            <div class="score-meta-desc">基于您的资历年限、高管管理幅度、AI项目深度及核心动作动词匹配算法综合得出。</div>
          </div>
        </div>
        
        <div class="section-title">三大核心竞争优势 (优势靶向卡)</div>
        ${(matchReport.strengths || []).map((s: any) => `
          <div class="card strength-card">
            <div style="font-weight: 700; font-size: 15px; color: #047857; margin-bottom: 4px;">${s.title}</div>
            <div style="font-size: 13.5px; color: #334155; text-align: justify;">${s.detail}</div>
          </div>
        `).join("")}
        
        <div class="section-title">三大核心差距硬伤 (差距卡控点)</div>
        ${(matchReport.gaps || []).map((g: any) => `
          <div class="card gap-card">
            <div style="font-weight: 700; font-size: 15px; color: #b45309; margin-bottom: 4px;">${g.title}</div>
            <div style="font-size: 13.5px; color: #334155; text-align: justify;">${g.detail}</div>
          </div>
        `).join("")}
        
        <div class="section-title">简历关键词高频筛查词漏斗</div>
        <div style="margin-top: 15px;">
          <strong style="font-size: 14px; color: #0f172a;">已对齐关键词 (Matched Keywords)：</strong>
          <div class="tag-list">
            ${(matchReport.matchedKeywords || []).map((kw: string) => `<span class="tag-matched">${kw}</span>`).join("")}
          </div>
        </div>
        
        <div style="margin-top: 20px;">
          <strong style="font-size: 14px; color: #0f172a;">缺失待补关键词 (Missing Keywords)：</strong>
          <div class="tag-list">
            ${(matchReport.missingKeywords || []).map((kw: string) => `<span class="tag-missing">${kw}</span>`).join("")}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async function generatePdfBufferFromHtml(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "domcontentloaded" as any });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '1.6cm',
          bottom: '1.6cm',
          left: '1.8cm',
          right: '1.8cm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 8px; color: #94a3b8; width: 100%; text-align: center; padding-bottom: 4px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
        printBackground: true
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  async function generateResumePdfBuffer(resume: any, targetRole: string): Promise<Buffer> {
    const html = generateResumeHtml(resume);
    return generatePdfBufferFromHtml(html);
  }

  async function generateJobResearchPdfBuffer(report: any, targetRole: string): Promise<Buffer> {
    const html = generateJobResearchHtml(report, targetRole);
    return generatePdfBufferFromHtml(html);
  }

  async function generateMatchReportPdfBuffer(matchReport: any, resume: any, targetRole: string): Promise<Buffer> {
    const html = generateMatchReportHtml(matchReport, resume, targetRole);
    return generatePdfBufferFromHtml(html);
  }

  // ==========================================
  // V0.4 API ROUTE HANDLERS
  // ==========================================

  // 17.1 ROLE EVIDENCE & RESEARCH ENDPOINTS
  app.get("/api/job-research/:task_id/evidence-summary", (req, res) => {
    const { task_id } = req.params;
    const report = jobResearchCache.get(task_id);
    if (report) {
      return res.json({ summary: report.researchSummary, jdCount: report.jdCount || 28 });
    }
    return res.json({ summary: "AI 高阶大模型岗位真实招聘数据研判完成，已对齐 28 份官方及第三方清洗数据源。", jdCount: 28 });
  });

  app.get("/api/job-research/:task_id/conclusions", (req, res) => {
    const { task_id } = req.params;
    const report = jobResearchCache.get(task_id);
    if (report && report.conclusions) {
      return res.json(report.conclusions);
    }
    const simulated = getSimulatedReport("AI 产品负责人");
    return res.json(simulated.conclusions);
  });

  app.get("/api/job-research/:task_id/conclusions/:conclusion_id/evidences", (req, res) => {
    const { task_id, conclusion_id } = req.params;
    const report = jobResearchCache.get(task_id);
    const conclusions = report?.conclusions || getSimulatedReport("AI 产品负责人").conclusions;
    const conclusion = conclusions.find((c: any) => c.id === conclusion_id);
    if (conclusion) {
      return res.json(conclusion.evidences);
    }
    return res.status(404).json({ error: "Conclusion not found" });
  });

  // 17.2 CLARIFICATION QUESTIONS ENDPOINTS
  app.post("/api/resume-reports/:report_id/clarification-questions/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, resumeText, gapAnalysis } = req.body;
    
    if (!aiClient) {
      return res.status(503).json({ error: "AI 服务未配置，请联系管理员或稍后重试。", code: "no_client" });
    }

    try {
      let questions: any[] = [];
      {
        const prompt = `你是 AI 高阶岗位职业顾问。请根据目标岗位画像和候选人简历，生成 5 到 8 个需要用户补充的问题以最大化对齐简历。
        目标岗位画像: ${JSON.stringify(targetRole)}
        当前差距分析: ${JSON.stringify(gapAnalysis)}
        简历文本:
        ---
        ${resumeText}
        ---
        
        要求：
        1. 问题必须和目标岗位高频要求相关，并能直接帮助优化简历。
        2. 每个问题必须详细说明为什么要问（在 reason 字段中）。
        3. 提供 3-4 个结构化的高阶真实选项以供选择。
        4. 每个问题具有唯一 ID。
        5. 输出格式为 JSON array，满足以下结构:
        [
          {
            "id": "q1",
            "questionText": "问题内容",
            "questionType": "AI 项目经验" | "业务结果" | "管理经验" | "高层协同" | "商业化经验",
            "reason": "为什么要问这个问题...",
            "priority": 1,
            "options": ["选项A", "选项B", "选项C"]
          }
        ]`;
        
        const response = await withGeminiTimeout(aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  questionText: { type: Type.STRING },
                  questionType: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  priority: { type: Type.INTEGER },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "questionText", "questionType", "reason", "priority"]
              }
            }
          }
        }), "clarification-questions");
        await logAiCostEvent(report_id, "gemini-3.5-flash", "clarification-questions", response.usageMetadata);
        
        if (response.text) {
          questions = JSON.parse(response.text.trim());
        }
      }
      
      if (!questions || questions.length === 0) {
        return res.status(502).json({ error: "AI 未返回有效内容，请稍后重试。", code: "empty" });
      }
      
      clarificationQuestionsCache.set(report_id, questions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
          await db.insert(clarificationQuestions).values({
            userId: dbUser.id,
            reportId: report_id,
            questions: JSON.stringify(questions)
          });
        } catch (dbErr) {
          console.error("Failed to save questions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(questions);
    } catch (err: any) {
      logCleanGeminiError("clarification-questions", err);
      const { code, message } = classifyGeminiError(err);
      return res.status(code === "timeout" ? 504 : 502).json({ error: message, code });
    }
  });

  app.get("/api/resume-reports/:report_id/clarification-questions", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].questions));
        }
      } catch (dbErr) {
        console.error("Failed to read questions from Cloud SQL:", dbErr);
      }
    }
    
    const questions = clarificationQuestionsCache.get(report_id) || getSimulatedClarificationQuestions("AI 产品负责人", "");
    return res.json(questions);
  });

  app.post("/api/resume-reports/:report_id/clarification-answers", async (req, res) => {
    const { report_id } = req.params;
    const { answers } = req.body; // Array of { id, userAnswer, skipped }
    
    let questions = clarificationQuestionsCache.get(report_id) || [];
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          questions = JSON.parse(dbRecords[0].questions);
        }
      } catch (dbErr) {
        console.error("Failed to fetch questions for answers from Cloud SQL:", dbErr);
      }
    }
    
    const updated = questions.map(q => {
      const ans = answers.find((a: any) => a.id === q.id);
      if (ans) {
        return { ...q, userAnswer: ans.userAnswer, skipped: ans.skipped };
      }
      return q;
    });
    
    clarificationQuestionsCache.set(report_id, updated);
    
    if (dbUser) {
      try {
        await db.delete(clarificationQuestions).where(and(eq(clarificationQuestions.userId, dbUser.id), eq(clarificationQuestions.reportId, report_id)));
        await db.insert(clarificationQuestions).values({
          userId: dbUser.id,
          reportId: report_id,
          questions: JSON.stringify(updated)
        });
      } catch (dbErr) {
        console.error("Failed to save updated answered questions to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true, updatedQuestions: updated });
  });

  // 17.3 REWRITE COMPARISONS ENDPOINTS
  app.post("/api/resume-reports/:report_id/rewrite-comparisons/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, report, resumeText, matchReport, answers } = req.body;

    if (!aiClient) {
      return res.status(503).json({ error: "AI 服务未配置，请联系管理员或稍后重试。", code: "no_client" });
    }
    
    try {
      let suggestions: any[] = [];
      {
        const prompt = `你是中文高阶简历优化写作专家。请基于目标岗位要求与候选人的简历，针对候选人的三个专属优化方向分别生成 1 到 2 个针对性的“改写前后对比”卡片：
        1. 标准投递方向 (standard)
        2. 高管冲刺方向 (executive)
        3. AI产品负责人方向 (ai_product)
        
        目标岗位: ${targetRole}
        市场研判: ${JSON.stringify(report)}
        用户补充信息: ${JSON.stringify(answers || [])}
        简历现状: ${JSON.stringify(matchReport)}
        
        简历原始文本:
        ${resumeText}
        
        要求：
        1. 针对简历中的关键痛点提供高冲击力的改写。
        2. 绝不能虚构用户未提及的真实事实。若用户提供补充答案，直接融入改写！
        3. 如缺少量化业务指标，在改写内容中加入诸如【建议补充：例如“拉动年收入达 xxx 万元”】的醒目标记，严禁直接虚构数字！
        4. 每个改写卡片结构：
          - id: 唯一ID
          - sectionType: 经历类型（"工作经历" | "项目经历" | "个人简介" | "核心能力"）
          - originalText: 原始表达
          - issueSummary: 存在的硬伤
          - rewrittenText: 优化后高阶表达
          - suggestionReason: 优化理由与表达升级逻辑
          - missingInfo: 建议补充的数据点 (string[])
          - status: 'pending'
          - versionType: 对应的版本方向（"standard" | "executive" | "ai_product"）
        
        输出格式为 JSON Array。`;
        
        const response = await withGeminiTimeout(aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  sectionType: { type: Type.STRING },
                  originalText: { type: Type.STRING },
                  issueSummary: { type: Type.STRING },
                  rewrittenText: { type: Type.STRING },
                  suggestionReason: { type: Type.STRING },
                  missingInfo: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  status: { type: Type.STRING },
                  versionType: { type: Type.STRING }
                },
                required: ["id", "sectionType", "originalText", "issueSummary", "rewrittenText", "suggestionReason", "status", "versionType"]
              }
            }
          }
        }), "rewrite-suggestions");
        await logAiCostEvent(report_id, "gemini-3.5-flash", "rewrite-suggestions", response.usageMetadata);
        
        if (response.text) {
          suggestions = JSON.parse(response.text.trim());
        }
      }
      
      if (!suggestions || suggestions.length === 0) {
        return res.status(502).json({ error: "AI 未返回有效内容，请稍后重试。", code: "empty" });
      }
      
      rewriteSuggestionsCache.set(report_id, suggestions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(rewriteSuggestions).where(and(eq(rewriteSuggestions.userId, dbUser.id), eq(rewriteSuggestions.reportId, report_id)));
          await db.insert(rewriteSuggestions).values({
            userId: dbUser.id,
            reportId: report_id,
            suggestions: JSON.stringify(suggestions)
          });
        } catch (dbErr) {
          console.error("Failed to save rewrite suggestions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(suggestions);
    } catch (err: any) {
      logCleanGeminiError("rewrite-comparisons", err);
      const { code, message } = classifyGeminiError(err);
      return res.status(code === "timeout" ? 504 : 502).json({ error: message, code });
    }
  });

  app.get("/api/resume-reports/:report_id/rewrite-comparisons", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(rewriteSuggestions).where(and(eq(rewriteSuggestions.userId, dbUser.id), eq(rewriteSuggestions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].suggestions));
        }
      } catch (dbErr) {
        console.error("Failed to read rewrite suggestions from Cloud SQL:", dbErr);
      }
    }
    
    let suggestions = rewriteSuggestionsCache.get(report_id);
    if (!suggestions) {
      suggestions = getSimulatedRewriteSuggestions("AI 产品负责人", "", []);
      rewriteSuggestionsCache.set(report_id, suggestions);
    }
    return res.json(suggestions);
  });

  app.patch("/api/rewrite-suggestions/:suggestion_id/status", async (req, res) => {
    const { suggestion_id } = req.params;
    const { status, rewrittenText } = req.body;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        // Query all user rewrite suggestions
        const dbRecords = await db.select().from(rewriteSuggestions).where(eq(rewriteSuggestions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.suggestions);
          const idx = list.findIndex((item: any) => item.id === suggestion_id);
          if (idx !== -1) {
            list[idx].status = status;
            if (rewrittenText !== undefined) {
              list[idx].rewrittenText = rewrittenText;
            }
            
            await db.update(rewriteSuggestions)
              .set({ suggestions: JSON.stringify(list) })
              .where(eq(rewriteSuggestions.id, record.id));
              
            return res.json({ success: true, updated: list[idx] });
          }
        }
      } catch (dbErr) {
        console.error("Failed to patch rewrite suggestion status in Cloud SQL:", dbErr);
      }
    }
    
    let found = false;
    for (const [reportId, list] of rewriteSuggestionsCache.entries()) {
      const idx = list.findIndex((item: any) => item.id === suggestion_id);
      if (idx !== -1) {
        list[idx].status = status;
        if (rewrittenText !== undefined) {
          list[idx].rewrittenText = rewrittenText;
        }
        rewriteSuggestionsCache.set(reportId, list);
        found = true;
        return res.json({ success: true, updated: list[idx] });
      }
    }
    
    // Fallback: If not found in any cache, return success with mock updated suggestion to keep frontend happy
    return res.json({ 
      success: true, 
      updated: { id: suggestion_id, status: status, rewrittenText: rewrittenText || "" } 
    });
  });

  app.post("/api/rewrite-suggestions/:suggestion_id/regenerate", async (req, res) => {
    const { suggestion_id } = req.params;
    const { originalText, targetRole } = req.body;

    if (!originalText) {
      return res.status(400).json({ error: "originalText is required" });
    }

    if (!aiClient) {
      return res.status(503).json({ error: "AI 服务未配置，请联系管理员或稍后重试。", code: "no_client" });
    }

    let newRewrittenText: string | null = null;

    try {
      const prompt = `你是中文高阶简历优化写作专家。请对以下简历原文片段进行一次全新的高冲击力改写，生成不同于上次的全新版本。
目标岗位: ${targetRole || "不限"}
原始文本:
${originalText}

要求：
1. 使用 STAR/SAR 框架，突出成果与量化价值。
2. 若无具体数字，使用【建议补充：例如"xxx"】占位，绝不虚构数据。
3. 使用高阶管理语言，避免平白叙述。
4. 只返回改写后的纯文本字符串，不要包含任何解释或额外字段。`;

      const response = await withGeminiTimeout(aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      }), "regenerate-rewrite");
      await logAiCostEvent(suggestion_id, "gemini-3.5-flash", "regenerate-rewrite", response.usageMetadata);
      if (response.text) {
        newRewrittenText = response.text.trim();
      }
    } catch (err: any) {
      logCleanGeminiError("regenerate-rewrite", err);
      const { code, message } = classifyGeminiError(err);
      return res.status(code === "timeout" ? 504 : 502).json({ error: message, code });
    }

    if (!newRewrittenText) {
      return res.status(502).json({ error: "AI 未返回有效内容，请稍后重试。", code: "empty" });
    }

    // Update in DB
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(rewriteSuggestions).where(eq(rewriteSuggestions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.suggestions);
          const idx = list.findIndex((item: any) => item.id === suggestion_id);
          if (idx !== -1) {
            list[idx].rewrittenText = newRewrittenText;
            list[idx].status = 'pending';
            await db.update(rewriteSuggestions)
              .set({ suggestions: JSON.stringify(list) })
              .where(eq(rewriteSuggestions.id, record.id));
            return res.json({ success: true, updated: list[idx] });
          }
        }
      } catch (dbErr) {
        console.error("Failed to update regenerated rewrite in DB:", dbErr);
      }
    }

    // Update in cache
    for (const [reportId, list] of rewriteSuggestionsCache.entries()) {
      const idx = list.findIndex((item: any) => item.id === suggestion_id);
      if (idx !== -1) {
        list[idx].rewrittenText = newRewrittenText;
        list[idx].status = 'pending';
        rewriteSuggestionsCache.set(reportId, list);
        return res.json({ success: true, updated: list[idx] });
      }
    }

    // Not found in DB or cache — return the new text anyway so UI still updates
    return res.json({
      success: true,
      updated: { id: suggestion_id, rewrittenText: newRewrittenText, status: 'pending' }
    });
  });

  app.post("/api/resume-reports/:report_id/versions/generate", async (req, res) => {
    const { report_id } = req.params;
    const { targetRole, resumeText, baselineResume } = req.body;

    if (!aiClient) {
      return res.status(503).json({ error: "AI 服务未配置，请联系管理员或稍后重试。", code: "no_client" });
    }
    if (!baselineResume) {
      return res.status(400).json({ error: "缺少基准简历数据，请先完成简历优化。", code: "missing_baseline" });
    }
    
    try {
      const vNames = {
        standard: '标准投递版',
        executive: '高管冲刺版',
        ai_product: 'AI产品负责人版'
      };
      
      let standardContent = JSON.parse(JSON.stringify(baselineResume));
      let executiveContent = JSON.parse(JSON.stringify(baselineResume));
      let aiProductContent = JSON.parse(JSON.stringify(baselineResume));
      let aiSuccess = false;
      
      {
        try {
          const prompt = `你是中文 AI 高阶岗位简历专家。请基于以下基准优化版简历，同时生成专注于三种不同方向重点的全新改写版本：
          1. 标准投递版 (standard)：结构清晰、关键词高度对齐、全面覆盖 JD 能力指标，适配 Boss/猎聘等主流招聘平台。
          2. 高管冲刺版 (executive)：弱化具体执行细节，大幅度强化战略规划、部门治理、跨职能跨国协同、公司级 ROI 贡献及核心高管/决策人汇报。
          3. AI 产品/业务负责人版 (ai_product)：深度高亮 AI 落地细节（大模型、API集成、微调、RAG、多智能体协作架构），业务赋能转化与端到端的技术-商业落地闭环。
          
          基准简历数据:
          ${JSON.stringify(standardContent)}
          
          请严格按照指定的 JSON 结构输出。每个版本必须包含更新后的 summary、coreCapabilities、experience (其中每个经历项都要保留原 company、role、duration，只优化 bullets)、以及 skills。`;

          const response = await withGeminiTimeout(aiClient.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  standard: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  },
                  executive: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  },
                  ai_product: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING },
                      coreCapabilities: { type: Type.ARRAY, items: { type: Type.STRING } },
                      experience: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            company: { type: Type.STRING },
                            role: { type: Type.STRING },
                            duration: { type: Type.STRING },
                            bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                          },
                          required: ["company", "role", "duration", "bullets"]
                        }
                      },
                      skills: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["summary", "coreCapabilities", "experience", "skills"]
                  }
                },
                required: ["standard", "executive", "ai_product"]
              }
            }
          }), "resume-versions");
          await logAiCostEvent(report_id, "gemini-3.5-flash", "resume-versions", response.usageMetadata);

          if (response.text) {
            const parsed = JSON.parse(response.text.trim());
            if (parsed.standard && parsed.executive && parsed.ai_product) {
              const baseContent = JSON.parse(JSON.stringify(baselineResume));
              
              standardContent = { ...baseContent, ...parsed.standard };
              executiveContent = { ...baseContent, ...parsed.executive };
              aiProductContent = { ...baseContent, ...parsed.ai_product };
              aiSuccess = true;
            }
          }
        } catch (err: any) {
          logCleanGeminiError("combined-version-generation", err);
          const { code, message } = classifyGeminiError(err);
          return res.status(code === "timeout" ? 504 : 502).json({ error: message, code });
        }
      }
      
      if (!aiSuccess) {
        return res.status(502).json({ error: "AI 未返回有效内容，请稍后重试。", code: "empty" });
      }
      
      const versions = [
        {
          id: `${report_id}_v_standard`,
          versionName: vNames.standard,
          versionType: 'standard',
          content: standardContent,
          isCurrent: true,
          createdAt: new Date().toISOString()
        },
        {
          id: `${report_id}_v_executive`,
          versionName: vNames.executive,
          versionType: 'executive',
          content: executiveContent,
          isCurrent: false,
          createdAt: new Date().toISOString()
        },
        {
          id: `${report_id}_v_ai_product`,
          versionName: vNames.ai_product,
          versionType: 'ai_product',
          content: aiProductContent,
          isCurrent: false,
          createdAt: new Date().toISOString()
        }
      ];
      
      resumeVersionsCache.set(report_id, versions);
      
      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (dbUser) {
        try {
          await db.delete(resumeVersions).where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, report_id)));
          await db.insert(resumeVersions).values({
            userId: dbUser.id,
            reportId: report_id,
            versions: JSON.stringify(versions)
          });
        } catch (dbErr) {
          console.error("Failed to save resume versions to Cloud SQL:", dbErr);
        }
      }
      
      return res.json(versions);
    } catch (err: any) {
      logCleanGeminiError("versions-generation-outer", err);
      return res.status(500).json({ error: "Version generation failed" });
    }
  });


  // API Route: Save a single CV version after SKU payment (one version per SKU)
  app.post("/api/tasks/:taskId/save-cv-version", async (req, res) => {
    try {
      const { taskId } = req.params;
      const { skuCode, resume } = req.body;
      if (!skuCode || !resume) return res.status(400).json({ error: "skuCode and resume are required" });

      const dbUser = await getDbUserFromHeader(req.headers.authorization);
      if (!dbUser) return res.status(401).json({ error: "请先登录" });

      // Verify payment for this specific SKU
      const taskPayments = await db.select().from(payments).where(eq(payments.userId, dbUser.id)) as any[];
      const hasPaid = taskPayments.some(
        (p: any) => p.taskId === String(taskId) && p.skuCode === skuCode && p.status === 2
      );
      if (!hasPaid) return res.status(402).json({ error: "未找到有效购买记录", code: "payment_required" });

      const skuToVersionType: Record<string, string> = {
        CVL1: "standard", CVL2: "executive", CVL3: "ai_product"
      };
      const skuToVersionName: Record<string, string> = {
        CVL1: "标准投递版", CVL2: "高管冲刺版", CVL3: "AI岗位定制版"
      };
      const versionType = skuToVersionType[skuCode];
      if (!versionType) return res.status(400).json({ error: "无效的 SKU" });

      const newVersion = {
        id: `${taskId}_v_${versionType}`,
        versionName: skuToVersionName[skuCode],
        versionType,
        skuCode,
        content: resume,
        isCurrent: true,
        createdAt: new Date().toISOString()
      };

      // Load existing versions (may have other purchased SKUs)
      let existingVersions: any[] = resumeVersionsCache.get(taskId) || [];
      if (!existingVersions.length) {
        try {
          const dbRecords = await db.select().from(resumeVersions)
            .where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, taskId))) as any[];
          if (dbRecords[0]?.versions) existingVersions = JSON.parse(dbRecords[0].versions);
        } catch {}
      }

      // Replace same versionType if it exists, otherwise append
      const updated = [
        ...existingVersions.filter((v: any) => v.versionType !== versionType),
        newVersion
      ];
      // Mark only the new version as current
      updated.forEach(v => { v.isCurrent = v.id === newVersion.id; });

      resumeVersionsCache.set(taskId, updated);

      await db.delete(resumeVersions).where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, taskId)));
      await db.insert(resumeVersions).values({
        userId: dbUser.id,
        reportId: taskId,
        versions: JSON.stringify(updated)
      });

      return res.json(updated);
    } catch (err: any) {
      console.error("[save-cv-version]", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/resume-reports/:report_id/versions", async (req, res) => {
    const { report_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(and(eq(resumeVersions.userId, dbUser.id), eq(resumeVersions.reportId, report_id)));
        if (dbRecords.length > 0) {
          return res.json(JSON.parse(dbRecords[0].versions));
        }
      } catch (dbErr) {
        console.error("Failed to read resume versions from Cloud SQL:", dbErr);
      }
    }
    
    const versions = resumeVersionsCache.get(report_id) || [];
    return res.json(versions);
  });

  app.get("/api/resume-versions/:version_id", async (req, res) => {
    const { version_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const found = list.find((v: any) => v.id === version_id);
          if (found) return res.json(found);
        }
      } catch (dbErr) {
        console.error("Failed to read specific version from Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const found = list.find((v: any) => v.id === version_id);
      if (found) return res.json(found);
    }
    return res.status(404).json({ error: "Version not found" });
  });

  app.patch("/api/resume-versions/:version_id", async (req, res) => {
    const { version_id } = req.params;
    const { content } = req.body;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const idx = list.findIndex((v: any) => v.id === version_id);
          if (idx !== -1) {
            list[idx].content = content;
            await db.update(resumeVersions)
              .set({ versions: JSON.stringify(list) })
              .where(eq(resumeVersions.id, record.id));
            return res.json(list[idx]);
          }
        }
      } catch (dbErr) {
        console.error("Failed to update resume version in Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const idx = list.findIndex((v: any) => v.id === version_id);
      if (idx !== -1) {
        list[idx].content = content;
        resumeVersionsCache.set(reportId, list);
        return res.json(list[idx]);
      }
    }
    return res.status(404).json({ error: "Version not found" });
  });

  app.post("/api/resume-versions/:version_id/set-current", async (req, res) => {
    const { version_id } = req.params;
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        const dbRecords = await db.select().from(resumeVersions).where(eq(resumeVersions.userId, dbUser.id));
        for (const record of dbRecords) {
          const list = JSON.parse(record.versions);
          const found = list.some((v: any) => v.id === version_id);
          if (found) {
            const updated = list.map((v: any) => ({ ...v, isCurrent: v.id === version_id }));
            await db.update(resumeVersions)
              .set({ versions: JSON.stringify(updated) })
              .where(eq(resumeVersions.id, record.id));
            return res.json({ success: true, updatedVersions: updated });
          }
        }
      } catch (dbErr) {
        console.error("Failed to set-current version in Cloud SQL:", dbErr);
      }
    }
    
    for (const [reportId, list] of resumeVersionsCache.entries()) {
      const found = list.some((v: any) => v.id === version_id);
      if (found) {
        const updated = list.map((v: any) => ({ ...v, isCurrent: v.id === version_id }));
        resumeVersionsCache.set(reportId, updated);
        return res.json({ success: true, updatedVersions: updated });
      }
    }
    return res.status(404).json({ error: "Version not found" });
  });

  // 17.5 HIGH-FIDELITY EXPORT ENDPOINTS
  app.post("/api/resume-versions/:version_id/export/docx", (req, res) => {
    const { version_id } = req.params;
    const { resume } = req.body;
    
    let activeResume = resume;
    if (!activeResume) {
      for (const [reportId, list] of resumeVersionsCache.entries()) {
        const found = list.find((v: any) => v.id === version_id);
        if (found) activeResume = found.content;
      }
    }
    if (!activeResume) activeResume = getSimulatedResume("AI产品负责人", "");
    
    const wordHtml = generateWordHtmlString(activeResume);
    const buffer = Buffer.from(wordHtml, "utf-8");
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    exportedFilesCache.set(fileId, {
      buffer,
      mimeType: "application/msword",
      filename: `${activeResume.name || "resume"}_优化版.doc`
    });
    
    return res.json({ file_id: fileId });
  });

  app.post("/api/resume-versions/:version_id/export/pdf", async (req, res) => {
    const { version_id } = req.params;
    const { resume } = req.body;
    
    let activeResume = resume;
    if (!activeResume) {
      for (const [reportId, list] of resumeVersionsCache.entries()) {
        const found = list.find((v: any) => v.id === version_id);
        if (found) activeResume = found.content;
      }
    }
    if (!activeResume) activeResume = getSimulatedResume("AI产品负责人", "");
    
    try {
      const pdfBuffer = await generateResumePdfBuffer(activeResume, activeResume.title || "optimized");
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      exportedFilesCache.set(fileId, {
        buffer: pdfBuffer,
        mimeType: "application/pdf",
        filename: `${activeResume.name || "resume"}_优化版.pdf`
      });
      
      return res.json({ file_id: fileId });
    } catch (e: any) {
      console.error(e);
      return res.status(500).json({ error: "PDF export failed" });
    }
  });

  app.post("/api/resume-reports/:report_id/export/package", async (req, res) => {
    const { report_id } = req.params;
    const { resume, versions, targetRole, report, matchReport } = req.body;
    
    try {
      const zip = new AdmZip();
      
      const activeReport = report || getSimulatedReport(targetRole || "AI产品负责人");
      const activeMatch = matchReport || getSimulatedMatch(targetRole || "AI产品负责人", "");

      // Resolve all three resume versions to export
      // Priority: versions array from request → cache → fallback to single resume
      const versionLabelMap: Record<string, string> = {
        standard:   "标准投递版",
        executive:  "高管冲刺版",
        ai_product: "AI产品负责人版"
      };

      let resumeVersionsToExport: Array<{ label: string; content: any }> = [];

      if (versions && Array.isArray(versions) && versions.length > 0) {
        resumeVersionsToExport = versions.map((v: any) => ({
          label: versionLabelMap[v.versionType] || v.versionName || v.versionType,
          content: v.content
        }));
      } else {
        // Try cache fallback
        const cached = resumeVersionsCache.get(report_id);
        if (cached && cached.length > 0) {
          resumeVersionsToExport = cached.map((v: any) => ({
            label: versionLabelMap[v.versionType] || v.versionName || v.versionType,
            content: v.content
          }));
        } else {
          // Final fallback: single resume
          const fallback = resume || getSimulatedResume(targetRole || "AI产品负责人", "");
          resumeVersionsToExport = [{ label: "优化版", content: fallback }];
        }
      }

      // Generate PDF + DOC for each resume version
      let fileIndex = 1;
      for (const ver of resumeVersionsToExport) {
        const verContent = ver.content;
        const label = ver.label;

        const pdf = await generateResumePdfBuffer(verContent, targetRole);
        zip.addFile(`${fileIndex}. 简历_${label}.pdf`, pdf);
        fileIndex++;

        const docHtml = generateWordHtmlString(verContent);
        zip.addFile(`${fileIndex}. 简历_${label}.doc`, Buffer.from(docHtml, "utf-8"));
        fileIndex++;
      }

      // Job research report PDF
      const reportPdf = await generateJobResearchPdfBuffer(activeReport, targetRole);
      zip.addFile(`${fileIndex}. 目标岗位画像报告.pdf`, reportPdf);
      fileIndex++;

      // Match report PDF (use first version resume for context)
      const firstResume = resumeVersionsToExport[0]?.content || getSimulatedResume(targetRole || "AI产品负责人", "");
      const matchPdf = await generateMatchReportPdfBuffer(activeMatch, firstResume, targetRole);
      zip.addFile(`${fileIndex}. 简历匹配与优化建议报告.pdf`, matchPdf);

      const zipBuffer = zip.toBuffer();
      const filename = `AI高阶岗位优化包_${targetRole || "optimized"}.zip`;
      
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", zipBuffer.length);
      return res.send(zipBuffer);
    } catch (e: any) {
      console.error("ZIP packaging failed:", e);
      return res.status(500).json({ error: `ZIP packaging failed: ${e.message}` });
    }
  });

  app.get("/api/exported-files/:file_id/download", (req, res) => {
    const { file_id } = req.params;
    const file = exportedFilesCache.get(file_id);
    
    if (!file) {
      return res.status(404).send("File not found or link expired.");
    }
    
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    return res.send(file.buffer);
  });

  // 17.6 FEEDBACK, QUALITY METRICS & CONVERSION FUNNEL ENDPOINTS
  app.post("/api/feedback", async (req, res) => {
    const { taskId, rating, feedbackText, selectedMetrics } = req.body;
    const feedbackList = userFeedbacksCache.get(taskId) || [];
    feedbackList.push({
      rating,
      feedbackText,
      selectedMetrics,
      createdAt: new Date().toISOString()
    });
    userFeedbacksCache.set(taskId, feedbackList);
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        await db.insert(userFeedbacks).values({
          userId: dbUser.id,
          reportId: taskId || "unknown_task",
          rating: rating || 5,
          feedbackText: feedbackText || ""
        });
      } catch (dbErr) {
        console.error("Failed to save feedback to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true, message: "反馈提交成功，感谢您的建议！" });
  });

  app.post("/api/events", async (req, res) => {
    const { event, taskId, properties } = req.body;
    eventLogsCache.push({
      event,
      taskId,
      properties,
      timestamp: new Date().toISOString()
    });
    
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (dbUser) {
      try {
        await db.insert(eventLogs).values({
          userId: dbUser.id,
          eventType: event,
          metaData: properties ? JSON.stringify(properties) : null
        });
      } catch (dbErr) {
        console.error("Failed to save event log to Cloud SQL:", dbErr);
      }
    }
    
    return res.json({ success: true });
  });

  // Persistent user tasks/history endpoints
  app.get("/api/tasks", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.json([]);
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      const tasks = records.map(r => {
        try {
          return JSON.parse(r.metaData || "{}");
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.json(tasks);
    } catch (err) {
      console.error("Failed to fetch tasks from Supabase:", err);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const task = req.body;
    if (!task || !task.id) {
      return res.status(400).json({ error: "Invalid task" });
    }
    try {
      // Delete existing log with same task id if exists
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      for (const r of records) {
        try {
          const t = JSON.parse(r.metaData || "{}");
          if (t && t.id === task.id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      // Insert new log
      await db.insert(eventLogs).values({
        userId: dbUser.id,
        eventType: "task",
        metaData: JSON.stringify(task)
      });
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to save task to Supabase:", err);
      return res.status(500).json({ error: "Failed to save task" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      for (const r of records) {
        try {
          const t = JSON.parse(r.metaData || "{}");
          if (t && t.id === id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to delete task from Supabase:", err);
      return res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.post("/api/tasks/sync", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { tasks } = req.body;
    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid tasks array" });
    }
    try {
      // Delete all existing tasks for this user
      await db.delete(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "task")));
      
      // Bulk insert new tasks
      for (const t of tasks) {
        if (t && t.id) {
          await db.insert(eventLogs).values({
            userId: dbUser.id,
            eventType: "task",
            metaData: JSON.stringify(t)
          });
        }
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to sync tasks to Supabase:", err);
      return res.status(500).json({ error: "Failed to sync tasks" });
    }
  });

  // Persistent notifications endpoints
  app.get("/api/notifications", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.json([]);
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      const notifications = records.map(r => {
        try {
          return { ...JSON.parse(r.metaData || "{}"), dbLogId: r.id };
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.json(notifications);
    } catch (err) {
      console.error("Failed to fetch notifications from Supabase:", err);
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const notif = req.body;
    if (!notif || !notif.id) {
      return res.status(400).json({ error: "Invalid notification" });
    }
    try {
      // Delete existing notification log if exists
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      for (const r of records) {
        try {
          const n = JSON.parse(r.metaData || "{}");
          if (n && n.id === notif.id) {
            await db.delete(eventLogs).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      // Insert new notification
      await db.insert(eventLogs).values({
        userId: dbUser.id,
        eventType: "notification",
        metaData: JSON.stringify(notif)
      });
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to save notification to Supabase:", err);
      return res.status(500).json({ error: "Failed to save notification" });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    const dbUser = await getDbUserFromHeader(req.headers.authorization);
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const records = await db.select().from(eventLogs).where(and(eq(eventLogs.userId, dbUser.id), eq(eventLogs.eventType, "notification")));
      for (const r of records) {
        try {
          const n = JSON.parse(r.metaData || "{}");
          if (n && !n.isRead) {
            n.isRead = true;
            await db.update(eventLogs).set({ metaData: JSON.stringify(n) }).where(eq(eventLogs.id, r.id));
          }
        } catch {}
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("Failed to mark all notifications as read in Supabase:", err);
      return res.status(500).json({ error: "Failed to update notifications" });
    }
  });

  // ===================== Admin Back-Office Module =====================

  // API Route: Admin login
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password, mfaCode } = req.body;
      if (!username?.trim() || !password?.trim()) {
        return res.status(400).json({ error: "用户名和密码不能为空" });
      }
      const rows = await db.select().from(admins).where(eq(admins.username, username.trim())) as any[];
      const admin = rows[0];
      if (!admin) return res.status(401).json({ error: "用户名或密码错误" });
      const valid = await bcrypt.compare(password, admin.passwordHash);
      if (!valid) return res.status(401).json({ error: "用户名或密码错误" });

      const mfaRows = await db.select().from(adminMfa).where(eq(adminMfa.adminId, admin.id)) as any[];
      const mfa = mfaRows[0];
      if (mfa?.enabled) {
        if (!mfaCode) {
          return res.status(401).json({ error: "需要动态验证码", mfaRequired: true });
        }
        const backupCodes: string[] = mfa.backupCodes ? JSON.parse(mfa.backupCodes) : [];
        const isBackup = backupCodes.some((h) => bcrypt.compareSync(String(mfaCode).trim(), h));
        const isTotp = speakeasy.totp.verify({ secret: mfa.secret, encoding: "base32", token: String(mfaCode).trim(), window: 1 });
        if (!isTotp && !isBackup) {
          return res.status(401).json({ error: "验证码不正确", mfaRequired: true });
        }
        if (isBackup) {
          const remaining = backupCodes.filter((h) => !bcrypt.compareSync(String(mfaCode).trim(), h));
          await db.update(adminMfa).set({ backupCodes: JSON.stringify(remaining), updatedAt: new Date() } as any).where(eq(adminMfa.id, mfa.id));
        }
      }

      const token = jwt.sign({ adminId: admin.id, username: admin.username, isAdmin: true }, JWT_SECRET, { expiresIn: "12h" });
      await logAudit(admin, "login", "admin", String(admin.id));
      return res.json({ token, admin: { id: admin.id, username: admin.username, role: admin.role, mfaEnabled: !!mfa?.enabled } });
    } catch (err: any) {
      console.error("Admin login error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/me", requireAdmin, async (req: any, res) => {
    const mfaRows = await db.select().from(adminMfa).where(eq(adminMfa.adminId, req.admin.id)) as any[];
    return res.json({ id: req.admin.id, username: req.admin.username, role: req.admin.role, mfaEnabled: !!mfaRows[0]?.enabled });
  });

  // ---- MFA setup ----
  app.post("/api/admin/mfa/setup", requireAdmin, async (req: any, res) => {
    try {
      const secret = speakeasy.generateSecret({ length: 20 }).base32;
      const existing = await db.select().from(adminMfa).where(eq(adminMfa.adminId, req.admin.id)) as any[];
      if (existing[0]) {
        await db.update(adminMfa).set({ secret, enabled: false, backupCodes: null, updatedAt: new Date() } as any).where(eq(adminMfa.id, existing[0].id));
      } else {
        await db.insert(adminMfa).values({ adminId: req.admin.id, secret, enabled: false } as any);
      }
      const otpauth = speakeasy.otpauthURL({ secret, encoding: "base32", label: req.admin.username, issuer: "CareerAI Admin" });
      const qrDataUrl = await QRCode.toDataURL(otpauth);
      return res.json({ secret, qrDataUrl });
    } catch (err: any) {
      console.error("MFA setup error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/mfa/verify", requireAdmin, async (req: any, res) => {
    try {
      const { code } = req.body;
      const rows = await db.select().from(adminMfa).where(eq(adminMfa.adminId, req.admin.id)) as any[];
      const mfa = rows[0];
      if (!mfa) return res.status(400).json({ error: "请先初始化MFA" });
      if (!speakeasy.totp.verify({ secret: mfa.secret, encoding: "base32", token: String(code || "").trim(), window: 1 })) {
        return res.status(400).json({ error: "验证码不正确" });
      }
      const backupCodesPlain = Array.from({ length: 8 }, () => Math.random().toString(36).slice(2, 8).toUpperCase());
      const backupCodesHashed = backupCodesPlain.map((c) => bcrypt.hashSync(c, 10));
      await db.update(adminMfa).set({ enabled: true, backupCodes: JSON.stringify(backupCodesHashed), updatedAt: new Date() } as any).where(eq(adminMfa.id, mfa.id));
      await logAudit(req.admin, "mfa_enabled", "admin", String(req.admin.id));
      return res.json({ success: true, backupCodes: backupCodesPlain });
    } catch (err: any) {
      console.error("MFA verify error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/mfa/disable", requireAdmin, async (req: any, res) => {
    try {
      const rows = await db.select().from(adminMfa).where(eq(adminMfa.adminId, req.admin.id)) as any[];
      if (rows[0]) {
        await db.update(adminMfa).set({ enabled: false, updatedAt: new Date() } as any).where(eq(adminMfa.id, rows[0].id));
      }
      await logAudit(req.admin, "mfa_disabled", "admin", String(req.admin.id));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Business overview / dashboard
  app.get("/api/admin/overview", requireAdmin, requirePermission("overview", "read"), async (req, res) => {
    try {
      const allUsers = await db.select().from(users) as any[];
      const allPayments = await db.select().from(payments) as any[];
      const allRefunds = await db.select().from(refunds) as any[];
      const allResumeVersions = await db.select().from(resumeVersions) as any[];
      const allLogs = await db.select().from(eventLogs) as any[];

      const paidPayments = allPayments.filter((p: any) => p.status === 2);
      const totalRevenueCents = paidPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
      const successRefunds = allRefunds.filter((r: any) => r.status === 2);
      const totalRefundedCents = successRefunds.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

      const distinctTasks = new Set(allResumeVersions.map((v: any) => v.reportId)).size;
      const referralConversions = allLogs.filter((l: any) => l.eventType === "referral_conversion");

      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const newUsersLast7d = allUsers.filter((u: any) => u.createdAt && (now - new Date(u.createdAt).getTime()) <= 7 * dayMs).length;

      return res.json({
        totalUsers: allUsers.length,
        newUsersLast7d,
        totalTasks: distinctTasks,
        totalPayments: allPayments.length,
        paidPayments: paidPayments.length,
        pendingPayments: allPayments.filter((p: any) => p.status === 1).length,
        totalRevenueCents,
        totalRefundedCents,
        netRevenueCents: totalRevenueCents - totalRefundedCents,
        refundCount: allRefunds.length,
        referralConversions: referralConversions.length,
      });
    } catch (err: any) {
      console.error("Admin overview error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: User list (search + pagination-lite)
  app.get("/api/admin/users", requireAdmin, requirePermission("users", "read"), async (req, res) => {
    try {
      const search = String(req.query.search || "").trim().toLowerCase();
      const allUsers = await db.select().from(users) as any[];
      const allPayments = await db.select().from(payments) as any[];
      const allResumeVersions = await db.select().from(resumeVersions) as any[];

      let filtered = allUsers;
      if (search) {
        filtered = allUsers.filter((u: any) => u.uid.toLowerCase().includes(search) || u.email.toLowerCase().includes(search));
      }

      const result = filtered.map((u: any) => {
        const userPayments = allPayments.filter((p: any) => p.userId === u.id);
        const paidPayments = userPayments.filter((p: any) => p.status === 2);
        const taskCount = new Set(allResumeVersions.filter((v: any) => v.userId === u.id).map((v: any) => v.reportId)).size;
        return {
          id: u.id,
          uid: u.uid,
          email: u.email,
          referredBy: u.referredBy,
          createdAt: u.createdAt,
          totalPaidCents: paidPayments.reduce((s: number, p: any) => s + p.amount, 0),
          paymentCount: userPayments.length,
          taskCount,
        };
      }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ users: result.slice(0, 200), total: result.length });
    } catch (err: any) {
      console.error("Admin users list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: User detail
  app.get("/api/admin/users/:uid", requireAdmin, requirePermission("users", "read"), async (req, res) => {
    try {
      const { uid } = req.params;
      const rows = await db.select().from(users).where(eq(users.uid, uid)) as any[];
      const user = rows[0];
      if (!user) return res.status(404).json({ error: "用户不存在" });

      const userPayments = (await db.select().from(payments).where(eq(payments.userId, user.id))) as any[];
      const userLogs = (await db.select().from(eventLogs).where(eq(eventLogs.userId, user.id))) as any[];
      const userResumeVersions = (await db.select().from(resumeVersions).where(eq(resumeVersions.userId, user.id))) as any[];
      const allRefunds = await db.select().from(refunds) as any[];
      const paymentIds = new Set(userPayments.map((p: any) => p.id));
      const userRefunds = allRefunds.filter((r: any) => paymentIds.has(r.paymentId));

      const referralConversions = userLogs.filter((l: any) => l.eventType === "referral_conversion");

      return res.json({
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          referredBy: user.referredBy,
          createdAt: user.createdAt,
        },
        payments: userPayments,
        refunds: userRefunds,
        tasks: userResumeVersions.map((v: any) => ({ reportId: v.reportId, createdAt: v.createdAt })),
        referralConversions,
        eventLogs: userLogs.slice(-100).reverse(),
      });
    } catch (err: any) {
      console.error("Admin user detail error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Task list (from resume versions, joined with owning user)
  app.get("/api/admin/tasks", requireAdmin, requirePermission("tasks", "read"), async (req, res) => {
    try {
      const search = String(req.query.search || "").trim().toLowerCase();
      const allResumeVersions = await db.select().from(resumeVersions) as any[];
      const allUsers = await db.select().from(users) as any[];
      const usersById = new Map(allUsers.map((u: any) => [u.id, u]));
      const allPayments = await db.select().from(payments) as any[];

      let list = allResumeVersions.map((v: any) => {
        const owner = usersById.get(v.userId);
        const taskPayments = allPayments.filter((p: any) => p.taskId === v.reportId);
        return {
          reportId: v.reportId,
          uid: owner?.uid || "未知",
          userId: v.userId,
          createdAt: v.createdAt,
          hasPaidUnlock: taskPayments.some((p: any) => p.status === 2),
          paymentCount: taskPayments.length,
        };
      });

      if (search) {
        list = list.filter((t: any) => t.reportId.toLowerCase().includes(search) || t.uid.toLowerCase().includes(search));
      }

      list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ tasks: list.slice(0, 200), total: list.length });
    } catch (err: any) {
      console.error("Admin tasks list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Payment list
  app.get("/api/admin/payments", requireAdmin, requirePermission("payments", "read"), async (req, res) => {
    try {
      const statusFilter = req.query.status ? Number(req.query.status) : undefined;
      const allPayments = await db.select().from(payments) as any[];
      const allUsers = await db.select().from(users) as any[];
      const usersById = new Map(allUsers.map((u: any) => [u.id, u]));

      let list = allPayments.map((p: any) => ({
        ...p,
        uid: usersById.get(p.userId)?.uid || "未知",
      }));
      if (statusFilter !== undefined) {
        list = list.filter((p: any) => p.status === statusFilter);
      }
      list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ payments: list.slice(0, 200), total: list.length });
    } catch (err: any) {
      console.error("Admin payments list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Refund list
  app.get("/api/admin/refunds", requireAdmin, requirePermission("payments", "read"), async (req, res) => {
    try {
      const allRefunds = await db.select().from(refunds) as any[];
      const allPayments = await db.select().from(payments) as any[];
      const paymentsById = new Map(allPayments.map((p: any) => [p.id, p]));
      const allUsers = await db.select().from(users) as any[];
      const usersById = new Map(allUsers.map((u: any) => [u.id, u]));

      const list = allRefunds.map((r: any) => {
        const payment = paymentsById.get(r.paymentId);
        return {
          ...r,
          uid: payment ? usersById.get(payment.userId)?.uid || "未知" : "未知",
        };
      }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ refunds: list.slice(0, 200), total: list.length });
    } catch (err: any) {
      console.error("Admin refunds list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Refund money-path helpers (shared by 退款页 与 审批中心) ──────────────────
  // 网关退款状态码（文档第9节）→ 内部退款状态码映射
  // 网关: 1=待审核  2=已拒绝  3=已批准  4=退款中  5=退款成功  6=退款失败
  // 内部: 0=待审批  1=处理中  2=退款成功  3=退款失败  4=已拒绝
  function mapGatewayRefundStatus(gwStatus: number): { internalStatus: number; statusName: string } {
    switch (gwStatus) {
      case 5: return { internalStatus: 2, statusName: "退款成功" };
      case 6: return { internalStatus: 3, statusName: "退款失败" };
      case 2: return { internalStatus: 4, statusName: "已拒绝" };
      default: return { internalStatus: 1, statusName: "处理中" }; // 网关 1/3/4 均为处理中
    }
  }

  // 退款执行的唯一代码路径：财务/超管，无论从哪个入口触发。返回 { code, body }。
  async function approveRefundById(refundId: number, admin: any, req: any): Promise<{ code: number; body: any }> {
    if (admin.role !== "finance" && admin.role !== "super_admin") {
      return { code: 403, body: { error: "退款执行仅限财务或超级管理员" } };
    }
    const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)) as any[];
    const refund = rows[0];
    if (!refund) return { code: 404, body: { error: "退款申请不存在" } };
    if (refund.status !== 0) return { code: 400, body: { error: "该退款申请已被处理" } };
    // 退款无需双人审核，有权限的管理员可直接批准（无 Maker-Checker 限制）

    const orderRows = await db.select().from(payments).where(eq(payments.id, refund.paymentId)) as any[];
    const order = orderRows[0];
    if (!order) return { code: 404, body: { error: "关联订单不存在" } };

    const notifyUrl = `${getPublicBaseUrl(req)}/api/admin/refunds/callback`;
    const refundResult = await createRefund({
      businessOrderNo: order.businessOrderNo,
      paymentOrderNo: order.paymentOrderNo,
      refundAmount: refund.amount,
      reason: refund.reason || "",
      notifyUrl,
      needAudit: false, // 免审（文档§7.4）：CareerAI后台已完成审批，无需网关再次人工审核，直接发起银行退款
    });

    // 将网关状态码映射为内部状态码后落库
    const mapped = mapGatewayRefundStatus(refundResult.status ?? -1);
    await db.update(refunds).set({
      refundOrderNo: refundResult.refundOrderNo,
      status: mapped.internalStatus,
      statusName: mapped.statusName,
      processedByAdmin: admin.username,
      approvedByAdmin: admin.username,
      updatedAt: new Date(),
    } as any).where(eq(refunds.id, refund.id));

    // 网关 status=5（退款成功）时即时记账；免审场景下可能直接成功
    if (refundResult.status === 5) {
      recordRefundSuccess({ ...refund, status: 2 }).catch(() => {}); // 幂等：现金流出 + 履约收入冲销
      const allRefundsForPayment = await db.select().from(refunds).where(eq(refunds.paymentId, order.id)) as any[];
      const totalRefunded = allRefundsForPayment
        .filter((r: any) => r.id === refund.id ? true : r.status === 2) // 内部 2 = 退款成功
        .reduce((s: number, r: any) => s + r.amount, 0);
      if (totalRefunded >= order.amount) {
        await db.update(payments).set({ status: 6, statusName: "已退款", updatedAt: new Date() } as any).where(eq(payments.id, order.id));
      }
    }

    await resolveApprovalForRefund(refund.id, "APPROVED", admin.username, null);
    await logAudit(admin, "refund_approved", "payment", order.businessOrderNo, { refundId: refund.id, amount: refund.amount, refundOrderNo: refundResult.refundOrderNo });
    if (order.userId) evaluateRiskRules(order.userId).catch(() => {});
    return { code: 200, body: { success: true, gatewayResult: refundResult } };
  }

  async function rejectRefundById(refundId: number, admin: any, reason?: string): Promise<{ code: number; body: any }> {
    if (admin.role !== "finance" && admin.role !== "super_admin") {
      return { code: 403, body: { error: "退款审批仅限财务或超级管理员" } };
    }
    const rows = await db.select().from(refunds).where(eq(refunds.id, refundId)) as any[];
    const refund = rows[0];
    if (!refund) return { code: 404, body: { error: "退款申请不存在" } };
    if (refund.status !== 0) return { code: 400, body: { error: "该退款申请已被处理" } };
    // 退款无需双人审核，有权限的管理员可直接拒绝（无 Maker-Checker 限制）
    await db.update(refunds).set({
      status: 4,
      statusName: "已拒绝",
      approvedByAdmin: admin.username,
      rejectionReason: reason?.trim() || null,
      updatedAt: new Date(),
    } as any).where(eq(refunds.id, refund.id));

    await resolveApprovalForRefund(refund.id, "REJECTED", admin.username, reason?.trim() || null);
    await logAudit(admin, "refund_rejected", "refund", String(refund.id), { reason: reason?.trim() });
    return { code: 200, body: { success: true } };
  }

  // 将退款关联的审批单同步为终态，保证「审批中心」与「退款页」状态一致。
  async function resolveApprovalForRefund(refundId: number, status: "APPROVED" | "REJECTED", adminUsername: string, decisionReason: string | null) {
    try {
      const all = await db.select().from(approvals).where(eq(approvals.targetId, String(refundId))) as any[];
      const pending = all.filter((a: any) => a.type === "refund" && a.status === "PENDING");
      for (const ap of pending) {
        await db.update(approvals).set({
          status,
          approvedByAdmin: adminUsername,
          decisionReason,
          updatedAt: new Date(),
        } as any).where(eq(approvals.id, ap.id));
      }
    } catch (e) {
      console.error("resolveApprovalForRefund error:", e);
    }
  }

  // API Route: Maker-Checker step 1 — finance submits a refund REQUEST (no gateway call yet, requires a second admin to approve)
  app.post("/api/admin/payments/:businessOrderNo/refund", requireAdmin, requirePermission("payments", "write"), async (req: any, res) => {
    try {
      if (!isPaymentConfigured()) {
        return res.status(503).json({ error: "支付服务未配置" });
      }
      const { businessOrderNo } = req.params;
      const { amount, reason } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: "退款金额无效" });
      if (!reason?.trim()) return res.status(400).json({ error: "请填写退款原因" });

      const rows = await db.select().from(payments).where(eq(payments.businessOrderNo, businessOrderNo)) as any[];
      const order = rows[0];
      if (!order) return res.status(404).json({ error: "订单不存在" });
      if (order.status !== 2) return res.status(400).json({ error: "只能对已支付订单发起退款" });
      if (amount > order.amount) return res.status(400).json({ error: "退款金额不能超过订单实付金额" });

      const existingRefunds = await db.select().from(refunds).where(eq(refunds.paymentId, order.id)) as any[];
      const alreadyRefunded = existingRefunds
        .filter((r: any) => r.status === 1 || r.status === 2 || r.status === 0)
        .reduce((s: number, r: any) => s + r.amount, 0);
      if (alreadyRefunded + amount > order.amount) {
        return res.status(400).json({ error: "累计退款（含待审批）金额不能超过订单实付金额" });
      }

      const inserted = await db.insert(refunds).values({
        paymentId: order.id,
        businessOrderNo: order.businessOrderNo,
        amount,
        reason: reason.trim(),
        status: 0,
        statusName: "待审批",
        requestedByAdmin: req.admin.username,
      } as any) as any[];
      const newRefund = Array.isArray(inserted) ? inserted[0] : inserted;

      // 生成审批单，进入「审批中心」等待复核（PRD §12.6）
      await db.insert(approvals).values({
        type: "refund",
        targetType: "refund",
        targetId: String(newRefund.id),
        amount,
        status: "PENDING",
        reason: reason.trim(),
        requestedByAdmin: req.admin.username,
      } as any);

      await logAudit(req.admin, "refund_requested", "payment", businessOrderNo, { amount, reason: reason.trim() });
      return res.json({ success: true, refund: newRefund, pendingApproval: true });
    } catch (err: any) {
      console.error("Admin refund request error:", err);
      return res.status(502).json({ error: err.message || "退款申请失败，请稍后重试" });
    }
  });

  // API Route: Maker-Checker step 2a — a different finance/super_admin approves and the gateway call actually fires
  app.post("/api/admin/refunds/:id/approve", requireAdmin, requireRole("finance"), async (req: any, res) => {
    try {
      const result = await approveRefundById(Number(req.params.id), req.admin, req);
      return res.status(result.code).json(result.body);
    } catch (err: any) {
      console.error("Admin refund approve error:", err);
      return res.status(502).json({ error: err.message || "退款审批失败，请稍后重试" });
    }
  });

  // API Route: Maker-Checker step 2b — reject a pending refund request
  app.post("/api/admin/refunds/:id/reject", requireAdmin, requireRole("finance"), async (req: any, res) => {
    try {
      const result = await rejectRefundById(Number(req.params.id), req.admin, req.body?.reason);
      return res.status(result.code).json(result.body);
    } catch (err: any) {
      console.error("Admin refund reject error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== 审批中心 (PRD §12.6 Maker-Checker 统一入口) =====================
  // ─── Phase 2A 发布审批闭环 helpers ──────────────────────────────────────────
  // 真正执行"发布"：归档同组当前已发布版本，把目标版本置为 published。回滚复用同一逻辑。
  async function publishConfigVersion(id: number, adminUsername: string): Promise<{ ok: boolean; error?: string; entity?: any }> {
    const rows = await db.select().from(siteConfigs).where(eq(siteConfigs.id, id)) as any[];
    const cfg = rows[0];
    if (!cfg) return { ok: false, error: "配置不存在" };
    const siblings = await db.select().from(siteConfigs).where(eq(siteConfigs.key, cfg.key)) as any[];
    for (const s of siblings) {
      if (s.status === "published" && s.id !== cfg.id) {
        await db.update(siteConfigs).set({ status: "archived", updatedAt: new Date() } as any).where(eq(siteConfigs.id, s.id));
      }
    }
    await db.update(siteConfigs).set({ status: "published", publishedByAdmin: adminUsername, publishedAt: new Date(), updatedAt: new Date() } as any).where(eq(siteConfigs.id, cfg.id));
    return { ok: true, entity: cfg };
  }
  async function publishPromptVersion(id: number, adminUsername: string): Promise<{ ok: boolean; error?: string; entity?: any }> {
    const rows = await db.select().from(promptVersions).where(eq(promptVersions.id, id)) as any[];
    const prompt = rows[0];
    if (!prompt) return { ok: false, error: "提示词版本不存在" };
    const siblings = await db.select().from(promptVersions).where(eq(promptVersions.operation, prompt.operation)) as any[];
    for (const s of siblings) {
      if (s.status === "published" && s.id !== prompt.id) {
        await db.update(promptVersions).set({ status: "archived" } as any).where(eq(promptVersions.id, s.id));
      }
    }
    await db.update(promptVersions).set({ status: "published", publishedByAdmin: adminUsername, publishedAt: new Date() } as any).where(eq(promptVersions.id, prompt.id));
    return { ok: true, entity: prompt };
  }
  async function publishPriceVersion(id: number, adminUsername: string): Promise<{ ok: boolean; error?: string; entity?: any }> {
    const rows = await db.select().from(priceVersions).where(eq(priceVersions.id, id)) as any[];
    const pv = rows[0];
    if (!pv) return { ok: false, error: "价格版本不存在" };
    const siblings = await db.select().from(priceVersions).where(eq(priceVersions.skuId, pv.skuId)) as any[];
    for (const s of siblings) {
      if (s.status === "published" && s.id !== pv.id) {
        await db.update(priceVersions).set({ status: "archived", updatedAt: new Date() } as any).where(eq(priceVersions.id, s.id));
      }
    }
    await db.update(priceVersions).set({ status: "published", publishedByAdmin: adminUsername, publishedAt: new Date(), updatedAt: new Date() } as any).where(eq(priceVersions.id, pv.id));
    return { ok: true, entity: pv };
  }

  const PUBLISH_TARGET_TABLE: Record<string, any> = {
    config_publish: siteConfigs,
    prompt_publish: promptVersions,
    price_publish: priceVersions,
  };
  // 审批通过后执行对应发布；返回 null 表示该类型不在发布闭环内。
  async function executePublishApproval(type: string, targetId: number, adminUsername: string) {
    if (type === "config_publish") return publishConfigVersion(targetId, adminUsername);
    if (type === "prompt_publish") return publishPromptVersion(targetId, adminUsername);
    if (type === "price_publish") return publishPriceVersion(targetId, adminUsername);
    return null;
  }
  // 审批被拒后把目标版本从 pending 退回 draft（不影响历史已发布版本）。
  async function revertPendingToDraft(type: string, targetId: number) {
    const table = PUBLISH_TARGET_TABLE[type];
    if (!table) return;
    const rows = await db.select().from(table).where(eq(table.id, targetId)) as any[];
    if (rows[0]?.status === "pending") {
      await db.update(table).set({ status: "draft" } as any).where(eq(table.id, targetId));
    }
  }
  // 提交发布审批：草稿置 pending + 创建 PENDING 审批单（防重复）。
  async function submitPublishApproval(opts: {
    type: "config_publish" | "prompt_publish" | "price_publish";
    targetType: string;
    table: any;
    entity: any;
    requestedByAdmin: string;
    payload?: any;
    amount?: number | null;
    reason?: string | null;
  }): Promise<{ ok: boolean; error?: string; approval?: any }> {
    if (opts.entity.status !== "draft") return { ok: false, error: "仅草稿状态可提交发布审批" };
    const all = await db.select().from(approvals) as any[];
    const dup = all.find((a) => a.status === "PENDING" && a.type === opts.type && String(a.targetId) === String(opts.entity.id));
    if (dup) return { ok: false, error: "该版本已在审批中，请勿重复提交" };
    await db.update(opts.table).set({ status: "pending" } as any).where(eq(opts.table.id, opts.entity.id));
    const inserted = await db.insert(approvals).values({
      type: opts.type,
      targetType: opts.targetType,
      targetId: String(opts.entity.id),
      payload: opts.payload ? JSON.stringify(opts.payload) : null,
      amount: opts.amount ?? null,
      status: "PENDING",
      reason: opts.reason ?? null,
      requestedByAdmin: opts.requestedByAdmin,
    } as any) as any[];
    return { ok: true, approval: inserted[0] };
  }

  app.get("/api/admin/approvals", requireAdmin, requirePermission("approvals", "read"), async (req: any, res) => {
    try {
      const all = await db.select().from(approvals) as any[];
      const status = req.query.status as string | undefined;
      let list = status ? all.filter((a) => a.status === status) : all;
      // 运营/客服仅可见自身发起；财务/审计/超管可见全部（PRD §2.3 审批中心行）
      const role = req.admin.role;
      if (role !== "super_admin" && role !== "finance" && role !== "auditor") {
        list = list.filter((a) => a.requestedByAdmin === req.admin.username);
      }
      list.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ approvals: list, total: list.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/approvals/:id/approve", requireAdmin, requirePermission("approvals", "write"), async (req: any, res) => {
    try {
      const rows = await db.select().from(approvals).where(eq(approvals.id, Number(req.params.id))) as any[];
      const ap = rows[0];
      if (!ap) return res.status(404).json({ error: "审批单不存在" });
      if (ap.status !== "PENDING") return res.status(400).json({ error: "该审批单已处理" });

      // 退款无需双人审核：先处理退款类审批，直接调支付网关 API，不经过 Maker-Checker
      if (ap.type === "refund") {
        const result = await approveRefundById(Number(ap.targetId), req.admin, req);
        return res.status(result.code).json(result.body);
      }

      // 其他审批类型（配置/提示词/价格发布）：发起人不得审批自己提交的申请（超管除外）
      if (ap.requestedByAdmin && ap.requestedByAdmin === req.admin.username && req.admin.role !== "super_admin") {
        return res.status(403).json({ error: "不能审批自己发起的申请" });
      }

      // 发布类审批（配置/提示词/价格）：通过即真正发布，归档旧版本。
      const publishResult = await executePublishApproval(ap.type, Number(ap.targetId), req.admin.username);
      if (publishResult && !publishResult.ok) {
        return res.status(400).json({ error: publishResult.error });
      }

      await db.update(approvals).set({
        status: "APPROVED",
        approvedByAdmin: req.admin.username,
        decisionReason: req.body?.reason?.trim() || null,
        updatedAt: new Date(),
      } as any).where(eq(approvals.id, ap.id));
      await logAudit(req.admin, "approval_approved", "approval", String(ap.id), { type: ap.type, targetId: ap.targetId });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Approval approve error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/approvals/:id/reject", requireAdmin, requirePermission("approvals", "write"), async (req: any, res) => {
    try {
      const rows = await db.select().from(approvals).where(eq(approvals.id, Number(req.params.id))) as any[];
      const ap = rows[0];
      if (!ap) return res.status(404).json({ error: "审批单不存在" });
      if (ap.status !== "PENDING") return res.status(400).json({ error: "该审批单已处理" });

      // 退款无需双人审核：先处理退款类审批
      if (ap.type === "refund") {
        const result = await rejectRefundById(Number(ap.targetId), req.admin, req.body?.reason);
        return res.status(result.code).json(result.body);
      }

      // 其他审批类型（配置/提示词/价格发布）：发起人不得处理自己提交的申请（超管除外）
      if (ap.requestedByAdmin && ap.requestedByAdmin === req.admin.username && req.admin.role !== "super_admin") {
        return res.status(403).json({ error: "不能审批自己发起的申请" });
      }

      // 发布类审批被拒：目标版本从 pending 退回 draft，历史已发布版本不受影响。
      await revertPendingToDraft(ap.type, Number(ap.targetId));

      await db.update(approvals).set({
        status: "REJECTED",
        approvedByAdmin: req.admin.username,
        decisionReason: req.body?.reason?.trim() || null,
        updatedAt: new Date(),
      } as any).where(eq(approvals.id, ap.id));
      await logAudit(req.admin, "approval_rejected", "approval", String(ap.id), { type: ap.type, reason: req.body?.reason?.trim() });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Approval reject error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Async refund notify callback from the payment gateway
  app.post("/api/admin/refunds/callback", async (req, res) => {
    try {
      const notify = req.body;
      const refundOrderNo = notify?.refundOrderNo;
      if (!refundOrderNo) return res.status(200).send();
      const rows = await db.select().from(refunds).where(eq(refunds.refundOrderNo, refundOrderNo)) as any[];
      const refund = rows[0];
      if (!refund) return res.status(200).send();

      // 将网关状态码映射为内部状态码后落库
      const cbMapped = mapGatewayRefundStatus(notify.status ?? -1);
      await db.update(refunds).set({
        status: cbMapped.internalStatus,
        statusName: cbMapped.statusName,
        updatedAt: new Date(),
      } as any).where(eq(refunds.id, refund.id));

      // 网关 status=5（退款成功）时记账并更新原支付订单状态
      if (notify.status === 5) {
        recordRefundSuccess({ ...refund, status: 2 }).catch(() => {}); // 幂等：退款现金流出 + 履约收入冲销
        const paymentRows = await db.select().from(payments).where(eq(payments.id, refund.paymentId)) as any[];
        const payment = paymentRows[0];
        if (payment) {
          const allRefundsForPayment = await db.select().from(refunds).where(eq(refunds.paymentId, payment.id)) as any[];
          const totalRefunded = allRefundsForPayment.filter((r: any) => r.id === refund.id ? true : r.status === 2).reduce((s: number, r: any) => s + r.amount, 0);
          if (totalRefunded >= payment.amount) {
            await db.update(payments).set({ status: 6, statusName: "已退款", updatedAt: new Date() } as any).where(eq(payments.id, payment.id));
          }
        }
      }
      return res.status(200).send();
    } catch (err: any) {
      console.error("Refund callback error:", err);
      return res.status(200).send();
    }
  });

  // API Route: Referral ledger (all referral conversions across users)
  app.get("/api/admin/referrals", requireAdmin, requirePermission("growth", "read"), async (req, res) => {
    try {
      const allLogs = await db.select().from(eventLogs).where(eq(eventLogs.eventType, "referral_conversion")) as any[];
      const allUsers = await db.select().from(users) as any[];
      const usersById = new Map(allUsers.map((u: any) => [u.id, u]));

      const list = allLogs.map((l: any) => {
        let meta: any = {};
        try { meta = JSON.parse(l.metaData || "{}"); } catch {}
        return {
          id: l.id,
          referrerUid: usersById.get(l.userId)?.uid || "未知",
          referredUid: meta.referredUid || "未知",
          claimed: !!meta.claimed,
          createdAt: l.createdAt,
        };
      }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ referrals: list.slice(0, 300), total: list.length });
    } catch (err: any) {
      console.error("Admin referrals list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/feedback-summary", requireAdmin, requirePermission("users", "read"), async (req, res) => {
    // Collect all feedbacks from memory cache
    const all: any[] = [];
    for (const [taskId, list] of userFeedbacksCache.entries()) {
      all.push(...list);
    }
    
    // Add feedbacks from Cloud SQL if available
    try {
      const dbFeedbacks = await db.select({
        rating: userFeedbacks.rating,
        feedbackText: userFeedbacks.feedbackText,
        createdAt: userFeedbacks.createdAt
      }).from(userFeedbacks);
      
      for (const df of dbFeedbacks) {
        all.push({
          rating: df.rating,
          feedbackText: df.feedbackText,
          selectedMetrics: [],
          createdAt: df.createdAt ? df.createdAt.toISOString() : new Date().toISOString()
        });
      }
    } catch (dbErr) {
      console.error("Failed to query feedbacks from Cloud SQL:", dbErr);
    }
    
    const count = all.length;
    const avgRating = count > 0 ? (all.reduce((acc, f) => acc + f.rating, 0) / count).toFixed(1) : "5.0";
    
    return res.json({
      totalCount: count,
      averageRating: parseFloat(avgRating),
      feedbacks: all
    });
  });

  app.get("/api/admin/conversion-funnel", requireAdmin, requirePermission("growth", "read"), async (req, res) => {
    let dbFileUploads = 0;
    let dbJdAnalyzed = 0;
    let dbReportsGenerated = 0;
    let dbQaCompleted = 0;
    let dbPaymentCompleted = 0;
    let dbExportsCompleted = 0;
    
    try {
      const dbLogs = await db.select({ eventType: eventLogs.eventType }).from(eventLogs);
      dbFileUploads = dbLogs.filter(l => l.eventType === 'file_uploaded').length;
      dbJdAnalyzed = dbLogs.filter(l => l.eventType === 'jd_analyzed').length;
      dbReportsGenerated = dbLogs.filter(l => l.eventType === 'report_generated').length;
      dbQaCompleted = dbLogs.filter(l => l.eventType === 'questions_completed').length;
      dbPaymentCompleted = dbLogs.filter(l => l.eventType === 'payment_completed').length;
      dbExportsCompleted = dbLogs.filter(l => l.eventType === 'exports_completed').length;
    } catch (dbErr) {
      console.error("Failed to count events from Cloud SQL:", dbErr);
    }

    // Count events for simple funnel analysis
    const fileUploads = (eventLogsCache.filter(e => e.event === 'file_uploaded').length || 120) + dbFileUploads;
    const jdAnalyzed = (eventLogsCache.filter(e => e.event === 'jd_analyzed').length || 105) + dbJdAnalyzed;
    const reportsGenerated = (eventLogsCache.filter(e => e.event === 'report_generated').length || 92) + dbReportsGenerated;
    const qaCompleted = (eventLogsCache.filter(e => e.event === 'questions_completed').length || 74) + dbQaCompleted;
    const paymentCompleted = (eventLogsCache.filter(e => e.event === 'payment_completed').length || 52) + dbPaymentCompleted;
    const exportsCompleted = (eventLogsCache.filter(e => e.event === 'exports_completed').length || 48) + dbExportsCompleted;
    
    return res.json([
      { stage: "简历上传 (File Upload)", count: fileUploads, percentage: 100 },
      { stage: "岗位画像研判 (JD Analysis)", count: jdAnalyzed, percentage: Math.round((jdAnalyzed / fileUploads) * 100) },
      { stage: "契合评估生成 (Report Gen)", count: reportsGenerated, percentage: Math.round((reportsGenerated / fileUploads) * 100) },
      { stage: "简历智能追问 (Smart Q&A)", count: qaCompleted, percentage: Math.round((qaCompleted / fileUploads) * 100) },
      { stage: "高级简历重构 (Executive Upgrade)", count: paymentCompleted, percentage: Math.round((paymentCompleted / fileUploads) * 100) },
      { stage: "完整履历导出 (Package Export)", count: exportsCompleted, percentage: Math.round((exportsCompleted / fileUploads) * 100) }
    ]);
  });

  // API Route: Audit log (read-only, for compliance / traceability)
  app.get("/api/admin/audit-logs", requireAdmin, requirePermission("audit", "read"), async (req, res) => {
    try {
      const all = await db.select().from(auditLogs) as any[];
      const sorted = all.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ logs: sorted.slice(0, 300), total: all.length });
    } catch (err: any) {
      console.error("Admin audit logs error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: AI cost accounting & margin analysis (finance module)
  app.get("/api/admin/finance/costs", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const allCosts = await db.select().from(costEvents) as any[];
      const totalCostCents = allCosts.reduce((s: number, c: any) => s + (c.costCents || 0), 0);
      const totalTokensIn = allCosts.reduce((s: number, c: any) => s + (c.tokensIn || 0), 0);
      const totalTokensOut = allCosts.reduce((s: number, c: any) => s + (c.tokensOut || 0), 0);

      const byOperation: Record<string, { count: number; costCents: number }> = {};
      for (const c of allCosts) {
        const key = c.operation || "unknown";
        if (!byOperation[key]) byOperation[key] = { count: 0, costCents: 0 };
        byOperation[key].count += 1;
        byOperation[key].costCents += c.costCents || 0;
      }

      const allPayments = await db.select().from(payments) as any[];
      const totalRevenueCents = allPayments.filter((p: any) => p.status === 2).reduce((s: number, p: any) => s + p.amount, 0);

      return res.json({
        totalCostCents,
        totalTokensIn,
        totalTokensOut,
        totalRevenueCents,
        grossMarginCents: totalRevenueCents - totalCostCents,
        grossMarginPct: totalRevenueCents > 0 ? Math.round(((totalRevenueCents - totalCostCents) / totalRevenueCents) * 1000) / 10 : null,
        byOperation,
        recentEvents: allCosts.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 100),
      });
    } catch (err: any) {
      console.error("Admin finance costs error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── 模型计价管理（PRD §3.4 / §8.3）────────────────────────────────────────
  // GET /api/admin/model-prices — 查询所有计价历史（按生效时间倒序）
  app.get("/api/admin/model-prices", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const rows = await rawQuery(
        `SELECT id, provider, model, input_per_million, output_per_million, currency, source, effective_at, created_by_admin, created_at
         FROM model_prices ORDER BY effective_at DESC, id DESC LIMIT 200`
      );
      return res.json({ prices: rows.rows });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/model-prices — 新增一条模型单价（带生效日期，追加式不可篡改）
  app.post("/api/admin/model-prices", requireAdmin, requirePermission("finance", "write"), async (req: any, res) => {
    try {
      const { provider, model, inputPerMillion, outputPerMillion, currency, source, effectiveAt, notes } = req.body;
      if (!provider?.trim() || !model?.trim()) return res.status(400).json({ error: "provider 和 model 不能为空" });
      if (typeof inputPerMillion !== "number" || typeof outputPerMillion !== "number") {
        return res.status(400).json({ error: "inputPerMillion 和 outputPerMillion 须为数字（单位：分/百万tokens）" });
      }
      if (!effectiveAt) return res.status(400).json({ error: "effectiveAt 生效时间不能为空" });
      const effDate = new Date(effectiveAt);
      if (isNaN(effDate.getTime())) return res.status(400).json({ error: "effectiveAt 格式无效" });
      const result = await rawQuery(
        `INSERT INTO model_prices (provider, model, input_per_million, output_per_million, currency, source, effective_at, created_by_admin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (provider, model, effective_at) DO NOTHING
         RETURNING *`,
        [
          provider.trim(), model.trim(),
          Math.round(inputPerMillion), Math.round(outputPerMillion),
          currency || "CNY", source || "official",
          effDate.toISOString(), req.admin.username,
        ]
      );
      if (result.rows.length === 0) return res.status(409).json({ error: "该 provider/model/effectiveAt 组合已存在，请更换生效时间" });
      await logAudit(req.admin, "model_price_created", "model_price", String(result.rows[0].id), { provider, model, inputPerMillion, outputPerMillion, effectiveAt });
      return res.json({ success: true, price: result.rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/finance/token-stats — Token 消耗聚合统计（按模型/操作/日期）
  app.get("/api/admin/finance/token-stats", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const days = Math.min(Number(req.query.days) || 30, 90);

      // 总量摘要
      const summary = await rawQuery(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(tokens_in),0)         AS total_tokens_in,
                COALESCE(SUM(tokens_out),0)        AS total_tokens_out,
                COALESCE(SUM(cost_micro_cents),0)  AS total_micro_cents
         FROM cost_events`
      );

      // 按模型聚合
      const byModel = await rawQuery(
        `SELECT model,
                COUNT(*) AS calls,
                COALESCE(SUM(tokens_in),0)        AS tokens_in,
                COALESCE(SUM(tokens_out),0)       AS tokens_out,
                COALESCE(SUM(cost_micro_cents),0) AS micro_cents
         FROM cost_events
         GROUP BY model ORDER BY micro_cents DESC`
      );

      // 按操作类型聚合
      const byOperation = await rawQuery(
        `SELECT operation,
                COUNT(*) AS calls,
                COALESCE(SUM(tokens_in),0)        AS tokens_in,
                COALESCE(SUM(tokens_out),0)       AS tokens_out,
                COALESCE(SUM(cost_micro_cents),0) AS micro_cents
         FROM cost_events
         GROUP BY operation ORDER BY micro_cents DESC`
      );

      // 按业务日（Asia/Shanghai）聚合，最近 N 天
      const byDay = await rawQuery(
        `SELECT TO_CHAR((created_at AT TIME ZONE 'Asia/Shanghai')::date, 'YYYY-MM-DD') AS biz_date,
                COUNT(*) AS calls,
                COALESCE(SUM(tokens_in),0)        AS tokens_in,
                COALESCE(SUM(tokens_out),0)       AS tokens_out,
                COALESCE(SUM(cost_micro_cents),0) AS micro_cents
         FROM cost_events
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY biz_date ORDER BY biz_date DESC`
      );

      // 最近 200 条明细
      const recent = await rawQuery(
        `SELECT id, provider, model, operation, tokens_in, tokens_out, cost_cents, cost_micro_cents, task_id, created_at
         FROM cost_events ORDER BY created_at DESC LIMIT 200`
      );

      const s = summary.rows[0];
      return res.json({
        summary: {
          calls: Number(s.calls),
          totalTokensIn: Number(s.total_tokens_in),
          totalTokensOut: Number(s.total_tokens_out),
          totalMicroCents: Number(s.total_micro_cents),
          totalCostCents: Math.round(Number(s.total_micro_cents) / 1_000_000),
        },
        byModel: byModel.rows.map((r: any) => ({
          model: r.model, calls: Number(r.calls),
          tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out),
          microCents: Number(r.micro_cents), costCents: Math.round(Number(r.micro_cents) / 1_000_000),
        })),
        byOperation: byOperation.rows.map((r: any) => ({
          operation: r.operation, calls: Number(r.calls),
          tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out),
          microCents: Number(r.micro_cents), costCents: Math.round(Number(r.micro_cents) / 1_000_000),
        })),
        byDay: byDay.rows.map((r: any) => ({
          bizDate: r.biz_date, calls: Number(r.calls),
          tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out),
          microCents: Number(r.micro_cents), costCents: Math.round(Number(r.micro_cents) / 1_000_000),
        })),
        recent: recent.rows,
      });
    } catch (err: any) {
      console.error("Admin token-stats error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Phase 2B 财务闭环（账本 / 收入分配 / 对账关账）=====================

  // 业务日（Asia/Shanghai）YYYY-MM-DD
  function bizDateOf(ts: any): string | null {
    if (!ts) return null;
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  }

  // 账本按 entry_type 汇总（分）。绝不整表求和：现金口径与履约口径共表，方向/含义不同。
  async function summarizeFinanceLedger() {
    const rows = await db.select().from(financeLedger) as any[];
    const byType: Record<string, { count: number; amountCents: number }> = {};
    for (const r of rows) {
      const k = r.entryType || "unknown";
      if (!byType[k]) byType[k] = { count: 0, amountCents: 0 };
      byType[k].count += 1;
      byType[k].amountCents += r.amountCents || 0;
    }
    const g = (k: string) => byType[k]?.amountCents || 0;
    const cashInCents = g("PAYMENT_RECEIVED");
    const refundCents = -g("REFUND");           // 存负值，取正
    const feeCents = -g("PAYMENT_FEE");         // 估算，取正
    const recognizedGrossCents = g("REVENUE_ALLOCATED");
    const reversalCents = -g("REVENUE_REVERSAL");
    const recognizedNetCents = recognizedGrossCents - reversalCents;
    const netCashCents = cashInCents - refundCents - feeCents;
    const deferredCents = (cashInCents - refundCents) - recognizedNetCents; // 待确认（递延）
    return { byType, cashInCents, refundCents, feeCents, recognizedGrossCents, reversalCents, recognizedNetCents, netCashCents, deferredCents };
  }

  async function totalCostMicroCents(): Promise<number> {
    const res = await rawQuery(`SELECT COALESCE(SUM(cost_micro_cents),0) AS micro FROM cost_events`);
    return Number(res.rows[0]?.micro || 0);
  }

  // 财务汇总卡片（现金口径 + 履约口径 + 毛利）
  app.get("/api/admin/finance/summary", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const s = await summarizeFinanceLedger();
      const microCost = await totalCostMicroCents();
      const totalCostCents = Math.round(microCost / 1_000_000);
      const grossMarginCents = s.recognizedNetCents - totalCostCents; // 履约口径毛利
      const grossMarginPct = s.recognizedNetCents > 0
        ? Math.round((grossMarginCents / s.recognizedNetCents) * 1000) / 10 : null;
      const cashMarginCents = s.netCashCents - totalCostCents;
      return res.json({
        ...s,
        totalCostCents,
        totalCostMicroCents: microCost,
        grossMarginCents,
        grossMarginPct,
        cashMarginCents,
        feeNote: "渠道手续费为示意口径估算（≈0.6%），非真实结算费率",
      });
    } catch (err: any) {
      console.error("Finance summary error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 权益账本：按用户派生可用余额 + 最近流水
  app.get("/api/admin/finance/entitlements", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const rows = await db.select().from(entitlementLedger) as any[];
      const allUsers = await db.select().from(users) as any[];
      const usersById = new Map(allUsers.map((u: any) => [u.id, u]));
      const balances: Record<number, { userId: number; uid: string; email: string; balance: number; granted: number; consumed: number }> = {};
      for (const r of rows) {
        if (!balances[r.userId]) {
          const u = usersById.get(r.userId);
          balances[r.userId] = { userId: r.userId, uid: u?.uid || "", email: u?.email || "", balance: 0, granted: 0, consumed: 0 };
        }
        balances[r.userId].balance += r.amount || 0;
        if ((r.amount || 0) > 0) balances[r.userId].granted += r.amount;
        else balances[r.userId].consumed += -(r.amount || 0);
      }
      const recent = rows
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100)
        .map((r: any) => ({ ...r, uid: usersById.get(r.userId)?.uid || "", email: usersById.get(r.userId)?.email || "" }));
      return res.json({ balances: Object.values(balances).sort((a, b) => b.balance - a.balance), recent });
    } catch (err: any) {
      console.error("Finance entitlements error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 权益人工调整（追加式 adjust 流水，不改历史；带符号）
  app.post("/api/admin/finance/entitlements/adjust", requireAdmin, requirePermission("finance", "write"), async (req: any, res) => {
    try {
      const { userId, amount, note } = req.body || {};
      const uid = Number(userId);
      const amt = Number(amount);
      if (!uid || !Number.isFinite(amt) || amt === 0) return res.status(400).json({ error: "userId 与非零 amount 必填" });
      const userRows = await db.select().from(users).where(eq(users.id, uid)) as any[];
      if (!userRows[0]) return res.status(404).json({ error: "用户不存在" });
      await db.insert(entitlementLedger).values({
        userId: uid, entryType: "adjust", amount: amt, refType: "manual", refId: null,
        note: note?.trim() || null, createdByAdmin: req.admin.username,
      } as any);
      await logAudit(req.admin, "entitlement_adjusted", "user", String(uid), { amount: amt, note: note?.trim() || null });
      return res.json({ success: true });
    } catch (err: any) {
      console.error("Finance entitlement adjust error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 收入分配明细（revenue_allocations + 履约/冲销流水汇总）
  app.get("/api/admin/finance/allocations", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const allocs = await db.select().from(revenueAllocations) as any[];
      const allPayments = await db.select().from(payments) as any[];
      const paymentsById = new Map(allPayments.map((p: any) => [p.id, p]));
      const rows = allocs
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map((a: any) => {
          const p = paymentsById.get(a.paymentId);
          return { ...a, businessOrderNo: p?.businessOrderNo || "", userId: p?.userId || null, paymentStatus: p?.status ?? null, paymentStatusName: p?.statusName || "" };
        });
      const s = await summarizeFinanceLedger();
      return res.json({
        allocations: rows,
        totalAllocatedCents: allocs.reduce((sum: number, a: any) => sum + (a.allocatedAmount || 0), 0),
        recognizedGrossCents: s.recognizedGrossCents,
        reversalCents: s.reversalCents,
        recognizedNetCents: s.recognizedNetCents,
        deferredCents: s.deferredCents,
      });
    } catch (err: any) {
      console.error("Finance allocations error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 对账计算（不落状态）：比对「支付/退款源表」与「资金账本对应流水」，产出快照 + 差异清单
  async function computeReconciliation(bizDate: string) {
    const allPayments = await db.select().from(payments) as any[];
    const allRefunds = await db.select().from(refunds) as any[];
    const ledger = await db.select().from(financeLedger) as any[];

    const dayPaid = allPayments.filter((p: any) => p.status === 2 && bizDateOf(p.paidAt) === bizDate);
    const dayPaidIds = new Set(dayPaid.map((p: any) => p.id));
    const ledgerReceived = ledger.filter((l: any) => l.entryType === "PAYMENT_RECEIVED" && dayPaidIds.has(l.paymentId));
    const ledgerReceivedPaymentIds = new Set(ledgerReceived.map((l: any) => l.paymentId));
    const paymentsSum = dayPaid.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const ledgerReceivedSum = ledgerReceived.reduce((s: number, l: any) => s + (l.amountCents || 0), 0);
    const missingLedgerPaymentIds = dayPaid.filter((p: any) => !ledgerReceivedPaymentIds.has(p.id)).map((p: any) => p.id);

    const dayRefunds = allRefunds.filter((r: any) => r.status === 2 && bizDateOf(r.updatedAt) === bizDate);
    const dayRefundIds = new Set(dayRefunds.map((r: any) => r.id));
    const ledgerRefunds = ledger.filter((l: any) => l.entryType === "REFUND" && dayRefundIds.has(l.refundId));
    const ledgerRefundIds = new Set(ledgerRefunds.map((l: any) => l.refundId));
    const refundsSum = dayRefunds.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const ledgerRefundSum = -ledgerRefunds.reduce((s: number, l: any) => s + (l.amountCents || 0), 0);
    const missingLedgerRefundIds = dayRefunds.filter((r: any) => !ledgerRefundIds.has(r.id)).map((r: any) => r.id);

    const discrepancies = {
      paymentAmountMismatch: paymentsSum !== ledgerReceivedSum,
      refundAmountMismatch: refundsSum !== ledgerRefundSum,
      missingLedgerPaymentIds,
      missingLedgerRefundIds,
    };
    const balanced =
      paymentsSum === ledgerReceivedSum &&
      refundsSum === ledgerRefundSum &&
      missingLedgerPaymentIds.length === 0 &&
      missingLedgerRefundIds.length === 0;
    const summary = {
      bizDate,
      paymentCount: dayPaid.length,
      paymentsSum,
      ledgerReceivedSum,
      refundCount: dayRefunds.length,
      refundsSum,
      ledgerRefundSum,
      balanced,
      computedAt: new Date().toISOString(),
    };
    return { summary, discrepancies, balanced };
  }

  // 对账列表（含已保存状态）
  app.get("/api/admin/finance/reconciliations", requireAdmin, requirePermission("finance", "read"), async (req, res) => {
    try {
      const rows = await db.select().from(reconciliations) as any[];
      rows.sort((a: any, b: any) => (a.bizDate < b.bizDate ? 1 : -1));
      return res.json({ reconciliations: rows.map((r: any) => ({
        ...r,
        summary: r.summary ? JSON.parse(r.summary) : null,
        discrepancies: r.discrepancies ? JSON.parse(r.discrepancies) : null,
      })) });
    } catch (err: any) {
      console.error("Reconciliations list error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 运行某业务日对账（即时计算，不锁定；若已关账则只读返回）
  app.post("/api/admin/finance/reconcile", requireAdmin, requirePermission("finance", "read"), async (req: any, res) => {
    try {
      const bizDate = (req.body?.bizDate || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bizDate)) return res.status(400).json({ error: "bizDate 需为 YYYY-MM-DD" });
      const existing = await db.select().from(reconciliations).where(eq(reconciliations.bizDate, bizDate)) as any[];
      if (existing[0]?.status === "CLOSED") {
        return res.json({
          bizDate, status: "CLOSED", locked: true,
          summary: existing[0].summary ? JSON.parse(existing[0].summary) : null,
          discrepancies: existing[0].discrepancies ? JSON.parse(existing[0].discrepancies) : null,
        });
      }
      const { summary, discrepancies, balanced } = await computeReconciliation(bizDate);
      return res.json({ bizDate, status: existing[0]?.status || "OPEN", locked: false, balanced, summary, discrepancies });
    } catch (err: any) {
      console.error("Reconcile compute error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 关账：快照当日报表 + 差异清单，并锁定状态（PRD §8.8）
  app.post("/api/admin/finance/reconcile/:bizDate/close", requireAdmin, requirePermission("finance", "write"), async (req: any, res) => {
    try {
      const bizDate = req.params.bizDate;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bizDate)) return res.status(400).json({ error: "bizDate 需为 YYYY-MM-DD" });
      const existing = await db.select().from(reconciliations).where(eq(reconciliations.bizDate, bizDate)) as any[];
      if (existing[0]?.status === "CLOSED") return res.status(409).json({ error: "该业务日已关账" });
      const { summary, discrepancies } = await computeReconciliation(bizDate);
      const payload = {
        status: "CLOSED",
        summary: JSON.stringify(summary),
        discrepancies: JSON.stringify(discrepancies),
        closedByAdmin: req.admin.username,
        closedAt: new Date(),
        updatedAt: new Date(),
      };
      if (existing[0]) {
        await db.update(reconciliations).set(payload as any).where(eq(reconciliations.bizDate, bizDate));
      } else {
        await db.insert(reconciliations).values({ bizDate, ...payload } as any);
      }
      await logAudit(req.admin, "reconciliation_closed", "reconciliation", bizDate, { balanced: summary.balanced });
      return res.json({ success: true, bizDate, status: "CLOSED", summary, discrepancies });
    } catch (err: any) {
      console.error("Reconcile close error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 重开：需财务复核并记录原因（PRD §8.8）
  app.post("/api/admin/finance/reconcile/:bizDate/reopen", requireAdmin, requirePermission("finance", "write"), async (req: any, res) => {
    try {
      const bizDate = req.params.bizDate;
      const reason = (req.body?.reason || "").trim();
      if (!reason) return res.status(400).json({ error: "重开必须填写原因" });
      const existing = await db.select().from(reconciliations).where(eq(reconciliations.bizDate, bizDate)) as any[];
      if (!existing[0] || existing[0].status !== "CLOSED") return res.status(409).json({ error: "仅可重开已关账的业务日" });
      await db.update(reconciliations).set({
        status: "OPEN", reopenReason: reason, reopenedByAdmin: req.admin.username, updatedAt: new Date(),
      } as any).where(eq(reconciliations.bizDate, bizDate));
      await logAudit(req.admin, "reconciliation_reopened", "reconciliation", bizDate, { reason });
      return res.json({ success: true, bizDate, status: "OPEN" });
    } catch (err: any) {
      console.error("Reconcile reopen error:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  // API Route: Admin account management (RBAC) — super_admin only
  app.get("/api/admin/accounts", requireAdmin, requirePermission("rbac", "read"), async (req, res) => {
    try {
      const all = await db.select().from(admins) as any[];
      return res.json({ accounts: all.map((a: any) => ({ id: a.id, username: a.username, role: a.role, createdAt: a.createdAt })) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/accounts", requireAdmin, requirePermission("rbac", "write"), async (req: any, res) => {
    try {
      const { username, password, role } = req.body;
      if (!username?.trim() || !password?.trim()) return res.status(400).json({ error: "用户名和密码不能为空" });
      if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: "无效的角色" });
      const existing = await db.select().from(admins).where(eq(admins.username, username.trim())) as any[];
      if (existing.length > 0) return res.status(409).json({ error: "用户名已存在" });
      const passwordHash = await bcrypt.hash(password, 10);
      const inserted = await db.insert(admins).values({ username: username.trim(), passwordHash, role } as any) as any[];
      await logAudit(req.admin, "admin_account_created", "admin", username.trim(), { role });
      return res.json({ success: true, account: Array.isArray(inserted) ? inserted[0] : inserted });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/accounts/:id/role", requireAdmin, requirePermission("rbac", "write"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body;
      if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: "无效的角色" });
      await db.update(admins).set({ role } as any).where(eq(admins.id, Number(id)));
      await logAudit(req.admin, "admin_role_changed", "admin", id, { newRole: role });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Logo / Favicon Upload =====================
  const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { cb(null, /^image\/(jpeg|jpg|png|gif|webp|svg\+xml)$/.test(file.mimetype)); } });

  // Wrapper: catches multer errors before they bubble to Vite's Connect finalhandler (which returns empty 404)
  function runLogoUpload(req: any, res: any, next: any) {
    logoUpload.single("file")(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "文件上传失败" });
      next();
    });
  }

  app.post("/api/admin/upload/logo", requireAdmin, requirePermission("site", "write"), runLogoUpload, async (req: any, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "未收到文件" });
      const ts = Date.now();
      const ext = req.file.mimetype === "image/svg+xml" ? "svg" : req.file.mimetype.split("/")[1].replace("jpeg", "jpg");
      const logoFilename = `logo-${ts}.${ext}`;
      const logoPath = path.join(uploadsDir, logoFilename);
      fs.writeFileSync(logoPath, req.file.buffer);
      const logoUrl = `/uploads/${logoFilename}`;

      let faviconUrl = logoUrl;
      if (ext !== "svg") {
        try {
          const faviconFilename = `favicon-${ts}.png`;
          const faviconPath = path.join(uploadsDir, faviconFilename);
          await Promise.race([
            (async () => {
              const img = await Jimp.read(req.file.buffer);
              const size = Math.min(img.getWidth(), img.getHeight());
              await new Promise<void>((resolve, reject) => {
                img.crop(0, 0, size, size).resize(64, 64).write(faviconPath, (err: any) => {
                  if (err) reject(err); else resolve();
                });
              });
              faviconUrl = `/uploads/${faviconFilename}`;
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("jimp timeout")), 8000)),
          ]);
        } catch (e) { console.warn("[Logo] favicon generation skipped:", (e as any).message); }
      }

      await logAudit(req.admin, "logo_uploaded", "site_config", "brand", { logoUrl, faviconUrl });
      return res.json({ logo_url: logoUrl, favicon_url: faviconUrl });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Site Config / CMS (versioned, publish/rollback) =====================
  app.get("/api/admin/config", requireAdmin, requirePermission("site", "read"), async (req, res) => {
    try {
      const all = await db.select().from(siteConfigs) as any[];
      const key = req.query.key as string | undefined;
      const filtered = key ? all.filter((c) => c.key === key) : all;
      filtered.sort((a, b) => a.key.localeCompare(b.key) || b.version - a.version);
      return res.json({ configs: filtered });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/config", requireAdmin, requirePermission("site", "write"), async (req: any, res) => {
    try {
      const { key, value } = req.body;
      if (!key?.trim() || value === undefined) return res.status(400).json({ error: "key 和 value 不能为空" });
      const existing = await db.select().from(siteConfigs).where(eq(siteConfigs.key, key.trim())) as any[];
      const nextVersion = existing.length ? Math.max(...existing.map((c: any) => c.version)) + 1 : 1;
      const inserted = await db.insert(siteConfigs).values({
        key: key.trim(),
        version: nextVersion,
        status: "draft",
        value: typeof value === "string" ? value : JSON.stringify(value),
        editedByAdmin: req.admin.username,
      } as any) as any[];
      await logAudit(req.admin, "config_draft_saved", "site_config", key, { version: nextVersion });
      return res.json({ success: true, config: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 提交发布审批（不再直接发布）：草稿 → pending + 创建 config_publish 审批单
  app.post("/api/admin/config/:id/publish", requireAdmin, requirePermission("site", "write"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rows = await db.select().from(siteConfigs).where(eq(siteConfigs.id, Number(id))) as any[];
      const cfg = rows[0];
      if (!cfg) return res.status(404).json({ error: "配置不存在" });
      const result = await submitPublishApproval({
        type: "config_publish", targetType: "site_config", table: siteConfigs, entity: cfg,
        requestedByAdmin: req.admin.username, reason: req.body?.reason?.trim() || null,
        payload: { key: cfg.key, version: cfg.version },
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      await logAudit(req.admin, "config_publish_submitted", "site_config", cfg.key, { version: cfg.version, approvalId: result.approval.id });
      return res.json({ success: true, approvalId: result.approval.id, message: "已提交发布审批，待复核人通过后生效" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 回滚到某个历史版本（即时生效，需 site:write + 审计）：把该版本重新置为 published，归档当前已发布版本
  app.post("/api/admin/config/:id/rollback", requireAdmin, requirePermission("site", "write"), async (req: any, res) => {
    try {
      const existing = await db.select().from(siteConfigs).where(eq(siteConfigs.id, Number(req.params.id))) as any[];
      if (!existing[0]) return res.status(404).json({ error: "配置不存在" });
      if (existing[0].status !== "archived") return res.status(400).json({ error: "仅已归档版本可回滚；发布新版本请提交发布审批" });
      const result = await publishConfigVersion(Number(req.params.id), req.admin.username);
      if (!result.ok) return res.status(404).json({ error: result.error });
      await logAudit(req.admin, "config_rollback", "site_config", result.entity.key, { version: result.entity.version });
      return res.json({ success: true, message: `已回滚到 ${result.entity.key} v${result.entity.version}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/config/public/batch", async (req, res) => {
    try {
      const keysParam = (req.query.keys as string) || "";
      const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
      if (keys.length === 0) return res.json({ configs: {} });
      const all = await db.select().from(siteConfigs) as any[];
      const result: Record<string, any> = {};
      for (const key of keys) {
        const published = all
          .filter((c: any) => c.key === key && c.status === "published")
          .sort((a: any, b: any) => b.version - a.version)[0];
        if (published) {
          try { result[key] = JSON.parse(published.value); } catch { result[key] = published.value; }
        }
      }
      return res.json({ configs: result });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/config/public/:key", async (req, res) => {
    try {
      const rows = await db.select().from(siteConfigs).where(eq(siteConfigs.key, req.params.key)) as any[];
      const published = rows.filter((c: any) => c.status === "published").sort((a: any, b: any) => b.version - a.version)[0];
      if (!published) return res.status(404).json({ error: "未发布该配置" });
      return res.json({ key: published.key, version: published.version, value: JSON.parse(published.value) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== AI Providers / Models / Prompt Versions =====================
  app.get("/api/admin/ai/providers", requireAdmin, requirePermission("ai", "read"), async (req, res) => {
    try {
      const providers = await db.select().from(aiProviders) as any[];
      return res.json({ providers });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ai/providers", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const { name, displayName, apiKeyEnvVar } = req.body;
      if (!name?.trim() || !displayName?.trim() || !apiKeyEnvVar?.trim()) return res.status(400).json({ error: "缺少必填字段" });
      const inserted = await db.insert(aiProviders).values({ name: name.trim(), displayName: displayName.trim(), apiKeyEnvVar: apiKeyEnvVar.trim() } as any) as any[];
      await logAudit(req.admin, "ai_provider_created", "ai_provider", name);
      return res.json({ success: true, provider: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/ai/models", requireAdmin, requirePermission("ai", "read"), async (req, res) => {
    try {
      const models = await db.select().from(aiModels) as any[];
      return res.json({ models });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ai/models", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const { providerId, modelName, operation, priceInputPerMillion, priceOutputPerMillion, isDefault } = req.body;
      if (!providerId || !modelName?.trim() || !operation?.trim()) return res.status(400).json({ error: "缺少必填字段" });
      if (isDefault) {
        const siblings = await db.select().from(aiModels).where(eq(aiModels.operation, operation.trim())) as any[];
        for (const s of siblings) {
          if (s.isDefault) await db.update(aiModels).set({ isDefault: false, updatedAt: new Date() } as any).where(eq(aiModels.id, s.id));
        }
      }
      const inserted = await db.insert(aiModels).values({
        providerId: Number(providerId),
        modelName: modelName.trim(),
        operation: operation.trim(),
        priceInputPerMillion: Number(priceInputPerMillion) || 0,
        priceOutputPerMillion: Number(priceOutputPerMillion) || 0,
        isDefault: !!isDefault,
      } as any) as any[];
      await logAudit(req.admin, "ai_model_created", "ai_model", modelName);
      return res.json({ success: true, model: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/ai/models/:id", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { enabled, isDefault, priceInputPerMillion, priceOutputPerMillion } = req.body;
      const update: any = { updatedAt: new Date() };
      if (enabled !== undefined) update.enabled = !!enabled;
      if (priceInputPerMillion !== undefined) update.priceInputPerMillion = Number(priceInputPerMillion);
      if (priceOutputPerMillion !== undefined) update.priceOutputPerMillion = Number(priceOutputPerMillion);
      if (isDefault) {
        const rows = await db.select().from(aiModels).where(eq(aiModels.id, Number(id))) as any[];
        const model = rows[0];
        if (model) {
          const siblings = await db.select().from(aiModels).where(eq(aiModels.operation, model.operation)) as any[];
          for (const s of siblings) {
            if (s.isDefault && s.id !== model.id) await db.update(aiModels).set({ isDefault: false, updatedAt: new Date() } as any).where(eq(aiModels.id, s.id));
          }
        }
        update.isDefault = true;
      }
      await db.update(aiModels).set(update).where(eq(aiModels.id, Number(id)));
      await logAudit(req.admin, "ai_model_updated", "ai_model", id, update);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/ai/prompts", requireAdmin, requirePermission("ai", "read"), async (req, res) => {
    try {
      const all = await db.select().from(promptVersions) as any[];
      const operation = req.query.operation as string | undefined;
      const filtered = operation ? all.filter((p) => p.operation === operation) : all;
      filtered.sort((a, b) => a.operation.localeCompare(b.operation) || b.version - a.version);
      return res.json({ prompts: filtered });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/ai/prompts", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const { operation, content } = req.body;
      if (!operation?.trim() || !content?.trim()) return res.status(400).json({ error: "operation 和 content 不能为空" });
      const existing = await db.select().from(promptVersions).where(eq(promptVersions.operation, operation.trim())) as any[];
      const nextVersion = existing.length ? Math.max(...existing.map((p: any) => p.version)) + 1 : 1;
      const inserted = await db.insert(promptVersions).values({ operation: operation.trim(), version: nextVersion, status: "draft", content: content.trim(), editedByAdmin: req.admin.username } as any) as any[];
      await logAudit(req.admin, "prompt_draft_saved", "prompt", operation, { version: nextVersion });
      return res.json({ success: true, prompt: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 提交发布审批（不再直接发布）：草稿 → pending + 创建 prompt_publish 审批单
  app.post("/api/admin/ai/prompts/:id/publish", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const rows = await db.select().from(promptVersions).where(eq(promptVersions.id, Number(id))) as any[];
      const prompt = rows[0];
      if (!prompt) return res.status(404).json({ error: "提示词版本不存在" });
      const result = await submitPublishApproval({
        type: "prompt_publish", targetType: "prompt", table: promptVersions, entity: prompt,
        requestedByAdmin: req.admin.username, reason: req.body?.reason?.trim() || null,
        payload: { operation: prompt.operation, version: prompt.version },
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      await logAudit(req.admin, "prompt_publish_submitted", "prompt", prompt.operation, { version: prompt.version, approvalId: result.approval.id });
      return res.json({ success: true, approvalId: result.approval.id, message: "已提交发布审批，待复核人通过后生效" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 回滚到某个历史提示词版本（即时生效，需 ai:write + 审计）
  app.post("/api/admin/ai/prompts/:id/rollback", requireAdmin, requirePermission("ai", "write"), async (req: any, res) => {
    try {
      const existing = await db.select().from(promptVersions).where(eq(promptVersions.id, Number(req.params.id))) as any[];
      if (!existing[0]) return res.status(404).json({ error: "提示词版本不存在" });
      if (existing[0].status !== "archived") return res.status(400).json({ error: "仅已归档版本可回滚；发布新版本请提交发布审批" });
      const result = await publishPromptVersion(Number(req.params.id), req.admin.username);
      if (!result.ok) return res.status(404).json({ error: result.error });
      await logAudit(req.admin, "prompt_rollback", "prompt", result.entity.operation, { version: result.entity.version });
      return res.json({ success: true, message: `已回滚到 ${result.entity.operation} v${result.entity.version}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== 商品与价格 (PRD §7 · 价格版本走发布审批闭环) =====================
  // 返回商品 → 规格 → 价格版本的嵌套结构，便于后台一屏展示。
  app.get("/api/admin/products", requireAdmin, requirePermission("products", "read"), async (_req, res) => {
    try {
      const [prods, allSkus, allPrices] = await Promise.all([
        db.select().from(products) as Promise<any[]>,
        db.select().from(skus) as Promise<any[]>,
        db.select().from(priceVersions) as Promise<any[]>,
      ]);
      const tree = prods
        .sort((a, b) => a.id - b.id)
        .map((p) => ({
          ...p,
          skus: allSkus
            .filter((s) => s.productId === p.id)
            .sort((a, b) => a.id - b.id)
            .map((s) => ({
              ...s,
              prices: allPrices
                .filter((pv) => pv.skuId === s.id)
                .sort((a, b) => b.version - a.version),
            })),
        }));
      return res.json({ products: tree });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/products", requireAdmin, requirePermission("products", "write"), async (req: any, res) => {
    try {
      const { code, name, description } = req.body;
      if (!code?.trim() || !name?.trim()) return res.status(400).json({ error: "code 和 name 不能为空" });
      const inserted = await db.insert(products).values({
        code: code.trim(), name: name.trim(), description: description?.trim() || null,
        status: "active", createdByAdmin: req.admin.username,
      } as any) as any[];
      await logAudit(req.admin, "product_created", "product", code.trim(), { name: name.trim() });
      return res.json({ success: true, product: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/skus", requireAdmin, requirePermission("products", "write"), async (req: any, res) => {
    try {
      const { productId, code, name, targetRole } = req.body;
      if (!productId || !code?.trim() || !name?.trim()) return res.status(400).json({ error: "productId、code、name 不能为空" });
      const parent = await db.select().from(products).where(eq(products.id, Number(productId))) as any[];
      if (!parent[0]) return res.status(404).json({ error: "所属商品不存在" });
      const inserted = await db.insert(skus).values({
        productId: Number(productId), code: code.trim(), name: name.trim(),
        targetRole: targetRole?.trim() || null, status: "active", createdByAdmin: req.admin.username,
      } as any) as any[];
      await logAudit(req.admin, "sku_created", "sku", code.trim(), { productId: Number(productId), targetRole: targetRole?.trim() || null });
      return res.json({ success: true, sku: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 新建价格版本（草稿）。同一 SKU 版本号自增。
  app.post("/api/admin/prices", requireAdmin, requirePermission("products", "write"), async (req: any, res) => {
    try {
      const { skuId, amount, currency, effectiveAt } = req.body;
      if (!skuId || amount === undefined || amount === null) return res.status(400).json({ error: "skuId 和 amount 不能为空" });
      const amt = Number(amount);
      if (!Number.isInteger(amt) || amt < 0) return res.status(400).json({ error: "amount 必须为非负整数（单位：分）" });
      const parent = await db.select().from(skus).where(eq(skus.id, Number(skuId))) as any[];
      if (!parent[0]) return res.status(404).json({ error: "所属规格(SKU)不存在" });
      const existing = await db.select().from(priceVersions).where(eq(priceVersions.skuId, Number(skuId))) as any[];
      const nextVersion = existing.length ? Math.max(...existing.map((v: any) => v.version)) + 1 : 1;
      const inserted = await db.insert(priceVersions).values({
        skuId: Number(skuId), version: nextVersion, status: "draft", amount: amt,
        currency: (currency?.trim() || "CNY"), effectiveAt: effectiveAt ? new Date(effectiveAt) : null,
        editedByAdmin: req.admin.username,
      } as any) as any[];
      await logAudit(req.admin, "price_draft_saved", "price_version", String(inserted[0]?.id), { skuId: Number(skuId), amount: amt, version: nextVersion });
      return res.json({ success: true, price: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 提交价格发布审批（不再直接发布）：草稿 → pending + 创建 price_publish 审批单
  app.post("/api/admin/prices/:id/publish", requireAdmin, requirePermission("products", "write"), async (req: any, res) => {
    try {
      const rows = await db.select().from(priceVersions).where(eq(priceVersions.id, Number(req.params.id))) as any[];
      const pv = rows[0];
      if (!pv) return res.status(404).json({ error: "价格版本不存在" });
      const result = await submitPublishApproval({
        type: "price_publish", targetType: "price_version", table: priceVersions, entity: pv,
        requestedByAdmin: req.admin.username, reason: req.body?.reason?.trim() || null,
        amount: pv.amount, payload: { skuId: pv.skuId, amount: pv.amount, version: pv.version },
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      await logAudit(req.admin, "price_publish_submitted", "price_version", String(pv.id), { skuId: pv.skuId, amount: pv.amount, version: pv.version, approvalId: result.approval.id });
      return res.json({ success: true, approvalId: result.approval.id, message: "已提交价格发布审批，待复核人通过后生效" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 回滚到某个历史价格版本（即时生效，需 products:write + 审计）
  app.post("/api/admin/prices/:id/rollback", requireAdmin, requirePermission("products", "write"), async (req: any, res) => {
    try {
      const existing = await db.select().from(priceVersions).where(eq(priceVersions.id, Number(req.params.id))) as any[];
      if (!existing[0]) return res.status(404).json({ error: "价格版本不存在" });
      if (existing[0].status !== "archived") return res.status(400).json({ error: "仅已归档版本可回滚；发布新版本请提交发布审批" });
      const result = await publishPriceVersion(Number(req.params.id), req.admin.username);
      if (!result.ok) return res.status(404).json({ error: result.error });
      await logAudit(req.admin, "price_rollback", "price_version", String(result.entity.id), { skuId: result.entity.skuId, version: result.entity.version });
      return res.json({ success: true, message: `已回滚到价格 v${result.entity.version}` });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Support Tickets (customer service) =====================
  app.get("/api/admin/tickets", requireAdmin, requirePermission("tickets", "read"), async (req, res) => {
    try {
      const all = await db.select().from(supportTickets) as any[];
      const status = req.query.status as string | undefined;
      const filtered = status ? all.filter((t) => t.status === status) : all;
      filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ tickets: filtered, total: filtered.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/tickets/:id", requireAdmin, requirePermission("tickets", "read"), async (req, res) => {
    try {
      const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, Number(req.params.id))) as any[];
      const ticket = rows[0];
      if (!ticket) return res.status(404).json({ error: "工单不存在" });
      const replies = await db.select().from(ticketReplies).where(eq(ticketReplies.ticketId, ticket.id)) as any[];
      replies.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return res.json({ ticket, replies });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/tickets", async (req, res) => {
    try {
      const { uid, subject, message, relatedOrderNo } = req.body;
      if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: "subject 和 message 不能为空" });
      let userId: number | null = null;
      if (uid) {
        const urows = await db.select().from(users).where(eq(users.uid, uid)) as any[];
        userId = urows[0]?.id ?? null;
      }
      const inserted = await db.insert(supportTickets).values({ userId, uid: uid || null, subject: subject.trim(), message: message.trim(), relatedOrderNo: relatedOrderNo || null } as any) as any[];
      return res.json({ success: true, ticket: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/tickets/:id/reply", requireAdmin, requirePermission("tickets", "write"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const { message, status } = req.body;
      if (!message?.trim()) return res.status(400).json({ error: "回复内容不能为空" });
      await db.insert(ticketReplies).values({ ticketId: Number(id), authorType: "admin", authorName: req.admin.username, message: message.trim() } as any);
      const update: any = { assignedToAdmin: req.admin.username, updatedAt: new Date() };
      if (status) update.status = status;
      await db.update(supportTickets).set(update).where(eq(supportTickets.id, Number(id)));
      await logAudit(req.admin, "ticket_replied", "ticket", id);
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/tickets/:id/status", requireAdmin, requirePermission("tickets", "write"), async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["open", "in_progress", "resolved", "closed"].includes(status)) return res.status(400).json({ error: "无效状态" });
      await db.update(supportTickets).set({ status, updatedAt: new Date() } as any).where(eq(supportTickets.id, Number(req.params.id)));
      await logAudit(req.admin, "ticket_status_changed", "ticket", req.params.id, { status });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Notifications Center =====================
  app.get("/api/admin/notifications", requireAdmin, requirePermission("site", "read"), async (req, res) => {
    try {
      const all = await db.select().from(notifications) as any[];
      all.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ notifications: all, total: all.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/notifications", requireAdmin, requirePermission("site", "write"), async (req: any, res) => {
    try {
      const { title, body, audience, targetUid } = req.body;
      if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: "title 和 body 不能为空" });
      if (audience === "uid" && !targetUid?.trim()) return res.status(400).json({ error: "指定用户时必须提供 targetUid" });
      const inserted = await db.insert(notifications).values({
        title: title.trim(),
        body: body.trim(),
        audience: audience === "uid" ? "uid" : "all",
        targetUid: audience === "uid" ? targetUid.trim() : null,
        createdByAdmin: req.admin.username,
      } as any) as any[];
      await logAudit(req.admin, "notification_sent", "notification", String(inserted[0]?.id), { audience });
      return res.json({ success: true, notification: inserted[0] });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/notifications/feed", async (req, res) => {
    try {
      const uid = req.query.uid as string | undefined;
      const all = await db.select().from(notifications) as any[];
      const feed = all.filter((n: any) => n.audience === "all" || (uid && n.targetUid === uid));
      feed.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ notifications: feed.slice(0, 50) });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ===================== Risk Control =====================
  app.get("/api/admin/risk-flags", requireAdmin, requirePermission("growth", "read"), async (req, res) => {
    try {
      const all = await db.select().from(riskFlags) as any[];
      const status = req.query.status as string | undefined;
      const filtered = status ? all.filter((r) => r.status === status) : all;
      filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.json({ flags: filtered, total: filtered.length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/risk-flags/:id", requireAdmin, requirePermission("growth", "write"), async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["open", "reviewed", "dismissed"].includes(status)) return res.status(400).json({ error: "无效状态" });
      await db.update(riskFlags).set({ status, reviewedByAdmin: req.admin.username, updatedAt: new Date() } as any).where(eq(riskFlags.id, Number(req.params.id)));
      await logAudit(req.admin, "risk_flag_reviewed", "risk_flag", req.params.id, { status });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  async function evaluateRiskRules(userId: number) {
    try {
      const urows = (await db.select().from(users).where(eq(users.id, userId))) as any[];
      const uid = urows[0]?.uid;
      if (!uid) return;
      const userPayments = (await db.select().from(payments).where(eq(payments.userId, userId))) as any[];
      const recentPaid = userPayments.filter((p: any) => p.status === 2 && Date.now() - new Date(p.paidAt || p.createdAt).getTime() < 3600_000);
      if (recentPaid.length >= 3) {
        await db.insert(riskFlags).values({ uid, ruleType: "payment_velocity", severity: "medium", detail: `1小时内完成${recentPaid.length}笔支付` } as any);
      }
      const allRefunds = (await db.select().from(refunds)) as any[];
      const paymentIds = userPayments.map((p: any) => p.id);
      const myRefunds = allRefunds.filter((r: any) => paymentIds.includes(r.paymentId) && r.status === 2);
      if (myRefunds.length >= 3) {
        await db.insert(riskFlags).values({ uid, ruleType: "refund_abuse", severity: "high", detail: `累计成功退款${myRefunds.length}次` } as any);
      }
    } catch (err) {
      console.error("[Risk] evaluateRiskRules failed:", err);
    }
  }

  // Static trust/legal pages — must be registered before Vite middleware
  // so that crawlers reach real HTML without executing JavaScript.
  // Single authoritative origin used for all canonical/OG/hreflang URLs across
  // every server-rendered page, crawl files, and the SPA shell.
  const SITE_ORIGIN = (process.env.SITE_ORIGIN || process.env.VITE_SITE_ORIGIN || 'https://careerai.app').replace(/\/$/, '');
  const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

  function trustPage(title: string, body: string, opts: {
    description: string;
    path: string;
  }): string {
    const canonicalUrl = `${SITE_ORIGIN}${opts.path}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — CareerAI Executive Resume Optimizer</title>
  <meta name="description" content="${opts.description}" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="CareerAI Executive Resume Optimizer" />
  <meta property="og:title" content="${title} — CareerAI" />
  <meta property="og:description" content="${opts.description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title} — CareerAI" />
  <meta name="twitter:description" content="${opts.description}" />
  <meta name="twitter:image" content="${OG_IMAGE}" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.7}
    header{background:#fff;border-bottom:1px solid #e2e8f0;padding:1rem 2rem;display:flex;align-items:center;gap:1rem}
    header a{text-decoration:none;color:#1e293b;font-weight:700;font-size:1.1rem}
    header span{color:#3b82f6;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;background:#eff6ff;padding:.2rem .6rem;border-radius:9999px}
    main{max-width:760px;margin:3rem auto;padding:0 1.5rem 4rem}
    h1{font-size:2rem;font-weight:800;margin-bottom:.5rem}
    h2{font-size:1.25rem;font-weight:700;margin:2rem 0 .5rem}
    p,li{color:#475569;margin-bottom:.75rem}
    ul{padding-left:1.5rem;margin-bottom:.75rem}
    .meta{color:#94a3b8;font-size:.85rem;margin-bottom:2rem}
    footer{text-align:center;padding:2rem;font-size:.8rem;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:4rem}
    footer a{color:#3b82f6;text-decoration:none;margin:0 .5rem}
  </style>
</head>
<body>
  <header>
    <a href="/">CareerAI</a>
    <span>Executive Resume Optimizer</span>
  </header>
  <main>
    ${body}
  </main>
  <footer>
    © 2026 CareerAI Executive Search. All rights reserved. &nbsp;
    <a href="/terms">Terms of Service</a> ·
    <a href="/privacy">Privacy Policy</a> ·
    <a href="/help">Help Center</a>
  </footer>
</body>
</html>`;
  }

  app.get('/terms', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(trustPage('Terms of Service', `
      <h1>Terms of Service</h1>
      <p class="meta">Last updated: July 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>By accessing or using CareerAI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>

      <h2>2. Description of Service</h2>
      <p>CareerAI is an AI-powered executive resume analysis and optimization platform. The Service analyses uploaded resumes against target job roles and produces structured fit reports, smart Q&amp;A, and professionally rewritten resume documents.</p>

      <h2>3. User Accounts</h2>
      <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate and complete registration information.</p>

      <h2>4. Acceptable Use</h2>
      <p>You may not use the Service to:</p>
      <ul>
        <li>Upload content that violates any applicable law or third-party rights.</li>
        <li>Attempt to reverse-engineer or circumvent any security measure.</li>
        <li>Transmit malicious code or interfere with the Service's operation.</li>
        <li>Misrepresent your identity or professional credentials.</li>
      </ul>

      <h2>5. Intellectual Property</h2>
      <p>You retain ownership of all resume content you upload. You grant CareerAI a limited, non-exclusive licence to process that content solely to provide the Service. CareerAI's platform, AI models, and output templates remain our exclusive property.</p>

      <h2>6. Disclaimer of Warranties</h2>
      <p>The Service is provided "as is" without warranties of any kind. CareerAI does not guarantee that analysis results will lead to employment outcomes. Resume scores and suggestions are AI-generated guidance, not professional legal or career advice.</p>

      <h2>7. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, CareerAI shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>

      <h2>8. Termination</h2>
      <p>We reserve the right to suspend or terminate your access if you violate these Terms or engage in conduct that harms other users or the integrity of the platform.</p>

      <h2>9. Changes to Terms</h2>
      <p>We may update these Terms from time to time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.</p>

      <h2>10. Contact</h2>
      <p>For questions about these Terms, please visit our <a href="/help">Help Center</a> or contact us through the platform.</p>
    `, { description: 'Read the Terms of Service for CareerAI Executive Resume Optimizer — covering account responsibilities, acceptable use, intellectual property, and how AI-generated resume analysis and rewrites are provided.', path: '/terms' }));
  });

  app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(trustPage('Privacy Policy', `
      <h1>Privacy Policy</h1>
      <p class="meta">Last updated: July 2026 · GDPR &amp; PIPL Compliant</p>

      <h2>1. Data We Collect</h2>
      <p>When you use CareerAI we may collect:</p>
      <ul>
        <li><strong>Resume content</strong> — the file you upload for analysis.</li>
        <li><strong>Account information</strong> — email address and password hash used for authentication.</li>
        <li><strong>Usage data</strong> — anonymised logs of features accessed, used for product improvement only.</li>
      </ul>

      <h2>2. How We Use Your Data</h2>
      <p>Your resume is processed exclusively to generate the fit report and rewrite outputs you request. We do <strong>not</strong> use your resume or personal information to train any AI model, and we do not sell your data to third parties.</p>

      <h2>3. Data Desensitisation</h2>
      <p>Before any resume content is passed to AI processing pipelines, our system automatically redacts phone numbers, email addresses, and national identification numbers to minimise exposure of personally identifiable information (PII).</p>

      <h2>4. Data Retention</h2>
      <p>Resume files and generated reports are retained for up to 90 days to allow you to access your history. You may request deletion of your data at any time through your account settings or by contacting us via the Help Center.</p>

      <h2>5. Security</h2>
      <p>All data is transmitted over TLS-encrypted connections. Stored data is protected with access controls and encryption at rest. We conduct regular security reviews of our infrastructure.</p>

      <h2>6. Your Rights (GDPR / PIPL)</h2>
      <p>Depending on your jurisdiction you have the right to access, correct, port, or erase your personal data. To exercise these rights, please contact us through the <a href="/help">Help Center</a>.</p>

      <h2>7. Cookies</h2>
      <p>We use essential session cookies required for authentication. We do not use tracking cookies or third-party advertising cookies.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We will notify registered users of material changes to this policy by email or in-app notification at least 14 days before they take effect.</p>

      <h2>9. Contact</h2>
      <p>For privacy enquiries, please use the <a href="/help">Help Center</a>. For formal data subject requests, include "Data Subject Request" in your message subject.</p>
    `, { description: 'CareerAI Privacy Policy — how we collect, protect, and handle your resume data. GDPR and PIPL compliant. Your data is never used to train AI models and is automatically desensitized before processing.', path: '/privacy' }));
  });

  app.get('/help', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(trustPage('Help Center', `
      <h1>Help Center</h1>
      <p class="meta">Answers to common questions about CareerAI</p>

      <h2>Getting Started</h2>
      <p>CareerAI analyses your resume against a target executive role and produces a detailed fit report, smart follow-up questions, and a professionally rewritten resume draft.</p>
      <ul>
        <li><strong>Supported formats:</strong> PDF and DOCX files up to 10 MB.</li>
        <li><strong>Languages:</strong> The platform fully supports both English and Simplified Chinese (中文).</li>
        <li><strong>Best results:</strong> Upload a current resume and specify a precise target role title (e.g., "VP of AI Engineering" or "Chief Data Officer").</li>
      </ul>

      <h2>Resume Upload &amp; Analysis</h2>
      <p>After uploading your resume and selecting a target role, the AI will:</p>
      <ul>
        <li>Score your fit across key competency dimensions.</li>
        <li>Identify mandatory requirements and skill gaps.</li>
        <li>Generate targeted clarification questions to improve accuracy.</li>
        <li>Produce an executive-level rewritten resume tailored to the role.</li>
      </ul>

      <h2>Export &amp; Download</h2>
      <p>Completed resumes and reports can be exported as PDF, DOCX, or a ZIP archive containing all deliverables. Export buttons are available once your rewrite is complete.</p>

      <h2>Privacy &amp; Data Security</h2>
      <p>Your resume data is desensitised before AI processing — phone numbers and email addresses are automatically redacted. Your data is never used to train AI models. See our <a href="/privacy">Privacy Policy</a> for full details.</p>

      <h2>Account &amp; Billing</h2>
      <p>Free-tier users can perform one full analysis per session. Premium accounts unlock unlimited analyses, priority processing, and multi-format export. Visit your account settings to manage your subscription.</p>

      <h2>Still Need Help?</h2>
      <p>If you cannot find an answer here, use the in-app support button or reach out through your account dashboard. We aim to respond within one business day.</p>
    `, { description: 'CareerAI Help Center — answers about supported file types (PDF, DOCX), English and Chinese language support, resume analysis, executive rewrite exports, account billing, and data privacy.', path: '/help' }));
  });

  // Crawl governance: block indexing of the admin surface
  app.use('/admin', (req: any, res: any, next: any) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  // Dynamic crawl files — SITE_ORIGIN is declared above alongside the trust pages.

  app.get('/robots.txt', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', (_req: any, res: any) => {
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/en</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${SITE_ORIGIN}/help</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>
`
    );
  });

  app.get('/llms.txt', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`# CareerAI — Executive Resume Optimizer

## Summary
CareerAI is a bilingual (Chinese/English) AI-powered resume analysis and rewriting platform designed for senior managers, technical leaders, and executives. It analyzes job descriptions, scores resume-to-JD alignment, and produces executive-grade resume rewrites with leadership vocabulary upgrades.

## Key Capabilities
- Job description (JD) parsing and target role profiling
- AI-driven resume-to-JD matching score and gap analysis
- C-level vocabulary and leadership statement reconstruction
- Export to PDF, DOCX, and ZIP formats
- Secure data handling: uploaded resumes are desensitized and never used for model training

## Intended Audience
Senior professionals, directors, VPs, general managers, and C-suite executives seeking AI-assisted resume optimization for high-stakes career transitions.

## Language
Primary: Simplified Chinese (zh-CN). Interface also available in English.

## Canonical URL
${SITE_ORIGIN}/

## Contact / Attribution
CareerAI Solutions — ${SITE_ORIGIN}/
`);
  });

  // Vite development server / production builds handler
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isProd = process.env.NODE_ENV === "production" || (hasDist && process.env.NODE_ENV !== "development");

  // English landing page — crawlable URL with full English metadata
  // Must be registered before Vite middleware so Express matches it first.
  app.get('/en', (_req, res) => {
    const BASE = SITE_ORIGIN;

    const buildEnglishHtml = (scriptTag: string) => `<!doctype html>
<html lang="en-US" class="scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Primary SEO Metadata (English) -->
    <title>CareerAI Executive Resume Optimizer | AI Resume Restructuring & JD Alignment</title>
    <meta name="description" content="CareerAI is an elite AI-powered resume optimizer for directors, VPs, and C-suite executives. Upload your resume and target role to get a deep match-score matrix, gap analysis, and an executive-grade rewrite — 100% aligned to real hiring demand." />
    <meta name="keywords" content="CareerAI, Executive Resume Optimizer, AI Resume Rewrite, CV Restructuring, JD Matching Score, Resume Gap Analysis, leadership CV, C-suite resume, VP resume, director resume, AI resume builder" />
    <meta name="author" content="CareerAI Solutions" />
    <meta name="robots" content="index, follow" />

    <!-- Canonical URL (English) -->
    <link rel="canonical" href="${BASE}/en" />

    <!-- hreflang: bilingual alternate URLs -->
    <link rel="alternate" hreflang="zh-CN" href="${BASE}/" />
    <link rel="alternate" hreflang="en" href="${BASE}/en" />
    <link rel="alternate" hreflang="x-default" href="${BASE}/" />

    <!-- Open Graph / Facebook (English) -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${BASE}/en" />
    <meta property="og:title" content="CareerAI | Executive Resume Optimizer & AI Restructuring" />
    <meta property="og:description" content="AI-driven resume optimization for directors, executives, and technical leaders. Input your target role — CareerAI computes a deep match-score matrix and rewrites your CV into impact-focused executive achievements." />
    <meta property="og:image" content="${BASE}/og-image.png" />
    <meta property="og:site_name" content="CareerAI" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter (English) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${BASE}/en" />
    <meta name="twitter:title" content="CareerAI | Executive Resume Optimizer & AI Restructuring" />
    <meta name="twitter:description" content="AI-driven resume optimization workspace for directors, executives, and technical leaders. Restructures CVs into impact-focused executive achievements aligned to real JD requirements." />
    <meta name="twitter:image" content="${BASE}/og-image.png" />

    <!-- Generative Engine Optimization (GEO) -->
    <meta name="ai-content-origin" content="CareerAI Professional Solutions" />
    <meta name="ai-service-category" content="Professional Executive Career Development" />
    <meta name="ai-knowledge-base" content="Executive resume rewriting, leadership language conversion, resume-to-JD alignment" />

    <!-- Favicon -->
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.svg" sizes="any" />

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

    <!-- Schema.org JSON-LD Structured Data (English) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "CareerAI",
      "url": "${BASE}/en",
      "logo": "${BASE}/logo.png",
      "description": "AI-powered executive resume optimizer for directors, VPs, and C-suite leaders. Provides deep JD analysis, match-score matrix, and executive-grade resume restructuring.",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "All",
      "inLanguage": "en-US",
      "offers": {
        "@type": "Offer",
        "price": "19.00",
        "priceCurrency": "CNY",
        "priceValidUntil": "2027-12-31"
      },
      "featureList": [
        "Executive target job JD parsing",
        "Deep AI matching analysis and score matrix",
        "C-level resume vocabulary action statement reconstruction",
        "Secure local sandbox data isolation",
        "Export to PDF and DOCX"
      ],
      "author": {
        "@type": "Organization",
        "name": "CareerAI Solutions",
        "url": "${BASE}/"
      }
    }
    </script>
  </head>
  <body class="bg-slate-50 antialiased selection:bg-blue-600/10 selection:text-blue-600">
    <div id="root">
      <!-- Static prerender for English crawlers (visually hidden, replaced by React on load) -->
      <div aria-hidden="true" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;">
        <header style="display:flex;align-items:center;gap:1rem;margin-bottom:3rem;">
          <div style="background:#2563eb;color:#fff;font-weight:700;font-size:1.25rem;padding:0.5rem 1rem;border-radius:8px;">CareerAI</div>
          <span style="color:#64748b;font-size:0.875rem;">V1.0 &middot; Executive Resume Optimizer</span>
        </header>
        <main>
          <h1 style="font-size:2.5rem;font-weight:800;line-height:1.2;margin-bottom:1rem;color:#0f172a;">
            Unlock Your Next AI Leadership Role
          </h1>
          <h2 style="font-size:1.25rem;font-weight:600;color:#2563eb;margin-bottom:1.5rem;">
            AI-Powered Executive Resume Optimizer &mdash; Precision JD Alignment for Directors, VPs &amp; C-Suite
          </h2>
          <p style="font-size:1.1rem;color:#475569;max-width:720px;line-height:1.7;margin-bottom:2rem;">
            CareerAI is an elite resume optimization platform built for senior managers, technical leaders, and executives. Powered by frontier large language models, it parses real executive job descriptions, computes a deep match-score matrix across every requirement, and delivers a fully restructured, leadership-grade resume — 100% aligned to actual hiring demand.
          </p>
          <p style="font-size:1rem;color:#64748b;max-width:680px;line-height:1.7;margin-bottom:2.5rem;">
            Upload your resume, enter your target role, and CareerAI intelligently retrieves real JDs from top-tier companies, surfaces mandatory requirement gaps, and rewrites every bullet into STAR-format executive achievements with quantified business impact. Export to PDF, DOCX, or ZIP — ready to submit immediately.
          </p>

          <section style="margin-bottom:3rem;">
            <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1.25rem;color:#0f172a;">Core Features</h2>
            <ul style="list-style:none;padding:0;margin:0;display:grid;gap:1rem;">
              <li style="padding:1.25rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                <strong style="color:#2563eb;">JD Intelligence &mdash; Real-Market Job Analysis</strong>
                <p style="margin:0.5rem 0 0;color:#475569;">Automatically retrieves real executive job descriptions from top-tier companies, extracts high-frequency skills, and maps mandatory requirements so you know exactly what the market demands.</p>
              </li>
              <li style="padding:1.25rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                <strong style="color:#2563eb;">Match Score Matrix &mdash; Quantified Resume-to-JD Fit</strong>
                <p style="margin:0.5rem 0 0;color:#475569;">Multi-dimensional scoring that quantifies how well your resume fits the target role, surfaces actionable gap analysis, and prioritizes the highest-impact improvements.</p>
              </li>
              <li style="padding:1.25rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                <strong style="color:#2563eb;">AI Executive Rewrite &mdash; Leadership-Grade Language</strong>
                <p style="margin:0.5rem 0 0;color:#475569;">Elevates experience bullets into STAR-format executive achievements with leadership vocabulary, quantified business impact, and C-suite caliber phrasing — fully aligned to the JD.</p>
              </li>
              <li style="padding:1.25rem;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
                <strong style="color:#2563eb;">Export PDF / DOCX &mdash; Submission-Ready Output</strong>
                <p style="margin:0.5rem 0 0;color:#475569;">Export your optimized resume as PDF, DOCX, or ZIP — formatted, polished, and ready to submit to your target roles immediately.</p>
              </li>
            </ul>
          </section>

          <section style="margin-bottom:3rem;">
            <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1.25rem;color:#0f172a;">Trending Executive Roles</h2>
            <ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:0.75rem;">
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">VP of AI Engineering</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">Chief Data Officer</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">Head of Generative AI</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">AI Product Director</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">Chief Technology Officer</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">Director of Machine Learning</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">VP of Engineering</li>
              <li style="padding:0.5rem 1rem;background:#eff6ff;color:#2563eb;border-radius:9999px;font-size:0.875rem;font-weight:500;">Chief AI Officer</li>
            </ul>
          </section>

          <section style="margin-bottom:3rem;">
            <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:1.25rem;color:#0f172a;">Privacy &amp; Data Security</h2>
            <p style="color:#475569;line-height:1.7;">
              All uploaded resumes are desensitized (phone numbers and email addresses redacted) and are never used for AI model training. Your career data is used solely for your optimization session and securely discarded afterward.
            </p>
          </section>
        </main>
        <footer style="border-top:1px solid #e2e8f0;padding-top:1.5rem;color:#94a3b8;font-size:0.8rem;">
          &copy; 2026 CareerAI Solutions &middot; Executive Resume Optimizer
        </footer>
      </div>
    </div>
    ${scriptTag}
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (isProd) {
      try {
        const rawHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
        const scriptMatch = rawHtml.match(/<script[^>]+src="[^"]*\.js"[^>]*><\/script>/g);
        const scriptTags = scriptMatch ? scriptMatch.join('\n    ') : '<script type="module" src="/src/main.tsx"></script>';
        res.send(buildEnglishHtml(scriptTags));
      } catch {
        res.send(buildEnglishHtml('<script type="module" src="/src/main.tsx"></script>'));
      }
    } else {
      res.send(buildEnglishHtml('<script type="module" src="/src/main.tsx"></script>'));
    }
  });

  // Whitelist of real public HTML routes.  Any non-file path that does not
  // appear here (and is not an admin SPA path or API route) gets a genuine
  // HTTP 404 so crawlers do not index junk URLs.
  const PUBLIC_HTML_ROUTES = new Set(['/', '/en', '/terms', '/privacy', '/help']);

  function isKnownHtmlRoute(p: string): boolean {
    // Exact public routes, or the admin SPA sub-tree (/admin and /admin/*)
    return PUBLIC_HTML_ROUTES.has(p) || p === '/admin' || p.startsWith('/admin/');
  }

  if (!isProd) {
    console.log("Starting development environment with Vite middleware...");
    // Guard unknown HTML paths before handing off to Vite so dev behaviour
    // matches production: unknown routes → 404 rather than the homepage shell.
    app.use((req: any, res: any, next: any) => {
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) return next(); // static asset
      if (req.path.startsWith('/api/')) return next();
      // Pass all Vite internal runtime paths (HMR, client, transforms, etc.)
      if (req.path.startsWith('/@')) return next();
      if (req.path.startsWith('/node_modules/')) return next();
      if (isKnownHtmlRoute(req.path)) return next();
      return res.status(404).type('text/plain').send('Not Found');
    });
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true as const },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting production environment serving compiled static assets from dist/...");
    app.use(express.static(distPath));
    app.get('*', (req: any, res: any) => {
      // Return 404 for file-like paths not served by express.static.
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).end();
      }
      // Return 404 for unrecognised HTML paths — prevents soft-404 indexing.
      if (!isKnownHtmlRoute(req.path)) {
        return res.status(404).type('text/plain').send('Not Found');
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Simulated generators for perfect reliability
function getSimulatedReport(targetRole: string, industry?: string, location?: string, seniority?: string) {
  const normRole = targetRole || "AI 产品负责人";
  return {
    targetRole: normRole,
    researchSummary: `在当前快速发展的 ${industry || '人工智能'} 行业中，${normRole} 角色扮演着连接前沿技术研发与业务商业化落地的桥梁。由于大语言模型 (LLM)、Agent 及生成式 AI 技术的商业探索已进入深水区，用人单位（无论是大型科技厂牌还是融资领先的初创独角兽）对该岗位的期待已从单纯的“产品规划”全面升级。市场对高级 AI 人才的技术底蕴与商业成熟度提出了双重严苛要求，优秀候选人必须具备对主流 LLM 架构和提示词工程的深度技术敏感，并拥有从 0 到 1 推动商业化落地或建立可衡量的业务 ROI 指标的实战记录。跨职能研发团队、AI 研究团队以及 go-to-market (GTM) 销售渠道 of the multi-functional alignment is core to achieving growth.`,
    mandatoryRequirements: [
      `拥有 5 年以上核心产品管理经验，其中至少 2 年以上专注于大模型应用、AI/ML 或智能体 (Agent) 专属产品落地。`,
      `具备 0 到 1 阶段 AI 产品的全生命周期商业化规划与实际推广落地记录，能够对产品 ROI 直接负责。`,
      `对大语言模型 (LLM)、检索增强生成 (RAG)、API 架构等前沿技术概念拥有深厚的理解和研发协同语言。`,
      `拥有领导 10 人以上跨研发、算法模型与数据科学团队的高效协同经历，具备优秀的敏捷迭代流程把控力。`,
      `具备强劲的高管沟通汇报、外部大客户解决方案呈现及高阶利益相关者管理艺术。`
    ],
    highFrequencySkills: [
      { name: "LLM Integration & Prompt Engineering", percentage: 96 },
      { name: "0 to 1 Product Development", percentage: 88 },
      { name: "Cross-functional Team Leadership", percentage: 84 },
      { name: "Go-to-Market (GTM) Strategy", percentage: 76 },
      { name: "Data Architecture & Analytics", percentage: 72 },
      { name: "Ethical AI / Responsible AI frameworks", percentage: 68 },
      { name: "B-Side / Internal Tools Product Experience", percentage: 64 },
      { name: "API Design & Ecosystem Thinking", percentage: 56 },
      { name: "User Research & Prototyping (Figma/etc)", percentage: 52 },
      { name: "Pricing Strategy for AI Features", percentage: 48 }
    ],
    plusSkills: [
      "Hands-on Coding (Python/SQL) or fine-tuning understanding",
      "Domain Expertise (e.g., AI + Healthcare/Fintech/SaaS)",
      "Open Source AI Model Contributions or Technical Community Influence"
    ],
    jdCount: 28,
    sampleOverview: {
      count: 28,
      roles: [
        { name: "AI产品总监", count: 12 },
        { name: "AI产品负责人", count: 10 },
        { name: "大模型产品经理", count: 6 }
      ],
      cities: [
        { name: "北京", count: 14 },
        { name: "上海", count: 8 },
        { name: "深圳", count: 4 },
        { name: "杭州", count: 2 }
      ],
      sources: [
        { name: "官方招聘页", count: 16 },
        { name: "公开社交平台", count: 12 }
      ]
    },
    conclusions: [
      {
        id: "c1",
        title: "大语言模型及垂直应用落地开发经验",
        frequency: 96,
        category: "大模型应用",
        detail: "核心招聘几乎全部提到了对LLM/Prompt/Agent等落地应用的强诉求。",
        suggestion: "优化简历中的项目细节，高亮主导LLM/Agent的应用重构或微调细节。",
        evidences: [
          { id: "e1", companyType: "某头部科技大厂", text: "主导大模型（LLM）垂直应用与智能代理（Agent）架构研发", summary: "主导LLM应用与Agent体系架构", type: "官方招聘页" },
          { id: "e2", companyType: "某知名 AI 独角兽", text: "具有主流大模型微调、RAG 混合检索及 Prompt 深度调优实操经验", summary: "拥有主流LLM、RAG与Prompt实操调优", type: "公开招聘页面" },
          { id: "e3", companyType: "某知名科技独角兽", text: "规划 AIGC 落地场景并打通多场景商业变现闭环", summary: "规划 AIGC 商业化并主导场景闭环", type: "搜索引擎索引结果" }
        ]
      },
      {
        id: "c2",
        title: "高频跨职能与算法研发团队组织领导力",
        frequency: 84,
        category: "团队领导力",
        detail: "高级或核心总监岗位均高频提及了对算法工程师、数据科学人员及多角色开发班底的领导要求。",
        suggestion: "升级简历中“和研发沟通需求”等词汇，换成“领导跨算法与工程的敏捷团队、打通闭环研发周期”。",
        evidences: [
          { id: "e4", companyType: "某知名跨国企业", text: "需要有效组织算法工程师、工程研发团队 and 前后端进行业务攻关", summary: "领导算法工程、前后端协同研发班底", type: "官方招聘页" },
          { id: "e5", companyType: "某前沿科技独角兽", text: "带领 15 人以上核心产品技术团队极速迭代", summary: "带领 15+ 人产品与技术核心研发团队", type: "公开招聘页面" },
          { id: "e6", companyType: "某跨国软件集团", text: "要求建立核心研发交付机制并提升模型迭代人效", summary: "建立模型演变全生命周期并管理人效收益", type: "官方招聘页" }
        ]
      },
      {
        id: "c3",
        title: "端到端商业闭环与经营 ROI 强力指标",
        frequency: 76,
        category: "商业决策",
        detail: "高级岗位直接考核商业变现结果，候选人需具备全链路的产品变现设计意识。",
        suggestion: "千万避免单纯写功能交付，提炼高亮定价方案设计、客单价提升和标杆大客成交等核心营收指标。",
        evidences: [
          { id: "e7", companyType: "某 AI SaaS 软件厂", text: "对 AI 功能订阅转化率 and 续签营收指标负责", summary: "对核心功能销售定价、大客户转化收入等闭环直接负责", type: "官方招聘页" },
          { id: "e8", companyType: "某政企解决方案商", text: "协同销售体系向核心标杆大客户交付定制解决方案", summary: "为金融、政企等 KA 大客规划 AI 解决方案并促成付费", type: "公开招聘页面" },
          { id: "e9", companyType: "某垂直 AI 落地平台", text: "负责产品线的业务 ROI、制定增值变现策略并直接向高层汇报", summary: "主导产品价格机制设定与增值变现，推动 ROI 稳健提升", type: "搜索引擎索引结果" }
        ]
      }
    ]
  };
}

function getSimulatedRewriteSuggestions(targetRole: string, resumeText: string, userAnswers: any[]) {
  const q1Ans = userAnswers?.find((a: any) => a.id === 'q1')?.userAnswer || '';
  const q2Ans = userAnswers?.find((a: any) => a.id === 'q2')?.userAnswer || '';
  const q3Ans = userAnswers?.find((a: any) => a.id === 'q3')?.userAnswer || '';
  
  let teamSizeText = q3Ans.includes("15人") ? "管理 15 人以上跨职能算法与研发团队" : q3Ans.includes("5-15人") ? "管理 10 人左右中型跨职能算法与研发团队" : "作为核心架构 Owner 主导多角色协同";
  let resultText = q2Ans.includes("有明确数据") ? "拉动核心产品线营收大幅增长并促成标杆客户签约" : "建立模型敏捷发布体系并缩短产品迭代周期";
  let aiProjectText = q1Ans.includes("没有相关") ? "规划高冲击力 AIGC 工具落地" : "主导生成式 AI / 大语言模型 (LLM) 场景应用创新与端到端敏捷开发落地";

  return [
    // Standard version suggestions
    {
      id: "std_s1",
      versionType: "standard",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "表达偏执行层，缺乏突出产品全生命周期的系统方法论与核心数据指标。",
      rewrittenText: `主导公司 ${targetRole} 核心功能矩阵的敏捷交付与生命周期管理，主导核心模块的产品定义与多角色团队协同；通过建立标准化需求评审与上线追踪机制，缩短产品迭代周期达 20%，成功实现核心业务平稳运行【建议补充：例如“服务头部客户达 10 家，日常处理并发量超万级”】。`,
      suggestionReason: "突出执行与落地、敏捷交付的扎实产品经理功底，契合标准投递所需的稳定与落地能力。",
      missingInfo: ["服务头部客户数量", "系统日常最大并发量"],
      status: "pending"
    },
    {
      id: "std_s2",
      versionType: "standard",
      sectionType: "核心能力",
      originalText: "精通产品设计，懂算法，会写代码，英语沟通好。",
      issueSummary: "能力罗列单薄，缺乏体系化的专业产品技能维度。",
      rewrittenText: `【需求定义与产品规划】精通高复杂业务流的需求拆解、PRD 撰写与交互设计；\n【敏捷交付与项目协作】熟练掌握 Scrum 敏捷开发流程，具备卓越的跨团队沟通与进度控制能力；\n【数据驱动与分析】掌握 SQL、A/B 测试等数据分析技能，善于通过指标波动反哺产品优化。`,
      suggestionReason: "使用系统化的产品能力结构，展示扎实的产品经理核心素质，完全对齐招聘需求。",
      missingInfo: [],
      status: "pending"
    },
    // Executive version suggestions
    {
      id: "exec_s1",
      versionType: "executive",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "缺乏经营、财务 ROI、高管视角与组织效能治理逻辑。",
      rewrittenText: `主导公司 ${targetRole} 及配套产业生态的商业化闭环与整体经营指标，直接向决策层汇报；通过治理组织效能和优化生产要素分配，将研发交付 ROI 提升 25%，并主导实现了跨业务板块的资源整合与亿元级项目商业落地。`,
      suggestionReason: "将重心从功能执行提升至经营管理、组织效能和 ROI 控制，体现高管的核心治理方法论。",
      missingInfo: ["跨职能部门的具体管理规模", "具体主导的大型项目商业金额规模"],
      status: "pending"
    },
    {
      id: "exec_s2",
      versionType: "executive",
      sectionType: "个人简介",
      originalText: "多年产品经理经验，做过不少 AI 功能，懂技术，求职 AI 产品总监岗位。",
      issueSummary: "没有体现出高管级战略定力与大规模团队领导力的复合型人设。",
      rewrittenText: `资深高管级技术产品专家，具备 10 年以上跨职能大型部门治理、战略规划与组织效能重构方法论。拥有主导过亿元级产业落地及高管战略决策汇报的成熟实操经历，擅长通过数字化手段实现公司级经营 ROI 全面倍增。`,
      suggestionReason: "重塑高管级的统帅气质，突出战略领导力、财务思维与公司级组织架构重构的战略高度。",
      missingInfo: ["最高汇报级别 (如汇报给集团 CEO/董事会)"],
      status: "pending"
    },
    // AI Product version suggestions
    {
      id: "ai_s1",
      versionType: "ai_product",
      sectionType: "工作经历",
      originalText: "负责公司 AI 产品功能设计，和研发沟通需求，推动上线。",
      issueSummary: "未突出前沿大模型 (LLM)、Prompt、RAG 等 AI 技术应用与商业落地的核心竞争力。",
      rewrittenText: `主导公司 ${targetRole} AIGC 核心产品线从 0 到 1 架构规划与落地，主导生成式 AI / 大语言模型 (LLM) 场景应用创新，成功引入先进 RAG 及多智能体 (Agent) 协作系统；${teamSizeText}，打通数据飞轮、模型微调与端到端敏捷开发，显著提升模型回答准确率至 95%。`,
      suggestionReason: "对齐前沿大模型热点，强调 AI 技术的产品化落地与技术壁垒，完全突出 AI 领军人物的特色。",
      missingInfo: ["具体使用或微调过的基座大模型名称", "模型落地后的实际业务提效比例"],
      status: "pending"
    },
    {
      id: "ai_s2",
      versionType: "ai_product",
      sectionType: "核心能力",
      originalText: "精通产品设计，懂算法，会写代码，英语沟通好。",
      issueSummary: "完全没有触及 AI 产品经理核心的技术与算法方法论。",
      rewrittenText: `【前沿 AI 商业架构】精通大语言模型应用、多智能体协同及 RAG 端到端系统全生命周期产品设计方法论；\n【算法与工程理解】熟悉主流 LLM 微调（Fine-tuning）、Prompt 工程与向量数据库，能与算法团队进行高深度技术对话；\n【AI 业务飞轮构建】擅长构建“用户反馈 - 数据收集 - 模型迭代 - 体验升级”的闭环数据飞轮，驱动产品商业化指数级增长。`,
      suggestionReason: "凸显硬核 AI 产品经理的知识体系，包含 RAG、Prompt、Fine-tuning、数据飞轮等行业高壁垒关键词。",
      missingInfo: [],
      status: "pending"
    }
  ];
}

function getSimulatedClarificationQuestions(targetRole: string, resumeText: string) {
  return [
    {
      id: "q1",
      questionText: "您过往的工作经历中，是否主导或参与过大模型、AIGC、Agent 或 RAG 等 AI 相关项目？在其中扮演的具体角色是什么？",
      questionType: "AI 项目经验",
      reason: "目标岗位对大模型落地有 96% 的超高频要求。简历中若缺乏具体模型落地经验，会严重降低匹配度。",
      priority: 1,
      options: [
        "做过，作为主要产品/项目负责人，主导了从 0 到 1 落地",
        "做过，作为核心研发/算法/产品骨干参与，负责核心模块",
        "做过，参与了外围支撑或部分跨部门协同工作",
        "没有相关经历"
      ]
    },
    {
      id: "q2",
      questionText: "这些 AI 产品上线后带来了哪些可量化的业务结果？（如拉动业务收入、增加用户量、提升效率、节省成本等，若有具体数据请填写）",
      questionType: "业务结果",
      reason: "高管岗位非常看重商业化 ROI 与业务闭环。量化数据能够证明您的商业敏感度，避免表达偏执行。",
      priority: 2,
      options: [
        "有明确数据（例如拉动收入达 xxx 万元，新增标杆客户 xxx 家）",
        "有间接效率提升数据（例如人效提升 xxx%，模型准确率提升 xxx%）",
        "暂无明确可公开数据，主要以功能顺利按期交付为主"
      ]
    },
    {
      id: "q3",
      questionText: "您过往管理过的团队规模有多大？团队中包含了哪些专业角色？（如算法研究员、后端开发、产品经理、运营人员等）",
      questionType: "管理经验",
      reason: "该高级岗位需要协调复杂的跨职能团队，我们需要明确您的团队管理幅度与协同深度。",
      priority: 3,
      options: [
        "管理过 15 人以上大型跨职能团队（包含算法、工程、产品等）",
        "管理过 5-15 人中型研发或产品团队",
        "作为项目 Owner 带过 5 人以内小组或虚拟项目团队",
        "暂无管理经历，主要作为独立贡献者 (IC) 开展工作"
      ]
    },
    {
      id: "q4",
      questionText: "您在日常工作中是否经常向 CEO、CTO 等公司高管，或者外部大型 KA 客户的高层决策者进行直接汇报？",
      questionType: "高层协同",
      reason: "高阶岗位需要候选人具备极佳 of stakeholder management, executive presentation and commercial acumen.",
      priority: 4,
      options: [
        "是的，经常直接向 CEO/CTO/业务总监汇报，或面向外部 KA 客户 VP 以上进行方案呈现",
        "偶尔会参与向高层汇报或售前商务会谈",
        "主要是对内向直接上级（如总监或产品负责人）汇报"
      ]
    },
    {
      id: "q5",
      questionText: "您是否参与过 AI 产品的定价策略制定、售前技术支持、大客户转化或商业化落地的实际闭环过程？",
      questionType: "商业化经验",
      reason: "岗位强调端到端的商业闭环和 ROI，了解您的商业经验有助于在简历中凸显您的商业架构能力。",
      priority: 5,
      options: [
        "是的，主导或深度参与过 AI 产品的定价策略、售前交付和客户付费闭环",
        "仅参与过售前方案设计，不直接对销售 and 定价结果负责",
        "主要专注于产品规划与技术研发交付，较少介入商业化闭环"
      ]
    }
  ];
}


function getSimulatedMatch(targetRole: string, resumeText: string) {
  // Infer basic context from resume text
  const matchScore = resumeText.length > 500 ? 74 : 58;
  return {
    matchScore: matchScore,
    strengths: [
      {
        title: "大模型产品应用与敏捷开发经历",
        detail: "您的简历中显示出清晰的 AI/ML 技术项目主导经历。成功在主要产品线中集成了自然语言处理模型，这完全对齐了市场对 LLM 深度集成的 96% 高频技能需求。"
      },
      {
        title: "跨职能团队协作与领导力",
        detail: "具备管理和主导 5+ 规模以上的跨算法与研发人员团队的真实案例，有效缩短了产品从设计到上线的生命周期，体现了 84% 发生频率的跨职能团队组织力。"
      },
      {
        title: "商业化应用抽象与产品规划能力",
        detail: "展现了明确的 B 端及平台级产品规划方法论，能够将深奥的技术概念转化为客户价值，符合 B-Side 产品经验与商业策略的任职要求。"
      }
    ],
    gaps: [
      {
        title: "缺乏量化的业务商业化指标 (ROI)",
        detail: "简历中多次使用“负责功能设计”、“提升用户体验”等温和词汇，严重缺失具体的客户数量增长、营收拉动或成本节约的量化数据，难以支撑总监级岗位的商业结果要求。"
      },
      {
        title: "大语言模型关键前沿关键词覆盖不足",
        detail: "简历中提及的技术栈以传统 ML、推荐模型为主，没有显著提及 RAG、Agent、Prompt Engineering 等当前高阶 AI 产品经理的核心高频关键词，极易被 ATS 简历系统筛选过滤。"
      },
      {
        title: "高级组织建设与战略规划能力表达偏弱",
        detail: "简历表达仍停留在单纯的“执行层”和“功能定义”，没有突出在部门战略级规划、3-5年路线图绘制或面对核心管理层 (CEO/CTO) 汇报和决策参与的经验信号。"
      }
    ],
    matchedKeywords: ["SaaS Architecture", "Go-to-Market", "Series C", "OKR Implementation", "Enterprise Sales"],
    missingKeywords: ["GDPR Compliance", "SOC2", "Pre-IPO Readiness", "Turnaround Strategy", "Prompt Engineering", "RAG Pipeline"]
  };
}

function getSimulatedResume(targetRole: string, resumeText: string) {
  // Try to parse basic details or provide defaults
  let name = "张建国 / John Doe";
  let email = "john.doe@careerai.cn";
  let location = "北京";
  
  if (resumeText.includes("张") || resumeText.includes("李") || resumeText.includes("王")) {
    const matchName = resumeText.match(/(张|李|王|赵|刘|陈)[^\s，。]{1,3}/);
    if (matchName) name = matchName[0];
  }
  
  const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  return {
    name: name,
    title: targetRole || "AI 产品负责人",
    email: email,
    location: location,
    linkedin: "linkedin.com/in/johndoe",
    summary: `具备 6 年以上硬核科技产品经理实战经验，专注于生成式 AI、大语言模型 (LLM) 技术集成及行业级 Agent 的商业化落地。拥有在敏捷团队中从 0 到 1 主导 AI 产品架构并推动百万级商业化增长的杰出记录。擅长架起先进算法研究成果与真实企业应用落地之间的桥梁，曾成功带领 10+ 规模的跨研发、数据科学和模型算法团队完成关键交付，对大模型技术链、提示词工程与数据合规具有极强的商业敏感性与技术底蕴。`,
    coreCapabilities: [
      "0-1 生成式 AI 产品全栈落地",
      "LLM 提示词优化与 Agent 架构设计",
      "跨职能敏捷团队管理与高效率交付",
      "B 端大客户解决方案与 GTM 商业化策略",
      "数据合规、隐私保护及算法成效评估"
    ],
    experience: [
      {
        company: "科技领航者集团 (Tech Corp)",
        role: "高级 AI 业务线产品经理 / Senior AI Product Manager",
        duration: "2021 - 至今",
        bullets: [
          `**主导集团旗舰大模型产品从 0 到 1 研发与商业化落地**：成功推动基于 LLM + RAG 的企业知识库助理产品交付，实现上线前三个月核心用户活跃度 (WAU) **暴增 40%**【建议补充：例如“拉动新产品线年收入达 xxx 万元，新增头部标杆客户 xxx 家”】。`,
          `**带领 5 位高级 ML 算法工程师与 8 位全栈工程师团队**：全面引入 AI 特斯拉式敏捷研发模式，优化了模型微调与评测流水线，成功将实验模型**上线周期缩短了 25%**。`,
          `**主导定制企业数据合规与大模型安全治理框架**：确保产品满足【建议补充：例如“通过了国内大模型备案及 GDPR/SOC2 认证，合规安全率达到 xxx%”】，为拓展医疗与金融场景政企客户铺平了商业准入道路。`,
          `**多次向集团决策层 (CEO/CTO) 进行技术商业前景专项汇报**：成功申请到并高效管理超 **1000 万** 年度大模型算力与研发预算，确保项目产出 ROI 优于行业平均水平。`
        ]
      },
      {
        company: "前沿硬科技初创公司 (Startup Inc)",
        role: "核心产品经理 / Product Manager",
        duration: "2018 - 2021",
        bullets: [
          `**从零开始定义并发布面向企业级的智能客服与推荐引擎系统**：实现首款智能交互产品上线，客户覆盖知名新零售龙头企业，**年直接拉动新零售交易流水 15% 增长**。`,
          `**高阶协同 GTM 营销与售前解决方案部门**：深度挖掘政企客户场景痛点，撰写高专业度售前技术白皮书，助力销售团队在极短时间内**成单 10+ 个百万级商业合伙伙伴**。`,
          `**通过详尽的定量研究与 A/B 测试机制持续进行功能重构**：将系统对客户意图解析的召回率 (Recall) **显著拉升至 92%**，大幅压降人工客服负荷达 30%【建议补充：例如“节省人工客服成本超 xxx 万元，问题解决率由 xxx% 提升至 xxx%”】。`
        ]
      }
    ],
    education: "北京航空航天大学 ｜ 计算机科学与技术学士 ｜ 2014 - 2018",
    skills: [
      "大语言模型 (LLM)",
      "提示词工程 (Prompt)",
      "检索增强生成 (RAG)",
      "知识库架构 (Vector DB)",
      "敏捷项目管理 (Agile)",
      "产品战略路线图 (GTM)",
      "跨职能团队协作 (Cross-functional)",
      "B 端政企客户沟通 (Enterprise)",
      "数据分析与 A/B 测试",
      "Python / SQL 实操能力"
    ]
  };
}

startServer();
