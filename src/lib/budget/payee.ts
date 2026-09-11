/**
 * Payee matching for "classify all transactions of this sort".
 *
 * TD descriptions for repeating vendors are usually identical
 * (`DT NETHRIS PAIE  MSP` vs `DT NETHRIS SERV  MSP` are two different
 * sorts). We collapse whitespace and case so those stay distinct, but
 * "  Foo   BAR " matches "FOO BAR".
 */

export type SimilarTxnStats = {
  key: string;
  label: string;
  total: number;
  unclassified: number;
  /** Same-direction siblings excluding the current row. */
  siblingCount: number;
};

export function normalizePayeeDescription(description: string): string {
  return description.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Turn a list of percentages into dollar amounts that sum to `debit`
 * within a cent. Remainder from rounding goes on the last row.
 */
export function amountsFromPercents(
  debit: number,
  percents: number[],
): number[] {
  if (percents.length === 0) return [];
  const cents = Math.round(debit * 100);
  const raw = percents.map((p) => (cents * p) / 100);
  const rounded = raw.map((c) => Math.round(c));
  const drift = cents - rounded.reduce((s, n) => s + n, 0);
  rounded[rounded.length - 1] += drift;
  return rounded.map((c) => c / 100);
}

/** Percent of `debit` represented by `amount`, rounded to 2 decimal places. */
export function percentFromAmount(amount: number, debit: number): number {
  if (!(debit > 0)) return 0;
  return Math.round((amount / debit) * 10000) / 100;
}
