# Budget & Expense Reports Module — Implementation Plan

> Status: **Draft for Ali's review**. Nothing is built yet. This document exists to be red-lined before code lands.

## 1. Goals

Replace the current Excel-based workflow (`for-test.xlsx`, one-off `ER-XXXX.xlsx` per month, TD CSV downloads) with a Next.js module inside the existing intranet that:

1. Holds a **per-fiscal-year budget** (categories, sub-lines, monthly projections, opening cash balance) — the "summary" view.
2. Tracks **every dollar in and out** through a single reconciled ledger, importing TD CSVs and preserving links to expense reports and grants.
3. Lets Ali submit **monthly expense reports** (multi-line, receipts, budget codes) that Elias approves as a board member.
4. Surfaces **budget-vs-actual**, **grant/contract coverage**, and **cash position** dashboards for oversight.

## 2. Access model

Piggybacks on the existing allowlist + role pattern (`src/lib/allowlist.ts`, `src/lib/roles.ts`) — no new auth system.

| Role | Users (initial) | Capability |
|---|---|---|
| `budget_admin` | `ali@heritagelab.ca` (or the address on file) | Full CRUD: budget, expenses, grants, CSV import, reconciliation, ER submission |
| `budget_viewer` | `elias.moukannas@heritagelab.ca` | Full **read-only** on everything (budget, expenses, bank txns, grants, ERs). Approve/reject ERs submitted by budget admins. |
| (later) board | Anyone in `getBoardMembers()` | Optional read-only summary access — gated off by default |

Implementation: add `src/lib/budget/people.ts` with:

```ts
getBudgetAdmins(): Set<string>       // env BUDGET_ADMIN_EMAILS, defaults to Ali
getBudgetViewers(): Set<string>      // env BUDGET_VIEWER_EMAILS, defaults to Elias
canEditBudget(email): boolean
canViewBudget(email): boolean        // admins ∪ viewers ∪ (optional: board)
canApproveExpenseReport(email, er): boolean
```

Enforced in every server action + Server Component load, following the pattern already used in `src/app/(app)/leave/actions.ts`.

## 3. Data model

New Drizzle tables in `src/lib/db/schema.ts`. All new tables prefixed `budget_` for grouping.

### 3.1 Fiscal years & budget structure

```
budget_fiscal_year
  id                 uuid pk
  year               int   unique         -- 2025, 2026, ...
  opening_balance    numeric(12,2)        -- opening cash Jan 1
  is_locked          boolean default false -- prevents edits once reported to funders
  created_at, updated_at

budget_category                             -- 001..006 per year
  id                 uuid pk
  fiscal_year_id     uuid → budget_fiscal_year
  code               text                  -- "001", "002", ...
  name               text                  -- "Development", "Rentals & misc expenses"
  sort_order         int
  unique(fiscal_year_id, code)

budget_line                                 -- 001-1 ... 006-4 per year
  id                 uuid pk
  category_id        uuid → budget_category
  code               text                  -- "1", "2", ..., stored as sub-code
  full_code          text                  -- "001-4"  (denormalized for search)
  name               text                  -- "Project Management"
  monthly_projected  numeric(12,2)[12]     -- one number per month
  annual_projected   numeric(12,2)         -- computed but stored for perf
  sort_order         int
  unique(category_id, code)
```

**Rationale**: keeping categories & lines as first-class rows (rather than a big JSON blob per year) means SQL can drive the dashboards efficiently, and next year's budget can be cloned from this year's structure in one query.

### 3.2 Revenue side — grants, contracts, donations

```
funding_source                              -- one row per grant / service contract / donation stream
  id                 uuid pk
  fiscal_year_id     uuid → budget_fiscal_year
  name               text                  -- "Kativik Ilisarniliriniq", "ESUMA-AYAGUTA", "MUHC Website Design"
  kind               text                  -- 'grant' | 'service_contract' | 'donation' | 'other'
  contract_value     numeric(12,2)
  currency           text default 'CAD'
  notes              text
  monthly_expected   numeric(12,2)[12]     -- projected receipt schedule (matches the Excel grid rows)
  restrictions       jsonb                 -- future: which categories a grant may fund
```

Received & spent totals are computed from `bank_transaction` (income tagged to source) and `budget_expense` (expenses tagged with `funding_source_id`) — never stored.

