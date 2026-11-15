import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createTestUser } from "@/test/users";
import { DEFAULT_CATEGORIES, ensureDefaultCategories, listCategories } from "./categories";

let t: Awaited<ReturnType<typeof createTestDb>>;
let A: string;
let B: string;

beforeEach(async () => {
  t = await createTestDb();
  A = (await createTestUser(t.db)).id;
  B = (await createTestUser(t.db)).id;
});
afterEach(async () => {
  await t.close();
});

it("seeds the default categories once", async () => {
  await ensureDefaultCategories(t.db, A);
  await ensureDefaultCategories(t.db, A);
  const cats = await listCategories(t.db, A);
  expect(cats).toHaveLength(DEFAULT_CATEGORIES.length);
  expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining(["Coffee", "Restaurants", "Bars", "Shopping", "Transfer"]));
  expect(cats.find((c) => c.name === "Savings")!.kind).toBe("transfer");
  expect(cats[0]!.groupName).toBe("Income");
});

it("isolates users", async () => {
  await listCategories(t.db, A);
  expect((await listCategories(t.db, B)).every((c) => c.userId === B)).toBe(true);
});
