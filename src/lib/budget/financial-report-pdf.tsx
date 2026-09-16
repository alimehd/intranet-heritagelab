import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { BudgetFiscalYear } from "@/lib/db/schema";

/**
 * "Dernier rapport financier" export for grant applications (e.g. Plan
 * Nord) — a funder-facing summary of cash position, revenue by source, and
 * expenses by category/funding source for a fiscal year. Distinct from the
 * expense-report PDF (`er-pdf.tsx`), which documents a single reimbursement.
 */

const colors = {
  ink: "#1f2421",
  green: "#4d6a4b",
  greenDark: "#3d5a3b",
  muted: "#6b7066",
  border: "#e4e2db",
  cream: "#f8f6f1",
  red: "#a13a3a",
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: colors.ink,
    fontFamily: "Helvetica",
  },
  header: {
    borderBottom: `2pt solid ${colors.green}`,
    paddingBottom: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    color: colors.green,
    fontFamily: "Helvetica-Bold",
  },
  subtitle: { fontSize: 11, color: colors.ink, marginTop: 3 },
  subtitleFr: { fontSize: 9, color: colors.muted, marginTop: 1, fontStyle: "italic" },
  metaLine: { fontSize: 8, color: colors.muted, marginTop: 5 },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    color: colors.green,
    fontFamily: "Helvetica-Bold",
  },
  sectionTitleFr: {
    fontSize: 9,
    color: colors.muted,
    fontStyle: "italic",
    marginBottom: 6,
  },
  summaryGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    border: `1pt solid ${colors.border}`,
    backgroundColor: colors.cream,
  },
  summaryCell: {
    width: "33.33%",
    padding: 10,
    borderRight: `1pt solid ${colors.border}`,
    borderBottom: `1pt solid ${colors.border}`,
  },
  summaryLabel: {
    fontSize: 8,
    color: colors.muted,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
    marginTop: 3,
  },
  table: {
    borderTop: `1pt solid ${colors.border}`,
    borderLeft: `1pt solid ${colors.border}`,
    borderRight: `1pt solid ${colors.border}`,
    marginTop: 4,
  },
  tr: { flexDirection: "row", borderBottom: `1pt solid ${colors.border}` },
  trTotal: {
    flexDirection: "row",
    backgroundColor: colors.green,
  },
  th: {
    backgroundColor: colors.cream,
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: colors.muted,
  },
  td: { padding: 5, fontSize: 9 },
  tdTotal: {
    padding: 5,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: colors.muted,
    textAlign: "center",
    borderTop: `1pt solid ${colors.border}`,
    paddingTop: 6,
  },
  signatureGrid: {
    marginTop: 28,
    flexDirection: "row",
    gap: 24,
  },
  signatureBox: {
    flex: 1,
    borderTop: `1pt solid ${colors.ink}`,
    paddingTop: 6,
  },
});

function TH({
  children,
  flex = 1,
  align = "left",
}: {
  children: React.ReactNode;
  flex?: number;
  align?: "left" | "right" | "center";
}) {
  return <Text style={[styles.th, { flex, textAlign: align }]}>{children}</Text>;
}

function TD({
  children,
  flex = 1,
  align = "left",
  color,
}: {
  children: React.ReactNode;
  flex?: number;
  align?: "left" | "right" | "center";
  color?: string;
}) {
  return (
    <Text style={[styles.td, { flex, textAlign: align, ...(color ? { color } : {}) }]}>
      {children}
    </Text>
  );
}

function TDTotal({
  children,
  flex = 1,
  align = "left",
}: {
  children: React.ReactNode;
  flex?: number;
  align?: "left" | "right" | "center";
}) {
  return <Text style={[styles.tdTotal, { flex, textAlign: align }]}>{children}</Text>;
}

