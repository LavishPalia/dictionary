'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { webPlatform } from '../../duel/platform/web';

// The game runs only in the browser: it needs the screen size, touch and audio from the first frame.
const DuelApp = dynamic(() => import('../../duel/ui/DuelApp'), { ssr: false });

export default function PlayClient() {
  const platform = useMemo(() => webPlatform(), []);
  return <DuelApp basePath="/play" platform={platform} />;
}
