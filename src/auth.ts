import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // Hint Google Workspace for heritagelab.ca so users land on the right account picker.
          // Users with a non-heritagelab.ca account on the allowlist can still switch accounts.
          hd: "heritagelab.ca",
          prompt: "select_account",
        },
      },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user }) {
      // Hard gate: only allowlisted emails may sign in.
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
