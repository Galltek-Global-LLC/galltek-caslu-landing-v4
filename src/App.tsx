import { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { captureUTMs, getUTMs } from './lib/utm-tracker';
import { submitToGoogleAppsScript } from './lib/google-apps-script';
import { generateTransactionId } from './lib/data-hasher';
import { trackMetaEvent, buildTrackedRedirectUrl } from './lib/meta-tracking';
import {
  trackFormStart,
  trackFieldCompleted,
  trackFormSuccess,
  trackFormError,
  setupFormAbandonmentTracking,
  setupPageEngagementTracking,
} from './lib/analytics';

const META_PIXEL_ID = '1336546998650554';
const FORM_NAME = 'trinity-captura-v4';

interface AppProps {
  redirectUrl: string;
}

// Rotativa de vagas + nomes usada como social proof (mesmo padrão do HTML original).
const FAKE_NAMES = [
  'Marcos V.', 'Ana P.', 'Rafael S.', 'Juliana M.', 'Pedro H.', 'Camila R.',
  'Lucas T.', 'Beatriz F.', 'Thiago A.', 'Larissa N.', 'Diego C.', 'Fernanda O.',
  'Gustavo L.', 'Patrícia S.',
];
const START_VAGAS = 17;
const MIN_VAGAS = 3;
const ROTATION_MS = 40_000;

function App({ redirectUrl }: AppProps) {
  const REDIRECT_URL = redirectUrl;

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const isSubmittingRef = useRef(false);

  // Social proof rotativa
  const [rotationStep, setRotationStep] = useState(0);
  const vagasSteps = Array.from({ length: START_VAGAS - MIN_VAGAS + 1 }, (_, i) => {
    const vagas = START_VAGAS - i;
    const bar = 30 + ((START_VAGAS - vagas) / (START_VAGAS - MIN_VAGAS)) * 65;
    return { vagas, bar };
  });
  const currentStep = vagasSteps[rotationStep % vagasSteps.length];
  const currentName = FAKE_NAMES[rotationStep % FAKE_NAMES.length];

  useEffect(() => {
    captureUTMs();
  }, []);

  // PageView com eventID (Pixel client + CAPI server, deduplicado).
  useEffect(() => {
    trackMetaEvent({
      eventName: 'PageView',
      customData: { content_name: FORM_NAME },
    });
  }, []);

  useEffect(() => {
    const cleanup = setupPageEngagementTracking('landing-v4', 10);
    return cleanup;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setRotationStep((s) => s + 1), ROTATION_MS);
    return () => clearInterval(interval);
  }, []);

  const getFilledFields = useCallback(() => {
    const fields: string[] = [];
    if (name) fields.push('nome');
    if (email) fields.push('email');
    if (phone) fields.push('phone');
    return fields;
  }, [name, email, phone]);

  useEffect(() => {
    const cleanup = setupFormAbandonmentTracking(FORM_NAME, getFilledFields);
    return cleanup;
  }, [getFilledFields]);

  const markFormStarted = () => {
    if (!formStarted) {
      setFormStarted(true);
      trackFormStart(FORM_NAME);
    }
  };

  const openModal = () => {
    if (submitted) {
      setSubmitted(false);
      setName('');
      setEmail('');
      setPhone('');
    }
    setError('');
    setShowModal(true);
    // InitiateCheckout deduplicado (Pixel + CAPI mesmo eventID).
    trackMetaEvent({
      eventName: 'InitiateCheckout',
      customData: {
        content_name: FORM_NAME,
        content_category: 'whatsapp',
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;

    if (!phone || !isValidPhoneNumber(phone)) {
      setPhoneError('Número de WhatsApp inválido');
      return;
    }

    isSubmittingRef.current = true;
    setError('');
    setPhoneError('');
    setLoading(true);

    const transactionId = generateTransactionId();
    const utms = getUTMs();

    try {
      const success = await submitToGoogleAppsScript(
        {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          source: 'whatsapp',
        },
        utms,
        transactionId,
      );

      if (!success) throw new Error('Falha no envio');

      trackFormSuccess(FORM_NAME, transactionId, utms, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });

      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', {
          content_name: FORM_NAME,
          content_category: 'whatsapp',
          eventID: transactionId,
        });
      }

      setSubmitted(true);
      setLoading(false);
      isSubmittingRef.current = false;

      setTimeout(() => {
        window.location.href = buildTrackedRedirectUrl(REDIRECT_URL);
      }, 1500);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      trackFormError(FORM_NAME, errorMsg);
      setError('Ocorreu um erro. Tente novamente.');
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0D] text-[#F5F1E8]" style={{ fontFamily: 'Archivo, sans-serif' }}>

      {/* HERO */}
      <section className="max-w-[680px] mx-auto px-6 pt-16 pb-10 text-center">

        {/* Badge topo */}
        <div className="flex justify-center w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#F0B441]/40 px-[18px] py-2 text-[#F0B441] font-bold tracking-[1px] whitespace-nowrap"
               style={{ fontSize: 'clamp(10px, 3.2vw, 13px)' }}>
            <span className="w-[7px] h-[7px] rounded-full bg-[#F0B441] flex-shrink-0" />
            OPERAÇÕES AO VIVO • ACESSO GRATUITO
          </div>
        </div>

        {/* Imagem central (traders) */}
        <div className="relative max-w-[480px] mx-auto mt-10 overflow-visible">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
               style={{
                 width: '120%', height: '120%', filter: 'blur(30px)',
                 background: 'radial-gradient(circle, rgba(240,180,65,0.18) 0%, rgba(240,180,65,0.06) 45%, rgba(240,180,65,0) 75%)',
                 zIndex: 0,
               }} />
          <img src="/trinityy.png" alt="Traders Trinity" className="relative z-10 w-full block" />
        </div>

        {/* Headline */}
        <h1 className="relative font-black -mt-7 whitespace-nowrap"
            style={{ fontSize: 'clamp(32px, 8.5vw, 50px)', lineHeight: 1.08, letterSpacing: '-0.5px' }}>
          <span className="bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(#FFE9B0, #F0B441 55%, #D18A1F)' }}>
            COMECE A LUCRAR
          </span>
          <br />
          <span className="text-white">AGORA MESMO.</span>
        </h1>

        <p className="max-w-[520px] mx-auto mt-5 text-[#CFC9BC] leading-[1.5]"
           style={{ fontSize: 'clamp(15px, 4vw, 18px)' }}>
          Entre no grupo gratuito e tenha acesso aos{' '}
          <strong className="text-[#F5F1E8]">três melhores traders de opções binárias.</strong>
        </p>

        {/* Vagas rotativas */}
        <div className="flex items-center justify-center gap-3 mt-7 flex-col sm:flex-row"
             style={{ gap: '12px' }}>
          <div className="flex">
            {['A', 'M', 'R'].map((letter, i) => (
              <span key={i}
                    className={`w-7 h-7 rounded-full border-2 border-[#0A0A0D] flex items-center justify-center text-[#CFC9BC] text-xs font-extrabold ${i > 0 ? '-ml-2' : ''}`}
                    style={{
                      background: i === 0
                        ? 'linear-gradient(135deg,#3A3A42,#1C1C22)'
                        : i === 1
                          ? 'linear-gradient(135deg,#4A4438,#232019)'
                          : 'linear-gradient(135deg,#39424A,#191F24)',
                    }}>
                {letter}
              </span>
            ))}
            <span className="w-7 h-7 -ml-2 rounded-full border-2 border-[#0A0A0D] bg-[#F0B441] flex items-center justify-center text-[#1A1104] text-xs font-extrabold">
              +
            </span>
          </div>
          <span className="text-sm font-extrabold tracking-[0.3px]">
            APENAS <span className="text-[#2ECC71]">{currentStep.vagas} VAGAS</span> RESTANTES
          </span>
        </div>

        <div className="flex items-center justify-center gap-2 mt-3.5 text-sm text-[#9C9689]">
          <span className="w-[7px] h-[7px] rounded-full bg-[#2ECC71]" />
          <span>{currentName}</span> acabou de entrar
        </div>

        <div className="max-w-[340px] mx-auto mt-3 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full bg-[#2ECC71] rounded-full transition-all duration-[1200ms] ease-out"
               style={{ width: `${currentStep.bar}%` }} />
        </div>

        <div className="flex items-center justify-center flex-wrap gap-2 mt-4.5 font-bold tracking-[0.6px] text-[#9C9689]"
             style={{ fontSize: 'clamp(9px, 2.6vw, 12px)', marginTop: '18px' }}>
          <span>ACESSO IMEDIATO</span><span>•</span><span>GRUPO EXCLUSIVO</span><span>•</span><span>VAGAS LIMITADAS</span>
        </div>

        {/* CTA primário */}
        <button
          onClick={openModal}
          className="cta-sheen relative inline-block overflow-hidden mt-7 py-[21px] px-[46px] rounded-full text-[#1A1104] font-black no-underline"
          style={{
            background: 'linear-gradient(#FFCE6B,#F0A72C)',
            fontSize: '17px',
            boxShadow: '0 10px 38px rgba(240,167,44,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        >
          <span className="relative z-10">🔥 QUERO ENTRAR NO GRUPO GRATUITO</span>
        </button>

        <p className="mt-4.5 text-sm text-[#8C867A]" style={{ marginTop: '18px' }}>
          Lives e operações ao vivo durante a semana.
        </p>
      </section>

      {/* PROVAS SOCIAIS (feedbacks) */}
      <section className="max-w-[680px] mx-auto px-6 py-10 text-center">
        <div className="flex justify-center w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2ECC71]/45 px-4 py-[7px] text-[#F5F1E8] whitespace-nowrap"
               style={{ fontSize: 'clamp(11px, 3.4vw, 14px)' }}>
            <span className="text-[#2ECC71]">✓</span> FEEDBACKS E RESULTADOS REAIS DAS LIVES
          </div>
        </div>

        <div className="mt-6 rounded-xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          <img src="/trinity-img-2.jpg" alt="Live com os traders e chat de resultados" className="w-full block" />
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <img src="/trinity-img-0.jpg" alt="Feedback dos alunos" className="w-full block rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
          <img src="/trinity-img-1.jpg" alt="Feedback dos alunos" className="w-full block rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.5)]" />
        </div>
      </section>

      {/* CTA FINAL — "Pare de operar sozinho" */}
      <section className="py-20 px-6 text-center" style={{ background: 'linear-gradient(#0C0C10,#0A0A0D)' }}>
        <div className="max-w-[620px] mx-auto">
          <h2 className="font-black m-0" style={{ fontSize: 'clamp(28px, 7.5vw, 40px)', lineHeight: 1.15 }}>
            <span className="whitespace-nowrap bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(#FFE9B0, #F0B441 55%, #D18A1F)' }}>
              PARE DE OPERAR
            </span>
            <br />
            <span className="whitespace-nowrap text-white">SOZINHO.</span>
          </h2>

          <p className="mt-5 text-lg leading-[1.6] text-[#CFC9BC]">
            Entre gratuitamente para o grupo da <strong className="text-[#F5F1E8]">Trinity</strong> e acompanhe{' '}
            <strong className="text-[#F5F1E8]">3 traders operando ao vivo</strong>, compartilhando suas análises,
            oportunidade e operações.
          </p>

          <div className="mt-9 rounded-2xl px-7 py-7 text-center"
               style={{
                 background: 'rgba(240,180,65,0.06)',
                 border: '1px solid rgba(240,180,65,0.3)',
               }}>
            <div className="text-[13px] font-extrabold tracking-[1px] text-[#F0B441]">TODA QUINTA-FEIRA</div>
            <div className="text-2xl font-black text-white mt-2">Quinta Intensiva</div>
            <div className="text-base text-[#CFC9BC] mt-2">
              Os <strong className="text-[#F5F1E8]">3 traders juntos</strong>, operando na mesma live.
            </div>
          </div>

          <button
            onClick={openModal}
            className="cta-sheen relative inline-block overflow-hidden mt-8 py-5 px-[42px] rounded-full text-[#1A1104] font-black no-underline"
            style={{
              background: 'linear-gradient(#FFCE6B,#F0A72C)',
              fontSize: '16px',
              boxShadow: '0 10px 38px rgba(240,167,44,0.3), inset 0 1px 0 rgba(255,255,255,0.5)',
            }}
          >
            <span className="relative z-10">ENTRAR NO GRUPO GRATUITO →</span>
          </button>

          <p className="mt-6 text-[13px] text-[#6E685D]">
            Mercado financeiro envolve riscos. Resultados passados não garantem resultados futuros.
          </p>
        </div>
      </section>

      {/* MODAL FORMULÁRIO */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"
               onClick={() => !loading && setShowModal(false)} />
          <div className="relative w-full max-w-md bg-[#12120F] border border-[#F0B441]/25 rounded-3xl p-7 sm:p-9 animate-modal shadow-[0_0_60px_-10px_rgba(240,180,65,0.35)]">
            <button onClick={() => !loading && setShowModal(false)}
                    className="absolute top-4 right-4 p-1.5 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>

            {submitted ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30 flex items-center justify-center mx-auto mb-5">
                  <span className="text-emerald-400 text-2xl">✓</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight mb-2">
                  <span className="bg-clip-text text-transparent"
                        style={{ backgroundImage: 'linear-gradient(#FFE9B0, #F0B441 55%, #D18A1F)' }}>
                    Inscrição confirmada!
                  </span>
                </h3>
                <p className="text-[#CFC9BC] text-sm leading-relaxed mb-6">
                  Falta só <span className="text-white font-semibold">um passo</span>: entre agora no grupo da Trinity.
                </p>
                <a href={buildTrackedRedirectUrl(REDIRECT_URL)}
                   target="_blank" rel="noopener noreferrer"
                   className="cta-sheen relative inline-block overflow-hidden w-full py-3 px-5 rounded-full text-[#1A1104] font-black no-underline"
                   style={{ background: 'linear-gradient(#FFCE6B,#F0A72C)', fontSize: '15px' }}>
                  <span className="relative z-10">ENTRAR NO GRUPO GRATUITO →</span>
                </a>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <h2 className="text-xl sm:text-2xl font-extrabold mb-2 tracking-tight">
                    <span className="bg-clip-text text-transparent"
                          style={{ backgroundImage: 'linear-gradient(#FFE9B0, #F0B441 55%, #D18A1F)' }}>
                      Garanta
                    </span>{' '}sua vaga gratuita
                  </h2>
                  <p className="text-[#8C867A] text-sm">Preencha abaixo para receber o link do grupo.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-[#CFC9BC] mb-1.5">Nome</label>
                    <input id="name" type="text" required value={name}
                           onChange={(e) => { setName(e.target.value); markFormStarted(); }}
                           onBlur={(e) => { if (e.target.value) trackFieldCompleted('nome', FORM_NAME); }}
                           placeholder="Seu nome completo"
                           className="w-full px-4 py-3.5 bg-[#0e0d0a] border border-[#3a3730] rounded-xl text-white placeholder-[#6E685D] focus:outline-none focus:ring-2 focus:ring-[#F0B441]/40 focus:border-[#F0B441] transition-all" />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#CFC9BC] mb-1.5">Email</label>
                    <input id="email" type="email" required value={email}
                           onChange={(e) => { setEmail(e.target.value); markFormStarted(); }}
                           onBlur={(e) => { if (e.target.value) trackFieldCompleted('email', FORM_NAME); }}
                           placeholder="seu@email.com"
                           className="w-full px-4 py-3.5 bg-[#0e0d0a] border border-[#3a3730] rounded-xl text-white placeholder-[#6E685D] focus:outline-none focus:ring-2 focus:ring-[#F0B441]/40 focus:border-[#F0B441] transition-all" />
                  </div>

                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-[#CFC9BC] mb-1.5">WhatsApp</label>
                    <PhoneInput
                      defaultCountry="BR"
                      value={phone}
                      onChange={(value) => {
                        setPhone(value || '');
                        setPhoneError('');
                        markFormStarted();
                      }}
                      onBlur={() => {
                        if (phone && phone.length > 8) {
                          trackFieldCompleted('phone', FORM_NAME);
                          if (!isValidPhoneNumber(phone)) {
                            setPhoneError('Número de WhatsApp inválido');
                          }
                        }
                      }}
                      disabled={loading}
                      className={`phone-input-caslu-v2 ${phoneError ? 'phone-input-error' : ''}`}
                      placeholder="(11) 99999-9999"
                      id="phone"
                      name="phone"
                      inputProps={{ id: 'phone', name: 'phone', required: true }}
                    />
                    {phoneError && <p className="text-red-400 text-xs mt-1.5">{phoneError}</p>}
                  </div>

                  {error && <p className="text-red-400 text-sm text-center">{error}</p>}

                  <button type="submit" disabled={loading}
                          className="cta-sheen relative w-full overflow-hidden py-4 px-5 rounded-full text-[#1A1104] font-black disabled:opacity-60 disabled:cursor-not-allowed"
                          style={{ background: 'linear-gradient(#FFCE6B,#F0A72C)', fontSize: '15px', boxShadow: '0 10px 38px rgba(240,167,44,0.3)' }}>
                    <span className="relative z-10">
                      {loading ? 'ENVIANDO...' : '🔥 QUERO ENTRAR NO GRUPO'}
                    </span>
                  </button>

                  <p className="text-[#6E685D] text-xs text-center">
                    Seus dados estão seguros. Não enviamos spam.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// META_PIXEL_ID reservado (usado no evento Lead como referência de deduplicação).
export { META_PIXEL_ID };
export default App;
