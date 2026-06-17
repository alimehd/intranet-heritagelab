import NextAuth from "next-auth";
import ResendProvider from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { isEmailAllowed } from "@/lib/allowlist";
import { getMailFrom } from "@/lib/email";
import { renderMagicLinkEmail } from "@/lib/auth/magic-link-email";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    ResendProvider({
      apiKey: process.env.RESEND_API_KEY,
      from: getMailFrom(),
      // 30 minutes
      maxAge: 60 * 30,
      async sendVerificationRequest({ identifier, url, provider }) {
        const { subject, html, text } = renderMagicLinkEmail({ url });
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject,
            html,
            text,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Resend error sending magic link: ${body}`);
        }
      },
    }),
  ],
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
    error: "/signin",
  },
  callbacks: {
    async signIn({ user }) {
      // Block disallowed domains before we even create or update the user record.
      if (!isEmailAllowed(user?.email)) return false;
      return true;
    },
    async session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
