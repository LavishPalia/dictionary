'use client';

import { useEffect, useRef, useState } from 'react';

type FilmLang = 'english' | 'hindi';
const LANG_KEY = 'panna_film_lang';

// The 37-second intro film, for first visits. Only the poster loads with the page (preload="none"); the film loads
// when ▶ is pressed. The service worker never keeps it (public/sw.js caches nothing under /intro/). The film has
// its captions burned in; the WebVTT tracks are there for players that want them, off by default.
export function IntroFilm({ onPlayingChange }: { onPlayingChange?: (playing: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [lang, setLang] = useState<FilmLang>('english');
  const [playing, setPlaying] = useState(false);
  // A language switch while the film plays restarts it in the other language.
  const restart = useRef(false);

  useEffect(() => {
    try { if (localStorage.getItem(LANG_KEY) === 'hindi') setLang('hindi'); } catch {}
  }, []);
  useEffect(() => {
    const v = video.current;
    if (!v || !restart.current) return;
    restart.current = false;
    v.load();
    void v.play().catch(() => {});
  }, [lang]);
  useEffect(() => { onPlayingChange?.(playing); }, [playing, onPlayingChange]);

  const pick = (next: FilmLang) => {
    if (next === lang) return;
    try { localStorage.setItem(LANG_KEY, next); } catch {}
    restart.current = playing;
    setLang(next);
  };
  const play = () => {
    for (const other of document.querySelectorAll('video')) if (other !== video.current) other.pause();
    void video.current?.play().catch(() => setPlaying(false));
  };
  const fullScreen = () => {
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => {});
    else v.webkitEnterFullscreen?.();
  };

  return (
    <div className={`desk-film${playing ? ' desk-film--playing' : ''}`} id="desk-film">
      <div className="desk-film-frame">
        <video ref={video} src={`/intro/${lang}.mp4`} preload="none" playsInline poster="/intro/poster.jpg"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}>
          <track kind="captions" src="/intro/english.vtt" srcLang="en" label="English" />
          <track kind="captions" src="/intro/hindi.vtt" srcLang="hi" label="हिंदी" />
        </video>
        {playing ? (
          <div className="desk-film-tools">
            <button type="button" aria-label="Pause the film" onClick={() => video.current?.pause()}>
              <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor" /></svg>
            </button>
            <button type="button" aria-label="Full screen" onClick={fullScreen}>
              <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" className="desk-film-play" id="desk-film-play" onClick={play}
            aria-label={`Play the 37-second film${lang === 'hindi' ? ' in Hindi' : ''}`}>
            <span><svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true"><path d="M3 2 L18 11 L3 20 Z" fill="currentColor" /></svg></span>
          </button>
        )}
      </div>
      <div className="desk-film-meta">
        <span>37 s · about 2 MB</span>
        <span className="desk-film-lang" role="group" aria-label="Film language">
          <button type="button" data-lang="english" aria-pressed={lang === 'english'} onClick={() => pick('english')}>EN</button>
          <button type="button" data-lang="hindi" lang="hi" aria-pressed={lang === 'hindi'} onClick={() => pick('hindi')}>हिंदी</button>
        </span>
      </div>
    </div>
  );
}
