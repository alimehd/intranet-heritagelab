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
  status?: "active" | "completed" | "cancelled";
  contractStartDate?: string;
  contractEndDate?: string;
  contractTotalValue?: number;
  yearlyAllocations?: Array<{ year: number; amount: number }>;
  /** Empty / omitted = unrestricted. Caps are category-level (001, 003, …). */
  categoryCaps?: Array<{ code: string; cap: number | null }>;
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
    monthly: [0, 0, 50000, 0, 50000, 0, 0, 0, 50000, 0, 0, 0],
    notes:
      "KRG Sustainable Employment — file ET0826001 (signed 24 Mar 2026). " +
      "Project: Interactive Inuktitut Language Learning Platform. " +
      "Program 08-Delivery Assistance / ESUMA. " +
      "Contract $150,000, 1 Apr 2026 – 31 Mar 2027 (KRG fiscal). " +
      "Schedule B: training/dev $45k, trainer fees $37k, trainer travel $10k, " +
      "participant lodging $5k, other special costs $53k (QA/cultural " +
      "validation, language committee, youth artist, software, server). " +
      "No admin fee. Reimbursement on 30–90 day claims. " +
      "The 2025 ESUMA-AYAGUTA grant ($150k) is a separate historical entry.",
    contractStartDate: "2026-04-01",
    contractEndDate: "2027-03-31",
    contractTotalValue: 150_000,
    yearlyAllocations: [
      { year: 2026, amount: 150_000 },
      { year: 2027, amount: 0 },
    ],
    // Schedule B eligible categories only. Blank rows (wages, equipment,
    // facilities, admin, participant travel/meals) are not billable.
    categoryCaps: [
      // Lead/AI $45k + trainer/content $37k + QA/UI $14.5k + language
      // committee/youth artist $20k.
      { code: "001", cap: 116_500 },
      // Trainer travel $10k + participant lodging $5k.
      { code: "003", cap: 15_000 },
      // Software/accessibility $10k + server maintenance $8.5k.
      { code: "004", cap: 18_500 },
    ],
  },
  {
    name: "ANICINABE - MINWASHIN",
    kind: "grant",
    monthly: [0, 60000, 0, 0, 0, 0, 0, 0, 60000, 0, 0, 0],
    notes: "Two tranches of $60k (Feb + Sept).",
  },
  {
    name: "FIA IV",
    kind: "grant",
    monthly: [0, 0, 120000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes:
      "Fonds d'initiatives autochtones IV (Secrétariat aux affaires " +
      "autochtones) — proposition TTS-IV4. " +
      "Project: Synthèse vocale inuktitut pour le développement social " +
      "communautaire. 14 months (Phase 1 months 1–10, Phase 2 months 11–14). " +
      "FIA IV ask $120,000 (80% of the $150k project). " +
      "PME MTL $30k, MILA in-kind, and Abundant Intelligences in-kind are " +
      "excluded from this pot. " +
      "Replaces the old $80k SAA placeholder.",
    contractStartDate: "2026-01-01",
    contractEndDate: "2027-02-28",
    contractTotalValue: 120_000,
    yearlyAllocations: [
      { year: 2026, amount: 120_000 },
      { year: 2027, amount: 0 },
    ],
    // Proposal expense table → HL categories. Caps are the full eligible
    // amounts (what can be billed in each bucket). This pot is $120k;
    // the leftover $30k of the $150k project is PME and is not tracked here.
    categoryCaps: [
      // Personnel $70k + vocal $25k + platform integration $5k + QA $5k.
      { code: "001", cap: 105_000 },
      // Community travel / recording logistics.
      { code: "003", cap: 10_000 },
      // Compute/infra $20k + document-processing system $10k.
      { code: "004", cap: 30_000 },
      // Contingency 3.3%.
      { code: "006", cap: 5_000 },
    ],
  },
  {
    name: "PME MTL",
    kind: "grant",
    monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes:
      "PME MTL Ouest-de-l'Île — Fonds d'économie sociale (FES). " +
      "Project: Outils numériques pour la préservation linguistique " +
      "autochtone dans l'Ouest-de-l'Île. 12 months starting January 2025. " +
      "Grant $50,000 of a $62,500 start-up (Heritage Lab covered $12,500). " +
      "Eligible: equipment $15k, consulting $32.5k, technical implementation " +
      "$10k, documentation $5k. No Heritage Lab salaries. " +
      "Grant is fully spent / closed.",
    status: "completed",
    contractStartDate: "2025-01-01",
    contractEndDate: "2025-12-31",
    contractTotalValue: 50_000,
    yearlyAllocations: [{ year: 2025, amount: 50_000 }],
    categoryCaps: [
      // UX $8k + database/AI $19.5k + technical training $6k + docs $5k.
      { code: "001", cap: 38_500 },
      // Workstations $10k + scanners $2k + mobile testing $3k.
      { code: "002", cap: 15_000 },
      // User-facing documentation / promo materials (booked as 003-3).
      { code: "003", cap: 5_000 },
      // IT infrastructure configuration.
      { code: "004", cap: 4_000 },
      // Cybersecurity audit $5k.
      { code: "006", cap: 5_000 },
    ],
  },
  {
    name: "Qarjuit",
    kind: "grant",
    monthly: [0, 30000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    notes:
      "Nunavik youth organisation. Excel total column shows 10 000 but the Feb line shows 30 000 — using the monthly value.",
  },
] as const;
