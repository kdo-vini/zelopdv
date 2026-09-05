# Incidents

## INC-2026-09-05-MONTAGEM — dificuldade de montagem manual na frente de caixa

**Status:** relato de cliente recebido; defeito de UI reproduzido e corrigido
localmente; publicação e confirmação autenticada pendentes.

Usuário relatou não conseguir montar produto no atendimento do dia anterior.
O componente real em Chromium mostrou dependências reativas indiretas:
adicional selecionado sem controles de quantidade; grupo limitado a duas
opções permite três marcações visuais, mas confirma snapshot com apenas duas.
Uma unidade de cada opção válida foi confirmada corretamente no harness.
Nenhuma venda persistida. A sessão salva de teste redirecionou ao login;
não foi estabelecido que este defeito explica integralmente o caso do cliente.
O harness Chromium agora confirma destaque, stepper, limites, snapshot, reset,
escolha opcional e grupo vazio; a suíte completa passa com 1.056 testes e três
skips opcionais. Evidência, reprodução, correção e melhorias propostas no
[plano de montagem](superpowers/plans/2026-09-05-montagem-frente-caixa.md).


## INC-2026-09-04-SALE-ACTOR — venda de operador fora da loja

**Status:** correção revisada, aplicada e registrada no Supabase em 2026-09-05 UTC.

No baseline PostgreSQL 17 descartável, `criar_venda_completa` usava auth.uid()
como dono. A venda do subusuário autorizado ficava sob o operador, sem caixa,
sem baixa do estoque da loja e sem incremento do fiado. Repetir a mesma chave
pela conta titular criava outra venda. Três intenções produziram quatro vendas,
estoques 16/16 e saldo 120; o resultado correto era três vendas, 14/14 e 140.
Consulta agregada live encontrou zero vendas sob subusuários com vínculo ainda
existente em access_users. Isso não certifica relações historicamente apagadas.

A migration `20260905003227_sale_owner_operator_context.sql` resolve o titular
no servidor, grava o ator autenticado em vendas.id_operador e exige permissão
antes de qualquer replay. Operador conhecido inativo é recusado, incluindo o
caso em que o helper antigo o tratava como titular. A assinatura própria
preserva quem também é titular de outra loja, sem mudar regras de validade.
Lock transacional por
titular/chave serializa operadores; histórico antigo sob operador exige
reconciliação explícita, sem reassociação, nova chave ou backfill automático.
O corpo de itens, pagamentos, estoque, fiado e taxas foi preservado.

As matrizes executam venda, replay, estoque individual/compartilhado, fiado,
ator forjado, permissões removidas, operador bloqueado, legado e ACL. Duas
corridas reais, em ordens invertidas titular/operador, produzem uma venda por
intenção. O ator do débito em fiado continua acessível pela venda vinculada;
não houve alteração adicional do trigger de fiado.
SHA256 aplicado: `590B66576FCBB16E5CCEAAC93008539A923C1CBA527B16F71C6ACDF5BF2C4E3D`.
ACL preservada: anon sem EXECUTE; authenticated e service_role com EXECUTE,
com os guards internos acima. Consulta pós-aplicação confirmou actor e lock.

## INC-2026-09-04-PIX — resultado da criação perdido após o provedor

**Status:** correção revisada e migration aplicada em 2026-09-05 UTC;
publicação do consumidor em preparação. Sem cobrança real de teste.

A criação chamava o provedor antes de inserir `billing_payments`, usando
externalId com timestamp. Uma resposta perdida, falha no insert ou erro no
flush de analytics poderia apresentar falha ao usuário depois de uma cobrança
ter sido criada. Concorrência encontrava a restrição de uma cobrança pendente
somente depois de mais de um POST. Não foi demonstrada duplicação histórica.

A reserva transacional agora precede o POST; timeout/erro após envio mantém
`unknown` e outra tentativa faz GET por externalId para recuperar a mesma
cobrança. Zero resultados não libera retry. Snapshot de valor/plano e vínculo
do titular são verificados antes de anexar um resultado. Configuração inválida
antes do dispatch é distinguida e libera `not_sent`. Liquidação e resposta
tardia preservam o pagamento confirmado. Analytics é independente da resposta.
Migration `20260905001053` aplicada antes do código, com ACL somente service_role;
anon/authenticated negados. Recuperação documentada em
[BILLING](BILLING.md). Testes locais não chamaram AbacatePay real.

## INC-2026-09-04-PUBLISH — revisão de origem e artefatos de produção

**Status:** Menu, PDV e Chat publicados e conferidos; CI final verde após rerun do gate público.

