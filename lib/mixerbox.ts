import type { Discovery, Playlist, Track } from './types';

const ORIGIN = 'https://www.mbplayer.com';
const ID = /^[a-zA-Z0-9_-]{1,160}$/;
const LIMIT = 8 * 1024 * 1024;
type ObjectData = Record<string, unknown>;
function object(value: unknown): ObjectData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Réponse MixerBox non reconnue. Réessayez plus tard.');
  return value as ObjectData;
}
const text = (v: unknown) => typeof v === 'string' ? v : '';
const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function validId(id: string) {
  if (!ID.test(id)) throw new Error('Identifiant de playlist invalide.');
  return id;
}
export function parsePlaylistUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Collez un lien complet, par exemple https://www.mbplayer.com/list/123456.'); }
  if (url.protocol !== 'https:' || !['mbplayer.com', 'www.mbplayer.com'].includes(url.hostname) || url.port || url.username || url.password) {
    throw new Error('Utilisez un lien HTTPS de playlist provenant de mbplayer.com.');
  }
  const match = url.pathname.match(/^\/list\/([a-zA-Z0-9_-]{1,160})\/?$/);
  if (!match) throw new Error('Ouvrez une playlist MixerBox et copiez son adresse (…/list/…).');
  return match[1];
}
async function request(path: string): Promise<unknown> {
  const response = await fetch(`${ORIGIN}${path}`, {
    headers: { Referer: `${ORIGIN}/`, 'browser-lang': 'fr', 'country-code': 'fr', Accept: 'application/json' },
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) {
    const error = new Error('MixerBox reçoit trop de demandes. Patientez une minute puis réessayez.');
    error.name = 'RateLimitError';
    throw error;
  }
  if (!response.ok) throw new Error('MixerBox est momentanément inaccessible. Réessayez.');
  if (Number(response.headers.get('content-length') || 0) > LIMIT) throw new Error('Cette réponse dépasse la taille maximale prise en charge.');
  if (!response.body) throw new Error('MixerBox a renvoyé une réponse vide.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, body = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) throw new Error('Cette réponse dépasse la taille maximale prise en charge.');
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(body); } catch { throw new Error('MixerBox a renvoyé un format inattendu. Réessayez plus tard.'); }
}
export function normalizePlaylist(raw: unknown, requestedId: string): Playlist {
  const data = object(raw);
  if (data.error || data.deleted || data.isPub !== true) throw new Error('Cette playlist est privée, supprimée ou inaccessible sans connexion.');
  if (String(data.id) !== requestedId || !Array.isArray(data.items) || !text(data.owner)) throw new Error('Les données de cette playlist sont incomplètes.');
  const expected = count(data.itemCount);
  if (expected === null) throw new Error('MixerBox ne fournit pas le nombre de morceaux : impossible de vérifier la sauvegarde.');
  const warnings: string[] = [];
  const items = data.items.map(object);
  // The API includes decorative brand/owner/recommendation rows. Only music rows are tracks.
  const music = items.filter(i => i.type === 'music' || typeof i.t === 'string');
  const tracks: Track[] = music.map((item, i) => {
    const title = text(item.tt);
    if (!title) warnings.push(`Le morceau ${i + 1} n'a pas de titre disponible.`);
    const source = text(item.t) || null, sourceId = text(item.f) || null;
    return { position: i + 1, id: text(item._id) || null, title: title || 'Titre indisponible',
      source, sourceId, durationSeconds: count(item.tm),
      url: source === 'yt' && sourceId && /^[\w-]{11}$/.test(sourceId) ? `https://www.youtube.com/watch?v=${sourceId}` : null,
      statusCode: typeof item.statusCode === 'number' ? item.statusCode : null,
    };
  });
  const owner = items.find(i => i.type === 'dj' && String(i.ref) === data.owner);
  if (tracks.length !== expected) warnings.push(`${tracks.length} morceaux récupérés sur ${expected} annoncés.`);
  if (data.next != null && data.next !== false && data.next !== '') warnings.push('MixerBox indique une suite de données qui n’a pas pu être récupérée.');
  return { id: requestedId, name: text(data.name) || 'Playlist sans nom', url: `${ORIGIN}/list/${requestedId}`,
    ownerId: text(data.owner), ownerName: text(data.ownerName) || 'Utilisateur MixerBox',
    ownerPlaylistCount: owner ? count(owner.size) : null,
    expectedCount: expected, tracks, complete: warnings.length === 0, warnings,
  };
}
export async function getPlaylist(id: string): Promise<Playlist> {
  validId(id);
  return normalizePlaylist(await request(`/api/playlist?reverse=true&type=playlist&vectorId=${encodeURIComponent(id)}`), id);
}
export function normalizeProfile(raw: unknown, seed: Playlist): Discovery {
  const root = object(raw);
  if (root.error) throw new Error('Le profil public ne peut pas être consulté.');
  const data = object(root.getVector);
  if (String(data.id) !== seed.ownerId || !Array.isArray(data.items)) throw new Error('Le profil MixerBox est incomplet.');
  const candidates = new Map<string, { id: string; name: string }>();
  for (const rawItem of data.items) {
    const item = object(rawItem);
    if (item.type !== 'playlist') continue;
    const id = text(item.ref);
    if (!ID.test(id)) throw new Error('Une playlist du profil contient un identifiant non reconnu.');
    candidates.set(id, { id, name: text(item.title) || 'Playlist sans nom' });
  }
  if (candidates.size > 300) throw new Error('Ce profil dépasse la limite actuelle de 300 playlists.');
  candidates.set(seed.id, { id: seed.id, name: seed.name });
  const warnings: string[] = [];
  if (data.next != null && data.next !== false && data.next !== '') warnings.push('La liste du profil comporte une suite non récupérée.');
  // `total` includes non-playlist entries, and is not a count of owned playlists.
  return { ownerId: seed.ownerId, ownerName: text(data.name) || seed.ownerName,
    profileUrl: `${ORIGIN}/user/${seed.ownerId}`, seed, candidates: [...candidates.values()], warnings };
}
export async function discover(input: string): Promise<Discovery> {
  const seed = await getPlaylist(parsePlaylistUrl(input));
  validId(seed.ownerId);
  const profile = await request(`/api/singer?id=${encodeURIComponent(seed.ownerId)}`);
  return normalizeProfile(profile, seed);
}
