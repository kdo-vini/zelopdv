// Utility helpers for the Perfil page
import {
  isValidBrazilianTaxId,
  normalizeBrazilianPhone,
  normalizeBrazilianTaxId,
} from './masks.js';

// Canonicalize paper width: accept '58mm', '58 mm', '80mm', '80 mm'
const VALID_WIDTHS = ['58mm', '80mm'];

// Preset platforms with default tax rates (%)
export const PLATAFORMAS_PRESET = [
  { id: 'ifood',   nome: 'iFood',   taxa_pct: 28, icone: '🟠' },
  { id: 'rappi',   nome: 'Rappi',   taxa_pct: 25, icone: '🟣' },
  { id: '99food',  nome: '99Food',  taxa_pct: 20, icone: '🔴' },
  { id: 'aiqfome', nome: 'Aiqfome', taxa_pct: 18, icone: '🟡' },
  { id: 'keeta',   nome: 'Keeta',   taxa_pct: 25, icone: '🔵' },
];

export function normalizeLarguraBobina(value) {
  const v = (value ?? '').toString().trim().replace(/\s+/g, '').toLowerCase();
  if (v === '58mm' || v === '58') return '58mm';
  if (v === '80mm' || v === '80') return '80mm';
  // 'pdf' was removed as a valid option — fall through to unknown
  return v; // unknown stays as-is
}

export function requiredOk({ nome_exibicao, documento, contato, largura_bobina }) {
  const nome = (nome_exibicao || '').trim();
  const doc = isValidBrazilianTaxId(documento);
  const cont = (contato || '').trim();
  const largura = normalizeLarguraBobina(largura_bobina);
  return Boolean(nome && doc && cont && VALID_WIDTHS.includes(largura));
}

export function buildPayload({
  userId,
  nome_exibicao,
  razao_social,
  documento,
  contato,
  inscricao_estadual,
  endereco,
  rodape_recibo,
  largura_bobina,
  logo_url,
  pendingLogoUrl,
  plataformas_pagamento
}) {
  const largura = normalizeLarguraBobina(largura_bobina);
  return {
    user_id: userId,
    nome_exibicao: (nome_exibicao || '').trim(),
    razao_social: (razao_social || '').trim() || null,
    documento: normalizeBrazilianTaxId(documento) || (documento || '').trim(),
    contato: normalizeBrazilianPhone(contato) || (contato || '').trim(),
    inscricao_estadual: (inscricao_estadual || '').trim() || null,
    endereco: (endereco || '').trim() || null,
    rodape_recibo: (rodape_recibo || 'Obrigado pela preferência!').trim() || 'Obrigado pela preferência!',
    largura_bobina: VALID_WIDTHS.includes(largura) ? largura : '80mm',
    logo_url: pendingLogoUrl || logo_url || null,
    plataformas_pagamento: plataformas_pagamento ?? [],
    updated_at: new Date().toISOString()
  };
}

// Basic client-side image validation
export function isValidImage(file, { maxBytes = 1.5 * 1024 * 1024 } = {}) {
  if (!file) return false;
  const typeOk = typeof file.type === 'string' ? file.type.startsWith('image/') : true;
  const sizeOk = typeof file.size === 'number' ? file.size <= maxBytes : true;
  return Boolean(typeOk && sizeOk);
}
