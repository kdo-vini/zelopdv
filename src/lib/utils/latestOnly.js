/**
 * Guard simples contra respostas assíncronas fora de ordem.
 *
 * Uso típico: várias chamadas concorrentes de uma mesma operação assíncrona
 * (ex.: trocar o preset de período, trocar o caixa selecionado) podem
 * resolver em ordem diferente da que foram disparadas. Sem guarda, a última
 * a resolver vence — mesmo que seja a mais antiga — e sobrescreve o estado
 * com dados de uma requisição já obsoleta.
 *
 * `createLatestOnly()` cria uma sequência isolada. Cada chamada a `start()`
 * invalida qualquer token emitido antes dela; um token só permanece válido
 * (`isStale === false`) enquanto nenhuma chamada mais recente a `start()`
 * tiver acontecido nessa mesma instância.
 *
 * @example
 * const guard = createLatestOnly();
 * async function carregar() {
 *   const token = guard.start();
 *   const dados = await buscar();
 *   if (token.isStale) return; // uma chamada mais nova já assumiu
 *   aplicarEstado(dados);
 * }
 */
export function createLatestOnly() {
	let seq = 0;
	return {
		start() {
			const id = ++seq;
			return {
				get isStale() {
					return id !== seq;
				}
			};
		}
	};
}
