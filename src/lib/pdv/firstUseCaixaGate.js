// Arquivo: src/lib/pdv/firstUseCaixaGate.js
// Decisões puras da barreira de "conta nova sem caixa aberto" no PDV (/app).
//
// Contexto: contas recém-criadas caem em /app para a primeira venda. Antes,
// o /app abria o modal "Abrir Caixa" automaticamente ao carregar sempre que
// o caixa estava fechado, escondendo o estado vazio e criando uma barreira
// antes da pessoa entender o produto. Para "conta nova" (titular que nunca
// abriu um caixa), a barreira passa a aparecer só na hora de pagar.
//
// "Conta nova" é detectada no carregamento com uma consulta barata (count
// head) em `caixas` para o owner. Se a consulta falhar, o dispositivo
// estiver offline sem essa informação, ou o usuário for subusuário, o
// comportamento cai para o atual (hasEverOpenedCaixa = null ou true).

/**
 * Deriva se a sessão atual está no estado "conta nova sem caixa aberto".
 * Assim que um caixa é aberto (caixaAberto vira true), a função já retorna
 * false — não há flag persistida, o estado é sempre recalculado.
 *
 * @param {{
 *   hasEverOpenedCaixa: boolean | null, // false = detectado "nunca abriu"; true = já abriu alguma vez; null = desconhecido (falha, offline, ainda não checou)
 *   isSubUser: boolean,
 *   caixaAberto: boolean,
 * }} params
 * @returns {boolean}
 */
export function isFirstUseNoCaixa({ hasEverOpenedCaixa, isSubUser, caixaAberto }) {
  if (isSubUser) return false;
  // hasEverOpenedCaixa === true (já abriu antes) ou null (desconhecido/offline/erro)
  // preservam o comportamento atual.
  if (hasEverOpenedCaixa !== false) return false;
  return !caixaAberto;
}

/**
 * "Deve abrir o modal Abrir Caixa sozinho ao carregar/atualizar o snapshot?"
 * Para conta nova em primeiro uso, não — a barreira é adiada para o pagamento.
 * Para qualquer outra conta (já abriu caixa alguma vez, informação
 * desconhecida/offline, ou subusuário), comportamento atual: abre sempre que
 * não há caixa aberto.
 *
 * @param {{ caixaAberto: boolean, isFirstUseNoCaixa: boolean }} params
 * @returns {boolean}
 */
export function shouldAutoOpenCaixaModal({ caixaAberto, isFirstUseNoCaixa }) {
  if (isFirstUseNoCaixa) return false;
  return !caixaAberto;
}

/**
 * "Deve barrar o clique num produto (ou item avulso) por causa do caixa?"
 * Para conta nova em primeiro uso, não barra — o item entra na comanda
 * normalmente e a barreira aparece só na hora de pagar.
 *
 * @param {{ caixaAberto: boolean, isFirstUseNoCaixa: boolean }} params
 * @returns {boolean}
 */
export function shouldBlockAddToCart({ caixaAberto, isFirstUseNoCaixa }) {
  if (isFirstUseNoCaixa) return false;
  return !caixaAberto;
}

/**
 * "Deve barrar a ida para o pagamento por causa do caixa?" Vale para toda
 * conta, não só conta nova — é o ponto onde a barreira efetivamente se aplica
 * quando ela não apareceu antes (no load ou ao adicionar itens).
 *
 * @param {{ caixaAberto: boolean }} params
 * @returns {boolean}
 */
export function shouldPromptCaixaBeforePayment({ caixaAberto }) {
  return !caixaAberto;
}