Relato: Chat/Menu podiam permanecer com frontend antigo após GitHub. Dokploy
inspecionado no navegador do usuário: Menu tem um serviço GitHub/master, domínio
menu.zelopdv.com.br → porta3101 e nenhum volume de código. `zelomenu.yml`
legado está vazio, sem rota concorrente. O checkout local tinha um commit próprio
e40 remotos; merge explícito preservou ambos. Chat tem dois serviços no mesmo
repo/main; nomes internos frontend/backend estão invertidos, porém roteamento
confere. O contexto vazio do Dockerfile.frontend foi explicitado como `.`.
Novos builds identificam o SHA real e impedem override divergente. O Menu
`bd8af453d82cf13a16c9b3ded93d99becdc82124` foi conferido pelo CI
`33942362245`, Dokploy e HTTP público; o Chat base `0d67676` foi conferido e
o patch `dc52af4` adiciona smoke HTTP e PostgreSQL isolado; a CI
`33941327097` passou após repetir somente o gate público que sofreu timeout de
rede no primeiro runner. Confirmar
Git → deploy → endpoint de versão após a publicação do patch. Backend recebeu stop grace
de60s no Dokploy para o drain limitado de55s. Não houve exclusão de imagens,
volumes ou pedidos como suposta correção de cache.

## INC-2026-09-04-COUPON — pedido e cupom em transações separadas

**Status:** função aditiva aplicada e registrada no Supabase em2026-09-04;
consumidor Menu publicado em 37b4b9e e conferido no domínio. Risco identificado por código,
sem perda histórica encontrada na consulta agregada de resgates (zero linhas).

`confirm_public_zelo_order_atomic` mantém token/revisão e snapshot revalidado,
pedido e resgate no mesmo commit. Replay recupera pedido antes de rejeitar a
revisão antiga. Dois backends PostgreSQL17 descartáveis confirmaram espera por
lock e exatamente um pedido/resgate por cupom/telefone; falha de produto
reverteu tudo. Migration `20260904232549_public_order_coupon_atomic.sql` usa
somente EXECUTE service_role; anon/authenticated negados também após aplicação.
Nenhum pedido de cliente foi criado nos testes e nenhum resgate foi apagado.

## INC-2026-09-04-DELIVERY-CAS — cotação antiga e push concorrente

**Status:** migrations `20260904234946` e `20260904235540` aplicadas;
consumidor Menu publicado em 37b4b9e e conferido no domínio.

Uma cotação manual só pode resolver o request ainda vinculado ao carrinho.
Requests órfãos de CAS perdido ou de endereço anterior retornam
`QUOTE_REQUEST_STALE`, sem mutar carrinho ou request. Push ganha lease por
assinatura, validando revisão/status do pedido; checkpoint exige o mesmo lease.
PostgreSQL 17 com conexões independentes comprovou exclusão mútua, expiração,
checkpoint antigo recusado e ACL restrita. Push continua entrega ao menos uma
vez após falha no transporte; lease não transforma rede em exactly-once.

## INC-2026-09-04-DELIVERY — tipo inválido ao salvar regra de frete

**Status:** corrigido no Supabase vinculado e ledger em 2026-09-04.

O lint do banco real, já registrado em CURRENT antes desta auditoria, acusava
42883 em `save_zelomenu_delivery_settings`: variável record recebia elemento
JSONB e depois era usada com operador JSON. DO isolado reproduziu a operação
sem tocar configurações de empresas. A migration
`20260904222157_delivery_pricing_rule_jsonb.sql` altera somente o tipo da variável
para jsonb. Revisão independente comparou todo o corpo com pg_get_functiondef;
após aplicação o erro correspondente desapareceu e ACL permaneceu restrita.
Não foi alterada regra comercial/frete de cliente nem feito backfill.
Um save completo por tenant não foi executado; lint/prova de tipos não substituem
o smoke de configuração após publicação dos consumidores. O alerta separado
de tabela temporária em criar_venda_completa permanece registrado.

## INC-2026-09-04-01 - Desconto ausente no recibo da frente de caixa

**Status:** corrigido no código em 2026-09-04; publicação em produção em andamento.

**Sintoma**

- A venda era gravada com o desconto e o total final correto, mas a nota
  impressa pela frente de caixa não mostrava a linha do desconto.
- O mesmo dado também não aparecia no comprovante textual compartilhado por
  WhatsApp ou copiado para a área de transferência.

**Causa-raiz**

- `imprimirReciboVenda` recebia um payload com desconto, mas não declarava nem
  repassava essa propriedade ao contrato de `printVenda`. Os builders ESC/POS
  e HTML já tinham suporte ao campo, por isso ambos exibiam somente o total.

**Fix / recovery**

- O adaptador agora encaminha `desconto`; o builder textual passou a renderizar
  `Desconto: -R$ ...` antes do total.
- Mesas, reimpressão do dashboard e relatórios foram verificados e não exigem
  alteração.

## INC-2026-09-01-01 - Reimpressão no dashboard falhava com `uid is not defined`

**Status:** corrigido e enviado para produção em 2026-09-01.

**Sintoma**

- Ao escolher **Reimprimir venda** em qualquer linha da atividade recente, o
  dashboard mostrava `Não foi possível reimprimir a venda: uid is not defined`.

**Causa-raiz**

- `uid` era declarado como constante local dentro de `loadDash()`, mas
  `carregarPerfilImpressao()` tentava reutilizá-lo depois, fora daquele escopo.

**Fix / recovery**

- O carregador de perfil agora recebe explicitamente o `userId` e a tela guarda
  o identificador autenticado para a ação posterior de reimpressão.
- O teste `tests/finance.saleReceipt.test.js` cobre a consulta do perfil com o
  usuário explícito; `npm run check` passou sem diagnósticos.

