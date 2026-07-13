# ZeloPDV — Foco atual

> Atualizar a cada sprint/sessão.
> Referências: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[FIXES_PROGRESS]] · [[INCIDENTS]]

## Snapshot validado (2026-07-13)

- Branch: `main`
- HEAD inspecionado: `acc90cc` — `fix(caixa): impedir abertura duplicada + fechar orfaos`
- **Audit de design system concluído (2026-07-13):** auditoria impecable em 5 superfícies (PDV, marketing, auth+billing, gestão, admin-dashboard). Health score médio 13.8/20. 14 correções aplicadas (P0-P3): touch targets 44px no carrinho PDV, purple/indigo substituídos por sky-500, glassmorphism do card auth removido, tabular-nums global, tokens CSS em auth pages, shadows do assinatura capadas, numbered markers substituídos por ícones, aria-labels em toggles de senha, polling de pedidos reduzido (3s→30s), guardrail de cancelamento no admin. Detalhes em [[docs/projects/impeccable-audit-2026-07.md]]
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Auditoria UX do Zelinho contextual (2026-07-13): o drawer fechado agora fica `inert`, o foco retorna ao trilho ao fechar e o contexto de tela invalida ao mudar pathname, query ou entidade. Em mobile o painel usa semântica de dialog, foco fica preso no painel e todos os controles principais têm alvo mínimo de 44px. O contraste do cabeçalho usa tokens de tema, a reserva do workspace não anima padding e o motion de digitação/indicador crítico respeita `prefers-reduced-motion`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- Branch: `main`
- HEAD inspecionado: `e01d908` — `feat(seo): páginas comparativas vs concorrentes + hub + sitemap dinâmico`
- **Sprint concluída:** marketing redesign 2026-06 — ver [[docs/projects/marketing-redesign-2026-06.md]] para o brief completo. Cover: home hero, 2 templates compartilhados (SegmentLandingPage + CompetitorComparison), pricing section, data files, audit visual.
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- Motor canônico de pedidos online (2026-07-12): migration aditiva `.ai/migrations/canonical_online_orders_2026_07_12.sql` criada, mas **não aplicada em produção**. Inclui pedido/itens/eventos/outbox, RLS/grants, criação idempotente ligada atomicamente à sessão ZeloMenu, transições com revisão, fechamento financeiro e backfill não destrutivo das fontes legadas. O cutover e a auditoria no banco real continuam pendentes.

