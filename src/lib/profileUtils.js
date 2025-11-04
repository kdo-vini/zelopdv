// Utility helpers for the Perfil page

export function requiredOk({ nome_exibicao, documento, contato, largura_bobina }) {
  const nome = (nome_exibicao || '').trim();
  const doc = (documento || '').trim();
  const cont = (contato || '').trim();
  const largura = largura_bobina || '';
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
    largura_bobina,
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