---

## INC-2026-08-24-01 - Visibilidade do PDV interferia na publicação do ZeloMenu

**Status:** código corrigido e contrato aplicado em produção em 2026-08-24.
Nenhum dado da Bem Servido foi alterado nesta correção.

**Sintoma**

- Produtos podiam ficar visíveis no ZeloPDV e, por consequência de uma regra
  histórica, aparecer publicados no cardápio digital; o operador precisava de
  dois controles independentes.

**Causa-raiz**

- A migration histórica `20260807134325_catalog_canonical_products` copiava
  `produtos.ocultar_no_pdv` para `zelomenu_product_publications.pausado_manualmente`
  e também fazia a cópia inversa. Além disso, ZeloMenu/ZeloChat ainda usavam
  `ocultar_no_pdv` como bloqueio público em alguns resolvers.

**Fix / recovery**

- O código público dos repos ZeloMenu e ZeloChat agora usa somente
  `visivel_online`, `pausado_manualmente`, categoria, estoque e regras de
  complementos; `ocultar_no_pdv` ficou restrito ao PDV interno.
- A migration `20260824134536_catalog_visibility_separation_guard.sql` apenas
  documenta as colunas e valida a existência das tabelas. O teste de regressão
  bloqueia futuras migrations que derivem um canal do outro.
- Não foi executado backfill/republicação/despublicação na Bem Servido por
  decisão explícita do produto. A conferência pós-migration manteve 122
  produtos, 104 visíveis no PDV, 83 publicados e 39 não publicados.

---

## INC-2026-08-14-01 - Mesas: "Comanda aberta nao encontrada" bloqueou toda a operacao

**Status:** corrigido em producao em 2026-08-14 (migration aplicada direto no
Supabase); migration forward-only versionada no repo.

**Sintoma**

- Reportado pelo cliente "Seu Muinhoz" as 19:41 de 14/08/2026, mas atingia
  todos os tenants com o add-on Mesas.
- As mesas abriam normalmente (comanda criada, `num_pessoas` editavel), mas
  qualquer tentativa de adicionar item retornava
  `Erro ao adicionar item: Comanda aberta nao encontrada`. Fechar e cancelar a
  mesa falhavam pelo mesmo motivo.

**Causa-raiz**

- `20260812234500_mesas_operational_rpc_rbac.sql` introduziu nas tres RPCs de
  comanda a deteccao de service-role
  `v_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';`.
- O PostgREST parou de popular os GUCs legados `request.jwt.claim.*` na v9 e
  so define `request.jwt.claims`; o Supabase roda v12+. Logo
  `current_setting(...)` devolve NULL e `NULL = 'service_role'` e NULL, nao
  false: `v_service` virou uma flag de tres valores.
- Duas consequencias em cascata, ambas silenciosas:
  - `if not v_service then v_owner := get_owner_user_id(v_actor); end if;` -
    `not NULL` e NULL, o ramo nunca executou e `v_owner` ficou NULL;
  - `where ... and (v_service or id_usuario = v_owner)` avaliou
    `NULL or NULL` = NULL, nenhuma linha casou e a funcao caiu direto no
    `raise exception 'Comanda aberta nao encontrada'`.
- Atingia owner e subusuario igualmente, porque nenhum dos dois chega a ter o
  owner resolvido. Nao havia problema de RLS, de dados nem de permissao: as
  escritas diretas do browser (ex.: `num_pessoas`) continuavam passando, o que
  mascarou o diagnostico inicial.

**Fix / recovery**

- `20260814200000_mesas_comanda_rpc_service_flag_fix.sql` recria as tres RPCs
  com a deteccao de service-role em dois valores, usando
  `coalesce(current_setting('role', true) = 'service_role', false)` - o padrao
  que `20260813095000` ja tinha adotado, porque SECURITY DEFINER troca
  `current_user` para postgres mas preserva o SET ROLE que o PostgREST deriva
  do JWT. O GUC legado permanece como fallback, tambem com `coalesce`.
- `v_owner` passa a ser validado como nao nulo antes de alcancar qualquer
  predicado: uma falha futura de resolucao levanta erro em vez de casar zero
  linhas em silencio.
- Contrato de autorizacao inalterado: mesmas capabilities, mesmo search_path
  fixo, mesmos grants, sem execucao para anon.
- Aplicada em producao e confirmada pelo usuario. Suite completa 689/689.

**Licao**

- Comparacao com `current_setting(..., true)` sempre deve ser envolvida em
  `coalesce(..., false)` quando o resultado vira boolean de controle. Em
  PL/pgSQL `if not NULL` nao executa o ramo, e NULL dentro de um `where` filtra
  tudo - as duas falham para o lado errado sem gerar erro.

**Referencias**

- `supabase/migrations/20260814200000_mesas_comanda_rpc_service_flag_fix.sql`
- `supabase/migrations/20260812234500_mesas_operational_rpc_rbac.sql`
- `tests/mesasComandaRpcServiceFlagSchema.test.js`
- `src/routes/app/mesas/[id]/+page.svelte`

---