### 3.3 Bank ledger — TD imports

```
bank_account
  id                 uuid pk
  name               text                  -- "TD Business Chequing 1234"
  currency           text default 'CAD'

bank_import
  id                 uuid pk
  account_id         uuid → bank_account
  imported_by        text (user email)
  imported_at        timestamptz
  filename           text
  row_count_total    int
  row_count_new      int                   -- after dedupe
  row_count_dupe     int
  period_from, period_to  date

bank_transaction
  id                 uuid pk
  account_id         uuid → bank_account
  import_id          uuid → bank_import
  txn_date           date
  description        text                  -- raw TD string
  debit              numeric(12,2)         -- money out
  credit             numeric(12,2)         -- money in
  running_balance    numeric(12,2)
  dedupe_hash        text unique           -- sha256(account_id + date + desc + debit + credit + balance)
  classification     text                  -- 'unclassified' | 'direct_expense' | 'er_reimbursement'
                                           -- | 'grant_receipt' | 'fee' | 'transfer_fee' | 'reversal' | 'internal_transfer' | 'ignore'
  budget_line_id     uuid null  → budget_line       -- when classification=direct_expense
  funding_source_id  uuid null  → funding_source    -- when classification=grant_receipt (or expense tagged to project)
  expense_report_id  uuid null  → expense_report    -- when classification=er_reimbursement
  reversed_by_txn_id uuid null  → bank_transaction  -- for reversal pairs
  note               text
  classified_by      text, classified_at timestamptz
```

**Dedupe strategy**: `dedupe_hash` unique constraint. Re-importing an overlapping period is safe — dupes are silently skipped and counted.

**Auto-classification rules** applied at import time (before human review):

| Regex on description | Auto-classify | Auto-tag |
|---|---|---|
| `^SEND E-TFR FEE`, `^REVERSE E-TFR FEE` | `fee` / `transfer_fee` | `005-1 Bank fees` |
| `^MONTHLY PLAN FEE`, `^SERVICE CHARGE`, `^OVERDRAFT INTEREST`, `^ACCT BAL REBATE` | `fee` | `005-1` |
| `^REV E-TFR` | `reversal` | link to prior E-TFR by amount + date proximity, propose |
| Everything else | `unclassified` | requires human review |

### 3.4 Expense reports (ER-XXXX)

```
expense_report
  id                 uuid pk
  report_number      text unique           -- "ER-0020" — sequential, auto-generated
  fiscal_year_id     uuid → budget_fiscal_year
  submitter_user_id  text → user.id
  submitter_email    text
  submitter_name     text
  approver_email     text                  -- snapshot; usually Elias
  period_from        date
  period_to          date
  business_purpose   text
  status             text                  -- 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'cancelled'
  submitted_at       timestamptz
  decided_at         timestamptz
  decided_by         text
  decision_note      text
  cash_advance       numeric(12,2) default 0
  linked_bank_txn_id uuid null → bank_transaction  -- set on 'paid'
  paid_at            timestamptz
  pdf_key            text                  -- Vercel Blob key for generated ER PDF
  email_message_id, email_error            -- for the notification trail (mirrors leave/travel-claims)
  created_at, updated_at

expense_report_line
  id                 uuid pk
  report_id          uuid → expense_report
  line_date          date
  description        text
  category_id        uuid → budget_category   -- from the "category picker"
  budget_line_id     uuid → budget_line       -- from the sub-line dropdown
  funding_source_id  uuid null → funding_source
  cost               numeric(12,2)
  receipt_key        text null             -- Vercel Blob key for the receipt file
  sort_order         int
```

**On category / sub-line picking** (your answer to Q1): the ER form shows a Category dropdown (`003 – PR & Travel`); picking one filters the Sub-line dropdown to just that category's lines (`003-1`, `003-2`, `003-3`). Sub-line is required. This satisfies both the current ER template shape and the finer granularity your Expenses sheet actually uses.

### 3.5 Direct-tagged expenses (non-ER)

Not a separate table — a `bank_transaction` with `classification='direct_expense'` **is** the expense record. `budget_line_id` and `funding_source_id` on the txn row are the tags. This keeps a single source of truth: the bank ledger.

A **view** (`budget_expense_v`) unions:
- `bank_transaction` rows where `classification = 'direct_expense'` (contractor payments, legal fees, salaries paid directly)
- `expense_report_line` rows where `expense_report.status = 'paid'` (line items inside a reimbursed ER)

