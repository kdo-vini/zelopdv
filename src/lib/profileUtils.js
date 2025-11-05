// Utility helpers for the Perfil page

// Canonicalize paper width: accept '58mm', '58 mm', '80mm', '80 mm'
export function normalizeLarguraBobina(value) {
  const v = (value ?? '').toString().trim().replace(/\s+/g, '').toLowerCase();
  if (v === '58mm' || v === '58') return '58mm';
  if (v === '80mm' || v === '80') return '80mm';
  return v; // unknown stays as-is
}

export function requiredOk({ nome_exibicao, documento, contato, largura_bobina }) {
  const nome = (nome_exibicao || '').trim();
  const doc = (documento || '').trim();
  const cont = (contato || '').trim();
  const largura = normalizeLarguraBobina(largura_bobina);
  return Boolean(nome && doc && cont && (largura === '58mm' || largura === '80mm'));
}

export function buildPayload({
  userId,
  nome_exibicao,
  documento,
  contato,
  inscricao_estadual,
  endereco,
  rodape_recibo,
  largura_bobina,
  logo_url,
  pendingLogoUrl
}) {
  return {
    user_id: userId,
    nome_exibicao: (nome_exibicao || '').trim(),
    documento: (documento || '').trim(),
    contato: (contato || '').trim(),
    inscricao_estadual: (inscricao_estadual || '').trim() || null,
    endereco: (endereco || '').trim() || null,
    rodape_recibo: (rodape_recibo || 'Obrigado pela preferência!').trim() || 'Obrigado pela preferência!',
    largura_bobina: normalizeLarguraBobina(largura_bobina) === '58mm' || normalizeLarguraBobina(largura_bobina) === '80mm'
      ? normalizeLarguraBobina(largura_bobina)
      : '80mm',
    logo_url: pendingLogoUrl || logo_url || null,
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