## INC-2026-08-10-01 - Modal Abrir Caixa bloqueava a sidebar no desktop

**Status:** corrigido no codigo; requer deploy do frontend.

**Sintoma**

- Quando nao havia caixa aberto em `/app`, o modal `Abrir Caixa` aparecia como
  esperado, mas o backdrop fixo cobria tambem a sidebar desktop. O usuario nao
  conseguia navegar para as demais areas sem abrir o caixa primeiro.

**Causa-raiz**

- O backdrop global do modal usava `position: fixed` e `z-index: 50`. A
  sidebar era um flex item sem camada propria, entao ficava abaixo do overlay.
  No mobile, a bottom navbar ja usava `z-index: 1100`, mascarando o problema.

**Fix / recovery**

- `ModalAbrirCaixa.svelte` agora publica uma classe temporaria no elemento
  `html` enquanto esta aberto. Em telas desktop, `#gestao-sidebar` recebe uma
  camada superior somente nesse estado; o backdrop continua interceptando o
  restante do PDV. Nao houve alteracao de dados nem de regra de abertura.
- `npm run check` passou com 0 erros / 95 avisos conhecidos.

**Referencias**

- `src/lib/components/modals/ModalAbrirCaixa.svelte`
- `src/app.css`

---

## INC-2026-07-31-02 - Zelinho dizia que despesas registradas não existiam

**Status:** corrigido no código em 2026-07-31; requer deploy do frontend/server para chegar à produção.

**Sintoma**

- Na conta Apex Burgers, o Zelinho respondia que não havia despesas e tratava a receita como resultado operacional aproximado.
- O banco tinha 7 despesas no mês, total de R$ 7.431,00.

**Causa-raiz**

- O endpoint calculava o mês com o relógio do servidor em UTC. Às 02:00 UTC do dia 1, ainda era 23:00 do último dia do mês no Brasil; a consulta passava a buscar o mês seguinte e retornava zero.
- O resultado subtraía despesas do mês de uma receita acumulada nos últimos 30 dias, misturando períodos.

**Fix / recovery**

- Criados limites mensais usando `America/Sao_Paulo` e intervalos UTC inclusivos/exclusivos corretos.
- Receita e despesas do resultado agora vêm do mesmo mês local; vendas e despesas financeiras são paginadas para não parar na primeira página do PostgREST.
- O contexto do Zelinho preserva quantidade, categorias, percentual da receita e maior categoria de despesa, para cruzamento com vendas.
- Validação da Apex com os mesmos limites: 118 vendas / R$ 7.274,30, 7 despesas / R$ 7.431,00, resultado operacional aproximado de R$ -156,70 antes do custo dos produtos.
- Cobertura: suíte completa verde e `npm run check` com 0 erros / 99 avisos conhecidos.

**Referências**

- `src/lib/server/assistant/businessContext.js`
- `src/lib/server/intelligence/fetchers.js`
- `src/routes/api/chat/assistant/+server.js`

---

## INC-2026-07-31-01 - Mesas não adiciona item por RPC ambígua

**Status:** corrigido imediatamente no banco de produção em 2026-07-31.

**Sintoma**

- Ao tocar em um produto simples no mapa de comanda, o PDV mostrava `Erro ao adicionar item: Could not choose the best candidate function`.

**Causa-raiz**

- A migration de produtos montáveis criou duas funções `comanda_aplicar_delta_item`: uma assinatura legada com 3 argumentos e uma nova com 5 argumentos, sendo os dois últimos opcionais.
- Para clientes ainda usando o payload antigo, o PostgREST encontrou duas candidatas válidas e devolveu `PGRST203`, antes de executar qualquer alteração na comanda.

**Fix / recovery**

- Aplicada via `supabase db query --linked --file` a migration `.ai/migrations/comanda_aplicar_delta_item_remove_ambiguous_overload_2026_07_31.sql`.
- A sobrecarga de 3 argumentos foi removida; a função de 5 argumentos com defaults continua aceitando chamadas antigas com 3 parâmetros e chamadas novas com montagem completa.
- Verificação pós-fix confirmou uma única assinatura no catálogo, `EXECUTE` para `authenticated` e nenhuma linha de comanda/venda alterada pela correção.
- Cobertura local: testes direcionados 43/43 e `npm run check` com 0 erros / 95 avisos conhecidos.

**Referências**

- [.ai/migrations/comanda_aplicar_delta_item_remove_ambiguous_overload_2026_07_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/comanda_aplicar_delta_item_remove_ambiguous_overload_2026_07_31.sql:1)
- [src/routes/app/mesas/[id]/+page.svelte](/home/vinicius/code/zelopdv/src/routes/app/mesas/[id]/+page.svelte:401)

---

## INC-2026-08-09-01 - Exclusão de conta no admin bloqueada pelo histórico de fiado

**Status:** corrigido no banco; nenhuma conta foi apagada durante a correção.

**Sintoma**

- A tela `/users` do `admin-dashboard` retornava `update or delete on table
  "pessoas" violates foreign key constraint
  "fiado_lancamentos_id_pessoa_fkey"` ao apagar uma conta.

**Causa-raiz**

