'use client';

import { useState } from 'react';
import { Badge, Button, Card, Chip, IconButton, Segmented, Sheet, Switch } from '@/components/ui';

const SWATCHES = ['--parch', '--parch-3', '--ink', '--ink-soft', '--crimson', '--binding', '--sepia', '--rule', '--green',
  '--desk', '--desk-2', '--brass', '--brass-soft'];

const SearchIcon = () => (
  <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
);

export function Styleguide() {
  const [lighting, setLighting] = useState<'day' | 'evening'>('day');
  const [sounds, setSounds] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main id="styleguide" style={{ maxWidth: 960, margin: '0 auto', padding: 'var(--space-5) var(--space-4) 80px', color: 'var(--brass-soft)' }}>
      <h1 style={{ font: '34px var(--font-deva)', color: 'var(--brass)', margin: 0 }}>
        पन्ना <span style={{ font: '16px var(--font-fell-sc)', color: 'var(--brass-muted)' }}>building blocks</span>
      </h1>

      <h2 className="ui-label" style={{ color: 'var(--brass-muted)', margin: '28px 0 10px' }}>Colours</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {SWATCHES.map((name) => (
          <div key={name} style={{ width: 96, font: '12px var(--font-fell)' }}>
            <div style={{ height: 40, borderRadius: 'var(--radius-sm)', background: `var(${name})`, border: '1px solid var(--brass-line)' }} />
            {name}
          </div>
        ))}
      </div>

      <h2 className="ui-label" style={{ color: 'var(--brass-muted)', margin: '28px 0 10px' }}>On the desk</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <Button variant="desk">Today</Button>
        <Button variant="desk">Review <Badge count={12} label="12 words due" /></Button>
        <IconButton aria-label="Search"><SearchIcon /></IconButton>
        <input className="ui-input" placeholder="Look up a word, in English or हिंदी" aria-label="Look up" style={{ flex: '1 1 260px' }} />
      </div>

      <h2 className="ui-label" style={{ color: 'var(--brass-muted)', margin: '28px 0 10px' }}>On paper</h2>
      <Card style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div>
          <span style={{ font: 'bold 22px var(--font-fell)' }}>Haughty</span>{' '}
          <span className="ui-pron">हॉटी</span>{' '}
          <span className="ui-pos">describing word</span>
          <div className="ui-hi" style={{ fontSize: 26 }}>घमंडी, अभिमानी</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button size="small">English</Button>
          <Button size="small" disabled title="No Hindi voice on this device">हिंदी</Button>
          <Button variant="primary">Save word</Button>
          <Button>Add to review</Button>
          <IconButton surface="paper" aria-label="Search"><SearchIcon /></IconButton>
        </div>
        <div>
          <Chip>Arrogant</Chip> <Chip>Proud</Chip> <Chip>Humble</Chip>{' '}
          <span className="ui-tag">unreviewed</span> <span className="ui-tag ui-tag--learning">Learning</span>{' '}
          <span className="ui-tag ui-tag--mastered">Mastered</span>
        </div>
        <hr className="ui-divider" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'center' }}>
          <Segmented label="Desk lighting" value={lighting} onChange={setLighting}
            options={[{ value: 'day', label: 'Day' }, { value: 'evening', label: 'Evening' }]} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, font: '16px var(--font-fell)' }}>
            Page sounds <Switch checked={sounds} onChange={setSounds} label="Page sounds" id="sg-sounds" />
          </label>
          <Button id="sg-open-sheet" onClick={() => setSheetOpen(true)}>Open a sheet</Button>
        </div>
      </Card>

      <h2 className="ui-label" style={{ color: 'var(--brass-muted)', margin: '28px 0 10px' }}>List</h2>
      <div className="ui-list">
        <div className="ui-list-group">Meaning starts with छोड़</div>
        {[['Leave', 'छोड़ना', 'p. 1,402'], ['Quit', 'छोड़ देना', 'p. 2,210'], ['Abandon', 'त्यागना, छोड़ देना', 'p. 3']].map(([hw, hi, pg]) => (
          <div className="ui-list-item" key={hw}>
            <div style={{ flex: 1 }}><b style={{ font: 'bold 16px var(--font-fell)' }}>{hw}</b> <span className="ui-hi">{hi}</span></div>
            <span className="ui-label">{pg}</span>
          </div>
        ))}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Reading settings" id="sg-sheet">
        <p style={{ margin: '0 0 var(--space-4)', font: '16px var(--font-fell)' }}>Press Escape, tap outside, or use the button to close.</p>
        <Button variant="primary" full onClick={() => setSheetOpen(false)} id="sg-close-sheet">Done</Button>
      </Sheet>
    </main>
  );
}
