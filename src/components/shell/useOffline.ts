'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IOS_DEVICE } from '@/lib/ios-shortcut';
import { formatBytes, pageUrl, registerServiceWorker, saveBook, savedBook, type SavedBook } from '@/lib/offline';

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// Offline reading and installing Panna as an app: the state behind the ⋯ menu rows and the offline notice.
export function useOffline(meta: { total_pages: number; data_version: string }, initialPages: number[] = []) {
  const [ready, setReady] = useState(false); // the service worker is running
  const [online, setOnline] = useState(true);
  const [saved, setSaved] = useState<SavedBook | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installHint, setInstallHint] = useState<'ios' | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    let live = true;
    registerServiceWorker(initialPages.map((n) => pageUrl(n, meta.data_version))).then((ok) => {
      if (!live || !ok) return;
      setReady(true);
      savedBook().then((book) => { if (live) setSaved(book); });
    });
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Chrome, Edge and Android offer an install prompt; iOS Safari only has Share → Add to Home Screen.
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onPrompt = (e: Event) => { e.preventDefault(); if (!standalone) setInstallEvent(e as InstallPromptEvent); };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (!standalone && IOS_DEVICE.test(navigator.userAgent)) setInstallHint('ios');
    return () => {
      live = false;
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  // once, on load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setFailed(false);
    setProgress({ done: 0, total: meta.total_pages });
    try {
      setSaved(await saveBook(meta, (done, total) => setProgress({ done, total })));
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setProgress(null);
    }
  }, [meta]);

  const install = useCallback(async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
  }, [installEvent]);

  const current = saved?.data_version === meta.data_version;
  const status = progress
    ? `Saving… ${progress.done} of ${progress.total} pages`
    : failed
      ? 'Couldn’t finish saving. Check your connection and try again.'
      : saved && current
        ? `Saved on this device · ${saved.pages.toLocaleString('en-IN')} pages · ${formatBytes(saved.bytes)}`
        : saved
          ? 'The book has been updated. Save again to get the new pages.'
          : 'Read and search the whole book without a connection';

  return {
    /** Offline saving is possible (the service worker is running). */
    available: ready,
    online,
    savedCurrent: Boolean(saved && current),
    saving: progress !== null,
    status,
    save,
    install: installEvent ? install : null,
    installHint,
  };
}