Every row in this view has `(date, budget_line_id, funding_source_id, amount)` — this is what every dashboard queries. **No double-counting is possible** because an ER's bank transaction has `classification='er_reimbursement'` and is deliberately excluded from the view.

## 4. Route structure

Mirrors the existing `src/app/(app)/<module>/` convention (see `travel-claims/`, `leave/`).

```
src/app/(app)/budget/
  page.tsx                          -- year picker + overview dashboard (budget vs actual, cash position)
  [year]/
    page.tsx                        -- same overview scoped to a specific year
    budget/page.tsx                 -- editable budget grid (admin) / read-only (viewer)
    grants/page.tsx                 -- funding sources list + coverage view
    grants/[id]/page.tsx            -- one grant: contract value, received, expected, spend
    expenses/page.tsx               -- unified expense ledger (bank + ER lines), filterable
    bank/page.tsx                   -- bank transactions list, filter unclassified
    bank/import/page.tsx            -- CSV drop zone
    bank/[txnId]/page.tsx           -- classify one transaction
    reports/
      page.tsx                      -- list ERs (own + all, depending on role)
      new/page.tsx                  -- submit new ER
      [reportNumber]/page.tsx       -- detail + approve/reject (Elias) + PDF download
      [reportNumber]/edit/page.tsx  -- edit draft
```

Nav entry added to `src/components/AppShell.tsx`:

```
{ href: "/budget", label: "Budget", icon: Wallet, roleGated: canViewBudget }
```

## 5. TD CSV import flow

1. Ali visits `/budget/2026/bank/import`, drops `accountactivity.csv`.
2. Server action:
   1. Detects the TD header-less format (5 columns: date, desc, debit, credit, balance). Rejects if it doesn't match.
   2. Parses `MM/DD/YYYY` dates, coerces empty strings to `null`, parses numbers.
   3. Computes `dedupe_hash` for each row.
   4. Inserts new rows (skips existing by unique constraint), records counts.
   5. Runs auto-classification pass (fees + reversals).
3. Redirects to `/budget/2026/bank?status=unclassified` — Ali sees the fresh rows needing review.
4. For each unclassified row, one-click classify:
   - **Direct expense**: pick category → sub-line → optional project → save.
   - **Grant receipt**: pick funding source.
   - **ER reimbursement**: search / pick from approved-but-unpaid ERs where subtotal ≈ this debit → sets ER to `paid`, txn to `er_reimbursement`.
   - **Reversal**: propose the original E-TFR to pair with; on confirm, marks the original as reversed (subtracts from spend-to-date).
   - **Internal transfer / ignore**: excludes from all dashboards.

Later: **rules engine** — save a classification as a rule (regex + amount range → auto-tag), then re-runs against unclassified rows.

## 6. Expense report submission → approval → paid

```
draft            (Ali is editing)
  → submitted    (Ali submits; Elias notified via magic-link email)
  → approved     (Elias approves; Ali notified; PDF generated & stored)
    or rejected  (Elias rejects with note; back to Ali to edit)
  → paid         (Ali imports next TD CSV; matches the lump-sum e-transfer to this ER)
```

Reuses:
- `@react-pdf/renderer` (already in the stack) to render the ER PDF matching the current Excel template layout.
- Resend + `renderMagicLinkEmail`-style templates for notifications.
- Vercel Blob for receipt storage (currently on the roadmap, would land now as part of this feature).

Constraints:
- Only the submitter can edit a `draft` or `rejected` ER.
- Only `canApproveExpenseReport` (Elias + budget admins other than the submitter) can approve/reject.
- Once `paid`, no edits — only cancellation with reason, which unlinks the bank txn and puts it back in `unclassified`.

## 7. Reconciliation flow (the critical invariant)

Restated:

> Every dollar leaving the bank appears exactly **once** in spend-to-date per budget line, either as a direct-tagged bank transaction or as an ER line whose parent ER is `paid` and linked to a bank transaction that is itself tagged `er_reimbursement` (and therefore excluded from spend).

