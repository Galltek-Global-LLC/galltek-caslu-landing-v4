import { sendLeadToMetaCapi } from './_lib/meta-capi';
import { normalizeName, normalizeEmail } from './_lib/normalizers';

interface Env {
  APPS_SCRIPT_URL?: string;
  META_PIXEL_ID?: string;
  META_ACCESS_TOKEN?: string;
  CRM_WEBHOOK_URL?: string;
  SPARKLE_TRACKER_WEBHOOK_URL?: string;
  SPARKLE_OP_ID?: string;
}

const FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbyxQUW8uO_zLxphyCAwK7m4ew4aExanEKYU1ytqk5Ekah5i845b5KMRb6gEgKW9byXK/exec';
const DEFAULT_PIXEL_ID = '1336546998650554';
const DEFAULT_CRM_WEBHOOK_URL =
  'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/55f11fcd-d596-4b32-bfdb-689e74a6bd73/11660c92-59ad-4f48-be40-7c265d4031d5';

// Sparkle Tracker webhook: recebe evento de conversão (Lead) e vincula ao clique
// registrado na URL do Sparkle (op_id). Substitui o antigo Sparkle CRM.
const DEFAULT_SPARKLE_TRACKER_WEBHOOK_URL =
  'https://ap.sparkletracker.com/webhook/in/whk_1icRsHEjyJtfxY3wLTGHVtOicQaYdhzo_KjO0D_AOzC7lqX_';

// ID da operação Sparkle vinculada a este funil — a mesma referenciada no link
// de redirect (`re/op/6d045aeb-b631-49b6-a48f-2c987ff0e677`).
const DEFAULT_SPARKLE_OP_ID = 'op_4b360bc3ef';

