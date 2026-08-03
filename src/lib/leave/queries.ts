import { db } from "@/lib/db";
import { leaveRequests } from "@/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import { computeBalances, type LeaveBalance, type LeaveType } from "./schema";

/**
 * Balances for one employee-year. Scoped by canonical email rather than user id
 * so an employee signing in through an alias still sees a single balance.
 */
export async function getBalancesFor(
  employeeEmail: string,
  leaveYear: number,
): Promise<Record<LeaveType, LeaveBalance>> {
  const rows = await db
    .select({
      leaveType: leaveRequests.leaveType,
      status: leaveRequests.status,
      dayCount: leaveRequests.dayCount,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeEmail, employeeEmail),
        eq(leaveRequests.leaveYear, leaveYear),
      ),
    );

  return computeBalances(rows);
}

/** Every request for an employee-year, newest first. */
export async function getRequestsFor(
  employeeEmail: string,
  leaveYear: number,
) {
  return db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeEmail, employeeEmail),
        eq(leaveRequests.leaveYear, leaveYear),
      ),
    )
    .orderBy(desc(leaveRequests.startDate));
}

/** Booked leave for everyone in a year, for the team view. Excludes cancelled. */
export async function getTeamRequestsFor(leaveYear: number) {
  return db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.leaveYear, leaveYear),
        ne(leaveRequests.status, "cancelled"),
      ),
    )
    .orderBy(desc(leaveRequests.startDate));
}
