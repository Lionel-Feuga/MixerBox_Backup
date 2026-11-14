'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import type { Backup, Discovery, Playlist } from '@/lib/types';
import { assemble } from '@/lib/backup';

async function api<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'La récupération a échoué.');
  return body;
}
function saveFile(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
async function savePdf(backup: Backup) {
  const [{ createBackupPdf }, response] = await Promise.all([import('@/lib/pdf'), fetch('/fonts/NotoSans-Regular.ttf')]);
  if (!response.ok) throw new Error('La police du PDF n’a pas pu être chargée.');
  const { bytes } = await createBackupPdf(backup, new Uint8Array(await response.arrayBuffer()));
  saveFile(bytes.slice().buffer as ArrayBuffer, 'application/pdf', `mes-playlists-${backup.exportedAt.slice(0, 10)}.pdf`);
}

type Status = 'idle' | 'busy' | 'done' | 'incomplete' | 'error';

export default function Home() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [backup, setBackup] = useState<Backup | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const busy = status === 'busy';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setStatus('busy'); setBackup(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const discovery = await api<Discovery>(`/api/discover?url=${encodeURIComponent(url.trim())}`, abort.signal);
      const loaded: Playlist[] = [discovery.seed];
      const failures: string[] = [];
      const queue = discovery.candidates.filter(c => c.id !== discovery.seed.id);
      // A few requests at a time, each within the Vercel function timeout.
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length && !abort.signal.aborted) {
          const candidate = queue.shift()!;
          try { loaded.push(await api<Playlist>(`/api/playlist?id=${encodeURIComponent(candidate.id)}`, abort.signal)); }
          catch (e) { if (abort.signal.aborted) throw e; failures.push(`${candidate.name} : ${e instanceof Error ? e.message : 'récupération impossible'}`); }
        }
      }));
      if (abort.signal.aborted) return;
      const result = assemble(discovery, loaded, failures, url.trim());
      setBackup(result);
      if (!result.complete) { console.warn('Sauvegarde incomplète', result.warnings); setStatus('incomplete'); return; }
      await savePdf(result);
      setStatus('done');
    } catch (e) {
      if (abort.signal.aborted) return;
      console.error(e);
      setStatus('error');
    }
  }
  async function downloadAgain() {
    if (!backup) return;
    try { await savePdf(backup); } catch (e) { console.error(e); setStatus('error'); }
  }

  return <main>
    <form onSubmit={submit}>
      <label htmlFor="playlist-url">Copie colle le lien de n’importe quelle playlist ci-dessous</label>
      <div className="field">
        <input id="playlist-url" type="url" required value={url} disabled={busy} onChange={e => { setUrl(e.target.value); if (status === 'error' || status === 'incomplete') setStatus('idle'); }} autoComplete="off" spellCheck={false} />
        <button type="submit" disabled={busy} aria-label="Valider">{busy ? <LoaderCircle className="spin" size={22} /> : <ArrowRight size={22} />}</button>
      </div>
      <p className="message" role="status" aria-live="polite">
        {status === 'busy' && 'Un instant…'}
        {status === 'done' && <>C’est prêt, le fichier est dans tes téléchargements. <button type="button" className="link" onClick={downloadAgain}>Télécharger à nouveau</button></>}
        {status === 'incomplete' && 'Il en manque une partie. Réessaie dans un moment.'}
        {status === 'error' && 'Ça n’a pas marché. Vérifie le lien et réessaie.'}
      </p>
    </form>
  </main>;
}
