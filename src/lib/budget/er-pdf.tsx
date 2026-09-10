import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { ExpenseReport, ExpenseReportLine } from "@/lib/db/schema";
import { EXPENSE_REPORT_STATUS_LABELS } from "./er-schema";

const colors = {
  ink: "#1f2421",
  green: "#4d6a4b",
  greenDark: "#3d5a3b",
  muted: "#6b7066",
  border: "#e4e2db",
  cream: "#f8f6f1",
  white: "#ffffff",
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
  subtitle: { fontSize: 10, color: colors.muted, marginTop: 2 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 12,
    color: colors.green,
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 110, color: colors.muted },
  metaValue: { flex: 1 },
  table: {
    borderTop: `1pt solid ${colors.border}`,
    borderLeft: `1pt solid ${colors.border}`,
    borderRight: `1pt solid ${colors.border}`,
    marginTop: 4,
  },
  tr: {
    flexDirection: "row",
    borderBottom: `1pt solid ${colors.border}`,
  },
  th: {
    backgroundColor: colors.cream,
    padding: 5,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: colors.muted,
  },
  td: { padding: 5, fontSize: 9 },
  totalsBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: colors.cream,
    border: `1pt solid ${colors.border}`,
  },
  grand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: colors.greenDark,
  },
  approvalGrid: {
    marginTop: 24,
    flexDirection: "row",
    gap: 24,
  },
  approvalBox: {
    flex: 1,
    borderTop: `1pt solid ${colors.ink}`,
    paddingTop: 6,
  },
  statusPill: {
    marginTop: 4,
    padding: 4,
    fontSize: 9,
    color: colors.greenDark,
    fontFamily: "Helvetica-Bold",
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
}: {
  children: React.ReactNode;
  flex?: number;
  align?: "left" | "right" | "center";
}) {
  return <Text style={[styles.td, { flex, textAlign: align }]}>{children}</Text>;
}

function money(v: number): string {
  return v.toLocaleString("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  });
}

export type ErPdfLine = ExpenseReportLine & {
  categoryName?: string | null;
  fundingSourceName?: string | null;
};

function ExpenseReportDoc({
  report,
  lines,
  receiptNames,
}: {
  report: ExpenseReport;
  lines: ErPdfLine[];
  receiptNames: string[];
}) {
  const total = lines.reduce((s, l) => s + Number(l.cost), 0);
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Heritage Lab — Expense Reimbursement</Text>
          <Text style={styles.subtitle}>
            {report.reportNumber} · {report.title}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Submitter</Text>
          <Text style={styles.metaValue}>
            {report.submitterName} &lt;{report.submitterEmail}&gt;
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Approver</Text>
          <Text style={styles.metaValue}>{report.approverEmail}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Period</Text>
          <Text style={styles.metaValue}>
            {report.periodFrom} → {report.periodTo}
          </Text>
        </View>
        {report.businessPurpose ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Purpose</Text>
            <Text style={styles.metaValue}>{report.businessPurpose}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Status</Text>
          <Text style={styles.metaValue}>
            {EXPENSE_REPORT_STATUS_LABELS[report.status as keyof typeof EXPENSE_REPORT_STATUS_LABELS] ?? report.status}
            {report.submittedAt
              ? ` · submitted ${new Date(report.submittedAt).toLocaleString("en-CA", { timeZone: "America/Toronto" })}`
              : ""}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Line items</Text>
          <View style={styles.table}>
            <View style={styles.tr}>
              <TH flex={1}>Date</TH>
              <TH flex={3}>Description</TH>
              <TH flex={2}>Budget code</TH>
              <TH flex={2}>Funding source</TH>
              <TH flex={1} align="right">
                Cost
              </TH>
            </View>
            {lines.map((l, i) => (
              <View style={styles.tr} key={l.id ?? `l-${i}`}>
                <TD flex={1}>{l.expenseDate}</TD>
                <TD flex={3}>{l.description}</TD>
                <TD flex={2}>
                  {l.budgetLineCode}
                  {l.categoryName ? ` · ${l.categoryName}` : ""}
                </TD>
                <TD flex={2}>{l.fundingSourceName ?? "—"}</TD>
                <TD flex={1} align="right">
                  {money(Number(l.cost))}
                </TD>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Lines</Text>
            <Text style={styles.metaValue}>{lines.length}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaLabel, { color: colors.ink }]}>
              Total Reimbursement
            </Text>
            <Text style={[styles.metaValue, styles.grand]}>{money(total)}</Text>
          </View>
        </View>

        {receiptNames.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Receipts ({receiptNames.length})
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 3 }}>
              Attached on the following pages.
            </Text>
            {receiptNames.map((name, i) => (
              <Text key={i} style={{ fontSize: 9, marginBottom: 1 }}>
                {i + 1}. {name}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.approvalGrid}>
          <View style={styles.approvalBox}>
            <Text style={styles.metaLabel}>Submitted by</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {report.submitterName}
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>
              {report.submitterEmail}
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>
              {report.submittedAt
                ? new Date(report.submittedAt).toLocaleDateString("en-CA")
                : "—"}
            </Text>
          </View>
          <View style={styles.approvalBox}>
            <Text style={styles.metaLabel}>Approved by</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {report.decidedBy ?? "— pending —"}
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted }}>
              {report.approverEmail}
            </Text>
            <Text style={{ fontSize: 9, color: colors.muted, marginTop: 2 }}>
              {report.decidedAt
                ? new Date(report.decidedAt).toLocaleDateString("en-CA")
                : "—"}
            </Text>
            {report.decisionNote ? (
              <Text style={{ fontSize: 9, color: colors.muted, marginTop: 3 }}>
                Note: {report.decisionNote}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Heritage Lab · Expense Reimbursement · Generated by the Heritage Lab Intranet
        </Text>
      </Page>
    </Document>
  );
}

export async function renderExpenseReportPdf(args: {
  report: ExpenseReport;
  lines: ErPdfLine[];
  receiptNames?: string[];
}): Promise<Buffer> {
  return renderToBuffer(
    <ExpenseReportDoc
      report={args.report}
      lines={args.lines}
      receiptNames={args.receiptNames ?? []}
    />,
  );
}
