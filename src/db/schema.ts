import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Supabase Auth UID
  email: text('email').notNull(),
  referredBy: text('referred_by'), // uid of the referrer, set only at registration time
  createdAt: timestamp('created_at').defaultNow(),
});

export const resumeVersions = pgTable('resume_versions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  reportId: text('report_id').notNull(),
  versions: text('versions').notNull(), // Serialized JSON of all versions
  createdAt: timestamp('created_at').defaultNow(),
});

export const rewriteSuggestions = pgTable('rewrite_suggestions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  reportId: text('report_id').notNull(),
  suggestions: text('suggestions').notNull(), // Serialized JSON of all suggestions
  createdAt: timestamp('created_at').defaultNow(),
});

export const clarificationQuestions = pgTable('clarification_questions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  reportId: text('report_id').notNull(),
  questions: text('questions').notNull(), // Serialized JSON of questions array
  createdAt: timestamp('created_at').defaultNow(),
});

export const userFeedbacks = pgTable('user_feedbacks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  reportId: text('report_id').notNull(),
  rating: integer('rating').notNull(),
  feedbackText: text('feedback_text'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const eventLogs = pgTable('event_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  eventType: text('event_type').notNull(),
  metaData: text('meta_data'), // Serialized JSON metadata
  createdAt: timestamp('created_at').defaultNow(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  taskId: text('task_id').notNull(),
  businessOrderNo: text('business_order_no').notNull().unique(),
  paymentOrderNo: text('payment_order_no'), // returned by payment gateway
  targetRole: text('target_role'),
  amount: integer('amount').notNull(), // in cents (分)
  status: integer('status').notNull().default(1), // 1=待支付 2=已支付 3=失败 4=已取消 5=已过期
  statusName: text('status_name').default('待支付'),
  qrCodeUrl: text('qr_code_url'),
  bankOrderNo: text('bank_order_no'),
  thirdPartyOrderNo: text('third_party_order_no'),
  priceVersionId: integer('price_version_id'), // PRD §7 下单价格快照：当时生效的价格版本
  priceSnapshot: integer('price_snapshot'), // cents，下单时的挂牌价快照（与实际扣款 amount 解耦）
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  paymentId: integer('payment_id')
    .references(() => payments.id, { onDelete: 'cascade' })
    .notNull(),
  businessOrderNo: text('business_order_no').notNull(),
  refundOrderNo: text('refund_order_no'),
  amount: integer('amount').notNull(), // in cents (分)
  reason: text('reason'),
  status: integer('status').notNull().default(1), // 0=待审批 1=处理中 2=成功 3=失败 4=已拒绝
  statusName: text('status_name').default('处理中'),
  processedByAdmin: text('processed_by_admin'),
  requestedByAdmin: text('requested_by_admin'),
  approvedByAdmin: text('approved_by_admin'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id'),
  adminUsername: text('admin_username').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detail: text('detail'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const costEvents = pgTable('cost_events', {
  id: serial('id').primaryKey(),
  taskId: text('task_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  operation: text('operation').notNull(),
  tokensIn: integer('tokens_in').default(0),
  tokensOut: integer('tokens_out').default(0),
  costCents: integer('cost_cents').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adminMfa = pgTable('admin_mfa', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => admins.id, { onDelete: 'cascade' }).notNull().unique(),
  secret: text('secret').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  backupCodes: text('backup_codes'), // JSON array of hashed codes
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const siteConfigs = pgTable('site_configs', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(), // e.g. 'brand', 'homepage_copy', 'announcement', 'legal_privacy', 'legal_terms', 'feature_flags'
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft | published | archived
  value: text('value').notNull(), // JSON
  editedByAdmin: text('edited_by_admin'),
  publishedByAdmin: text('published_by_admin'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const aiProviders = pgTable('ai_providers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // e.g. 'gemini'
  displayName: text('display_name').notNull(),
  apiKeyEnvVar: text('api_key_env_var').notNull(), // reference only, never store raw secret
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const aiModels = pgTable('ai_models', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id').references(() => aiProviders.id, { onDelete: 'cascade' }).notNull(),
  modelName: text('model_name').notNull(), // e.g. 'gemini-2.5-flash'
  operation: text('operation').notNull(), // clarification-questions | rewrite-suggestions | regenerate-rewrite | resume-versions
  priceInputPerMillion: integer('price_input_per_million').notNull().default(0), // cents per 1M input tokens
  priceOutputPerMillion: integer('price_output_per_million').notNull().default(0), // cents per 1M output tokens
  isDefault: boolean('is_default').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const promptVersions = pgTable('prompt_versions', {
  id: serial('id').primaryKey(),
  operation: text('operation').notNull(), // clarification-questions | rewrite-suggestions | regenerate-rewrite | resume-versions
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft | published | archived
  content: text('content').notNull(),
  editedByAdmin: text('edited_by_admin'),
  publishedByAdmin: text('published_by_admin'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  uid: text('uid'),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'), // open | in_progress | resolved | closed
  priority: text('priority').notNull().default('normal'), // low | normal | high | urgent
  assignedToAdmin: text('assigned_to_admin'),
  relatedOrderNo: text('related_order_no'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const ticketReplies = pgTable('ticket_replies', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  authorType: text('author_type').notNull(), // admin | user
  authorName: text('author_name').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  audience: text('audience').notNull().default('all'), // all | uid
  targetUid: text('target_uid'),
  channel: text('channel').notNull().default('in_app'), // in_app | email(P1 stub)
  createdByAdmin: text('created_by_admin'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const riskFlags = pgTable('risk_flags', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull(),
  ruleType: text('rule_type').notNull(), // rapid_signup | payment_velocity | refund_abuse | manual
  severity: text('severity').notNull().default('low'), // low | medium | high
  detail: text('detail'),
  status: text('status').notNull().default('open'), // open | reviewed | dismissed
  reviewedByAdmin: text('reviewed_by_admin'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const revenueAllocations = pgTable('revenue_allocations', {
  id: serial('id').primaryKey(),
  paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'cascade' }).notNull(),
  taskId: text('task_id'),
  grossAmount: integer('gross_amount').notNull(), // cents
  allocatedAmount: integer('allocated_amount').notNull(), // cents allocated to this task
  allocationMethod: text('allocation_method').notNull().default('single_100'), // single_100 | equal_split
  createdAt: timestamp('created_at').defaultNow(),
});

// PRD §7 商品与价格：商品(product) → 规格(sku) → 价格版本(price_version)。
// 价格版本走发布审批闭环（draft → pending → published → archived），支持回滚到历史已发布版本。
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'), // active | inactive
  createdByAdmin: text('created_by_admin'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const skus = pgTable('skus', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  targetRole: text('target_role'), // 关联下单时的目标岗位（用于价格快照匹配），可空
  status: text('status').notNull().default('active'), // active | inactive
  createdByAdmin: text('created_by_admin'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const priceVersions = pgTable('price_versions', {
  id: serial('id').primaryKey(),
  skuId: integer('sku_id').references(() => skus.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull().default(1),
  status: text('status').notNull().default('draft'), // draft | pending | published | archived
  amount: integer('amount').notNull(), // cents
  currency: text('currency').notNull().default('CNY'),
  effectiveAt: timestamp('effective_at'),
  editedByAdmin: text('edited_by_admin'),
  publishedByAdmin: text('published_by_admin'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// PRD §12.6 审批中心 / §2.2 Maker-Checker 双人复核。
// 承载所有高风险动作的审批单：大额退款、价格发布、账务调整、批量导出、密钥轮换、配置/提示词发布等。
// 状态枚举见附录B（审批单）：PENDING / APPROVED / REJECTED / CANCELED / EXPIRED。
export const approvals = pgTable('approvals', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // refund | price_publish | account_adjust | bulk_export | key_rotation | bulk_delete | config_publish | prompt_publish | other
  targetType: text('target_type'), // payment | refund | config | prompt | account ...
  targetId: text('target_id'),
  payload: text('payload'), // JSON：申请变更的具体内容
  amount: integer('amount'), // cents，用于阈值判定（如 >¥100 需第二审批人）
  status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED | CANCELED | EXPIRED
  reason: text('reason'), // 申请原因
  requestedByAdmin: text('requested_by_admin'),
  approvedByAdmin: text('approved_by_admin'),
  decisionReason: text('decision_reason'), // 审批/拒绝备注
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  resumeVersions: many(resumeVersions),
  rewriteSuggestions: many(rewriteSuggestions),
  clarificationQuestions: many(clarificationQuestions),
  userFeedbacks: many(userFeedbacks),
  eventLogs: many(eventLogs),
}));

export const resumeVersionsRelations = relations(resumeVersions, ({ one }) => ({
  user: one(users, {
    fields: [resumeVersions.userId],
    references: [users.id],
  }),
}));

export const rewriteSuggestionsRelations = relations(rewriteSuggestions, ({ one }) => ({
  user: one(users, {
    fields: [rewriteSuggestions.userId],
    references: [users.id],
  }),
}));
