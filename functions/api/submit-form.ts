import { sendLeadToMetaCapi } from './_lib/meta-capi';
import { normalizeName, normalizeEmail } from './_lib/normalizers';

interface Env {
  APPS_SCRIPT_URL?: string;
  META_PIXEL_ID?: string;
  META_ACCESS_TOKEN?: string;
  CRM_WEBHOOK_URL?: string;
  SPARKLE_CRM_WEBHOOK_URL?: string;
}

const FALLBACK_URL = 'https://script.google.com/macros/s/AKfycbyxQUW8uO_zLxphyCAwK7m4ew4aExanEKYU1ytqk5Ekah5i845b5KMRb6gEgKW9byXK/exec';
const DEFAULT_PIXEL_ID = '1336546998650554';
const DEFAULT_CRM_WEBHOOK_URL =
  'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/55f11fcd-d596-4b32-bfdb-689e74a6bd73/11660c92-59ad-4f48-be40-7c265d4031d5';
const DEFAULT_SPARKLE_CRM_WEBHOOK_URL =
  'https://api.sparklechrm.com/api/webhooks/3d95f299-f731-4f0d-8f43-46a27cc49089/caslu-lead-se-cadastrou-na-landing-page?token=-hsC6h00ezB8uhPBXo2J9Q8mrHck81cm6phdG1U7XvM';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const targetUrl = env.APPS_SCRIPT_URL || FALLBACK_URL;
  const pixelId = env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
  const accessToken = env.META_ACCESS_TOKEN;
  const dataCrazyWebhookUrl = env.CRM_WEBHOOK_URL || DEFAULT_CRM_WEBHOOK_URL;
  const sparkleCrmWebhookUrl = env.SPARKLE_CRM_WEBHOOK_URL || DEFAULT_SPARKLE_CRM_WEBHOOK_URL;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Body inválido (JSON esperado)' }, { status: 400 });
  }

  // Apps Script V2 lê body como JSON (JSON.parse no postData.contents).
  // Mapeia "whatsapp" → "telefone" (campo esperado pelo script V2).
  const { whatsapp, eventID, fbc, fbp, source_url, test_event_code, event_name, ...rest } = payload as Record<string, unknown>;

  // Normaliza nome (Title Case brasileiro) e email (lowercase). Aplicado
  // uma vez aqui — Sheets, CRM e Meta CAPI recebem os dados consistentes.
  if (rest.nome !== undefined) rest.nome = normalizeName(rest.nome);
  if (rest.email !== undefined) rest.email = normalizeEmail(rest.email);

  const upstreamPayload = whatsapp !== undefined
    ? { ...rest, telefone: whatsapp }
    : rest;

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

  // 3. Envia para os CRMs via webhook (fire-and-forget — não bloqueia o submit).
  // Dispara DataCrazy e Sparkle CRM em paralelo. Depois que a migração para
  // o Sparkle CRM estiver estável, remover o webhook do DataCrazy.
  const crmPayload = {
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

  const postToWebhook = async (
    label: string,
    url: string | undefined,
  ): Promise<{ sent: boolean; status?: number; error?: string }> => {
    if (!url) return { sent: false, error: 'url-not-configured' };
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crmPayload),
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

  const [dataCrazyResult, sparkleCrmResult] = await Promise.all([
    postToWebhook('DataCrazy', dataCrazyWebhookUrl),
    postToWebhook('SparkleCRM', sparkleCrmWebhookUrl),
  ]);

  return Response.json({
    success: true,
    capi: capiResult ? { sent: capiResult.success } : { sent: false, reason: 'token-not-configured' },
    crm: {
      datacrazy: { sent: dataCrazyResult.sent, status: dataCrazyResult.status },
      sparkle: { sent: sparkleCrmResult.sent, status: sparkleCrmResult.status },
    },
  }, { status: 200 });
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
