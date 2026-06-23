# ZeloPDV — Foco atual

> Atualizar a cada sprint/sessão.
> Referências: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[FIXES_PROGRESS]] · [[INCIDENTS]]

## Snapshot validado (2026-06-10)

- Branch: `main`
- HEAD inspecionado: `e01d908` — `feat(seo): páginas comparativas vs concorrentes + hub + sitemap dinâmico`
- **Sprint concluída:** marketing redesign 2026-06 — ver [[docs/projects/marketing-redesign-2026-06.md]] para o brief completo. Cover: home hero, 2 templates compartilhados (SegmentLandingPage + CompetitorComparison), pricing section, data files, audit visual.
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

## Validação executada nesta sessão

- ZeloMenu schema (2026-06-23): criada a migration `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` com a camada PDV-owned de publicação do ZeloMenu (`zelomenu_product_publications`) e modificadores por produto (`zelomenu_modifier_groups`, `zelomenu_modifier_options`). A visibilidade online fica separada de `produtos.ocultar_no_pdv`; preço base continua em `produtos.preco`; opções usam `price_delta`. Todas as tabelas nascem com RLS por `get_owner_user_id(auth.uid())`, checagem de posse do produto/grupo em writes e grants explícitos para `authenticated`/`service_role`. Validação: `npm test -- tests/zelomenuPublicationSchema.test.js` — 5/5; `npm test` — 166/166; `npm run check` — 0 errors / 106 warnings; `npm run build` — ok com warnings pré-existentes de Svelte/PWA/dependências opcionais. Migration ainda não aplicada em produção.
- Rollout Supabase parcial (2026-06-23): `trial_expired_status_2026_06_17` foi aplicado/registrado no Supabase real; auditoria prévia mostrou 0 assinaturas locais vencidas ainda em `trialing`. O hardening ZeloChat e a estrutura de `zelomenu_cart_sessions`/`zelomenu_cart_tokens` também foram aplicados pelo repo ZeloChat. A migration PDV-owned `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` **não** foi aplicada: a API confirmou `PGRST205` para `zelomenu_product_publications`, e o conector Supabase passou a retornar HTTP 500/-32603 antes desta etapa.
- Billing/admin (2026-06-17): trial grátis local vencido agora tem status persistente próprio `trial_expired`; `past_due` fica reservado para inadimplência/falha de cobrança. Correção inclui migration do constraint/backfill, cron Vercel `/api/cron/expire-trials`, helper canônico de status, guards/endpoints de billing e Acessos usando validade por data, admin `/subscriptions`/`/users`/`/analytics` com status operacional e copy de trial expirado no app. Confirmado no Supabase real que MaisQ Salgados ainda está `trialing` vencido (`current_period_end=2026-06-13T13:33:00.084+00:00`, sem provedor/extensão); tentativa de reconciliação direta falhou porque produção ainda não aceitou `trial_expired` no `subscriptions_status_check`. Aplicar `.ai/migrations/trial_expired_status_2026_06_17.sql` antes do deploy/cron reconciliar. Validação: `npm test` 161/161, `npm run check` 0 errors / 106 warnings, `npm run build` ok, `cd admin-dashboard && npm run build` ok; `cd admin-dashboard && npm run check` continua quebrado por `./jsconfig.json` ausente (pré-existente).
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
- A base de schema PDV-owned para publicação/modificadores do ZeloMenu já existe em migration local, mas ainda precisa ser aplicada no Supabase real. A UI self-service e o rollout por entitlement seguem dependentes dos próximos cortes (`ZLM-201`/`ZLM-205`).

## Próximas fatias recomendadas

1. Finalizar o rollout Supabase pendente: aplicar `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql` e verificar policies/grants assim que o conector Supabase voltar.
2. Construir a UI self-service de publicação do ZeloMenu sobre as tabelas `zelomenu_*` e só então ligar a leitura no menu público.
3. Validar fim-a-fim o fluxo de deleção agendada com o sweeper externo.
4. Revisar e documentar o modelo de segurança do `admin-dashboard/`.
5. Decidir se `pin_admin` continua como trava de conveniência ou vira proteção real server-side.
6. Atacar warnings de `svelte-check` por lote, começando pelos arquivos operacionais e não pelas páginas de marketing.
7. Expandir hero archetypes pra páginas standalone: `/precificacao` e `/vs-planilha` ainda usam layout legado (gradient text, multi-glow) — sprint separada pode ganhar +3-4 pontos no critique.
