'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { webPlatform } from '../../duel/platform/web';
import { markDuelSeen } from '../../duel/platform/web/entry';
import { registerServiceWorker } from '../../lib/offline';
import { pageview, startAnalytics, track } from '../../lib/analytics';

// The game runs only in the browser: it needs the screen size, touch and audio from the first frame.
const DuelApp = dynamic(() => import('../../duel/ui/DuelApp'), { ssr: false });

export default function PlayClient() {
  const platform = useMemo(() => ({ ...webPlatform(), track }), []);
  // Usage counts: the Duel counts as one screen, and its finished games as events (src/lib/analytics.ts).
  useEffect(() => { startAnalytics(); pageview('play'); }, []);
  // Before launch, opening /play once is what shows Panna's way in (the Play tab, the Today card) on this device.
  useEffect(() => { markDuelSeen(platform.storage); }, [platform]);
  // Panna's shell registers the worker on its own pages; someone who only ever opens /play needs it too.
  useEffect(() => { void registerServiceWorker(); }, []);
  return <DuelApp basePath="/play" platform={platform} />;
}
