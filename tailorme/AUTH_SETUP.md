# Supabase authentication

Portal foundations now load profiles and trusted roles from the database. Apply the migration using `../supabase/README.md` before testing portal login. Login and confirmation now redirect through `/dashboard` to `/customer/dashboard`, `/tailor/dashboard`, or `/admin/dashboard`. `/account` remains the profile page with a role-aware dashboard link. The original auth checklist below still applies; successful confirmation now lands on the appropriate dashboard rather than `/account`.

Run `npm install` and `npm run dev` from `tailorme`.
Use port 5173 for the settings below.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` using `.env.example` as a guide. Vite reads `tailorme/.env` if present, otherwise the workspace parent's environment files (the current setup). Restart Vite after configuration changes. Environment files are ignored; never use a service-role key in this app.

In Supabase Authentication → URL Configuration, set:

- Site URL: `http://localhost:5173`
- Allowed redirect: `http://localhost:5173/auth/callback`
- Allowed redirect: `http://localhost:5173/reset-password`

Enable the Email provider and choose the desired Confirm email setting. Keep email templates using Supabase's confirmation URL so signup and recovery redirects include the session. No application tables or custom roles are required; Supabase manages `auth.users`. Full name is stored in `user_metadata.full_name`.

The SDK handles redirect sessions, token persistence, refresh, and logout. Passwords are sent only to Supabase and are never manually stored or logged. Recovery requires a PASSWORD_RECOVERY event, so an ordinary login cannot enable the reset form. If a recovery page is refreshed, request a new link.

Google login uses the shared client's `signInWithOAuth` with `provider: 'google'` and a redirect to `window.location.origin + '/auth/callback'`. Google provider credentials are configured externally in Supabase; no Google Client Secret belongs in frontend code or environment files. The client retains its default implicit browser flow and automatic URL session detection. The callback waits for AuthContext to finish restoration, then uses `/dashboard` to load the existing database profile/role and resolve the portal. Do not add a manual code exchange in the callback. Existing roles are never overwritten by OAuth login; first-time users receive customer via the existing database trigger.

Live Google verification: click Google, complete consent, confirm the callback reaches the correct portal, and repeat with existing customer/tailor/admin test accounts. Verify their roles are unchanged. Cancel consent and verify an accessible callback error with a sign-in link. Check logout, password login, and email recovery afterward. The allowed callback redirect above remains required for each development origin used.

## Live verification checklist

- Sign up with a fresh email. Confirm `full_name` metadata in Supabase. With confirmation enabled, verify the check-email message and follow the email to `/auth/callback`, then `/account`. Also check signup with confirmation disabled if that is your dashboard policy.
- Sign in with confirmed credentials and verify `/account` shows the actual name and email. Refresh to check session restoration. Try an incorrect password and verify the accessible error message.
- Log out and verify `/account` redirects to `/login`, including after refresh.
- Request a reset email and follow it to `/reset-password`. Set matching passwords of at least eight characters, then log out and sign in with the new password. Confirm the old password fails.
- Try expired, reused, and malformed confirmation/recovery links; visit `/reset-password` directly both logged in and logged out. Verify no reset form appears without a recovery session.
- Check validation, duplicate-submit protection, network/rate-limit failures, keyboard navigation, welcome page, mobile menu, and reference links.

Build and lint verify compilation and static rules; they do not send emails or prove live dashboard configuration.

## Directory sign-in and return navigation

`/tailors` and `/tailors/:id` now reuse `PortalGuard` in authenticated-only mode. Auth restoration finishes before redirecting; customer, tailor and admin sessions can browse. The landing route remains accessible signed out. Existing role-based dashboard guards and Supabase RLS are unchanged. This is browsing-access UX: existing public shop data and public image URLs remain public.

Signed-out navigation carries a validated `returnTo` query parameter through login/signup and the OAuth/email confirmation callback, including the original directory/detail query parameters. Only internal `/tailors` and `/tailors/<id>` paths are accepted. Invalid/external values fall back to `/dashboard`, which still resolves the database role. No destination is kept in persistent browser storage. Password recovery behavior is unchanged.

For Google and email confirmation, confirm the Supabase Auth redirect allowlist accepts the callback with its `returnTo` query. Keep the exact `/auth/callback` entry for ordinary login; add a pattern scoped to that callback and your exact origin for return queries, for example `http://localhost:5173/auth/callback\?returnTo=**` (Supabase glob syntax escapes the literal question mark). Use your exact deployed origin rather than a wildcard host. See [Supabase redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls). Email templates must preserve the supplied redirect through Supabase's confirmation URL, rather than hardcoding SiteURL. No hosted settings were changed.

Local tests cover both protected routes signed out, restoration without redirects, all three roles browsing, existing dashboard role redirects, query round trips, unsafe-target rejection, login/signup links, callback success/cancellation and the Google/email redirect request options. Tests render components and capture navigation at the router boundary, with stubbed Supabase transport; they do not prove a live Google login or email delivery. Build and lint are run locally. Before release, verify password login, Google consent/cancellation and confirmation-enabled signup on your configured Supabase test project, including direct URLs, filtered directory URLs, mobile Find a Tailor navigation, and normal login without returnTo. No deployment was performed.
