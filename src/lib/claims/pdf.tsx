import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import {
  computeTotals,
  formatMoney,
  RATES,
  type TravelClaimInput,
} from "./schema";

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
  sectionTitle: {
    fontSize: 12,
    color: colors.green,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 110, color: colors.muted },
  value: { flex: 1 },
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
    marginTop: 16,
    padding: 10,
    backgroundColor: colors.cream,
    border: `1pt solid ${colors.border}`,
  },
  grand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: colors.greenDark,
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
  return (
    <Text style={[styles.th, { flex, textAlign: align }]}>{children}</Text>
  );
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
  return (
    <Text style={[styles.td, { flex, textAlign: align }]}>{children}</Text>
  );
}

function ClaimDoc({
  claim,
  submittedAt,
  claimId,
}: {
  claim: TravelClaimInput;
  submittedAt: Date;
  claimId: string;
}) {
  const t = computeTotals(claim);
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Heritage Lab — Travel Expense Claim</Text>
          <Text style={styles.subtitle}>
            Claim ID: {claimId} • Submitted{" "}
            {submittedAt.toLocaleString("en-CA", { timeZone: "America/Toronto" })}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Submitter</Text>
          <Text style={styles.value}>
            {claim.fullName} &lt;{claim.email}&gt;
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Purpose</Text>
          <Text style={styles.value}>{claim.purpose}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Travel Type</Text>
          <Text style={styles.value}>{claim.travelType}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Dates</Text>
          <Text style={styles.value}>
            {claim.startDate} → {claim.endDate}
          </Text>
        </View>

        {claim.airfare.amount > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Airfare</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH flex={2}>Origin</TH>
                <TH flex={2}>Destination</TH>
                <TH align="right">Amount</TH>
              </View>
              <View style={styles.tr}>
                <TD flex={2}>{claim.airfare.origin || "—"}</TD>
                <TD flex={2}>{claim.airfare.destination || "—"}</TD>
                <TD align="right">{formatMoney(claim.airfare.amount)}</TD>
              </View>
            </View>
          </>
        ) : null}

        {claim.hotel.total > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Hotel</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH>Check-in</TH>
                <TH>Check-out</TH>
                <TH align="right">Total</TH>
              </View>
              <View style={styles.tr}>
                <TD>{claim.hotel.checkIn || "—"}</TD>
                <TD>{claim.hotel.checkOut || "—"}</TD>
                <TD align="right">{formatMoney(claim.hotel.total)}</TD>
              </View>
            </View>
          </>
        ) : null}

        {claim.transport.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Ground Transportation</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH>Date</TH>
                <TH flex={2}>Origin</TH>
                <TH flex={2}>Destination</TH>
                <TH align="right">Amount</TH>
              </View>
              {claim.transport.map((e, i) => (
                <View style={styles.tr} key={i}>
                  <TD>{e.date}</TD>
                  <TD flex={2}>{e.origin}</TD>
                  <TD flex={2}>{e.destination}</TD>
                  <TD align="right">{formatMoney(e.amount)}</TD>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {claim.km.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>
              Personal Vehicle (rate {formatMoney(RATES.kmRate)} / km)
            </Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH>Date</TH>
                <TH flex={2}>Origin</TH>
                <TH flex={2}>Destination</TH>
                <TH align="right">KM</TH>
                <TH align="right">Amount</TH>
              </View>
              {claim.km.map((e, i) => (
                <View style={styles.tr} key={i}>
                  <TD>{e.date}</TD>
                  <TD flex={2}>{e.origin}</TD>
                  <TD flex={2}>{e.destination}</TD>
                  <TD align="right">{e.km.toFixed(1)}</TD>
                  <TD align="right">
                    {formatMoney(e.km * RATES.kmRate)}
                  </TD>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {claim.meals.some(
          (m) => m.breakfast || m.lunch || m.supper || m.incidentals,
        ) ? (
          <>
            <Text style={styles.sectionTitle}>Meals & Incidentals</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH>Date</TH>
                <TH align="center">Breakfast</TH>
                <TH align="center">Lunch</TH>
                <TH align="center">Supper</TH>
                <TH align="center">Incid.</TH>
                <TH align="right">Day Total</TH>
              </View>
              {claim.meals
                .filter(
                  (m) => m.breakfast || m.lunch || m.supper || m.incidentals,
                )
                .map((m, i) => {
                  const day =
                    (m.breakfast ? RATES.breakfast : 0) +
                    (m.lunch ? RATES.lunch : 0) +
                    (m.supper ? RATES.supper : 0) +
                    (m.incidentals ? RATES.incidentals : 0);
                  return (
                    <View style={styles.tr} key={i}>
                      <TD>{m.date}</TD>
                      <TD align="center">{m.breakfast ? "✓" : ""}</TD>
                      <TD align="center">{m.lunch ? "✓" : ""}</TD>
                      <TD align="center">{m.supper ? "✓" : ""}</TD>
                      <TD align="center">{m.incidentals ? "✓" : ""}</TD>
                      <TD align="right">{formatMoney(day)}</TD>
                    </View>
                  );
                })}
            </View>
          </>
        ) : null}

        {claim.other.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Other Expenses</Text>
            <View style={styles.table}>
              <View style={styles.tr}>
                <TH>Date</TH>
                <TH flex={3}>Description</TH>
                <TH align="right">Amount</TH>
              </View>
              {claim.other.map((e, i) => (
                <View style={styles.tr} key={i}>
                  <TD>{e.date}</TD>
                  <TD flex={3}>{e.description}</TD>
                  <TD align="right">{formatMoney(e.amount)}</TD>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {claim.notes ? (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text>{claim.notes}</Text>
          </>
        ) : null}

        <View style={styles.totalsBox}>
          <View style={styles.row}>
            <Text style={styles.label}>Airfare</Text>
            <Text style={styles.value}>{formatMoney(t.airfare)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Hotel</Text>
            <Text style={styles.value}>{formatMoney(t.hotel)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ground Transport</Text>
            <Text style={styles.value}>{formatMoney(t.transport)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Personal Vehicle</Text>
            <Text style={styles.value}>{formatMoney(t.km)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Meals</Text>
            <Text style={styles.value}>{formatMoney(t.meals)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Other</Text>
            <Text style={styles.value}>{formatMoney(t.other)}</Text>
          </View>
          <View
            style={[
              styles.row,
              {
                marginTop: 6,
                paddingTop: 6,
                borderTop: `1pt solid ${colors.border}`,
              },
            ]}
          >
            <Text style={[styles.label, { color: colors.ink }]}>
              Grand Total
            </Text>
            <Text style={[styles.value, styles.grand]}>
              {formatMoney(t.grandTotal)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Heritage Lab Travel Expense Claim • Generated by the Heritage Lab
          Intranet
        </Text>
      </Page>
    </Document>
  );
}

export async function renderClaimPdf(args: {
  claim: TravelClaimInput;
  submittedAt: Date;
  claimId: string;
}): Promise<Buffer> {
  return renderToBuffer(<ClaimDoc {...args} />);
}
