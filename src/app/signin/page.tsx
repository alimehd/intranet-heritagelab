import Image from "next/image";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

type SearchParams = Promise<{ callbackUrl?: string; error?: string }>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const { callbackUrl, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-hl-cream px-4">
      <div className="hl-card w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image
            src="/logo.png"
            alt="Heritage Lab"
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
          />
          <div className="text-center">
            <h1 className="font-serif text-2xl font-semibold text-hl-ink">
              Heritage Lab Intranet
            </h1>
            <p className="mt-1 text-sm text-hl-muted">
              Internal tools for staff and board members.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error === "AccessDenied"
              ? "Access is restricted to @heritagelab.ca accounts. Please sign in with your work email, or contact an administrator if you need an exception."
              : "Sign in failed. Please try again."}
          </div>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("auth0", {
              redirectTo: callbackUrl || "/dashboard",
            });
          }}
        >
          <button type="submit" className="hl-btn-primary w-full">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              aria-hidden
              fill="currentColor"
            >
              <path d="M3 3h8.5v8.5H3V3zm9.5 0H21v8.5h-8.5V3zM3 12.5h8.5V21H3v-8.5zm9.5 0H21V21h-8.5v-8.5z" />
            </svg>
            Sign in with Heritage Lab SSO
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-hl-muted">
          Sign in with your <strong>@heritagelab.ca</strong> account.
        </p>
      </div>
    </div>
  );
}
