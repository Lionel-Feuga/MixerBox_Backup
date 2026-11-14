import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { parsePlaylistUrl, normalizePlaylist, normalizeProfile } from '../lib/mixerbox';
import { assemble, asText } from '../lib/backup';
import { createBackupPdf } from '../lib/pdf';

function raw(id = '123', owner = '42', size = 1) {
  return { id, owner, ownerName: 'Camille', name: 'Été', isPub: true, deleted: false, itemCount: 2, next: null,
    items: [
      { type: 'music', t: 'yt', f: 'ktvTqknDobU', tt: 'Imagine Dragons - Radioactive', tm: 261, _id: '1', statusCode: 0 },
      { type: 'music', t: 'yt', f: 'WC5FdFlUcl0', tt: 'Audioslave - Be Yourself', tm: 282, _id: '2', statusCode: 0 },
      { type: 'brand', brand: 'youtube' }, { type: 'dj', ref: owner, size },
    ] };
}
test('accepts only public MixerBox playlist URLs, never arbitrary upstream destinations', () => {
  assert.equal(parsePlaylistUrl('https://www.mbplayer.com/list/123?foo=bar'), '123');
  for (const value of ['http://mbplayer.com/list/1', 'https://mbplayer.com.evil.com/list/1', 'https://user:pass@mbplayer.com/list/1', 'https://mbplayer.com:8080/list/1', 'https://localhost/list/1', 'https://mbplayer.com/api/userInfo', 'https://mbplayer.com/list/%2Ffoo']) assert.throws(() => parsePlaylistUrl(value));
});
test('keeps track order, repeated tracks, original titles and YouTube links', () => {
  const data = raw(); data.items.splice(1, 0, data.items[0]); data.itemCount = 3;
  const p = normalizePlaylist(data, '123');
  assert.equal(p.tracks.length, 3); assert.equal(p.complete, true);
  assert.deepEqual(p.tracks.map(t => t.id), ['1', '1', '2']);
  assert.equal(p.tracks[0].url, 'https://www.youtube.com/watch?v=ktvTqknDobU');
});
test('counts music only and fails closed on missing tracks, missing titles and pagination', () => {
  assert.equal(normalizePlaylist(raw(), '123').tracks.length, 2);
  assert.equal(normalizePlaylist({ ...raw(), itemCount: 3 }, '123').complete, false);
  assert.equal(normalizePlaylist({ ...raw(), next: 'cursor' }, '123').complete, false);
  const data = raw(); data.items[0].tt = '';
  assert.equal(normalizePlaylist(data, '123').complete, false);
  assert.throws(() => normalizePlaylist({ ...raw(), isPub: false }, '123'));
  assert.throws(() => normalizePlaylist({ ...raw(), itemCount: null }, '123'));
});
test('excludes recommendations by owner ID, preserves shared tracks in both personal playlists', () => {
  const a = normalizePlaylist(raw('123', '42', 2), '123');
  const b = normalizePlaylist(raw('124', '42', 2), '124');
  const recommendation = normalizePlaylist(raw('125', '99', 5), '125');
  const discovery = normalizeProfile({ getVector: { id: '42', name: 'Camille', total: 7,
    items: ['123', '124', '125'].map(ref => ({ type: 'playlist', ref, title: ref })) } }, a);
  const backup = assemble(discovery, [a, b, recommendation], [], a.url);
  assert.equal(backup.complete, true); assert.equal(backup.playlists.length, 2);
  assert.equal(backup.playlists.reduce((n, p) => n + p.tracks.length, 0), 4);
  assert.equal(asText(backup).match(/Radioactive/g)?.length, 2);
  assert.equal(assemble(discovery, [a], [], a.url).complete, false);
  assert.equal(assemble(discovery, [a, b], ['Une playlist inaccessible'], a.url).complete, false);
});
test('unknown total prevents claiming a complete backup', () => {
  const a = normalizePlaylist(raw(), '123'); a.ownerPlaylistCount = null;
  const discovery = normalizeProfile({ getVector: { id: '42', items: [] } }, a);
  assert.equal(assemble(discovery, [a], [], a.url).complete, false);
});
test('PDF handles long lists and long titles, and refuses incomplete backups', async () => {
  const a = normalizePlaylist(raw(), '123');
  a.tracks = Array.from({ length: 150 }, (_, i) => ({ ...a.tracks[0], position: i + 1, title: `Morceau ${i + 1} — ${'Été et découvertes musicales '.repeat(i === 149 ? 30 : 3)}` }));
  a.expectedCount = 150;
  const discovery = normalizeProfile({ getVector: { id: '42', items: [] } }, a);
  const backup = assemble(discovery, [a], [], a.url);
  const font = await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url));
  const result = await createBackupPdf(backup, font);
  const document = await PDFDocument.load(result.bytes);
  assert.ok(document.getPageCount() >= 8);
  assert.equal(result.replacedCharacters, false);
  await assert.rejects(createBackupPdf({ ...backup, complete: false }, font));
});
