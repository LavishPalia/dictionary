// How the app was launched: from Android's share sheet (the manifest's share_target), or from an icon shortcut.

export type Launch = { kind: 'share'; text?: string; title?: string; url?: string } | { kind: 'voice' } | { kind: 'open'; section: 'review' } | null;

/** '?share_text=..&share_title=..&share_url=..' → share; '?voice=1' → voice; '?open=review' → open review; else null. */
export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const text = params.get('share_text');
  const title = params.get('share_title');
  const url = params.get('share_url');
  if (text !== null || title !== null || url !== null) {
    return { kind: 'share', ...(text !== null && { text }), ...(title !== null && { title }), ...(url !== null && { url }) };
  }
  if (params.get('voice') === '1') return { kind: 'voice' };
  if (params.get('open') === 'review') return { kind: 'open', section: 'review' };
  return null;
}
