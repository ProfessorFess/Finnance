import { asc, eq } from "drizzle-orm";
import { type CategoryKind, categories } from "@/server/db/schema";
import type { Database } from "@/server/db/types";

export type Category = typeof categories.$inferSelect;

/** Starting categories for every user, in display order. All editable later. */
export const DEFAULT_CATEGORIES: { name: string; group: string; kind: CategoryKind; icon: string }[] = [
  { name: "Paycheck", group: "Income", kind: "income", icon: "banknote" },
  { name: "Interest", group: "Income", kind: "income", icon: "percent" },
  { name: "Refunds", group: "Income", kind: "income", icon: "undo-2" },
  { name: "Other income", group: "Income", kind: "income", icon: "plus-circle" },
  { name: "Rent & housing", group: "Essentials", kind: "expense", icon: "house" },
  { name: "Utilities", group: "Essentials", kind: "expense", icon: "plug" },
  { name: "Phone", group: "Essentials", kind: "expense", icon: "smartphone" },
  { name: "Groceries", group: "Essentials", kind: "expense", icon: "shopping-basket" },
  { name: "Gas & fuel", group: "Essentials", kind: "expense", icon: "fuel" },
  { name: "Insurance", group: "Essentials", kind: "expense", icon: "shield" },
  { name: "Health", group: "Essentials", kind: "expense", icon: "heart-pulse" },
  { name: "Personal care", group: "Essentials", kind: "expense", icon: "scissors" },
  { name: "Coffee", group: "Lifestyle", kind: "expense", icon: "coffee" },
  { name: "Restaurants", group: "Lifestyle", kind: "expense", icon: "utensils" },
  { name: "Bars", group: "Lifestyle", kind: "expense", icon: "beer" },
  { name: "Shopping", group: "Lifestyle", kind: "expense", icon: "shopping-bag" },
  { name: "Entertainment", group: "Lifestyle", kind: "expense", icon: "clapperboard" },
  { name: "Subscriptions", group: "Lifestyle", kind: "expense", icon: "repeat" },
  { name: "Travel", group: "Lifestyle", kind: "expense", icon: "plane" },
  { name: "Rideshare & transit", group: "Lifestyle", kind: "expense", icon: "car" },
  { name: "Gifts", group: "Lifestyle", kind: "expense", icon: "gift" },
  { name: "Savings", group: "Savings", kind: "transfer", icon: "piggy-bank" },
  { name: "Investing", group: "Savings", kind: "transfer", icon: "trending-up" },
  { name: "Transfer", group: "Transfers", kind: "transfer", icon: "arrow-left-right" },
  { name: "Credit card payment", group: "Transfers", kind: "transfer", icon: "credit-card" },
  { name: "Fees", group: "Other", kind: "expense", icon: "receipt" },
  { name: "Cash", group: "Other", kind: "expense", icon: "wallet" },
  { name: "Other", group: "Other", kind: "expense", icon: "circle-help" },
];

/** Adds any missing default categories for the user (safe to call repeatedly). */
export async function ensureDefaultCategories(db: Database, userId: string): Promise<void> {
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((c, i) => ({
        userId,
        name: c.name,
        groupName: c.group,
        kind: c.kind,
        icon: c.icon,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: [categories.userId, categories.name] });
}

/** The user's categories in display order (seeding defaults on first use). */
export async function listCategories(db: Database, userId: string): Promise<Category[]> {
  await ensureDefaultCategories(db, userId);
  return db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.sortOrder), asc(categories.name));
}
