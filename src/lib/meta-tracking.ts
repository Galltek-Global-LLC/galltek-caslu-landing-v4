// Dispara evento Meta via Pixel (client) + CAPI (server) com MESMO eventID.
// Meta deduplica automaticamente — 1 evento contado, com matching melhor.
import { generateTransactionId } from './data-hasher';

const TRACK_ENDPOINT = '/api/track-event';
const TEST_CODE_STORAGE_KEY = '_tg_meta_test_event_code';
const FBC_STORAGE_KEY = '_caslu_fbc';
const FBC_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias (spec Meta)

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

// Anexa fbp, fbc, fbclid e UTMs da URL atual a uma URL de redirect.
// Espelha o que o Sparkle Tracker script faz com cliques em <a>, mas funciona
// para redirects programáticos via `window.location.href`.
//
// Por que isso é necessário: o Sparkle Tracker intercepta apenas <a> existentes
// no DOM. Quando o redirect acontece via JavaScript (window.location.href),
// o script não pega. Esta função reproduz a lógica:
//   1. Pega params atuais da URL (utm_*, fbclid, gclid, etc.)
//   2. Adiciona fbp e fbc dos cookies (se não vieram na URL)
//   3. Mescla tudo na URL de destino, sem sobrescrever params já presentes
export const buildTrackedRedirectUrl = (destinationUrl: string): string => {
  if (typeof window === 'undefined') return destinationUrl;
  try {
    const dest = new URL(destinationUrl);
    const incoming = new URLSearchParams(window.location.search);

    const fbpCookie = readCookie('_fbp');
    const fbcCookie = readCookie('_fbc');
    if (fbpCookie && !incoming.has('fbp')) incoming.set('fbp', fbpCookie);
    if (fbcCookie && !incoming.has('fbc')) incoming.set('fbc', fbcCookie);

    incoming.forEach((val, key) => {
      if (!dest.searchParams.has(key)) dest.searchParams.set(key, val);
    });
    const final = dest.toString();
    // Debug temporário: confere no console (F12) a URL final do redirect.
    // Mostra tudo que está sendo anexado ao link do Sparkle.
    console.info(
      '%c[Sparkle redirect]',
      'background:#b8860b;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
      final,
    );
    return final;
  } catch {
    return destinationUrl;
  }
};

// Resolve o parâmetro `fbc` no formato oficial Meta: `fb.1.{ts}.{fbclid}`.
// Prioridade:
//   1) fbclid da URL → constrói fbc preservando o case EXATO (Meta exige)
//      e persiste em localStorage por 90 dias
//   2) fbc persistido em localStorage de uma visita anterior (válido por 90 dias)
//   3) cookie `_fbc` criado pelo Pixel JS (fallback)
//
// Por que não usar só o cookie:
//   • Safari ITP/iOS truncam ou bloqueiam o cookie
//   • Cookie pode vir desatualizado em retornos (fbclid antigo)
//   • Subdomínios podem ter cookies diferentes
// Meta rejeita fbc "modificado" — esse caminho preserva o fbclid original.
export const resolveFbc = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;

  // 1. fbclid na URL → constrói fbc novo
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const fbclid = urlParams.get('fbclid');
    if (fbclid) {
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem(FBC_STORAGE_KEY) || 'null') as
            | { fbc: string; fbclid: string; ts: number }
            | null;
        } catch {
          return null;
        }
      })();
      if (!existing || existing.fbclid !== fbclid) {
        const fbc = `fb.1.${Date.now()}.${fbclid}`;
        try {
          localStorage.setItem(
            FBC_STORAGE_KEY,
            JSON.stringify({ fbc, fbclid, ts: Date.now() }),
          );
        } catch {
          // localStorage indisponível — segue com o valor in-memory
        }
        return fbc;
      }
      return existing.fbc;
    }
  } catch {
    // Ignora — cai pros próximos fallbacks
  }

  // 2. fbc persistido de visita anterior
  try {
    const raw = localStorage.getItem(FBC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { fbc: string; ts: number };
      if (parsed.fbc && Date.now() - parsed.ts < FBC_TTL_MS) {
        return parsed.fbc;
      }
    }
  } catch {
    // Ignora
  }

  // 3. cookie do Pixel JS
  return readCookie('_fbc');
};

// Captura `?test_event_code=` da URL e persiste em sessionStorage por sessão.
// Permite testar em produção sem hardcodar código no build.
// Acesse o site com ?test_event_code=TEST18373 e todos eventos seguintes
// (Pixel + CAPI) chegam na aba "Test Events" do Events Manager.
export const getTestEventCode = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('test_event_code');
    if (fromUrl) {
      sessionStorage.setItem(TEST_CODE_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(TEST_CODE_STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
};

export interface TrackEventOptions {
  eventName: string;
  customData?: Record<string, unknown>;
  userData?: {
    email?: string;
    phone?: string;
  };
}

// Aguarda até 300ms pelo cookie _fbp (criado pelo Pixel base ao inicializar).
// Sem isso, primeiro PageView pode disparar antes do cookie existir.
const waitForFbp = async (maxWaitMs = 300): Promise<string | undefined> => {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const fbp = readCookie('_fbp');
    if (fbp) return fbp;
    await new Promise((r) => setTimeout(r, 50));
  }
  return readCookie('_fbp');
};

export const trackMetaEvent = async (opts: TrackEventOptions): Promise<string> => {
  const eventID = generateTransactionId();

  // 1) Pixel client-side com eventID na 4ª posição (formato oficial Meta)
  if (typeof window.fbq === 'function') {
    window.fbq('track', opts.eventName, opts.customData || {}, { eventID });
  }

  // 2) CAPI server-side (fire-and-forget — não bloqueia UX se cair)
  try {
    const fbp = await waitForFbp();
    const fbc = resolveFbc();

    fetch(TRACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: opts.eventName,
        eventID,
        source_url: typeof window !== 'undefined' ? window.location.href : undefined,
        fbc,
        fbp,
        email: opts.userData?.email,
        phone: opts.userData?.phone,
        custom_data: opts.customData,
        test_event_code: getTestEventCode(),
      }),
      keepalive: true,
    }).catch((err) => {
      console.warn('[meta-tracking] CAPI request failed:', err);
    });
  } catch (err) {
    console.warn('[meta-tracking] erro ao preparar CAPI:', err);
  }

  return eventID;
};
