const UNDOABLE = new Set(['pausar_no_cardapio', 'ocultar_no_pdv']);
const STATUS_LABEL = { executed: 'Feita', pending: 'Aguardando confirmação', cancelled: 'Cancelada', expired: 'Expirada', failed: 'Falhou' };

// Ação que falhou não mudou nada no banco, então não há o que desfazer.
export function canUndo(action) {
  return !!action && UNDOABLE.has(action.tool_name) && action.status === 'executed' && !!action.before_state;
}

export function describeStatus(status) {
  return STATUS_LABEL[status] || status || '';
}

export function describeUndo(action) {
  const nome = action?.arguments?.nome_produto || 'O produto';
  const before = action?.before_state || {};
  if (action?.tool_name === 'pausar_no_cardapio') {
    return before.pausado_manualmente === true
      ? `${nome} volta a ficar pausado no cardápio digital.`
      : `${nome} volta a aparecer no cardápio digital.`;
  }
  if (action?.tool_name === 'ocultar_no_pdv') {
    return before.ocultar_no_pdv === true
      ? `${nome} volta a ficar escondido na frente de caixa.`
      : `${nome} volta a aparecer na frente de caixa.`;
  }
  return 'A ação anterior volta ao estado de antes.';
}
