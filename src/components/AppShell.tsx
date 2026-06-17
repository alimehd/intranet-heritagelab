import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import {
  LayoutDashboard,
  Plane,
  FileText,
  LogOut,
  BookOpen,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/travel-claims", label: "Travel Claims", icon: Plane },
  { href: "/travel-claims/new", label: "New Claim", icon: FileText },
  { href: "/policies", label: "Policies", icon: BookOpen },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="min-h-screen bg-hl-cream">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-hl-border bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-hl-border px-5 py-5">
          <Image
            src="/logo.png"
            alt="Heritage Lab"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
          <div className="leading-tight">
            <div className="font-serif text-lg font-semibold text-hl-ink">
              Heritage Lab
            </div>
            <div className="text-xs uppercase tracking-wider text-hl-muted">
              Intranet
            </div>
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
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Heritage Lab"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
            <div className="font-serif text-lg font-semibold">
              Heritage Lab Intranet
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
