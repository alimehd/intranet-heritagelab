import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import { Logo } from "@/components/Logo";
import { isBoardMember } from "@/lib/roles";
import { BOARD_GENERAL_FOLDER } from "@/lib/resources";
import {
  LayoutDashboard,
  Plane,
  FileText,
  LogOut,
  BookOpen,
  Users,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/travel-claims", label: "Travel Claims", icon: Plane },
  { href: "/travel-claims/new", label: "New Claim", icon: FileText },
  { href: "/policies", label: "Resources", icon: BookOpen },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  const boardMember = isBoardMember(user?.email);

  return (
    <div className="min-h-screen bg-hl-cream">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-hl-border bg-white md:flex">
        <div className="border-b border-hl-border px-5 py-6">
          <Link href="/dashboard" className="block">
            <Logo height={28} priority />
          </Link>
          <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-hl-muted">
            Intranet
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-hl-ink transition hover:bg-hl-cream"
            >
              <item.icon className="h-4 w-4 text-hl-green-600" />
              {item.label}
            </Link>
          ))}
          {boardMember ? (
            <a
              href={BOARD_GENERAL_FOLDER.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-hl-ink transition hover:bg-hl-cream"
            >
              <Users className="h-4 w-4 text-hl-green-600" />
              Board Folder
            </a>
          ) : null}
        </nav>

        <div className="border-t border-hl-border p-4">
          <div className="mb-3 flex items-center gap-3">
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name ?? "User"}
                width={36}
                height={36}
                className="h-9 w-9 rounded-full"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-hl-green-600 text-center text-sm font-medium leading-9 text-white">
                {user?.name?.[0] ?? "U"}
              </div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-medium text-hl-ink">
                {user?.name ?? "Signed in"}
              </div>
              <div className="truncate text-xs text-hl-muted">
                {user?.email}
              </div>
              {boardMember ? (
                <div className="mt-1 inline-flex rounded bg-hl-green-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-hl-green-700">
                  Board
                </div>
              ) : null}
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/signin" });
            }}
          >
            <button className="hl-btn-ghost w-full justify-start" type="submit">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="md:ml-64">
        <header className="border-b border-hl-border bg-white/80 px-6 py-4 backdrop-blur md:hidden">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Logo height={24} priority />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-hl-muted">
              Intranet
            </span>
          </Link>
        </header>
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
