import { getAdminClient, configureVapid, sendPushToUser } from '../_lib/push.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let admin;
  try { admin = getAdminClient(); } catch (e) { return res.status(503).json({ error: e.message }); }
  const pushReady = configureVapid();

  const { data: settings, error } = await admin
    .from('notification_settings')
    .select('user_id, notifications_enabled, browser_enabled')
    .eq('notifications_enabled', true);
  if (error) return res.status(500).json({ error: error.message });

  const today = new Date().toISOString().slice(0, 10);
  let totalInserted = 0;
  let totalPushed = 0;

  for (const s of settings || []) {
    const candidates = [
      { type: 'trending', title: 'Trending now', body: 'See what everyone is watching today.', url: '/', tag: `trending-${today}` },
      { type: 'recommendation', title: 'Recommended for you', body: 'Fresh picks based on your taste.', url: '/', tag: `rec-${today}` },
      { type: 'new_release', title: 'New releases', body: 'New titles just landed.', url: '/', tag: `newrel-${today}` },
    ];
    for (const c of candidates) {
      const dedupe_key = `${c.type}:${today}`;
      const { error: upErr } = await admin.from('notifications').upsert(
        { user_id: s.user_id, type: c.type, payload: { title: c.title, body: c.body, url: c.url, tag: c.tag }, dedupe_key },
        { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true }
      );
      if (!upErr) totalInserted++;
    }
    if (s.browser_enabled && pushReady) {
      const r = await sendPushToUser(admin, s.user_id, { title: 'FlixHub', body: 'You have new notifications.', url: '/', tag: `daily-${today}` });
      totalPushed += r.sent;
    }
  }

  return res.status(200).json({ ok: true, users: settings?.length || 0, inserted: totalInserted, pushed: totalPushed });
}
