'use client';

import { Button, Card } from '@/components/ui';

// The offer dock's install card: the browser's own install prompt where there is one (Chrome, Edge, Android), else
// iPhone Safari's Share → Add to Home Screen steps.
export function InstallOffer({ platform, onInstall, onDismiss }: { platform: 'prompt' | 'ios'; onInstall: () => void; onDismiss: () => void }) {
  return (
    <Card className="today-card offer-card" id="install-offer" aria-labelledby="install-offer-title">
      <span className="ui-label">Install Panna</span>
      <p className="today-big" id="install-offer-title">Open Panna like an app</p>
      <p className="tour-hi" lang="hi">पन्ना को ऐप की तरह खोलें।</p>
      {platform === 'prompt' ? (
        <>
          <p className="today-muted">From your home screen or desktop, with the whole book offline.</p>
          <div className="today-actions">
            <Button variant="primary" id="install-offer-install" onClick={onInstall}>Install</Button>
            <Button id="install-offer-not-now" onClick={onDismiss}>Not now</Button>
          </div>
        </>
      ) : (
        <>
          <p className="today-muted">In Safari, tap Share, then “Add to Home Screen”.</p>
          <div className="today-actions">
            <Button variant="primary" id="install-offer-not-now" onClick={onDismiss}>Got it</Button>
          </div>
        </>
      )}
    </Card>
  );
}
