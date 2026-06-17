import { auth } from "@/auth";
import { TravelClaimForm } from "./TravelClaimForm";

export const metadata = { title: "New Travel Claim — Heritage Lab" };

export default async function NewClaimPage() {
  const session = await auth();
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold text-hl-ink">
          New Travel Expense Claim
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Submitted claims are emailed directly to{" "}
          <span className="font-medium text-hl-ink">
            payments@heritagelab.ca
          </span>{" "}
          with a PDF attached. Claims must be submitted within 60 days of trip
          completion.
        </p>
      </div>
      <TravelClaimForm
        defaultName={session?.user?.name ?? ""}
        defaultEmail={session?.user?.email ?? ""}
      />
    </div>
  );
}
