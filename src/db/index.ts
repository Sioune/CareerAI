import pg from "pg";
import { users, resumeVersions, rewriteSuggestions, clarificationQuestions, userFeedbacks, eventLogs, payments, admins, refunds, auditLogs, costEvents } from "./schema.ts";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

// ─── Table name map ───────────────────────────────────────────────────────────

const tableMap = new Map<any, string>([
  [users,                   "users"],
  [resumeVersions,          "resume_versions"],
  [rewriteSuggestions,      "rewrite_suggestions"],
  [clarificationQuestions,  "clarification_questions"],
  [userFeedbacks,           "user_feedbacks"],
  [eventLogs,               "event_logs"],
  [payments,                "payments"],
  [admins,                  "admins"],
  [refunds,                 "refunds"],
  [auditLogs,               "audit_logs"],
  [costEvents,              "cost_events"],
]);

// ─── Column name helpers ──────────────────────────────────────────────────────

// JS camelCase field name → Postgres snake_case column name
const fieldToCol: Record<string, string> = {
  id:            "id",
  uid:           "uid",
  email:         "email",
  referredBy:    "referred_by",
  passwordHash:  "password_hash",
  userId:        "user_id",
  reportId:      "report_id",
  versions:      "versions",
  suggestions:   "suggestions",
  questions:     "questions",
  rating:        "rating",
  feedbackText:  "feedback_text",
  eventType:     "event_type",
  metaData:      "meta_data",
  createdAt:     "created_at",
  taskId:           "task_id",
  businessOrderNo:  "business_order_no",
  paymentOrderNo:   "payment_order_no",
  targetRole:       "target_role",
  amount:           "amount",
  status:           "status",
  statusName:       "status_name",
  qrCodeUrl:        "qr_code_url",
  bankOrderNo:      "bank_order_no",
  thirdPartyOrderNo:"third_party_order_no",
  paidAt:           "paid_at",
  updatedAt:        "updated_at",
  username:         "username",
  role:             "role",
  paymentId:        "payment_id",
  refundOrderNo:    "refund_order_no",
  reason:           "reason",
  processedByAdmin: "processed_by_admin",
  requestedByAdmin: "requested_by_admin",
  approvedByAdmin:  "approved_by_admin",
  rejectionReason:  "rejection_reason",
  adminId:          "admin_id",
  adminUsername:    "admin_username",
  action:           "action",
  targetType:       "target_type",
  targetId:         "target_id",
  detail:           "detail",
  taskId:           "task_id",
  provider:         "provider",
  model:            "model",
  operation:        "operation",
  tokensIn:         "tokens_in",
  tokensOut:        "tokens_out",
  costCents:        "cost_cents",
};

const colToField: Record<string, string> = {
  id:             "id",
  uid:            "uid",
  email:          "email",
  referred_by:    "referredBy",
  password_hash:  "passwordHash",
  user_id:        "userId",
  report_id:      "reportId",
  versions:       "versions",
  suggestions:    "suggestions",
  questions:      "questions",
  rating:         "rating",
  feedback_text:  "feedbackText",
  event_type:     "eventType",
  meta_data:      "metaData",
  created_at:     "createdAt",
  task_id:            "taskId",
  business_order_no:  "businessOrderNo",
  payment_order_no:   "paymentOrderNo",
  target_role:        "targetRole",
  amount:             "amount",
  status:             "status",
  status_name:        "statusName",
  qr_code_url:        "qrCodeUrl",
  bank_order_no:      "bankOrderNo",
  third_party_order_no: "thirdPartyOrderNo",
  paid_at:             "paidAt",
  updated_at:          "updatedAt",
  username:            "username",
  role:                "role",
  payment_id:          "paymentId",
  refund_order_no:     "refundOrderNo",
  reason:              "reason",
  processed_by_admin:  "processedByAdmin",
  requested_by_admin:  "requestedByAdmin",
  approved_by_admin:   "approvedByAdmin",
  rejection_reason:    "rejectionReason",
  admin_id:            "adminId",
  admin_username:      "adminUsername",
  action:              "action",
  target_type:         "targetType",
  target_id:           "targetId",
  detail:              "detail",
  provider:            "provider",
  model:               "model",
  operation:           "operation",
  tokens_in:           "tokensIn",
  tokens_out:          "tokensOut",
  cost_cents:          "costCents",
};

function colName(fieldObj: any): string {
  if (!fieldObj) return "";
  if (typeof fieldObj === "string") return fieldToCol[fieldObj] ?? fieldObj;
  if (fieldObj.name) return fieldObj.name; // Drizzle column objects expose .name
  return String(fieldObj);
}

function rowToJs(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[colToField[k] ?? k] = v;
  }
  return out;
}

// ─── Condition builder ────────────────────────────────────────────────────────

