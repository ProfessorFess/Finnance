import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/empty-state";
import { AddRuleForm } from "@/components/rules/add-rule-form";
import { RuleList } from "@/components/rules/rule-list";
import { requireUser } from "@/server/auth/session";
import { listRules } from "@/server/categorize/rules-service";
import { getDb } from "@/server/db/client";
import { listCategories } from "@/server/finance/categories";

export const metadata = { title: "Rules · Finnance" };

export default async function RulesPage() {
  const user = await requireUser();
  const db = getDb();
  const [rules, categories] = await Promise.all([listRules(db, user.id), listCategories(db, user.id)]);
  const view = rules.map((r) => ({ id: r.id, matchType: r.matchType, pattern: r.pattern, categoryName: r.categoryName, createdFrom: r.createdFrom }));

  return (
    <div className="rise">
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Settings
      </Link>
      <PageHeader title="Rules" description="Finnance checks these first, before your past choices or AI." />
      <AddRuleForm categories={categories.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName }))} />
      <RuleList title="Your rules" rules={view.filter((r) => r.createdFrom !== "default")} empty="No rules of your own yet. Add one above, or correct a merchant twice and Finnance will learn it." />
      <RuleList title="Built-in" rules={view.filter((r) => r.createdFrom === "default")} empty="You've removed all the built-in rules." />
    </div>
  );
}
