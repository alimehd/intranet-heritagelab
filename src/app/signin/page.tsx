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
              ? "Access is restricted to @heritagelab.ca Google accounts. Please sign in with your work email, or contact an administrator if you need an exception."
              : "Sign in failed. Please try again."}
          </div>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", {
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
              <path d="M21.6 12.227c0-.737-.066-1.444-.19-2.122H12v4.013h5.384a4.6 4.6 0 0 1-1.997 3.018v2.5h3.23c1.89-1.74 2.983-4.3 2.983-7.41z" />
              <path d="M12 22c2.7 0 4.964-.895 6.617-2.423l-3.23-2.5c-.895.6-2.04.954-3.387.954-2.605 0-4.81-1.76-5.6-4.123H3.07v2.59A10 10 0 0 0 12 22z" />
              <path d="M6.4 13.908a6.01 6.01 0 0 1 0-3.816V7.5H3.07a10 10 0 0 0 0 9l3.33-2.592z" />
              <path d="M12 5.96c1.47 0 2.787.506 3.823 1.498l2.866-2.866C16.96 2.99 14.697 2 12 2A10 10 0 0 0 3.07 7.5L6.4 10.09C7.19 7.728 9.395 5.96 12 5.96z" />
            </svg>
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-hl-muted">
          Sign in with your <strong>@heritagelab.ca</strong> Google account.
        </p>
      </div>
    </div>
  );
}
