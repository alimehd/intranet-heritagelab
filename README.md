# Heritage Lab Intranet

Internal web app for Heritage Lab staff and board members. First feature: **travel expense claims** that are emailed straight to `payments@heritagelab.ca` as a PDF.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** with a light theme matching the Heritage Lab platform
- **NextAuth 5** with Google OAuth and an email allowlist
- **Drizzle ORM** on **Neon Postgres**
- **Resend** for transactional email
- **@react-pdf/renderer** for the claim PDF

## Local development

### 1. Install
```bash
npm install
```

### 2. Configure environment
Copy the example file and fill in the values:
```bash
cp .env.example .env.local
```

You need:
- `DATABASE_URL` from Neon (use the pooled connection string)
- `AUTH_SECRET` — run `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from Google Cloud Console
- `ALLOWED_EMAIL_DOMAINS` — comma-separated list of allowed email domains (defaults to `heritagelab.ca`)
- `ALLOWED_EMAILS` — optional individual emails outside those domains (e.g. board members on personal Gmail)
- `RESEND_API_KEY` from resend.com
- `MAIL_FROM` — for production, an address on a domain you've verified in Resend
- `CLAIMS_RECIPIENT` — defaults to `payments@heritagelab.ca`

### 3. Push the database schema
```bash
npm run db:push
```
(Or `npm run db:generate` then `db:push` if you prefer migration files in `./drizzle/`.)

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000.

## Deployment

### Neon
1. Create a project at https://console.neon.tech.
2. Copy the **pooled** connection string (URI contains `-pooler`).
3. Save as `DATABASE_URL`.

### Google OAuth
1. Go to https://console.cloud.google.com → APIs & Services → Credentials.
2. Create an **OAuth client ID** (Web application).
3. Add authorized redirect URI:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://intranet.heritagelab.ca/api/auth/callback/google`
4. Save the client ID and secret.

### Resend
1. Sign up at https://resend.com.
2. Verify `heritagelab.ca` as a sending domain (add the DNS records they provide).
3. Create an API key.
4. Set `MAIL_FROM` to something like `Heritage Lab Intranet <intranet@heritagelab.ca>`.
   - While the domain is unverified, use `onboarding@resend.dev` so you can still test (emails will only deliver to your own Resend account email in test mode).

### Vercel
1. Push this repo to GitHub.
2. Import the repo at https://vercel.com/new.
3. Add every variable from `.env.example` in the project's **Environment Variables** settings (Production + Preview).
4. Deploy.
5. After first deploy, set the production `AUTH_URL` to your real URL and add `intranet.heritagelab.ca` as a custom domain.
6. From your DNS provider, point `intranet.heritagelab.ca` → `cname.vercel-dns.com` per Vercel's instructions.

### First run after deploy
- Sign in with a Google account whose email is in `ALLOWED_EMAILS`.
- Submit a test claim; check the inbox at `payments@heritagelab.ca` for the PDF.

## Access control

Anyone with an email on a domain in `ALLOWED_EMAIL_DOMAINS` (default: `heritagelab.ca`) can sign in. You can also list individual exceptions in `ALLOWED_EMAILS` (e.g. board members using a personal Gmail). Everyone else is rejected at the OAuth callback with `AccessDenied`.

The Google sign-in is configured with the `hd=heritagelab.ca` hint, so Workspace users land on their work account picker directly. Users with allowlisted personal emails can still switch accounts at the Google prompt.

To change access, update the env vars in Vercel — they apply on the next request, no redeploy needed.

## Where things live

```
src/
  app/
    (app)/                  # authenticated app shell
      dashboard/
      travel-claims/
        new/                # form + server action
        [id]/               # claim detail page
      policies/
    signin/                 # sign-in page (Google)
    api/auth/[...nextauth]/ # NextAuth handlers
  auth.ts                   # NextAuth config + allowlist gate
  middleware.ts             # auth gate for all routes
  components/               # shared UI (AppShell, StatusBadge)
  lib/
    allowlist.ts
    db/                     # Drizzle schema + client
    claims/                 # schema, totals, PDF, email
    email.ts                # Resend client
```

## Roadmap (next features)

- Policies content + search
- Admin view of all claims (with retry-email button for failed sends)
- More forms (vacation requests, expense reports, etc.)
- Document library
