import { createHash } from "node:crypto";

/**
 * Parser for TD Business chequing CSV exports.
 *
 * TD's format has NO header row. Five columns, always in the same order:
 *
 *   0: transaction date        MM/DD/YYYY
 *   1: description             raw string, may contain commas but is usually
 *                              a single tidy phrase like "SEND E-TFR *WUa SALA"
 *   2: debit                   money out (positive number), or blank
 *   3: credit                  money in  (positive number), or blank
 *   4: running balance         after this txn, blank on the very first row of
 *                              a brand-new statement window
 *
 * The parser is intentionally minimal — it handles the shape TD exports and
 * rejects anything else with a specific error, so a user who accidentally
 * uploads a QuickBooks or Wise CSV gets told rather than silently mis-imported.
 */

export type ParsedTdRow = {
  txnDate: string; // ISO yyyy-mm-dd
  description: string;
  debit: string | null; // decimal string with 2 places
  credit: string | null;
  runningBalance: string | null;
  dedupeHash: string; // sha256(account + fields)
  lineNumber: number; // 1-based, for error messages
};

export type ParseResult =
  | { ok: true; rows: ParsedTdRow[] }
  | { ok: false; error: string; lineNumber?: number };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a TD CSV buffer for one bank account. Returns rows or an error. */
export function parseTdCsv(text: string, accountId: string): ParseResult {
  const raw = text.replace(/^\uFEFF/, ""); // strip BOM if present
  const lines = raw
    .split(/\r?\n/)
    .map((l, i) => ({ i: i + 1, l }))
    .filter(({ l }) => l.trim().length > 0);

  if (lines.length === 0) return { ok: false, error: "The file is empty." };

  const rows: ParsedTdRow[] = [];
  for (const { i, l } of lines) {
    const cols = splitCsvLine(l);
    if (cols.length !== 5) {
      return {
        ok: false,
        error: `Expected 5 columns (date, description, debit, credit, balance), got ${cols.length}. Is this a TD account activity CSV?`,
        lineNumber: i,
      };
    }
    const [rawDate, description, rawDebit, rawCredit, rawBalance] = cols;

    const iso = tdDateToIso(rawDate.trim());
    if (!iso) {
      return {
        ok: false,
        error: `Cannot parse date "${rawDate}". TD exports dates as MM/DD/YYYY.`,
        lineNumber: i,
      };
    }

    const debit = parseMoney(rawDebit);
    const credit = parseMoney(rawCredit);
    const runningBalance = parseMoney(rawBalance);

    if (debit.error) return errorAt(i, `debit: ${debit.error}`);
    if (credit.error) return errorAt(i, `credit: ${credit.error}`);
    if (runningBalance.error)
      return errorAt(i, `running balance: ${runningBalance.error}`);
    if (debit.value == null && credit.value == null) {
      return errorAt(
        i,
        "Neither debit nor credit populated — every TD row has one or the other.",
      );
    }

    const dedupeHash = hashRow(
      accountId,
      iso,
      description,
      debit.value,
      credit.value,
      runningBalance.value,
    );

    rows.push({
      txnDate: iso,
      description: description.trim(),
      debit: debit.value,
      credit: credit.value,
      runningBalance: runningBalance.value,
      dedupeHash,
      lineNumber: i,
    });
  }

  return { ok: true, rows };
}

/** ISO yyyy-mm-dd bounds of a parsed set — nulls if empty. */
export function parsedPeriod(rows: ParsedTdRow[]): {
  from: string | null;
  to: string | null;
} {
  if (rows.length === 0) return { from: null, to: null };
  let from = rows[0].txnDate;
  let to = rows[0].txnDate;
  for (const r of rows) {
    if (r.txnDate < from) from = r.txnDate;
    if (r.txnDate > to) to = r.txnDate;
  }
  return { from, to };
}

// ---- helpers ----

function errorAt(lineNumber: number, message: string): ParseResult {
  return { ok: false, lineNumber, error: message };
}

/**
 * Simple RFC-4180-ish splitter — supports optional double-quoted fields with
 * doubled quotes inside. TD's exports don't normally quote anything, but
 * handling it costs a few lines and hedges against future format changes.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else if (ch === '"' && cur.length === 0) {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function tdDateToIso(raw: string): string | null {
  // Accept MM/DD/YYYY (TD default) and yyyy-mm-dd (defensive).
  if (ISO_DATE_RE.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = mm.padStart(2, "0");
  const day = dd.padStart(2, "0");
  const iso = `${yyyy}-${month}-${day}`;
  // Reject impossible dates like 02/30/2025.
  const d = new Date(iso + "T00:00:00Z");
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(yyyy) ||
    d.getUTCMonth() + 1 !== Number(month) ||
    d.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return iso;
}

function parseMoney(raw: string): { value: string | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null };
  // TD sometimes wraps negatives in parens (rare). Normalise.
  const negParen = trimmed.startsWith("(") && trimmed.endsWith(")");
  const inner = (negParen ? trimmed.slice(1, -1) : trimmed).replace(/[$,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(inner)) {
    return { value: null, error: `not a number ("${raw}")` };
  }
  const n = Number(inner) * (negParen ? -1 : 1);
  return { value: n.toFixed(2) };
}

function hashRow(
  accountId: string,
  iso: string,
  description: string,
  debit: string | null,
  credit: string | null,
  balance: string | null,
): string {
  const key = [
    accountId,
    iso,
    description.trim(),
    debit ?? "",
    credit ?? "",
    balance ?? "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}
