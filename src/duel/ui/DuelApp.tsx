// The Duel's root: its own router on the History API, so the package can also mount outside Next.
import { useEffect, useState } from 'react';
import type { Platform } from '../platform/types';
import { istToday, parsePath, type Route } from './router';

export default function DuelApp({ platform }: { basePath: string; platform: Platform }) {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const read = () => {
      const r = parsePath(location.pathname, istToday(new Date()));
      if ('redirect' in r) { history.replaceState(null, '', r.redirect + location.search); return read(); }
      setRoute(r);
    };
    read();
    addEventListener('popstate', read);
    return () => removeEventListener('popstate', read);
  }, []);

  if (!route || 'redirect' in route) return <main className="duel" />;
  return <main className="duel" data-date={route.date} data-exit={platform.exitHref} />;
}
