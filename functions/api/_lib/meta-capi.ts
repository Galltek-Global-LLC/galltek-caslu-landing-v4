// Helper para envio de eventos para Meta Conversions API.
// Server-side companion do Pixel client-side — mesmo eventID = deduplicação.

const META_API_VERSION = 'v18.0';

export interface UserData {
  email?: string;
  phone?: string;
  fbc?: string;
  fbp?: string;
  clientIp?: string;
  userAgent?: string;
}

export interface CapiEvent {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  userData: UserData;
  customData?: Record<string, unknown>;
  testEventCode?: string;
}

const sha256 = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Meta exige email lowercase e trimado antes do hash.
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Meta exige phone só com dígitos, com country code.
// Aceita "+5511999999999" ou "(11) 99999-9999" e normaliza para "5511999999999".
const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // Se já começa com 55 e tem >= 12 dígitos, considera completo.
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  // Caso contrário, adiciona código BR.
  return `55${digits}`;
};

export const sendLeadToMetaCapi = async (
  pixelId: string,
  accessToken: string,
  event: CapiEvent,
): Promise<{ success: boolean; error?: string; response?: unknown }> => {
  if (!pixelId || !accessToken) {
    return { success: false, error: 'pixelId ou accessToken ausente' };
  }

  const { email, phone, fbc, fbp, clientIp, userAgent } = event.userData;

  const userDataPayload: Record<string, unknown> = {};
  if (email) userDataPayload.em = [await sha256(normalizeEmail(email))];
  if (phone) userDataPayload.ph = [await sha256(normalizePhone(phone))];
  if (fbc) userDataPayload.fbc = fbc;
  if (fbp) userDataPayload.fbp = fbp;
  if (clientIp) userDataPayload.client_ip_address = clientIp;
  if (userAgent) userDataPayload.client_user_agent = userAgent;

  const eventPayload: Record<string, unknown> = {
    data: [
      {
        event_name: event.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: 'website',
        event_source_url: event.eventSourceUrl,
        user_data: userDataPayload,
        ...(event.customData ? { custom_data: event.customData } : {}),
      },
    ],
  };
  if (event.testEventCode) {
    eventPayload.test_event_code = event.testEventCode;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
      },
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, error: `Meta API ${response.status}`, response: result };
    }

    return { success: true, response: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
};
