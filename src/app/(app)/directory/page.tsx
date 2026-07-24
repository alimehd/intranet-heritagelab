import { BookUser, Building2, Mail, Phone } from "lucide-react";

export const metadata = { title: "Directory — Heritage Lab" };

const planned = [
  {
    icon: Mail,
    title: "Names and work emails",
    description:
      "Everyone at Heritage Lab, searchable by name, team, or role.",
  },
  {
    icon: Building2,
    title: "Team and location",
    description: "Which team someone sits on and where they are based.",
  },
  {
    icon: Phone,
    title: "Contact details",
    description: "Work phone numbers and preferred way to reach someone.",
  },
];

export default function DirectoryPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-2 inline-flex rounded bg-hl-cream px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-hl-muted ring-1 ring-hl-border">
          Coming soon
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Directory
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          A contact list for Heritage Lab staff and board members.
        </p>
      </div>

      <div className="hl-card flex flex-col items-center px-6 py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-hl-green-50 text-hl-green-700">
          <BookUser className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-hl-ink">
          We&apos;re still building this
        </h2>
        <p className="mt-1 max-w-md text-sm text-hl-muted">
          The directory isn&apos;t available yet. In the meantime, reach out by
          email or ask an administrator for someone&apos;s contact details.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hl-muted">
          What it will include
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {planned.map((item) => (
            <div key={item.title} className="hl-card p-5">
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-hl-cream text-hl-muted">
                <item.icon className="h-4 w-4" />
              </span>
              <div className="font-semibold tracking-tight text-hl-ink">
                {item.title}
              </div>
              <p className="mt-1 text-sm text-hl-muted">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
