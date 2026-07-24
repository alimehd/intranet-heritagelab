import { auth } from "@/auth";
import { isBoardMember } from "@/lib/roles";
import {
  BOARD_GENERAL_FOLDER,
  BUSINESS_TRAVEL_POLICY,
  type Resource,
} from "@/lib/resources";
import { ArrowUpRight, FileText, FolderOpen } from "lucide-react";

export const metadata = { title: "Resources — Heritage Lab" };

export default async function PoliciesPage() {
  const session = await auth();
  const boardMember = isBoardMember(session?.user?.email);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-hl-ink">
          Resources
        </h1>
        <p className="mt-1 text-sm text-hl-muted">
          Policies and shared documents for Heritage Lab staff and board.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hl-muted">
          Policies
        </h2>
        <ResourceCard resource={BUSINESS_TRAVEL_POLICY} />
      </section>

      {boardMember ? (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-hl-muted">
            Board of Directors
          </h2>
          <ResourceCard resource={BOARD_GENERAL_FOLDER} />
        </section>
      ) : null}
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const Icon = resource.kind === "folder" ? FolderOpen : FileText;
  return (
    <a
      href={resource.href}
      target="_blank"
      rel="noopener noreferrer"
      className="hl-card group flex items-start gap-4 p-5 transition hover:border-hl-green-600 hover:shadow-md"
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-hl-green-50 text-hl-green-700">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold tracking-tight text-hl-ink group-hover:text-hl-green-700">
          {resource.title}
          <ArrowUpRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
        </span>
        <span className="mt-1 block text-sm text-hl-muted">
          {resource.description}
        </span>
      </span>
    </a>
  );
}
