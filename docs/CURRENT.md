# ZeloPDV — Foco atual

> Atualizar a cada sprint/sessão.
> Referências: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[FIXES_PROGRESS]] · [[INCIDENTS]]

## Snapshot validado (2026-06-02)

- Branch: `main`
- HEAD inspecionado: `7761053` — `Fix second Acessos price drift + add TRADEOFFS doc`
- **Em andamento nesta sessão:** robustez offline do PDV (offline-first na leitura + gate tolerante a queda de rede). Ver [[docs/operations/OFFLINE]].
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- `npm test` — **149/149** testes passando (inclui novos testes de gate offline e snapshot de entitlement)
- `npm run check` — **0 errors / 110 warnings** (warnings pré-existentes em páginas públicas e modais operacionais)
- `cd admin-dashboard && npm run build` — build concluiu após ajuste na página `users` (seleção em lote + limpeza de contas inativas).
- `cd admin-dashboard && npm run check` — **falha de script/config**: `svelte-check --tsconfig ./jsconfig.json`, mas o app só possui `.svelte-kit/tsconfig.json`; não é regressão desta mudança.
- Admin: aba `/communications` agora suporta disparo individual e em lote de email via Resend e WhatsApp via ZeloChat interno, com placeholders clicáveis no composer e filtros por origem (`ZeloPDV`, `ZeloChat`, `Ambos`); validação local segue por `cd admin-dashboard && npm run build` porque `npm run check` continua quebrado por config legada.
- Ads/marketing: nova rota pública `/contato` com formulário interno de lead para sitelinks sem saída para domínio externo; `npm run check` manteve **0 errors / 133 warnings** e `npm run build` concluiu com warnings pré-existentes/adapter.
- Marketing: `/vs-planilha` agora usa layout full-width de página pública; CTAs de conversa em home, segmentos, extensões, precificação e comparação abrem o chatbot público sem alterar os botões de teste grátis para `/cadastro`. Rodapé mantém WhatsApp e adiciona link interno de demonstração para `/contato?assunto=demo`.

## Falhas abertas confirmadas

- Nenhuma na suíte principal após alinhamento das fixtures ao contrato atual de perfil, CPF/CNPJ e telefone.

## Drifts e riscos ativos

- Controle de Acessos hoje faz enforcement fino majoritariamente no cliente; o servidor/RLS escopa dados por `owner_user_id`, mas não aplica o JSON de permissões como barreira forte em todas as rotas ([[CODE_REVIEW]]).
- `AdminLock`/`pin_admin` é barreira de UI no browser, não proteção server-side de segredo ([[CODE_REVIEW]]).
- O Supabase real tem a função `delete_account()`, mas não há job `pg_cron` chamando essa função nem qualquer cron local por `deletion_scheduled_at`; a execução final continua fora deste repo / deste banco ([[CODE_REVIEW]]).
- `admin-dashboard/` usa anon key e presume tabelas sem RLS ([[CODE_REVIEW]]).
- Webhook Pix usa fallback para `DEFAULT_ABACATEPAY_PUBLIC_KEY`; confirmar se isso é intencional ([[CODE_REVIEW]]).

## Hotspots que pedem cautela

- `src/routes/app/mesas/[id]/+page.svelte` — maior superfície operacional do repo
- `src/routes/assinatura/+page.svelte` — billing UX e Pix
- `src/routes/perfil/+page.svelte` — perfil, add-ons, impressão, deleção
- `src/routes/app/+page.svelte` — frente de caixa e replay offline
- `admin-dashboard/src/routes/subscriptions/+page.svelte` — operação manual de assinatura

## Mudanças recentes visíveis no histórico Git

- Admin dashboard `/users`: avatar da tabela principal trocado por checkbox canônico de seleção, nova aba `Inativo`, barra de ação em lote mais compacta e exclusão em lote restrita a contas sem assinatura.
- Novo guia vivo do admin em `docs/admin/DESIGN_PATTERNS.md` para registrar preferências de UI/UX operacionais do painel.
- Admin dashboard `/communications`: aba operacional para comunicação individual e em lote com usuários, com envio server-side por `/api/admin/communications/send`, placeholders (`{{primeiro_nome}}`, `{{link_login}}`, etc.), filtros por origem de produto e WhatsApp saindo do número Techne `5514991537503`.
- Rota pública `/contato` para campanhas Google Ads: variações por `assunto`/`utm_content`, formulário interno de lead via Resend e entrada no sitemap.
- Robustez offline do PDV: gate de assinatura tolerante a queda de rede (snapshot de entitlement, carência de 7 dias), leitura offline-first de catálogo/categorias/subcategorias (Dexie v5), retry periódico de sync + badge de pendentes. Ver [[docs/operations/OFFLINE]] e [[TRADEOFFS]] (TA-OFF-01/02).
- Grace period de 14 dias para deleção de conta + reativação.
- Correção dos detalhes de plano na aba de perfil.
- Fluxo self-service de exclusão de conta.
- Extensão manual de assinatura por data final no admin.
- CORS global para API admin.
- Logging de atividade admin no servidor.

## Próximas fatias recomendadas

1. Validar fim-a-fim o fluxo de deleção agendada com o sweeper externo.
2. Revisar e documentar o modelo de segurança do `admin-dashboard/`.
3. Decidir se `pin_admin` continua como trava de conveniência ou vira proteção real server-side.
4. Atacar warnings de `svelte-check` por lote, começando pelos arquivos operacionais e não pelas páginas de marketing.
