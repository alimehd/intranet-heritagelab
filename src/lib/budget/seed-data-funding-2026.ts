/**
 * Heritage Lab 2026 funding sources.
 *
 * Transcribed from `for-test.xlsx` → sheet "Budget 2026" → "Cash Inflows"
 * section (rows 12–16). "Sales Collected" and "Other Income" are omitted:
 * they were both zero in the 2026 projections and belong to a generic-
 * revenue concept we don't model yet.
 *
 * The "kind" field cross-references the Expenses sheet sidebar:
 *   - Kativik Ilisarniliriniq appears under SERVICE CONTRACTS TO DATE.
 *   - The rest are labelled as grants (or Quebec/federal awards, which we
 *     also file as `grant` for now).
 *
 * `allowedCategoryCodes` is left empty ([]) for every source because the
 * per-funder restrictions live outside the Excel and Ali will fill them in
 * via the Grants edit UI. Empty = unrestricted (no warnings on tagging).
 *
 * Contract values are the annualised 2026 total — sum of the monthly
 * schedule. The Qarjuit line in Excel has a stray total column of 10 000
 * that doesn't match the monthly grid (30 000 in Feb); we go with what the
 * monthly grid actually says.
 */

type MonthlyProjection = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export type FundingSourceSeed = {
  name: string;
  kind: "grant" | "service_contract" | "donation" | "other";
  monthly: MonthlyProjection;
  notes?: string;
};

export const FUNDING_SOURCES_2026: readonly FundingSourceSeed[] = [
  {
    name: "Kativik Ilisarniliriniq",
    kind: "service_contract",
    monthly: [0, 0, 50000, 0, 50000, 0, 75000, 0, 0, 0, 0, 0],
    notes:
      "Kativik School Board — 2026 service contract. Sidebar in the Expenses sheet lists a cumulative $109k spent to date across 2025+2026 activity.",
  },
  {
    name: "ESUMA",
    kind: "grant",
    monthly: [0, 0, 50000, 0, 75000, 0, 0, 0, 50000, 0, 0, 0],
    notes:
      "2026 tranches. The 2025 ESUMA-AYAGUTA grant ($150k) is a separate historical entry; it lives on the 2025 fiscal year once that's seeded.",
  },
  {
    name: "ANICINABE - MINWASHIN",
    kind: "grant",
    monthly: [0, 60000, 0, 0, 0, 0, 0, 0, 60000, 0, 0, 0],
    notes: "Two tranches of $60k (Feb + Sept).",
  },
  {
    name: "Secrétariat aux affaires Autochtones",
    kind: "grant",
    monthly: [0, 0, 80000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes: "Quebec government — single Q1 disbursement.",
  },
  {
    name: "Qarjuit",
    kind: "grant",
    monthly: [0, 30000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes:
      "Nunavik youth organisation. Excel total column shows 10 000 but the Feb line shows 30 000 — using the monthly value.",
  },
] as const;
