# Incidents

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
- A migration `.ai/migrations/account_deletion_fiado_2026_08_09.sql` foi
  aplicada no Supabase vinculado via CLI e a ordem dos deletes/grants foi
  verificada por introspecção. O dashboard não precisou de alteração de
  frontend porque já chama `admin_delete_user`.

**Referências**

- [.ai/migrations/account_deletion_fiado_2026_08_09.sql](/home/vinicius/code/zelopdv/.ai/migrations/account_deletion_fiado_2026_08_09.sql:1)
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
