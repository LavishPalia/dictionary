'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo } from 'react';
import { webPlatform } from '../../duel/platform/web';
import { markDuelSeen } from '../../duel/platform/web/entry';

// The game runs only in the browser: it needs the screen size, touch and audio from the first frame.
const DuelApp = dynamic(() => import('../../duel/ui/DuelApp'), { ssr: false });

export default function PlayClient() {
  const platform = useMemo(() => webPlatform(), []);
  // Before launch, opening /play once is what shows Panna's way in (the Play tab, the Today card) on this device.
  useEffect(() => { markDuelSeen(platform.storage); }, [platform]);
  return <DuelApp basePath="/play" platform={platform} />;
}
