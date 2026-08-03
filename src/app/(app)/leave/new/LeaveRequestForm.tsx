"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus, Info, TriangleAlert } from "lucide-react";
import { formatDays, formatLong, pluralDays } from "@/lib/leave/dates";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  countLeaveDays,
  requiresApproval,
  round1,
  type LeaveBalance,
  type LeaveType,
} from "@/lib/leave/schema";
import { submitLeaveRequest, type LeaveSubmitState } from "../actions";

export function LeaveRequestForm({
  balances,
  minDate,
  maxDate,
}: {
  balances: Record<LeaveType, LeaveBalance>;
  /** Bounds the native date picker to the years the app tracks. */
  minDate: string;
  maxDate: string;
}) {
  const [leaveType, setLeaveType] = useState<LeaveType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState("");

  const [state, setState] = useState<LeaveSubmitState | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const singleDay = startDate !== "" && startDate === endDate;
  const effectiveHalfDay = halfDay && singleDay;

  const breakdown = useMemo(
    () =>
      countLeaveDays({
        startDate,
        endDate: endDate || startDate,
        halfDay: effectiveHalfDay,
      }),
    [startDate, endDate, effectiveHalfDay],
  );

  const balance = balances[leaveType];
  const charged = breakdown.chargeableDays;
  const remainingAfter = round1(balance.remaining - charged);
  const overdrawn = charged > balance.remaining;
  const blocksSubmit = overdrawn && requiresApproval(leaveType);

  const excludedHolidays = breakdown.days.filter(
    (d) => d.excluded === "holiday",
  );
  const excludedWeekends = breakdown.weekendDays;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState(undefined);

    const fd = new FormData();
    fd.append("leaveType", leaveType);
    fd.append("startDate", startDate);
    fd.append("endDate", endDate || startDate);
    fd.append("halfDay", effectiveHalfDay ? "true" : "false");
    fd.append("reason", reason);

    startTransition(async () => {
      const res = await submitLeaveRequest(undefined, fd);
      setState(res);
    });
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="hl-card p-6">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-hl-green-700">
          What are you booking?
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          {LEAVE_TYPES.map((type) => {
            const b = balances[type];
            const selected = leaveType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setLeaveType(type)}
                aria-pressed={selected}
                className={`rounded-md border p-4 text-left transition ${
                  selected
                    ? "border-hl-green-600 bg-hl-green-50 ring-2 ring-hl-green-600/20"
                    : "border-hl-border bg-white hover:border-hl-green-300"
                }`}
              >
                <div className="font-medium text-hl-ink">
                  {LEAVE_TYPE_LABELS[type]}
                </div>
                <div className="mt-1 text-sm text-hl-muted">
                  {formatDays(b.remaining)} of {formatDays(b.entitled)} days
                  left
                </div>
                <div className="mt-1 text-xs text-hl-muted">
                  {requiresApproval(type)
                    ? "Needs approval"
                    : "Recorded immediately"}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="hl-card p-6">
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-hl-green-700">
          Dates
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="hl-label" htmlFor="startDate">
              First day
            </label>
            <input
              id="startDate"
              type="date"
              required
              min={minDate}
              max={maxDate}
              className="hl-input"
              value={startDate}
              onChange={(e) => {
                const value = e.target.value;
                setStartDate(value);
                // Keep the range valid as the user picks dates.
                if (!endDate || endDate < value) setEndDate(value);
              }}
            />
            {fieldError("startDate") ? (
              <p className="mt-1 text-xs text-red-700">
                {fieldError("startDate")}
              </p>
            ) : null}
          </div>

          <div>
            <label className="hl-label" htmlFor="endDate">
              Last day
            </label>
            <input
              id="endDate"
              type="date"
              required
              min={startDate || minDate}
              max={maxDate}
              className="hl-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {fieldError("endDate") ? (
              <p className="mt-1 text-xs text-red-700">
                {fieldError("endDate")}
              </p>
            ) : null}
          </div>
        </div>

        <label
          className={`mt-4 flex items-start gap-2 text-sm ${
            singleDay ? "text-hl-ink" : "cursor-not-allowed text-hl-muted"
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={effectiveHalfDay}
            disabled={!singleDay}
            onChange={(e) => setHalfDay(e.target.checked)}
          />
          <span>
            Half day
            <span className="block text-xs text-hl-muted">
              {singleDay
                ? "Charges 0.5 days instead of a full day."
                : "Available when the first and last day are the same."}
            </span>
          </span>
        </label>

        {startDate ? (
          <div className="mt-4 rounded-md border border-hl-border bg-hl-cream/60 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-hl-muted">
                This request charges
              </span>
              <span className="text-2xl font-semibold tabular-nums text-hl-ink">
                {pluralDays(charged)}
              </span>
            </div>

            {excludedWeekends > 0 || excludedHolidays.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-hl-border pt-3 text-xs text-hl-muted">
                {excludedWeekends > 0 ? (
                  <li>
                    {excludedWeekends} weekend day
                    {excludedWeekends === 1 ? "" : "s"} not charged
                  </li>
                ) : null}
                {excludedHolidays.map((d) => (
                  <li key={d.date}>
                    {formatLong(d.date)} — {d.holidayName} (paid holiday, not
                    charged)
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-3 border-t border-hl-border pt-3 text-sm">
              <span className="text-hl-muted">
                {LEAVE_TYPE_LABELS[leaveType]} remaining after this request:{" "}
              </span>
              <span
                className={`font-semibold tabular-nums ${
                  remainingAfter < 0 ? "text-red-700" : "text-hl-ink"
                }`}
              >
                {formatDays(remainingAfter)} of {formatDays(balance.entitled)}
              </span>
            </div>
          </div>
        ) : null}

        {overdrawn ? (
          <div
            className={`mt-4 flex gap-2 rounded-md border px-3 py-2 text-sm ${
              blocksSubmit
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {blocksSubmit
                ? `This exceeds your remaining vacation by ${pluralDays(round1(charged - balance.remaining))}. Shorten the request to submit it.`
                : `This puts you ${pluralDays(round1(charged - balance.remaining))} over the ${formatDays(balance.entitled)}-day sick leave entitlement. You can still submit it, and the extra days will be flagged for review.`}
            </span>
          </div>
        ) : null}
      </section>

      <section className="hl-card p-6">
        <label className="hl-label" htmlFor="reason">
          {leaveType === "vacation"
            ? "Note for your approver (optional)"
            : "Note (optional)"}
        </label>
        <textarea
          id="reason"
          className="hl-input min-h-[80px]"
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            leaveType === "vacation"
              ? "e.g. family trip — Ashley has coverage for the Kuujjuaq visit"
              : "e.g. flu, medical appointment (no detail required)"
          }
        />
        <p className="mt-2 flex gap-2 text-xs text-hl-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {requiresApproval(leaveType)
              ? "Submitting emails your request to ali.mehdi@heritagelab.ca for approval, and copies you."
              : "Submitting records the days and emails ali.mehdi@heritagelab.ca for the records. No approval needed."}
          </span>
        </p>
      </section>

      {state?.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || blocksSubmit || !startDate}
          className="hl-btn-primary"
        >
          <CalendarPlus className="h-4 w-4" />
          {pending
            ? "Submitting…"
            : requiresApproval(leaveType)
              ? "Submit request"
              : "Record sick leave"}
        </button>
        <span className="text-sm text-hl-muted">
          {charged > 0 ? pluralDays(charged) : "No chargeable days yet"}
        </span>
      </div>
    </form>
  );
}
