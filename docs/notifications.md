# Notifications and Web Push setup

The notification center supports local guest notifications and account-synced
in-app notifications. Background browser notifications use the existing service
worker, Web Push, and VAPID. Browser permission is requested only when a signed-in
user turns on **Background browser notifications**.

## Supabase

Run the current `supabase/schema.sql` in the Supabase SQL Editor. It creates
notification preferences, notification history, and per-user push subscriptions,
enables row-level security, and adds the notifications table to Realtime.

## VAPID keys

Generate one VAPID key pair locally after installing the project dependencies:

```sh
npx web-push generate-vapid-keys
```

Keep the private key secret. Set these environment variables on the Vercel
project (and in a local, uncommitted `.env` for local testing):

```text
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:you@example.com
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
```

The public key is returned to the browser by `GET /api/push`; the private key
and service-role key are only read by the serverless API and must never use a
`VITE_` prefix or be committed. The server verifies the user's Supabase access
token, checks their saved push preference, and sends only to their own
subscriptions. Invalid/expired endpoints are removed automatically.

Deploy the Vercel project after adding these values. For local development, start
the Vite dev server after placing the server variables in `.env`. Background
push requires HTTPS (localhost is treated as a secure context by browsers), a
browser with Web Push support, and permission to display notifications.

## Verify delivery

Sign in, open the notification bell, and enable **Background browser
notifications**. Use **Send test notification** to verify delivery. With the
FlixHub tab focused, the service worker forwards the push into the in-app toast;
with it hidden or closed, the service worker displays an operating-system
notification. Clicking that notification opens the app at its target route.

Currently, the app creates a continue-watching reminder when it is opened or
returns to the foreground. That reminder can be pushed to the user's other
subscribed devices. To originate scheduled notifications while every app tab is
closed, add a trusted scheduled server job or database-triggered server
integration; a service worker alone cannot generate new events without a push
request from the server.
