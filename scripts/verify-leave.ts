/**
 * Sanity checks for the leave engine. Run with:
 *   npx tsx scripts/verify-leave.ts
 *
 * Verifies the generated holidays against the dates transcribed from
 * "Employee Calendar - Shaun Annanack.xlsx" and checks that leave day counting
 * skips weekends and paid holidays.
 */
import { getHolidayPeriods, getHolidays } from "../src/lib/leave/holidays";
import { countLeaveDays, computeBalances } from "../src/lib/leave/schema";
import {
  buildCalendarDays,
  buildMonthGrids,
  countCalendarDays,
} from "../src/lib/leave/calendar";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${e}\n        actual   ${a}`);
}

console.log("=== 2026 holidays ===");
for (const p of getHolidayPeriods(2026)) {
  const range = p.start === p.end ? p.start : `${p.start} → ${p.end}`;
  console.log(`  ${range.padEnd(26)} ${String(p.days).padStart(2)}d  ${p.name}`);
}

const byName = (year: number) => {
  const map = new Map<string, string>();
  for (const h of getHolidays(year)) if (!map.has(h.name)) map.set(h.name, h.date);
  return map;
};

const h2026 = byName(2026);
console.log("\n=== Expected 2026 dates ===");
check("Good Friday", h2026.get("Good Friday"), "2026-04-03");
check("Easter Monday", h2026.get("Easter Monday"), "2026-04-06");
check("Victoria Day", h2026.get("Victoria Day"), "2026-05-18");
check("Saint-Jean-Baptiste Day", h2026.get("Saint-Jean-Baptiste Day"), "2026-06-24");
check("Canada Day", h2026.get("Canada Day"), "2026-07-01");
check("Labour Day", h2026.get("Labour Day"), "2026-09-07");
check(
  "Truth and Reconciliation",
  h2026.get("National Day for Truth and Reconciliation"),
  "2026-09-30",
);
check("Thanksgiving Day", h2026.get("Thanksgiving Day"), "2026-10-12");
check("JBNQA Day", h2026.get("JBNQA Day"), "2026-11-11");
// June 21 2026 is a Sunday, so the day off shifts to Monday June 22.
check(
  "Indigenous Peoples Day (observed)",
  h2026.get("National Indigenous Peoples Day (observed)"),
  "2026-06-22",
);

console.log("\n=== Christmas closure 2026 ===");
const christmas = getHolidayPeriods(2026).filter(
  (p) => p.name === "Christmas Holidays",
);
check(
  "January span (tail of 2025 closure)",
  [christmas[0].start, christmas[0].end, christmas[0].days],
  ["2026-01-01", "2026-01-02", 2],
);
check(
  "December span",
  [christmas[1].start, christmas[1].end, christmas[1].days],
  ["2026-12-22", "2026-12-31", 8],
);

console.log("\n=== Day counting ===");
check(
  "Mon–Fri single week = 5 days",
  countLeaveDays({ startDate: "2026-03-02", endDate: "2026-03-06" })
    .chargeableDays,
  5,
);
check(
  "Two weeks spanning a weekend = 10 days",
  countLeaveDays({ startDate: "2026-03-02", endDate: "2026-03-13" })
    .chargeableDays,
  10,
);
check(
  "Week containing Canada Day (Wed) = 4 days",
  countLeaveDays({ startDate: "2026-06-29", endDate: "2026-07-03" })
    .chargeableDays,
  4,
);
check(
  "Easter week Apr 3 (Fri) + Apr 6 (Mon) both free",
  countLeaveDays({ startDate: "2026-04-03", endDate: "2026-04-06" })
    .chargeableDays,
  0,
);
check(
  "Half day",
  countLeaveDays({
    startDate: "2026-03-02",
    endDate: "2026-03-02",
    halfDay: true,
  }).chargeableDays,
  0.5,
);
check(
  "Weekend only = 0 days",
  countLeaveDays({ startDate: "2026-03-07", endDate: "2026-03-08" })
    .chargeableDays,
  0,
);
check(
  "Christmas closure Dec 21 2026 – Jan 1 2027 charges only Dec 21",
  countLeaveDays({ startDate: "2026-12-21", endDate: "2027-01-01" })
    .chargeableDays,
  1,
);

console.log("\n=== Balances ===");
const balances = computeBalances([
  { leaveType: "vacation", status: "approved", dayCount: "5.0" },
  { leaveType: "vacation", status: "pending", dayCount: "3.0" },
  { leaveType: "vacation", status: "cancelled", dayCount: "4.0" },
  { leaveType: "vacation", status: "declined", dayCount: "2.0" },
  { leaveType: "sick", status: "recorded", dayCount: "1.5" },
]);
check("Vacation taken", balances.vacation.used, 5);
check("Vacation pending", balances.vacation.pending, 3);
check("Vacation remaining of 20", balances.vacation.remaining, 12);
check("Sick used", balances.sick.used, 1.5);
check("Sick remaining of 12", balances.sick.remaining, 10.5);

console.log("\n=== Calendar grids ===");
const grids = buildMonthGrids(2026);
check("12 months generated", grids.length, 12);
check("January 2026 starts on Thursday", grids[0].weeks[0].slice(0, 5), [
  null,
  null,
  null,
  null,
  "2026-01-01",
]);
check(
  "Every month is padded to whole weeks",
  grids.every((m) => m.weeks.every((w) => w.length === 7)),
  true,
);
check(
  "February 2026 has 28 days",
  grids[1].weeks.flat().filter(Boolean).length,
  28,
);

console.log("\n=== Calendar day marking ===");
const calendar = buildCalendarDays({
  year: 2026,
  requests: [
    {
      id: "r1",
      employeeName: "Shaun Annanack",
      leaveType: "vacation",
      // Spans a weekend and Canada Day (Wed Jul 1).
      startDate: "2026-06-29",
      endDate: "2026-07-03",
      status: "approved",
      halfDay: false,
    },
    {
      id: "r2",
      employeeName: "Shaun Annanack",
      leaveType: "sick",
      startDate: "2026-03-02",
      endDate: "2026-03-02",
      status: "recorded",
      halfDay: false,
    },
    {
      id: "r3",
      employeeName: "Shaun Annanack",
      leaveType: "vacation",
      startDate: "2026-05-11",
      endDate: "2026-05-12",
      status: "cancelled",
      halfDay: false,
    },
  ],
});

check("Vacation day marked", calendar.get("2026-06-29")?.kind, "vacation");
check("Sick day marked", calendar.get("2026-03-02")?.kind, "sick");
check(
  "Holiday overrides vacation booked across it",
  calendar.get("2026-07-01")?.kind,
  "holiday",
);
check("Weekend inside a range stays unmarked", calendar.has("2026-07-04"), false);
check("Cancelled request is not shown", calendar.has("2026-05-11"), false);

const calendarTotals = countCalendarDays(calendar);
// Jun 29, 30 and Jul 2, 3 are chargeable; Jul 1 is the holiday.
check("Vacation days on calendar", calendarTotals.vacation, 4);
check("Sick days on calendar", calendarTotals.sick, 1);
check("Paid holidays on calendar", calendarTotals.holidays, 20);

console.log(
  failures === 0
    ? "\nAll checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
