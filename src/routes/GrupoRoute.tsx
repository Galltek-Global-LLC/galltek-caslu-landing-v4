import { useEffect, useState } from 'react';
import App from '../App';

// URL direta do grupo (fallback safe se o Sparkle estiver mal configurado).
// Mantida no client como default para o caso da Function `/api/resolve-grupo-redirect`
// nao responder a tempo ou retornar erro — assim o usuario cai direto no grupo
// em vez de acabar na homepage do WhatsApp.
// Params `src` e `via` marcam o link como fallback — permite identificar,
// via analytics do CRM/Meta, quando o Sparkle esteve fora do ar.
const FALLBACK_GRUPO_URL =
  'https://chat.whatsapp.com/CMWupazVQxs35Zya9ijYPw?src=fallback-grupo&via=caslu-v3';

const RESOLVE_ENDPOINT = '/api/resolve-grupo-redirect';
const RESOLVE_TIMEOUT_MS = 2500;

export default function GrupoRoute() {
  // Inicia com fallback direto — se a Function não responder, essa é a URL
  // usada no submit e no botão do modal. So faz upgrade pro Sparkle se o
  // health check confirmar que o destino final aponta pra chat.whatsapp.com.
  const [redirectUrl, setRedirectUrl] = useState<string>(FALLBACK_GRUPO_URL);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

    fetch(RESOLVE_ENDPOINT, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { url?: string; healthy?: boolean; source?: string }) => {
        if (data?.url && data?.healthy) {
          setRedirectUrl(data.url);
        }
        // Se healthy=false, mantem FALLBACK_GRUPO_URL (default do state).
      })
      .catch(() => {
        // Timeout ou erro de rede — mantem FALLBACK_GRUPO_URL.
      })
      .finally(() => clearTimeout(timeout));

    return () => clearTimeout(timeout);
  }, []);

  return <App redirectUrl={redirectUrl} />;
}
