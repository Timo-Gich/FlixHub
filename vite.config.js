import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ['VITE_', 'TMDB_'],
  server: {
    allowedHosts: ['undocked-casually-cloud.ngrok-free.dev'],
  },
});