- Zelinho Gerente (2026-07-12): briefing/feed, badge/sidebar, chat contextual owner-scoped, relatório semanal, preferências e digest WhatsApp foram implementados. As migrations de engine, narrativa e preferências estão aplicadas e auditadas no Supabase real. O digest é protegido por `CRON_SECRET`, kill switch e idempotência diária. O chat contextual usa "resultado operacional aproximado" com a nota obrigatória de que não inclui o custo dos produtos; o servidor normaliza a saída do modelo para manter essa copy e o teste do endpoint cobre a rejeição de `signal_id` de outro tenant para subusuário. Em 2026-07-13, o contexto do chat passou a incluir todas as vendas/itens paginados dos últimos 30 dias, categorias reais, estoque individual ou compartilhado correto e mix de pagamentos; a classificação histórica por categoria é explicitamente baseada no catálogo atual.
- Zelinho contextual (2026-07-13): o antigo atalho lateral foi substituído por um trilho persistente. Em desktop amplo, o painel reserva 24rem do workspace; em largura intermediária, abre como sheet explícito; no mobile, ocupa a tela inteira. O contexto de um sinal agora define o foco da conversa e o cabeçalho expõe o contexto ativo. O resumo semanal e a edição de produto abrem o chat com IDs mínimos; o servidor reconsulta snapshots/produto pelo owner antes de injetar os dados. Para perguntas amplas como "salgados por venda", o servidor também agrega categorias reais com termo comum e declara as categorias incluídas.
- Validação do Zelinho contextual (2026-07-13): os 31 testes focados de chat/contexto/gerente passaram e `npm run check` terminou com 0 errors / 108 warnings. O painel fechado usa `inert`, devolve foco ao trilho e limpa contexto ao fechar ou trocar de rota. A suíte completa (`npm test`) está vermelha somente em dois testes de `api.create-subscription` que retornam 400 onde esperam 200; a fatia não toca billing e esse desvio precisa de investigação separada antes de declarar a branch totalmente verde.
- Pós-auditoria Impeccable do Zelinho (2026-07-13): a evidência exibida nos sinais agora inclui folhas aninhadas do contrato real, sinais silenciados continuam visíveis mas colapsados, semanas inválidas/futuras são normalizadas e falhas de leitura restauram o estado otimista. Os 31 testes focados passaram; `npm run check` está em 0 errors / 108 warnings; o detector scoped não encontrou achados não-advisory (os avisos restantes são somente tamanhos tipográficos explícitos).
- E2E autenticado do Zelinho (2026-07-13): no build local, o fluxo foi validado em desktop 1440px e mobile 393px: rail visível, drawer com foco automático, `dialog`/`aria-modal` e tela cheia no mobile, fechamento por Escape com foco devolvido ao rail. O setup Playwright completo ficou bloqueado porque este clone não tem `SUPABASE_SERVICE_ROLE_KEY` para semear subusuários; a execução isolada encontrou apenas 500 de infraestrutura em `/api/access/audit-login` e `/api/referrals/claim`. A produção atual ainda mostra o deploy antigo com o atalho `Parceiro IA`; publicar este working tree continua pendente.
- Rollout Zelinho (2026-07-12): `INTELLIGENCE_ENGINE_ENABLED=true` está configurado em Production. O piloto foi habilitado para Casa dos Salgados (`dc7eea7a-892f-418b-ae80-f3bd46ecc640`) e Donutopia (`d5625be9-abef-4371-a8e7-e915220aec42`). A execução manual para 2026-07-11 processou as duas empresas sem falhas, gerou quatro sinais e confirmou os snapshots contra as vendas-fonte: Casa dos Salgados R$ 868,00/24 vendas e Donutopia R$ 40,70/1 venda. A conta Vercel é Hobby e recusou cron horário; o digest usa o fallback no cron diário e a preferência de horário saiu da V1.
- Registro histórico (2026-07-12) da validação local do Zelinho: 18 testes direcionados passaram; `npm run check` estava em 0 errors / 111 warnings. O `npm run build` local chegou à adaptação Vercel, mas parou em `EPERM` ao criar symlink dentro de `.vercel/output`; o deploy remoto `dpl_5jVPRMZgqQ7sz54y7pC27G2tLBhk` compilou e está `Ready` em Production. As pendências operacionais de aceite continuam acompanhadas acima.

- Zelo Intelligence Engine V1 (2026-07-12, commits `0b7bbdf` + `9958268`): motor determinístico, cron `GET /api/cron/intelligence-daily` (vercel `4 6 * * *`) e migration `.ai/migrations/intelligence_engine_v1_2026_07_10.sql` estão versionados. A migration foi aplicada e auditada no Supabase real: RLS ativo nas três tabelas, policies owner-scoped para snapshots/sinais e grant de `UPDATE` do run log para service role. A Fase 1 também está aplicada: templates determinísticos para os 11 sinais, LLM opcional com fallback e uso/custo no run log; `.ai/migrations/intelligence_narratives_2026_07_12.sql` ampliou `ai_usage_logs_chat_type_check` para `intelligence` e foi verificada no banco. O primeiro processamento do piloto foi conferido contra os dados-fonte; permanecem a observação de três dias e o E2E autenticado.

- Supabase CLI conectado (2026-07-06): CLI v2.109.0 instalado como devDependency (`npx supabase`), logado e linkado ao projeto `xnnjyrblpvsqrtsshawa` (ZeloPDV). Migrations agora podem ser aplicadas via `npx supabase db query --file <sql> --linked`. Estado do link fica em `supabase/.temp/` (gitignored).

- Seguranca RLS (2026-07-06): advisor apontou 7 tabelas em `public` sem RLS e com grants completos para anon/authenticated. `billing_webhook_events` (deste repo, so acessada via service role) foi corrigida em producao: RLS ligado + grants revogados (`.ai/migrations/billing_webhook_events_enable_rls_2026_07_06.sql`, aplicada e verificada). As outras 6 (`leads`, `lead_events`, `outreach_messages`, `approvals`, `agent_runs`, `suppression_list`) eram de um bot antigo de captacao de leads sem consumidor ativo (confirmado pelo dono) e foram fechadas do mesmo jeito em 2026-07-06 (`.ai/migrations/leadbot_tables_enable_rls_2026_07_06.sql`, aplicada e verificada: RLS on nas 6, zero grants anon/authenticated, dados preservados). P0 resolvido — detalhe e follow-up (dropar tabelas do bot, LGPD) em [[CODE_REVIEW]].

