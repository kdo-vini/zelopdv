# Incidents

> Histórico operacional e padrões já conhecidos.
> Quando houver outage real, registrar sintoma, causa-raiz, fix e referência de código.

## Nota inicial

Não havia um log histórico consolidado de incidentes neste repositório. As entradas abaixo são os padrões de falha confirmados por código/migrations nesta sessão. Onde não houver evidência de ocorrência em produção, isso está marcado.

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
