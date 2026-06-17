import Image from "next/image";
import { auth, signIn } from "@/auth";
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
              ? "Access is restricted to @heritagelab.ca email addresses. Contact an administrator if you need an exception."
              : error === "Verification"
                ? "That sign-in link is no longer valid (it expired or was already used). Please request a new one."
                : "Sign in failed. Please try again."}
          </div>
        ) : null}

        <form
          action={async (formData: FormData) => {
            "use server";
            const email = String(formData.get("email") ?? "")
              .trim()
              .toLowerCase();
            if (!email) return;
            await signIn("resend", {
              email,
              redirectTo: callbackUrl || "/dashboard",
            });
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="email" className="hl-label">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@heritagelab.ca"
              className="hl-input"
            />
          </div>
          <button type="submit" className="hl-btn-primary w-full">
            Send sign-in link
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-hl-muted">
          We&apos;ll email you a one-time sign-in link. Access is restricted to{" "}
          <strong>@heritagelab.ca</strong> addresses.
        </p>
      </div>
    </div>
  );
}
