import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { Banknote, Upload, ChevronRight } from "lucide-react";
import { canEditBudget, canViewBudget } from "@/lib/budget/people";
import {
  getBankAccounts,
  getBankTransactions,
  getBudgetGrid,
  getFiscalYears,
  getReconciliationHealth,
} from "@/lib/budget/queries";
import {
  BANK_TXN_CLASSIFICATIONS,
  type BankTxnClassification,
} from "@/lib/db/schema";
import { CLASSIFICATION_LABELS } from "@/lib/budget/classify";
import {
  BudgetTabs,
  BudgetYearSwitcher,
  parseYearParam,
} from "../../BudgetNav";

export const metadata = { title: "Bank Ledger — Heritage Lab" };

const CLASS_STYLE: Record<BankTxnClassification, string> = {
  unclassified: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  direct_expense: "bg-hl-cream text-hl-ink ring-1 ring-hl-border",
  er_reimbursement: "bg-blue-50 text-blue-800 ring-1 ring-blue-200",
  grant_receipt: "bg-hl-green-50 text-hl-green-700 ring-1 ring-hl-green-600/20",
  fee: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
  transfer_fee: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
  reversal: "bg-purple-50 text-purple-800 ring-1 ring-purple-200",
  internal_transfer: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
  ignore: "bg-hl-cream text-hl-muted ring-1 ring-hl-border",
};

function isClassification(v: string | undefined): v is BankTxnClassification {
  return !!v && (BANK_TXN_CLASSIFICATIONS as readonly string[]).includes(v);
}

export default async function BankListPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ classification?: string; account?: string; q?: string }>;
}) {
  const session = await auth();
  if (!canViewBudget(session?.user?.email)) notFound();

  const { year: yearParam } = await params;
  const {
    classification: rawClass,
    account: accountFilter,
    q,
  } = await searchParams;
  const year = parseYearParam(yearParam);
  if (year === null) notFound();

  const classification = isClassification(rawClass) ? rawClass : undefined;
  const editable = canEditBudget(session?.user?.email);

  const [allYears, accounts, health, txns, grid] = await Promise.all([
    getFiscalYears(),
    getBankAccounts(),
    getReconciliationHealth(year),
    getBankTransactions({
      year,
      classification,
      accountId: accountFilter,
      search: q,
    }, 500),
    getBudgetGrid(year),
  ]);
  const availableYears = allYears.map((y) => y.year);

  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const lineCodeById = new Map(
    (grid?.categories ?? []).flatMap((c) => c.lines.map((l) => [l.id, l.fullCode])),
  );

  const summary = summariseHealth(health);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight text-hl-ink">
            <Banknote className="h-7 w-7 text-hl-green-600" />
            Bank Ledger — {year}
          </h1>
          <p className="mt-1 text-sm text-hl-muted">
            {accounts.length === 0
              ? "No accounts yet — import your first TD CSV to seed the ledger."
              : `Every transaction across ${accounts.length} account${accounts.length === 1 ? "" : "s"} in ${year}. Filter by classification to work through reconciliation.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BudgetYearSwitcher
            year={year}
            availableYears={availableYears}
            subPath="/bank"
          />
          {editable ? (
            <Link href={`/budget/${year}/bank/import`} className="hl-btn-primary">
              <Upload className="h-4 w-4" /> Import CSV
            </Link>
          ) : null}
        </div>
      </div>

      <BudgetTabs year={year} active="bank" />

      <section className="hl-card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-hl-muted">
          Reconciliation health
        </h2>
        {summary.length === 0 ? (
          <p className="mt-2 text-sm text-hl-muted">
            No transactions imported for {year} yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {summary.map(([c, n]) => (
              <li key={c}>
                <Link
                  href={{
                    pathname: `/budget/${year}/bank`,
                    query: classification === c ? {} : { classification: c },
                  }}
                  className={`hl-badge ${CLASS_STYLE[c]} ${classification === c ? "ring-2 ring-hl-green-600" : ""}`}
                >
                  {CLASSIFICATION_LABELS[c]} · {n}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hl-card overflow-hidden">
        <form
          method="get"
          className="flex flex-wrap items-center gap-2 border-b border-hl-border bg-hl-cream/60 px-4 py-3"
        >
          {classification ? (
            <input type="hidden" name="classification" value={classification} />
          ) : null}
          <select
            name="account"
            defaultValue={accountFilter ?? ""}
            className="hl-input w-auto"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search description…"
            className="hl-input w-64"
          />
          <button type="submit" className="hl-btn-secondary">
            Filter
          </button>
          {(classification || accountFilter || q) && (
            <Link href={`/budget/${year}/bank`} className="hl-btn-ghost">
              Reset
            </Link>
          )}
        </form>

        {txns.length === 0 ? (
          <div className="p-6 text-sm text-hl-muted">
            No transactions match. Adjust the filters above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hl-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Description</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Balance</th>
                  <th>Class</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap tabular-nums">{t.txnDate}</td>
                    <td className="whitespace-nowrap text-hl-muted">
                      {accountsById.get(t.accountId)?.name ?? "—"}
                    </td>
                    <td className="max-w-xs truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="text-right tabular-nums text-red-700">
                      {t.debit ? formatCad(Number(t.debit)) : ""}
                    </td>
                    <td className="text-right tabular-nums text-hl-green-700">
                      {t.credit ? formatCad(Number(t.credit)) : ""}
                    </td>
                    <td className="text-right tabular-nums text-hl-muted">
                      {t.runningBalance ? formatCad(Number(t.runningBalance)) : ""}
                    </td>
                    <td>
                      <span
                        className={`hl-badge ${CLASS_STYLE[t.classification as BankTxnClassification] ?? CLASS_STYLE.unclassified}`}
                      >
                        {CLASSIFICATION_LABELS[t.classification as BankTxnClassification] ?? t.classification}
                      </span>
                      {t.classification === "unclassified" && t.budgetLineId ? (
                        <span
                          className="hl-badge ml-1 bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                          title={t.note ?? "Budget line guessed, not yet confirmed"}
                        >
                          Guess: {lineCodeById.get(t.budgetLineId) ?? "?"}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {editable ? (
                        <Link
                          href={`/budget/${year}/bank/${t.id}`}
                          className="hl-btn-ghost"
                          aria-label={`Classify transaction on ${t.txnDate}`}
                        >
                          Classify <ChevronRight className="h-4 w-4" />
                        </Link>
                      ) : (
                        <Link
                          href={`/budget/${year}/bank/${t.id}`}
                          className="hl-btn-ghost"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-hl-muted">
        Showing up to 500 rows per query. Refine filters if you have a bigger
        ledger — pagination will land in a later polish pass.
      </p>
    </div>
  );
}

function summariseHealth(
  rows: Array<{ classification: BankTxnClassification; count: number }>,
): [BankTxnClassification, number][] {
  const map = new Map(rows.map((r) => [r.classification, r.count]));
  return (BANK_TXN_CLASSIFICATIONS as readonly BankTxnClassification[])
    .map((c) => [c, map.get(c) ?? 0] as [BankTxnClassification, number])
    .filter(([, n]) => n > 0);
}

function formatCad(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  });
}
