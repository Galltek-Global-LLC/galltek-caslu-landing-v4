export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

const UTM_STORAGE_KEY = 'caslu_copytrade_utms';

export const captureUTMs = (): UTMParams => {
  const params = new URLSearchParams(window.location.search);

  const utms: UTMParams = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
  };

  const cleanUTMs = Object.fromEntries(
    Object.entries(utms).filter(([_, v]) => v !== undefined)
  ) as UTMParams;

  if (Object.keys(cleanUTMs).length > 0) {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(cleanUTMs));
  }

  return cleanUTMs;
};

export const getUTMs = (): UTMParams => {
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
