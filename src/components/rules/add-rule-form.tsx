"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addRule } from "@/app/(app)/settings/rules/actions";
import { type CategoryOption, CategoryOptions } from "@/components/transactions/category-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AddRuleForm({ categories }: { categories: CategoryOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs">
      <h2 className="font-semibold">Add a rule</h2>
      <p className="mt-1 text-sm text-muted-foreground">Any transaction whose merchant or description contains this text goes to the category.</p>
      <form
        ref={formRef}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        action={(formData) =>
          startTransition(async () => {
            const res = await addRule(formData);
            if ("error" in res) return setError(res.error);
            setError(null);
            formRef.current?.reset();
            toast.success(`Rule added. Updated ${res.applied} ${res.applied === 1 ? "transaction" : "transactions"}.`);
          })
        }
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="rule-pattern">Merchant or text</Label>
          <Input id="rule-pattern" name="pattern" required placeholder="e.g. bennu" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-category">Category</Label>
          <select id="rule-category" name="categoryId" required defaultValue="" className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
            <option value="" disabled>
              Choose…
            </option>
            <CategoryOptions categories={categories} />
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          Add rule
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
