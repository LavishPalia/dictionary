import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import '@/styles/ui.css';
import '@/styles/shell.css';
import '@/styles/search.css';
import '@/styles/word.css';
import '@/styles/saved.css';
import '@/styles/review.css';
import '@/styles/today.css';
import '@/styles/tour.css';
import '@/styles/motion.css';
import { Caveat, IM_Fell_English, IM_Fell_English_SC, Tiro_Devanagari_Hindi } from 'next/font/google';

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
  themeColor: '#2b1d14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
