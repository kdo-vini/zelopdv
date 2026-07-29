# Incidents

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
