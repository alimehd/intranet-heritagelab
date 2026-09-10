/**
 * Heritage Lab 2026 budget projections.
 *
 * Transcribed verbatim from `for-test.xlsx` → sheet "Budget 2026" (the outflow
 * side; grants / receipts land with `funding_source` in Phase 2). Do not edit
 * ad-hoc — if the budget changes, update Excel first, reconcile, then update
 * this file so the source of truth is preserved across runs of `seed:budget`.
 *
 * Every `monthly` array has exactly 12 entries (Jan..Dec) in dollars.
 */

type MonthlyProjection = readonly [
  number, number, number, number, number, number,
  number, number, number, number, number, number,
];

export type BudgetLineSeed = {
  code: string; // "1", "2", ... within the category
  name: string;
  monthly: MonthlyProjection;
};

export type BudgetCategorySeed = {
  code: string; // "001", "002", ...
  name: string;
  lines: readonly BudgetLineSeed[];
};

const FLAT = (v: number): MonthlyProjection => [v, v, v, v, v, v, v, v, v, v, v, v];

export const BUDGET_2026_CATEGORIES: readonly BudgetCategorySeed[] = [
  {
    code: "001",
    name: "Development",
    lines: [
      { code: "1", name: "Development contract", monthly: FLAT(4000) },
      { code: "2", name: "Research & Data Analytics", monthly: FLAT(3000) },
      { code: "3", name: "Data Collection", monthly: FLAT(1000) },
      { code: "4", name: "AI Development & Research", monthly: FLAT(7500) },
      { code: "5", name: "Project Management", monthly: FLAT(5000) },
      {
        code: "6",
        name: "AI Development consultancy",
        // Ramps up in May.
        monthly: [0, 0, 0, 0, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000],
      },
      { code: "7", name: "User Support", monthly: FLAT(1000) },
      { code: "8", name: "Quality Assurance (language)", monthly: FLAT(2000) },
      { code: "9", name: "Honorariums (Language committee)", monthly: FLAT(3000) },
      { code: "10", name: "Testing and optimization costs", monthly: FLAT(750) },
      { code: "11", name: "UI/UX & Graphics", monthly: FLAT(2000) },
    ],
  },
  {
    code: "002",
    name: "Rentals & misc expenses",
    lines: [
      { code: "1", name: "Coworking Space Rental", monthly: FLAT(0) },
      { code: "2", name: "AI Workstation rental", monthly: FLAT(1000) },
      { code: "3", name: "Landline & communications", monthly: FLAT(50) },
      { code: "4", name: "Office Supplies & Furniture", monthly: FLAT(500) },
      { code: "5", name: "Laptops + hardware accessories", monthly: FLAT(500) },
    ],
  },
  {
    code: "003",
    name: "PR & Travel",
    lines: [
      {
        code: "1",
        name: "Marketing & Promotional materials",
        // Skips Apr–Jul, resumes Aug.
        monthly: [1000, 1000, 1000, 0, 0, 0, 0, 1000, 1000, 1000, 1000, 1000],
      },
      {
        code: "2",
        name: "Travel & Meetings",
        // Every other month.
        monthly: [0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000, 0, 3000],
      },
      { code: "3", name: "Social Media & Graphic Design", monthly: FLAT(1000) },
    ],
  },
  {
    code: "004",
    name: "Web fees",
    lines: [
      { code: "1", name: "Infrastructure (Servers/DB/Website)", monthly: FLAT(1000) },
      { code: "2", name: "Software Licenses", monthly: FLAT(500) },
      { code: "3", name: "AI platform usage", monthly: FLAT(1500) },
    ],
  },
  {
    code: "005",
    name: "Banking fees & other costs",
    lines: [
      { code: "1", name: "Bank fees, payment processing", monthly: FLAT(50) },
      {
        code: "2",
        name: "Legal fees",
        monthly: [2000, 0, 1500, 0, 1500, 5000, 0, 0, 1500, 0, 0, 0],
      },
      {
        code: "3",
        name: "Accountant fees",
        monthly: [0, 0, 0, 0, 0, 0, 0, 0, 2000, 0, 0, 0],
      },
      {
        code: "4",
        name: "Administrative fees",
        monthly: [0, 1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    ],
  },
  {
    code: "006",
    name: "Other cash outflows",
    lines: [
      {
        code: "1",
        name: "Contingency",
        monthly: [3210, 3510, 3210, 3410, 3510, 3810, 3510, 3910, 3610, 3910, 3610, 3910],
      },
      { code: "2", name: "Maintenance and updates", monthly: FLAT(1000) },
      { code: "3", name: "Cybersecurity", monthly: FLAT(600) },
      {
        code: "4",
        name: "Technological purchases",
        // Big quarterly hardware pushes.
        monthly: [0, 0, 0, 0, 25000, 0, 0, 0, 25000, 0, 0, 25000],
      },
    ],
  },
] as const;