function money(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

const KIND_LABELS: Record<string, string> = {
  grant: "Grant",
  service_contract: "Service contract",
  donation: "Donation",
  other: "Other",
};

export type FinancialReportFundingRow = {
  fundingSourceId: string;
  name: string;
  kind: string;
  annualProjected: number;
  actualReceived: number;
};

export type FinancialReportExpenseCategoryRow = {
  code: string;
  name: string;
  annualBudget: number;
  actualSpent: number;
};

export type FinancialReportSpendByKindRow = {
  kind: string;
  label: string;
  total: number;
};

export type FinancialReportProps = {
  fiscalYear: BudgetFiscalYear;
  generatedAt: Date;
  asOfDate: string; // ISO yyyy-mm-dd — latest bank activity used for "actual" figures
  openingBalance: number | null;
  currentBalance: number | null;
  totalRevenueActual: number;
  totalExpenseActual: number;
  fundingRows: FinancialReportFundingRow[];
  revenueAnnualTotal: number;
  expenseCategories: FinancialReportExpenseCategoryRow[];
  expenseAnnualTotal: number;
  spendByKind: FinancialReportSpendByKindRow[];
  avgMonthlySpend: number;
  runwayMonths: number | null;
  preparedBy: string;
};

function FinancialReportDoc(props: FinancialReportProps) {
  const {
    fiscalYear,
    generatedAt,
    asOfDate,
    openingBalance,
    currentBalance,
    totalRevenueActual,
    totalExpenseActual,
    fundingRows,
    revenueAnnualTotal,
    expenseCategories,
    expenseAnnualTotal,
    spendByKind,
    avgMonthlySpend,
    runwayMonths,
    preparedBy,
  } = props;

  const netChange = totalRevenueActual - totalExpenseActual;
  const receivedTotal = fundingRows.reduce((s, r) => s + r.actualReceived, 0);
  const spentByKindTotal = spendByKind.reduce((s, r) => s + r.total, 0);
  const runwayLabel =
    runwayMonths === null ? "—" : runwayMonths >= 120 ? "120+ mo" : `${runwayMonths.toFixed(1)} mo`;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Heritage Lab</Text>
          <Text style={styles.subtitle}>
            Financial Report — Fiscal Year {fiscalYear.year}
          </Text>
          <Text style={styles.subtitleFr}>
            Rapport financier — Exercice financier {fiscalYear.year}
          </Text>
          <Text style={styles.metaLine}>
            Period: Jan 1 – Dec 31, {fiscalYear.year} · Actuals as of{" "}
            {asOfDate} · Generated{" "}
            {generatedAt.toLocaleString("en-CA", {
              timeZone: "America/Toronto",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </Text>
        </View>

        {/* ---- Summary ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.sectionTitleFr}>Sommaire</Text>
          <View style={styles.summaryGrid}>
            <SummaryCell
              label="Opening balance"
              value={openingBalance === null ? "not set" : money(openingBalance)}
            />
            <SummaryCell
              label="Revenue received (YTD)"
              value={money(totalRevenueActual)}
            />
            <SummaryCell
              label="Expenses (YTD)"
              value={money(totalExpenseActual)}
            />
            <SummaryCell
              label="Net change (YTD)"
              value={money(netChange)}
              color={netChange < 0 ? colors.red : colors.greenDark}
            />
            <SummaryCell
              label="Current cash balance"
              value={currentBalance === null ? "—" : money(currentBalance)}
              color={
                currentBalance !== null && currentBalance < 0 ? colors.red : undefined
              }
            />
            <SummaryCell label="Estimated runway" value={runwayLabel} />
          </View>
          <Text style={[styles.metaLine, { marginTop: 6 }]}>
            Runway = current balance ÷ average monthly spend (
            {money(avgMonthlySpend)}/mo) — a rough guide, not a forecast.
          </Text>
        </View>

        {/* ---- Revenue ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Revenue by funding source</Text>
          <Text style={styles.sectionTitleFr}>Revenus par source de financement</Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <TH flex={3}>Source</TH>
              <TH flex={2}>Type</TH>
              <TH flex={2} align="right">
                Annual projected
              </TH>
              <TH flex={2} align="right">
                Actual received
              </TH>
            </View>
            {fundingRows.map((r) => (
              <View style={styles.tr} key={r.fundingSourceId}>
                <TD flex={3}>{r.name}</TD>
                <TD flex={2}>{KIND_LABELS[r.kind] ?? r.kind}</TD>
                <TD flex={2} align="right">
                  {money(r.annualProjected)}
                </TD>
                <TD flex={2} align="right">
                  {money(r.actualReceived)}
                </TD>
              </View>
            ))}
            <View style={styles.trTotal}>
              <TDTotal flex={3}>Total</TDTotal>
              <TDTotal flex={2}>{""}</TDTotal>
              <TDTotal flex={2} align="right">
                {money(revenueAnnualTotal)}
              </TDTotal>
              <TDTotal flex={2} align="right">
                {money(receivedTotal)}
              </TDTotal>
            </View>
          </View>
        </View>

        {/* ---- Expenses by category ---- */}
        <View style={styles.section} break={fundingRows.length > 8}>
          <Text style={styles.sectionTitle}>Expenses by budget category</Text>
          <Text style={styles.sectionTitleFr}>Dépenses par catégorie budgétaire</Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <TH flex={1}>Code</TH>
              <TH flex={4}>Category</TH>
              <TH flex={2} align="right">
                Annual budget
              </TH>
              <TH flex={2} align="right">
                Actual spent
              </TH>
              <TH flex={2} align="right">
                Remaining
              </TH>
            </View>
            {expenseCategories.map((c) => (
              <View style={styles.tr} key={c.code}>
                <TD flex={1}>{c.code}</TD>
                <TD flex={4}>{c.name}</TD>
                <TD flex={2} align="right">
                  {money(c.annualBudget)}
                </TD>
                <TD flex={2} align="right">
                  {money(c.actualSpent)}
                </TD>
                <TD
                  flex={2}
                  align="right"
                  color={c.annualBudget - c.actualSpent < 0 ? colors.red : undefined}
                >
                  {money(c.annualBudget - c.actualSpent)}
                </TD>
              </View>
            ))}
            <View style={styles.trTotal}>
              <TDTotal flex={1}>{""}</TDTotal>
              <TDTotal flex={4}>Total</TDTotal>
              <TDTotal flex={2} align="right">
                {money(expenseAnnualTotal)}
              </TDTotal>
              <TDTotal flex={2} align="right">
                {money(totalExpenseActual)}
              </TDTotal>
              <TDTotal flex={2} align="right">
                {money(expenseAnnualTotal - totalExpenseActual)}
              </TDTotal>
            </View>
          </View>
        </View>

        {/* ---- Expenses by funding-source type ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Expenses by funding source type
          </Text>
          <Text style={styles.sectionTitleFr}>
            Dépenses par type de source de financement
          </Text>
          <Text style={[styles.metaLine, { marginBottom: 4 }]}>
            Shows the split between restricted funding (grants), earned
            revenue (service contracts), and general/unrestricted spend.
          </Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <TH flex={3}>Type</TH>
              <TH flex={2} align="right">
                Amount
              </TH>
              <TH flex={2} align="right">
                % of total
              </TH>
            </View>
            {spendByKind.map((k) => (
              <View style={styles.tr} key={k.kind}>
                <TD flex={3}>{k.label}</TD>
                <TD flex={2} align="right">
                  {money(k.total)}
                </TD>
                <TD flex={2} align="right">
                  {spentByKindTotal > 0
                    ? `${((k.total / spentByKindTotal) * 100).toFixed(1)}%`
                    : "—"}
                </TD>
              </View>
            ))}
            <View style={styles.trTotal}>
              <TDTotal flex={3}>Total</TDTotal>
              <TDTotal flex={2} align="right">
                {money(spentByKindTotal)}
              </TDTotal>
              <TDTotal flex={2} align="right">
                100%
              </TDTotal>
            </View>
          </View>
        </View>

        <View style={styles.signatureGrid}>
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 9, color: colors.muted }}>
              Prepared by
            </Text>
            <Text style={{ fontFamily: "Helvetica-Bold", marginTop: 2 }}>
              {preparedBy}
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>
              Heritage Lab
            </Text>
          </View>
          <View style={styles.signatureBox}>
            <Text style={{ fontSize: 9, color: colors.muted }}>
              Signature / Date
            </Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Heritage Lab · Financial Report {fiscalYear.year} · Generated by the
          Heritage Lab Intranet · Figures derived from classified bank
          transactions and paid expense reports as of {asOfDate}
        </Text>
      </Page>
    </Document>
  );
}

function SummaryCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

export async function renderFinancialReportPdf(
  props: FinancialReportProps,
): Promise<Buffer> {
  return renderToBuffer(<FinancialReportDoc {...props} />);
}