- Caixa duplicado/orfao (2026-07-06): corrigida a abertura de dois caixas simultaneos que deixava o mais antigo "orfao" (aberto para sempre, invisivel no PDV e no fechamento). Invariante agora garantida no banco por indice unico parcial (`.ai/migrations/caixas_one_open_per_user_2026_07_06.sql`, que tambem fecha orfaos existentes — **aplicada no Supabase real em 2026-07-06** via CLI linkado; saneamento foi no-op pois nao havia orfao ativo no momento, e insert duplicado testado retornou 23505 como esperado) e no client por `abrirCaixaIdempotente` em `src/lib/finance/caixaOps.js` (adota caixa existente em corrida 23505). `ModalAbrirCaixa` nao trava mais em "Abrindo..." apos falha. Detalhes em INC-2026-07-06-01. Validacao: `npx vitest run tests/finance.caixaOps.test.js` 6/6, `npm test` 213/214 (unica falha: `zelomenuPublicationSchema` pre-existente, sem relacao), `npm run check` 0 errors / 110 warnings.

- Despesas (2026-07-01): corrigido falso sucesso ao lancar despesa em `src/routes/gestao/despesas/+page.svelte`. Causa: conversao de `YYYY-MM-DD` via `new Date(...).toISOString()` deslocava a data para UTC e, em inicio de mes no fuso BR, a despesa ficava fora do filtro mensal apesar do toast "Despesa lancada!". O fluxo agora usa datas locais inclusivas, exige retorno da linha em insert/update/delete e exibe erro real quando Supabase/configuracao/sessao/periodo/operacao falham. Cobertura: `tests/dateRange.test.js`; validacao: `npx vitest run tests/dateRange.test.js` 3/3, `npm run check` 0 errors / 110 warnings.

