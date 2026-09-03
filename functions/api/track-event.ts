// Endpoint DESATIVADO. O Sparkle Tracker agora é o responsável por repassar
// eventos pra Meta CAPI (via webhook em /webhook/in/whk_...), evitando
// disparo duplicado server-side.
//
// O Pixel client-side (index.html) segue disparando PageView/InitiateCheckout/Lead
// normalmente pelo browser — quem chama este endpoint no frontend
// (src/lib/meta-tracking.ts) apenas recebe um 200 vazio.
//
// Se o Sparkle deixar de repassar, restaurar chamando `sendLeadToMetaCapi`.

interface Env {
  META_PIXEL_ID?: string;
  META_ACCESS_TOKEN?: string;
}

export const onRequestPost: PagesFunction<Env> = async () => {
  return Response.json(
    { success: false, reason: 'capi-disabled-in-favor-of-sparkle-tracker' },
    { status: 200 },
  );
};

export const onRequest: PagesFunction = () =>
  new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
