import { discover } from '@/lib/mixerbox';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url || url.length > 1000) return Response.json({ error: 'Collez un lien de playlist MixerBox.' }, { status: 400 });
  try { return Response.json(await discover(url), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'MixerBox met trop de temps à répondre. Réessayez.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } }); }
}