- Produtos mobile refactor (2026-06-24): `src/routes/gestao/produtos/+page.svelte` deixou de comprimir árvore + tabela no viewport pequeno e ganhou cabeçalho de ações em grade, categorias/subcategorias em trilha horizontal, busca/filtros com alvos de toque e cards mobile para listagem/edição de produtos. Desktop preserva a tabela/árvore existentes. Validação: `npm run check` — 0 errors / 105 warnings; `npm run build` — sucesso com warnings pré-existentes de Svelte/PWA/dependências opcionais. Validação visual autenticada não foi possível na sessão local porque `/gestao/produtos` redireciona para `/login` sem sessão.
- Produtos → ZeloMenu bulk publish (2026-06-24): `src/routes/gestao/produtos/+page.svelte` ganhou a ação em lote **Publicar no menu**, visível somente quando `hasZeloMenuAccess` confirma o entitlement e revalidada no clique antes da escrita. O helper canônico `src/lib/zelomenuPublications.js` faz upsert owner-scoped em `zelomenu_product_publications`, ativa `visivel_online`, remove pausa manual e preserva falhas selecionadas quando apenas parte dos lotes conclui. Cobertura direcionada: `tests/guards.zelomenu.test.js`, `tests/zelomenuPublications.test.js` e `tests/zelomenuPublicationSchema.test.js` — 11/11; suíte completa `npm test` — 177/177; `npm run check` — 0 errors / 106 warnings; `npm run build` — sucesso com warnings pré-existentes de Svelte/PWA/dependências opcionais.
- ZeloMenu entitlement + slug + pricing (2026-06-23): migration `.ai/migrations/zelomenu_entitlement_and_slug_2026_06_23.sql` aplicada no Supabase real — adiciona `subscriptions.has_zelo_menu` (backfill chat/bundle→true, pdv→false), `empresa_perfil.zelomenu_slug` (único quando não-nulo) e a coluna na view `user_entitlements`. `src/lib/pricing.js`: ZeloChat R$147 / bundle R$197 (price IDs v2) + novo addon `menu` R$40, **billing-safe** (price IDs v1 legados mantidos no reverse-lookup `STRIPE_PRICE_TO_PLAN` para não quebrar assinantes atuais). Novos guards em `src/lib/guards.js`: `hasZeloMenuAccess`/`hasOrderingReviewAccess`/`hasKitchenQueueAccess`. Webhook (`src/routes/api/billing/webhook/+server.js`) passa a gravar `has_zelo_menu`. Admin `admin-dashboard/.../subscriptions` ganhou toggle ZeloMenu. Prices Stripe LIVE criados via API (chat v2 `price_1TlbH2LUJWyE4PkYSqFSXXVY`, bundle v2 `price_1TlbH2LUJWyE4PkYlS4IxMhs`, menu `price_1TlbH4LUJWyE4PkYX0kdJhAw`). Validação: `npx vitest run tests/pricing.acessos.test.js` 10/10 (inclui legacy-mapping + pdv+menu=99). Pendente: migrar assinatura do Agreste pro v2 com aviso (D-104); CS grandfathered (D-017).
- ZeloMenu schema (2026-06-23): migration `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` aplicada no Supabase real como `zelomenu_publication_schema_2026_06_23`, criando a camada PDV-owned de publicação do ZeloMenu (`zelomenu_product_publications`) e modificadores por produto (`zelomenu_modifier_groups`, `zelomenu_modifier_options`). A visibilidade online fica separada de `produtos.ocultar_no_pdv`; preço base continua em `produtos.preco`; opções usam `price_delta`. Verificado: RLS ligado nas 3 tabelas, 4 policies por tabela, grants mínimos para `authenticated`/`service_role`, nenhum grant para `anon`, constraints/FKs/índices presentes e chave pública bloqueada para acesso anônimo. Validação local: `npm test -- tests/zelomenuPublicationSchema.test.js` — 5/5.
- Rollout Supabase ZeloMenu concluído (2026-06-23): `trial_expired_status_2026_06_17` foi aplicado/registrado no Supabase real; auditoria prévia mostrou 0 assinaturas locais vencidas ainda em `trialing`. O hardening ZeloChat, a estrutura de `zelomenu_cart_sessions`/`zelomenu_cart_tokens`, as policies/grants finais do carrinho e a migration PDV-owned `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` também foram aplicados. Advisors Supabase rodados; não houve alerta novo específico da segurança/RLS das tabelas ZeloMenu.
- Billing/admin (2026-06-17): trial grátis local vencido agora tem status persistente próprio `trial_expired`; `past_due` fica reservado para inadimplência/falha de cobrança. Correção inclui migration do constraint/backfill, cron Vercel `/api/cron/expire-trials`, helper canônico de status, guards/endpoints de billing e Acessos usando validade por data, admin `/subscriptions`/`/users`/`/analytics` com status operacional e copy de trial expirado no app. Migration `.ai/migrations/trial_expired_status_2026_06_17.sql` aplicada/registrada no Supabase real em 2026-06-23; auditoria prévia mostrou 0 assinaturas locais vencidas ainda em `trialing`, então não houve backfill visível nesta rodada. Validação original: `npm test` 161/161, `npm run check` 0 errors / 106 warnings, `npm run build` ok, `cd admin-dashboard && npm run build` ok; `cd admin-dashboard && npm run check` continua quebrado por `./jsconfig.json` ausente (pré-existente).
- Marketing analytics (2026-06-14): PostHog instalado para heatmap/autocapture anonimo apenas em rotas externas permitidas (`/`, `/para-*`, `/vs-*`, `/blog/*`, `/cadastro`, `/login`, `/contato`, etc.). Bloqueado em `/app`, `/gestao`, `/relatorios`, `/perfil`, `/assinatura`, `/ferramentas` e `/auth/callback`; session recording fica desabilitado no client. Requer `PUBLIC_POSTHOG_KEY` no ambiente para ativar. Validado com `tests/posthogClient.test.js`.
- Auth/onboarding (2026-06-14): `/cadastro` deixou de exigir confirmação por e-mail. `POST /api/auth/signup` agora cria usuário confirmado via service role (`email_confirm: true`), faz login server-side com senha e devolve sessão; o cliente grava a sessão Supabase, preserva/reforça referral, dispara `sign_up`/Google Ads e manda direto para `/perfil?msg=complete` (OnboardingWizard). Requer `SUPABASE_SERVICE_ROLE_KEY` no servidor.
- Validação auth/onboarding + analytics (2026-06-14): `npm test -- tests/api.auth-signup.test.js tests/api.auth-login.test.js` — **4/4**; `npm test -- tests/posthogClient.test.js` — **2/2**; `npm run check` — **0 errors / 106 warnings**; `npm test` — **153/153**; `npm run build` — **sucesso** com warnings pré-existentes do Svelte/PWA/adapter.
- `npm run check` — **0 errors / 104 warnings** (redução de 112 pra 104 com a limpeza de CSS morto e inline SVGs)
- `npm run build` — **sucesso**
- `npm test` — **149/149** testes passando
- **Marketing redesign 2026-06** — sprint completa, ver docs/projects/marketing-redesign-2026-06.md:
  - Home hero convertido pra conversa Zelinho (2-col, chat mockup, voz operador, 1 glow, sem gradient)
  - `/vs-*` pivotado pra editorial-dossier (tese, fontes no topo, CTA invertido)
  - Eyebrow trope removido dos 2 templates (SegmentLandingPage + CompetitorComparison)
  - Decoração removida: 8 glows → 1, Easter banner → pill, gradient/conic keyframes deletados
  - Copy em voz operador (zero "sem enrolação", "solução integrada", "plataforma completa")
  - MarketingPriceSection sem animate-border, checkmarks sky, border estática
  - 3 hero archetypes distintos (home chat / segment numbered / competitor editorial)
  - Hex hardcoded → tokens CSS, inline SVGs → lucide-svelte, :root override removido do precificacao
  - Re-critique: **23/40 → 29/40 (+6)**
