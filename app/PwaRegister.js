'use client';

import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[saral] PWA service worker registration failed', error);
    });
  }, []);

  return null;
}