// Valores fixos do evento Lead pro Sparkle Tracker. `value=1` porque alguns
// setups exigem > 0; se quiser LTV real, sobrescrever no futuro.
const LEAD_EVENT_NAME = 'Lead';
const LEAD_VALUE = 1;
const LEAD_CURRENCY = 'BRL';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const targetUrl = env.APPS_SCRIPT_URL || FALLBACK_URL;
  const pixelId = env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const accessToken = env.META_ACCESS_TOKEN;
  const dataCrazyWebhookUrl = env.CRM_WEBHOOK_URL || DEFAULT_CRM_WEBHOOK_URL;
  const sparkleTrackerWebhookUrl = env.SPARKLE_TRACKER_WEBHOOK_URL || DEFAULT_SPARKLE_TRACKER_WEBHOOK_URL;
  const sparkleOpId = env.SPARKLE_OP_ID || DEFAULT_SPARKLE_OP_ID;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Body inválido (JSON esperado)' }, { status: 400 });
  }

  // Apps Script V2 lê body como JSON (JSON.parse no postData.contents).
  // Mapeia "whatsapp" → "telefone" (campo esperado pelo script V2).
  const {
    whatsapp,
    eventID,
    fbc,
    fbp,
    source_url,
    test_event_code,
    event_name,
    fbclid,
    gclid,
    wbraid,
    gbraid,
    ttclid,
    ...rest
  } = payload as Record<string, unknown>;

  // Normaliza nome (Title Case brasileiro) e email (lowercase). Aplicado
  // uma vez aqui — Sheets, CRM e Meta CAPI recebem os dados consistentes.
  if (rest.nome !== undefined) rest.nome = normalizeName(rest.nome);
  if (rest.email !== undefined) rest.email = normalizeEmail(rest.email);

  // Payload pra Apps Script (Sheets) — inclui click IDs também pra
  // rastreamento por planilha.
  const upstreamPayload = {
    ...rest,
    ...(whatsapp !== undefined ? { telefone: whatsapp } : {}),
    ...(fbclid ? { fbclid } : {}),
    ...(gclid ? { gclid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(ttclid ? { ttclid } : {}),
  };

  // 1. Envia para o Apps Script (grava na planilha)
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(upstreamPayload),
      redirect: 'manual',
    });
  } catch (err) {
    return Response.json(
      { success: false, error: `Falha ao chamar Apps Script: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  const isRedirect = upstream.status >= 300 && upstream.status < 400;
  if (!upstream.ok && !isRedirect) {
    const text = await upstream.text();
    return Response.json(
      { success: false, error: `Apps Script retornou ${upstream.status}`, upstreamBody: text.slice(0, 200) },
      { status: 502 },
    );
  }

  // 2. Envia para Meta Conversions API (se token configurado)
  // Acontece em paralelo, mas não bloqueia o sucesso do submit caso falhe.
  let capiResult: { success: boolean; error?: string } | undefined;
  if (accessToken && eventID) {
    capiResult = await sendLeadToMetaCapi(pixelId, accessToken, {
      eventName: event_name ? String(event_name) : 'Lead',
      eventId: String(eventID),
      eventSourceUrl: source_url ? String(source_url) : undefined,
      userData: {
        email: rest.email ? String(rest.email) : undefined,
        phone: whatsapp ? String(whatsapp) : undefined,
        fbc: fbc ? String(fbc) : undefined,
        fbp: fbp ? String(fbp) : undefined,
        clientIp: request.headers.get('cf-connecting-ip') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      },
      customData: {
        content_name: rest.campaign,
        content_category: rest.source,
      },
      testEventCode: test_event_code ? String(test_event_code) : undefined,
    });

    if (!capiResult.success) {
      console.warn('[CAPI] Falha ao enviar evento Lead:', capiResult.error);
    }
  }

  // 3. Envia para os CRMs / rastreadores via webhook (fire-and-forget —
  // não bloqueia o submit). Cada um tem seu próprio payload:
  //
  //   - DataCrazy CRM: schema em português, formato herdado
  //   - Sparkle Tracker: schema em inglês snake_case (contrato deles),
  //     com op_id que vincula ao clique registrado no Sparkle
  //
  // Substitui o antigo Sparkle CRM (sparklechrm.com) — que ficou obsoleto.

  const datacrazyPayload = {
    nome: rest.nome,
    email: rest.email,
    telefone: whatsapp,
    source: rest.source,
    campaign: rest.campaign,
    utm_source: rest.utm_source,
    utm_medium: rest.utm_medium,
    utm_campaign: rest.utm_campaign,
    utm_content: rest.utm_content,
    utm_term: rest.utm_term,
    fbc,
    fbp,
    source_url,
    timestamp: new Date().toISOString(),
  };

  // Sparkle Tracker: contrato snake_case + op_id + click IDs.
  // Só inclui campos que têm valor (evita mandar `"fbclid": null`).
  const sparkleTrackerPayload: Record<string, unknown> = {
    event_name: LEAD_EVENT_NAME,
    event_id: eventID,
    value: LEAD_VALUE,
    currency: LEAD_CURRENCY,
    op_id: sparkleOpId,
    name: rest.nome,
    email: rest.email,
    phone: whatsapp,
    utm_source: rest.utm_source,
    utm_medium: rest.utm_medium,
    utm_campaign: rest.utm_campaign,
    utm_content: rest.utm_content,
    utm_term: rest.utm_term,
    fbc,
    fbp,
    fbclid,
    gclid,
    wbraid,
    gbraid,
    ttclid,
  };
  // Remove undefined/null/'' pra não poluir o payload.
  for (const key of Object.keys(sparkleTrackerPayload)) {
    const v = sparkleTrackerPayload[key];
    if (v === undefined || v === null || v === '') delete sparkleTrackerPayload[key];
  }

  const postToWebhook = async (
    label: string,
    url: string | undefined,
    body: Record<string, unknown>,
  ): Promise<{ sent: boolean; status?: number; error?: string }> => {
    if (!url) return { sent: false, error: 'url-not-configured' };
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        console.warn(`[${label}] Webhook retornou status`, resp.status);
      }
      return { sent: resp.ok, status: resp.status };
    } catch (err) {
      const error = (err as Error).message;
      console.warn(`[${label}] Falha ao enviar para webhook:`, error);
      return { sent: false, error };
    }
  };

  const [dataCrazyResult, sparkleTrackerResult] = await Promise.all([
    postToWebhook('DataCrazy', dataCrazyWebhookUrl, datacrazyPayload),
    postToWebhook('SparkleTracker', sparkleTrackerWebhookUrl, sparkleTrackerPayload),
  ]);

  return Response.json({
    success: true,
    capi: capiResult ? { sent: capiResult.success } : { sent: false, reason: 'token-not-configured' },
    crm: {
      datacrazy: { sent: dataCrazyResult.sent, status: dataCrazyResult.status },
      sparkle_tracker: { sent: sparkleTrackerResult.sent, status: sparkleTrackerResult.status },
    },
  }, { status: 200 });
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
