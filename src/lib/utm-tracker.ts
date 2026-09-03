export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

// IDs de clique de plataformas de anúncios. Capturados juntos das UTMs — cada
// plataforma tem o seu:
//   - fbclid: Meta/Facebook
//   - gclid: Google Ads (padrão)
//   - wbraid / gbraid: Google Ads (iOS, com Enhanced Conversions)
//   - ttclid: TikTok Ads
// Precisamos persistir junto porque o lead pode chegar via anúncio e submeter
// muito depois — sem os IDs de clique, o Sparkle/Meta/Google não conseguem
// atribuir a conversão à campanha certa.
export interface ClickIDs {
  fbclid?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  ttclid?: string;
}

export type TrackingParams = UTMParams & ClickIDs;

const UTM_STORAGE_KEY = 'caslu_copytrade_utms';

const cleanUndefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

export const captureUTMs = (): TrackingParams => {
  const params = new URLSearchParams(window.location.search);

  const captured: TrackingParams = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
    fbclid: params.get('fbclid') || undefined,
    gclid: params.get('gclid') || undefined,
    wbraid: params.get('wbraid') || undefined,
    gbraid: params.get('gbraid') || undefined,
    ttclid: params.get('ttclid') || undefined,
  };

  const clean = cleanUndefined(captured);

  if (Object.keys(clean).length > 0) {
    // Merge com valores já armazenados para não perder IDs de captura
    // anterior caso o usuário chegue por link direto após passar pelo ad.
    try {
      const previous = JSON.parse(sessionStorage.getItem(UTM_STORAGE_KEY) || '{}');
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ ...previous, ...clean }));
    } catch {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(clean));
    }
  }

  return clean;
};

export const getUTMs = (): TrackingParams => {
  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Erro ao recuperar UTMs:', error);
  }
  return {};
};

export const clearUTMs = (): void => {
  sessionStorage.removeItem(UTM_STORAGE_KEY);
};
