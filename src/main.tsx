import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.tsx';
import GrupoRoute from './routes/GrupoRoute';
import './index.css';

// TEMPORÁRIO: WA_URL (+55 21 97353-3963 substituindo +55 11 96350-8768) está
// indisponível — todas as rotas caem no GrupoRoute (Sparkle com fallback safe).
// Quando algum número voltar, restaurar / para <App redirectUrl={WA_URL} />.
// O link do Sparkle e o fallback do grupo ficam encapsulados em GrupoRoute +
// functions/api/resolve-grupo-redirect.ts.
const WA_URL = 'https://wa.me/5521973533963?text=CASLU%2C%20QUERO%20ENTRAR';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Raiz vai pro grupo (TEMP — voltar pra WA_URL quando o número original normalizar).
            Usa GrupoRoute com health-check do Sparkle + fallback direto pro grupo. */}
        <Route path="/" element={<GrupoRoute />} />
        {/* /wa sempre PV do WhatsApp */}
        <Route path="/wa" element={<App redirectUrl={WA_URL} />} />
        {/* /grupo sempre link Sparkle pro grupo, com fallback resiliente
            caso o Sparkle esteja mal configurado (retornando homepage) */}
        <Route path="/grupo" element={<GrupoRoute />} />
        {/* Catch-all também usa GrupoRoute com fallback */}
        <Route path="*" element={<GrupoRoute />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
