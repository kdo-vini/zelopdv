const UNDOABLE = new Set(['pausar_no_cardapio', 'ocultar_no_pdv']);
const STATUS_LABEL = { executed: 'Feita', pending: 'Aguardando confirmação', cancelled: 'Cancelada', expired: 'Expirada', failed: 'Falhou' };

export function canUndo(action) {
  return !!action && UNDOABLE.has(action.tool_name) && action.status === 'executed' && !!action.before_state;
}

export function describeStatus(status) {
  return STATUS_LABEL[status] || status || '';
}
