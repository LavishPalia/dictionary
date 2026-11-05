import { useMemo, useState } from 'react';
import { checkNameShape, generateName } from '../../names';
import type { DuelNet } from '../../platform/types';
import { Sheet } from '../game/Sheet';
import { nameErrorText } from './copy';

/** Your name on the board (UI-DESIGN §3.5): type one, or roll the die. */
export function RenameSheet({ net, current, onClose }: { net: DuelNet; current: string; onClose: () => void }) {
  const [name, setName] = useState(current);
  const [error, setError] = useState<{ text: string; shake: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const suggestions = useMemo(() => [generateName(Math.random), generateName(Math.random), generateName(Math.random)], []);

  const fail = (code: string) => setError(e => ({ text: nameErrorText(code), shake: (e?.shake ?? 0) + 1 }));

  const save = async () => {
    const shape = checkNameShape(name);
    if (shape) { fail(shape); return; }
    setSaving(true);
    const result = await net.rename(name);
    setSaving(false);
    if (result.ok) onClose();
    else fail(result.error);
  };

  return (
    <Sheet onClose={onClose}>
      {(titleId) => (
        <form className="rename" id="duel-rename" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h3 id={titleId}>Your name on the board</h3>
          <p>Everyone sees this name. Up to 20 letters.</p>
          <div className="rename-row">
            <input id="rename-input" value={name} maxLength={24} autoComplete="off" spellCheck={false} aria-label="Your name"
              aria-describedby="rename-err" aria-invalid={error ? true : undefined} onChange={(e) => { setName(e.target.value); setError(null); }} />
            <button type="button" className="rename-die" id="rename-die" aria-label="Suggest a name" onClick={() => { setName(generateName(Math.random)); setError(null); }}>⚄</button>
          </div>
          <p className={`rename-err${error ? ` shake${error.shake % 2}` : ''}`} id="rename-err" role="alert">{error?.text ?? ''}</p>
          <div className="rename-sugg">
            {suggestions.map(s => <button type="button" key={s} onClick={() => { setName(s); setError(null); }}>{s}</button>)}
          </div>
          <button type="submit" className="bigbtn pri" id="rename-save" disabled={saving}>Save name</button>
        </form>
      )}
    </Sheet>
  );
}
