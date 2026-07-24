import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Check your email — Heritage Lab" };

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-hl-cream px-4">
      <div className="hl-card w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <Logo height={36} priority />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-hl-ink">
          Check your email
        </h1>
        <p className="mt-3 text-sm text-hl-muted">
          We just sent a sign-in link to your inbox. Click the button in the
          email to access the Intranet. The link expires in 30 minutes.
        </p>
        <p className="mt-6 text-xs text-hl-muted">
          Didn&apos;t get it? Check your spam folder, or{" "}
          <Link
            href="/signin"
            className="font-medium text-hl-green-700 underline-offset-2 hover:underline"
          >
            request a new link
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
