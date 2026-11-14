export interface Track {
  position: number;
  id: string | null;
  source: string | null;
  sourceId: string | null;
  title: string;
  durationSeconds: number | null;
  url: string | null;
  statusCode: number | null;
}
export interface Playlist {
  id: string;
  name: string;
  url: string;
  ownerId: string;
  ownerName: string;
  expectedCount: number;
  ownerPlaylistCount: number | null;
  tracks: Track[];
  complete: boolean;
  warnings: string[];
}
export interface Discovery {
  ownerId: string;
  ownerName: string;
  profileUrl: string;
  seed: Playlist;
  candidates: { id: string; name: string }[];
  warnings: string[];
}
export interface Backup {
  schemaVersion: 1;
  exportedAt: string;
  sourceUrl: string;
  owner: { id: string; name: string; url: string };
  scope: 'public-owned-playlists';
  expectedPlaylistCount: number | null;
  complete: boolean;
  warnings: string[];
  playlists: Playlist[];
}
export function duration(seconds: number | null) {
  if (seconds === null) return '—';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  return h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