- `admin_delete_user` delega a remoção para `delete_account`. O purge já
  removia vendas, mas tentava apagar `pessoas` enquanto ainda existiam linhas
  em `fiado_lancamentos`. O FK do ledger é `ON DELETE RESTRICT` de propósito,
  para preservar o histórico quando uma pessoa é removida pelo fluxo normal.

**Fix / recovery**

- `delete_account` agora remove os `fiado_lancamentos` cujo `id_usuario` é da
  conta alvo antes de apagar `pessoas` e `auth.users`, na mesma transação.
- A migration arquivada em `supabase/history/observed-local/account_deletion_fiado_2026_08_09.sql` foi
  aplicada no Supabase vinculado via CLI e a ordem dos deletes/grants foi
  verificada por introspecção. O dashboard não precisou de alteração de
  frontend porque já chama `admin_delete_user`.

**Referências**

- [supabase/history/observed-local/account_deletion_fiado_2026_08_09.sql](../supabase/history/observed-local/account_deletion_fiado_2026_08_09.sql)
- [admin-dashboard/src/routes/users/+page.svelte](/home/vinicius/code/zelopdv/admin-dashboard/src/routes/users/+page.svelte:519)

---

## INC-2026-07-30-01 - Exclusão de pessoa quitada bloqueada pelo histórico de fiado

**Status:** corrigido no banco e no código; requer deploy do frontend.

**Sintoma**

- A tela de Pessoas retornava `update or delete on table "pessoas" violates foreign key constraint "fiado_lancamentos_id_pessoa_fkey"` ao excluir um cadastro já quitado.

**Causa-raiz**

- O `DELETE` direto do navegador não tratava as dependências. O extrato auditável usa `ON DELETE RESTRICT` para preservar a referência e as vendas também mantêm FKs para a pessoa, mesmo quando o saldo atual é zero.

**Fix / recovery**

- Criada e aplicada a RPC owner-scoped `fiado_excluir_pessoa(uuid)`. Ela bloqueia saldo diferente de zero, desvincula `vendas.id_cliente`/`vendas.id_pessoa`, remove o extrato da pessoa e só então exclui o cadastro, tudo na mesma transação.
- A tela passou a chamar a RPC e exibir uma mensagem operacional para saldo em aberto/crédito, sem expor o erro bruto da FK.
- Nenhum cadastro de cliente foi apagado durante a correção.

---

## INC-2026-07-29-01 - Fila de pedidos recusa sessao do navegador

**Status:** mitigacao implementada no codigo; requer deploy do app para chegar aos usuarios.

**Sintoma**

- `/app/pedidos` exibe `Erro ao carregar pedidos: permission denied for table zelo_orders`.

**Causa provavel e evidencias**

- A fila consulta `zelo_orders` com a sessao do navegador. O banco de producao exige o role `authenticated` para essa leitura; uma sessao ausente, expirada ou invalida chega como `anon` e recebe exatamente essa mensagem.
- A verificacao de producao em 2026-07-29 confirmou RLS ligado, `SELECT` para `authenticated`, nenhum `SELECT` para `anon` e as policies owner-scoped esperadas. Portanto, nao foi aplicado grant anon como paliativo.

**Fix / recovery**

- A tela reconhece o erro 42501/permissao da tabela, valida o usuario, tenta renovar a sessao uma vez e repete a consulta.
- Se a sessao expirou, o token local e removido e o usuario volta ao login; se a sessao esta valida, a tela mostra uma mensagem operacional sem expor o erro bruto do Postgres.
- Cobertura: `tests/onlineOrders.test.js` (9/9) e `npm run check` (0 erros / 96 avisos preexistentes).

## INC-2026-07-24-02 - ZeloAdmin nao altera o preco ao salvar plano

**Status:** corrigido no codigo em 2026-07-24; aguardando deploy via push para `main`.

**Sintoma**

- No modal de Plano e Addons, o novo valor aparecia como R$ 198, mas apos salvar a assinatura continuava em R$ 228.

**Causa-raiz**

- O fluxo manual/Abacate Pay atualizava flags e `plan_tier`, mas nao atualizava `monthly_value_cents`, que passou a ter prioridade na leitura do Admin.
- O espelho de precos do Admin ainda tratava `Pedidos` como add-on cobrado, embora o ZeloMenu ja o inclua.

**Fix / recovery**

- O salvamento manual/Abacate Pay agora grava o novo valor em centavos.
- O catalogo do Admin foi alinhado ao catalogo canonico: ZeloMenu = R$ 40 no ZeloPDV; Pacote Gestao + Atendimento = R$ 198; Pedidos = legado nao cobrado.
- O endpoint de sincronizacao Stripe tambem persiste o valor calculado apos a troca.
- Cobertura: `tests/admin.pricing.test.js` (3/3); `cd admin-dashboard && npm run build` passou com warnings pre-existentes.

---

## INC-2026-07-24-01 - ZeloAdmin exibe Dashboard e Assinaturas zerados

**Status:** confirmado em producao e corrigido em 2026-07-24.

**Sintoma**

