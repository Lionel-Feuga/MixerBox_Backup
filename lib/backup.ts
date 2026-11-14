import type { Backup, Discovery, Playlist } from './types';
import { duration } from './types';
export function assemble(discovery: Discovery, results: Playlist[], failures: string[], sourceUrl: string): Backup {
  const playlists = results.filter(p => p.ownerId === discovery.ownerId);
  const byId = new Map(playlists.map(p => [p.id, p]));
  const owned = discovery.candidates.flatMap(c => byId.has(c.id) ? [byId.get(c.id)!] : []);
  const expected = discovery.seed.ownerPlaylistCount;
  const warnings = [...discovery.warnings, ...failures];
  if (expected === null) warnings.push('Le nombre total de playlists personnelles n’a pas pu être vérifié.');
  else if (owned.length !== expected) warnings.push(`${owned.length} playlists personnelles récupérées sur ${expected} annoncées. Certaines peuvent être privées ou absentes du profil public.`);
  const counts = new Set(playlists.map(p => p.ownerPlaylistCount).filter(c => c !== null));
  if (counts.size > 1) warnings.push('Le nombre de playlists a changé pendant la récupération. Relancez la sauvegarde.');
  for (const p of owned) for (const w of p.warnings) warnings.push(`${p.name} : ${w}`);
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), sourceUrl,
    owner: { id: discovery.ownerId, name: discovery.ownerName, url: discovery.profileUrl },
    scope: 'public-owned-playlists', expectedPlaylistCount: expected,
    complete: warnings.length === 0 && owned.length > 0 && owned.every(p => p.complete), warnings, playlists: owned };
}
export function asText(backup: Backup): string {
  return [ 'MES PLAYLISTS MIXERBOX', backup.owner.name, `Sauvegarde du ${new Date(backup.exportedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`,
    'Périmètre : playlists personnelles publiques. Titres originaux conservés.',
    backup.complete ? 'Vérification : comptes des playlists et morceaux concordants.' : 'ATTENTION : SAUVEGARDE INCOMPLÈTE',
    ...backup.warnings, '', ...backup.playlists.flatMap(p => [ `${p.name} — ${p.tracks.length} morceaux`, p.url,
      ...p.tracks.map(t => `${t.position}. ${t.title} [${duration(t.durationSeconds)}]${t.url ? `\n   ${t.url}` : ''}`), '' ]) ].join('\n');
}
