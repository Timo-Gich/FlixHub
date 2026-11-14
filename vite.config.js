import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Dev-only shim so /api/*.mjs serverless functions run under `vite dev`
// (Vite doesn't execute Vercel functions natively — without this, /api/*
// returns index.html or raw file text, which surfaces as
// "Unexpected token ..." JSON errors in the player).
function vercelApiPlugin(apiEnv) {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      Object.entries(apiEnv).forEach(([key, value]) => {
        if (!process.env[key] && value) process.env[key] = value;
      });
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          if (!url.pathname.startsWith('/api/')) return next();
          const name = url.pathname.slice('/api/'.length).split('/')[0].split('?')[0];
          if (!name || name.includes('.') || name.includes('..')) return next();
          const file = path.resolve(server.config.root, 'api', `${name}.mjs`);
          if (!fs.existsSync(file)) return next();
          // Bust import cache so edits to api/* apply without restart.
          const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
          const handler = mod.default;
          if (typeof handler !== 'function') return next();

          // Minimal Vercel-style res sugar over Node's ServerResponse.
          if (typeof res.status !== 'function') {
            res.status = (code) => {
              res.statusCode = code;
              return res;
            };
          }
          if (typeof res.send !== 'function') {
            res.send = (body) => {
              if (body !== undefined && !(body instanceof Buffer) && typeof body !== 'string') body = String(body);
              if (!res.getHeader('Content-Type') && typeof body === 'string') res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end(body ?? '');
              return res;
            };
          }
          if (typeof res.json !== 'function') {
            res.json = (obj) => {
              if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(obj ?? {}));
              return res;
            };
          }
          await handler(req, res);
        } catch (err) {
          console.error('[api-dev]', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'api dev error' }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const liveTvApiUrl = (process.env.LIVE_TV_API_URL || env.LIVE_TV_API_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const apiEnv = Object.fromEntries(
    [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
    ].filter((key) => env[key]).map((key) => [key, env[key]]),
  );
  return {
    plugins: [react(), tailwindcss(), vercelApiPlugin(apiEnv)],
    define: {
      'import.meta.env.LIVE_TV_API_URL': JSON.stringify(
        mode === 'development' ? '' : liveTvApiUrl,
      ),
    },
    envPrefix: ['VITE_', 'TMDB_', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'],
    server: {
      allowedHosts: ['undocked-casually-cloud.ngrok-free.dev'],
      proxy: {
        '/live-tv-api': {
          target: liveTvApiUrl || 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/live-tv-api/, ''),
        },
      },
    },
  };
});