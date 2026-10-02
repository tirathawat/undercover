import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { defaultLocale, resources } from './src/i18n/resources.ts';

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'localized-document',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          const messages = resources[defaultLocale].translation.app;
          const replacements: Record<string, string> = {
            __APP_LOCALE__: defaultLocale,
            __APP_DESCRIPTION__: messages.description,
            __APP_TITLE__: messages.documentTitle,
          };
          return html.replace(
            /__APP_(LOCALE|DESCRIPTION|TITLE)__/g,
            (placeholder) => escapeHtml(replacements[placeholder]),
          );
        },
      },
    },
  ],
  server: {
    strictPort: true,
    proxy: {
      '/ws': { target: 'http://localhost:8080', ws: true },
      '/healthz': { target: 'http://localhost:8080' },
    },
  },
});
