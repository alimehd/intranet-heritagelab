export const metadata = { title: "Policies — Heritage Lab" };

const policies = [
  {
    title: "Travel & Expense Policy",
    description:
      "Per-diems, allowable expenses, receipt requirements, and reimbursement timelines.",
  },
  {
    title: "Code of Conduct",
    description: "Expectations for staff, board members, and contractors.",
  },
  {
    title: "Privacy & Data Handling",
    description:
      "How Heritage Lab collects, stores, and protects personal information.",
  },
  {
    title: "Conflict of Interest",
    description:
      "Disclosure obligations and procedures for board members and staff.",
  },
];

export default function PoliciesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold text-hl-ink">
          Policies
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Organizational policies and reference documents. Content coming soon.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {policies.map((p) => (
          <div key={p.title} className="hl-card p-5">
            <div className="mb-2 inline-flex rounded bg-hl-cream px-2 py-0.5 text-xs uppercase tracking-wider text-hl-muted">
              Coming soon
            </div>
            <h2 className="font-serif text-lg font-semibold text-hl-ink">
              {p.title}
            </h2>
            <p className="mt-1 text-sm text-hl-muted">{p.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
