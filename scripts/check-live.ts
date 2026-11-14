import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { discover, getPlaylist } from '../lib/mixerbox';
import { assemble, asText } from '../lib/backup';
import { createBackupPdf } from '../lib/pdf';

async function main() {
  const url = process.argv[2] || 'https://www.mbplayer.com/list/209664600';
  const discovery = await discover(url);
  const playlists = [discovery.seed];
  for (const candidate of discovery.candidates) {
    if (candidate.id !== discovery.seed.id) playlists.push(await getPlaylist(candidate.id));
  }
  const backup = assemble(discovery, playlists, [], url);
  assert.equal(backup.complete, true, backup.warnings.join('\n'));
  if (!process.argv[2]) {
    assert.deepEqual(backup.playlists.map(p => p.tracks.length).sort(), [2, 4, 4]);
    const b = backup.playlists.find(p => p.name === 'B')!;
    const c = backup.playlists.find(p => p.name === 'C')!;
    assert.equal(b.tracks.filter(t => c.tracks.some(other => other.sourceId === t.sourceId)).length, 2);
  }
  const font = await readFile('public/fonts/NotoSans-Regular.ttf');
  const { bytes, replacedCharacters } = await createBackupPdf(backup, font);
  await mkdir('test-output', { recursive: true });
  await writeFile('test-output/backup.json', JSON.stringify(backup, null, 2));
  await writeFile('test-output/backup.txt', asText(backup));
  await writeFile('test-output/backup.pdf', bytes);
  console.log(JSON.stringify({ playlists: backup.playlists.length, tracks: backup.playlists.reduce((n, p) => n + p.tracks.length, 0), complete: backup.complete, replacedCharacters }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
