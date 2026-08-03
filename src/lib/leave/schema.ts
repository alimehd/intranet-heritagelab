import { z } from "zod";
import { eachDay, isValidISO, isWeekend, yearOf } from "./dates";
import { getHolidayMap, type Holiday } from "./holidays";

/** Annual entitlements, per calendar year. */
export const LEAVE_POLICY = {
  vacationDaysPerYear: 20,
  sickDaysPerYear: 12,
} as const;

export const LEAVE_TYPES = ["vacation", "sick"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  vacation: "Vacation",
  sick: "Sick leave",
};

export function entitlementFor(type: LeaveType): number {
  return type === "vacation"
    ? LEAVE_POLICY.vacationDaysPerYear
    : LEAVE_POLICY.sickDaysPerYear;
}

/**
 * Vacation is booked ahead and needs sign-off; sick leave is reported after the
 * fact and is only recorded, never approved.
 */
export function requiresApproval(type: LeaveType): boolean {
  return type === "vacation";
}

export const LEAVE_STATUSES = [
  "pending",
  "approved",
  "declined",
  "recorded",
  "cancelled",
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** Statuses that draw down the annual entitlement. */
const CONSUMING_STATUSES = new Set<string>(["pending", "approved", "recorded"]);

export function consumesEntitlement(status: string): boolean {
  return CONSUMING_STATUSES.has(status);
}

export function initialStatus(type: LeaveType): LeaveStatus {
  return requiresApproval(type) ? "pending" : "recorded";
}

// ---------- Day counting ----------

export type CountedDay = {
  date: string;
  /** Why the day isn't chargeable, when it isn't. */
  excluded?: "weekend" | "holiday";
  holidayName?: string;
};

export type LeaveDayBreakdown = {
  days: CountedDay[];
  /** Chargeable working days, after the half-day adjustment. */
  chargeableDays: number;
  workingDays: number;
  weekendDays: number;
  holidays: Holiday[];
};

/**
 * Counts the working days in a request, excluding weekends and paid holidays so
 * a week off over Christmas doesn't burn vacation days.
 */
export function countLeaveDays(args: {
  startDate: string;
  endDate: string;
  halfDay?: boolean;
}): LeaveDayBreakdown {
  const { startDate, endDate, halfDay = false } = args;
  const empty: LeaveDayBreakdown = {
    days: [],
    chargeableDays: 0,
    workingDays: 0,
    weekendDays: 0,
    holidays: [],
  };
  if (!isValidISO(startDate) || !isValidISO(endDate) || endDate < startDate) {
    return empty;
  }

  // A range can straddle New Year, so pull holidays for every year it touches.
  const holidayMap = new Map<string, Holiday>();
  for (let y = yearOf(startDate); y <= yearOf(endDate); y++) {
    for (const [date, holiday] of getHolidayMap(y)) holidayMap.set(date, holiday);
  }

  const days: CountedDay[] = [];
  const holidays: Holiday[] = [];
  let workingDays = 0;
  let weekendDays = 0;

  for (const date of eachDay(startDate, endDate)) {
    if (isWeekend(date)) {
      weekendDays += 1;
      days.push({ date, excluded: "weekend" });
      continue;
    }
    const holiday = holidayMap.get(date);
    if (holiday) {
      holidays.push(holiday);
      days.push({ date, excluded: "holiday", holidayName: holiday.name });
      continue;
    }
    workingDays += 1;
    days.push({ date });
  }

  // A half day is only meaningful on a single chargeable working day.
  const chargeableDays =
    halfDay && workingDays === 1 ? 0.5 : workingDays;

  return { days, chargeableDays, workingDays, weekendDays, holidays };
}

// ---------- Request validation ----------

const isoDate = z
  .string()
  .trim()
  .refine(isValidISO, "Date must be a valid YYYY-MM-DD date");

export const leaveRequestSchema = z
  .object({
    leaveType: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    halfDay: z.boolean().default(false),
    reason: z.string().trim().max(1000).optional().default(""),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine((d) => yearOf(d.startDate) === yearOf(d.endDate), {
    // Entitlements are per calendar year, so a request must sit in one year.
    message:
      "A request cannot span two calendar years. Please submit one request per year.",
    path: ["endDate"],
  })
  .refine((d) => !d.halfDay || d.startDate === d.endDate, {
    message: "A half day applies to a single date only",
    path: ["halfDay"],
  })
  .refine(
    (d) =>
      countLeaveDays({
        startDate: d.startDate,
        endDate: d.endDate,
        halfDay: d.halfDay,
      }).chargeableDays > 0,
    {
      message:
        "That range contains no working days — it falls entirely on weekends or paid holidays.",
      path: ["startDate"],
    },
  );

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

// ---------- Balances ----------

export type LeaveBalance = {
  type: LeaveType;
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
};

type BalanceRow = {
  leaveType: string;
  status: string;
  dayCount: string | number;
};

/** Rolls request rows for one employee-year into per-type balances. */
export function computeBalances(rows: BalanceRow[]): Record<LeaveType, LeaveBalance> {
  const balances = Object.fromEntries(
    LEAVE_TYPES.map((type) => [
      type,
      {
        type,
        entitled: entitlementFor(type),
        used: 0,
        pending: 0,
        remaining: entitlementFor(type),
      },
    ]),
  ) as Record<LeaveType, LeaveBalance>;

  for (const row of rows) {
    const type = row.leaveType as LeaveType;
    const balance = balances[type];
    if (!balance || !consumesEntitlement(row.status)) continue;

    const days = Number(row.dayCount) || 0;
    if (row.status === "pending") balance.pending += days;
    else balance.used += days;
  }

  for (const balance of Object.values(balances)) {
    balance.remaining = round1(
      balance.entitled - balance.used - balance.pending,
    );
    balance.used = round1(balance.used);
    balance.pending = round1(balance.pending);
  }

  return balances;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
