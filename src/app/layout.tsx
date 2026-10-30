import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import '@/styles/ui.css';
import '@/styles/shell.css';
import '@/styles/goto.css';
import '@/styles/search.css';
import '@/styles/word.css';
import '@/styles/saved.css';
import '@/styles/review.css';
import '@/styles/today.css';
import '@/styles/tour.css';
import '@/styles/learn.css';
import '@/styles/progress.css';
import '@/styles/motion.css';
import '@/styles/color-mix-fallback.css'; // last, so its rules win where color-mix() is unsupported
import { Caveat, IM_Fell_English, IM_Fell_English_SC, Tiro_Devanagari_Hindi } from 'next/font/google';
import { PRE_PAINT_SCRIPT } from '@/lib/lighting';

// Self-hosted at build time: no request to Google at runtime, and fallback metrics are adjusted so text
// does not jump when the real font arrives. Components use the --font-* tokens from globals.css, never
// these family names directly (next/font renames the families).
const fell = IM_Fell_English({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--nf-fell', display: 'swap' });
const fellSc = IM_Fell_English_SC({ weight: '400', subsets: ['latin'], variable: '--nf-fell-sc', display: 'swap', adjustFontFallback: false }); // next/font has no metrics for it
const deva = Tiro_Devanagari_Hindi({ weight: '400', style: ['normal', 'italic'], subsets: ['devanagari', 'latin'], variable: '--nf-deva', display: 'swap' });
const hand = Caveat({ weight: ['400', '600', '700'], subsets: ['latin'], variable: '--nf-hand', display: 'swap', preload: false }); // margin notes only

const fontVariables = [fell, fellSc, deva, hand].map((font) => font.variable).join(' ');

export const metadata: Metadata = {
  title: 'पन्ना (Panna) — A Pocket Dictionary',
  description: 'An authentic vintage English into Hindi dictionary with the words around them.',
  keywords: ['dictionary', 'hindi', 'vintage dictionary', 'panna', '3d book', 'english hindi'],
  authors: [{ name: 'Panna' }],
  // Installed on iOS: its own name, full screen (icon: src/app/apple-icon.png; the manifest covers other browsers).
  appleWebApp: { capable: true, title: 'Panna', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' }, // the current name of Apple's tag, for Chrome
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No themeColor here: the theme-color meta follows Day/Evening, so PRE_PAINT_SCRIPT creates it and applyLight
  // (src/lib/lighting.ts) updates it.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-light is set by the head script before first paint, so the server HTML cannot match it: hence
    // suppressHydrationWarning (it covers <html>'s own attributes only).
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
