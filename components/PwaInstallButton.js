'use client';

import { useEffect, useState } from 'react';

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const handleAppInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
    } catch (error) {
      console.error('[saral] PWA install prompt failed', error);
    }
  }

  if (!installPrompt) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      className="whitespace-nowrap rounded-full border border-[#00a9df]/30 px-4 py-2.5 text-sm font-bold text-[#007da8] transition hover:bg-sky-50"
    >
      Install app
    </button>
  );
}