- `cd admin-dashboard && npm run build` — build concluiu.
- `cd admin-dashboard && npm run check` — falha de script/config (pré-existente, sem regressão).
- Admin: aba `/communications` agora suporta disparo individual e em lote de email via Resend e WhatsApp via ZeloChat interno, com placeholders clicáveis no composer e filtros por origem (`ZeloPDV`, `ZeloChat`, `Ambos`); validação local segue por `cd admin-dashboard && npm run build` porque `npm run check` continua quebrado por config legada.
- Ads/marketing: nova rota pública `/contato` com formulário interno de lead para sitelinks sem saída para domínio externo; `npm run check` manteve **0 errors / 133 warnings** e `npm run build` concluiu com warnings pré-existentes/adapter.
- Marketing: `/vs-planilha` agora usa layout full-width de página pública; CTAs de conversa em home, segmentos, extensões, precificação e comparação abrem o chatbot público sem alterar os botões de teste grátis para `/cadastro`. Rodapé mantém WhatsApp e adiciona link interno de demonstração para `/contato?assunto=demo`.
- SEO/marketing (2026-06-09): 12 páginas comparativas `/vs-<concorrente>` (saipos, goomer, anota-ai, whatsmenu, cardapio-web, yooga, sisfood, conta-azul, gestaoclick, bling, tiny, omie) — fundo de funil, data-driven em `src/lib/data/competitorComparisons.js` + template `src/lib/components/marketing/CompetitorComparison.svelte` (mesmo padrão de `SegmentLandingPage`). Conteúdo com preços datados ("a partir de", jun/2026), reclamações sempre atribuídas a terceiros (Reclame Aqui) e bloco "sendo justo" para E-E-A-T/proteção jurídica — regras no topo do data file. **Sitemap agora é dinâmico**: `src/routes/sitemap.xml/+server.js` (prerender) monta URLs a partir dos data files; o antigo `static/sitemap.xml` foi removido — não recriar à mão. Pendente: linkar internamente as páginas (hoje só no sitemap) e validar claims offline/Pix no navegador antes de divulgar. `npm run check` 0 errors; `npm run build` ok.
- Marketing/docs (2026-06-09): `docs/DESIGN_PATTERNS.md` agora cobre explicitamente páginas públicas/landings. `MarketingFooter.svelte` foi alinhado ao rodapé canônico da home e a home passou a reutilizar o componente compartilhado; links `Funcionalidades`/`Preços`/`Central de Ajuda` no footer agora resolvem para `/#...` fora da home, em vez de apontar para âncoras inexistentes na rota atual.
- Ads/tracking + landing (2026-06-12) — saída da auditoria `/ads` (tracking 28/100, LP 58/100; campanha Search pausada teve 34 cliques / 0 conversões registradas):
  - **Prova social fabricada removida das 4 segment pages** (`segmentLandingPages.js`): depoimentos fictícios + `aggregateRating 4.9/38` saíram do JSON-LD (risco de política de misrepresentation do Google Ads em final URLs). A seção de depoimento do `SegmentLandingPage.svelte` virou a seção honesta "Sem pegadinha" da home.
  - **Conversão antecipada do Google Ads**: `trackGoogleAdsInscricao` agora dispara no sucesso do `/cadastro` e no callback OAuth (antes só no fim do OnboardingWizard, 3 sessões depois do clique — por isso 0 conversões). Dedup por `transaction_id` (user id) + sessionStorage; refire no wizard/assinatura conta uma vez só.
  - **Enhanced Conversions**: e-mail hasheado (SHA-256 client-side) vai em `user_data` na conversão de inscrição. ⚠️ Exige habilitar Enhanced Conversions na conversão dentro do Google Ads (passo manual na conta).
  - **GA4 funnel events**: `sign_up` (cadastro/OAuth) e `begin_trial` (wizard/assinatura) — habilita import de conversões GA4 no Google Ads como backup.
  - **Consent Mode V2 default granted** em `app.html` (LGPD/BR sem banner; pronto pra `consent update` futuro).
  - `/cadastro`: subtítulo agora promete o trial ("30 dias, sem cartão"), campo "Confirmar senha" removido, `autocomplete` adicionado, linha de reasseguramento sob o botão.
  - `<title>` duplicado no SSR corrigido: título estático saiu do `app.html` e do root layout; fallback dinâmico via `afterNavigate` pra rotas internas sem título; `AuthLayout` define título próprio.
  - **Nova landing `/para-restaurantes`** (segmento + rota + card na home + sitemap automático) — query "sistema para restaurante" caía na home toda framada pra lanchonete. Header de segment pages agora usa âncoras locais (`localAnchors` no `SiteHeader`) em vez de vazar pra home.
  - Logo: `logo-horizontal.webp` 13,6 KB substitui o PNG de 123 KB nos componentes (PNG mantido em `static/` pro JSON-LD do blog).
  - Validação: `npm run check` 0 errors / 106 warnings, `npm test` 149/149, `npm run build` ok.
  - **Pendências manuais (conta Google Ads / deploy):** habilitar Enhanced Conversions na conversão de inscrição; confirmar `SUPABASE_SERVICE_ROLE_KEY` no ambiente de produção para o cadastro automático; reativar a campanha pausada depois do deploy.

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

