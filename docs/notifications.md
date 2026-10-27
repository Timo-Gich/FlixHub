# Notifications and Web Push setup

Notifications are account-scoped. The Account page's **Manage account** section
contains one **Enable notifications** setting. Enabling it opts the user into
in-app alerts and browser push; notifications are shown in the unread bell
dropdown and, when supported, on subscribed devices.

## Supabase

Run the current `supabase/schema.sql` in the Supabase SQL Editor. It creates
notification preferences, notification history, and per-user push subscriptions,
enables row-level security, and adds the notifications table to Realtime.

## Server configuration

Generate one VAPID key pair locally after installing the project dependencies:

```sh
npx web-push generate-vapid-keys
```

Keep the private key secret. Set these environment variables on the Vercel
project (and in a local, uncommitted `.env` for local testing). The cron runs
server-side, so `TMDB_API_KEY` must be a server environment variable (do not
prefix it with `VITE_`):

```text
VAPID_PUBLIC_KEY=<generated public key>
VAPID_PRIVATE_KEY=<generated private key>
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=<long random secret>
TMDB_API_KEY=<TMDb API key>
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role key>
```

The public key is returned to the browser by `GET /api/push`; the private key
and service-role key are only read by the serverless API and must never use a
`VITE_` prefix or be committed. The server verifies the user's Supabase access
token, checks their saved push preference, and sends only to their own
subscriptions. Invalid/expired endpoints are removed automatically.
`CRON_SECRET` protects the scheduled notification endpoint; Vercel sends it as
an `Authorization: Bearer ...` header when the cron runs. Keep it private.

Deploy the Vercel project after adding these values. For local development, start
the Vite dev server after placing the server variables in `.env`. Background
push requires HTTPS (localhost is treated as a secure context by browsers), a
browser with Web Push support, and permission to display notifications.

## Delivery behavior

Sign in, open Account → **Manage account**, and enable **Enable notifications**.
When FlixHub is focused, alerts can appear in-app and in the bell dropdown; with
the app hidden or closed, Web Push can display an operating-system notification.
Clicking that notification opens the app at its target route.

The daily Vercel job checks each opted-in user's watchlist and watch history. It
creates a trending alert only for a currently trending title that fits the
user's watched genres (or their usual movie/TV format), a recommendation from
their most recently watched title, and release alerts for recent episodes of
tracked shows or watchlisted movies. Categories are skipped when there is no
relevant title; there is no daily generic broadcast. A push is sent only after
a new notification is saved, and includes the actual title and destination.
Candidates are deduplicated by title/event, and notifications expire after 30
days. Continue-watching reminders remain foreground activity reminders.

Run the current `supabase/schema.sql` migration after deploying this change. It
adds the notification expiry field/index to existing installations and keeps
future notification history bounded.
