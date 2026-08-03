import {
  daysInMonth,
  eachDay,
  isWeekend,
  makeISO,
  MONTH_NAMES,
  weekday,
} from "./dates";
import { getHolidays } from "./holidays";
import { LEAVE_TYPE_LABELS, type LeaveType } from "./schema";

export type CalendarDayKind = "holiday" | "vacation" | "sick";

export type CalendarDay = {
  date: string;
  kind: CalendarDayKind;
  /** Present for leave days: pending | approved | recorded | declined. */
  status?: string;
  requestId?: string;
  employeeName?: string;
  /** Human-readable summary used as the day's tooltip. */
  label: string;
};

type CalendarRequest = {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
  halfDay: boolean;
};

/**
 * Maps every marked day of a year to what should be shown on it.
 *
 * Holidays win over leave: a day inside a booked range that happens to be a
 * paid holiday is not charged, so showing it as vacation would misrepresent the
 * balance. Weekends inside a range are left unmarked for the same reason.
 */
export function buildCalendarDays(args: {
  year: number;
  requests: CalendarRequest[];
  /** Include the employee name in labels, for the team-wide view. */
  showEmployee?: boolean;
}): Map<string, CalendarDay> {
  const { year, requests, showEmployee = false } = args;
  const days = new Map<string, CalendarDay>();

  for (const request of requests) {
    if (request.status === "cancelled" || request.status === "declined") {
      continue;
    }
    const kind = request.leaveType as LeaveType;
    if (kind !== "vacation" && kind !== "sick") continue;

    const who = showEmployee ? `${request.employeeName} — ` : "";
    const typeLabel = LEAVE_TYPE_LABELS[kind];
    const suffix =
      request.status === "pending"
        ? " (awaiting approval)"
        : request.halfDay
          ? " (half day)"
          : "";

    for (const date of eachDay(request.startDate, request.endDate)) {
      if (!date.startsWith(String(year))) continue;
      if (isWeekend(date)) continue;
      days.set(date, {
        date,
        kind,
        status: request.status,
        requestId: request.id,
        employeeName: request.employeeName,
        label: `${who}${typeLabel}${suffix}`,
      });
    }
  }

  // Applied last so a paid holiday always overrides any leave booked over it.
  for (const holiday of getHolidays(year)) {
    days.set(holiday.date, {
      date: holiday.date,
      kind: "holiday",
      label: `${holiday.name} — office closed`,
    });
  }

  return days;
}

export type CalendarMonth = {
  month: number;
  name: string;
  /** Weeks of 7 slots, Sunday first. Null pads the days outside the month. */
  weeks: (string | null)[][];
};

/** Builds the 12 month grids for a year, each padded to whole Sunday weeks. */
export function buildMonthGrids(year: number): CalendarMonth[] {
  const months: CalendarMonth[] = [];

  for (let month = 1; month <= 12; month++) {
    const first = makeISO(year, month, 1);
    const last = makeISO(year, month, daysInMonth(year, month));

    // Pad the start so the 1st lands under its weekday column.
    const slots: (string | null)[] = [
      ...Array<null>(weekday(first)).fill(null),
      ...eachDay(first, last),
    ];
    while (slots.length % 7 !== 0) slots.push(null);

    const weeks: (string | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

    months.push({ month, name: MONTH_NAMES[month - 1], weeks });
  }

  return months;
}

export type CalendarTotals = {
  vacation: number;
  sick: number;
  holidays: number;
};

/** Counts marked days by kind, for the summary line above the grid. */
export function countCalendarDays(
  days: Map<string, CalendarDay>,
): CalendarTotals {
  const totals: CalendarTotals = { vacation: 0, sick: 0, holidays: 0 };
  for (const day of days.values()) {
    if (day.kind === "holiday") totals.holidays += 1;
    else if (day.kind === "vacation") totals.vacation += 1;
    else totals.sick += 1;
  }
  return totals;
}
