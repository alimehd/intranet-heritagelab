import Link from "next/link";
import { auth } from "@/auth";
import { ArrowLeft } from "lucide-react";
import { findLeaveEmployee } from "@/lib/leave/people";
import { getBalancesFor } from "@/lib/leave/queries";
import { LEAVE_POLICY } from "@/lib/leave/schema";
import { LeaveRequestForm } from "./LeaveRequestForm";

export const metadata = { title: "Book Time Off — Heritage Lab" };

export default async function NewLeavePage() {
  const session = await auth();
  const employee = findLeaveEmployee(session?.user?.email);
  const leaveYear = new Date().getUTCFullYear();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/leave" className="hl-btn-ghost -ml-3 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to vacation &amp; sick days
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Book time off
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          {LEAVE_POLICY.vacationDaysPerYear} vacation days and{" "}
          {LEAVE_POLICY.sickDaysPerYear} sick days per calendar year. Weekends
          and paid holidays are never charged.
        </p>
      </div>

      {employee ? (
        <LeaveRequestForm
          balances={await getBalancesFor(employee.email, leaveYear)}
          minDate={`${leaveYear - 1}-01-01`}
          maxDate={`${leaveYear + 1}-12-31`}
        />
      ) : (
        <div className="hl-card p-6">
          <h2 className="text-lg font-semibold tracking-tight text-hl-ink">
            No entitlement on this account
          </h2>
          <p className="mt-1 text-sm text-hl-muted">
            Vacation and sick day tracking is enabled for specific staff
            accounts. If you should have an entitlement, contact{" "}
            <a
              className="font-medium text-hl-green-700 hover:underline"
              href="mailto:ali.mehdi@heritagelab.ca"
            >
              ali.mehdi@heritagelab.ca
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