Enforced by:
- The `budget_expense_v` view definition (unions direct expenses + paid-ER lines only).
- A CHECK-style safeguard in the server action that classifies an `er_reimbursement`: the sum of the ER's lines must match the bank debit ± $0.01, or Ali must explicitly override with a note.
- A dashboard row **"Reconciliation health"** that shows: unclassified bank rows, approved-but-unpaid ERs, and paid ERs whose subtotal doesn't match their linked bank txn.

## 8. Dashboards

All computed from `budget_expense_v` + `bank_transaction` + `funding_source`.

### `/budget/[year]` overview
- **Cash position**: opening balance, current balance (from latest bank txn), YTD in, YTD out.
- **Budget vs Actual table**: one row per category, expandable to sub-lines. Columns: projected annual, spent YTD, remaining, % consumed. Colour-coded when >90%.
- **Monthly cash flow chart**: projected vs actual receipts & disbursements per month.

### `/budget/[year]/grants`
- Table of funding sources with columns: contract value, received to date, expected remaining, spend-to-date (from tagged expenses), coverage ratio.
- Drill-down to see all txns/ER lines attributed to a grant — the "where did ESUMA money go" view.

### `/budget/[year]/expenses`
- Unified ledger, filterable by date, category, sub-line, funding source, type (direct vs ER).
- CSV export.

### `/budget/[year]/reports`
- ERs list with status, subtotal, approver, paid date. Approver view highlights `submitted` awaiting decision.

## 9. Historical seed (per your answer)

**Import all of Feb 2025 → Jun 2026 as a one-time script.**

Plan:

1. Create `scripts/seed-budget.ts` (following `scripts/verify-leave.ts` style).
2. It reads:
   - `for-test.xlsx` → `Budget 2026` sheet → seeds `budget_fiscal_year` (2026) + categories + lines + monthly projections + funding sources with schedules.
   - `for-test.xlsx` → `Expenses` sheet → seeds historical `budget_expense` rows tagged with budget line + project. Since these are already reconciled in Excel, they enter as `direct_expense` bank txns OR as historical ER lines (heuristic: if description matches an ER-0001..ER-0019 pattern, group them; otherwise treat as direct expense).
   - `accountactivity.csv` → seeds `bank_transaction` rows for 2025 forward. For rows that correspond to an already-imported historical expense, we set classification + link.
