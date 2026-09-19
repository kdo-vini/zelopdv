# Zelinho Gerente — contrato operacional

## Canais
- App: painel Zelinho → `POST /api/gerente/agent` (JWT, só dono).
- WhatsApp: ZeloChat (empresa interna em `zelochat_mode='manager'`) → `POST /api/gerente/channel`
  com header `X-Gerente-Channel-Key`. Telefone → owner via `gerente_phone_links`.

## Pareamento
1. Dono gera código em Gestão > Zelinho Gerente > Preferências (`POST /api/gerente/pair/start`).
2. Manda o código para o número do Zelinho (`GERENTE_WHATSAPP_NUMBER`).
3. `completePairing` vincula; um telefone por empresa e uma empresa por telefone.
4. Desvincular: botão na mesma tela (`DELETE /api/gerente/pair`).

## Ferramentas
Leitura: `buscar_produto`, `listar_catalogo`, `listar_categorias`, `analisar_exclusao_catalogo`, `estoque_produto`, `resumo_periodo`, `resumo_financeiro`, `sinais_ativos`, `resumo_fiado`, `buscar_fiado`, `listar_despesas`.
Escrita (com confirmação): `pausar_no_cardapio`, `definir_publicacao_no_cardapio`, `ocultar_no_pdv`, `criar_categoria`, `criar_produto`, `criar_produtos_lote`, `editar_produto`, `alterar_preco`, `definir_custo_produto`, `excluir_catalogo`.
Desfazer: só pausa e ocultar.

O catálogo pode ser administrado em massa. A prévia de `excluir_catalogo`
separa itens sem histórico ou dependências, que podem ser excluídos, dos que
já aparecem em vendas, comandas ou pedidos online, que são arquivados
operacionalmente (ocultos no PDV e pausados no ZeloMenu) para preservar
relatórios; pizzas também seguem o arquivamento exigido pelo módulo de
composição. A confirmação revalida os dados antes de executar.
O executor usa a RPC transacional `gerente_excluir_catalogo`.

`produtos.custo_unitario` é opcional e representa o custo atual informado pelo
dono. `resumo_financeiro` calcula faturamento, despesas registradas, taxas,
custo conhecido, resultado registrado (faturamento menos despesas lançadas),
lucro estimado e cobertura dos custos;
quando a cobertura é parcial, o Zelinho não chama o valor de lucro líquido
real.

O prompt também permite recomendações gerais de vendas e marketing (link do
ZeloMenu, Instagram, WhatsApp, QR code, fotos, descrições, combos, promoções,
adicionais, recuperação de clientes e testes por horário/métrica) sem afirmar
que uma hipótese é fato da empresa. Caixa, vendas concluídas e recebimento de
fiado continuam fora das escritas do agente.

## Envs
`GERENTE_AGENT_ENABLED`, `GERENTE_AGENT_MODEL`, `GERENTE_CHANNEL_INTERNAL_KEY`, `GERENTE_WHATSAPP_NUMBER`.

## Falhas
- Sem `OPENAI_API_KEY` ou kill switch: 503 no app; no WhatsApp o ZeloChat responde indisponibilidade.
- Assinatura inativa: canal responde `INACTIVE_REPLY` e não chama o modelo.
