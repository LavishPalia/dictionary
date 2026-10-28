'use client';

import React, { useEffect } from 'react';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(20,10,5,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        onClick={(event) => event.stopPropagation()}
        style={{ width: '620px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', position: 'relative', padding: '28px 32px', background: 'linear-gradient(135deg, #efe3c0, #e2d2aa)', border: '2px solid #8a7452', borderRadius: '6px', boxShadow: '0 24px 60px rgba(0,0,0,.7)', color: '#2a1e14' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <h2 id="credits-title" style={{ margin: 0, font: '30px var(--font-fell)' }}>Sources & acknowledgements</h2>
          <button type="button" onClick={onClose} aria-label="Close credits" style={{ border: 0, background: 'transparent', color: '#7a2b22', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </header>

        <div style={{ marginTop: '18px', display: 'grid', gap: '15px', lineHeight: 1.5 }}>
          <section>
            <h3 style={{ margin: '0 0 3px', color: '#7a2b22', font: '18px var(--font-fell)' }}>Princeton WordNet 3.1</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Lexical database and sense information used for English vocabulary content. WordNet is made available under a BSD-style license. Princeton University “About WordNet” notice: <a href="https://wordnet.princeton.edu/" target="_blank" rel="noreferrer" style={{ color: '#7a2b22' }}>wordnet.princeton.edu</a>.</p>
          </section>
          <section>
            <h3 style={{ margin: '0 0 3px', color: '#7a2b22', font: '18px var(--font-fell)' }}>CMU Pronouncing Dictionary</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>English pronunciation data, distributed under a BSD-style license by Carnegie Mellon University: <a href="https://www.speech.cs.cmu.edu/cgi-bin/cmudict" target="_blank" rel="noreferrer" style={{ color: '#7a2b22' }}>CMUdict</a>. Devanagari pronunciations are generated approximations, with project-curated overrides for selected words.</p>
          </section>
          <section>
            <h3 style={{ margin: '0 0 3px', color: '#7a2b22', font: '18px var(--font-fell)' }}>AGID / SCOWL</h3>
            <p style={{ margin: 0, fontSize: '14px' }}>Inflection data supports lookup of forms such as plurals and verb tenses. AGID is by Kevin Atkinson and is free to use with its copyright notice; SCOWL materials carry their own notices. See <a href="https://wordlist.aspell.net/" target="_blank" rel="noreferrer" style={{ color: '#7a2b22' }}>SCOWL</a> and the included data-source notices.</p>
          </section>
          <section style={{ borderTop: '1px solid #b9a57c', paddingTop: '12px' }}>
            <h3 style={{ margin: '0 0 5px', color: '#7a2b22', font: '18px var(--font-fell)' }}>Editorial and review status</h3>
            <p style={{ margin: '0 0 7px', fontSize: '14px' }}>The 453 original dictionary entries are Project Panna editorial content and are marked reviewed. The 305 added closed-class entries were machine-assisted and have not yet had native Hindi-speaker review.</p>
            <p style={{ margin: 0, fontSize: '14px' }}>The planned Phase 4 review of the expanded Hindi glosses is not complete. The current staged batch contains 20 generated gloss records awaiting review; do not treat them as human-reviewed or sample-audited.</p>
          </section>
        </div>
      </section>
    </div>
  );
};
