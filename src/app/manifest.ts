import type { MetadataRoute } from 'next';

// Installable app (served at /manifest.webmanifest). Icons are rendered from src/app/icon.svg by scripts/make-app-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'पन्ना Panna — English → Hindi dictionary',
    short_name: 'Panna',
    description: 'An English to Hindi dictionary you read like a book, with spaced review of the words you save.',
    lang: 'en-IN',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#2b1d14',
    theme_color: '#2b1d14',
    categories: ['education', 'books', 'reference'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
