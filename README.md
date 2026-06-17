# Heritage Lab Intranet

Internal web app for Heritage Lab staff and board members. First feature: **travel expense claims** that are emailed straight to `payments@heritagelab.ca` as a PDF.

## Tech stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** with a light theme matching the Heritage Lab platform
- **NextAuth 5** with Auth0 (federating Microsoft Entra ID / Azure AD) and domain-based access control
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
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER` from your Auth0 application (Regular Web Application)
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

### Auth0 (with Microsoft Entra ID / Azure AD as upstream)
1. In Auth0 Dashboard → **Applications → Create Application** → "Regular Web Application".
2. **Settings tab**, set:
   - **Allowed Callback URLs:**
     ```
     http://localhost:3000/api/auth/callback/auth0,
     https://YOUR-VERCEL-URL.vercel.app/api/auth/callback/auth0,
     https://intranet.heritagelab.ca/api/auth/callback/auth0
     ```
   - **Allowed Logout URLs:**
     ```
     http://localhost:3000,
     https://YOUR-VERCEL-URL.vercel.app,
     https://intranet.heritagelab.ca
     ```
   - **Allowed Web Origins:** same set as Logout URLs.
3. Copy the **Domain** (e.g. `heritagelab.us.auth0.com`), **Client ID**, and **Client Secret**.
   - `AUTH0_ISSUER` is `https://<Domain>` (no trailing slash).
4. **Authentication → Enterprise → Microsoft Azure AD** — connect your Azure AD tenant if not already done, and enable it for this Application (Application → Connections).
5. (Optional but recommended) Disable the default `Username-Password-Authentication` and Google Social connection for this Application, so users can only log in via Azure AD.
6. (Optional) In **Actions → Library → Build Custom** add a Post-Login action that rejects any email not ending in `@heritagelab.ca`:
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const email = (event.user.email || "").toLowerCase();
     if (!email.endsWith("@heritagelab.ca")) {
       api.access.deny("Access restricted to heritagelab.ca accounts.");
     }
   };
   ```
   Then add it to the Login flow. The app **also** enforces this client-side via `ALLOWED_EMAIL_DOMAINS`, so this is belt-and-suspenders.

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
