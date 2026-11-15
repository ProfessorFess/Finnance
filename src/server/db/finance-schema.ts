import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export type AccountType = "checking" | "savings" | "credit_card" | "cash" | "loan" | "investment" | "other";
export type CategoryKind = "expense" | "income" | "transfer";
export type TransactionSource = "csv" | "xlsx" | "ofx" | "manual" | "ai" | "sync";

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
    ...timestamps,
  },
  (t) => [
    uniqueIndex("transactions_account_dedupe_idx").on(t.accountId, t.dedupeHash),
    index("transactions_user_date_idx").on(t.userId, t.date),
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
