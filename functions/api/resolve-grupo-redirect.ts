interface Env {
  SPARKLE_URL?: string;
  GRUPO_FALLBACK_URL?: string;
  GRUPO_URL_CACHE?: KVNamespace;
}

// URL do Sparkle (atribuição). Configurável via env, com fallback hardcoded.
const DEFAULT_SPARKLE_URL =
  'https://ap.sparkletracker.com/re/op/op_4b360bc3ef?uid=1086';

// Último link conhecido do grupo (safe net absoluta). Só é usado se:
//   - env override não estiver setado E
//   - KV não tiver o link salvo (primeira execução / KV limpo)
// Enquanto o Sparkle estiver saudável, o KV é atualizado automaticamente.
const DEFAULT_GRUPO_FALLBACK_URL =
  'https://chat.whatsapp.com/DM8YoTf05muCKuvyqY0UV1';

// Params que marcam a URL como fallback — anexados a QUALQUER URL do grupo
// que vier a ser servida como fallback (KV, env ou default).
const FALLBACK_MARKERS = 'src=fallback-grupo&via=caslu-v4';

// Chave usada no KV para o link do grupo mais recente detectado no Sparkle.
const KV_KEY_GRUPO = 'sparkle:link-atual-grupo';

// Cache do edge por 60s pra não bater no Sparkle a cada carregamento.
const CACHE_TTL_SECONDS = 60;

// Regex pra achar o link do grupo dentro do HTML do Sparkle.
const GRUPO_LINK_REGEX = /https?:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+/;

// Anexa os markers de fallback numa URL do grupo, sem sobrescrever query
// existentes. Aceita URL com ou sem query.
const anexarMarkers = (url: string): string => {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${FALLBACK_MARKERS}`;
};

// Extrai o link do grupo do HTML do Sparkle. Retorna undefined se não achar.
const extrairLinkDoGrupoDoHtml = (html: string): string | undefined => {
  const match = html.match(GRUPO_LINK_REGEX);
  return match ? match[0] : undefined;
};

// Resolve a URL de fallback com prioridade:
// 1) env override (`GRUPO_FALLBACK_URL`) — manutenção manual imediata
// 2) KV (`sparkle:link-atual-grupo`) — último link detectado automaticamente
// 3) DEFAULT_GRUPO_FALLBACK_URL — último recurso hardcoded
const resolverFallback = async (env: Env): Promise<string> => {
  if (env.GRUPO_FALLBACK_URL) return env.GRUPO_FALLBACK_URL;
  if (env.GRUPO_URL_CACHE) {
    try {
      const kvValue = await env.GRUPO_URL_CACHE.get(KV_KEY_GRUPO);
      if (kvValue) return anexarMarkers(kvValue);
    } catch (err) {
      console.warn('[resolve-grupo-redirect] falha ao ler KV:', (err as Error).message);
    }
  }
  return anexarMarkers(DEFAULT_GRUPO_FALLBACK_URL);
};

// Grava no KV o link do grupo detectado no HTML do Sparkle. Retorna
// informação de debug — nunca lança.
const persistirLinkNoKv = async (
  env: Env,
  link: string,
): Promise<{ ok: boolean; skipped?: string; error?: string; previous?: string | null }> => {
  if (!env.GRUPO_URL_CACHE) return { ok: false, skipped: 'no-binding' };
  try {
    const current = await env.GRUPO_URL_CACHE.get(KV_KEY_GRUPO);
    if (current === link) return { ok: true, skipped: 'unchanged', previous: current };
    await env.GRUPO_URL_CACHE.put(KV_KEY_GRUPO, link);
    return { ok: true, previous: current };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const sparkleUrl = env.SPARKLE_URL || DEFAULT_SPARKLE_URL;

  // Cache-hit no edge do Cloudflare (mesma URL da Function como chave).
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const fallbackUrl = await resolverFallback(env);

  let resolvedUrl = fallbackUrl;
  let healthy = false;
  let resolvedTo: string | undefined;
  let mode: 'http-redirect' | 'js-redirect' | 'not-detected' = 'not-detected';
  let detectedGrupoLink: string | undefined;

  try {
    // Segue redirects até obter o destino final (ou até 5 hops).
    const resp = await fetch(sparkleUrl, {
      method: 'GET',
      redirect: 'follow',
    });
    resolvedTo = resp.url;

    // Caso 1: redirect HTTP tradicional (302/301) — URL final já é o destino.
    if ((resolvedTo || '').includes('chat.whatsapp.com')) {
      resolvedUrl = sparkleUrl;
      healthy = true;
      mode = 'http-redirect';
      detectedGrupoLink = resolvedTo;
    } else if (resp.ok) {
      // Caso 2: Sparkle retorna HTML e redireciona via JavaScript.
      const html = await resp.text();
      detectedGrupoLink = extrairLinkDoGrupoDoHtml(html);
      if (detectedGrupoLink) {
        resolvedUrl = sparkleUrl;
        healthy = true;
        mode = 'js-redirect';
      }
    }
  } catch (err) {
    console.warn('[resolve-grupo-redirect] fetch failed:', (err as Error).message);
  }

  // Atualiza KV se conseguimos detectar o link atual do Sparkle. Assim, se
  // um dia o Sparkle voltar a quebrar, o fallback usa esse valor recente.
  if (detectedGrupoLink) {
    await persistirLinkNoKv(env, detectedGrupoLink);
  }

  const body = JSON.stringify({
    url: resolvedUrl,
    healthy,
    resolvedTo,
    mode,
    source: healthy ? 'sparkle' : 'fallback',
    detectedGrupoLink,
  });

  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
    },
  });

  await cache.put(cacheKey, response.clone());
  return response;
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
