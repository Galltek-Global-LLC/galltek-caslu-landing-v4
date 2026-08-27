// Normalizadores usados antes de gravar leads em Sheets/CRM.
// Objetivo: entregar dados consistentes para o time de vendas.

// Conectivos comuns em nomes brasileiros/portugueses — ficam em minúscula
// quando não estão no início do nome.
const LOWERCASE_CONNECTORS = new Set([
  'da',
  'das',
  'de',
  'del',
  'della',
  'di',
  'do',
  'dos',
  'du',
  'e',
  'la',
  'las',
  'le',
  'les',
  'lo',
  'los',
  'van',
  'von',
  'y',
]);

// Capitaliza uma "palavra" respeitando hifens e apóstrofos internos.
// Ex.: "d'angelo"  → "D'Angelo"
//      "jean-luc"  → "Jean-Luc"
//      "MARIA"     → "Maria"
const capitalizeWord = (word: string): string => {
  if (!word) return word;
  return word
    .split(/([-'])/g)
    .map((part, index) => {
      // Índices ímpares são os separadores (- ou '), preservados.
      if (index % 2 === 1) return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
};

// Converte nomes para o padrão típico brasileiro (Title Case com conectivos
// em minúscula). Trim, colapsa múltiplos espaços, lida com acentos.
// Retorna '' se input inválido/vazio.
export const normalizeName = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word, index) => {
      // Primeira palavra sempre capitaliza (mesmo se for conector).
      if (index > 0 && LOWERCASE_CONNECTORS.has(word)) return word;
      return capitalizeWord(word);
    })
    .join(' ');
};

// Email: trim + lowercase. Evita duplicatas por diferença de caixa.
// Retorna '' se input inválido/vazio.
export const normalizeEmail = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase();
};
