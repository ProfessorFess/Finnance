"use client";

import type { ColumnMapping } from "@/server/import/types";

const DATE_FORMATS = ["YYYY-MM-DD", "MM/DD/YYYY", "M/D/YYYY", "DD/MM/YYYY"] as const;
type Style = ColumnMapping["amount"]["kind"];

const selectClass = "h-8 w-full rounded-lg border border-input bg-background px-2 text-sm";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

/** Lets the user say which column is which for a layout Finnance doesn't recognize. */
export function MappingEditor({
  idPrefix,
  headers,
  mapping,
  onChange,
}: {
  idPrefix: string;
  headers: string[];
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
}) {
  const options = headers.map((h) => (
    <option key={h} value={h}>
      {h}
    </option>
  ));
  const col = (k: string) => `${idPrefix}-${k}`;
  const amount = mapping.amount;

  const setStyle = (kind: Style) => {
    const first = headers[0] ?? "";
    if (kind === "signed") onChange({ ...mapping, amount: { kind, column: "column" in amount ? amount.column : first } });
    if (kind === "indicator")
      onChange({ ...mapping, amount: { kind, column: "column" in amount ? amount.column : first, indicatorColumn: first, debitValues: ["Debit"] } });
    if (kind === "split") onChange({ ...mapping, amount: { kind, debitColumn: first, creditColumn: headers[1] ?? first } });
  };

  return (
    <fieldset className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Which column is which?</legend>
      <Field id={col("date")} label="Date column">
        <select id={col("date")} className={selectClass} value={mapping.date.column}
          onChange={(e) => onChange({ ...mapping, date: { ...mapping.date, column: e.target.value } })}>
          {options}
        </select>
      </Field>
      <Field id={col("format")} label="Date format">
        <select id={col("format")} className={selectClass} value={mapping.date.format}
          onChange={(e) => onChange({ ...mapping, date: { ...mapping.date, format: e.target.value as (typeof DATE_FORMATS)[number] } })}>
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>
      <Field id={col("desc")} label="Description column">
        <select id={col("desc")} className={selectClass} value={mapping.description}
          onChange={(e) => onChange({ ...mapping, description: e.target.value })}>
          {options}
        </select>
      </Field>
      <Field id={col("style")} label="Amount style">
        <select id={col("style")} className={selectClass} value={amount.kind} onChange={(e) => setStyle(e.target.value as Style)}>
          <option value="signed">One column (negative = money out)</option>
          <option value="indicator">Amount + debit/credit column</option>
          <option value="split">Separate debit and credit columns</option>
        </select>
      </Field>
      {amount.kind !== "split" && (
        <Field id={col("amount")} label="Amount column">
          <select id={col("amount")} className={selectClass} value={amount.column}
            onChange={(e) => onChange({ ...mapping, amount: { ...amount, column: e.target.value } })}>
            {options}
          </select>
        </Field>
      )}
      {amount.kind === "signed" && (
        <label className="flex items-center gap-2 self-end pb-1 text-sm">
          <input type="checkbox" checked={amount.invert === true}
            onChange={(e) => onChange({ ...mapping, amount: { ...amount, invert: e.target.checked } })} />
          Spending is shown as positive
        </label>
      )}
      {amount.kind === "indicator" && (
        <Field id={col("ind")} label="Debit/credit column">
          <select id={col("ind")} className={selectClass} value={amount.indicatorColumn}
            onChange={(e) => onChange({ ...mapping, amount: { ...amount, indicatorColumn: e.target.value } })}>
            {options}
          </select>
        </Field>
      )}
      {amount.kind === "split" && (
        <>
          <Field id={col("debit")} label="Money out (debit) column">
            <select id={col("debit")} className={selectClass} value={amount.debitColumn}
              onChange={(e) => onChange({ ...mapping, amount: { ...amount, debitColumn: e.target.value } })}>
              {options}
            </select>
          </Field>
          <Field id={col("credit")} label="Money in (credit) column">
            <select id={col("credit")} className={selectClass} value={amount.creditColumn}
              onChange={(e) => onChange({ ...mapping, amount: { ...amount, creditColumn: e.target.value } })}>
              {options}
            </select>
          </Field>
        </>
      )}
    </fieldset>
  );
}

/** A starting point when detection found nothing at all. */
export function blankMapping(headers: string[]): ColumnMapping {
  const first = headers[0] ?? "";
  return {
    date: { column: first, format: "YYYY-MM-DD" },
    description: headers[1] ?? first,
    amount: { kind: "signed", column: headers[2] ?? first },
  };
}
