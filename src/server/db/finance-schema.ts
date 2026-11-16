import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Frequency, ScheduledFrequency } from "@/server/recurring/schedule";
import { sql } from "drizzle-orm";
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
export type BucketRole = "spending" | "bills" | "savings" | "goal" | "buffer";
export type FundingType = "fixed" | "percent" | "sum_of_recurring" | "remainder";
/** A limit's window: a calendar week, a calendar month, or the time since the latest income. */
export type LimitPeriod = "weekly" | "monthly" | "per_income";
export type PlanTemplate = "paycheck_plan" | "monthly_categories" | "fifty_thirty_twenty" | "custom";
/** "Split each income as it arrives" or "budget each month". */
export type PlanCadence = "per_income" | "monthly";
export type PlanRuleType = "extra_income";
export type GoalType = "savings" | "debt_payoff" | "purchase" | "retirement";
export type GoalStatus = "active" | "paused" | "completed" | "archived";
/** manual = added by hand; auto = credited from a matching transaction; linked = the user tied a transaction to the goal. */
export type ContributionSource = "manual" | "auto" | "linked";
export type PlannedPer = "month" | "income";

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
    /** The paycheck or other income this deposit fulfils. */
    incomeSourceId: text("income_source_id").references((): AnyPgColumn => incomeSources.id, { onDelete: "set null" }),
    /** The bill, subscription, or recurring transfer this row fulfils. */
    recurringRuleId: text("recurring_rule_id").references((): AnyPgColumn => recurringRules.id, { onDelete: "set null" }),
    /** The expected occurrence it fulfils (null for irregular income). */
    expectedDate: date("expected_date", { mode: "string" }),
    matchSource: text("match_source").$type<MatchSource>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transactions_account_dedupe_idx").on(t.accountId, t.dedupeHash),
    index("transactions_user_date_idx").on(t.userId, t.date),
    index("transactions_user_review_idx").on(t.userId, t.needsReview),
    uniqueIndex("transactions_income_occurrence_idx").on(t.incomeSourceId, t.expectedDate),
    uniqueIndex("transactions_recurring_occurrence_idx").on(t.recurringRuleId, t.expectedDate),
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

export const incomeSources = pgTable(
  "income_sources",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    type: text("type").$type<IncomeType>().notNull(),
    frequency: text("frequency").$type<Frequency>().notNull(),
    /** First expected date; null only for irregular income. */
    anchorDate: date("anchor_date", { mode: "string" }),
    secondDay: integer("second_day"),
    amountMode: text("amount_mode").$type<AmountMode>().notNull(),
    /** Per occurrence (per month for irregular income); null = taken from the first matched deposit. */
    expectedCents: cents("expected_cents"),
    minCents: cents("min_cents"),
    maxCents: cents("max_cents"),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    matchPattern: text("match_pattern").notNull(),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("income_sources_user_idx").on(t.userId)],
);

export const recurringRules = pgTable(
  "recurring_rules",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    kind: text("kind").$type<RecurringKind>().notNull(),
    frequency: text("frequency").$type<ScheduledFrequency>().notNull(),
    anchorDate: date("anchor_date", { mode: "string" }).notNull(),
    secondDay: integer("second_day"),
    expectedCents: cents("expected_cents").notNull(),
    amountVaries: boolean("amount_varies").default(false).notNull(),
    /** Null = defaultToleranceCents(expected). */
    toleranceCents: integer("tolerance_cents"),
    accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
    categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
    matchPattern: text("match_pattern").notNull(),
    active: boolean("active").default(true).notNull(),
    /** The budget bucket this bill is paid from. */
    bucketId: text("bucket_id").references((): AnyPgColumn => buckets.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("recurring_rules_user_idx").on(t.userId)],
);

/** Repeating merchants the user said not to suggest again. */
export const recurringDismissals = pgTable(
  "recurring_dismissals",
  {
    id: id(),
    userId: userId(),
    merchantKey: text("merchant_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("recurring_dismissals_user_key_idx").on(t.userId, t.merchantKey)],
);

export const budgetPlans = pgTable(
  "budget_plans",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    template: text("template").$type<PlanTemplate>().notNull(),
    cadence: text("cadence").$type<PlanCadence>().notNull(),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("budget_plans_one_active_idx").on(t.userId).where(sql`${t.active}`)],
);

/** Which income sources fund a plan (any number, scheduled or not). */
export const planIncomeSources = pgTable(
  "plan_income_sources",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => budgetPlans.id, { onDelete: "cascade" }),
    incomeSourceId: text("income_source_id")
      .notNull()
      .references(() => incomeSources.id, { onDelete: "cascade" }),
    userId: userId(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.planId, t.incomeSourceId] })],
);

export const buckets = pgTable(
  "buckets",
  {
    id: id(),
    userId: userId(),
    planId: text("plan_id")
      .notNull()
      .references(() => budgetPlans.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    color: text("color"),
    sortOrder: integer("sort_order").default(0).notNull(),
    role: text("role").$type<BucketRole>().notNull(),
    fundingType: text("funding_type").$type<FundingType>().notNull(),
    /** Per income (per month in monthly plans). */
    fundingCents: cents("funding_cents"),
    fundingBps: integer("funding_bps"),
    limitCents: cents("limit_cents"),
    limitPeriod: text("limit_period").$type<LimitPeriod>(),
    trackCategoryIds: text("track_category_ids").array().default([]).notNull(),
    destinationAccountId: text("destination_account_id").references(() => accounts.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("buckets_plan_idx").on(t.planId)],
);

export const planRules = pgTable(
  "plan_rules",
  {
    id: id(),
    userId: userId(),
    planId: text("plan_id")
      .notNull()
      .references(() => budgetPlans.id, { onDelete: "cascade" }),
    type: text("type").$type<PlanRuleType>().notNull(),
    bucketId: text("bucket_id")
      .notNull()
      .references(() => buckets.id, { onDelete: "cascade" }),
    incomeSourceId: text("income_source_id").references(() => incomeSources.id, { onDelete: "cascade" }),
    percentBps: integer("percent_bps").default(10000).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("plan_rules_plan_type_idx").on(t.planId, t.type)],
);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    type: text("type").$type<GoalType>().notNull(),
    icon: text("icon").notNull(),
    targetCents: cents("target_cents"),
    targetDate: date("target_date", { mode: "string" }),
    /** What was already saved toward it on start_date. */
    startingCents: cents("starting_cents").default(0).notNull(),
    priority: integer("priority").notNull(),
    plannedCents: cents("planned_cents"),
    plannedPer: text("planned_per").$type<PlannedPer>(),
    status: text("status").$type<GoalStatus>().default("active").notNull(),
    fundedByBucketId: text("funded_by_bucket_id").references(() => buckets.id, { onDelete: "set null" }),
    /** Counts transfers into this account automatically. */
    trackAccountId: text("track_account_id").references(() => accounts.id, { onDelete: "set null" }),
    /** Or counts spending in this category automatically. */
    trackCategoryId: text("track_category_id").references(() => categories.id, { onDelete: "set null" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    completedAt: timestamp("completed_at"),
    ...timestamps,
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: id(),
    userId: userId(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    amountCents: cents("amount_cents").notNull(),
    transactionId: text("transaction_id").references(() => transactions.id, { onDelete: "cascade" }),
    source: text("source").$type<ContributionSource>().notNull(),
    /** The user said it doesn't count; kept so automation never adds it back. */
    excluded: boolean("excluded").default(false).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("goal_contributions_goal_idx").on(t.goalId), uniqueIndex("goal_contributions_transaction_idx").on(t.transactionId)],
);
