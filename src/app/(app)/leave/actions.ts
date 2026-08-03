"use server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { leaveRequests } from "@/lib/db/schema";
import { pluralDays } from "@/lib/leave/dates";
import {
  emailLeaveCancellation,
  emailLeaveDecision,
  emailLeaveRequest,
} from "@/lib/leave/email";
import {
  canApproveLeave,
  canonicalLeaveEmail,
  findLeaveEmployee,
} from "@/lib/leave/people";
import { getBalancesFor } from "@/lib/leave/queries";
import {
  LEAVE_TYPE_LABELS,
  countLeaveDays,
  initialStatus,
  leaveRequestSchema,
  requiresApproval,
  type LeaveType,
} from "@/lib/leave/schema";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type LeaveSubmitState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
};

export async function submitLeaveRequest(
  _prev: LeaveSubmitState | undefined,
  formData: FormData,
): Promise<LeaveSubmitState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return { ok: false, error: "You must be signed in to book leave." };
  }

  const employee = findLeaveEmployee(session.user.email);
  if (!employee) {
    return {
      ok: false,
      error:
        "Your account does not have a leave entitlement configured. Contact ali.mehdi@heritagelab.ca.",
    };
  }

  const parsed = leaveRequestSchema.safeParse({
    leaveType: formData.get("leaveType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    halfDay: formData.get("halfDay") === "on" || formData.get("halfDay") === "true",
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".") || "form"] = issue.message;
    }
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const input = parsed.data;
  const leaveType = input.leaveType as LeaveType;
  const { chargeableDays } = countLeaveDays(input);
  const leaveYear = Number(input.startDate.slice(0, 4));

  const overlap = await findOverlappingRequest({
    employeeEmail: employee.email,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (overlap) {
    return {
      ok: false,
      error: `These dates overlap leave you already have booked (${overlap.startDate} → ${overlap.endDate}). Cancel that entry first if you need to change it.`,
    };
  }

  const before = await getBalancesFor(employee.email, leaveYear);
  const balanceBefore = before[leaveType];

  // Vacation cannot be overdrawn. Sick leave can, because an employee may
  // genuinely be ill beyond the entitlement and the record must stay accurate.
  if (requiresApproval(leaveType) && chargeableDays > balanceBefore.remaining) {
    return {
      ok: false,
      error: `That request is ${pluralDays(chargeableDays)}, but only ${pluralDays(balanceBefore.remaining)} of ${leaveYear} ${LEAVE_TYPE_LABELS[leaveType].toLowerCase()} remain.`,
    };
  }

  const status = initialStatus(leaveType);
  const submittedAt = new Date();

  const [inserted] = await db
    .insert(leaveRequests)
    .values({
      userId: session.user.id,
      employeeEmail: employee.email,
      employeeName: employee.name,
      leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDay: input.halfDay,
      dayCount: chargeableDays.toFixed(1),
      leaveYear,
      reason: input.reason || null,
      status,
    })
    .returning({ id: leaveRequests.id });

  const after = await getBalancesFor(employee.email, leaveYear);

  try {
    const { id: messageId } = await emailLeaveRequest({
      requestId: inserted.id,
      employeeName: employee.name,
      employeeEmail: employee.email,
      leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      dayCount: chargeableDays,
      halfDay: input.halfDay,
      reason: input.reason,
      balance: after[leaveType],
      leaveYear,
      submittedAt,
    });
    await db
      .update(leaveRequests)
      .set({ emailMessageId: messageId })
      .where(eq(leaveRequests.id, inserted.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(leaveRequests)
      .set({ emailError: msg })
      .where(eq(leaveRequests.id, inserted.id));
    return {
      ok: false,
      error: `Your leave was saved, but the notification email failed: ${msg}`,
      requestId: inserted.id,
    };
  }

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  redirect(`/leave/${inserted.id}?submitted=1`);
}

export type LeaveDecisionState = { ok: boolean; error?: string };

export async function decideLeaveRequest(
  _prev: LeaveDecisionState | undefined,
  formData: FormData,
): Promise<LeaveDecisionState> {
  const session = await auth();
  const actor = session?.user?.email;
  if (!session?.user?.id || !actor) {
    return { ok: false, error: "You must be signed in to review leave." };
  }
  if (!canApproveLeave(actor)) {
    return {
      ok: false,
      error: "You do not have permission to approve or decline leave.",
    };
  }

  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!requestId) return { ok: false, error: "Missing leave reference." };
  if (decision !== "approved" && decision !== "declined") {
    return { ok: false, error: "Decision must be approve or decline." };
  }

  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 500);

  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .limit(1);

  if (!row) return { ok: false, error: "Leave request not found." };
  if (row.status !== "pending") {
    return {
      ok: false,
      error: `This request is already ${row.status} and cannot be reviewed again.`,
    };
  }

  const leaveType = row.leaveType as LeaveType;
  const dayCount = Number(row.dayCount);

  if (decision === "approved") {
    const balances = await getBalancesFor(row.employeeEmail, row.leaveYear);
    // The pending days are already counted, so add them back before comparing.
    const availableExcludingThis =
      balances[leaveType].remaining + dayCount;
    if (dayCount > availableExcludingThis) {
      return {
        ok: false,
        error: `Approving this would overdraw the ${row.leaveYear} entitlement.`,
      };
    }
  }

  const decidedAt = new Date();
  await db
    .update(leaveRequests)
    .set({
      status: decision,
      decidedAt,
      decidedBy: actor,
      decisionNote: note || null,
    })
    .where(eq(leaveRequests.id, requestId));

  const after = await getBalancesFor(row.employeeEmail, row.leaveYear);

  try {
    await emailLeaveDecision({
      requestId,
      employeeName: row.employeeName,
      employeeEmail: row.employeeEmail,
      leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      dayCount,
      halfDay: row.halfDay,
      reason: row.reason ?? "",
      balance: after[leaveType],
      leaveYear: row.leaveYear,
      decision,
      decidedBy: actor,
      decidedAt,
      decisionNote: note,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(leaveRequests)
      .set({ emailError: `Decision notice failed: ${msg}` })
      .where(eq(leaveRequests.id, requestId));
    return {
      ok: false,
      error: `The decision was saved, but notifying ${row.employeeEmail} failed: ${msg}`,
    };
  }

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  revalidatePath(`/leave/${requestId}`);
  return { ok: true };
}

export type LeaveCancelState = { ok: boolean; error?: string };

export async function cancelLeaveRequest(
  _prev: LeaveCancelState | undefined,
  formData: FormData,
): Promise<LeaveCancelState> {
  const session = await auth();
  const actor = session?.user?.email;
  if (!session?.user?.id || !actor) {
    return { ok: false, error: "You must be signed in to cancel leave." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { ok: false, error: "Missing leave reference." };

  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 500);

  const [row] = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.id, requestId))
    .limit(1);

  if (!row) return { ok: false, error: "Leave request not found." };

  // Employees can withdraw their own leave; approvers can cancel anyone's.
  const isOwn = row.employeeEmail === canonicalLeaveEmail(actor);
  if (!isOwn && !canApproveLeave(actor)) {
    return {
      ok: false,
      error: "You do not have permission to cancel this leave.",
    };
  }
  if (row.status === "cancelled") {
    return { ok: false, error: "This leave is already cancelled." };
  }
  if (row.status === "declined") {
    return {
      ok: false,
      error: "A declined request does not need to be cancelled.",
    };
  }

  const cancelledAt = new Date();
  await db
    .update(leaveRequests)
    .set({
      status: "cancelled",
      cancelledAt,
      cancelledBy: actor,
      cancelReason: reason || null,
    })
    .where(eq(leaveRequests.id, requestId));

  const leaveType = row.leaveType as LeaveType;
  const after = await getBalancesFor(row.employeeEmail, row.leaveYear);

  try {
    await emailLeaveCancellation({
      requestId,
      employeeName: row.employeeName,
      employeeEmail: row.employeeEmail,
      leaveType,
      startDate: row.startDate,
      endDate: row.endDate,
      dayCount: Number(row.dayCount),
      halfDay: row.halfDay,
      reason: row.reason ?? "",
      balance: after[leaveType],
      leaveYear: row.leaveYear,
      cancelledBy: actor,
      cancelledAt,
      cancelReason: reason,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(leaveRequests)
      .set({ emailError: `Cancellation notice failed: ${msg}` })
      .where(eq(leaveRequests.id, requestId));
    return {
      ok: false,
      error: `The leave was cancelled, but sending the notice failed: ${msg}`,
    };
  }

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  revalidatePath(`/leave/${requestId}`);
  return { ok: true };
}

/**
 * Finds live leave for the same employee that overlaps the given range, so the
 * same day can't be booked twice.
 */
async function findOverlappingRequest(args: {
  employeeEmail: string;
  startDate: string;
  endDate: string;
}) {
  const { employeeEmail, startDate, endDate } = args;
  const rows = await db
    .select({
      id: leaveRequests.id,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
    })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeEmail, employeeEmail),
        ne(leaveRequests.status, "cancelled"),
        ne(leaveRequests.status, "declined"),
      ),
    );

  // ISO dates compare correctly as strings.
  return rows.find((r) => r.startDate <= endDate && r.endDate >= startDate) ?? null;
}
