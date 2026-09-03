import { useEffect, useState } from 'react';
import App from '../App';
import {
  SPARKLE_URL,
  FALLBACK_GRUPO_URL,
  RESOLVE_GRUPO_ENDPOINT,
  RESOLVE_TIMEOUT_MS,
  type ResolveGrupoResponse,
} from '../lib/redirect-urls';

// Promise pré-carregada em main.tsx antes do React inicializar (ganha ~1-2s
// no fluxo). Se não existir (SSR/render isolado), o useEffect faz o fetch
// próprio como fallback.
declare global {
  interface Window {
    __grupoRedirectPromise?: Promise<ResolveGrupoResponse | null>;
  }
}

const requestHealthCheck = (): Promise<ResolveGrupoResponse | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  return fetch(RESOLVE_GRUPO_ENDPOINT, { signal: controller.signal })
    .then((r) => r.json() as Promise<ResolveGrupoResponse>)
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
};

export default function GrupoRoute() {
  // Default OTIMISTA: assume que o Sparkle está saudável (99% do tempo é).
  // Só troca pra FALLBACK_GRUPO_URL se a Function responder healthy=false
  // EXPLICITAMENTE. Se der timeout/erro, mantém Sparkle (fail-open).
  const [redirectUrl, setRedirectUrl] = useState<string>(SPARKLE_URL);

  useEffect(() => {
    let cancelled = false;

    const promise =
      typeof window !== 'undefined' && window.__grupoRedirectPromise
        ? window.__grupoRedirectPromise
        : requestHealthCheck();

    promise.then((data) => {
      if (cancelled || !data) return;
      // Só troca se healthy === false (explicito). Undefined/erro mantém Sparkle.
      if (data.healthy === false) {
        setRedirectUrl(FALLBACK_GRUPO_URL);
      } else if (data.healthy === true && data.url) {
        setRedirectUrl(data.url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <App redirectUrl={redirectUrl} />;
}
