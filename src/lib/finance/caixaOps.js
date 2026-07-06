/**
 * Operações de abertura de caixa.
 *
 * Invariante do produto: no máximo UM caixa aberto (data_fechamento null)
 * por empresa (id_usuario = owner). O banco garante isso via índice único
 * parcial `caixas_one_open_per_user`; aqui tratamos a corrida de forma
 * idempotente para que abrir "de novo" nunca crie um caixa duplicado/órfão.
 */

/**
 * Busca o caixa aberto da empresa, se houver.
 * @returns {Promise<{ caixa: object|null, error: object|null }>}
 */
export async function buscarCaixaAberto(supabase, ownerUserId) {
  const { data, error } = await supabase
    .from('caixas')
    .select('id, data_abertura, valor_inicial')
    .eq('id_usuario', ownerUserId)
    .is('data_fechamento', null)
    .order('data_abertura', { ascending: false })
    .limit(1);

  if (error) return { caixa: null, error };
  return { caixa: (data && data[0]) || null, error: null };
}

/**
 * Abre um caixa apenas se não houver outro aberto. Se já existir (inclusive
 * quando outro dispositivo abriu primeiro e o índice único barrou o insert),
 * adota o caixa existente em vez de falhar.
 * @returns {Promise<{ caixa: object|null, jaExistia: boolean, error: object|null }>}
 */
export async function abrirCaixaIdempotente(supabase, { ownerUserId, operadorUserId, valorInicial }) {
  const existente = await buscarCaixaAberto(supabase, ownerUserId);
  if (existente.error) return { caixa: null, jaExistia: false, error: existente.error };
  if (existente.caixa) return { caixa: existente.caixa, jaExistia: true, error: null };

  const { data, error } = await supabase
    .from('caixas')
    .insert({
      data_abertura: new Date().toISOString(),
      valor_inicial: Number(valorInicial),
      id_usuario: ownerUserId,
      id_operador: operadorUserId
    })
    .select('id')
    .single();

  if (!error) return { caixa: data, jaExistia: false, error: null };

  // 23505 = unique_violation: outro dispositivo/aba abriu entre a checagem e o insert.
  if (error.code === '23505') {
    const retry = await buscarCaixaAberto(supabase, ownerUserId);
    if (retry.caixa) return { caixa: retry.caixa, jaExistia: true, error: null };
    return { caixa: null, jaExistia: false, error: retry.error || error };
  }

  return { caixa: null, jaExistia: false, error };
}
