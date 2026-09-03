// Constantes de redirect compartilhadas entre main.tsx (pré-load do health-check),
// GrupoRoute (fallback safe) e verificação client-side.
//
// SPARKLE_URL: destino padrão que atribui o clique no Sparkle antes de redirecionar
//              pro grupo.
// FALLBACK_GRUPO_URL: link direto do grupo — usado apenas quando a Function
//                     `/api/resolve-grupo-redirect` explicitamente confirma que o
//                     Sparkle está mal configurado. Params `src` e `via` marcam
//                     o link como fallback pra rastreio downstream.

export const SPARKLE_URL =
  'https://ap.sparkletracker.com/re/op/6d045aeb-b631-49b6-a48f-2c987ff0e677?uid=1056';

export const FALLBACK_GRUPO_URL =
  'https://chat.whatsapp.com/CMWupazVQxs35Zya9ijYPw?src=fallback-grupo&via=caslu-v4';

export const RESOLVE_GRUPO_ENDPOINT = '/api/resolve-grupo-redirect';

export const RESOLVE_TIMEOUT_MS = 5000;

// Formato da resposta da Function `/api/resolve-grupo-redirect`.
export interface ResolveGrupoResponse {
  url?: string;
  healthy?: boolean;
  resolvedTo?: string;
  mode?: 'http-redirect' | 'js-redirect' | 'not-detected';
  source?: 'sparkle' | 'fallback';
}
