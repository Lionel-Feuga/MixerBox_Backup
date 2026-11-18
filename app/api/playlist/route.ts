import { getPlaylist } from '@/lib/mixerbox';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  try { return Response.json(await getPlaylist(id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'MixerBox met trop de temps à répondre. Réessayez.' }, { status: error instanceof Error && error.name === 'RateLimitError' ? 429 : 422, headers: { 'Cache-Control': 'no-store' } }); }
}
