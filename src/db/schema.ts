import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
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
