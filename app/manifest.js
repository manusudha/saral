export default function manifest() {
  return {
    id: '/',
    name: 'Saral — financial journeys made simple',
    short_name: 'Saral',
    description: 'Get help with an insurance claim or loan pre-check in a conversation.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f9fc',
    theme_color: '#002970',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