- **Marketing redesign sprint (2026-06-10)**: home hero Zelinho-conversação, `/vs-*` editorial-dossier, eyebrow trope removido, copy em voz operador, decoração silenciada, pricing section endurecida, 3 archetypes de hero, token drift corrigido, inline SVGs migrados. Brief completo em `docs/projects/marketing-redesign-2026-06.md`. Score do critique: **23 → 29/40**.

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

## Planejamento cross-produto

- ZeloMenu/ZeloChat/ZeloPDV: decisões completas e backlog por fases em [[docs/projects/zelomenu-linear-plan.md]]. Impacta pricing, catálogo comum, Pedidos como motor interno, entitlements, ZeloChat e integração futura com Mesas.
- A base de schema PDV-owned para publicação/modificadores do ZeloMenu já está aplicada no Supabase real.
- ZLM-205 (billing e planos) concluído: ZeloMenu como addon (R$40) no checkout, billing APIs, webhook, admin dashboard.
- ZLM-201 bulk publish concluído; self-service individual (nome/descrição/foto/ordem) ainda pendente.
- Status completo em [[docs/projects/zelomenu-zelopdv-status.md]].

## Próximas fatias recomendadas

1. Completar a UI self-service de publicação do ZeloMenu com edição de nome/descrição/foto/ordem, despublicação, pausa e modificadores; a publicação em lote básica já existe em Gestão → Produtos.
2. Expandir o adapter atual de `zelomenu_product_publications` para leitura/edição e adicionar adapters de `zelomenu_modifier_groups`/`zelomenu_modifier_options`, sem alterar o catálogo base `produtos`.
3. Finalizar landing page de marketing do ZeloMenu em `/extensoes` (card + seção detalhada + FAQ + entrada em `extensoes.js`).
4. Validar fim-a-fim o fluxo de deleção agendada com o sweeper externo.
5. Revisar e documentar o modelo de segurança do `admin-dashboard/`.
6. Decidir se `pin_admin` continua como trava de conveniência ou vira proteção real server-side.
7. Atacar warnings de `svelte-check` por lote, começando pelos arquivos operacionais e não pelas páginas de marketing.
8. Expandir hero archetypes pra páginas standalone: `/precificacao` e `/vs-planilha` ainda usam layout legado (gradient text, multi-glow) — sprint separada pode ganhar +3-4 pontos no critique.
