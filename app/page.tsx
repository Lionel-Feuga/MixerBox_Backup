'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import type { Backup, Discovery, Playlist } from '@/lib/types';
import { assemble } from '@/lib/backup';

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});
// MixerBox answers 429 when asked too often: wait longer and longer, then try again.
const RETRY_DELAYS = [3_000, 6_000, 12_000, 20_000, 30_000];
async function api<T>(url: string, signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { signal });
    const body = await response.json();
    if (response.ok) return body;
    if (response.status === 429 && attempt < RETRY_DELAYS.length) { await wait(RETRY_DELAYS[attempt], signal); continue; }
    throw new Error(body.error || 'La récupération a échoué.');
  }
}
async function buildPdf(backup: Backup) {
  const [{ createBackupPdf }, response] = await Promise.all([import('@/lib/pdf'), fetch('/fonts/NotoSans-Regular.ttf')]);
  if (!response.ok) throw new Error('La police du PDF n’a pas pu être chargée.');
  const { bytes } = await createBackupPdf(backup, new Uint8Array(await response.arrayBuffer()));
  return {
    href: URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })),
    name: `MixerBox_Backup_${backup.exportedAt.slice(0, 10)}.pdf`,
  };
}

type Status = 'idle' | 'busy' | 'done' | 'incomplete' | 'error';

export default function Home() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [pdf, setPdf] = useState<{ href: string; name: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  // Free the previous PDF when a new one replaces it.
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.href); }, [pdf]);
  const busy = status === 'busy';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setStatus('busy'); setPdf(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const discovery = await api<Discovery>(`/api/discover?url=${encodeURIComponent(url.trim())}`, abort.signal);
      const loaded: Playlist[] = [discovery.seed];
      const failures: string[] = [];
      const queue = discovery.candidates.filter(c => c.id !== discovery.seed.id);
      // One playlist at a time with a short pause, so MixerBox does not refuse the requests.
      for (const candidate of queue) {
        if (abort.signal.aborted) break;
        await wait(600, abort.signal);
        try { loaded.push(await api<Playlist>(`/api/playlist?id=${encodeURIComponent(candidate.id)}`, abort.signal)); }
        catch (e) { if (abort.signal.aborted) throw e; failures.push(`${candidate.name} : ${e instanceof Error ? e.message : 'récupération impossible'}`); }
      }
      if (abort.signal.aborted) return;
      const result = assemble(discovery, loaded, failures, url.trim());
      if (!result.complete) { console.warn('Sauvegarde incomplète', result.warnings); setStatus('incomplete'); return; }
      // Phones only allow a download started by a tap, so the PDF is offered as a link.
      setPdf(await buildPdf(result));
      setStatus('done');
    } catch (e) {
      if (abort.signal.aborted) return;
      console.error(e);
      setStatus('error');
    }
  }

  return <main>
    <form onSubmit={submit}>
      <label htmlFor="playlist-url">Copie colle le lien de n’importe quelle playlist ci-dessous</label>
      <div className="field">
        <input id="playlist-url" type="url" required value={url} disabled={busy} onChange={e => { setUrl(e.target.value); if (status !== 'busy') setStatus('idle'); }} autoComplete="off" spellCheck={false} />
        <button type="submit" disabled={busy} aria-label="Valider">{busy ? <LoaderCircle className="spin" size={22} /> : <ArrowRight size={22} />}</button>
      </div>
      <p className="message" role="status" aria-live="polite">
        {status === 'busy' && 'Un instant…'}
        {status === 'done' && pdf && <a className="download" href={pdf.href} download={pdf.name}>Télécharger le PDF</a>}
        {status === 'incomplete' && 'Il en manque une partie. Réessaie dans un moment.'}
        {status === 'error' && 'Ça n’a pas marché. Vérifie le lien et réessaie.'}
      </p>
    </form>
  </main>;
}
