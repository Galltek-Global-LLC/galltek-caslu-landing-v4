interface Env {
  SPARKLE_URL?: string;
  GRUPO_FALLBACK_URL?: string;
}

// URL do Sparkle (atribuição). Configuravel via env, com fallback hardcoded.
const DEFAULT_SPARKLE_URL =
  'https://ap.sparkletracker.com/re/op/6d045aeb-b631-49b6-a48f-2c987ff0e677?uid=1056';

// URL direta do grupo — usada quando o Sparkle esta mal configurado.
// Params `src` e `via` marcam o link como fallback — permite identificar,
// via logs ou analytics do CRM/Meta, quando o Sparkle esteve fora do ar.
const DEFAULT_GRUPO_FALLBACK_URL =
  'https://chat.whatsapp.com/CMWupazVQxs35Zya9ijYPw?src=fallback-grupo&via=caslu-v4';

// Host esperado no destino final do Sparkle. Se o Sparkle redireciona
// para algo que NÃO contém isso, consideramos o link quebrado.
const EXPECTED_HOSTS = ['chat.whatsapp.com'];

// Cache por 60s para não bater no Sparkle a cada carregamento de /grupo.
const CACHE_TTL_SECONDS = 60;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sparkleUrl = env.SPARKLE_URL || DEFAULT_SPARKLE_URL;
  const fallbackUrl = env.GRUPO_FALLBACK_URL || DEFAULT_GRUPO_FALLBACK_URL;

  // Cache-hit no edge do Cloudflare (mesma URL da Function como chave).
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let resolvedUrl = fallbackUrl;
  let healthy = false;
  let resolvedTo: string | undefined;
  let mode: 'http-redirect' | 'js-redirect' | 'not-detected' = 'not-detected';

  try {
    // Segue redirects até obter o destino final (ou até 5 hops).
    const resp = await fetch(sparkleUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    resolvedTo = resp.url;

    // Caso 1: redirect HTTP tradicional (302/301) — URL final já é o destino.
    if (EXPECTED_HOSTS.some((host) => (resolvedTo || '').includes(host))) {
      resolvedUrl = sparkleUrl;
      healthy = true;
      mode = 'http-redirect';
    } else if (resp.ok) {
      // Caso 2: Sparkle retorna HTML e redireciona via JavaScript.
      // Precisa inspecionar o corpo em busca do host esperado.
      const html = await resp.text();
      if (EXPECTED_HOSTS.some((host) => html.includes(host))) {
        resolvedUrl = sparkleUrl;
        healthy = true;
        mode = 'js-redirect';
      }
    }
  } catch (err) {
    console.warn('[resolve-grupo-redirect] fetch failed:', (err as Error).message);
  }

  const body = JSON.stringify({
    url: resolvedUrl,
    healthy,
    resolvedTo,
    mode,
    source: healthy ? 'sparkle' : 'fallback',
  });

  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
    },
  });

  // Grava no cache do edge (a resposta é reutilizada em requests seguintes).
  await cache.put(cacheKey, response.clone());
  return response;
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