3. It emits a **seed reconciliation report** (Markdown) showing every ambiguity for Ali to hand-fix in the UI — realistic expectation: 80% auto-classified, 20% needs review.
4. Also seed **Budget 2025** with a stub year & opening balance so 2025 dashboards work (even if projections aren't backfilled).

Since the fiscal year 2025 budget grid isn't in `for-test.xlsx`, we either (a) manually enter 2025 projections after cutover, or (b) skip projections for 2025 and only backfill actuals. Recommend (b) — the value of the module is going forward, not re-litigating 2025's projected numbers.

## 10. Phased build plan

Each phase is independently shippable. Approval gate between each.

### Phase 1 — foundation ✅ shipped
- ✅ `BUDGET_ADMIN_EMAILS` / `BUDGET_VIEWER_EMAILS` env vars & `budget/people.ts` role helpers.
- ✅ `budget_fiscal_year`, `budget_category`, `budget_line` schemas + migration.
- ✅ Read-only budget grid at `/budget/[year]/budget` for Ali & Elias.
- ✅ `scripts/seed-budget.ts` seeds the 2026 baseline from `for-test.xlsx`.

### Phase 2 — funding sources ✅ shipped
- ✅ `funding_source` schema (with `allowed_category_codes` for per-funder restrictions).
- ✅ Grants list at `/budget/[year]/grants` with coverage cards (contract, received, spent, remaining).
- ✅ Detail page `/budget/[year]/grants/[id]` with schedule + restrictions.
- ✅ Full CRUD form at `/budget/[year]/grants/new` and `.../edit`, shared `FundingSourceForm` client component.
- ✅ Revenue table shown above the disbursements grid on `/budget/[year]/budget`.
- ✅ 2026 funding sources seeded from the Budget sheet's Cash Inflows section (Kativik, ESUMA, ANICINABE-MINWASHIN, Sec. affaires Autochtones, Qarjuit).
- ⏭ Category restrictions **modelled** but Ali still has to fill in per-funder rules via the edit UI (Excel doesn't say what each grant permits). Warnings when tagging expenses land in Phase 4.

### Phase 3 — bank ledger + CSV import ✅ shipped
- ✅ `bank_account`, `bank_import`, `bank_transaction` schemas (multi-account from day 1; `dedupe_hash` unique constraint for idempotent re-imports).
- ✅ TD CSV parser in `src/lib/budget/csv.ts` — headerless 5-column format, MM/DD/YYYY dates, quoted-field-safe splitter, per-row sha256 dedupe hash.
- ✅ Auto-classifier in `src/lib/budget/classify.ts` — fees, monthly plan, service charges, overdraft interest, rebates all auto-tag to `005-1`; reversals flagged for pairing.
- ✅ Upload page `/budget/[year]/bank/import` — creates a new account on first import if none exist, otherwise picks from existing.
- ✅ List page `/budget/[year]/bank` — filter by classification, account, and description search. Reconciliation health chips at the top.
- ✅ Per-txn classify page `/budget/[year]/bank/[txnId]` — radio buttons for classification with debit/credit-aware enabling, budget-line + funding-source dropdowns, reversal pairing helper with 30-day / matching-amount candidates.
- ✅ Overview page `/budget/[year]` with cash-position card (opening / YTD credits / YTD debits / current balance from latest running balance across all accounts) and a reconciliation-health alert.
- ✅ Opening-balance form on overview so Ali can set it any time (nullable — no need to know it up front).

**Ship criterion (Phase 3, met)**: Ali drops `accountactivity.csv`, sees all 656 rows (with fees auto-tagged), classifies contractor payments to budget lines, and the "Current balance" tile on the overview reflects the latest running balance.

### Phase 4 — expense reports ✅ shipped
- ✅ `expense_report` + `expense_report_line` schemas. Report numbering continues Ali's sequence (starts at `ER-0021` — allocated from `MAX(report_number) + 1` with the unique constraint as safety net).
- ✅ Status machine `draft → submitted → approved → paid` (plus `rejected → draft` for revisions, and `cancelled` from any state). Transitions enforced server-side in `canTransition()` per role (submitter / approver / system).
- ✅ Shared `ExpenseReportForm` client component — dynamic line rows with category → line drilldown, optional funding source per line, per-line receipt upload, live total.
- ✅ Submit → auto-emails approver (Elias) with the ER PDF attached; PDF embeds any receipts via `pdf-lib`.
- ✅ Approve / Reject inline forms on the ER detail page. Approver dispatches Resend email back to submitter (rejected note is required; sends the ER back to `draft` for editing).
- ✅ Receipts persisted to **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`). Graceful degradation when the token is unset — submissions still succeed, receipts land in the immediate email PDF but aren't re-downloadable.
- ✅ ER-to-bank linking in the classify flow: tagging a debit as `er_reimbursement` picks an approved-but-unpaid ER whose total matches the debit; on save the txn tags the ER and flips it to `paid` inside one transaction.
- ✅ Cancellation unlinks any paid bank txn (back to `unclassified`) so nothing double-counts.
- ✅ On-demand `/budget/[year]/reports/[id]/pdf` route re-renders the PDF with the latest state + receipts, honouring the `canViewBudget` guard.
- ✅ Pending-approval pill on the overview page for anyone in `BUDGET_VIEWER_EMAILS` + board members; Elias sees a blue "N reports awaiting your approval" callout above the fold.
- ✅ Spend-to-date on funding sources now includes paid ER lines *and* direct bank debits (the reconciliation invariant — one dollar, one destination — is preserved because ER reimbursement bank rows are classified separately and don't add to any budget line themselves).

**Ship criterion (met)**: Ali submits an ER, receives an email at `ali.mehdi@…` copying `elias.moukannas@…` with the PDF attached; Elias visits the linked page, approves, submitter is emailed the decision; Ali imports the reimbursement CSV row, picks the ER in the classify dropdown; ER flips to Paid and its lines feed budget/grant spend-to-date.

### Phase 5 — dashboards & reconciliation health
- Budget vs Actual with drill-down.
- Grant coverage with drill-down.
- Reconciliation health tile.
- ✅ **Unified expense ledger + CSV export** (Phase 5a — shipped).
- ✅ **Split bank transactions** (Phase 5b — shipped). One bank debit can
  be allocated to N budget lines each with its own amount, funding source,
  and description. Sum-of-splits must equal the parent's debit; parent's
  own budget-line/funding-source fields are nulled when splits govern.
  The unified ledger renders one row per split.
- ✅ **Editable & deletable manual entries** (Phase 5b — shipped). Rows
  imported from Ali's Excel (in the synthetic "Manual entries" account)
  expose full edit/delete on the bank detail page. Real TD rows stay
  frozen — the audit trail can only be extended, not rewritten.
- ✅ **Delete funding source** (Phase 5b — shipped). Two-step confirmation;
  bank txns and splits unlink cleanly, ER lines keep the source name.
- ✅ **Per-category $ caps on funding sources** (Phase 5b — shipped).
  Replaces the plain `allowedCategoryCodes: text[]` with
  `categoryCaps: jsonb` — `[{ code, cap: number|null }, …]`. Backfill
  script (`npm run backfill:caps`) migrates existing rows; the legacy
  text array is written in sync for a smooth deprecation.
- ✅ **Unclassified debits show in the Expenses ledger, grayed** (Phase
  5b — shipped). Everything on the bank statement is visible in one
  place; pending rows link straight to the classify page.
  - `/budget/[year]/expenses` merges paid ER lines with `direct_expense` bank
    txns into one flat table (mirrors the "Expenses" sheet in `for-test.xlsx`).
  - Filters: month strip, category, budget line, funding source, source-type,
    description search. All state lives in the URL.
  - `GET /budget/[year]/expenses/export` returns a CSV that honours the same
    filter set, with columns Date · Description · Budget code · Budget line ·
    Category · Funding source · Cost · Source · Source detail.
  - `scripts/import-td-csv.ts` (npm run `import:td-csv`) imports a TD account
    activity CSV from the CLI, reusing the same parser, dedupe hash, and
    auto-classifier as the web upload path. Initial cutover: 657 rows
    imported, 224 auto-classified.

### Phase 6 — historical seed
- `scripts/seed-budget.ts`.
- Run once, produce reconciliation report, Ali hand-fixes ambiguities.

### Phase 7 — polish (nice-to-haves, do only if needed)
- Rules engine for auto-classification.
- Burn alerts (`>90%` of a line consumed).
- Restricted-fund enforcement.
- Period-close / lock.
- Board read-only summary.

## 11. Resolved decisions

1. **TD account & opening balance for 2026** — Ali unsure, and has **two TD accounts**, so:
   - `budget_fiscal_year.opening_balance` is **nullable** in Phase 1 — set later when known.
   - The `bank_account` table (Phase 3) supports **multiple accounts** from the start. Cash-position dashboards will sum across accounts, and the opening-balance field becomes primarily for reference (actual current balance is derived from bank txns).
2. **ER numbering** — continues from `ER-0021` (August 2026 is next). The `expense_report.report_number` sequence in Phase 4 will be seeded to start at 21.
3. **Ali's canonical email** — `ali.mehdi@heritagelab.ca`. Default for `BUDGET_ADMIN_EMAILS`. `BUDGET_VIEWER_EMAILS` defaults to `elias.moukannas@heritagelab.ca` (matches existing board list).
4. **Receipt storage** — `@vercel/blob` shipped with Phase 4. When `BLOB_READ_WRITE_TOKEN` is unset, ERs still submit and PDFs still include the receipts inline, but nothing persists — the token needs to be added in `.env.local` and on Vercel for receipts to survive past the notification email.
5. **Grant restrictions** — Grants restrict which categories they can fund → **moved into Phase 2** (not deferred). `funding_source` gets an `allowed_category_codes text[]` field (empty array = no restriction). The classification UI in Phase 3 and ER lines in Phase 4 will warn if you tag an expense with a grant whose restrictions don't cover that category.

## 12. Explicit non-goals (what this module will NOT do)

- Double-entry bookkeeping / GL. This is a **budget tracking + reconciliation** layer, not accounting software. Your accountant's tool of choice remains the source of truth for financial statements & tax filings.
- Payroll processing (Nethris stays).
- Invoicing customers / issuing tax receipts for donations.
- Multi-currency.
- Direct bank API integration — TD CSV drop only, at least until Phase 7.
- Anything the language committee needs — that's a separate module (previous conversation).

---

### Sign-off

Ali — read through, mark up (comments in this file, or inline replies in chat). Once Phases 1–6 are approved I'll build Phase 1 as the first PR. Nothing goes into `schema.ts` until you say so.
