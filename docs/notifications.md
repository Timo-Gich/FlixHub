# Notifications and Web Push setup

Notifications are account-scoped. The Account page's **Manage account** section
contains one **Enable notifications** setting; notification messages are shown
only in the unread bell dropdown. Enabling requests browser permission and
registers this device for background push using the existing service worker,
Web Push, and VAPID.

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

Sign in, open Account → **Manage account**, and enable **Enable notifications**.
When FlixHub is focused, alerts can appear in-app and in the bell dropdown; with
the app hidden or closed, Web Push can display an operating-system notification.
Clicking that notification opens the app at its target route.

Currently, the app creates a continue-watching reminder when it is opened or
returns to the foreground. That reminder can be pushed to the user's other
subscribed devices. To originate scheduled notifications while every app tab is
closed, add a trusted scheduled server job or database-triggered server
integration; a service worker alone cannot generate new events without a push
request from the server.
