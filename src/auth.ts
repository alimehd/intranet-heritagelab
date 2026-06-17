import NextAuth from "next-auth";
import Auth0 from "next-auth/providers/auth0";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/db/schema";
import { isEmailAllowed } from "@/lib/allowlist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Auth0({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER, // e.g. https://heritagelab.us.auth0.com
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // Force fresh account selection (helps when an Azure AD session is already in browser).
          prompt: "login",
          scope: "openid profile email",
        },
      },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user }) {
      // Hard gate: only @heritagelab.ca (and any explicit allowlist entries) may sign in.
      // Auth0 + Azure AD should already restrict this, but we double-check on our side.
      if (!isEmailAllowed(user.email)) return false;
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