- `/` no ZeloAdmin mostrava MRR, contas com acesso, novos no mes e expiracoes como zero.
- `/subscriptions` nao encontrava registros, embora as assinaturas continuassem presentes no banco.
- O problema afetava tambem a leitura de assinaturas em `/users`.

**Causa-raiz**

- O commit `76fad99` adicionou `monthly_value_cents` aos campos selecionados pelo admin-dashboard.
- A migration `.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql` estava versionada no repositorio, mas nao aplicada no banco real.
- O PostgREST rejeitava cada select por coluna inexistente. As telas ignoravam o objeto `error` e convertiam `data` nulo em lista vazia, produzindo zeros silenciosos.

**Fix / recovery**

- Aplicada a migration aditiva no projeto Supabase real `xnnjyrblpvsqrtsshawa`.
- A coluna `subscriptions.monthly_value_cents` agora existe; nenhuma linha foi removida ou alterada.
- O select do Dashboard tambem inclui `has_pedidos_addon`, evitando subcontagem do MRR pelo fallback de precos quando o valor real ainda esta nulo.
- Validacao do banco: 18 assinaturas no total - 5 `active`, 7 `trialing`, 5 `trial_expired`, 1 `canceled`.
- Linhas antigas permanecem com valor real nulo e usam o fallback por plano no admin; o backfill de valores cobrados fica pendente.
- `cd admin-dashboard && npm run build` passou, com warnings pre-existentes de a11y/Vite/Svelte. `npm run check` continua bloqueado pela ausencia pre-existente de `admin-dashboard/jsconfig.json`.

**Referencias**

- [.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql](/home/vinicius/code/zelopdv/.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql:1)
- [admin-dashboard/src/routes/+page.svelte](/home/vinicius/code/zelopdv/admin-dashboard/src/routes/+page.svelte:182)
- [admin-dashboard/src/routes/subscriptions/+page.svelte](/home/vinicius/code/zelopdv/admin-dashboard/src/routes/subscriptions/+page.svelte:113)


> Histórico operacional e padrões já conhecidos.
> Quando houver outage real, registrar sintoma, causa-raiz, fix e referência de código.

## Nota inicial

Não havia um log histórico consolidado de incidentes neste repositório. As entradas abaixo são os padrões de falha confirmados por código/migrations nesta sessão. Onde não houver evidência de ocorrência em produção, isso está marcado.

---

## INC-2026-07-06-01 - Caixa duplicado aberto vira "orfao" que nunca fecha

**Status:** confirmado por relato de usuario em producao (relatorios sempre mostram um caixa aberto, geralmente o penultimo).

**Sintoma**

- Usuario abre um caixa e, logo em seguida, abre outro sem perceber (duas abas/dispositivos ou retry apos falha de rede). As vendas caem no caixa mais novo.
- Ao fechar, `/gestao/caixa` fecha so o caixa mais novo; o mais antigo continua com `data_fechamento` null.
- No dia seguinte o PDV encontra o caixa antigo aberto e nao oferece o modal de abertura; o dashboard `/gestao` mostra "caixa fechado" (le o caixa mais recente por data, sem filtrar por aberto). Estado parece contraditorio: "nem aberto nem fechado".

**Causa-raiz**

- A invariante "no maximo um caixa aberto por empresa" nao era garantida em lugar nenhum: sem indice unico no banco e `handleAbrirCaixa` inserindo sem checar caixa aberto existente.
- Todos os consumidores (`verificarCaixaAberto`, `/gestao/caixa`, RPC `criar_venda_completa`) assumem no maximo um aberto via `order by data_abertura desc limit 1`, entao o segundo caixa aberto tornava o primeiro invisivel.
- Agravante: o `ModalAbrirCaixa` travava o botao em "Abrindo..." apos uma falha (flag `submitting` nunca resetava), forcando reload e novas tentativas cegas.

**Fix / recovery**

- Migration `.ai/migrations/caixas_one_open_per_user_2026_07_06.sql`: fecha os caixas orfaos existentes (herda `data_fechamento` da abertura do caixa seguinte; preserva caixa antigo se tiver venda posterior) e cria indice unico parcial `caixas_one_open_per_user` em `caixas (id_usuario) where data_fechamento is null`.
- Novo helper `src/lib/finance/caixaOps.js` (`abrirCaixaIdempotente`): checa caixa aberto antes de inserir e, em corrida (23505 do indice), adota o caixa vencedor em vez de falhar.
- `src/routes/app/+page.svelte` usa o helper com guarda de reentrada; `ModalAbrirCaixa` passou a receber `busy` do pai, reabilitando o botao apos falha.
- Cobertura: `tests/finance.caixaOps.test.js` (6 testes).

**Referencias**

- [src/lib/finance/caixaOps.js](/home/vinicius/code/zelopdv/src/lib/finance/caixaOps.js:1)
- [src/routes/app/+page.svelte](/home/vinicius/code/zelopdv/src/routes/app/+page.svelte:795)
- [.ai/migrations/caixas_one_open_per_user_2026_07_06.sql](/home/vinicius/code/zelopdv/.ai/migrations/caixas_one_open_per_user_2026_07_06.sql:1)

---

## INC-2026-07-01-01 - Despesa mostra toast de sucesso, mas nao aparece cadastrada

