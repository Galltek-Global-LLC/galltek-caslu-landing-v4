import { UTMParams } from './utm-tracker';
import { getTestEventCode, resolveFbc } from './meta-tracking';

const SUBMIT_ENDPOINT = '/api/submit-form';
const APPS_SCRIPT_FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbyxQUW8uO_zLxphyCAwK7m4ew4aExanEKYU1ytqk5Ekah5i845b5KMRb6gEgKW9byXK/exec';
const CAMPAIGN_ID = '2026-trinity-captura-v4';

export interface FormSubmissionData {
  name: string;
  email: string;
  phone: string;
  source: string;
}

type SubmitPayload = {
  nome: string;
  email: string;
  whatsapp: string;
  source: string;
  campaign: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
};

// Lê cookie do navegador pelo nome. Usado para capturar _fbc e _fbp do Meta Pixel.
const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

const buildPayload = (formData: FormSubmissionData, utms: UTMParams): SubmitPayload => ({
  nome: formData.name,
  email: formData.email,
  whatsapp: formData.phone,
  source: formData.source,
  campaign: CAMPAIGN_ID,
  utm_source: utms.utm_source || '',
  utm_medium: utms.utm_medium || '',
  utm_campaign: utms.utm_campaign || '',
  utm_content: utms.utm_content || '',
  utm_term: utms.utm_term || '',
});

// Payload enviado para a Function (inclui dados extras pro Meta CAPI).
// A Function mapeia "whatsapp" → "telefone" antes de mandar pro Apps Script.
type FunctionPayload = SubmitPayload & {
  eventID?: string;
  source_url?: string;
  fbc?: string;
  fbp?: string;
  test_event_code?: string;
};

const tryPrimary = async (payload: FunctionPayload): Promise<boolean> => {
  try {
    const response = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return false;
    try {
      const result = await response.json();
      return result.success === true;
    } catch {
      return true;
    }
  } catch {
    return false;
  }
};

// Fire-and-forget para o Apps Script V2 via JSON + no-cors.
// Com mode: 'no-cors', o browser força Content-Type para text/plain
// (o que o Apps Script V2 aceita sem preflight). Resposta fica opaque
// mas o lead é gravado normalmente na planilha.
const tryFallback = async (payload: SubmitPayload): Promise<boolean> => {
  try {
    // Apps Script V2 espera campo "telefone", não "whatsapp"
    const { whatsapp, ...rest } = payload;
    await fetch(APPS_SCRIPT_FALLBACK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...rest,
        telefone: whatsapp,
        timestamp: new Date().toISOString(),
      }),
    });
    return true;
  } catch (error) {
    console.error('[fallback] Erro ao enviar para Apps Script:', error);
    return false;
  }
};

export const submitToGoogleAppsScript = async (
  formData: FormSubmissionData,
  utms: UTMParams = {},
  eventID?: string,
): Promise<boolean> => {
  const basePayload = buildPayload(formData, utms);
  const functionPayload: FunctionPayload = {
    ...basePayload,
    eventID,
    source_url: typeof window !== 'undefined' ? window.location.href : undefined,
    fbc: resolveFbc(),
    fbp: readCookie('_fbp'),
    test_event_code: getTestEventCode(),
  };

  const primaryOk = await tryPrimary(functionPayload);
  if (primaryOk) return true;

  console.warn('[submit] Primary failed, trying fallback to Apps Script directly');
  return tryFallback(basePayload);
};

export const getCampaignId = (): string => CAMPAIGN_ID;
