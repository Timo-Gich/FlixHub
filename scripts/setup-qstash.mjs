import { Client } from '@upstash/qstash';

const token = process.env.QSTASH_TOKEN;
const destinationUrl = process.env.QSTASH_DESTINATION_URL;

if (!token) throw new Error('QSTASH_TOKEN is required to create the schedule.');
if (!destinationUrl) throw new Error('QSTASH_DESTINATION_URL is required to create the schedule.');

const destination = new URL(destinationUrl);
if (destination.protocol !== 'https:'
  || destination.pathname !== '/api/cron/notifications'
  || destination.username
  || destination.password
  || destination.search
  || destination.hash) {
  throw new Error('QSTASH_DESTINATION_URL must be an HTTPS URL ending in /api/cron/notifications.');
}

const scheduleId = 'flixhub-notifications';
const client = new Client({ token });
await client.schedules.create({
  destination: destination.toString(),
  scheduleId,
  cron: '*/5 * * * *',
});

console.log(`Created or updated QStash schedule "${scheduleId}" for ${destination}.`);