**Status:** confirmado por relato da cliente Bem Servido e reproduzido na conta de testes Unutopia.

**Sintoma**

- Ao lancar uma despesa em `/gestao/despesas`, o toast "Despesa lancada!" aparece.
- A lista continua sem o lancamento, dando aparencia de erro silencioso.
- O problema e mais visivel no primeiro dia do mes.

**Causa-raiz**

- A tela gravava e filtrava datas com `new Date('YYYY-MM-DD').toISOString()`.
- Em fuso brasileiro, uma data como `2026-07-01` vira o dia anterior em UTC ao ser serializada a partir de meia-noite.
- Como a tela filtra o mes atual a partir de `2026-07-01`, uma despesa lancada no dia 1 podia ser salva como `2026-06-30T...Z` e desaparecer do filtro.
- O fim do periodo tambem usava meia-noite do ultimo dia, excluindo despesas feitas no decorrer desse dia.
- O insert nao exigia retorno da linha cadastrada antes de mostrar sucesso.

**Fix / recovery**

- Adicionado helper de datas locais para input `YYYY-MM-DD`, faixa inclusiva do dia inteiro e formatacao sem deslocamento por fuso.
- `insert`, `update` e `delete` em `expenses` agora usam `.select(...).single()` e so mostram sucesso quando o Supabase confirma a linha afetada.
- Tratamento de erro explicito para Supabase ausente, sessao nao carregada, periodo/data invalidos, falha de carregamento, operacao sem linha afetada e erros PostgREST.
- Validacao local: `npx vitest run tests/dateRange.test.js` 3/3 e `npm run check` 0 errors / 110 warnings.

**Referencias**

- [src/routes/gestao/despesas/+page.svelte](/home/vinicius/code/zelopdv/src/routes/gestao/despesas/+page.svelte:1)
- [src/lib/dateRange.js](/home/vinicius/code/zelopdv/src/lib/dateRange.js:1)
- [tests/dateRange.test.js](/home/vinicius/code/zelopdv/tests/dateRange.test.js:1)

---

## INC-2026-06-17-01 — Trial grátis vencido permanece `trialing`

**Status:** confirmado em produção com MaisQ Salgados.

**Sintoma**

- Cliente com trial grátis local vencido continua aparecendo como `trialing` no ZeloAdmin.
- O caso confirmado tinha `current_period_end=2026-06-13T13:33:00.084+00:00`, sem provedor de pagamento e sem extensão manual.
- O acesso do app principal já era bloqueado por data, mas relatórios, filtros e automações podiam tratar o usuário como trial ativo.

**Causa-raiz**

- `subscriptions.status` não tinha estado persistente para trial local expirado.
- `past_due` não era o estado correto para esse caso, porque significa atraso/falha de cobrança, não fim de teste grátis sem cobrança.
- Não havia cron/backfill convertendo `trialing` vencido e sem provedor para um estado terminal de trial.

**Fix / recovery**

- Adicionado status canônico `trial_expired`, migration de constraint/backfill e cron Vercel `/api/cron/expire-trials`.
- Guards e endpoints sensíveis de billing/Acessos agora usam validade por data, então trial vencido não preserva entitlement mesmo antes do cron rodar.
- ZeloAdmin diferencia `TRIAL VENCIDO` de `PAST DUE` em assinaturas, usuários e analytics.
- Recovery operacional: aplicar `.ai/migrations/trial_expired_status_2026_06_17.sql` em produção antes do deploy/cron reconciliar. A tentativa direta via REST falhou com `subscriptions_status_check` porque produção ainda não aceitava `trial_expired`.

**Referências**

- [.ai/migrations/trial_expired_status_2026_06_17.sql](/home/vinicius/code/zelopdv/.ai/migrations/trial_expired_status_2026_06_17.sql:1)
- [src/routes/api/cron/expire-trials/+server.js](/home/vinicius/code/zelopdv/src/routes/api/cron/expire-trials/+server.js:1)
- [src/lib/subscriptionStatus.js](/home/vinicius/code/zelopdv/src/lib/subscriptionStatus.js:1)
- [docs/BILLING.md](/home/vinicius/code/zelopdv/docs/BILLING.md:1)

---

## INC-2026-06-01-01 — Conta marcada para exclusão não some após 14 dias

**Status:** padrão confirmado no código; ocorrência em produção não confirmada.

**Sintoma**

- `empresa_perfil.deletion_scheduled_at` fica preenchido.
- A conta some da UI ou entra em grace period, mas não é purgada quando o prazo vence.

**Causa-raiz**

- O app principal só agenda a deleção.
- A migration diz explicitamente que o purge final roda em um sweeper do ZeloChat, fora deste repo.

**Fix / recovery**

- Verificar se o sweeper externo existe, está implantado e chama `delete_account()` para contas vencidas.
- Se o sweep não existir, a conta fica eternamente em estado intermediário.

**Referências**

- [src/routes/api/account/delete/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/delete/+server.js:1)
- [.ai/migrations/account_deletion_grace_2026_05_31.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_grace_2026_05_31.sql:1)

---

## INC-2026-06-01-02 — Pix pago, assinatura continua pendente

