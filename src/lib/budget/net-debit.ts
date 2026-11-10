import { sql, type SQL } from "drizzle-orm";
import { bankTransactions } from "@/lib/db/schema";

/**
 * A bank debit minus any money that came back for it: credits classified
 * `reversal` whose `reversal_of_txn_id` points at this row. Lets a partial
 * refund (e.g. an overpaid travel claim sent back) reduce the original
 * expense instead of leaving spend overstated.
 *
 * `ref` is the SQL that names the debit row's id in the outer query — the
 * default works for Drizzle queries on `bankTransactions`; raw queries pass
 * their own alias (e.g. sql.raw("bt.id")).
 */
export function netDebitSql(ref: SQL = sql`${bankTransactions.id}`): SQL<string> {
  return sql<string>`(COALESCE(debit, 0) - COALESCE((
    SELECT SUM(r.credit) FROM bank_transaction r
    WHERE r.reversal_of_txn_id = ${ref} AND r.classification = 'reversal'
  ), 0))`;
}
