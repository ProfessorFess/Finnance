import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export type AccountType = "checking" | "savings" | "credit_card" | "cash" | "loan" | "investment" | "other";
export type CategoryKind = "expense" | "income" | "transfer";
export type TransactionSource = "csv" | "xlsx" | "ofx" | "manual" | "ai" | "sync";
export type CategorizationSource = "rule" | "history" | "ai" | "user" | "transfer";
export type RuleMatchType = "merchant_equals" | "description_contains" | "regex";
export type RuleOrigin = "user" | "correction" | "default" | "recurring";
export type IncomeType = "salary" | "hourly" | "freelance" | "benefits" | "side_income" | "other";
export type AmountMode = "fixed" | "varies" | "estimated";
export type RecurringKind = "bill" | "subscription" | "transfer";
/** How a transaction got linked to a recurring item; "dismissed" = the user said it isn't one. */
export type MatchSource = "auto" | "user" | "dismissed";

export { NOT_A_TRANSFER } from "@/lib/transfer-constants";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
const cents = (name: string) => bigint(name, { mode: "number" });

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  trackingStartDate: date("tracking_start_date", { mode: "string" }),
  timezone: text("timezone").default("America/Chicago").notNull(),
  weekStartDay: integer("week_start_day").default(1).notNull(),
  aiMonthlyCapCents: integer("ai_monthly_cap_cents").default(1000).notNull(),
  defaultRulesSeeded: boolean("default_rules_seeded").default(false).notNull(),
  ...timestamps,
});

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    type: text("type").$type<AccountType>().notNull(),
    institution: text("institution"),
    lastFour: text("last_four"),
    startingBalanceCents: cents("starting_balance_cents").default(0).notNull(),
    includeInNetWorth: boolean("include_in_net_worth").default(true).notNull(),
    archivedAt: timestamp("archived_at"),
    ...timestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    groupName: text("group_name").notNull(),
    kind: text("kind").$type<CategoryKind>().notNull(),
    icon: text("icon").notNull(),
    color: text("color"),
    parentId: text("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    archivedAt: timestamp("archived_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_user_name_idx").on(t.userId, t.name)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    userId: userId(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    importedCount: integer("imported_count").notNull(),
    duplicateCount: integer("duplicate_count").notNull(),
    pendingCount: integer("pending_count").notNull(),
    beforeStartCount: integer("before_start_count").notNull(),
    errorCount: integer("error_count").notNull(),
    undoneAt: timestamp("undone_at"),
    ...timestamps,
  },
  (t) => [index("import_batches_user_idx").on(t.userId, t.createdAt)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: userId(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amountCents: cents("amount_cents").notNull(),
    rawDescription: text("raw_description").notNull(),
    merchant: text("merchant"),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    notes: text("notes"),
    tags: text("tags").array().default([]).notNull(),
    source: text("source").$type<TransactionSource>().notNull(),
    importBatchId: text("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    externalId: text("external_id"),
    dedupeHash: text("dedupe_hash").notNull(),
    status: text("status").default("cleared").notNull(),
    bankCategory: text("bank_category"),
    categorizationSource: text("categorization_source").$type<CategorizationSource>(),
    categorizationConfidence: real("categorization_confidence"),
    needsReview: boolean("needs_review").default(false).notNull(),
    /** Shared id for both sides of a transfer, or NOT_A_TRANSFER. */
    transferPairId: text("transfer_pair_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transactions_account_dedupe_idx").on(t.accountId, t.dedupeHash),
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_user_review_idx").on(t.userId, t.needsReview),
  ],
);

export const importProfiles = pgTable(
  "import_profiles",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    headerSignature: text("header_signature").notNull(),
    mapping: jsonb("mapping").notNull(),
    defaultAccountId: text("default_account_id").references(() => accounts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("import_profiles_user_signature_idx").on(t.userId, t.headerSignature)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    userId: userId(),
    actor: text("actor").$type<"user" | "system" | "ai">().notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    undoneAt: timestamp("undone_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("activity_log_entity_idx").on(t.userId, t.entityType, t.entityId)],
);

export const categoryRules = pgTable(
  "category_rules",
  {
    id: id(),
    userId: userId(),
    matchType: text("match_type").$type<RuleMatchType>().notNull(),
    pattern: text("pattern").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    priority: integer("priority").default(100).notNull(),
    createdFrom: text("created_from").$type<RuleOrigin>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("category_rules_user_pattern_idx").on(t.userId, t.matchType, t.pattern)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: userId(),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt)],
);
