'use client';

// Shown instead of a blank "Application error" screen if something unexpected breaks while reading.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', fontFamily: 'Georgia, serif' }}>
      <div>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ marginBottom: 16 }}>Your saved words and notes are still on this device. Try again, and if it keeps happening, reload the page.</p>
        <button type="button" onClick={reset} style={{ padding: '8px 18px', fontSize: 16, cursor: 'pointer' }}>Try again</button>
      </div>
    </main>
  );
}
