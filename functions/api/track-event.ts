import { sendLeadToMetaCapi } from './_lib/meta-capi';

interface Env {
  META_PIXEL_ID?: string;
  META_ACCESS_TOKEN?: string;
}

const DEFAULT_PIXEL_ID = '1336546998650554';

// Endpoint genérico pra enviar qualquer evento Meta via CAPI (server-side).
// O frontend dispara Pixel client-side com mesmo eventID → Meta deduplica.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const pixelId = env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const accessToken = env.META_ACCESS_TOKEN;

  if (!accessToken) {
    return Response.json(
      { success: false, reason: 'token-not-configured' },
      { status: 200 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Body inválido (JSON esperado)' }, { status: 400 });
  }

  const {
    event_name,
    eventID,
    fbc,
    fbp,
    source_url,
    email,
    phone,
    test_event_code,
    custom_data,
  } = payload as Record<string, unknown>;

  if (!event_name || !eventID) {
    return Response.json(
      { success: false, error: 'event_name e eventID são obrigatórios' },
      { status: 400 },
    );
  }

  const result = await sendLeadToMetaCapi(pixelId, accessToken, {
    eventName: String(event_name),
    eventId: String(eventID),
    eventSourceUrl: source_url ? String(source_url) : undefined,
    userData: {
      email: email ? String(email) : undefined,
      phone: phone ? String(phone) : undefined,
      fbc: fbc ? String(fbc) : undefined,
      fbp: fbp ? String(fbp) : undefined,
      clientIp: request.headers.get('cf-connecting-ip') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    },
    customData: (custom_data as Record<string, unknown>) || undefined,
    testEventCode: test_event_code ? String(test_event_code) : undefined,
  });

  return Response.json(
    { success: result.success, ...(result.error ? { error: result.error } : {}) },
    { status: result.success ? 200 : 502 },
  );
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
