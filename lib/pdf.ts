import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Backup } from './types';
import { duration } from './types';

const ink = rgb(0.13, 0.16, 0.21), accent = rgb(0.24, 0.32, 0.44), muted = rgb(0.42, 0.46, 0.52), rule = rgb(0.88, 0.89, 0.91);
const width = 595.28, height = 841.89, margin = 46;
export async function createBackupPdf(backup: Backup, fontBytes: Uint8Array) {
  if (!backup.complete) throw new Error('Le PDF complet est disponible uniquement après une récupération vérifiée.');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const chars = new Set(font.getCharacterSet());
  let replacedCharacters = false;
  const safe = (value: string) => Array.from(value.normalize('NFC')).map(c => {
    if (c === '\n' || c === '\r' || c === '\t') return ' ';
    if (chars.has(c.codePointAt(0)!)) return c;
    replacedCharacters = true;
    return '?';
  }).join('');
  const wrap = (value: string, size: number, maxWidth: number) => wrapText(safe(value), font, size, maxWidth);
  let page: PDFPage, y = height - 78;
  function newPage(label: string | null = 'MES PLAYLISTS MIXERBOX') {
    page = doc.addPage([width, height]);
    if (label) page.drawText(safe(label), { x: margin, y: height - 42, size: 8, font, color: muted });
    y = height - (label ? 78 : 62);
  }
  function lines(value: string, size: number, color = ink, maxWidth = width - 2 * margin, x = margin) {
    for (const line of wrap(value, size, maxWidth)) {
      if (y < 65) newPage();
      page.drawText(line, { x, y, size, font, color });
      y -= size * 1.5;
    }
  }
  const total = backup.playlists.reduce((n, p) => n + p.tracks.length, 0);
  const date = new Date(backup.exportedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
  doc.setTitle(`Playlists MixerBox - ${backup.owner.name}`);
  doc.setAuthor('Mes playlists');
  doc.setSubject('Sauvegarde des playlists personnelles publiques MixerBox');
  newPage(null);
  lines(backup.owner.name, 22);
  y -= 2;
  lines(`Sauvegarde du ${date} (heure de Paris)`, 10, muted);
  y -= 6;
  lines(`${backup.playlists.length} playlists  /  ${total} morceaux`, 13, accent);
  y -= 22;
  lines('DANS CETTE SAUVEGARDE', 8, muted);
  y -= 2;
  for (const p of backup.playlists) lines(`${p.name}  ·  ${p.tracks.length} morceaux`, 11);
  for (const playlist of backup.playlists) {
    // Les playlists s'enchaînent ; on ne change de page que si l'en-tête et le début de la liste ne tiennent pas.
    if (y - 150 < 65) newPage();
    else {
      y -= 18;
      page!.drawLine({ start: { x: margin, y: y! }, end: { x: width - margin, y: y! }, thickness: 0.8, color: rule });
      y -= 34;
    }
    lines(playlist.name, 20, accent);
    lines(`${playlist.tracks.length} morceaux`, 10, muted);
    lines(playlist.url, 8, muted);
    y -= 14;
    if (!playlist.tracks.length) lines('Cette playlist est vide.', 11, muted);
    for (const track of playlist.tracks) {
      const trackLines = wrap(track.title, 10.5, 409);
      const blockHeight = trackLines.length * 15 + (track.url ? 14 : 0) + 22;
      if (y - Math.min(blockHeight, 620) < 65) { newPage(); lines(`${playlist.name} (suite)`, 16, accent); y -= 12; }
      page!.drawText(`${track.position}.`, { x: margin, y: y!, font, size: 9, color: muted });
      page!.drawText(duration(track.durationSeconds), { x: width - margin - 32, y: y!, font, size: 8, color: muted });
      for (const line of trackLines) {
        if (y! < 80) { newPage(); lines(`${playlist.name} (suite)`, 16, accent); y -= 12; }
        page!.drawText(line, { x: margin + 28, y: y!, font, size: 10.5, color: ink });
        y! -= 15;
      }
      if (track.url) {
        page!.drawText(track.url, { x: margin + 28, y: y! - 1, size: 7.2, font, color: muted });
        y! -= 14;
      }
      y! -= 8;
      page!.drawLine({ start: { x: margin + 28, y: y! }, end: { x: width - margin, y: y! }, thickness: 0.5, color: rule });
      y! -= 14;
    }
  }
  if (replacedCharacters) {
    newPage('NOTE SUR LES CARACTÈRES');
    lines('Certains caractères ne sont pas disponibles dans la police du PDF et sont représentés par un point d’interrogation. Téléchargez également le JSON ou le TXT pour conserver les titres dans leur écriture originale.', 11);
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText('Mes playlists · Sauvegarde MixerBox', { x: margin, y: 29, font, size: 7.5, color: muted });
    const number = `${i + 1} / ${pages.length}`;
    p.drawText(number, { x: width - margin - font.widthOfTextAtSize(number, 8), y: 29, font, size: 8, color: muted });
  });
  return { bytes: await doc.save(), replacedCharacters };
}

export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) result.push(line);
    line = '';
    for (const char of Array.from(word)) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = ''; }
      line += char;
    }
  }
  if (line || result.length === 0) result.push(line);
  return result;
}