**Status:** padrão de falha confirmado no código; ocorrência em produção não confirmada.

**Sintoma**

- QR/BR Code é gerado normalmente.
- Cliente paga Pix.
- `billing_payments` ou `subscriptions` não sai do estado pending/inativo.

**Causa-raiz**

- O webhook AbacatePay exige dois validadores simultâneos:
  - query `webhookSecret`
  - header `x-webhook-signature`
- Qualquer divergência em segredo/assinatura impede a sincronização do pagamento.

**Fix / recovery**

- Confirmar `ABACATEPAY_WEBHOOK_SECRET` no endpoint público.
- Confirmar chave pública usada na verificação HMAC.
- Reconciliar manualmente o pagamento via `syncPixPaymentWithRemote` ou ferramenta administrativa, se necessário.

**Referências**

- [src/routes/api/webhooks/abacatepay/+server.js](/home/vinicius/code/zelopdv/src/routes/api/webhooks/abacatepay/+server.js:53)
- [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:121)

---

## INC-2026-06-01-03 — Owner ativo bloqueado por guarda de perfil

**Status:** confirmado por teste falhando nesta sessão.

**Sintoma**

- Usuário com sessão válida e assinatura ativa é redirecionado para `/perfil?msg=complete`.

**Causa-raiz**

- `requiredOk` passou a exigir documento brasileiro válido e bobina `58mm`/`80mm`.
- Qualquer perfil antigo ou mock de teste fora desse contrato passa a falhar.

**Fix / recovery**

- Decidir se o contrato novo é o desejado.
- Se sim, atualizar testes, fixtures e possivelmente dados legados.
- Se não, relaxar `requiredOk` e revisar os fluxos que dependem dele.

**Referências**

- [src/lib/profileUtils.js](/home/vinicius/code/zelopdv/src/lib/profileUtils.js:28)
- [src/lib/guards.js](/home/vinicius/code/zelopdv/src/lib/guards.js:146)
- [tests/guards.ensureActiveSubscription.test.js](/home/vinicius/code/zelopdv/tests/guards.ensureActiveSubscription.test.js:85)

---

## INC-2026-06-06-01 — Tokens shadcn vazios: toasts invisíveis e componentes sem cor

**Status:** confirmado em runtime nesta sessão (verificado no navegador via `getComputedStyle`).

**Sintoma**

- Toasts (svelte-sonner) praticamente invisíveis: o toast padrão/`info` renderizava com `background: transparent` e texto preto.
- Botões do `AlertDialog` (`Cancelar`/`Confirmar`) e demais componentes shadcn apareciam como "blobs" com glow azul e sem preenchimento.
- Toasts `success`/`error`/`warning` (richColors) continuavam visíveis, mascarando a causa real.

**Causa-raiz**

- Um comentário em [src/app.css](/home/vinicius/code/zelopdv/src/app.css:343) continha a sequência `--bg-*/`. O `*/` **fechou o comentário CSS prematuramente**.
- O texto restante virou CSS malformado e o parser **descartou todo o bloco `:root` dos tokens shadcn + o `@theme inline`**.
- Resultado: `--popover`, `--background`, `--border`, `--card`, `--foreground` ficaram **vazios** em runtime (os legados `--bg-*`/`--text-*` continuaram, pois vêm de `base.css`).
- Componentes shadcn usam `bg-popover`/`bg-background`/`border-border` → sem valor → transparentes. svelte-sonner com `--normal-bg: var(--popover)` → vazio → toast transparente.

**Fix / recovery**

- Reescrever o comentário para não conter `*/` (`--bg-*/` → `bg / text / primary`).
- Confirmado: todos os tokens shadcn voltaram a resolver (`--popover: #1E293B`, `--background: #0F172A`, `--border: #334155`).
- Ajuste de polish no Toaster: `--normal-bg/text/border` ligados aos tokens + `closeButton`, para o toast padrão ficar slate on-brand em vez de preto.
- Regra prática: **nunca usar `*/` em texto de comentário CSS** (ex.: padrões `glob`/wildcards). Um comentário quebrado derruba silenciosamente todo o CSS subsequente.

**Referências**

- [src/app.css](/home/vinicius/code/zelopdv/src/app.css:343)
- [src/routes/+layout.svelte](/home/vinicius/code/zelopdv/src/routes/+layout.svelte:409)
- [src/lib/stores/ui.js](/home/vinicius/code/zelopdv/src/lib/stores/ui.js:5)


**2026-09-04 — risco de exclusão de titular na remoção de acesso (identificado na auditoria):** o teste local confirmou que duas assinaturas históricas produziam erro de singularidade ignorado em `DELETE /api/access/users/[id]`, fazendo a rota tentar excluir Auth após remover `access_users`; uma falha comum de leitura também seguia a cascata. Não há evidência de exclusão real de cliente neste diagnóstico. A correção verifica existência com `limit(1)` antes das exclusões e retorna 500 sem DML/auditoria quando a leitura falha, inclusive se vier com dados parciais. Oito regressões passam, a revisão independente foi aprovada e `npm run check` ficou em 0 erros/0 avisos; publicação ainda pendente neste registro.
