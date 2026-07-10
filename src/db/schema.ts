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
  paidAt: timestamp('paid_at'),
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