export function eq(fieldObj: any, value: any) {
  return { type: "eq" as const, field: fieldObj, value };
}

export function and(...conditions: any[]) {
  return { type: "and" as const, conditions };
}

// Build a WHERE clause + params array from a condition tree.
// paramOffset is the index of the next $N placeholder.
function buildWhere(condition: any, paramOffset: number): { sql: string; params: any[] } {
  if (!condition) return { sql: "", params: [] };

  if (condition.type === "eq") {
    const col = colName(condition.field);
    return { sql: `${col} = $${paramOffset}`, params: [condition.value] };
  }

  if (condition.type === "and") {
    const parts: string[] = [];
    const allParams: any[] = [];
    let offset = paramOffset;
    for (const cond of condition.conditions) {
      const { sql, params } = buildWhere(cond, offset);
      parts.push(sql);
      allParams.push(...params);
      offset += params.length;
    }
    return { sql: parts.join(" AND "), params: allParams };
  }

  return { sql: "", params: [] };
}

// ─── Core query helpers ───────────────────────────────────────────────────────

async function runSelect(tableName: string, condition: any): Promise<any[]> {
  const { sql: whereSql, params } = buildWhere(condition, 1);
  const query = whereSql
    ? `SELECT * FROM ${tableName} WHERE ${whereSql}`
    : `SELECT * FROM ${tableName}`;
  const { rows } = await pool.query(query, params);
  return rows.map(rowToJs);
}

async function runInsert(tableName: string, data: Record<string, any>): Promise<any[]> {
  const cols: string[] = [];
  const placeholders: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [jsKey, val] of Object.entries(data)) {
    if (jsKey === "id" && (val === undefined || val === null)) continue;
    const col = fieldToCol[jsKey] ?? jsKey;
    cols.push(col);
    placeholders.push(`$${i++}`);
    values.push(val);
  }
  const query = `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
  const { rows } = await pool.query(query, values);
  return rows.map(rowToJs);
}

async function runUpdate(tableName: string, updateData: Record<string, any>, condition: any): Promise<{ success: boolean }> {
  const setClauses: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [jsKey, val] of Object.entries(updateData)) {
    const col = fieldToCol[jsKey] ?? jsKey;
    setClauses.push(`${col} = $${i++}`);
    values.push(val);
  }
  const { sql: whereSql, params: whereParams } = buildWhere(condition, i);
  values.push(...whereParams);
  const query = whereSql
    ? `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereSql}`
    : `UPDATE ${tableName} SET ${setClauses.join(", ")}`;
  await pool.query(query, values);
  return { success: true };
}

async function runDelete(tableName: string, condition: any): Promise<{ success: boolean }> {
  const { sql: whereSql, params } = buildWhere(condition, 1);
  const query = whereSql
    ? `DELETE FROM ${tableName} WHERE ${whereSql}`
    : `DELETE FROM ${tableName}`;
  await pool.query(query, params);
  return { success: true };
}

// ─── Promise builder helpers (preserve chainable API) ────────────────────────

function makeSelectChain(table: any, condition: any = null) {
  const exec = (): Promise<any[]> => {
    const tableName = tableMap.get(table) ?? "unknown";
    return runSelect(tableName, condition);
  };
  const chain = exec() as any;
  chain.where = (cond: any) => makeSelectChain(table, cond);
  return chain;
}

function makeInsertChain(table: any, data: Record<string, any>) {
  const exec = (): Promise<any[]> => {
    const tableName = tableMap.get(table) ?? "unknown";
    return runInsert(tableName, data);
  };
  const chain = exec() as any;
  chain.returning = () => chain;
  return chain;
}

function makeUpdateChain(table: any, data: Record<string, any>, condition: any = null) {
  const exec = (): Promise<{ success: boolean }> => {
    const tableName = tableMap.get(table) ?? "unknown";
    return runUpdate(tableName, data, condition);
  };
  const chain = exec() as any;
  chain.where = (cond: any) => makeUpdateChain(table, data, cond);
  return chain;
}

function makeDeleteChain(table: any, condition: any = null) {
  const exec = (): Promise<{ success: boolean }> => {
    const tableName = tableMap.get(table) ?? "unknown";
    return runDelete(tableName, condition);
  };
  const chain = exec() as any;
  chain.where = (cond: any) => makeDeleteChain(table, cond);
  return chain;
}

// ─── Public DB client (same API as before) ────────────────────────────────────

export const db = {
  select: (_fields?: any) => ({
    from: (table: any) => makeSelectChain(table),
  }),
  insert: (table: any) => ({
    values: (data: any) => makeInsertChain(table, data),
  }),
  update: (table: any) => ({
    set: (data: any) => ({
      where: (condition: any) => makeUpdateChain(table, data, condition),
    }),
  }),
  delete: (table: any) => ({
    where: (condition: any) => makeDeleteChain(table, condition),
  }),
};
