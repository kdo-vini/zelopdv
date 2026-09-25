# ZeloPDV — Foco atual

## Sessão 2026-09-25 — Design System Zelo, Fase 0 (branch `claude/admiring-thompson-1jk0tr`)

Nova marca (navy `#011F4A` + branco) vira o **Design System Zelo**. Linguagem
visual em `DESIGN.md` (reescrito), implementação e migração em
`docs/DESIGN_SYSTEM.md`, referência viva em `/dev/design-system` (404 em produção).

- Superfícies por rota em `<html data-surface>` definidas no servidor
  (`src/lib/theme/surface.js` + `hooks.server.js`): `app` (interno, claro,
  ação navy), `brand` (cliente final, navy, ação branca) e `legacy` (tema
  antigo, padrão até cada fase).
- Prévia: `?tema=novo` (cookie `zelo_ui=v2`) / `?tema=atual`.
- `src/themes/base.css` → `surface-legacy.css` (valores idênticos) +
  `tokens.css`, `surface-app.css`, `surface-brand.css`, `derived.css`.
- Guardas: `npm run check:ui` (CI), `tests/themeContrast.test.js`,
  `tests/themeSurface.test.js`, `npm run visual:diff`.
- **Sem mudança visual em produção**: 0 pixels diferentes em 16 rotas × 2
  larguras contra o commit anterior.
- Progresso da continuação (roteiro em `docs/HANDOFF-design-system.md`; cada
  etapa verificada com legado pixel-idêntico a `main` sem `?tema=novo`):
  - **A — movimento + `/app` + sidebar** ✅: `src/lib/motion/` (molas em forma
    fechada, `blurSwap`, `rise`, `LiquidIndicator`), `MorphButton`, squash nas
    variantes do sistema, `MoneyText animate`; sidebar com as métricas do
    mockup (244 px, itens 13,5/38 px). Movimento reduzido zera durações e squash.

## Sessão 2026-09-25 — GEO, leva 2 (branch `feat/geo-wave-2`)

Diagnóstico de 25/09: o on-site já estava bom (SSR para os bots de IA, JSON-LD,
robots, llms.txt). O gargalo está fora do site. A busca por "Zelo PDV" traz
K-pop e restaurantes homônimos, e o `sameAs` só apontava para
`instagram.com/techne.ia`. O Zelo não aparece nas listas de terceiros (ex.:
Negócio Certo, "7 Melhores Sistemas PDV", 03/09). O Bing Webmaster continua
pendente. Desde agosto de 2026 o ChatGPT corta Reddit e prefere fontes
canônicas e first-party.

- `/vs-*` e `/para-*`: `updatedAt` por entrada (derivado do `git blame`),
  linha visível "Atualizado em", JSON-LD `WebPage` com `dateModified` e
  `lastmod` no sitemap. No hero das `/vs-*`, o antigo "Atualizado em
  {priceCheckedAt}" virou "Preço checado em".
- `ORGANIZATION.sameAs` em `src/lib/seo/site.js` é a fonte do `sameAs`. Cada
  perfil novo (Google Business, Reclame Aqui, Capterra etc.) entra ali.
- Post `/blog/melhores-sistemas-pdv-para-lanchonete-2026`: 8 sistemas, com
  aviso de que é publicado pelo Zelo, "quando não escolher" (inclusive o Zelo,
  sem NFC-e) e fontes datadas.
- Preços rechecados em 2026-09-25. A Anota AI passou a cobrar por faixa de
  pedidos (R$ 99,99 / 199,99 / 299,99) e anuncia NF automatizada, e
  `/vs-anota-ai` foi reescrita. Pendências fechadas no mesmo dia: o WhatsMenu cobra R$ 197/mês no mensal
  ou 12x R$ 97 no anual (`/vs-whatsmenu` reescrita). A SisFood segue em
  R$ 149,90, mas agora anuncia contingência offline (vendas em dinheiro; NFC-e,
  TEF e iFood dependem de internet), e a alegação "100% cloud" saiu. A Yooga
  não publica mais preço: aparece como "sob consulta", com os valores de junho
  de 2026 citados como histórico.
- `docs/marketing/GEO_KIT_PERFIS.md`: ficha canônica, checklist de perfis,
  pedido de avaliação, outreach, roteiro de entrevista com os 3 clientes que
  vieram do ChatGPT e passo a passo do Bing Webmaster (relatório de IA).

Validação: `npm test` com 2.196 testes passando e 3 skips (rodado pelo agente
antes da última correção de texto); os 55 testes direcionados foram
rerodados depois dela. `npm run check` sem erros. O post e `/vs-anota-ai`
foram conferidos no dev server. Não houve deploy.

## Sessão 2026-09-25 — Retenção em lote de `zelochat_webhook_events_raw`

Disk IO Budget do projeto compartilhado (Nano/Free) estava sendo queimado
por DELETE PostgREST grande, sem LIMIT, em `public.zelochat_webhook_events_raw`
(payload jsonb). Este repo **não** tem consumidor app dessa deleção de
retenção — só `delete_account` por `empresa_id`. A correção fica no banco:

- RPC `purge_zelochat_webhook_events_raw_batch` (SECURITY DEFINER, só
  `service_role`) apaga no máximo 500 linhas processadas com mais de **3 dias**,
  via `zelochat_webhook_events_raw_processed_retention_idx`.
- PROCEDURE `purge_zelochat_webhook_events_raw_sweep` dá COMMIT após cada
  lote (máx. 20) para o cron não virar um delete de 10k numa transação.
- `pg_cron` a cada 15 min, job `purge-zelochat-webhook-events-raw`.
- Unprocessed (`processed_at IS NULL`) não são apagados.
- Mesma migration remove índices btree duplicados exatos de caixa/vendas
  (após `pg_get_indexdef`). RLS `auth_rls_initplan` em gerente/offline
  ficou de fora — não é wrap mecânico.

Migration `20260925140000_purge_zelochat_webhook_events_raw_retention.sql`
ainda **não** aplicada em produção (PR only). Sem upgrade de compute e sem
analytics em `payload`.

## Sessão 2026-09-25 — Wizard de produto e taxa de app na planilha

O formulário rápido saiu da planilha. O botão `+` agora abre
`PricingWizardModal.svelte`, com a entrevista de 5 passos da calculadora antiga
(o que, custos com ou sem ingredientes, extras e taxa de app, margem,
resultado). A conta passou de markup sobre o custo para margem sobre a venda,
em `src/lib/tools/pricingWizard.js`. A nova coluna `produtos.taxa_plataforma`
(migration `20260925100000`, 0–35%) só é usada pela planilha: a margem e o
preço sugerido descontam a taxa. Vendas, PDV e relatórios ignoram a coluna.
A migration foi aplicada com `db query` mais `migration repair`, porque o
banco compartilhado já tem a `20260925114017` do ZeloChat, que não está no
repo. Por isso o `db push` fica bloqueado até alguém trazer essa migration
para cá. A calculadora pública `/precificacao` não mudou e continua usando
markup.

## Sessão 2026-09-24 — Vídeos reais na home e tooling Remotion (não deployado)

`tools/landing-video` é um projeto Remotion isolado (package.json próprio, fora
do build/check/vitest do app) que monta clipes da landing a partir de
gravações reais da conta demo: moldura de celular/navegador, câmera com zoom
nos toques via `events.json`, ripple, legendas cinéticas, trechos parados
acelerados e cartão final. `capture/` faz login na demo via `DEMO_EMAIL` /
`DEMO_PASSWORD` do ambiente; `scripts/` tem render-all, probe e
check-device-bounds; capturas brutas e node_modules ficam fora do git. Como
regravar/renderizar está no README do tool.

Na home, `ProductVideo.svelte` carrega o MP4 do formato do visitante (9:16 no
celular, 16:9 no desktop) só quando o bloco chega perto da tela, pausa fora
dela, respeita `prefers-reduced-motion` (fica o poster) e dispara
`marketing_video_started {video, format, page}` uma vez por vídeo. Sai a demo
clicável do Zelinho com dados ilustrativos; entram os vídeos reais de venda,
fiado e Zelinho respondendo. `data-track-section` e os placements de CTA
continuam intactos. Commits `c77a75d` e `4328ac1`. Nenhum dos dois foi
deployado.

## Sessão 2026-09-24 — Relatórios: corrida entre preset de período e caixa (não deployado)

Trocar de preset (ou de caixa) enquanto o carregamento anterior ainda estava
em voo deixava a última resposta a chegar vencer: dava para somar o bruto de
"Últimos 30" com as despesas de "Hoje" e mostrar a receita líquida errada.
Novo `createLatestOnly()` em `src/lib/utils/latestOnly.js` (testes em
`tests/latestOnly.test.js`) guarda cada chamada por identidade;
`periodoDespesas` passa a ser zerado junto com os demais estados, e o spinner
do modo período passa a seguir `periodoLoading`. Commit `a67f995`, não
deployado.

## Sessão 2026-09-24 — R$ em formato pt-BR nas telas operacionais (não deployado)

Troca de `toFixed(2)` ("R$ 21358.50") por `formatMoney`/`formatMoneyNumber`
("R$ 21.358,50") e percentuais com vírgula — só na exibição; inputs, payload e
exports PDF/Excel seguem como estavam. Cobre `BarChart`, `DonutChart`,
`gestao/despesas`, `gestao/pessoas` e `relatorios` (`c00d203`), e
`ModalPagamento`/`ModalSucesso` — subtotal, total, troco, taxa/líquido de
plataforma, multi-pagamento e o botão "Confirmar R$ 44,00" (`3b5918f`).
`docs/CODE_REVIEW.md` registrou a pendência P3 antes do fix (`6097382`); a
mesma P3 segue aberta para `mesas/[id]`, `gestao/caixa` e outras telas.
Nenhum dos três commits foi deployado.

## Sessão 2026-09-24 — Prints novos da conta demo na landing (não deployado)

`static/images/screenshots` trocou capturas antigas por prints atuais da
conta demo "Balcão do Zelo" (frente de caixa com comanda, financeiro com
despesas, clientes com fiado, recorte de KPIs do topo mobile, despesas), todos
com dados fictícios e R$ em pt-BR; a legenda do topo mobile passou a dizer "30
dias" e a OG image da home usa o print novo. Commit `7372efd`, não deployado.

## Sessão 2026-09-24 — Gerente: dia da semana por extenso na narrativa (não deployado)

`evidence.weekday` é 0-6, mas o template interpolava o número direto, gerando
"abaixo da média das últimas 5 4" (e domingo, 0, caía até em "datas
equivalentes"). Novo `weekdayLabel` em `src/lib/gerente/weekdays.js`,
compartilhado entre `src/lib/gerente/greeting.js` e
`src/lib/server/intelligence/narrative.js`; testes em
`tests/intelligence.narrative.test.js`. Narrativas já gravadas em
`business_signals` mantêm o texto antigo até serem regeradas. Commit
`dc8fde8`, não deployado.

## Sessão 2026-09-24 — Landing: robô fora do topo, copy nova e topo mobile (não deployado)

Três commits em sequência na home pública. `17c9965`: no mobile o topo perdeu
o selo "O gerente da sua loja", ganhou título menor, preço logo abaixo do CTA
e um recorte legível da tela financeira real no lugar do mascote (72% dos
visitantes mobile não passam de 1/4 da home); desktop ganhou a linha de preço
abaixo dos botões. `2d0946f`: copy nova "Você vende. O Zelo cuida do resto.",
em tom "sem frescura", falando do balcão e não do produto vendido, cobrindo
hero, selos, prova, funcionalidades, Zelinho, público, preços e FAQ — o FAQ
passa a dizer que não precisa emitir nota fiscal para usar e que a NF-e está a
caminho, sem prometer data nem "1 clique"; JSON-LD FAQPage sincronizado com o
FAQ visível, title/meta/OG e rodapé atualizados, `data-track-section` e
placements de CTA intactos. `1afd414`: o hero desktop troca o Zelinho 3D por
um print real do painel (sem o CSS/animação do robô); a OG image da home usa
o título novo; `zelinho-hero-transparent.{svg,webp}` saem do repo (sem
referências restantes em src/static/e2e). Nenhum dos três foi deployado.

## Sessão 2026-09-24 — Analytics: marketing_section_viewed na home (não deployado)

Novo evento dispara uma vez por seção quando o topo dela entra nos 60% de
cima da tela, com `section/order/total_sections/page`
(`src/lib/marketing/sectionViews.js`, testes em `tests/sectionViews.test.js`).
O scroll % do `$pageleave` não dizia quais blocos foram lidos; isto dá a linha
de base antes do redesenho mobile que veio nos commits seguintes. Commit
`2307371`, não deployado.

## Sessão 2026-09-24 — Auth: Google OAuth escondido no navegador in-app do Instagram/Facebook (não deployado)

O Google bloqueia OAuth em WebViews de app (`disallowed_useragent`). 255 de
277 visitantes mobile da home chegam pelo navegador do Instagram, e nenhum
cadastro veio de lá em 30 dias. `src/lib/inAppBrowser.js` detecta o WebView;
nesses navegadores o formulário de e-mail vira o caminho principal e o Google
desce para uma linha discreta com "abrir no navegador" (intent do Chrome no
Android, copiar link no iOS), em `/cadastro` e `/login`. Eventos novos:
`inapp_browser_detected`, `inapp_open_browser_clicked`. Testes em
`tests/inAppBrowser.test.js`. Commit `42b4389`, não deployado.

## Conta demo para prints/vídeos

Existe em produção a conta `demo-prints@zelopdv.com.br` (empresa "Balcão do
Zelo", `user_id a9bca05e-b649-4f04-82d4-a0c82c592009`), com dados 100%
fictícios, usada para gerar prints e vídeos da landing. A assinatura está
gravada como `status active`, plano bundle com mesas+menu, sem Stripe — por
isso ela conta no MRR/assinantes do admin-dashboard (~R$ 198/mês) até ser
removida. Os crons de onboarding, expire-trials e nudge não a selecionam. O
Zelinho Gerente roda para ela no cron diário (WhatsApp desligado). Credenciais
não ficam no repo: os scripts de `tools/landing-video/capture` usam
`DEMO_EMAIL`/`DEMO_PASSWORD` do ambiente.

## Depois do deploy

Comparar no PostHog 2 semanas antes x depois: `marketing_trial_clicked` por
placement, `marketing_section_viewed` por seção, `marketing_video_started`
por vídeo, e o funil do Instagram (`inapp_browser_detected` →
`signup_submitted` method=email → `trial_started`).

## Sessão 2026-09-25 — Wizard de produto e taxa de app na planilha

O formulário rápido saiu da planilha. O botão `+` agora abre
`PricingWizardModal.svelte`, com a entrevista de 5 passos da calculadora antiga
(o que, custos com ou sem ingredientes, extras e taxa de app, margem,
resultado). A conta passou de markup sobre o custo para margem sobre a venda,
em `src/lib/tools/pricingWizard.js`. A nova coluna `produtos.taxa_plataforma`
(migration `20260925100000`, 0–35%) só é usada pela planilha: a margem e o
preço sugerido descontam a taxa. Vendas, PDV e relatórios ignoram a coluna.
A migration foi aplicada com `db query` mais `migration repair`, porque o
banco compartilhado já tem a `20260925114017` do ZeloChat, que não está no
repo. Por isso o `db push` fica bloqueado até alguém trazer essa migration
para cá. A calculadora pública `/precificacao` não mudou e continua usando
markup.

## Sessão 2026-09-24 — Planilha de preços em /ferramentas/precificacao

A página logada `/ferramentas/precificacao` trocou a calculadora (wizard) por
uma planilha de preços, `src/lib/components/tools/PricingSheet.svelte`. A
calculadora continua só na página pública `/precificacao`. O dono informa
nome, custo, venda e margem desejada (padrão 60%), e o sistema calcula CMV,
margem, lucro por unidade, preço sugerido e status (na meta, abaixo, prejuízo,
incompleto). As fórmulas ficam em `src/lib/tools/pricingSheet.js`, com testes
em `tests/pricingSheet.test.js`.

A planilha lê e escreve direto em `produtos`:
- `custo_unitario` e `preco` são as colunas que já existiam;
- `margem_desejada` e `na_precificacao` vêm da migration
  `20260924120000_produtos_precificacao.sql`, já aplicada no banco vinculado.

O que isso significa na prática:
- Editar a venda na planilha muda o preço cobrado no caixa. Por isso a primeira
  edição de venda em cada sessão pede confirmação.
- O form "Adicionar produto" cria um produto de verdade no catálogo, sem
  categoria.
- "Importar do meu cadastro" liga `na_precificacao` nos produtos escolhidos.
  Pizzas ficam de fora.
- "Tirar da planilha" só desliga a flag; o produto não é apagado.
- Subusuário sem `produtos.gerenciar` vê a planilha só para leitura.

Validação:
- `npm test`: 2149 testes passam.
- `npm run check`: 0 erros.
- Build: os bundles saíram, e o adapter falhou só no EPERM conhecido do
  Windows.
- E2E manual na conta demo: todos os 8 cenários da
  planilha passaram em 1280px e 390px, e os dados de teste foram limpos.

## Sessão 2026-09-24 — Conteúdo GEO, leva 1 (branch `feat/content-wave-1`)

PostHog: o ChatGPT é a origem que traz cliente; anúncio não gerou cadastro em
duas semanas. Esta leva investe no que os assistentes citam. Blog: capa e
figuras WebP geradas pelo Codex (`npm run blog:images`, manifesto em
`scripts/blog-images.manifest.json`, constantes em `src/lib/blog/images.js`),
"Resumo rápido" (`tldr`), tabelas, callouts, og:image e JSON-LD por post. Os
11 posts antigos foram revisados (FAQ, links internos, taxas de delivery
conferidas nas fontes oficiais) e há 4 posts novos, mais capa/resumo no post
iFood 2026 do Cursor. Novas páginas `/para-acaiterias`, `/para-pizzarias`,
`/para-food-trucks`, `/para-marmitarias`, `/vs-consumer`, `/vs-kyte` (preços
conferidos nos sites oficiais em 2026-09-24). `src/app.html` deixou de emitir
og/twitter padrão, que duplicavam as tags de toda página (a padrão vinha
primeiro); páginas sem tags próprias usam `SocialMeta.svelte`. Plano editorial:
`docs/marketing/BLOG_PLAN.md`.

Domínio: desde 2026-09-24 o canônico é `zelopdv.com.br` e o `www` responde
308 para ele (antes era o inverso, com 307). `scripts/indexnow.mjs` voltou a
usar `SITE_URL` para sitemap e `keyLocation`; a nota abaixo sobre www está
superada.

## Sessão 2026-09-24 — Admin: preflight CORS redirecionado

O envio de WhatsApp em `/communications` falhava antes de alcançar o handler:
o dashboard chamava `https://www.zelopdv.com.br/api/admin/...`, e a Vercel
respondia ao `OPTIONS` com `308` para o domínio sem `www`. Navegadores não
seguem redirect de preflight. O domínio canônico `https://zelopdv.com.br`
responde `204` com `Access-Control-Allow-Origin` para o admin.

O dashboard agora centraliza a origem da API em `src/lib/apiBase.js` e todas as
chamadas administrativas usam o domínio canônico, incluindo Comunicação,
Usuários, Assinaturas, Indicações, Analytics e logs. Regressão direcionada:
`tests/admin.apiBase.test.js` (2/2); `npm --prefix admin-dashboard run check`
sem erros ou avisos. O build local gerou os bundles, mas o adapter Vercel
encerrou no `EPERM` conhecido do Windows ao criar symlink. Deploy de produção
`dpl_4spv56ZtRL26qemiHCa7rseu9KTG` ficou Ready e foi promovido em
2026-09-24; `admin.zelopdv.com.br` serve o novo bundle com origem canônica.
Nenhum WhatsApp real foi disparado durante a validação.

## Sessão 2026-09-24 — GEO: IndexNow full ping + post iFood 2026

IndexNow de produção confirmado: `https://www.zelopdv.com.br/indexnow-key.txt`
responde 200 com a chave pública (sem rotação). O apex `zelopdv.com.br` faz
307 → www, então `scripts/indexnow.mjs` passou a buscar o sitemap e a
`keyLocation` em www, mantendo `host=zelopdv.com.br` (é o host das `<loc>`).
Ping completo do sitemap live: **38 URLs**, lote único, **HTTP 200**.

Post editorial #1 do plano GEO publicado em
`/blog/taxa-ifood-2026-como-calcular` (fonte: pacote GEO 23/09; faixas de taxa
do iFood atribuídas e com ~; FAQ estruturado + tabelas). Sitemap dinâmico e
`llms.txt` passam a incluir o slug automaticamente.

## Sessão 2026-09-23 — GEO: visibilidade em ChatGPT/Gemini/Perplexity

Branch `feat/geo-ai-visibility` implementa a parte técnica de
[[GEO_PLAN_2026-09]] (`docs/marketing/`). Fatos públicos agora saem de uma fonte
única: `src/lib/seo/site.js` (URL, empresa, builders JSON-LD com ofertas
derivadas de `pricing.js`) e `src/lib/data/productFacts.js` (público, o que faz,
o que não faz, `FACTS_UPDATED_AT`). `llms.txt`, `llms-full.txt` e `robots.txt`
(com grupos explícitos para crawlers de IA) são rotas prerenderizadas; os
arquivos em `static/` foram removidos. Nova página `/sobre`; blog aceita
`updatedAt` e `faq` por post; rota `/indexnow-key.txt` + `npm run indexnow`
(exige `INDEXNOW_KEY` na Vercel).

Atribuição: `src/lib/attribution/aiSources.js` detecta ChatGPT, Perplexity,
Gemini, Copilot, Claude, DeepSeek, Meta AI e Grok por referrer ou
`utm_source`; o servidor recalcula `ai_source` (não confia no cliente) e envia
`$set_once` no `user_registered`. O onboarding pergunta "Como você conheceu o
Zelo?" no estado de chegada (opcional; grava `heard_from` no
`user_metadata` + evento `acquisition_self_reported`). A home mostra
`AiReferralBanner` para quem chegou por IA. Insights PostHog com tag `geo`:
`09f33k0o` (visitantes por IA/semana) e `vIptaqqU` (cadastros com origem IA).

Validação: `npm test` 2.071 passaram / 3 skips; `npm run check` 0 erros (1
aviso CSS preexistente); build SvelteKit gera os quatro arquivos prerenderizados
(o adapter termina no `EPERM` de symlink conhecido do Windows). Banner e `/sobre`
conferidos no navegador (desktop e 375px). Pendências fora do código: verificar
o domínio no Bing Webmaster Tools, definir `INDEXNOW_KEY`, rodar o painel
`docs/marketing/GEO_PROMPT_PANEL.md` e as frentes de conteúdo/menções do plano.

## Sessão 2026-09-23 — Mesas, cozinha, Pedidos e fechamento

Correções de cozinha, entrega e reabertura publicadas em `ea54944`. A integração
financeira QR foi publicada em `9529924` e `a7ce26d`; Vercel Production está
Ready nos domínios do ZeloPDV. Migrations aplicadas ao banco vinculado:
`20260923012557_mesa_qr_item_observations`,
`20260923150000_mesa_qr_comanda_materialization` e
`20260923160000_mesa_qr_coupon_allocation`.

No fluxo manual da Mesa 1 em localhost, o item com observação apareceu na
cozinha, avançou por preparo/pronto e fechou a comanda com pagamento de cartão
registrado no PDV (venda de teste #128, R$ 2,50); “Entregue à mesa” levou o
pedido a `delivered` sem segunda venda. Não houve transação real no adquirente.
Recarregar uma mesa fechada não reabre comanda. Após cancelar uma comanda vazia
gerada durante a investigação, o banco confirmou Mesa 1 `livre` e zero comandas
abertas; o mapa exibiu 10 livres/0 ocupadas.

No QR `table_order`, as linhas aceitas agora são materializadas em
`comanda_itens`, preservando observação por produto e vínculo ao pedido
canônico; o estoque não é baixado duas vezes. Pedidos pendentes bloqueiam o
fechamento, cancelamento aceito remove somente linhas QR vinculadas, e cupons
alocam o desconto em centavos entre as linhas, dividindo quantidade quando
necessário para fechar exatamente o total do cardápio. Smoke test transacional
com rollback confirmou duas notas diferentes no mesmo produto, desconto de
R$ 1,01 sobre R$ 10,00 (comanda de R$ 8,99), preservação de uma linha manual,
cancelamento QR e bloqueio de pedido pendente. Todo fixture foi revertido; não
foi criada comanda de teste persistente. O checkout QR não foi disparado pela
interface para evitar criar um pedido real.

Validação: `npm run check` sem erros (1 aviso CSS preexistente em Relatórios),
33 testes direcionados passaram, `npm run verify:migrations` confirmou
107/107 baseline, 59/59 versões remotas e zero classificações desconhecidas.
Suite completa de antes da integração QR: 2018 passaram/3 skips.


## Sessão 2026-09-22 — Instalação PWA no Chrome Android

Correção local para a instalação do ZeloPDV: o HTML SSR agora publica o link
do manifesto via `pwaInfo`; os ícones 192×192 e 512×512 foram gerados do
favicon atual e declarados como `any maskable`. O manifesto também informa
`pt-BR`. E2E verifica o link e os PNGs.

Commits `6b8db24` e `e7dbfb7` publicados em `main`; Vercel Production ficou
Ready em 2026-09-23 UTC. Verificação live: homepage 200 com link para
`/manifest.webmanifest`, manifesto 200 (`pt-BR`) e ícones PNG 192×192/512×512
em 200 com dimensões corretas.

Validação local após integrar `origin/main`: `npm run check` — 0 erros (1 aviso
CSS preexistente); `npm test` — 2.015 passaram / 3 skips; E2E no `vite preview`
— 2/2. O gate Linux do GitHub (`35804106973`) passou: checks, 2.015 testes,
verificadores de migrations/iFood e build Vercel. O build local no Windows ainda
encerra no `EPERM` conhecido do adapter ao criar symlink. Homologação em Android
físico ainda pendente.

## Sessão 2026-09-22 — Bem Servido: iFood ausente em Relatórios

Diagnóstico somente leitura no projeto vinculado: o pedido iFood #4539 está
`delivered`, mas não tinha linha em `vendas`. A Bem Servido possuía 31 pedidos
iFood entregues sem venda materializada (R$ 1.215,44). Relatórios agrega
`vendas.canal_origem`, por isso não exibia iFood.

Causa no código e no schema live: `materialize_ifood_sale_v1` usa
`search_path = ''`, enquanto o trigger `set_numero_venda` consultava `vendas`
sem schema e não tinha `search_path` próprio. A inserção falhava; o handler
registrava o evento como processado mesmo se a materialização best-effort falhasse.

Migration `20260923003028_fix_ifood_sale_materialization.sql` qualifica
`public.vendas` no trigger e reconcilia idempotentemente pedidos iFood
entregues da Bem Servido sem `client_sale_id`. Aplicada ao banco vinculado em
2026-09-23 UTC: os 31 pedidos foram materializados, totalizando R$ 1.215,44,
e não há mais entregas sem venda. A tela do pedido iFood deixou de exibir o
bloco “Contato do cliente”, número 0800 e localizador, conforme pedido.

Validação local: `npm test` 2012 passed / 3 skipped; `npm run check` 0 erros / 1
aviso preexistente (`.card-panel` em Relatórios); localhost respondeu 200 e
renderizou no Chrome. O build local chegou ao bundle final, mas o adapter
Vercel falhou ao criar symlink por `EPERM` do Windows; o CI Linux executa esse
mesmo build.

Plantão 22/09: os 7 dead-letters (3 nas últimas 24h) eram
`DELIVERY_DROP_CODE_VALIDATION_SUCCESS`. O iFood avisa que o código de
entrega foi aceito; isso não muda o status do pedido. O handler colocava o
aviso em quarentena por código desconhecido. Agora entra em
`IFOOD_INFORMATIONAL_EVENT_CODES` e encerra como processado, no mesmo caminho
de `DELIVERY_DROP_CODE_REQUESTED`.

O comando `verify_delivery_code` com `IFOOD_HTTP_400` era um código numérico
de 4 dígitos recusado pelo iFood. O pedido depois ficou `CONCLUDED` /
`delivered`. O corpo do POST já segue o contrato `{ code }`. Sem mudança nesse
envio.

Rollout 22/09 19:00 UTC: commit `7935962` na `main`, Dokploy rebuildou o
`ifood-worker` (container novo, `/health/ready` 200). Os 7 dead-letters desse
evento voltaram para a fila e o worker marcou os 7 como `processed`. O RPC
`admin_replay_ifood_event_v1` quebrava com `status` ambíguo; migration
`20260922190438` qualifica a tabela. Um id inexistente agora devolve
`not_replayable`.

## Sessão 2026-09-21 — Analytics P0/P1/P2 (landing → trial → first sale)

Implementado no working tree (sem commit) o pacote aprovado pós-auditoria
PostHog/landing. Sem redesign de UI.

- **P0 identity**: `identifyPostHogUser` faz alias seguro do anon id + identify
  com e-mail; OAuth callback também identifica.
- **P0 OAuth acquisition**: `/auth/callback` envia `zelo_acquisition` para
  `/api/auth/oauth-registered`; `user_registered` ganha utm_*/landing/referrer
  e metadata (paridade com signup e-mail).
- **P0 CTA + UTM**: helper `trackSignupCta` / `getSignupHref` em
  `src/lib/marketing/signupCta.js`; CTAs de trial em home, header
  (desktop/mobile), proof, pricing, final, `/para-*`, `/extensoes`
  (hero/final **e** cards/seções de addon), `/vs-*`, contato,
  `/precificacao`. First-touch no href `/cadastro?...`.
  Auditoria 2026-09-21: fechou buracos P0 em cards/seções de
  `/extensoes` e CTA marketing da calculadora. Superfícies
  secundárias: `/pascoa` (pascoa_*), `/indica/[codigo]`
  (indica_*), link “Criar conta” em `/login` (login_criar_conta).
- **P1 signup**: `signup_started` no mount de `/cadastro`;
  `signup_submitted` {email|google} no submit e no GoogleAuthButton.
- **P1 first_sale person profile**: migration forward
  `20260921180000_posthog_first_sale_person_profile.sql` —
  `$process_person_profile: true` em `enqueue_event`.
- **P2**: StartTrial pixel/CAPI com `metaEventId` compartilhado;
  `product_created` em gestao/produtos. **Pulado**: scroll/section/FAQ
  viewing amplo, session replay, feature flag de CTA mobile (infra não
  trivial) — só instrumentação `header_mobile`.

## Sessão 2026-09-19 — iFood: erro amigável em confirmar entrega

Pedido Bem Servido #1596 (Nayana): `verify_delivery_code` fechou
`failed_terminal` com `IFOOD_HTTP_CLIENT` (4xx sem status). Agora:

1. Transport grava `IFOOD_HTTP_{status}` (ex. 412/400) + `response.httpStatus`.
2. Código inválido (`valid:false`) → `IFOOD_DELIVERY_CODE_INVALID`.
3. PDV mapeia `errorCode` → texto amigável específico (sem códigos tech).
4. Banner some se o pedido já estiver `delivered` (Portal).
5. Copy do 412 deixa claro que **não é demora de fetch** — pré-condição;
   próximo passo = Portal do Parceiro.

Ops #1596: concluir no Portal. Deploy PDV + **redeploy ifood-worker** para
códigos novos nas próximas falhas.

## Sessão 2026-09-19 — Zelinho: catálogo completo, finanças estimadas e playbook de crescimento

O Zelinho Gerente passou a ter repertório de consultoria de vendas/marketing e
deixou de limitar respostas a ações pré-definidas. O prompt separa fatos dos
dados da empresa, hipóteses e recomendações; pode sugerir ZeloMenu, Instagram,
WhatsApp, QR code, combos, adicionais, promoções por horário/dia e testes com
métrica, sem exigir busca externa.

O registro `produtos.custo_unitario` é opcional e alimenta
`resumo_financeiro`, que calcula faturamento, despesas registradas, taxas,
custo conhecido, resultado registrado, lucro estimado, margem estimada e
cobertura dos custos. O agente informa que registros incompletos podem não
refletir a realidade e não chama uma conta sem custos de lucro líquido real.

O catálogo do agente agora pode ser listado por página com filtros, editado,
publicado/retirado do ZeloMenu, cadastrado em lote e limpo com
prévia/confirmação owner-scoped. Produtos sem
histórico ou dependências abertas são excluídos; produtos já vendidos,
presentes em comandas, pedidos online ou configurados como pizza são arquivados operacionalmente
(ocultos no PDV e pausados no ZeloMenu) para preservar relatórios. Caixa,
vendas concluídas e recebimento de fiado continuam sem ferramentas de escrita.

Validação local pendente nesta sessão: o clone Windows não expõe `node`/`npm`
no PATH, portanto os testes Vitest/check precisam ser executados em ambiente
com Node 24 antes do deploy. Migração nova:
`20260919160000_gerente_product_cost.sql`.
Operações destrutivas em lote usam a RPC transacional
`gerente_excluir_catalogo` da migration
`20260919160001_gerente_catalog_bulk_ops.sql`, que revalida vendas e mantém
produtos históricos como arquivados.
Os dez cenários de uso do plano estão registrados em
`tests/gerente.goldenPrompts.test.js` como contrato de ferramentas,
confirmação e linguagem mínima.

## Sessão 2026-09-19 — Supabase connector: history reconcile

Erro `Remote migration versions not found in local migrations directory`:
50 versões só no remoto. Alinhado: 25 renomes de timestamp (mesmo SQL, id
remoto), 25 markers `*_remote_snapshot.sql`, e
`migration repair --status applied` em `20260911110000` (schema já tinha
os objetos). Histórico synced 158/158. Detalhe em
`docs/operations/MIGRATION-HISTORY-RECONCILIATION-2026-09-19.md`.

## Sessão 2026-09-19 — Mesas: empilhar itens + gate online

Feedback Seu Munhoz: itens saíam em linhas separadas. Causa: Mesas
roteava escrita por `offlineContext.enabled` (true após zero-config mesmo
online). Corrigido para `isOfflineWriteActive()`; path offline ainda
agrupa produto igual à RPC.

## Sessão 2026-09-19 — iFood: som de campainha

Chegada de **qualquer pedido novo** na fila toca
`static/sounds/ifood-arrival.mp3` (campainha) no PDV `/app/pedidos`. Mesmo
asset no ZeloChat (`public/sounds/ifood-arrival.mp3`) na Produção.

## Sessão 2026-09-19 — Mesas: drag no mapa + ordem natural

Mapa `/app/mesas`: toque abre comanda; arrastar (filtro Todas) grava
`mesas.mapa_ordem` sincronizado na loja. Sort compartilhado em
`mesasSort.js` (números 1…N, depois nomes; mapa usa `mapa_ordem`).
Migration `20260919145000_mesas_mapa_ordem`.

## Sessão 2026-09-19 — iFood: moldura circular + pill

Pedido iFood na fila/cozinha (`OrderSourceBadge`) e na Produção do
ZeloChat (`IfoodChannelBadge`) mostra o logo em círculo **e** a pill
`iFood #displayId`. Asset: `static/ifood-logo.png` / `public/ifood-logo.png`.

## Sessão 2026-09-19 — Bem Servido almoço: P0+P1 no código

RCA: `docs/integrations/ifood/BEM_SERVIDO_LUNCH_RUSH_RCA.md`.

Fechado no repo (e RPC no banco ZeloPDV):

1. ZeloChat não auto-imprime `source=ifood`.
2. PDV `/app/pedidos` toca dois tons em iFood `pending_review` novo.
3. Pedido manual grava `fulfillment.deliveryAddress` + taxa (bairro único,
   match no endereço, ou taxa digitada).
4. Aceite/avanço iFood no Chat chama `enqueue_ifood_order_command_v1`.
5. Em rota MERCHANT: intent `verify_delivery_code` (código do cliente /
   localizador). Constraint+RPC aplicados no projeto `xnnjyrblpvsqrtsshawa`.

Ainda precisa **commit + deploy** `zelopdv` (Vercel), `zelochat` (Dokploy)
e **redeploy do `ifood-worker`**. Conexão Bem Servido continua `paused`
até a 2ª via de papel sair do ar.

IA digitando o pedido depois de “Pedir por aqui” ficou de fora: mudar o
planner aqui é decisão de produto (risco de montar pedido errado).

## Sessão 2026-09-19 — Bem Servido: almoço iFood + Chat (RCA)

Pedido iFood **entrou** (8 `source=ifood` CONCLUDED). A titular reclamou
no turno: não aceita no ZeloChat, fica em rota sem concluir, imprime duas
vezes, PDV mudo, IA não monta texto, pedido manual sem taxa e “é retirada”.

RCA: `docs/integrations/ifood/BEM_SERVIDO_LUNCH_RUSH_RCA.md`.

Conexão `c0f6d2b1` **paused**, `print_owner=external`. Não resumir até
cortar auto-print do Chat em iFood.

P0 aberto: (1) Chat ignora `print_owner` e reimprime iFood; (2) PDV sem
som; (3) manual grava `fulfillment.address` + `deliveryFee: 0`, UI lê
`deliveryAddress`. P1: Chat não fala o command API (zero `confirm` no
banco); fila iFood `out_for_delivery` é `kind: none` (sem conclude).

## Sessão 2026-09-18 — iFood: avisos worker/token na UI (Bem Servido)

Causa: conexão Techne `6bdbbe5d` (app de teste) ainda `active` no app
Zelopdv. Poll em batch → iFood **403** “Some polling merchants are not
authorized” → nenhum `recordPollSuccess` → UI “worker não iniciou” /
“token inválido”.

Fix: Techne `revoked`; reconciler (`fedefca`) retenta poll por merchant
quando o batch falha; Bem Servido já com `last_poll_at`/`last_token_at`
frescos (worker). Redeploy Dokploy do worker.

## Sessão 2026-09-18 — Relatórios: cockpit calmo (tokens)

Cores decorativas de Relatórios (KPIs rainbow, chips purple/rose, sky
hardcoded) trocadas por tokens (`--accent*`, `--status-*`, `--chart-*`).
Swatches de pagamento/canal usam `var(--chart-*)` na UI; hex resolvido
só em `src/lib/theme/chartColors.js` para PDF/canvas.

## Sessão 2026-09-18 — Relatórios: filtro Canal de origem

O select “Canal de origem” só recortava a lista de cupons (caixa) e o card
de estornos — KPIs/pagamentos/produtos ficavam globais e o filtro parecia
morto. Agora escopa também Receita/KPIs, formas de pagamento, produtos,
taxas, delivery e export; cards “Vendas por Canal” continuam com todos os
canais (comparativo). Gaveta/sangria/despesas sem dimensão de canal:
gaveta usa dinheiro do caixa inteiro; despesas do período saem do líquido
quando há filtro de canal.

## Sessão 2026-09-18 — numero_caixa por empresa

`caixas.numero_caixa` é contador sequencial por `id_usuario` (como
`vendas.numero_venda`), com backfill por `data_abertura` e trigger
`set_numero_caixa` na abertura. O `id` serial global permanece só como PK/FK.
Relatórios, export PDF/Excel e recibos de movimentação passam a exibir
`#numero_caixa` (empresa nova começa em `#1`), nunca o id global.

## Sessão 2026-09-18 — UX Pessoas (padrão Produtos)

`/gestao/pessoas` alinhada ao padrão de Produtos: form fixo saiu do layout;
criação/edição em `ModalPessoa`; header com "Nova pessoa"; FAB mobile `+`;
busca por nome/contato + chips de tipo; cards no mobile / tabela no desktop;
contador filtrados vs total. Exclusão e fiado inalterados.

Deep link: Fichário “Gerenciar pessoa” / “Cadastrar contato” vão para
`/gestao/pessoas?editar=<id>` e abrem o modal da pessoa; ao fechar, a query
é limpa com `replaceState`.

## Sessão 2026-09-18 — Zelinho: botões mortos + abas unificadas

Causa: `Button` (Svelte 5 runes) só encaminha `onclick` via `restProps`;
`on:click` legado não chegava ao DOM. Corrigido em semana / WeekNav /
preferências. UX: `GerenteTabs` compartilhado em Gerente, Resumo semanal e
Preferências (sem BackLink confuso). Links de sinais →
`?aba=historico#data` com scroll.

Badge `9+` da sidebar: avisos de `business_signals` com `read_at` null
(não mensagens). Antes contava o histórico inteiro e só baixava com
interação no card. Agora conta só o dia do briefing, marca esses avisos
como lidos ao abrir a aba Briefing, e o ícone do nav passou de `Radar`
para `Sparkles` (padrão IA em DESIGN_PATTERNS).

Botão WhatsApp do Resumo semanal: dispara via
`POST /api/gerente/semana/send-whatsapp` (ZeloChat → telefone pareado
ou `empresa_perfil.contato`), sem abrir `wa.me`.

## Sessão 2026-09-18 — iFood oficial (homolog 60/60 + cutover de credenciais)

Relatório `report.pdf` do Developer Portal: **CONCLUDED**, **60/60 (100%)**,
app homologada `zelopdv`, protocolo **POLLING**, merchant de teste Techne
`6bdbbe5d-…`. Cutover feito **sem versionar segredos**:

| Superfície | Antes | Depois |
| --- | --- | --- |
| Dokploy `ifood-worker` (`nARDI-HdMP6OO0HyBhxuE`) | client prefix `684b69e5` (app teste C) | prefix `cbfb1f1f` (Zelopdv centralizado) |
| Vercel `zelopdv` Production + Preview | `IFOOD_CLIENT_*` do app teste | `IFOOD_CLIENT_*` do Zelopdv |
| `.env.local` | ausente / teste | Zelopdv (`cbfb1f1f…`) |
| Worker flags | adapter/inbox/commands `1` | mantidas |
| Intervalo poll | `" 60000"` (espaço à esquerda) | `60000` normalizado |
| Storage `logos/homolog-tmp/` | 12 prints | **0** (limpo) |

Health pós-redeploy: live `200 serving`, ready `200 fresh_probe`. Deploy
Vercel prod aliased em `https://www.zelopdv.com.br`.

Módulos no portal Zelopdv: **Order + Events + Merchant** marcados.
Permissões: ainda **nenhum merchant autorizado** no app oficial — pedido
manual “Pedir autorização” para a loja teste retornou “Erro inesperado”
(loja de teste provavelmente amarrada ao app de teste). Conexão ativa no
RPC de polling ainda aponta para `6bdbbe5d-…` (token antigo do app teste).

**Próximo passo operacional:** reautorizar loja(s) no **app Zelopdv** via
Portal do Parceiro / wizard **Conectar iFood** no PDV (não reusar token do
app de teste). Depois: smoke de presença + 1 pedido ponta a ponta com as
credenciais oficiais.

## Sessão 2026-09-18 — iFood: root cause + desbloqueio Bem Servido

**Root cause real:** merchant ID errado no Zelo (`4e29e9a3-…`) vs Portal
(`d848b8aa-…` = Bem Servido, CNPJ 59.316.452/0001-20). JWT já tinha
`d848b8aa:order|events`; `/status` 403 porque **Merchant não homologado**
(só Order/Events). Ticket iFood **#33599767** (Homologação Merchant).

**Feito:** DB connection Bem Servido → `merchant_id=d848b8aa…` + `active`;
adapter passa a aceitar grant JWT Order/Events quando `/status` 403;
discover usa JWT se `GET /merchants` = `[]`. Relatório:
`docs/integrations/ifood/ROOT_CAUSE_PERMISSIONS_API_GAP.md`.

## Sessão 2026-09-18 — iFood discover: nome longo no portal

**Bem Servido:** autorização **Ativo** no Developer Portal, mas a loja não
aparecia no wizard — `nome_exibicao` = “Bem Servido” e o iFood usa nome
completo (“Bem Servido forno e fogão…”). `discoverMerchants` exigia match
exato pós-normalização.

**Fix** (`2c3d7c2`): prefixo seguro — candidato começa com o nome Zelo + espaço
(só se o nome Zelo tem ≥2 palavras ou ≥12 chars). Testes em
`ifood.setup-wizard.test.js`. Deploy prod → validar “Já autorizei — atualizar
lista” na conta Bem Servido.

## Sessão 2026-09-18 — UX Conectar iFood (portal-first)

Modal **Conectar iFood**: quando a descoberta de lojas vem vazia, o fluxo
prioriza autorizar no Portal do Parceiro + “Já autorizei — atualizar lista”;
Merchant ID ficou só na seção **Avançado**. `GET /connection` passa
`partnerPortalUrl` sempre.

## Sessão 2026-09-18 — merge `codex/ifood-mvp` → `main` (PR #44)

Fronteira: publicar a UI iFood em produção via PR #44 (ainda draft).
Conflito com `main` resolvido em `0af0488`. Suite local verde
(1920 passed / 3 skipped, check 0/0, ledger 71 forward). CI Engineering
gates + Vercel verdes. `mergeable=MERGEABLE`, `mergeStateStatus=CLEAN`.

Próximo passo de produto após o merge: voluntária com loja real no iFood
para validar o picker de descoberta (nome normalizado). Evidência Bem Servido
→ fix de prefixo em `discoverMerchants` (commit `2c3d7c2`).

### Re-check produção (2026-09-18, projeto `xnnjyrblpvsqrtsshawa`)

Medido agora, não o snapshot de 17/09:

- Conexão Téchne `6bdbbe5d-…` `active`, `last_poll_at` fresco
- `zelo_orders` `source=ifood`: **7** (2 `delivered`, 5 `cancelled`)
- `vendas` `canal_origem=ifood`: **1** (id 19217, R$27, 2026-09-17)
- `order_commands` / `event_inbox` / `order_refs` / `product_mappings`: **0**
  (histórico `ifood_internal` sumiu após testes de “excluir configuração”
  com cascade; vendas e `zelo_orders` sobreviveram)

Badge de origem e wiring PDV→comando existem no código
(`OrderSourceBadge`, `ifoodCommandsClient`). Gate SQL
`IFOOD_ORDER_REQUIRES_COMMAND` está no stream (#46).

### Também no `main` desta semana (já no branch após o merge)

- Polish do coachmark da primeira venda (Spec A–B, PR #40) — detalhe abaixo
- Admin churn scoring false positives (PR #38) — detalhe abaixo
- Ativação da primeira venda reforçada (PR #39) — detalhe abaixo

---

# Tasks 1–21 + worker live+ready (GO parcial)

## Handoff — 2026-09-17 (poll→inbox ligado; latência de 1 ciclo corrigida)

Dois commits e uma migration aplicada em produção. Snapshot abaixo é de
**2026-09-17**; o re-check de 2026-09-18 está no topo deste arquivo.

### 1. Reconciler poll→inbox ligado (`b075032`, PR #37)

`IFOOD_WORKER_PROCESS_INBOX` só consumia linhas que já existiam em
`event_inbox` — nada pollava o iFood. `workers/ifood/index.js` agora monta
`createIfoodReconciler` e passa como hook `reconcile`, gated só em
`IFOOD_WORKER_ENABLE_HTTP_ADAPTER`, que já é fail-closed: sem
`IFOOD_CLIENT_ID` + `IFOOD_CLIENT_SECRET` o adapter é `null`, logo não há
poll nem ACK.

`workers/ifood/supabaseRepository.js` ganhou os três métodos do reconciler:

| método | RPC |
| --- | --- |
| `listConnectionsForPolling` | **nova** `list_ifood_connections_for_polling_v1` |
| `enqueuePolledEvent` | **existente** `enqueue_ifood_webhook_event_v1` |
| `recordPollSuccess` | **nova** `record_ifood_poll_success_v1` |

O reuso do RPC de webhook é deliberado: ele já resolve a conexão por
`merchant_id` e já devolve `inserted`/`duplicate`/`unknown_merchant`, então
polling e webhook compartilham **um** caminho de insert e **uma** constraint
de idempotência. Nada é acked que o repositório não confirmou como
persistido.

### 2. Migration `20260917050000_ifood_worker_polling` — aplicada em prod

Aplicada no Supabase `xnnjyrblpvsqrtsshawa` e **validada executando**, não só
criando (`CREATE FUNCTION` só faz syntax-check do corpo plpgsql):

- `list_ifood_connections_for_polling_v1` retorna a conexão ativa
- `record_ifood_poll_success_v1` devolve `updated` e carimba
  `last_poll_at` / `last_token_at` / `worker_heartbeat_at`
- probe de escrita feito com `raise exception` proposital para abortar a
  transação — nenhum sinal falso de liveness persistido
- path `unknown_merchant` ok, sem write
- ACL confirmada: `anon` e `authenticated` = **false**; `service_role` = true

Polling cobre `active`/`degraded`/`paused`, nunca `pending` ou `revoked`.
Timestamps são monotônicos (`greatest`), então worker atrasado ou com clock
torto não envelhece uma conexão.

### 3. Ordem do ciclo corrigida (`efb6df3`, PR #41)

`runCycle` rodava `processInbox` **antes** de `reconcile`. Como `reconcile`
escreve `event_inbox` e `processInbox` lê, um evento pollado no ciclo N só
era projetado no ciclo N+1 — um `intervalMs` inteiro de espera morta por
evento, por construção.

Evidência em produção, nos dois pedidos de teste, com o default de 300s:

| pedido | `received_at` → `processed_at` |
| --- | --- |
| `25b0aa10-3626-4025-a3bb-d511304be0a8` | 16:50:18.024 → 16:55:19.656 = **5m01.6s** |
| `6031f97b-36c2-4b6d-b061-05d8d9bbe423` | 17:28:11.099 → 17:33:12.321 = **5m01.2s** |

Ponta a ponta no `6031f97b`: PLACED 17:25:42 → visível no PDV 17:33:12
(**7m29s**), e `CANCELLATION_REQUESTED` chegou 30s depois. A janela de
aceite acabava antes de haver operador para agir — era isso que bloqueava o
gate de Product, não a duração do pedido de teste.

Ordem nova: `probe → notifyHealth → reconcile → processInbox →
processCommands → evaluateHealth`. Teste de regressão fixa a sequência e foi
verificado falhando na ordem antiga.

### Estado medido em produção (2026-09-17 ~17:54Z)

- Polling **ativo**; `last_webhook_at` = `null` → os 6 eventos do inbox
  vieram **todos de polling**, nenhum de webhook
- `event_inbox`: 6 eventos, 2 pedidos, todos `processed`, `attempts: 1`
- `order_refs` / `zelo_orders`: 2 pedidos, ambos `source=ifood`, ambos
  `cancelled`, `sale_id` null
- `order_commands`: **0** · `vendas` com `canal_origem='ifood'`: **0**
- `product_mappings`: **0 no total** — ninguém validou ainda se um pedido
  aceito materializa `vendas`; possível segundo bloqueio logo adiante

### Pendente

- **Redeploy do `ifood-worker`** para o fix de ordem entrar em vigor
- Opcional, dobra o ganho: `IFOOD_WORKER_INTERVAL_MS=60000` (o reconciler já
  faz clamp do piso de 30s do provider; `readyMaxAgeMs` se re-deriva em
  `config.js`, sem risco de `stale_probe`)
- Wiring accept/reject do PDV → enfileirar confirm/cancel: **não landou**
- Gap de UI (lista do PDV mostrar origem `ifood`): não verificável por SQL
- `codex/ifood-mvp` → `main`: ainda não mergeado


## Handoff — 2026-09-17 (imagem worker: MODULE_NOT_FOUND)

Redeploy Dokploy do worker iFood quebrava no boot: `orderNormalizer.js`
importa `src/lib/finance/paymentMethods.js`, mas a imagem só copiava
`workers/ifood` + `src/lib/server/ifood`. Container `exit(1)` com
`MODULE_NOT_FOUND` — isso bloqueava o redeploy das credenciais shadow
Developers.

Correção mínima: `workers/ifood/Dockerfile` passa a copiar
`src/lib/finance/paymentMethods.js` no mesmo path relativo; o
`Dockerfile.dockerignore` libera `src/lib/finance/` + o arquivo. Sem flags
de ciclo, sem secrets, sem mudança de runtime além de o graph de import
resolver. Fail-closed continua. **Ainda GO parcial.**

## Handoff — 2026-09-17 (flags de ciclo; GO ainda parcial)

Bootstrap do worker agora **pode** ligar inbox / commands / adapter HTTP,
mas só com flags explícitas (default **off**, fail-closed):

- `IFOOD_WORKER_PROCESS_INBOX=1`
- `IFOOD_WORKER_PROCESS_COMMANDS=1`
- `IFOOD_WORKER_ENABLE_HTTP_ADAPTER=1` (exige `IFOOD_CLIENT_ID` +
  `IFOOD_CLIENT_SECRET`; sem o par o adapter fica null e os hooks
  default de inbox/commands não sobem)

Dokploy **não** tem essas flags hoje. Sem GO completo. Shadow/piloto/soak
e merchant sandbox continuam pendentes. TTL de ready permanece
`readyMaxAgeMs > intervalMs` (600s / 300s).

## Handoff — 2026-09-17 (readyMaxAge > interval; sem stale_probe ocioso)

Bug live: após o probe de produção, `/health/ready` ia a 200 `fresh_probe` e
depois virava **503 `stale_probe`** até o próximo ciclo do worker. Causa:
intervalo default **300_000 ms** e `readyMaxAgeMs` default **90_000 ms** —
o probe só é gravado no ciclo, então ~4 min de cada janela de 5 min
ficavam stale com deps saudáveis. Host
`ifood-worker-ellizg-90c105-2-24-66-12.sslip.io`: live 200 `serving`, ready
503 `stale_probe`.

Correção: default `readyMaxAgeMs` = **600_000** (interval + slack 300_000).
`loadIfoodWorkerConfig` deriva ou auto-bumpeia quando
`readyMaxAgeMs <= intervalMs`. Probe continua não mutante
(`claim_ifood_events_v1` + `INVALID_CLAIM_ARGUMENTS`). Sem migrations.
**Ainda GO parcial.** Shadow/piloto/soak e `IFOOD_CLIENT_*` pendentes.

Ready 200 **não** fica “para sempre”: só enquanto o último probe saudável
for mais novo que `readyMaxAgeMs`. Com defaults coerentes, idle com deps
saudáveis não deve mais cair em `stale_probe`.

## Handoff — 2026-09-17 (Dokploy live+ready 200 após probe)

Redeploy do commit de probe (`b576c9a`) no Dokploy **verificado live**.
Decisão vigente: **GO parcial (schema + worker live+ready)**. **Não é GO
completo.**

- Host: `ifood-worker-ellizg-90c105-2-24-66-12.sslip.io`
- App Dokploy: `ifood-worker` (`ifood-worker-ellizg` / `nARDI-HdMP6OO0HyBhxuE`)
- `GET /health/live` → **200** `{"status":"ok","reason":"serving"}`
- `GET /health/ready` → **200** `{"status":"ready","reason":"fresh_probe"}`
  (antes: 503 `dependencies_unavailable`)
- Probe: PostgREST `claim_ifood_events_v1` com args inválidos;
  `INVALID_CLAIM_ARGUMENTS` sem claim de inbox

**Ainda não operacional:** o bootstrap default **não** liga `processInbox`,
commands nem adapter HTTP iFood. Envs opcionais `IFOOD_CLIENT_ID` /
`IFOOD_CLIENT_SECRET` **não** definidas. Sem merchant/sandbox atribuído.
Shadow, uma loja piloto e soak continuam pendentes.

Registro canônico: `docs/projects/IFOOD_MVP_PILOT.md`. Ops:
`docs/operations/IFOOD.md`.

**Branch:** `cursor/ifood-task-12-cdb9`

## Handoff — 2026-09-17 (probe de produção para `/health/ready`)

Causa do ready 503 no Dokploy: `main()` sempre subia
`createUnreadyWorkerDependencies()`. Com `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, o bootstrap agora monta
`workers/ifood/supabaseRepository.js`. `probeDependencies()` chama
`claim_ifood_events_v1` com `p_limit=0` e `p_lease_seconds=0`; a RPC
rejeita com `INVALID_CLAIM_ARGUMENTS` **antes** de `FOR UPDATE` / claim,
sem roubar inbox. Rede/timeout/auth continuam fail-closed. Sem as duas
envs, o caminho unready permanece. Sem migrations novas e sem GO completo.

Redeploy no Dokploy **já evidenciado** no handoff live+ready acima.
Evidência HTTP anterior (processo no ar, ready 503) fica no handoff
Dokploy abaixo.

**Branch:** `cursor/ifood-task-12-cdb9`

## Handoff — 2026-09-17 (Dokploy ifood-worker)

Worker **processo no ar** no Dokploy. **Não é GO completo.** Decisão vigente
na época deste handoff: **GO parcial (schema + worker process live)** —
supersedida pelo handoff live+ready 200 no topo.

Registro canônico: `docs/projects/IFOOD_MVP_PILOT.md`. Ops: host e health em
`docs/operations/IFOOD.md`.

**Evidência (HTTP, 2026-09-17):**
- Dokploy projeto **ZeloPDV**, app `ifood-worker` (`appName` `ifood-worker-ellizg`)
- GitHub `kdo-vini/zelopdv` branch `cursor/ifood-task-12-cdb9`; Dockerfile
  `workers/ifood/Dockerfile`, context `.`
- Host: `ifood-worker-ellizg-90c105-2-24-66-12.sslip.io` (Let's Encrypt ligado;
  TLS pode ainda estar assentando)
- Envs **só por nome** (sem valores): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `IFOOD_WORKER_HOST`, `NODE_ENV`.
  Opcionais `IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET` **não** definidas.
- Supabase `xnnjyrblpvsqrtsshawa`
- Docker build OK; container **Docker-healthy** (`HEALTHCHECK GET /health/live`)
- `GET /health/live` → **200** `{"status":"ok","reason":"serving"}`
- `GET /health/ready` → **503** `{"status":"not_ready","reason":"dependencies_unavailable"}`
  (evidência **antes** do probe de produção e do redeploy; causa: unready factory)

**Não feito (ainda vigente):** shadow, loja piloto, soak.

**Bloqueios para GO completo (ready 200 já verificado após redeploy):**
1. Ligar ciclos reais (`processInbox` / commands / adapter HTTP) + merchant/sandbox
2. Shadow → piloto → soak → sign-off GO pleno

## Handoff — 2026-09-17 (owner autorizou apply)

Owner respondeu **“Autorizo”**. Executado:

1. **Migrations iFood Tasks 12–19 aplicadas** no projeto Supabase
   `xnnjyrblpvsqrtsshawa` (ZeloPDV). Tasks 1–11 já estavam aplicadas.
2. Verificação: 27 RPCs `*ifood*`, `vendas.canal_origem`,
   `admin_ifood_connections_overview_v1()`.
3. **Depois desta autorização:** deploy Dokploy + redeploy do probe
   evidenciado no handoff live+ready (live 200 e ready 200). Shadow,
   loja piloto e soak continuam pendentes.

Registro canônico: `docs/projects/IFOOD_MVP_PILOT.md` (decisão
**GO parcial — schema + worker live+ready**; não GO completo).

## Handoff — 2026-09-17 (após Task 21)

MVP de **código** fechado nas Tasks 1–20. Task 21 registrou decisão
**NO-GO** em `docs/projects/IFOOD_MVP_PILOT.md`: nenhuma migration/deploy/
shadow/piloto real sem autorização explícita do owner.

**Branch:** `cursor/ifood-task-12-cdb9`  
**Último commit de código de qualidade:** Task 20  
**Commit desta task:** `docs: record iFood MVP pilot decision`

**Para um futuro GO o owner precisa autorizar, nesta ordem:**
1. Apply das migrations forward iFood no projeto vinculado
2. `docker build` + deploy do worker (digest + envs por nome)
3. Shadow → loja piloto → soak → sign-off GO

Ver runbook `docs/operations/IFOOD.md` e checklist no doc de piloto.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 20)

Estado após Task 20 (qualificação para piloto):

1. Este arquivo — bloco abaixo + handoff Task 19.
2. Plano `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real Task 20.
3. Runbook `docs/operations/IFOOD.md` — seção gate automatizado.
4. Próxima task: **Task 21** (shadow/piloto/GO|NO-GO) — **não aplica migration
   nem deploy sem autorização explícita do owner**.

**Estado do branch:** `cursor/ifood-task-12-cdb9`.
**Task 20 commit:** `test: qualify iFood MVP for pilot`.

**Validado:**
- `tests/ifood.resilience.test.js` — 12 verdes.
- `npm run verify:ifood` — exit 0.
- `npx playwright test tests/e2e/ifood-mvp.spec.js --project=ifood-mvp` — 3 verdes.
- `docker build` — **skip**: CLI Docker ausente neste ambiente (infra),
  documentado; não é skip de invariante de domínio.

**O que mudou:**
- E2E mock, resilience, `scripts/verify-ifood-worker.mjs`, script
  `verify:ifood`, step CI em `engineering.yml`, projeto Playwright
  `ifood-mvp`.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 19)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 18).
Estado após Task 19:

1. Este arquivo (`docs/CURRENT.md`) — bloco Task 19 abaixo, mais o bloco
   "Handoff ... após Task 18" logo em seguida.
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real da
   Task 19 (`## Task 19: Criar observabilidade, suporte e controles de
   incidente`).
3. `docs/operations/IFOOD.md` — runbook operacional (novo).
4. Próxima task: **Task 20** (qualificar MVP para piloto — E2E, resilience,
   `verify:ifood`, gate CI) — ver plano.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commit mais recente antes desta task: Task 18 `feat: add self-service iFood
setup wizard`. **Task 19 commitada nesta sessão** como `feat: add iFood
operations console`.

**Estado validado nesta sessão:**
- Suíte alvo da Task 19 (`api.admin-ifood` + `ifood.operations`): 2 arquivos /
  11 testes verdes.
- `npm run check`: 0 erros, 0 warnings.
- `npm --prefix admin-dashboard run check`: 0 erros, 0 warnings.

**O que mudou de fato:**
- Migration local (não aplicada):
  `supabase/migrations/20260917040026_ifood_admin_operations.sql` com cinco
  RPCs `service_role`-only para overview cross-tenant, kill switch por
  `connectionId`, replay de inbox/comando (mesma linha) e listagem de
  reprocessáveis. Verification
  `supabase/verification/ifood_admin_operations.sql` revisada, não executada.
- `admin-dashboard` ganhou client service-role
  (`src/lib/server/supabaseAdmin.js`), repositório RPC
  (`ifoodAdminRepository.js`), serviço puro (`ifoodOperations.js`), rotas
  `GET /api/ifood/connections` e `POST /api/ifood/actions`, página `/ifood` e
  item de nav **iFood Ops**. Super-admin obrigatório; payload sanitizado;
  replay rejeita `payload`/`eventId` do browser; auditoria grava
  `admin_email` (NOT NULL).
- Runbook `docs/operations/IFOOD.md` + symlink no vault; nota de prep em
  `docs/INCIDENTS.md`.

**Próximo passo real (Task 20):** E2E com adapter mock, fault injection,
script `verify:ifood` e gate CI — ver `## Task 20: Qualificar o MVP completo
para piloto` no plano. Task 21 continua bloqueada para mutações de produção
sem GO explícito do owner.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 18)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 17).
Estado após Task 18:

1. Este arquivo (`docs/CURRENT.md`) — bloco Task 18 abaixo, mais o bloco
   "Handoff ... após Task 17" logo em seguida.
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real da
   Task 18 (`## Task 18: Criar wizard progressivo em Perfil > Integrações`).
3. Próxima task: **Task 19** (observabilidade, suporte e controles de
   incidente no admin dashboard) — ver plano; pre-read obrigatório de
   `CLAUDE.md` e `CODE_REVIEW.md` antes de tocar `admin-dashboard/`.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commit mais recente antes desta task: Task 17 `feat: add self-service
iFood connection APIs`. **Task 18 commitada nesta sessão** como `feat: add
self-service iFood setup wizard`.

**Estado validado nesta sessão:**
- Suíte alvo da Task 18 (`ifood.setup-wizard` + `profileUtils` +
  `api.ifood-connection` + `ifood.connection-schema` +
  `ifood.connection-print-owner-schema`): 5 arquivos / 77 testes verdes.
- `npx vitest run` completo: 231 arquivos / 1663 testes verdes (3 skips
  pré-existentes, não relacionados).
- `npm run check`: 0 erros, 0 warnings.

**O que mudou de fato:**
- `src/lib/integrations/ifoodSetup.js` (novo) — máquina de apresentação
  **pura** (sem `fetch`/Supabase/SvelteKit) que deriva um dos seis estados
  do design doc (`Não conectado`/`Aguardando autorização no
  iFood`/`Configuração necessária`/`Ativo`/`Atenção necessária`/`Pausado`)
  a partir da resposta já sanitizada de `GET /api/integrations/ifood/connection`
  (+ opcionalmente `GET /health`). Mapeamento `active`+`unhealthy` =
  "Configuração necessária" vs `degraded` = "Atenção necessária" é uma
  decisão desta task, documentada e testada, porque o design doc nomeia os
  seis estados mas não fixa a regra exata. Também expõe
  `availableIfoodActions`, `describeIfoodConnectionError` (todo erro HTTP
  vira frase em PT-BR, com contagem exata em `active_orders_present`) e
  textos estáticos de mapping/print-owner.
- **Desvio do plano — nova migration** para fechar o passo "escolher
  responsável pela impressão" do wizard (gap já registrado no Resultado
  real da Task 13: a Task 17 só tinha leitura de `print_owner`, nenhuma
  escrita): `supabase/migrations/20260917040500_ifood_connection_print_owner.sql`
  (local, não aplicada) com `set_ifood_connection_print_owner_v1`, mesma
  blindagem das RPCs da Task 17. Verificação transacional em
  `supabase/verification/ifood_connection_print_owner.sql` (revisada,
  não executada — sem Docker/Postgres local). Teste estático de schema em
  `tests/ifood.connection-print-owner-schema.test.js`.
- `connectionService.js` ganhou `repository.setPrintOwner()` e
  `service.updatePrintOwner()` (mesma autorização/elegibilidade das outras
  rotas; nunca sujeito ao gate de "pedidos ativos"). `PATCH
  /api/integrations/ifood/connection` agora despacha por formato do corpo:
  `{ printOwner }` vai para `updatePrintOwner`, `{ action }` continua no
  `updateConnectionStatus` já existente — os 25 testes da Task 17 em
  `tests/api.ifood-connection.test.js` continuam verdes sem alteração.
- Dois componentes novos: `IfoodSetupWizard.svelte` (modal **burro**, só
  renderiza `derived` e emite eventos de intenção — nunca chama `fetch`,
  nunca simula autorização concluída, nunca guarda segredo/token em
  `localStorage`) e `IfoodIntegrationCard.svelte` (dono de toda a rede:
  busca status no `onMount`, saúde só quando `active`/`degraded`, esconde o
  card inteiro em `402`/`403`/`503` da primeira consulta em vez de deixar a
  aba num beco sem saída para quem não tem a integração disponível).
- `src/routes/perfil/+page.svelte`: `<IfoodIntegrationCard />` como
  primeiro item da aba Integrações, antes de "Operação offline".
- **Fora do escopo desta task, por decisão deliberada:** a "sugestão de
  vínculo de produto" é só texto estático — a API de mapping (Task 12) é
  por item de pedido, sem modo de listagem em lote, e não havia pedido real
  disponível no wizard para sugerir algo de verdade.

**Próximo passo real (Task 19):** observabilidade, suporte e controles de
incidente no `admin-dashboard/` — ver `## Task 19: Criar observabilidade,
suporte e controles de incidente` no plano.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 17)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 16).
Estado após Task 17:

1. Este arquivo (`docs/CURRENT.md`) — bloco Task 17 abaixo, mais o bloco
   "Handoff ... após Task 16" logo em seguida.
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real da
   Task 17 (`## Task 17: Criar APIs seguras de conexão self-service`).
3. `docs/modules/ACESSOS.md` — seção `Capability integracoes.ifood.gerenciar`.
4. Próxima task: **Task 18** (wizard progressivo em Perfil > Integrações) —
   ver plano; ler `docs/DESIGN_PATTERNS.md` antes de qualquer mudança de UI.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commit mais recente antes desta task: Task 16 `feat: teach Zelinho sales
channel context`. **Task 17 commitada nesta sessão** como `feat: add
self-service iFood connection APIs`.

**Estado validado nesta sessão:**
- Suíte alvo da Task 17 (`api.ifood-connection` + `server.accessControl`):
  2 arquivos / 32 testes verdes. Schema test dedicado
  (`ifood.connection-schema`): 7 testes verdes.
- `npx vitest run` completo: 229 arquivos / 1626 testes verdes (3 skips
  pré-existentes, não relacionados).
- `npm run check`: 0 erros, 0 warnings.

**O que mudou de fato:**
- Nova migration local (não aplicada ao Supabase vinculado):
  `supabase/migrations/20260917030512_ifood_self_service_connection.sql`,
  com três RPCs mecânicas (`get_ifood_connection_v1`,
  `upsert_ifood_connection_v1`, `count_ifood_active_orders_v1`) — desvio
  documentado do plano, que não listava uma migration para esta task, mas
  era estruturalmente necessária: `ifood_internal` não tem exposição
  PostgREST, então não havia outro caminho para ler/escrever
  `ifood_internal.connections`. Toda política (entitlement, capability,
  CSRF/state, "sem pedidos ativos") fica em `connectionService.js`, não no
  SQL. Verificação transacional em
  `supabase/verification/ifood_self_service_connection.sql`, não executada
  (Docker indisponível nesta sessão) mas revisada linha a linha; teste
  estático em `tests/ifood.connection-schema.test.js`.
- `src/lib/server/ifood/connectionService.js` (novo) — serviço puro
  (repositório RPC-only + orquestração), sem `$env`/`supabaseAdmin`, com
  `getStatus`, `startConnection`, `getAuthorizationPrompt`,
  `checkAuthorization`, `updateConnectionStatus` e `getHealth`.
- Três rotas novas: `POST/GET/PATCH /api/integrations/ifood/connection`,
  `GET/POST /api/integrations/ifood/authorization`,
  `GET /api/integrations/ifood/health`. Nenhuma retorna segredo, token ou
  `connectionId` interno; `startConnection` cria a linha `pending` **antes**
  de qualquer confirmação do iFood (requisito da Task 6).
- Capability nova `integracoes.ifood.gerenciar` em
  `src/lib/server/accessControl.js` e `src/lib/accessControl.js`
  (`canManageIfoodIntegration`). Titular sempre pode; subusuário só com a
  capability explícita no cargo — nenhum cargo padrão a recebe hoje (gap
  documentado em `docs/modules/ACESSOS.md`: a UI de Acessos ainda não tem
  um jeito de conceder essa capability a um subusuário).
- `state` de autorização é HMAC determinístico
  (`connectionId:merchantId:pendingSince` com `IFOOD_CLIENT_SECRET`), não
  uma coluna nova no banco — sobrevive a refresh porque é recomputável, e
  fica inválido sozinho quando a conexão sai de `pending` (cobre "replay de
  state") ou passa de 30 minutos (cobre "CSRF/state expirado").
- O fluxo real de autorização self-service do iFood **não está confirmado**
  por documentação oficial (`docs/integrations/ifood/CONTRACT_SNAPSHOT.md`
  já registrava isso antes desta task). `checkAuthorization` reaproveita
  `adapter.connectMerchant()` (já existente desde a Task 1/5) para
  confirmar a autorização, sem inventar nenhum endpoint iFood novo.

**Próximo passo real (Task 18):** wizard progressivo em `/perfil` — ver
`## Task 18: Criar wizard progressivo em Perfil > Integrações` no plano.
Ler `docs/DESIGN_PATTERNS.md` antes de tocar em `perfil/+page.svelte`.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 16)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 15).
Estado após Task 16:

1. Este arquivo (`docs/CURRENT.md`) — bloco Task 16 abaixo, mais o bloco
   "Handoff ... após Task 15" logo em seguida (que por sua vez referencia
   Task 12–14).
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real da
   Task 16 (`## Task 16: Dar ao Zelinho consciência de canal sem PII`).
3. Próxima task: **Task 17** (APIs seguras de conexão self-service do
   iFood) — ver plano; exige pre-read de `CLAUDE.md`, `CODE_REVIEW.md`,
   `docs/BILLING.md`, `docs/modules/ACESSOS.md` e `docs/data/SCHEMA_RLS.md`
   antes de tocar código.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commit mais recente antes desta task: Task 15 `feat: report sales by origin
channel`. **Task 16 commitada nesta sessão** como `feat: teach Zelinho
sales channel context`.

**Estado validado nesta sessão:**
- Suíte alvo da Task 16
  (`intelligence.fetchers` + `intelligence.metrics` +
  `gerente.agent.toolsInsights` + `gerente.ifood-channel`): 4 arquivos / 39
  testes verdes.
- `npx vitest run` completo: 227 arquivos / 1594 testes verdes (3 skips
  pré-existentes, não relacionados).
- Nenhuma migration nova nesta task — `por_canal` é derivado em memória a
  partir de `vendas.canal_origem` (Task 14) e persistido dentro da coluna
  `jsonb` que já existia em `business_daily_snapshots.metrics`.

**O que mudou de fato:**
- `resumoPeriodo` (ferramenta `resumo_periodo` do Zelinho) sempre devolve
  `por_canal` (receita bruta e quantidade por canal), tanto para `hoje`
  (calculado a partir de `vendas` em tempo real) quanto para `ontem`/
  `semana`/`mes` (agregado a partir de `business_daily_snapshots`).
  Aceita um parâmetro opcional `canal` que escopa receita/quantidade/ticket
  médio a um único canal; para `hoje` isso também escopa `mix_pagamentos`
  e `top_produtos` (dado bruto disponível), mas para snapshots históricos
  esses dois campos voltam vazios/zerados quando `canal` é passado — a
  granularidade por canal de mix/produto nunca foi gravada retroativamente
  nos snapshots antigos, e o código não inventa esse dado.
- Snapshots gravados antes desta task (sem `metrics.por_canal`) continuam
  legíveis: caem inteiros no canal `pdv` (mesmo fallback do trigger
  `vendas_default_canal_origem` da Task 14), preservando a soma total.
- O prompt do Zelinho agora explica que o `por_canal` do iFood é
  faturamento bruto operacional (o que o cliente pagou no pedido), não o
  valor líquido que a plataforma repassa — o sistema ainda não calcula a
  comissão do iFood. O Zelinho nunca chama esse número de "lucro".
- Nenhuma ferramenta nova foi criada: `por_canal` viaja dentro da resposta
  já existente de `resumo_periodo`, e nada no payload expõe nome, telefone
  ou endereço de cliente (só `receita_bruta`/`qtd_vendas` por canal).

**Decisão de escopo registrada (ver Resultado real da Task 15 para o
detalhe):** o filtro de canal recorta a lista de vendas do caixa e o card
de Estornos/Cancelamentos; os cards comparativos "Vendas por Canal" somam
**sempre todos os canais** (é o que permite comparar) e não são afetados
pelo filtro. Os KPIs gerais do topo (Receita Líquida, Vendas Brutas, Ticket
Médio, Formas de Pagamento, Produtos Vendidos) continuam somando o
caixa/período inteiro, sem recorte por canal — só a lista de cupons e o
card de estornos mudam com o filtro.

**Próximo passo real (Task 17):** criar as APIs server-side de conexão
self-service do iFood (capability `integracoes.ifood.gerenciar`) — ver
`## Task 17: Criar APIs seguras de conexão self-service` no plano. Exige
matriz RED de autorização (titular, trial, plano superior, subusuário sem
capacidade, merchant de outra empresa, replay de state) antes de qualquer
endpoint.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 15)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 14).
Estado após Task 15:

1. Este arquivo (`docs/CURRENT.md`) — bloco Task 15 abaixo, mais os blocos
   Task 12–14 na seção "Handoff ... após Task 14".
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultado real da
   Task 15 (`## Task 15: Expor vendas iFood nos relatórios existentes`).
3. Próxima task: **Task 16** (dar ao Zelinho consciência de canal sem PII)
   — ler `por_canal` que a Task 15 já calcula em
   `src/lib/finance/salesChannel.js` e reaproveitar a mesma agregação em
   `src/lib/server/intelligence/`.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commit mais recente: Task 14 `feat: materialize iFood sales and reversals`.
**Task 15 commitada nesta sessão** como `feat: report sales by origin
channel`.

**Estado validado nesta sessão:**
- Suíte alvo da Task 15
  (`finance.sales-channel` + `relatoriosLayout` + `reportExports` +
  `finance.reportPaymentPresentation`): 4 arquivos / 30 testes verdes.
- `npx vitest run` completo: 226 arquivos / 1580 testes verdes (3 skips
  pré-existentes, não relacionados).
- `npm run check`: 0 erros, 0 warnings (svelte-check).
- Nenhuma migration nova nesta task — `canal_origem` e `vendas_estornos`
  já existem desde a Task 14; Task 15 é só leitura (SELECT) desses campos.

**Decisão de escopo registrada (ver Resultado real da Task 15 para o
detalhe):** o filtro de canal recorta a lista de vendas do caixa e o card
de Estornos/Cancelamentos; os cards comparativos "Vendas por Canal" somam
**sempre todos os canais** (é o que permite comparar) e não são afetados
pelo filtro. Os KPIs gerais do topo (Receita Líquida, Vendas Brutas, Ticket
Médio, Formas de Pagamento, Produtos Vendidos) continuam somando o
caixa/período inteiro, sem recorte por canal — só a lista de cupons e o
card de estornos mudam com o filtro.

**Próximo passo real (Task 16):** ensinar o Zelinho a responder "quanto veio
do iFood" / "compare iFood com os outros canais" sem PII — ver `## Task 16:
Dar ao Zelinho consciência de canal sem PII` no plano.

## Handoff — integração iFood MVP — 2026-09-16

Trabalho em `codex/ifood-mvp` (retomada Cursor Cloud em
`cursor/ifood-task-12-cdb9`). **Tasks 1–14 concluídas** (contrato/arquitetura,
domínio/normalização, persistência com leases, worker dedicado, adapter HTTP
de produção, webhook assinado durável, processamento da inbox com
retry/dead-letter, projeção canônica em `zelo_orders`, reconciliação/presença,
comandos assíncronos, filas Pedidos/Cozinha, mapeamento progressivo de
produtos com ledger de estoque, coordenação de impressão sem duplicidade, e
materialização de venda operacional + estorno auditável fora do caixa) e a
**revisão de conformidade das Tasks 1–6 (2026-09-16) está fechada** — ver
`docs/superpowers/plans/2026-09-15-ifood-mvp.md`, seção
"Revisão de conformidade das Tasks 1–6 (2026-09-16)" logo após o Resultado
real da Task 6, para o detalhe de cada gap (G1–G6) fechado: harness
multi-arquivo (`-PostMigrationVerification a.sql,b.sql`), prova de
concorrência real nas leases (`scripts/verify-ifood-lease-concurrency.mjs`),
`enqueue_ifood_webhook_event_v1` delegando para `enqueue_ifood_event_v1` em
vez de duplicar o insert, correção da política sobre merchant
desconhecido/`pending` (abaixo), seam test do adapter HTTP contra
`createIfoodIntegration`, e revalidação do container do worker.

**Política corrigida sobre merchant desconhecido (G4):** conexões
`pending`/`active`/`degraded`/`paused` SÃO resolvidas pelo webhook e o
evento É persistido; só `revoked` ou um `merchant_id` que nunca existiu em
`ifood_internal.connections` caem em `unknown_merchant`. A reconciliação
por polling da Task 9 só cobre merchants já conectados — **não** faz
backfill histórico para um merchant que nunca se conectou ao Zelo (fora do
escopo do MVP). Por isso a Task 17 (conexão self-service) agora exige criar
a linha de conexão em `pending` antes de considerar o webhook/polling
daquele merchant ativo, para nenhum evento de um merchant em processo de
conexão ser descartado.

**Produção (2026-09-16, autorizado pelo dono):** migrations
`ifood_mvp_foundation` e `ifood_webhook_enqueue` aplicadas no Supabase
vinculado, com grants/RLS verificados e 277 pedidos preservados; nenhum
worker foi ligado. Adapter HTTP provado ao vivo: leitura (token, merchants,
status 200/403, polling) e ciclo completo com dois pedidos de teste (confirm,
preparo, despacho, pronto, cancelamento e ACK, cada um confirmado pelo
evento). **Webhook real também provado ponta a ponta**, usando um deploy
Preview temporário na Vercel como URL pública (secrets só nesse ambiente,
proteção do preview desligada só durante o teste e religada depois): pedido
de teste entregue por HTTP real com assinatura válida, `202`, e
`unknown_merchant`/`ignored` sem gravar nada (loja de teste sem conexão
cadastrada) — confirmado por leitura direta no Postgres. Webhook desligado ao
final. Homologação depende das Tasks 7–20. Detalhe em
`docs/integrations/ifood/CONTRACT_SNAPSHOT.md` → "Webhook real exercitado
ponta a ponta".

Detalhes completos (assinatura HMAC, ordem de validação, RPCs, contagens de
teste por task) nas seções "Resultado real" de cada task no plano vivo.

**Task 7 do iFood (2026-09-16):** `src/lib/server/ifood/retryPolicy.js`
(backoff exponencial com jitter, determinístico via `random`/`clock`
injetados, base 1s/cap 10min configuráveis) e
`src/lib/server/ifood/inboxProcessor.js` (`createIfoodInboxProcessor` com
`runInboxCycle`) processam a inbox contra um repositório fake injetado
(`claimEvents`/`finishEvent`), puro e sem I/O — nenhum repositório real
Supabase foi criado nem ligado ao bootstrap padrão de
`workers/ifood/index.js`, que segue fail-closed como nas Tasks 4–6; isso
fica para uma task futura. `workers/ifood/runtime.js` ganhou um hook aditivo
opcional (`options.processInbox`), só invocado quando fornecido, sem mudar o
comportamento padrão. Nota de contrato importante: `finish_ifood_event_v1`
(migration aplicada em produção, não modificada) colapsa `terminal`,
`failed_terminal`, `quarantine` e `dead_letter` no mesmo `status =
'dead_letter'` da inbox — o processor repassa o outcome do handler
inalterado e só o `errorCode` distingue a causa depois.

**Task 8 do iFood (2026-09-16):** nova RPC
`public.project_ifood_order_event_v1` (migration
`20260916195009_ifood_canonical_order_projection.sql`, **validada apenas no
harness local descartável, não aplicada no Supabase vinculado**) é o único
lugar que grava `zelo_orders`/`zelo_order_items`/`zelo_order_events`/
`zelo_order_outbox` para um evento iFood — nunca reusa `create_zelo_order`
(cujo whitelist de `source` não inclui `ifood`) nem `transition_zelo_order`
(que faz baixa de estoque via `produtos`/`categorias`, indevida para item
ainda não mapeado). A decisão de aplicar/ignorar/duplicar/conflito terminal
é autoritativa em SQL, travando `ifood_internal.order_refs` e recalculando
o mesmo rank monotônico de `eventPolicy.js`; `additionalFees` é dobrado em
`delivery_fee` e o `total` é sempre recalculado em SQL
(`subtotal + delivery_fee - discount`), nunca copiado do normalizador, para
o `CHECK zelo_orders_total_consistent` nunca poder falhar. `pessoa_id` e
`product_id` ficam sempre `null` (Pessoas e mapeamento de produto seguem
fora do MVP). `src/lib/server/ifood/eventHandler.js` é o `handler` real da
Task 7: curto-circuita os códigos informativos observados ao vivo
(`DELIVERY_DROP_CODE_REQUESTED`, `CANCELLATION_REQUESTED`) e códigos
desconhecidos antes de qualquer chamada de rede, busca o detalhe do pedido
via `getOrderDetail` (novo método aditivo em `createIfoodIntegration.js`,
`receiveEvent` da Task 2 intocado), confere que o detalhe devolvido
realmente descreve o `externalOrderId`/`merchantId` esperado (correção do
coordenador — sem essa checagem um retorno trocado da API gravaria o pedido
errado), e trata `404` do detalhe com retry limitado a 10 minutos contados
do `occurredAt` do evento antes de virar pendência administrativa
(`ORDER_DETAIL_NOT_FOUND_TIMEOUT`). Suíte iFood completa (13 arquivos):
**190/190 aprovados**; `npm run check` 0/0; `npm run verify:migrations`
inalterado. **Achado separado, não relacionado ao iFood:** o harness
descartável tem uma divergência real e pré-existente de `storage_policies`
contra produção (a policy `zelochat-media public read` sumiu); documentado
para o dono decidir, sem impacto nesta task.

**Task 8 do iFood (2026-09-16):** `src/lib/server/ifood/eventHandler.js`
(`createIfoodEventHandler({ integration, repository, retryPolicy, clock })`)
é o `handler(row, context)` que a Task 7's `inboxProcessor.js` já sabia
invocar. Ele resolve o status externo via `contracts.js`, curto-circuita os
dois códigos informativos observados ao vivo
(`DELIVERY_DROP_CODE_REQUESTED`, `CANCELLATION_REQUESTED`, novo export
`IFOOD_INFORMATIONAL_EVENT_CODES`/`isIfoodInformationalEventCode`) para
`processed` sem RPC nem fetch de detalhe, e quarentena qualquer código fora
do conjunto canônico de 7 antes de qualquer I/O. Para um evento conhecido,
busca o detalhe via `integration.getOrderDetail` (novo método aditivo em
`createIfoodIntegration.js`, passthrough de `adapter.getOrder`;
`receiveEvent`/demais métodos da Task 2 não foram tocados), normaliza com
`normalizeIfoodOrder` (Task 2) e chama a única RPC transacional
`project_ifood_order_event_v1` via `repository.projectOrderEvent(...)`
(seam documentado por JSDoc; nenhum repositório Supabase real foi criado,
mesmo padrão adiado das Tasks 4–7).

Decisão de design registrada: o compare-and-set (novo/duplicado/obsoleto/
conflito terminal/avanço) é **autoritativo em SQL only** dentro de
`project_ifood_order_event_v1` — a função tranca `ifood_internal.order_refs`
e depois `zelo_orders` (`for update`) e recalcula a mesma tabela de rank de
7 entradas de `eventPolicy.js` como `CASE` interno. O handler em JS não
duplica esse cálculo contra uma leitura especulativa de `order_refs`: ele só
decide os dois curto-circuitos que nunca chegam à RPC (informativo e código
desconhecido). Isso evita que duas cópias do rank table divirjam
silenciosamente.

Retry de `404` do detalhe do pedido: janela de 10 minutos ancorada no
`occurredAt` do próprio evento (não no `attempts` do worker, que varia com
jitter/reinícios); sem `occurredAt` utilizável, cai para um teto
conservador de 3 tentativas em vez de tentar para sempre. Passado a janela,
`terminal` com `errorCode: 'ORDER_DETAIL_NOT_FOUND_TIMEOUT'` (pendência
administrativa). Outro erro retryable do adapter vira `retryable`; um erro
não-retryable vira `terminal`; a falha da própria RPC vira `retryable` com
`errorCode` genérico (`PROJECTION_RPC_ERROR`), nunca o texto bruto do erro.

Simplificações documentadas na migration
`supabase/migrations/20260916195009_ifood_canonical_order_projection.sql`:
`additionalFees` é somado a `delivery_fee` (sem coluna própria em
`zelo_orders`); `total` é **calculado** em SQL a partir de
`subtotal + delivery_fee - discount` (nunca copiado de `totals.orderAmount`
do payload), o que garante que `zelo_orders_total_consistent` nunca pode
ser violado por arredondamento entre a tolerância de 0.01 do normalizador
JS e a aritmética exata do `numeric(14,2)` do Postgres. `pessoa_id` fica
sempre `null` (Pessoas fora do MVP); `zelo_order_items.product_id` fica
sempre `null` (mapeamento de produto é a Task 12); itens não são
reinseridos numa atualização de status, só na criação.

RED: `npx vitest run tests/ifood.event-handler.test.js
tests/ifood.canonical-projection-schema.test.js --reporter=verbose` falhou
como esperado por módulo/arquivo inexistente (0 testes coletados). GREEN:
mesma suíte, **28/28** (17 do handler + 11 do schema). Suíte combinada
`tests/ifood.event-handler.test.js tests/ifood.canonical-projection-schema.test.js
tests/ifood.domain.test.js tests/ifood.inbox-processor.test.js
tests/ifood.worker-runtime.test.js tests/ifood.contract-fixtures.test.js
tests/ifood.persistence-schema.test.js tests/ifood.webhook-enqueue-schema.test.js
tests/ifood.order-normalizer.test.js tests/onlineOrders.test.js` →
**10 arquivos, 119/119**. `npm run check` → `5874 FILES 0 ERRORS 0
WARNINGS`. `npm run verify:migrations` → `107/107` baseline, `59/59`
remoto, `58` forward. `git diff --check` (via `git add -N` dos 7 arquivos
tocados/novos, depois `git reset`) → limpo. Varredura de LF via `node`
(byte `13`/CR) nos 7 arquivos → nenhum `\r`.

Harness descartável local:
`powershell -ExecutionPolicy Bypass -File scripts/verify-supabase-baseline.ps1
-ApplyForwardMigrations -ExcludeTenantDataSeeds -PostMigrationVerification
supabase/verification/ifood_mvp_foundation.sql,supabase/verification/ifood_webhook_enqueue.sql,supabase/verification/ifood_canonical_order_projection.sql`
→ `exit code 0`, `BASELINE_VERIFIED cutoff=20260813091000`,
`post-migration verifiers passed: 3`. A migration `ifood_canonical_order_projection`
foi validada **somente** no harness local descartável — **não foi aplicada**
ao Supabase vinculado (`xnnjyrblpvsqrtsshawa`); essa aplicação fica a
critério do coordenador após revisão linha a linha.

**Task 9 do iFood (2026-09-16):** `reconciliation.js` agora polla todos os
merchants não revogados, incluindo `pending`, `active`, `degraded` e `paused`,
em lotes de até 1.000 e persiste cada envelope antes do ACK. `inserted` e
`duplicate` podem ser confirmados; `unknown_merchant` permanece sem ACK para
redelivery seguro, e `last_poll_at` só é registrado após polling bem-sucedido.
`connectionHealth.js` aplica fail-closed por merchant com idade padrão de 90s,
bloqueia novos comandos sem esconder pedidos já persistidos e exige token,
heartbeat/poll válido e configuração verde para recuperar. A presença usa
somente o seam injetado `setMerchantPresence({ merchantId, online, signal? })`;
nenhuma rota de escrita real do iFood foi inventada ou ligada. O runtime ganhou
hooks opcionais `reconcile`/`evaluateHealth`, enquanto o bootstrap padrão
continua fail-closed; a validação focada passou 15/15, a combinada passou
123/123 e `npm.cmd run check` terminou em 0 erros/0 warnings.

**Task 11 do iFood (2026-09-16):** pedidos iFood aparecem nas filas de
Pedidos e Cozinha com badge textual, número curto do iFood, relógio de
confirmação 4/6/8 min, estado de sincronização separado do status comercial,
códigos de retirada/entrega, itens sem vínculo e faixa de agendados (entram na
Cozinha só em `preparationStartAt`). Ações iFood viram comandos assíncronos
da Task 10; outros canais seguem em `transition_zelo_order`. O normalizer
passou a ler `delivery.deliveryAddress` e a guardar só nome/telefone/endereço
(sem CPF). Divisão de execução a partir desta task: backend Codex, frontend
Claude. Harness com 6 verificadores iFood verde; 316 testes; check 0/0.

**Task 12 do iFood (2026-09-17, Cursor Cloud):** mapeamento progressivo e
estoque. RPCs novas em `20260917014734_ifood_product_mapping_stock.sql`
(`suggest`/`confirm`/`commit`/`release`), API
`/api/integrations/ifood/product-mappings`, hooks no `eventHandler` após
projeção em `CONFIRMED`/`CANCELLED`. Match exato por `externalCode` só
sugere; nome semelhante é só visual; vínculo manual exige
`produtos.gerenciar` (ou titular). Ledger `stock_commitments` idempotente;
item sem mapping não move estoque; estoque insuficiente não bloqueia o
pedido já projetado. Suíte iFood **328/328**; `verify:migrations` 62 forward.
Harness local e aplicação em produção **pendentes** (sem Docker/`pwsh` neste
ambiente; migration não aplicada ao Supabase vinculado).

**Task 13 do iFood (2026-09-17, Cursor Cloud):** impressão coordenada.
`ifoodPrinting.js` filtra auto-print por `print_owner` (`zelo`/`external`/
ausente) e adia agendados até `preparationStartAt`; runtime global mantém
`deferredIds` sem reservar cedo; `PRINT_OUTCOME_UNKNOWN` sem auto-retry;
ticket mostra display id/códigos iFood. Fallback temporário `resolvePrintOwner
→ 'zelo'` até Task 17/18 expor a conexão. Reimpressão manual em Pedidos
continua livre.

**Task 14 do iFood (2026-09-17, Cursor Cloud):** venda operacional e estorno
auditável. Migration `20260917020813_ifood_sales_and_reversals.sql` adiciona
`vendas.canal_origem` (check `pdv|zelomenu|zelochat|mesa|manual|ifood` +
índice `(id_usuario, created_at, canal_origem)`, backfill via
`zelo_orders.sale_id`/`source`, default `pdv` para histórico sem vínculo) e
`vendas_estornos` (`event_id unique`, `status applied|pending_review`, no
máximo um `applied` por venda via índice único parcial). RPCs
`materialize_ifood_sale_v1`/`reverse_ifood_sale_v1` são `SECURITY DEFINER`,
`search_path=''`, `service_role`-only (mesmo endurecimento da Task 12).
Materialize só age em `source='ifood'`+`status='delivered'`; `id_caixa`
sempre `null`; nunca cria `pessoas`/`fiado_lancamentos`/
`vendas_taxas_plataforma`; `client_sale_id='zelo-order:'||id` garante
idempotência; pagamento `fiado` é sempre coagido para `outro`. Reverse nunca
apaga a venda: `event_id` duplicado ou segunda reversão da mesma venda →
`duplicate`; sem venda materializada → `no_sale`; cancelamento inequívoco →
`status='applied'`; total divergente ou pedido ainda não cancelado →
`status='pending_review'`. `ensure_zelo_order_sale` (`create or replace`)
ganhou branch `source='ifood'` delegando a `materialize_ifood_sale_v1`, mas
esse caminho automático nunca materializa nada de fato (trigger `BEFORE
UPDATE` vê a linha pré-UPDATE); a materialização real é a chamada
best-effort de `eventHandler.js` após a projeção comitar, via
`salesRepository.js` novo (mesmo padrão de `productMappingRepository.js`).
Suíte alvo (`ifood.sales-schema` + `ifood.event-handler` +
`canonicalOrderSales` + `salesCreationRbacSchema`) **42/42 verde**; os dois
últimos ficaram intocados (leem `.ai/migrations/canonical_order_sales_
2026_07_23.sql`, arquivo legado). Harness local e aplicação em produção
**pendentes** (sem Docker/`pwsh` neste ambiente; migration não aplicada ao
Supabase vinculado).

**Produção (2026-09-16, autorizado pelo dono):** as duas migrations novas da
Task 11 — `ifood_order_sync_state` (RPC
`get_ifood_order_sync_state_v1`) e `ifood_projection_display_fields`
(`create or replace` de `project_ifood_order_event_v1` acrescentando o bloco
`fulfillment.ifood`) — foram aplicadas no Supabase vinculado
(`xnnjyrblpvsqrtsshawa`) via MCP, sem os wrappers `begin;`/`commit;` do
arquivo. Grants conferidos: só `service_role` executa as duas funções
(`anon`/`authenticated` sem `execute`). Smoke direto no banco com
`set role service_role; select * from project_ifood_order_event_v1(...)`
usando um `merchant_id` inexistente confirmou `outcome = 'unknown_merchant'`
sem nenhum efeito colateral (nenhuma linha tocada em `zelo_orders` real).
Branch `codex/ifood-mvp` (commit `fc59017`, depois handoff `aa9297d`) enviada
para `https://github.com/kdo-vini/zelopdv`.

**Próximo passo linear:** Task 15 — expor canal de venda nos relatórios.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-17 (após Task 14)

Trabalho retomado nesta sessão a partir do handoff anterior (após Task 13).
Estado após Task 14:

1. Este arquivo (`docs/CURRENT.md`) — blocos Task 12, Task 13 e Task 14 acima.
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — Resultados reais 12–14.
3. Próxima task: **Task 15** (expor canal iFood nos relatórios) —
   frontend/relatórios; ler `canal_origem` já disponível em `vendas`.

**Estado do branch:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`).
Commits: Task 12 `feat: add progressive iFood product mapping`; Task 13
`feat: coordinate iFood order printing`. **Task 14 ainda não commitada** —
mudanças da migration `20260917020813_ifood_sales_and_reversals.sql`,
`salesRepository.js`, `eventHandler.js`, testes e docs ficaram no working
tree para o coordenador revisar e commitar (`feat: materialize iFood sales
and reversals`).

**Estado validado nesta sessão:**
- Task 13 print suites: 5 arquivos / 23 testes verdes.
- Task 14 suíte alvo (`ifood.sales-schema` + `ifood.event-handler` +
  `canonicalOrderSales` + `salesCreationRbacSchema`): 4 arquivos / 42 testes
  verdes.
- Migrations das Tasks 12 e 14 **ainda não aplicadas** em produção; harness
  descartável pendente na máquina do coordenador (sem Docker/`pwsh` neste
  ambiente Linux Cloud).

**Pendências conhecidas, fora do escopo do iFood:**
- O drift de `storage_policies` do harness (documentado para o dono, não é
  bloqueante para o iFood).
- O intervalo padrão de 300s do worker é incompatível com a janela de saúde
  de 90s quando o worker for de fato ligado em produção (documentado, ainda
  não ligado).
- Leitura browser de `connections.print_owner` ainda depende das Tasks 17/18.

**Próximo passo real (Task 15):** expor canal de venda iFood nos relatórios —
ver `## Task 15: Expor vendas iFood nos relatórios existentes` no plano.

## Handoff para retomada externa (Cursor Cloud) — 2026-09-16 (histórico)

Trabalho retomado fora desta sessão a partir daqui. Leia nesta ordem antes de
codar:

1. Este arquivo (`docs/CURRENT.md`) inteiro, principalmente a seção
   "Handoff — integração iFood MVP — 2026-09-16" logo no topo (Tasks 1–10) e
   o bloco "Task 11 do iFood" logo acima (Task 11).
2. `docs/superpowers/plans/2026-09-15-ifood-mvp.md` — plano linear completo,
   21 tasks, uma por commit. A seção **"Divisão de execução (decisão do
   dono, 2026-09-16)"**, logo antes de "Contrato de documento vivo", define
   que **backend é Codex, frontend é quem estiver pegando a sessão** a
   partir da Task 11 — ajuste essa divisão à ferramenta que for usada no
   Cursor Cloud, but mantenha uma única pessoa/agente por commit e não
   misture as duas camadas no mesmo commit sem necessidade.
3. Cada task já executada tem seu bloco **"Resultado real"** preenchido no
   plano — é a fonte de verdade sobre o que foi feito, desvios e por quê.
   Task 11 é a mais recente (`## Task 11: Mostrar iFood nas filas de
   Pedidos e Cozinha`).

**Estado do branch:** `codex/ifood-mvp`, commit `fc59017`, já em
`origin/codex/ifood-mvp` no GitHub (`kdo-vini/zelopdv`). Working tree limpo.
Worktree local em `.worktrees/ifood-mvp` (branch principal do repo é
`main`, não usar `git stash` puro nele — ver aviso de ambiente sobre stash
compartilhado entre worktrees).

**Estado validado nesta sessão:**
- `npx vitest run` da suíte iFood: 23 arquivos / 316 testes verdes.
- `npm run check`: 0 erros, 0 warnings (svelte-check).
- `npm run verify:migrations`: 107/107 artefatos de baseline, 59/59 versões
  remotas, 61 migrations forward.
- Harness descartável (`scripts/verify-supabase-baseline.ps1
  -ApplyForwardMigrations -ExcludeTenantDataSeeds -PostMigrationVerification
  <6 arquivos>`) verde para os 6 verificadores iFood (foundation, webhook,
  projeção canônica, comandos, sync-state, display fields). **Atenção:** o
  harness falha por padrão nesta máquina por um drift de `storage_policies`
  pré-existente em produção (não relacionado ao iFood — falta a policy
  `zelochat-media public read`). Para rodar localmente, é preciso rebaixar
  temporariamente o `throw` correspondente em
  `scripts/verify-supabase-baseline.ps1` para `Write-Warning`, rodar, e
  reverter com `git checkout -- scripts/verify-supabase-baseline.ps1`
  **antes de qualquer commit** — nunca commitar esse bypass.
- Migrations da Task 11 já aplicadas no Supabase vinculado (ver bloco acima)
  com grants e smoke conferidos.

**Pendências conhecidas, fora do escopo do iFood:**
- O drift de `storage_policies` do harness (documentado para o dono, não é
  bloqueante para o iFood).
- O intervalo padrão de 300s do worker é incompatível com a janela de saúde
  de 90s quando o worker for de fato ligado em produção (documentado, ainda
  não ligado).

**Próximo passo real (Task 12):** vínculo de produtos iFood ao catálogo
Zelo e reflexo em estoque — ver `## Task 12: Mapear produtos progressivamente
e controlar estoque` no plano para arquivos, critérios RED/GREEN e comandos
de validação. Seguir o mesmo padrão das
tasks anteriores: testes primeiro, um commit por task, `Resultado real`
preenchido ao final, e nunca editar uma migration já aplicada (criar uma
nova com `create or replace` quando for alterar uma função).

**Task 10 do iFood (2026-09-16):** comandos assíncronos agora entram por uma
rota autenticada, tenant-scoped e sem chamada ao provider no request do
browser. A autorização de subusuários é server-side e segue o mesmo
mapeamento do `transition_zelo_order`: `pedidos.acessar` para confirmar e
despachar, `pedidos.cozinha` para preparo e pronto, e `pedidos.cancelar` para
cancelar. O worker processa leases, registra `accepted_http`, retryable,
terminal ou `expired`, e bloqueia merchants não saudáveis sem chamar o
adapter. A correlação dos eventos marca comandos como `confirmed_event` sem
alterar o pedido otimisticamente; falha nessa correlação não reabre a inbox
porque a projeção já foi commitada. A rota de motivos consulta o iFood apenas
no servidor e devolve somente código e descrição sanitizados. A migração e a
verificação SQL permanecem locais, não foram aplicadas nem executadas no
harness nesta sessão; o próximo passo linear é a Task 11.

## Reparo do replay de migrations ZeloMenu — 2026-09-16

O harness descartável do iFood parava antes da migration da integração, em
`20260911120000_zelomenu_canonical_pause.sql`: o baseline
`20260813091000` não continha `public.zelomenu_modifier_components` nem a
coluna `id_componente` de `public.zelomenu_modifier_option_products`
(SQLSTATE `42703`). Essa dependência foi introduzida no stream do ZeloMenu e
aplicada no banco compartilhado, mas não entrou no stream de replay do PDV.

A migration forward-only
`20260911110000_zelomenu_canonical_modifier_components.sql` recompõe o
contrato antes da pausa canônica: cria a tabela e suas políticas, torna
`id_produto` opcional, adiciona a FK de `id_componente`, preserva preços e
destinos legados, completa links vazios de rollout parcial e valida o CHECK de
exatamente um destino. Ela é segura para o caso em que o contrato já exista.
O timestamp conserva a ordem histórica necessária antes da migration canônica
já aplicada; a migration histórica não foi alterada e nenhum banco vinculado
foi tocado.

Validação verde:

- `npx vitest run tests/zelomenuCanonicalModifierComponentsSchema.test.js tests/ifood.persistence-schema.test.js` — 9/9;
- `npm run verify:migrations` — 107/107 artefatos baseline, 59/59 versões remotas e 56 migrations forward;
- harness completo com `-ApplyForwardMigrations -ExcludeTenantDataSeeds -PostMigrationVerification supabase/verification/ifood_mvp_foundation.sql` — replay chegou à migration iFood, o verificador transacional passou (1 verifier), schema/security e configuração de plataforma permaneceram iguais ao baseline e o lint terminou com exit 0.

## Integração iFood MVP planejada — 2026-09-15

Design de produto e arquitetura aprovado, sem integração habilitada em runtime.
O trabalho está isolado na branch `codex/ifood-mvp` e no worktree
`.worktrees/ifood-mvp`. O plano vivo
`docs/superpowers/plans/2026-09-15-ifood-mvp.md` define 21 tasks estritamente
lineares, uma por commit, iniciando pelo congelamento do contrato efetivamente
liberado ao app de teste do iFood. Cada task deve atualizar o próprio plano e
este arquivo antes de ser concluída. O alerta sonoro genérico permanece uma
dependência separada e o rollout exige shadow, piloto e decisão GO/NO-GO.

Antes do plano, o baseline foi corrigido no commit `2a8df7d`: o teste cliente
de signup ainda esperava o evento removido `user_signed_up`, enquanto o contrato
autoritativo já era `user_registered` no servidor. A suíte integral voltou a
199 arquivos aprovados, 1.212 testes aprovados e 3 skips condicionais.

Task 1 do iFood — snapshot do contrato externo (2026-09-15): concluída. A
conta de teste centralizada comprovou `client_credentials`,
`GET /merchant/v1.0/merchants` e `/status` em `200`, Events v1 polling em
`204` quando vazio, dois eventos `PLACED` e detalhes Order em `200`; a rota
`/order/v1.0/orders:polling` respondeu `404`. A coleção Events v1 confirmou
headers/filtros/envelopes e ACK em lista de IDs únicos; a prova real retornou
seis reentregas dos dois pedidos automáticos, ACK `202` e polling seguinte
`204`. O snapshot sanitizado está em
`docs/integrations/ifood/CONTRACT_SNAPSHOT.md`, com fixtures de quatro
modalidades e eventos terminais sintéticos marcados como não observados. O
teste focado passa 14/14 após RED esperado por 13 falhas causadas por 8
fixtures ausentes. Webhook, comandos, presença granular, `429`/limites e
homologação ainda não foram comprovados; não há integração habilitada em
runtime. IDs, segredos e PII não foram preservados; nenhum pedido adicional
foi gerado deliberadamente para esta entrega. A Task 2 foi executada e está
registrada abaixo.

Task 2 do iFood — núcleo de domínio (2026-09-15): concluída. `contracts.js`,
`eventPolicy.js`, `orderNormalizer.js`, `createIfoodIntegration.js` e o adapter
mock ficam atrás de uma interface pequena com dependências injetadas; não há
I/O ou integração habilitada em runtime. O normalizador cobre os quatro
fixtures sanitizados (entrega iFood, entrega própria, retirada e agendado),
preservando itens, complementos, descontos, totais, pagamento, códigos e
`customerSnapshot` somente no contrato operacional. A projeção não cria campo
`analytics` nem duplica PII. A política é monotônica, trata duplicidade e
inversão, coloca código desconhecido em `quarantine` e permite somente as
exceções terminais explícitas `CANCELLED`/`CONCLUDED`.

RED comprovado: 2 suítes novas falharam por módulos ausentes (0 testes
coletados). GREEN focado: 14/14; GREEN com `tests/onlineOrders.test.js`: 23/23.
`npm test`: 202 arquivos aprovados, 1.240 testes aprovados, 3 skips
condicionais. `npm run check`: 0 erros/0 warnings. A tentativa inicial com
`--runInBand` foi rejeitada por opção não suportada no Vitest e repetida com
sucesso sem essa opção. O commit da task mantém o snapshot/fixtures da Task 1;
webhook, persistência e adapter HTTP seguem para as Tasks seguintes.

Revisão corretiva da Task 2 (2026-09-15, preservando o único commit via
amend): RED específico com o mesmo foco falhou em 14 testes e aprovou 13
(27 listados); GREEN focado + `tests/onlineOrders.test.js` passou em 36/36.
Foram fechados os conflitos terminais sem timestamp posterior comprovável,
validações de dinheiro/quantidade/enums/totais, o mapeamento canônico de
pagamentos e split, a quarentena durável com retry e a deduplicação dependente
do resultado persistente de `appendEvent`. O contrato interno agora usa apenas
`options`; nenhum alias adicional duplica PII ou mantém referências mutáveis.

Task 3 do iFood — persistência privada, identidades e leases (2026-09-15;
replay reparado em 2026-09-16): **concluída no harness SQL descartável.** A
migration criada pela CLI em
`supabase/migrations/20260916023512_ifood_mvp_foundation.sql` adiciona o schema
privado `ifood_internal` com `connections`, `event_inbox`, `order_refs`,
`order_commands`, `product_mappings` e `stock_commitments`. As tabelas têm RLS,
FKs/índices alinhados às filas, chaves idempotentes, limites de payload e erro,
retenção explícita e grants apenas para `service_role`; a constraint canônica
aceita `zelo_orders.source = 'ifood'`. As RPCs de enqueue/claim/finish usam
`SECURITY DEFINER` com `search_path = ''`, validação de `service_role`,
`FOR UPDATE SKIP LOCKED`, leases curtos e CAS no finish. O payload bruto só é
retornado aos workers service-role. A verificação textual faz claims
sequenciais na mesma sessão e não prova concorrência entre workers.

RED estrito: `tests/ifood.persistence-schema.test.js` falhou 5/5 antes do SQL;
GREEN: passou 6/6 após o SQL e o ajuste do fixture de verificação. O teste do
bridge também passa 3/3. `npm run verify:migrations` passou com 107/107
artefatos baseline, 59/59 versões remotas e 56 migrations forward. A
verificação transacional preparada em
`supabase/verification/ifood_mvp_foundation.sql` passou no comando completo
`powershell -ExecutionPolicy Bypass -File scripts/verify-supabase-baseline.ps1
-ApplyForwardMigrations -ExcludeTenantDataSeeds -PostMigrationVerification
supabase/verification/ifood_mvp_foundation.sql` após a bridge descrita acima:
o replay chegou à migration iFood, três enqueues e os asserts transacionais
passaram; claims sequenciais não provam concorrência entre workers. O comando
read-only `supabase db advisors --linked` retornou
`LegacyProjectNotLinkedError`; além disso, advisors do linked não enxergariam a
migration local ainda não aplicada. Nenhuma migration foi aplicada ao banco
vinculado, e nenhum deploy/publicação foi autorizado ou executado.

Task 4 do iFood — processo worker dedicado (2026-09-16): **concluída.**
`workers/ifood/runtime.js` é um módulo Node profundo e injetável, sem imports de
Svelte ou `$env`; roda um único loop aguardado, sem sobreposição, com atraso
abortável, drain de trabalho em voo e erros genéricos sanitizados. Nesta task o
único trabalho é o probe não mutante `repository.probeDependencies()`, que
retorna apenas `{databaseReachable, leaseCapable}`. Não há chamadas HTTP ao
iFood, claims, inbox ou processamento: Tasks 5 e 7 ainda não existem.

O bootstrap real usa deliberadamente uma dependência `false/false`, então o
processo permanece `unready` até que um probe de produção seguro e verdadeiro
seja implementado. O adapter mock da Task 2 não é conectado ao processo real.
`workers/ifood/healthServer.js` mantém liveness 200 enquanto o servidor serve,
mas readiness começa em 503, falha com banco/lease, expira após 90 s sem probe
fresco e cai imediatamente durante shutdown; as respostas são JSON genérico
somente com `status`/`reason`, sem cache, e as rotas aceitam apenas GET/HEAD.

RED: `npx vitest run tests/ifood.worker-runtime.test.js --reporter=verbose`
falhou por módulos ausentes (0 testes coletados). GREEN: a suíte focada passou
13/13. As suítes Task 2/3 e vizinha passaram no comando
`npx vitest run tests/ifood.worker-runtime.test.js tests/ifood.domain.test.js
tests/ifood.order-normalizer.test.js tests/onlineOrders.test.js
tests/ifood.persistence-schema.test.js --reporter=verbose` (5 arquivos,
55/55 testes). `npm run check` passou com 0 erros e 0 warnings.

`npm test -- --reporter=dot` também passou integralmente: 205 arquivos e 1.275
testes aprovados, com 3 arquivos e 3 testes condicionais pulados (208 arquivos,
1.278 testes; 194,23 s).

O container de dois estágios foi validado por
`docker build -f workers/ifood/Dockerfile -t zelopdv-ifood-worker:test .`;
`workers/ifood/Dockerfile.dockerignore` é o ignore específico efetivo para
contexto na raiz (o plano histórico citava incorretamente `.dockerignore`).
`docker run --rm zelopdv-ifood-worker:test node --version` retornou
`v24.20.0`; `docker image inspect` confirmou `USER=node`, CMD exec-form
`node workers/ifood/index.js` e HEALTHCHECK Node `fetch` local em
`/health/live`, independente do banco. Não houve push/deploy/publicação,
mutação no Supabase remoto, nem início das Tasks 5+; também não foi possível
provar integração iFood real porque o adapter HTTP ainda é a Task 5. No smoke
local com envs sintéticas, `/health/live` respondeu 200 e `/health/ready`
respondeu 503 com razão genérica `dependencies_unavailable`, como exigido para
este bootstrap sem probe de produção.

Task 5 do iFood — adapter HTTP de produção (2026-09-16): **concluída.**
`src/lib/server/ifood/http/tokenCache.js` implementa o fluxo centralizado
`client_credentials` contra
`POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token`
(form-urlencoded `grantType`/`clientId`/`clientSecret`), sem duração fixa de
token: o cache lê `expiresIn` da resposta, renova antecipadamente dentro de
uma margem configurável (`minMarginMs`/`marginRatio`, padrão 10% do tempo de
vida com piso de 5s), compartilha uma única busca em voo entre chamadas
concorrentes (single-flight) e expõe `invalidate()` para o retry de `401`.
`src/lib/server/ifood/http/rateLimit.js` só reage a `Retry-After` e
`X-RateLimit-Limit/Remaining/Reset`; nenhum limite numérico por endpoint foi
codificado, pois o snapshot da Task 1 documenta que nenhum `429` real foi
observado. `src/lib/server/ifood/http/request.js` resolve a URL base,
injeta `Authorization: Bearer`, aplica timeout por `AbortSignal` (padrão
8s), faz exatamente um retry após `401` invalidando o token, e usa backoff
exponencial com jitter (`random`/`sleep` injetados) limitado por um
orçamento total (padrão 20s, no máx. 5 tentativas) para `429`/`5xx`/timeout/
erro de rede; `4xx` não retryable falha na primeira tentativa. O erro
sanitizado `IfoodHttpError` expõe somente `status`/`code`/`retryable`/
`retryAfterMs?`, nunca headers, Authorization, `clientSecret`, `clientId`,
token ou corpo da resposta.

`src/lib/server/ifood/adapters/httpIfoodAdapter.js` implementa
`listMerchants`, `getMerchantStatus` (leitura de presença, sem interrupções
nem horários), `pollEvents` (header `x-polling-merchants` com IDs
concatenados por vírgula, `types`/`groups`/`categories` omitidos quando
vazios, `204` vira `[]`), `ackEvents` (deduplica IDs, envia `[{id}]`, decompõe
lotes acima de 10.000 em vários `POST` em vez de rejeitar o lote inteiro),
`getOrder`, `confirm`, `startPreparation`, `readyToPickup`, `dispatch`,
`getCancellationReasons`, `requestCancellation` e `requestOrderAction`
compatível com o seam do adapter mock da Task 2. Toda ação com `202` retorna
`{ orderId, action, accepted: true, status: 'accepted_http' }`, nunca uma
confirmação comercial. Decisão registrada para `getOrder`: um `404` vira
`IfoodHttpError` com `code: 'IFOOD_HTTP_NOT_FOUND'` e `retryable: true` (nunca
`null` nem exceção genérica), para a Task 8 aplicar seu próprio backoff
limitado. IDs de rota são URL-encoded e IDs vazios são rejeitados antes de
qualquer requisição.

`workers/ifood/config.js` ganhou leitura opcional de `IFOOD_CLIENT_ID` e
`IFOOD_CLIENT_SECRET`: as duas devem vir juntas ou nenhuma, o par vira um
`credentials` não enumerável (nunca aparece em `Object.keys`, `console.log`
ou JSON do config) e só um booleano `hasIfoodCredentials` é enumerável.
`workers/ifood/index.js` ganhou a fábrica aditiva
`createIfoodHttpAdapterFromConfig(config, overrides)`, que constrói o adapter
quando as credenciais existem; ela não é chamada pelo bootstrap padrão, o
probe de dependências continua `false/false` e nenhum polling foi ligado ao
loop do worker — isso é escopo da Task 9.

RED: `npx vitest run tests/ifood.http-adapter.test.js --reporter=verbose`
falhou por módulo inexistente (0 testes coletados). GREEN focado: a mesma
suíte passou 22/22 após a implementação mínima (incluindo um ajuste
necessário para o retry de `429` usar o `Retry-After` real em vez de apenas
jitter aleatório). GREEN com vizinhas:
`npx vitest run tests/ifood.http-adapter.test.js tests/ifood.domain.test.js
tests/ifood.worker-runtime.test.js tests/ifood.order-normalizer.test.js
tests/ifood.persistence-schema.test.js tests/ifood.contract-fixtures.test.js`
passou 6 arquivos e 82/82 testes, confirmando que a Task 4 e as tasks
anteriores continuam verdes sem alteração de teste. `npm run check` passou
com 0 erros e 0 warnings (5.860 arquivos). `git diff --check` passou limpo
para os arquivos novos e modificados. Verificação manual de LF confirmou
ausência de `\r` em todos os arquivos tocados.

A suíte de leakage prova que `JSON.stringify`, `String()`, `.message`,
`.stack` e `Object.keys()` do erro nunca contêm `clientId`, `clientSecret`,
o token de acesso, `Bearer` ou `Authorization`. Não houve chamada real ao
iFood, deploy, push de imagem ou mutação no Supabase; todos os testes usam
`fetch` falso injetado. A suíte integral (`npm test`) não foi executada nesta
task, conforme instrução explícita de escopo.

**Revisão corretiva da Task 5 (2026-09-16, antes do commit):** o coordenador
revisou o adapter ainda não commitado e apontou quatro riscos, todos
corrigidos nos mesmos arquivos, sem commit adicional.

1. **POSTs não-idempotentes não reautomatizam falhas ambíguas.** `request.js`
   ganhou `retryUnsafe` por chamada: timeout, erro de rede e `5xx` são
   ambíguos (não se sabe se o iFood processou o pedido), então só são
   reautomatizados quando a chamada é idempotente. Padrão: `true` para
   `GET`, `false` para qualquer outro método. `confirm`,
   `startPreparation`, `readyToPickup`, `dispatch` e `requestCancellation`
   ficam no padrão `false` — uma falha ambígua vira erro imediato
   (`retryable: true`) em vez de reenviar um comando com desfecho incerto
   (ex.: `requestCancellation` em duplicidade); `ackEvents` passa
   `retryUnsafe: true` porque reconfirmar um `id` já processado é
   inofensivo. `401` e `429` continuam retryable para qualquer método, por
   serem respostas explícitas do servidor.
2. **Timeout na busca de token.** `tokenCache.fetchToken` ganhou
   `AbortController`/timeout próprio (`timeoutMs`, padrão igual ao
   transporte, 8s), independente do timeout por recurso — uma busca de
   token travada bloquearia todo chamador do single-flight. Timeout e falha
   de rede mapeiam para o mesmo `IFOOD_AUTH_FAILED` retryable.
3. **Esperas respeitam orçamento e cancelamento.** (a) O atraso de `429`
   (`Retry-After`/backoff) e o de `5xx`/timeout/rede só dormem quando cabem
   no que resta do orçamento; um `Retry-After` de 120s contra um orçamento
   de 20s falha na hora com `retryAfterMs`, sem dormir o tempo todo. (b)
   Toda espera (`rateLimiter.waitForSlot` e o backoff) aceita o `signal` do
   chamador: `rateLimit.js` exporta `abortableSleep(ms, signal)`, usado como
   `sleep` padrão em `rateLimit.js`, `request.js` e no adapter; abortar
   durante uma espera rejeita na hora com `IFOOD_HTTP_ABORTED`
   (`retryable: false`).
4. **`signal` opcional em todo método do adapter.** `httpIfoodAdapter.js`
   aceita `signal` (parâmetro de opções à direita para métodos com id único,
   ou campo dentro do objeto de entrada para `pollEvents`/
   `requestOrderAction`/`requestCancellation`) e repassa a `request()`,
   mantendo a assinatura compatível com o seam mock — nada mudou de posição
   ou tipo nos parâmetros existentes.

Sete testes novos comprovam os quatro pontos (timeout de token; POST
ambíguo não reautomatizado a nível de transporte e a nível de adapter
(`confirm`); ACK ambíguo reautomatizado a nível de transporte e de adapter;
`429` que excede o orçamento sem dormir; aborto durante o backoff). Três
asserções existentes precisaram trocar `toHaveBeenCalledWith(ms)` por
`sleep.mock.calls[0][0]` porque `sleep` passou a receber um segundo
argumento (`signal`); nenhuma asserção comportamental foi enfraquecida.

GREEN pós-correção: `npx vitest run tests/ifood.http-adapter.test.js
--reporter=verbose` passou 29/29 (22 anteriores + 7 novos). `npx vitest run
tests/ifood.http-adapter.test.js tests/ifood.domain.test.js
tests/ifood.worker-runtime.test.js --reporter=verbose` passou 3 arquivos e
53/53 testes. `npm run check` passou com 0 erros e 0 warnings (5.860
arquivos). `git diff --check` passou limpo para os arquivos modificados e
para os novos (via `git add -N` seguido de `git reset`). A verificação
manual de LF não encontrou `\r` em nenhum arquivo tocado, incluindo os dois
documentos.

## Polish do coachmark da primeira venda — 2026-09-17

Product greenlit Spec A–B sobre PR #39, sem expandir o fluxo.

**Spec A:** o helper pós-primeiro-produto deixou de ser overlay no centro da
grade ("Clique no produto acima" + seta invertida + pulse infinito + Entendi
primário). Agora o tile ganha lift + anel sky; a dica cola abaixo do tile
(`top: calc(100% + 8px)`), copy única "Toque no produto para somar na venda",
`ChevronUp` lucide apontando para o tile. Dispensa no `produtoClick`, Entendi
ghost e timeout de 8 s. Um pop; `prefers-reduced-motion` corta a animação.

**Spec B:** Plus lucide só em "Cadastrar primeiro produto". "Ou venda avulsa"
fica sem ícone. Título do vazio permanece "Faça sua primeira venda".

Não muda API/schema/RLS, Menu/Chat, nem auto-add ao carrinho.

## Admin churn scoring false positives — 2026-09-17

Admin analytics `/analytics` mostrava contas ativas pagantes como "quiet"
(alto risco de churn): `sales_30d=0`, `effective_last_seen null`. Product
Lead e Staff Eng confirmaram via Supabase direto que 7 contas tinham
centenas de vendas (Casa dos Salgados ~1135/30d, Fanny Massas ~581/30d,
Bem Servido ~404/30d, etc.). Causa: analytics chamava
`admin_get_users_last_seen`, `admin_get_sales_counts` e
`admin_get_total_sales_value` direto do browser com anon key. As RPCs têm
`SECURITY DEFINER` com `WHERE (auth.role() = 'service_role' OR
is_active_super_admin())`; browser-side sem service_role retorna array
vazio `[]`, frontend mapeia undefined → `sales_30d=0` e `last_seen=null`
para **todas** as contas.

**Corrigido**: endpoint server-side `/api/admin/analytics-data` que autentica
super_admin via JWT, depois chama as RPCs com `supabaseAdmin` (service_role).
Analytics page faz fetch desse endpoint em vez de RPC direta. Testes cobrem
autenticação, origem e erros de RPC. `npm test` 1381/1381 (5 novos do endpoint),
`npm run build` ok (ambos apps). Product pode re-extrair lista de quiet/risk
com dados reais agora. PR #38.

## Ativação da primeira venda reforçada — 2026-09-17

Evidência PostHog (projeto 470628, 15–17 set, filterTestAccounts, n=4 contas):
4 registradas → 4 wizard_completed (100%) → 4 first_sale (100%), mas 1 usuário
clicou `pdv_empty_state_cta_clicked` **7× ao longo de 45 minutos** antes de
completar a criação do produto. Após produto criado + caixa aberto: 2/2
completaram venda em ~15 s. Gargalo não é o fluxo de pagamento (funciona), mas
a lacuna vazio → criar produto → saber clicar no produto.

Traço do usuário com dificuldade: 15:18 clique "cadastrar_produto" → 15:59
clique "avulso" (41 min depois!) → 15:59 "cadastrar_produto" → 16:02 "avulso" →
16:02 "cadastrar_produto" → 16:03 "avulso" → 16:03 "cadastrar_produto" →
16:03:41 produto criado → 16:03:47 caixa aberto → 16:04:03 venda concluída (22 s
após criação do produto).

**Causa raiz (PR #36 tinha o fluxo, mas faltava orientação pós-chegada):**
- Estado vazio passivo: "Você pode vender agora mesmo ou cadastrar seus produtos
  primeiro" — ambos os caminhos pareciam igualmente válidos.
- Hierarquia de botões invertida: "Venda avulsa" (primário), "Cadastrar primeiro
  produto" (secundário) — mas a evidência mostra que criar produto é o caminho
  canônico (17 de 18 primeiras vendas no histórico pré-PR tinham produto).
- Sem orientação pós-criação: após criar o produto, usuário volta à grade com 1
  tile, mas sem dica de "agora clique nele para adicionar no carrinho".

**Corrigido (mínimo, sobre PR #36):**
- **Copy do estado vazio agora diretiva**: "Cadastre seu primeiro produto para
  começar. É rápido: nome e preço." Define caminho primário claro, calibra
  expectativa de velocidade.
- **Hierarquia de botões invertida**: "Cadastrar primeiro produto" (primário
  azul céu), "Ou venda avulsa" (secundário cinza). Alinha hierarquia visual com
  o caminho canônico; "Ou" reforça que avulso é o fallback.
- **Helper pós-criação (só primeiro uso)**: quando usuário cria primeiro produto
  no fluxo `isFirstUseNoCaixa` (`produtos.length === 0` antes da criação), helper
  flutuante aparece por 8 s no centro da grade: "Clique no produto acima para
  adicionar na venda", com seta animada apontando pra cima, borda pulsante,
  botão "Entendi" pra dispensar antes. Fecha a lacuna "criei produto, e agora?".
  *Polish posterior (Spec A–B, ver seção no topo): dica colada no tile, copy
  "Toque no produto…", Entendi ghost, Plus só no cadastrar.*
- **Tracking aprimorado**: `pdv_quick_product_created` agora inclui
  `was_first_product: boolean` pra diferenciar primeira criação das seguintes.

**Critérios de sucesso (medir pós-publicação, 2 semanas):**
- **Norte**: ≥70% de `wizard_completed` → `first_sale_completed` <48h (linha
  base ~50% em 30d por CURRENT.md "Chegada no produto" 2026-09-15).
- **Antecedente**: mediana entre `wizard_completed` e `first_sale_completed`
  <15 min (abaixo dos 45 min observados).
- **Fricção**: cliques em `pdv_empty_state_cta_clicked` por usuário ≤2 (abaixo
  do máximo de 7 observado).

Sequência de eventos esperada: `onboarding_wizard_completed` →
`onboarding_welcome_cta_clicked {cta: 'first_sale'}` →
`pdv_empty_state_cta_clicked {cta: 'cadastrar_produto'}` →
`pdv_quick_product_created {was_first_product: true}` →
`pdv_first_use_caixa_prompted {trigger: 'payment'}` → `first_sale_completed`.

Validação local: pendente (branch `cursor/minimal-first-sale-activation-711e`,
PR #39 draft). Não altera schema/RLS/segurança. Reutiliza `ModalNovoProduto`
`compact` e `firstUseCaixaGate` de PR #36. Desktop/tablet inalterados
(posicionamento do helper adapta).

## Zoom automático do iOS ao focar campos — 2026-09-15

Relato do dono no iPhone: toda vez que o teclado abria (chat do Zelinho em
`/gestao`, valor recebido no `ModalPagamento`, etc.) a tela dava um zoom e não
voltava sozinha — precisava dar pinch pra desfazer. Causa: vários campos têm
`font-size` abaixo de 16px (13–15,2px), e o Safari/iOS aplica zoom automático
ao focar qualquer campo assim, só desfazendo com gesto manual do usuário.
`SupportChat.svelte` já tinha corrigido isso isoladamente (`font-size: 1rem`
documentado em FX-MARKETING-MOBILE-ADAPT-01), mas nenhum outro campo do app
recebeu o mesmo tratamento.

**Corrigido**: piso global em `src/app.css` — `input`/`textarea`/`select`
(exceto checkbox/radio/range/color/file/submit/button) recebem `font-size:
16px !important` só em `max-width: 767px`. Vence qualquer `font-size` menor
definido por componente sem alterar nada no desktop. Documentado em
`DESIGN_PATTERNS.md` §9. Validado com Playwright: 16px aplicado em 390px,
tamanho original preservado em 1280px. `npm test` 1376/1376, `npm run check`
0/0.

## Polish do primeiro uso no PDV (iPhone) — 2026-09-15

Teste do dono no iPhone depois do fix do PWA: fluxo de conta nova funcionou
(PDV sem Abrir Caixa, estado vazio novo). Defeitos corrigidos:
- `ModalNovoProduto`: preço começava em 0 e virava "R$ 025" → campo texto
  `inputmode="decimal"`, vazio com placeholder `0,00`, aceita vírgula, parse no
  submit (`src/lib/parsePrecoInput.js`), erro inline "Coloque o preço.".
- Sem categoria cadastrada o select abria uma lista vazia → categoria marcada
  "(opcional)" com "+ Nova categoria" inline (sem segundo modal). Salvar cria a
  categoria e o produto no mesmo envio; `created` passa `{ ...produto,
  categoriaCriada }` e as páginas recarregam categorias quando houver.
- Estado vazio da grade redesenhado (sem cartão, ícone, ritmo 16/8/24/12/32,
  botões 52 px, prévia com 3 tiles tracejados e rodapé legível). Copy do dono
  mantida.
- Barra de categorias vazia não renderiza mais (sumiram as duas linhas).
- Dinheiro exibido em pt-BR (`src/lib/formatMoney.js`, `tabular-nums`) no
  badge do caixa, grade e comanda; chave técnica de item mantém `toFixed`.

Verificado em navegador (375 px, rota temporária local removida). Suíte
1.376/1.379 (3 skips pré-existentes), `npm run check` 0/0.

## Aparelhos presos na versão antiga do PWA — 2026-09-15

Testando a conta nova no iPhone, o dono caiu no Abrir Caixa mesmo com a regra
de conta nova em produção, e recarregar não resolvia. Logs do Supabase: o iPhone
nunca fez a contagem em `caixas` que só a versão nova faz — rodava o `/app`
antigo do precache do service worker. O aviso "Nova versão disponível" nunca
apareceu na sessão inteira: ele é adiado enquanto houver modal aberto, e a versão
antiga abre o Abrir Caixa no carregamento. Todo operador que abre o PDV com
caixa fechado ficava preso na versão antiga.

**Corrigido** (`UpdateAvailable.svelte`, `src/lib/pwa/updateSafety.js`,
regra completa em `docs/operations/OFFLINE.md`): no boot, versão nova é aplicada
sozinha se nada estiver pendente (fila offline, comanda, rascunho, campo focado);
depois do boot só aviso; `ModalAbrirCaixa` (`data-update-safe`) não bloqueia mais
o aviso. Aparelho já preso precisa pegar esta versão uma vez à mão (aba privada
ou apagar dados do site).

Também publicado hoje: retomada de venda com confirmação pendente
(`restoreCheckoutFormState`, commit 42dc2b1) — ver seção abaixo.

Validação: suíte completa 1.365/1.368 (3 skips pré-existentes), `npm run check`
0/0. Não verificado em aparelho real.

## Chegada no produto: boas-vindas e primeira venda — 2026-09-15

O dono achou o cadastro "seco": criar conta caía direto na pergunta e, depois,
num `/gestao` vazio. Decisão dele, com o porquê: o destino é a **Frente de
Caixa**, não o cadastro de produto — onboarding não pode virar configuração, e
abrir caixa logo de cara é barreira antes de a pessoa entender o produto.

Dado que sustentou a discussão (contas com trial, 180 dias, sem subusuário):
28 contas, 21 cadastraram produto, 18 venderam, 14 no primeiro dia; mediana até
a 1ª venda 28 min. Das 18 que venderam, só 3 fizeram a 1ª venda com item avulso
e 17 venderam produto cadastrado em algum momento.

**Feito:**
- **Wizard** (`OnboardingWizard.svelte`): bolinhas passam a mostrar passo atual
  (contorno) × concluído (preenchida). Depois do passo 2 o mesmo card vira a
  chegada: "Boas-vindas ao Zelo, {loja}." + "Seu teste de 14 dias começou. Se
  quiser, cadastramos seus produtos junto com você pelo WhatsApp — uns 15
  minutos." Botões "Fazer primeira venda" (`/app`) e "Ajuda no WhatsApp"
  (`wa.me` com mensagem pronta em nova aba + `/app` na aba atual). Sem data de
  fim do teste (decisão do dono). A conversão de trial roda em segundo plano
  enquanto a pessoa lê; clique espera no máximo 1 s. Eventos
  `onboarding_welcome_viewed` e `onboarding_welcome_cta_clicked {cta}`.
- **Número do WhatsApp do Zelo** virou fonte única em `src/lib/zeloContact.js`.
  O botão do wizard não conta como conversão "contato" do Google Ads (`/perfil`
  é área protegida e o botão usa `window.open`).
- **`ModalNovoProduto`** extraído de `gestao/produtos/+page.svelte`, com modo
  `compact` (nome, preço, categoria) usado no PDV.
- **Frente de Caixa para conta nova** (`src/lib/pdv/firstUseCaixaGate.js`):
  "conta nova" = titular que nunca abriu caixa (count em `caixas`); expira sozinha
  no primeiro caixa aberto. Para ela o Abrir Caixa não abre no carregamento,
  produto e avulso entram na comanda, e a barreira aparece em
  `abrirModalPagamento` — ao abrir o caixa, segue para o pagamento com a comanda
  intacta. Erro, offline sem informação ou subusuário → comportamento antigo.
  Nenhuma venda nasce sem caixa aberto.
- **Estado vazio da grade** (qualquer conta sem produto): "Faça sua primeira
  venda / Você pode vender agora mesmo ou cadastrar seus produtos primeiro. /
  + Venda avulsa / + Cadastrar primeiro produto / Seus produtos aparecerão
  aqui." O cadastro abre o `ModalNovoProduto` compacto dentro do PDV (só com
  `produtos.gerenciar` para subusuário). Eventos `pdv_empty_state_cta_clicked`,
  `pdv_quick_product_created`, `pdv_first_use_caixa_prompted`.

**Pendente / riscos:**
- `ModalAbrirCaixa` não tem cancelar: quem chega na barreira do pagamento
  precisa abrir o caixa para seguir (a comanda não se perde).
- `first_sale_completed` vem de trigger de banco e não distingue venda de teste
  (avulso) de venda com produto; medir por `vendas_itens.id_produto`.
- Código morto removido de `app/+page.svelte`: `handleFinalizarVenda` e a sobra
  do split de pagamento anterior ao `ModalPagamento` (`addPagamento`,
  `removerPagamento`, `trocoPrevMulti`, `restantePagamento`, `somaPagamentos`,
  `novoPag*`). **Bug latente revelado, não corrigido:** `handleFinalizarVenda`
  era o único leitor de `checkoutSubmission.formState`, o estado salvo para
  retomar uma venda com confirmação incerta. Depois de recarregar a página, a
  comanda e o payload pendente voltam do rascunho, mas o `ModalPagamento` abre
  vazio; se a pessoa escolher pagamento diferente do original,
  `selectCheckoutSubmission` recusa ("Há uma confirmação pendente…") e a venda
  fica presa. Não há risco de duplicidade — o payload original é reaproveitado.
  `formState` segue sendo gravado; a correção é restaurá-lo no caminho vivo
  (`abrirModalPagamento` → `ModalPagamento`).
- Revisar o destino em 30 dias: contas que cadastram produto e vendem no 1º dia.

Validação: suíte completa 1.321/1.324 (3 skips pré-existentes), `npm run check`
0/0. Não verificado em navegador com conta nova.

## Cadastro sem espera e sem PIN — 2026-09-15

Cadastro de teste do dono em produção (09:19), medido no PostHog: 5,6 s de
"Carregando…" até o wizard aparecer, 10 s entre "Começar a usar" e o
`trial_started`, até mais 8 s de espera fixa de tracking, recarga completa do
`/gestao` e, ao chegar, o modal de configurar PIN. O passo 1 do wizard também
emitia `onboarding_wizard_step_viewed` duas vezes.

**Corrigido:**
- `POST /api/billing/start-trial` responde assim que a assinatura existe
  (inserida ou encontrada). Meta CAPI, e-mail dia 0, WhatsApp de boas-vindas,
  referral, `last_seen_at` e o flush do `trial_started` vão para `waitUntil`.
  O campo `onboarding` saiu da resposta — ninguém lia.
- `/perfil?msg=complete` decide o wizard com leitura mínima de
  `nome_exibicao, contato` em paralelo à detecção de subusuário, sem esperar
  assinatura e perfil completo.
- Fim do wizard: `waitForGtag` com teto de 1,5 s (era 6 s),
  `trackGoogleAdsInscricao({ timeoutMs })` espera o `event_callback` real com
  teto de 1 s, buffer final de 800 ms só quando houve tracking (eram 2 s fixos).
  Conversões de Google Ads e Meta continuam disparando.
- **Bug de navegação no layout raiz:** `maybeNavigate` usava um `path`
  capturado uma vez no `onMount`, que sombreava o `$: path` reativo. Todo
  `onAuthStateChange` decidia com a URL de quando o app montou. No cadastro,
  `setSession` disparava um `window.location.href = '/perfil?msg=complete'`
  que corria com o `goto` do próprio `/cadastro` — `/perfil` e wizard montavam
  duas vezes (origem do `step_viewed` duplicado). Agora o pathname é lido a cada
  decisão e `/cadastro` não é redirecionado pelo layout (a página navega
  sozinha). Candidato forte a explicar o ping-pong `/cadastro`↔`/login` visto
  no PostHog — confirmar com `login_bounced_authenticated` depois do deploy.

**PIN administrativo removido do SaaS** (decisão do dono: privacidade entre
funcionários é o add-on Controle de Acessos; com PIN grátis o add-on não vende).
Saíram `AdminLock`, `PinSetupModal`, `adminPinPrompt`, `adminStore`, as rotas
`/api/auth/admin-pin` e `/api/auth/pin-reset-otp`, o rate limit correspondente,
o bloqueio em `/relatorios` e `/gestao/despesas` e a seção de PIN do `/perfil`.
`relatorios.ver` e as policies de despesas por cargo continuam intactas.
- **Impacto conhecido e aceito:** 3 clientes pagantes tinham PIN e não têm
  Acessos; relatórios e despesas deles ficam visíveis a quem usar o mesmo login.
- **Pendente:** colunas `empresa_perfil.pin_admin`, `empresa_perfil.pin_enabled`
  e `access_settings.pin_enabled` continuam no banco sem leitor. Drop só depois
  do deploy estável, via migration forward; `tests/empresaPerfilPinSelectSchema.test.js`
  segue testando a migration antiga.
- A trilha A.2 (OTP por WhatsApp) perdeu o primitivo `pin-reset-otp`; se andar,
  recria-se o envio a partir de `signInWithOtp`.

Validação: suíte completa 1.283/1.286 (3 skips pré-existentes), `npm run check`
0/0. Não publicado ainda.

## Onboarding em dois passos — Fases 1–5 encerradas — 2026-09-15

Plano completo em [onboarding-dois-passos](projects/onboarding-dois-passos.md).
Artefato de leitura: https://claude.ai/artifact/TigsUMdoyes8jrmj12hPS8

Medição no banco (180 dias): 38 contas criadas, 28 concluíram o wizard, **10
travaram** sem perfil, sem trial e sem acesso. Das 10, **7 voltaram ao produto
depois** e bateram na mesma parede. O trial só nasce no `finalizar()` do wizard,
então desistir no passo 3 deixa conta sem acesso e sem saída.

**Feito nesta branch:** `requiredOk` foi partido em `operationalProfileOk`
(nome + contato — o que o produto precisa pra operar) e `billingProfileOk`
(CPF/CNPJ válido — o que o billing precisa pra cobrar). `largura_bobina` saiu das
duas checagens: todo consumidor já cai em `|| '80mm'`.

O muro mais duro era o redirect global em `src/routes/+layout.svelte:262` — de
qualquer rota, perfil incompleto ia pra `/perfil?msg=complete`. Agora "incompleto"
quer dizer sem nome ou sem telefone, não sem CPF.

`canSave` no perfil também estava preso ao CPF: sem ele, ninguém salvava nada no
próprio perfil. Agora aceita documento vazio e exige validade só quando preenchido.

`contato` continua checado por presença, não por validade — de propósito. É o
critério do `requiredOk` antigo; apertar expulsaria pro wizard toda conta cujo
telefone não normaliza.

`tests/profileUtils.test.js` reescrito: 9 testes verdes. `npm run check` 0/0.
Suíte completa **não** foi rodada — decisão do dono: roda uma vez no fim das
cinco fases, velocidade acima de granularidade.

**Fase 1.1 feita (baseline):** o wizard atual de 4 passos emite
`onboarding_wizard_step_viewed` / `_step_completed` / `_validation_failed` /
`_step_back` / `_completed` / `_save_failed`, com `step` e `total_steps` e sem
PII. Precisa estar coletando em produção **antes** da Fase 3 subir — sem isso o
"antes" se perde. Filtrar por `total_steps = 4` para o baseline.

**Fase 2.2 feita:** `create-subscription` não barra mais cartão sem CPF/CNPJ.
O gate era nosso — Stripe não tem `tax_id_collection` e o comentário de "nota
fiscal" era falso. `checkout_failed` com `reason: profile_incomplete` agora só
sai do Pix. Teste do gate do cartão em `api.checkout-failed.test.js` saiu; dois
casos novos em `api.create-subscription.test.js` (sem documento, perfil null).

**Fase 1.3 feita (só medição, nenhum redirect mudou):** `/login` emite
`login_viewed` { redirect_from, has_session }, `login_submitted` { method },
`login_failed` { method, error_code } e `login_bounced_authenticated`
{ destination }. `error_code` e `redirect_from` saem de helpers puros em
`src/lib/loginTelemetry.js` (14 testes); nunca mensagem crua nem URL completa.
`redirect_from` aceita somente rotas e mensagens do vocabulário fechado do
produto; paths livres, URLs externas e `msg` arbitrária são descartados. Falha
do OAuth Google em `/login` também emite `login_failed` com código sanitizado.
No caminho com sessão, o redirect pra `/app` aguarda o capture por até 400 ms —
sem isso o evento de bounce morria com a navegação.

Hipóteses para os 80 pageviews / 19 visitantes, **não confirmadas** (confirmar
com os eventos acima antes de mexer):
1. Guards de página duplicados em `gestao/+page.svelte:36`,
   `gestao/mesas/+page.svelte:27`, `gestao/empresas/+page.svelte:28`,
   `gestao/extensoes/+page.svelte:17` usam `getUser()` sem timeout nem fallback
   offline e fazem `window.location.href = '/login'` na primeira falha — em
   rede lenta expulsam sessão válida, em paralelo ao `ensureActiveSubscription`
   que tem timeout de 8 s. Cada expulsão é reload e pageview novo em `/login`.
2. `$pageview` morre nas rotas protegidas mas não em `/login`: todo ida-e-volta
   só aparece pela metade `/login`.
3. Autenticado em `/login` é redirecionado por dois mecanismos (a própria página
   e `+layout.svelte:279`) — duplicado, mas provavelmente não é o volume.
Consulta: `login_viewed` por `has_session`; com sessão falsa, funil
`login_submitted` → `user_logged_in` × `login_failed` por `error_code`;
`login_bounced_authenticated` repetido por `distinct_id` em janela curta é a
assinatura do ping-pong.

**Fase 2.1 feita — a Fase 3 está destravada:** `/assinatura` etapa 3 mostra
"CPF ou CNPJ" quando o perfil não tem documento válido; `POST
/api/billing/pix/create` recebe `documento`, grava em `empresa_perfil` antes de
cobrar e não joga mais a pessoa pro `/perfil` por falta só de documento
(`field: 'documento'` no lugar do `redirect`). Contrato em [[BILLING]].
Pendências conhecidas, não bloqueantes:
- falha ao **gravar** o documento sai com `reason: profile_read_failed` — nome
  errado; merece um `PROFILE_WRITE_FAILED` em `checkoutFailure.js`
- contato preenchido mas não normalizável **e** documento faltando ao mesmo
  tempo ainda devolve `redirect` (caso raro, sem teste)
- o admin (`api/admin/billing/pix/create`) segue exigindo documento no perfil
- o campo aparece na etapa 3 mesmo para quem vai de cartão (a copy fala de Pix)

**Fase 3.1 feita — wizard de 2 passos (nome da loja, WhatsApp)** com a copy
fechada do plano. Passos de CPF/CNPJ e bobina saíram; o upsert grava
`largura_bobina: '80mm'` e **não manda mais `documento`** (mandar vazio apagaria
CPF já salvo pelo Pix). Instrumentação da 1.1 mantida; `total_steps` agora é 2.
O clique final repete a validação do WhatsApp e as ações ficam protegidas contra
duplo envio enquanto o save está em andamento.

**Fase 4.1 feita:** o card já existente em `/gestao` agora usa exclusivamente o
checklist fechado (primeiro produto, CPF/CNPJ, logo e largura da bobina), sem
reaproveitar `onboarding_completed` nem as tarefas antigas de caixa/venda/
relatório. Os links de perfil selecionam as abas corretas e rolam para seções
reais (`#documento`, `#logo`, `#largura-bobina`). Bobina é item normal do
checklist; o valor efetivo ausente continua sendo o default de 80 mm do produto.

**Fase 4.2 feita localmente e atômica na entrega:** o wizard persiste o passo 1
antes de avançar, retoma no WhatsApp quando necessário e salva o passo 2 antes
de iniciar o trial. A migration
`20260915090000_nudge_operational_profile_rpc.sql` muda a RPC do nudge para
considerar linha ausente, nome vazio ou contato vazio. Ela preserva filtros de
idade/e-mail/subusuário, restringe execução a `service_role` e **não** exclui
perfil incompleto apenas porque existe uma linha em `subscriptions`.

**Publicação concluída:** o primeiro lote (até `3314ea1`) entrou em produção no
merge `954fdf2`; em seguida, por decisão explícita do dono de priorizar o
rollout imediato, as Fases 3.1, 4.1 e 4.2 foram publicadas sem janela de coleta
útil do baseline de quatro passos. A migration `20260915090000` foi aplicada
isoladamente pela Supabase CLI, registrada no histórico e verificada no banco:
RPC estável/`SECURITY DEFINER`, `search_path` fixo, `service_role` com EXECUTE,
`anon`/`authenticated` sem EXECUTE e três perfis elegíveis no momento do smoke.

**Fase 5.1 encerrada:** a auditoria final separou os 7 subusuários dos 3
titulares realmente incompletos. Os três já tinham nudge registrado antes da
Fase 3.1, mas o CTA apontava para `/onboarding` (rota inexistente). O CTA foi
corrigido para `/perfil?msg=complete`; por decisão do dono, não houve novo
disparo de e-mail. A tabela de deduplicação não foi alterada.

Validação local final: 39/39 testes focados de login/onboarding/checklist/RPC,
66/66 testes focados de billing/RPC, suíte completa 1.275/1.278 (3 runtimes
pré-existentes pulados), `npm run check` com 0 erros/0 avisos e
`npm run verify:migrations` verde (107/107, 59/59, 55 forward migrations).

**Ordem que não pode inverter:** a Fase 2 (CPF inline no Pix) tem que estar no ar
antes da Fase 3 (wizard curto). `validatePixCustomerProfile` exige documento e
`billingPix.js:347` manda `taxId` pra AbacatePay — tirar o CPF do wizard antes
quebra todo Pix de cliente novo.

## `checkout_failed`: o funil passou a ver quem tentou pagar e não conseguiu — 2026-09-14

Antes só existia o lado feliz (`stripe_checkout_created`, `pix_charge_created`).
Clique que morria no servidor — perfil sem CPF/CNPJ, plano inválido, provedor
fora do ar — sumia, e o buraco entre "abriu /assinatura" e "cobrança criada"
ficava sem explicação.

A resposta de erro e o evento saem da **mesma função**, em
[src/lib/server/checkoutFailure.js](../src/lib/server/checkoutFailure.js).
Espalhar `posthog.capture` por dez `return json(...)` é exatamente como o bug
anterior nasceu. As 19 saídas de erro cruas dos dois endpoints (10 no cartão,
9 no Pix) passam por `fail()`; um teste de fonte rejeita `return json(...)` com
status 4xx/5xx, e foi verificado contra a versão anterior — falharia nas 19.

`reason` é código estável (`profile_incomplete`, `invalid_plan`,
`addon_not_allowed`, `unauthenticated`, `subuser_forbidden`,
`provider_unavailable`, `provider_error`), nunca derivado da mensagem em pt-BR:
o texto é de UI e uma revisão de copy levaria o histórico do funil junto.
`profile_incomplete` é o que mede diretamente o muro de cadastro descrito na
auditoria de conversão — quem chegou querendo pagar e foi mandado de volta.

Partição entre cliente e servidor, sem dupla contagem: o servidor registra toda
resposta de erro que ele produziu (`origin: 'server'`); a tela registra só o que
o servidor não pode ter visto (`origin: 'client'`) — `no_session` (a requisição
nunca saiu), `network` (resposta nunca voltou) e `unexpected_response` (200 sem
URL de checkout). O ramo `!res.ok` do cliente **não** emite, de propósito.

Falha de autenticação cai em `distinctId: 'anonymous'` — não há a quem atribuir,
mas "a sessão expirou antes de assinar" continua sendo conversão perdida e
precisa ser contada. Mesma convenção do chat de suporte.

O flush não segura a resposta: numa falha de pagamento o cliente está esperando
na tela. Vai por `waitUntil`, com fallback silencioso fora do runtime da Vercel.

Suíte 1.230/1.233 (3 skips pré-existentes), `npm run check` 0/0, build verde.

## Evento de negócio dentro do produto nunca chegou ao PostHog — 2026-09-14

Auditoria do funil no PostHog (projeto 470628): `trial_auto_started`,
`subscription_checkout_started`, `pix_payment_initiated` e os três `gerente_*`
**não existem** na lista de eventos do projeto. Nunca chegou um.

Causa-raiz em [src/lib/posthogClient.js](../src/lib/posthogClient.js): o gate era
por **rota**, não por evento. `sanitizeEvent`, usado como `before_send`, abria com
`if (!isBrowser() || !isPostHogAllowedPath(window.location.pathname)) return null`
— e `/assinatura`, `/gestao`, `/app`, `/perfil`, `/relatorios`, `/ferramentas`
estão em `BLOCKED_PREFIXES`. Todo `capture()` disparado lá dentro morria. Uma
segunda trava somava: `syncPostHogForPath` chamava `opt_out_capturing()` ao
entrar em rota privada, e esse opt-out fica gravado no localStorage do aparelho.
O contrato mentia — `capturePostHogEvent` devolvia `true` com o evento no lixo.

O commit anterior (`f5c0dbe`) contornou para o cadastro, movendo o evento para o
servidor, e documentou a causa em comentário sem removê-la.

Correção: o gate passou a ser por **evento**. `SURFACE_EVENTS` (pageview,
autocapture, rageclick, heatmap, web vitals, pageleave) morre fora da área
pública; evento de negócio nomeado, `$identify` e `$exception` atravessam com a
URL reduzida a `/app/mesas/:id` e o referrer apagado — inclusive em `$set`/
`$set_once`, que no `CaptureResult` do posthog-js são **irmãos** de `properties`.
`opt_out_capturing()` virou `set_config({ autocapture, capture_pageleave,
enable_heatmaps })`, e o init desfaz o opt-out que a versão anterior gravou —
sem isso os aparelhos que abriram o PDV antes ficariam mudos para sempre.

As três chamadas de `/assinatura` foram **removidas**, não religadas: o servidor
já emite `trial_started`, `stripe_checkout_created` e `pix_charge_created`, com
propriedades a mais (`trial_end`, `session_id`, `payment_id`) e sem depender do
cliente chegar vivo ao fim do fluxo. Religar duplicaria a contagem no funil.

Aberto de propósito: não existe evento de **falha** de checkout. Hoje só se vê
cobrança criada com sucesso; clique que morreu no servidor é invisível.

Suíte 1.222/1.225 (3 skips pré-existentes), `npm run check` 0/0, build verde.
Corrigido também `tests/signupFollowUp.test.js`, que estava vermelho desde
`f5c0dbe` (ainda exigia o `user_signed_up` removido por aquele commit).

## Assinatura pós-trial perdia o add-on ativo — 2026-09-14

Reclamação de cliente (FullBuster Burger, `plan_tier='pdv'`,
`has_zelo_menu=true`, trial vencendo em 14/09): foi assinar e a tela mostrou
R$59 onde o pacote real é R$99. Nenhuma cobrança chegou a ser criada —
`billing_payments` do titular está vazio.

Duas causas somadas em `src/routes/assinatura/+page.svelte`:

1. O reset reativo `$: if (!selectedPlanAllowsMenu && menuAddonOn) menuAddonOn
   = false;` era de mão única. `bundle` tem `allowsMenu: false` porque já inclui
   o ZeloMenu (D-014), então passar pelo card "Mais popular" desligava o add-on
   e voltar para ZeloPDV **não** o religava: o único ponto que setava `true` era
   o `applySubscriptionState` do `onMount`. R$99 → R$198 → R$59, em silêncio.
2. O card do plano na etapa 1 renderizava `PLANS[planId].price` — R$59 fixo —
   enquanto o resumo e a barra fixa mostravam `planPrice` (R$99). A tela exibia
   dois preços contraditórios ao mesmo tempo.

Correção na raiz: `src/lib/billing/planSelection.js` separa a **intenção** do
cliente (`desiredAddons`) do que é **cobrável** no plano atual. O que o plano não
vende é suprimido, nunca apagado, e volta sozinho — o reset destrutivo deixou de
existir. `resolveEntitlements`/`lostEntitlements` espelham
`subscriptionIncludesMenu` de guards.js, então trocar pdv+ZeloMenu por bundle
não é contabilizado como perda.

UX/UI do mesmo fluxo: cards de plano precificam a seleção e mostram a
decomposição (`R$ 59 + ZeloMenu`); `EntitlementLossWarning` avisa nas etapas 2 e
3 quando a seleção remove um módulo ativo, com atalho de volta; `confirmAction`
segura Pix e cartão até o cliente confirmar a remoção; e um card "O que você
usou no teste" com botão "Continuar com este pacote" dá continuidade pós-trial
em vez do seletor genérico.

Fica aberto de propósito: os endpoints de billing seguem confiando no payload de
add-ons (ver [[CODE_REVIEW]]) — o schema não separa add-on comprado de add-on só
experimentado no trial, e uma trava de servidor barraria quem desiste do módulo
por vontade própria.

Suíte 1.212/1.215 (3 skips pré-existentes) e `npm run build` verdes; 16 testes
novos. Sem verificação em navegador: o ambiente desta sessão não tem as chaves
Supabase para subir a tela autenticada.

## Cadastro novo não aparecia no Fiado — 2026-09-11

Reclamação de cliente, reproduzida na conta de teste da Donutopia: uma pessoa
recém-cadastrada em `/gestao/pessoas` aparecia no fichário e não aparecia no
select de Fiado ao fechar o pedido.

Causa-raiz: `readOperationalSnapshot` em
[src/lib/offline/runtime.js](/home/vinicius/code/zelopdv/src/lib/offline/runtime.js:426)
era cache-first sem TTL e sem invalidação — `if (cached !== null && !refresh)
return cached`. O snapshot `pessoas.fiado` é gravado na primeira leitura do PDV
e nenhuma tela de escrita o invalida: cadastrar, editar ou excluir pessoa não
toca nele. O aparelho servia a lista congelada para sempre, mesmo online.
Descartadas as hipóteses de `id_usuario` divergente (o RLS
`pessoas_actor_insert` exige `get_owner_user_id(auth.uid()) = id_usuario`, então
fichário e select enxergam o mesmo conjunto) e de paginação.

O agravante chegou com `7dbd727` (offline zero-config): antes só um aparelho
preparado manualmente tinha snapshot quente; agora qualquer sessão logada tem
`context`, então o caminho cache-first virou o caminho de todo mundo.

Correção na raiz, não no chamador: o snapshot passou a ser **fallback de
offline**, não cache de aparelho online. Com `navigator.onLine !== false` o
loader roda e reescreve o snapshot (que segue quente para a próxima queda);
offline, o cache responde sem consultar; falha de rede continua caindo no
cache. Vale também para `empresa.perfil`, `mesas:profile` e `mesas:catalog` —
todos tinham a mesma congelada silenciosa.

Custo aceito: uma consulta por montagem de tela em vez de zero. Os chamadores já
memoizam em memória por sessão de página, então é exatamente o perfil de carga
anterior ao offline.

Suíte 1.196/1.199 verde, `npm run check` 0 erros / 0 warnings.

## Pausa canônica do cardápio — 2026-09-11

Um item podia estar pausado e vendido ao mesmo tempo. A pausa do produto avulso
vive em `zelomenu_product_publications.pausado_manualmente`; a mesma coisa
oferecida como adicional era governada por `zelomenu_modifier_options.ativo`,
uma flag separada, editada em outra tela e em outro app. Pausar numa forma não
tocava a outra.

O schema já tinha a identidade canônica, só não era lida por ninguém:
`zelomenu_modifier_option_products` garante no banco
`num_nonnulls(id_produto, id_componente) = 1` — toda opção vinculada aponta
para **exatamente um** destino, produto ou componente. Esse destino é o item;
a opção é só uma aparição dele.

Regra nova: **a pausa mora no destino, nunca na aparição.** `ativo` volta a ser
estrutural ("esta opção existe neste grupo"). Pausar um produto pausa junto
todos os adicionais que apontam pra ele, sem código extra — todos resolvem para
a mesma linha de publicação. `visivel_online = false` continua significando "só
complemento", não pausado, e pausar segue sem tocar `produtos.ocultar_no_pdv`.

Migration `20260911120000_zelomenu_canonical_pause.sql`: view
`zelomenu_option_availability` (disponibilidade efetiva numa fonte só,
`security_invoker = true`), `zelomenu_set_menu_pause` (setter canônico, retorna
`opcoes_afetadas`), `zelomenu_set_menu_pause_by_option` (atalho da UI) e
`gerente_set_menu_pause` delegando — o Zelinho passa a alcançar adicional
ancorado em componente, que antes ele recusava com `PRODUTO_NAO_PUBLICADO`.

Migration **aplicada** no projeto Supabase. Provado contra dados reais: uma
chamada de `zelomenu_set_menu_pause` no produto 864 (Mandioca frita) derrubou
as 23 aparições dele como adicional de uma vez; teste revertido por rollback.
`ModalModificadores` depende da view e da RPC, então o app não pode subir num
ambiente sem essa migration.

**`ordem` normalizado na Bem Servido** (dado, não código): as publicações
tinham valores repetidos por categoria — três itens com 0, pares em 1–4 — o que
deixa o topo da lista dependente de desempate indefinido quando o cardápio
ordena só por `ordem`. Renumerado em sequência densa por categoria, preservando
a ordem relativa, e a Coca-Cola Zero 2 L saiu da 15ª (última das 22 bebidas)
para a 10ª, logo depois da Coca-Cola 2 L. Zero duplicatas restantes.

Aberto, fora deste escopo: a normalização foi pontual nessa loja e o campo
continua sendo curadoria manual que lojista nenhum mantém — a correção de
verdade é o cardápio público ordenar por critério próprio (giro, disponibilidade,
foto) com desempate determinístico, e essa renderização vive no repo do ZeloMenu.
A Coca-Cola Zero 2 L segue sem foto, o que ainda a deixa menos visível que as
irmãs; isso é conteúdo que depende da lojista.


## Operação offline zero-config (Fase 1 + Fase 2) — 2026-09-07

Depois da correção de escopo por aparelho (abaixo), o produto ainda exigia duas
configurações manuais para qualquer loja usar offline: "Preparar este
aparelho" em Perfil > Integrações, e o titular "Definir como principal" para
liberar o caixa sem internet. Na prática, dono de restaurante não visita essa
tela sozinho — o suporte técnico tinha que fazer isso por ele. Investigação
confirmou que não há motivo de billing para nenhuma das duas exigências, e que
o catálogo já prova o padrão certo: ele já é cacheado em IndexedDB em toda
visita ao PDV, sem botão nenhum.

**Fase 1 — zero-config para Mesas, Fiado e leitura do caixa.** Todo o aparelho
se registra sozinho na primeira sessão (`register` silencioso, não mais só em
pedido manual online). A loja nasce com `offline_settings.enabled = true`
(migration `20260907150000_offline_zero_config.sql`; linhas existentes também
foram migradas para `true` — a feature ainda não tinha cliente real usando o
desligamento explícito). O snapshot completo de caixa/mesas passa a ser
aquecido em segundo plano nas telas online normais (`atualizarSaldoCaixa`,
`refreshLocalCash`, `loadMesas`/mesas detalhe), do mesmo jeito que o catálogo já
fazia — sem bloquear a tela, sem pedir nada. `readiness` deixou de ser um
carimbo único (`completedAt`) e passou a ter timestamp por peça
(`catalogAt`/`cashAt`/`mesasAt`); um aparelho fica "preparado" assim que
catálogo e caixa estão frescos, com Mesas como bônus opcional. O botão manual
"Preparar este aparelho" continua existindo só para forçar uma atualização
imediata.

**Fase 2 — zero-config para o caixa único.** `offline_bootstrap_v1` ganhou a
ação `claim_primary`: qualquer operador com permissão de caixa (`caixa.abrir`,
`caixa.fechar` ou `caixa.movimentar`) reivindica o status de aparelho principal
como efeito colateral de abrir ou fechar o caixa **online** — sem tela, sem
gate exclusivo do titular. A reivindicação nunca reativa uma loja que o titular
desligou explicitamente (`enabled=true` continua sendo exigido na atualização).
"Definir como principal" manual continua disponível como escape hatch para o
caso raro de um aparelho cuja primeira abertura de caixa da loja aconteça
inteiramente offline.

Validação: 6 novos testes em `tests/offlineRuntime.test.js` cobrindo
auto-registro, preparo automático por peça, reivindicação automática de
principal e compatibilidade retroativa com o snapshot antigo de preparo único;
suíte completa 1.188/1.191 (3 runtimes DB opcionais pulados); `npm run check`
0/0; `npm run build` compila client/SSR/PWA; harness Chromium com SW real
passa em 1280/390 px nas quatro rotas offline. SQL: `npm run verify:migrations`
confirma o ledger (53 forward); harness PGlite (`offline-pglite.mjs`) passa com
um novo script dedicado `offline_zero_config_runtime.sql` cobrindo o default
`enabled=true` no primeiro registro, a reivindicação de principal por
permissão de caixa (não por ser titular), a rejeição de quem não tem permissão
de caixa, e o respeito ao desligamento explícito do titular. Migration aplicada
e registrada no projeto Supabase `xnnjyrblpvsqrtsshawa`; `get_advisors`
confirmado sem achado novo (o único aviso de `SECURITY DEFINER` em
`offline_bootstrap_v1` é o mesmo padrão já presente nas demais RPCs offline).
Sem sessão de cliente real nem teste em aparelho físico.

## Escopo da operação offline corrigido — 2026-09-07

A operação offline voltou a ser opt-in **por aparelho**. Antes, bastava o
titular definir um aparelho como principal para que `offline_settings.enabled`
ficasse ligado na loja inteira; qualquer outro aparelho registrado herdava esse
estado e passava a enfileirar vendas, caixa e mesas em vez de escrever online.
Como criar um pedido manual com internet registra o aparelho em silêncio, isso
alcançava aparelhos que nunca configuraram nada — e o gate de aparelho
principal, que existe para proteger turnos offline, bloqueava a abertura,
movimentação e fechamento de caixa **mesmo com conexão**.

Agora `enabled` exige os dois sinais: a loja liberada e a preparação executada
neste aparelho (snapshot `readiness:<operador>`). Registro de aparelho voltou a
significar apenas entrega durável do pedido manual. A fila durável passou a ser
fallback: um aparelho preparado e conectado escreve online e só cai na fila sem
rede ou com pendência local, então a regra de aparelho principal só vale
offline. O titular pode desligar a operação offline da loja na própria central,
o que antes não existia.

Junto vieram quatro correções que atingiam qualquer conta: `connection` ficava
em `degraded` para sempre depois de uma oscilação (o probe de reconexão só
existia dentro do coordenador de sincronização, ausente em aparelhos não
preparados), aceitar/avançar/cancelar pedido dependia desse estado e
travava com internet, a falha de carregamento da fila era engolida sem aviso e
a consulta de pedidos abortava em 3 s.

Validação: suíte completa 1.182 testes passando (3 runtimes DB opcionais
pulados), `npm run check` 0 erros/0 avisos, `npm run build` compila
client/SSR/PWA com o adapter Vercel, e o harness Chromium com service worker
real renderiza `/app`, `/app/pedidos`, `/app/mesas` e `/gestao/caixa` offline em
1280 e 390 px. O modo `--checkout` do harness falha ao semear o IndexedDB neste
contêiner; a falha foi reproduzida também no commit base, então é do ambiente,
não desta mudança. Sem teste em aparelho físico nem sessão de cliente real.

## Hotfix de fechamento de caixa — 2026-09-07

Produção voltou a fechar caixas. O commit `247b64b` (2026-09-05) tornou o
fechamento atômico por `apply_online_close_v1`; a função passou a inserir
`caixa_fechamentos.totais_pagamento`, mas a migration `20260828120000` que cria
essa coluna não constava no ledger remoto. O erro de coluna inexistente passou a
reverter toda a transação, em vez de afetar apenas o histórico auxiliar.

A migration forward-only e idempotente
`20260907132812_hotfix_caixa_payment_totals_dependency.sql` cria/repara a coluna,
faz o backfill das colunas legadas e valida a constraint JSONB. Ela e a migration
original foram registradas como aplicadas no projeto `xnnjyrblpvsqrtsshawa`.
O teste runtime `cash_closing_hotfix_runtime.sql` abriu e fechou um caixa de
fixture dentro de transação com rollback no banco real e passou. Testes locais
direcionados: 45/45.

## Pedido manual e navegação offline — 2026-09-05

Correção de experiência pronta para publicação: a configuração de operação
offline saiu das telas de PDV/Pedidos e agora fica em **Perfil > Integrações**.
O indicador global aparece somente quando há perda de conexão, sincronização,
pendência ou erro que exige atenção. A criação manual com internet não exige
preparar o aparelho para uso offline; ela registra silenciosamente o aparelho
para manter a gravação durável e sincroniza o pedido. Sem conexão, a preparação
continua obrigatória. Na preparação explícita, a atualização do caixa aceita
até 10 s em conexões móveis e a operação completa até 45 s. A migration
`20260905214500_guard_manual_orders_active_subscription.sql` foi aplicada e
registrada no Supabase; ela revalida a assinatura quando a fila envia o pedido.

Implementação local de **Criar pedido** em `/app/pedidos`, com catálogo e
montáveis/pizzas compartilhados, dados opcionais, data/hora locais editáveis,
frete manual e total calculado. Rascunho e intenção persistidos por loja e
operador; fila exibe registros locais e concilia IDs após replay. Sidebar e
gates de ZeloMenu/Mesas preservam acesso offline de subusuários.

O uso sem internet exige preparação prévia do aparelho e a migration
`20260905210000_manual_offline_orders.sql`, aplicada no projeto Supabase
`xnnjyrblpvsqrtsshawa` e registrada no histórico via CLI. Aceite/andamento/cancelamento/fechamento de
Pedidos continuam online. Contrato atual em [OFFLINE](operations/OFFLINE.md).

Validação desta correção: 25 testes focados e a suíte completa com 1.175 testes
passam (3 runtimes DB opcionais pulados); `npm run check` retorna 0 erros/0 avisos.
PGlite passa as três matrizes SQL, incluindo registro online sem ativar o modo
offline e bloqueio de assinatura vencida. O harness Chromium passa em 390/1280 px.
O build compila client/SSR/PWA e encontra o EPERM conhecido do symlink Vercel no
Windows ao adaptar a saída. A validação ampla da rodada anterior permanece abaixo.
Três matrizes SQL PGlite reais passam (offline, pizzas e pedidos manuais),
ledger consistente. Build compila client/SSR/PWA e termina no EPERM de symlink
do adapter Vercel no Windows; não é um build final verde. Build isolado corrigiu
artefatos HTML/JS inconsistentes gerados durante validações concorrentes.
Chromium com SW real passou em 1280/390 px: quatro rotas offline, criação de
montável R$23+frete R$7,50 com dados vazios, reload com mesma intenção, links
Pedidos↔PDV, checkout, Mesas e Caixa. Revisão visual detectou e corrigiu scroll
do modal móvel; última rodada confirmou geometry sem sobreposição e repetiu
criação/recarga/navegação/checkout nas duas larguras. Evidências locais em
`test-results/manual-orders-{browser,browser-final,focused,sql,check-final}.log`.
Capturas `test-results/offline/manual-order-{top-390,390,1280}.png`.
Sem sessão de cliente, pedido real, publicação do cliente ou teste em aparelho físico.

## Estação de impressão pelo navegador — 2026-09-05

Implementada uma estação opt-in em **Perfil > Integrações > Zelo Impressão**.
Com **Este computador recebe impressões** ativo, uma aba autenticada do ZeloPDV
no computador mantém presença no Supabase, reserva trabalhos e os entrega ao
Zelo Impressão local. Impressões iniciadas em outro aparelho cobrem recibos da
Frente de Caixa, sangria/suprimento, pagamento de fiado, segunda via e comandas
manuais; ficam pendentes por até duas horas quando a estação está desligada.

Pedidos canônicos de ZeloMenu, ZeloChat/WhatsApp e Mesas após **Enviar para
cozinha** agora são observados globalmente, sem depender de `/app/pedidos`
estar aberta, e entram na mesma fila transacional com o ID canônico como chave
de idempotência. A estação é autorizada somente para o titular; subusuários
podem solicitar impressões, mas não ler ou reservar o conteúdo da fila. Falha
comprovadamente anterior ao envio pode tentar novamente até três vezes;
`PRINT_OUTCOME_UNKNOWN` é terminal. Payload máximo: 256 KiB; resultados são
retidos por sete dias. Migrations aplicadas e registradas:
`20260905195511_browser_print_station.sql` e correção incremental
`20260905201827_fix_browser_print_station_heartbeat.sql`.

Validação local: 20 testes direcionados de fila, schema, serviço, estação e
auto-print; `npm run check` em 0 erros e 0 avisos. O smoke SQL autenticado
executou heartbeat, enqueue idempotente, claim e finish dentro de rollback.
Smoke físico na Degust segue
pendente: venda móvel, comanda de cozinha da Mesa, pré-conta e pedido online.

## Onboarding de catálogo Degust — 2026-09-05

Catálogo público de [Degust](https://degust.roxpdv.com/) importado no tenant
existente: 15 categorias, sem subcategorias, 123 produtos regulares e 2
produtos de pizza montável (26 sabores, tamanhos Broto/Grande, preço médio
para meio a meio e 7 opções de borda por família). Há 125 publicações online;
105 possuem imagem pública e 20 ficaram sem imagem porque a fonte não forneceu
uma. Descrições ausentes foram mantidas vazias.

## Modelos de entrega por bairro ou por rota — implementação local em validação (2026-09-05)

Implementado nos worktrees de ZeloMenu e ZeloChat o seletor exclusivo por
empresa entre `distance` e `neighborhood`. O modelo inativo permanece salvo,
mas não é enviado ao checkout público nem editável no painel antigo do Chat.
O modelo por bairro usa tabela canônica com desativação lógica, preço por
bairro, dropdown obrigatório no checkout e validação server-side; o fluxo por
rota/CEP permanece separado. WhatsApp usa a mesma tabela e comparação exata.

A migration [20260905174107_zelomenu_delivery_models.sql](../supabase/migrations/20260905174107_zelomenu_delivery_models.sql)
está pronta, com backfill idempotente, RLS server-only, RPC transacional e
guards de confirmação. Ela ainda não foi aplicada: estes worktrees não estão
vinculados a um project ref e o Docker local não está disponível. A aplicação
deve ocorrer no projeto conectado após revisar o SQL.

Validação local desta rodada: ZeloMenu 683 testes + typechecks; ZeloChat 123
arquivos unitários, lint frontend/servidor; ZeloPDV check e ledger de migrations
verdes. O lint SQL remoto ficou pendente pela ausência de link do Supabase.

## Pizzas montáveis — prontas para homologação em 2026-09-05

Perfil preenchido com nome, descrição, capa, endereço de Guapiara, telefone,
horários 16:00–00:00 de segunda a sábado, domingo fechado e slug `degust`. O trial existente
permanece `trialing` até 2026-09-11 13:02 UTC, com PDV base, Mesas e ZeloMenu
habilitados; Acessos não foi habilitado.

A fonte informa entrega de 40–60 minutos e preços por bairro. Como o ZeloPDV
calcula entrega por distância, os valores de origem foram preservados como
metadado pendente, sem ativar checkout nem criar faixas de km inventadas.
Os meios informados foram registrados como Pix (chave 15 99710-4189), cartão
de crédito e débito, sem valor mínimo. Falta apenas a conversão dos limites em
quilômetros para as taxas hoje definidas por bairro. Validação remota: 15
categorias, 125 produtos/publicações, 2 configurações de pizza e 0 faixas de
entrega ativas.

## Continuidade offline v1 — implementação local em 2026-09-05

Plano aprovado implementado no checkout `feat/pizzas-montaveis`, preservando
as alterações de pizza. Sem publicação ou aplicação da migration offline em
produção nesta rodada. **Atualização: migration e deployment publicados em
2026-09-05.** O protocolo exige
`20260905152642_offline_operation_protocol.sql`, backend compatível e preparação
por aparelho; o titular define o aparelho principal do caixa.

Entregas: outbox transacional e rascunho durável, sincronização global com
idempotência/leases/retry, caixa e Mesas locais, fechamento remoto atômico,
turno original de parciais, ajustes tardios, conferência do titular, recuperação
criptografada, shell operacional PWA, sessão offline e indicador discreto.
Preparação baixa dados operacionais; dados privados não entram no cache HTTP.
Tokens ausentes não revogam por si só a autorização local válida.

Validação completa executada às 13:19: `npm test` — **1.123 passam, 3 skips**
(185 arquivos passam). `npm run check` — **0 erros/0 avisos**. O teste de
1.000 intenções, duas instâncias de sync e 50 respostas perdidas passou sem
perda/duplicação no servidor simulado. Chromium de produção/SW real passou
rotas `/app`, `/app/mesas`, `/gestao/caixa` e checkout+reload em 1280/390 px.
Jornada real de Mesa (abrir/item/parcial/fechar) e turno
(fechar anterior/abrir/suprimento/fechar) passaram em ambas as larguras.
Reexecução geral às 13:33 terminou em **1.126 passam / 5 falham / 3 skips**:
três timeouts de guards durante build concorrente passaram depois em execução
isolada (5/5); duas falhas são de `pizzaProductFlow`/`modelMapping`, em arquivos
de cadastro alterados paralelamente fora desta implementação. Não modificados
para forçar resultado verde. A branch completa não está declarada verde.
Novos testes de consulta owner-scoped dos ajustes passam 2/2. SQL offline e
pizza foram repetidos pelo agente principal e passaram novamente.
Verificação final do agente principal: **107 testes focados / 21 arquivos
passam**, incluindo os guards atualizados. Consultas dos gates têm deadline
de 3 s; respostas tardias não alteram a sessão e ausência de token não apaga
um contexto local válido. O ensaio de 1.000 operações permanece passando.
O harness completo foi repetido após o último build e passou em ambas as
larguras. Logs locais em `test-results/offline/root-final-*.log`.

Publicação executada pela Supabase CLI e Vercel:

- migration `20260905152642_offline_operation_protocol.sql` aplicada no projeto
  remoto `xnnjyrblpvsqrtsshawa`; histórico reparado como `applied` e verificado
  com tabelas, RLS e funções `offline_bootstrap_v1`,
  `apply_offline_operation_v1` e `apply_online_close_v1`.
- deployment Vercel `dpl_BExkssRHXWVrFzzZ5exeURa24d98`, estado `READY`,
  `target=production`; alias
  `https://zelopdv-vinicius-projects-d8d7bb4c.vercel.app`; deployment promovido
  também para `https://www.zelopdv.com.br`.
- smoke checks: `/offline-shell` e `/app` retornam 200; bootstrap sem bearer
  retorna 401 JSON controlado tanto no alias Vercel quanto no domínio público;
  `/sw.js` retorna 200 no domínio público. O build remoto Linux passou; o erro
  de symlink permanece apenas no adapter local Windows.
- `supabase db advisors` retornou apenas avisos preexistentes do projeto;
  nenhum aviso referenciou as novas funções privadas offline. A lista remota
  ainda contém migrations históricas ausentes no checkout; não foram marcadas
  como reverted nem alteradas.
Rechecagem separada do trabalho paralelo: `pizzaProductFlow` agora passa;
permanece uma falha em `modelMapping` (espera quatro modelos, catálogo em
edição tem cinco). Os dois arquivos somam 11 testes passando/1 falhando.
Check final repetido pelo agente principal: 0 erros/0 avisos. Ledger de
migrations também verificado sem inconsistências.

SQL real validado em PostgreSQL WASM/PGlite descartável: baseline+migrations,
rollback atômico, tenant/RBAC, fiado, estoque, recibos repetidos, ajustes de
turno e reconciliação. Docker local indisponível; **não certifica concorrência
multi-sessão**. Build compila client/SSR/PWA, mas adapter Vercel no Windows
continua terminando com **EPERM ao criar symlink**; não há build final verde.
Android/iPhone físicos, impressão, queda de energia e piloto prolongado ainda
requerem homologação. [Contratos e liberação](operations/OFFLINE.md),
[plano e evidências](superpowers/plans/2026-09-05-offline-continuity.md).

## Pizzas montáveis — implementação local em 2026-09-05

Cadastro unificado em Produtos e montagem ZeloMenu/PDV/Mesas implementados na
branch `feat/pizzas-montaveis` dos dois repositórios. A pizza é configurada em
Complementos e opções, sem seletor técnico nem ação separada de criação. Até
quatro sabores iguais, regra maior/média, extras, edição/observação e snapshots
históricos. O fluxo novo não cadastra estoque por sabor, ingrediente ou tamanho.
Importação mantém produtos antigos; exclusão de pizza arquiva.
O replay offline preserva preço/revisão e reserva pendências locais.
Detalhes, runner SQL e limites em [PIZZAS](modules/PIZZAS.md).

Validação final: suíte PDV passou com 1.141 testes/3 skips e check 0/0.
Menu passou 674 unitários, quatro E2E e build. Quatro matrizes SQL passaram
no PostgreSQL descartável, incluindo estorno, exclusão integral de conta e
capability `produtos.gerenciar` de subusuários ativos/bloqueados. Browser PDV verificou
390/1280 com componente real. Sem pedidos reais ou publicação. Build PDV
continua limitado pelo EPERM de symlink no adapter Vercel/Windows; a validação
relevante passou em Windows e navegador mobile, e papel físico segue pendente.
A migration foi aplicada e registrada no Supabase vinculado. Trabalhos
paralelos de montagem/offline foram preservados.

## Diagnóstico offline de Frente de Caixa e Mesas — 2026-09-05

**Histórico da análise anterior à implementação v1 descrita acima.**

Análise solicitada antes de melhorias; nenhum comportamento alterado nesta
rodada. Frente de Caixa é contingência parcial e Mesas segue online. Três
reproduções isoladas confirmam: erro de rede bloqueia retomada do caixa;
abrir mesa depende da rede; retry de fechamento após falha em pagamentos
envia nova inserção de venda sem chave idempotente. Não são incidentes
confirmados em produção. 70 testes existentes passam e três probes de
caracterização confirmam as limitações. IndexedDB real passa em Chromium
desktop e Pixel 5 emulado, com rede cortada e replay simulado; não certifica
jornada autenticada, SW, SQL nem celular físico. Proposta, prioridades e
critérios de aceite em [OFFLINE](operations/OFFLINE.md). Alterações paralelas
de montagem/pizza foram preservadas. Build/check/suíte completa não executados
nesta análise; nenhuma alegação nova de branch homologada.
O `git diff --check` global apontou whitespace em componentes de modificadores
e produtos alterados paralelamente; esses arquivos não foram normalizados por
esta rodada. Reexecução dos probes e persistência: 11/11 passam.

## Investigação de montagem manual — 2026-09-05

Defeito reproduzido no componente real `ModalProdutoMontavel` em Chromium:
seleção atualizava preço/snapshot, mas não destaque, stepper e bloqueio visual
por máximo. A terceira opção podia parecer marcada e não entrar no item;
quantidade do adicional não ficava editável. A reatividade foi corrigida no
modal, com escolha opcional limpável, preço substituto visível, estado de grupo
sem opções e limite de stepper. O harness de interação passa em 390×844 e
1280×800; a suíte completa está em 1.056 testes passando e três skips opcionais;
`npm run check` retorna 0 erros/0 avisos. Sessão salva expirou/redirecionou ao
login, então o caso específico do cliente, `/app` autenticado e produção ainda
não foram confirmados. Ver [diagnóstico e plano](superpowers/plans/2026-09-05-montagem-frente-caixa.md).
`npm run build` compilou client/SSR/PWA, mas terminou no EPERM de symlink do
adapter Vercel no Windows, limitação já registrada e validada em Linux pela CI.

## Estado consolidado — auditoria de 2026-09-04

Esta seção é a referência atual da rodada. Os registros abaixo do histórico
preservam a situação observada em cada data, inclusive contagens e limitações
que foram superadas; não devem ser usados como status de publicação atual.

- Validação PDV: **1.039 testes passam, três skips SQL opt-in; check 0 erros/0 avisos**.
  Os skips da suíte rápida não substituem os probes separados: sete matrizes
  SQL e três provas de concorrência passaram em duas rodadas no PostgreSQL 17
  descartável. Os dois builds Vercel completos passaram em Linux na
  [CI 33931021378](https://github.com/kdo-vini/zelopdv/actions/runs/33931021378).
  O EPERM de symlink observado no Windows permanece uma limitação local;
  não impede a evidência de build Linux completo. Base desta consolidação:
  branch em `3da8dc9`, incluindo os ajustes finais presentes no working tree na coleta.
- Catálogo/offline: páginas de 500 e vínculos em lotes de 100 IDs, owner
  explícito e ordenação por chave única; erro intermediário ou troca de conta
  descarta a leitura completa. Recuperação de vendas legadas exige prova por
  caixa/RLS, login estável e CAS no IndexedDB; dados inconclusivos ficam
  preservados. Fila, idempotência e cache PWA seguem [OFFLINE](operations/OFFLINE.md).
- Cobrança/admin: reserva Pix durável antes do POST e reconciliação por
  externalId impedem novo POST após resultado incerto; timeout cobre o corpo
  HTTP e analytics não bloqueia a resposta. A migration `20260905001053` foi
  aplicada com ACL de serviço. Editor admin usa assinatura exata/CAS, limpa
  extensão ao cancelar e exige prazo válido para reativação. [BILLING](BILLING.md).
- Dependências e interface: audit dos dois apps sem vulnerabilidades;
  admin em Svelte 5.57.0/Vite 6.4.3, adapter 6.3.4 e SheetJS 0.20.3.
  Os seis apontamentos Impeccable foram classificados sem supressão:
  cinco `gray-on-color` combinam estados diferentes de hover/seleção/disabled,
  confirmados no código; um tamanho de fonte de 11 px é preexistente e foi
  preservado fora do escopo de rebrand. Isso não certifica contraste/WCAG geral.
- Menu publicado: `master` em `bd8af453d82cf13a16c9b3ded93d99becdc82124`;
  Dokploy concluiu o deploy. Verificação pública de
  `menu.zelopdv.com.br` confirmou o SHA no backend/frontend e 32 assets
  (1.634.018 bytes). A CI `33942362245` passou com 663 unitários, E2E
  40/4 skips, PostgreSQL, build Docker e verificador HTTP. Cupom atômico, lease push e guard de cotação já têm
  migrations canônicas aplicadas no PDV; o Menu usa espelhos de teste dessas funções.
- Printer: release 0.2.0, revisão `e068`, CI `33933244243` verde.
  Auto-print coordena owner/pedido e preserva resultado incerto;
  confirmação física de papel depende de hardware e não é inferida da CI.
- A prova financeira reproduziu um defeito de contexto owner/actor e replay
  em `criar_venda_completa`; a correção foi exercitada no banco descartável.
  A revisão encontrou também o fallback de subusuário bloqueado tratado como
  dono pelo helper; esse caso adicional foi incluído na revisão da correção.
- Migration `20260905003227_sale_owner_operator_context.sql` aplicada e registrada
  após revisão e matriz final: operador bloqueado é recusado; assinatura própria
  preserva a loja do ex-operador. ACL authenticated/service_role preservada,
  anon negado. Estoque, fiado e uma venda por intenção conferidos no descartável.
- Chat: `dc52af487cc9999a905eb9262884110fbb2f6ed5` está publicado e verificado
  no Dokploy. A CI `33941327097` passou os gates unitário, Docker/HTTP e
  PostgreSQL; o primeiro job público expirou por timeout de rede do runner e o
  rerun passou. Os endpoints públicos retornam o SHA40 final.

## Histórico de registros anteriores

> Conteúdo preservado para rastreabilidade. Expressões como “código local”,
> “pendente” e resultados de testes nesta seção descrevem o momento original,
> não substituem o estado consolidado acima. Trabalhos do usuário não foram
> removidos, encerrados ou reavaliados implicitamente por esta classificação.

- Catálogo completo no PDV (2026-09-04, código local): consultas paginadas em
  500 linhas e vínculos em lotes de 100 IDs, sempre por owner e ordem estável.
  Falha na página 2 ou troca de conta descarta a leitura sem publicar catálogo
  parcial. Regressões cobrem 1250 linhas, complementos e produtos vinculados
  ocultos: 12 testes passam; check 0 erros/0 avisos. Publicação coordenada pendente.

- Pix AbacatePay (2026-09-04, código local): reserva durável antes do POST,
  reconciliação por externalId, deadline de15s e analytics fora da resposta.
  Repetir uma criação incerta consulta o provedor sem enviar outro POST.
  Prova PostgreSQL17 isolada e revisão independente passaram; suite completa
  1.021 passes/3 skips, check0/0 e regressões Pix verdes após a revisão.
  Migration20260905001053 aplicada com ACL service_role; consumidor em publicação.
  Nenhuma cobrança real foi criada.
  Detalhes e recuperação em [BILLING](BILLING.md).

- Correção dos remanescentes (2026-09-04, rodada 2, em validação): impressão
  automática envia owner + zelo_orders.id ao árbitro nativo; segunda via é
  manual. SDK bloqueia auto-print em agente sem coordenação. Editor admin
  altera somente a assinatura selecionada e exige validade vigente para
  reativação; assinaturas vencidas abrem Renovação Manual. Cadastro não espera
  analytics: SPA preserva tarefas e servidor usa waitUntil da Vercel.
  Adapter 6.3.4, Svelte 5/Vite 6 no admin, SheetJS 0.20.3 e override restrito
  cookie 0.7.2 deixam npm audit dos dois apps em zero; round-trip real Excel e
  cookies verificados. **994 testes passam / 3 skips**, check principal 0/0.
  Workflow Linux valida o output Vercel completo; Windows ainda encontra
  EPERM de symlink. Novos patches ainda não publicados. Menu/Chat/Printer e
  migrations de cupom, lease push e guard de cotação já foram aplicadas.

- Complemento de validação (2026-09-05 UTC): ambos builds Vercel completos
  passaram em GitHub/Linux (`33931021378`). Baseline PostgreSQL 17 restaurado,
  seis matrizes SQL transacionais e duas provas de concorrência passaram.
  Fixtures corrigidas para conceder acesso somente às próprias tabelas
  temporárias; probes recusam URL de banco remoto. Seed de catálogo de cliente
  excluído explicitamente apenas do harness descartável, com hash conferido.
  Recuperação offline comprova titular por caixa/RLS e preserva pendências
  inconclusivas. Revisão admin corrigiu cancelamento repetido e CAS com NULL.
  Validação adicional de venda/estoque/fiado por subusuário em execução.

- Auditoria do ecossistema (2026-09-04): [relatório geral](audits/2026-09-04-ecossistema.md)
  reúne PDV, Chat, Menu, Printer, performance e integração. No PDV, cache/fila
  offline agora exigem owner, chave legacy é persistida antes do replay,
  erro SQL confirmado não vira venda offline e cache PWA não cobre APIs
  autenticadas. Impressão incerta preserva dedupe e pede conferência do papel;
  editor admin persiste Acessos e limpa extensão manual ao cancelar.
  A migration `20260904222157_delivery_pricing_rule_jsonb.sql` foi aplicada e
  registrada no Supabase vinculado: erro record/JSONB de frete resolvido,
  assinatura e ACL preservadas. O lint remanescente de tabela temporária em
  `criar_venda_completa` continua pendente de validação runtime descartável.
  Patches de dependências aplicados em ambos apps. Validação após patches:
  **984 testes passam / 3 skips SQL; check principal 0/0; admin 0 erros/6 avisos**.
  Build Windows ainda termina **EPERM de symlink no adapter Vercel**, após
  compilar client/SSR/PWA; E2E autenticado não executa sem credenciais de teste.
  Código local sem deploy desta auditoria; apresentação de pedidos paralela
  foi preservada. Não tratar a pasta como homologada em produção.

- Informações essenciais nos pedidos online (2026-09-04): a tela de pedidos do
  ZeloPDV agora exibe endereço, bairro e forma de pagamento na fila e no
  detalhe. Para pagamentos em dinheiro, o troco aparece como valor formatado
  quando disponível ou `(Não informado)` quando ausente. A coleta do valor
  entregue e o cálculo do troco permanecem explicitamente planejados para o
  checkout do ZeloMenu; o fechamento atual do PDV mantém o pagamento exato
  como fallback. Cobertura em `tests/orderPresentation.test.js`.

- Correção de recibos com desconto (2026-09-04): a impressão da frente de caixa
  agora encaminha o desconto até a engine compartilhada, funcionando tanto no
  Zelo Impressão/ESC-POS quanto no fallback do navegador. O recibo textual de
  WhatsApp/cópia também exibe o desconto. Mesas, reimpressão do dashboard e
  relatórios já estavam corretos. Regressões direcionadas passam; a suíte total
  mantém as duas falhas preexistentes de `tests/gerente.weekReport.test.js`.

- Limpeza visual do Zelinho (2026-09-04): a demonstração da landing deixou o
  padrão de bolha de chat + cartão de resposta e virou uma leitura operacional
  do caixa, com perguntas selecionáveis, consulta ativa e linhas de fechamento.
  A interação continua acessível por teclado/toque e os números seguem
  ilustrativos. Validar no localhost antes de publicar.

- Adaptação móvel da landing (2026-09-04): o hero passa para uma coluna até
  900px, eliminando o título espremido em 6–7 linhas nos tablets de 768–840px;
  em 320px o título agora fecha em quatro linhas sem overflow. A etiqueta do
  hero ficou legível a 14px, links de segmentos e rodapé têm alvo mínimo de
  44px, e o chat público ganhou safe areas, controles de 44px, campo de 16px,
  tipografia alinhada ao design system e modo reduzido sem animação. O botão
  flutuante redundante some enquanto o chat móvel está aberto. Validado em
  localhost nos viewports 320, 360, 390, 768, 844 paisagem, 901, 1024, 1280 e
  1920px, todos sem overflow horizontal. `npm run check`: 0 erros/0 avisos; o
  build compilou client, SSR e PWA, mas o adapter Vercel encerrou no `EPERM` de
  symlink já conhecido no Windows. Alteração ainda não publicada.

- Funil canônico PostHog (2026-09-03): a landing voltou a enviar pageviews e
  autocapture em produção; o funil de aquisição cobre landing, CTA, cadastro e
  trial. A migration `20260903020000_posthog_canonical_lifecycle_events.sql`
  completa o trecho pago no servidor: transições reais de `subscriptions` para
  `active` em Stripe ou AbacatePay geram `payment_confirmed`, e a primeira linha
  de `vendas` do titular gera `first_sale_completed`. O envio parte do Supabase
  via `pg_net`, usa `$insert_id` idempotente, não inclui PII nem valores e falha
  aberto para analytics nunca bloquear cobrança ou venda. Duas views restritas
  em `posthog_analytics` preservam a reconciliação auditável e o backfill.
  Aplicada e registrada no Supabase vinculado; o backfill recebeu HTTP 200 nas
  14 entregas. `supabase db lint --linked --level error` continua vermelho por
  dois erros anteriores e fora deste escopo em `save_zelomenu_delivery_settings`
  e `criar_venda_completa`; nenhuma falha foi apontada nas funções analíticas.

- Alvos resolvidos pelo servidor e histórico de conversas do Zelinho (2026-09-03):
  o modelo estava inventando id de produto e de categoria (linhas reais em
  gerente_agent_actions: produto_id 0 e categoria_id 1 quando a categoria era 225).
  Agora resolveTargets.js confirma o alvo contra o banco por id ou nome, escopado
  por owner, com o mesmo casamento sem acento de buscar_produto, e recusa preparar
  a ação quando não acha ou fica ambíguo (status nao_preparado). Pausar produto não
  publicado no ZeloMenu também é recusado. As sessões deixaram de ser uma só por
  canal: o índice único agora é parcial (status open), gerente_agent_sessions ganhou
  title, e existem GET/POST /api/gerente/sessions e GET /api/gerente/sessions/[id].
  O painel ganhou botão de conversas anteriores em modo leitura, a nova conversa
  fecha a sessão no servidor de verdade, a página do Gerente ganhou bolha flutuante
  para abrir o Zelinho e o Desfazer virou dois passos com a frase do efeito.
  Migration 20260903010000 aplicada no Supabase vinculado em 2026-09-03 via
  db query --file e registrada com migration repair --status applied.

- Zelinho Gerente redesenhado (2026-09-02): a página `/gestao/gerente` ganhou
  cabeçalho com saudação (`buildGreeting`), faixa do dia (`DayStrip` +
  `computeDayStrip`), abas Briefing / Ações do Zelinho / Histórico via `?aba=`
  e sinais em linhas (`SignalRow`) dentro de uma moldura única; `SignalCard`
  e `DaySnapshotSummary` foram removidos. O painel do Zelinho foi refeito:
  mensagens sem bolha, cartão de proposta com o efeito da ação e contador de
  expiração, respostas rápidas em pills, erro com "Tentar de novo" e compositor
  em textarea. O agente passou a devolver `pendingAction.effect` e
  `quickReplies` (frames SSE `pending_action` e `quick_replies`). Regra:
  nunca exibir nomes de ferramenta ou ids ao dono. Padrões em
  `docs/DESIGN_PATTERNS.md` §14. Validado visualmente em 2026-09-02 no dev
  server (desktop 1440 e mobile 390, tema escuro, conta de teste): briefing, painel,
  estado de erro e aba de ações. A ação rápida "Pausar no cardápio" só aparece
  com ZeloMenu ativo (`hasZeloMenuAccess`). Tema claro ainda não conferido. Correções pós-deploy (2026-09-02):
  cartão de proposta não colapsa mais dentro do thread (flex-shrink 0); "sim"/"não"
  digitados com ação pendente confirmam/cancelam sem passar pelo modelo (frame
  action_resolved); só uma escrita por turno (a segunda devolve nao_preparado);
  pills sugeridas pelo modelo via linha [[opcoes: A | B]] extraída em
  quickReplies.js, com fallback determinístico só em perguntas.

- Zelinho Gerente conversacional, fase 2 (lado ZeloPDV) (2026-09-02): o dono agora
  pareia um número de WhatsApp com a empresa em Gestão > Zelinho Gerente >
  Preferências, no cartão "Zelinho no WhatsApp". `POST /api/gerente/pair/start`
  gera o código de pareamento, `POST /api/gerente/pair` confirma o vínculo e
  `DELETE /api/gerente/pair` desvincula. O canal de mensagens fica em
  `POST /api/gerente/channel`, protegido pela chave interna
  `GERENTE_CHANNEL_INTERNAL_KEY` e chamado pelo ZeloChat. Os vínculos e códigos
  ficam nas novas tabelas `gerente_phone_links` e `gerente_pairing_codes`
  (A migration 20260902140000 foi aplicada no Supabase vinculado em 2026-09-02
  via db query --file e registrada com migration repair --status applied). O
  adaptador que fala com o WhatsApp propriamente dito vive no repo ZeloChat,
  com plano próprio em
  `docs/superpowers/plans/2026-09-02-zelinho-gerente-agente-zelochat.md`.

- Zelinho Gerente conversacional, fase 1 (2026-09-02): o painel do Zelinho passou a
  usar `/api/gerente/agent`, com function calling (`gpt-4.1-mini` por padrão, env
  `GERENTE_AGENT_MODEL`), sessões e histórico persistidos em
  `gerente_agent_sessions`/`gerente_agent_messages` e ações de escrita
  (`pausar_no_cardapio`, `ocultar_no_pdv`, `criar_categoria`, `criar_produto`,
  `alterar_preco`) que só executam após confirmação do dono, registradas em
  `gerente_agent_actions`. Toda escrita passa pelas RPCs `gerente_*` owner-scoped
  (`20260902131000`). Só o dono conversa; subusuário recebe 403. Kill switch
  `GERENTE_AGENT_ENABLED=false`. A rota antiga `/api/chat/assistant` permanece para
  rollback. O briefing ganhou a seção "Ações do Zelinho" com desfazer para pausa e
  ocultar. Migrations `20260902130000` e `20260902131000` aplicadas no Supabase
  vinculado em 2026-09-02 (via db query --file, registradas com migration repair
  --status applied). Verificado no banco: 6 funções gerente_*, 5 tabelas gerente_*
  com RLS ativo e ai_usage_logs_chat_type_check aceitando gerente_agent.
  Pendências operacionais: envs GERENTE_AGENT_ENABLED, GERENTE_AGENT_MODEL,
  GERENTE_CHANNEL_INTERNAL_KEY e GERENTE_WHATSAPP_NUMBER na Vercel, merge da
  branch feat/zelinho-gerente-agente e smoke autenticado após deploy.

- Reimpressão de recibos no dashboard (2026-09-01): a atividade recente do
  caixa agora usa o menu de três pontos por venda, com as ações **Reimprimir
  venda** e **Excluir venda**. A reimpressão reconstrói a venda persistida,
  incluindo itens, modificadores, descontos, entrega e pagamentos múltiplos, e
  reutiliza `printVenda` com a marcação de segunda via. O perfil da empresa é
  carregado sob demanda para manter cabeçalho, logo e rodapé do recibo.

- Layout de Relatórios (2026-08-31): a página deixou de criar, no desktop,
  uma segunda área de rolagem ao lado do relatório. O documento concentra a
  rolagem e a sidebar fica presa ao viewport com `position: sticky`, evitando
  tanto o trilho lateral quanto a navegação sair da tela. O `min-h-full` do
  conteúdo excedia essa workspace e criava uma faixa vazia ao fim; foi removido.
  A correção está somente local e a validação autenticada em localhost confirmou
  que o documento e a workspace terminam juntos. Cobertura direcionada em
  `tests/relatoriosLayout.test.js` e `npm run check` sem diagnósticos. A suíte
  completa está vermelha por dois testes preexistentes de
  `tests/gerente.weekReport.test.js`, sem relação com esta alteração.

- Pedido conversacional WhatsApp (2026-08-30): as cinco migrations forward-only
  `20260829120000_whatsapp_order_canonical_contract.sql`,
  `20260829121000_whatsapp_confirmation_tokens.sql`,
  `20260830195410_whatsapp_confirmation_token_idempotent_issue.sql`,
  `20260830202349_confirm_whatsapp_zelo_order_atomic_v1.sql` e
  `20260830211500_patch_customer_ordering_overrides_atomic.sql` estabelecem o
  carrinho `whatsapp_order`, tokens opacos idempotentes, confirmação atômica
  exclusiva de `create_zelo_order` e overrides CRM server-only. Ainda não foram
  aplicadas no banco compartilhado. Antes do rollout, executar o verifier SQL e
  o probe de concorrência apenas em PostgreSQL descartável local com os opt-ins
  documentados; nunca apontar esses probes à produção.

- Formas de pagamento no relatório (2026-08-29): o fluxo legado do
  ZeloMenu/ZeloChat podia gravar rótulos de apresentação (`Pix`, `Dinheiro`,
  `Cartão de crédito` e `Cartão de débito`) em `vendas.forma_pagamento`,
  enquanto o PDV usa IDs canônicos. `normalizePaymentMethodId` agora unifica
  esses aliases no resumo, na legenda/exportação e nos snapshots históricos;
  IDs de plataformas personalizadas continuam intactos. A migration
  `20260829134640_payment_method_alias_normalization.sql` adiciona a mesma
  proteção na entrada de `vendas`/`vendas_pagamentos`, sem reescrever o
  histórico financeiro. Aplicação no Supabase real ainda está pendente.

- Vale-Refeição (2026-08-28): o pagamento canônico `vale_refeicao` foi
  integrado ao PDV e às três jornadas de Mesas (fechamento único, dividido e
  parcial). A interface exibe **Vale-Refeição** e a impressão usa
  `Vale-refeicao`; não há operadora, taxa, TEF ou alteração no checkout do
  ZeloMenu. O domínio compartilhado evita colisão com plataformas dinâmicas.
  Fechamentos gravam `caixa_fechamentos.totais_pagamento` (JSONB) junto das
  colunas legadas, e Caixa, Período, PDF, Excel, recibos, WhatsApp e
  Intelligence mantêm o valor separado de dinheiro, cartões, Pix e fiado.
  Migration preparada em
  `supabase/migrations/20260828120000_caixa_payment_totals.sql`; aplicar após
  preflight de colisões no banco de produção.

- ZeloMenu — prazo de entrega manual (2026-08-29): a migration
  `20260830002037_zelomenu_delivery_estimated_minutes.sql` foi aplicada e
  registrada no Supabase real. `empresa_perfil.zelomenu_delivery_estimated_minutes`
  é anulável e aceita somente 1–1440; nulo não exibe prazo ao cliente. A nova
  sobrecarga service-role da RPC `save_zelomenu_delivery_settings` preserva a
  assinatura anterior para clientes ainda atualizando. O ZeloMenu configura um
  único valor em minutos, não o calcula mais pelo raio, mostra-o apenas no
  fluxo de delivery e preserva o valor quando um painel antigo salva outras
  configurações. Verificado no banco: coluna, constraint e execute apenas para
  `service_role`; no ZeloMenu: typechecks client/server, 365 testes e build.

- Índices do CRM compartilhado (2026-08-26): a migration
  `20260826131437_060_customer_crm_fk_indexes.sql` adiciona índices para as
  FKs e buscas owner-scoped usadas por Clientes, campanhas e automações. Ela é
  aditiva/idempotente, mantém o acesso de browser negado às tabelas de CRM e
  já está aplicada no Supabase real; o ledger local está íntegro.

- Vínculos CRM em pedidos (2026-08-25): a migration
  `20260825123000_customer_order_links.sql` adiciona `zelo_orders.pessoa_id`
  com vínculo anulável ao cadastro mestre, índice para histórico por cliente e
  validação owner-scoped na criação canônica. A exclusão de pessoa quitada
  preserva vendas, pedidos, snapshots e razão financeiro, removendo apenas os
  vínculos vivos; a tela Pessoas explica que vendas e pedidos permanecem sem
  vínculo. A validação de runtime no Postgres segue pendente enquanto o Docker
  local não está disponível.

- Identidade canônica de Clientes (2026-08-25): a primeira fundação do CRM
  ficou versionada no PDV em `20260825120000_customer_identity_foundation.sql`.
  `pessoas` continua sendo o cadastro mestre; aniversários e `updated_at` foram
  adicionados, `pessoa_identities` é owner-scoped e a resolução server-only do
  WhatsApp usa lock transacional, preservando o nono dígito e evitando conflito
  com funcionários. A tela Pessoas exibe/persiste aniversário e Acessos lista
  `clientes.comunicar`. A validação de runtime ainda precisa ser executada em
  um banco vinculado antes de qualquer aplicação em produção.

- Separação de visibilidade PDV/ZeloMenu (2026-08-24):
  `produtos.ocultar_no_pdv` é exclusivamente a visibilidade interna do
  ZeloPDV; `zelomenu_product_publications.visivel_online` e
  `pausado_manualmente` são o contrato do cardápio digital para clientes.
  A migration forward-only
  `20260824134536_catalog_visibility_separation_guard.sql` registra essa
  fronteira sem alterar linhas de produtos/publicações. O guardrail de testes
  rejeita migrations que copiem um campo para o outro. A Bem Servido não teve
  dados de cardápio alterados nesta correção.
- Validação da rodada (2026-08-24): `svelte-check` passou com 0 erros/0
  warnings; o guardrail focado passou. A suíte completa teve 113/114 arquivos
  e 710/711 testes, com um timeout isolado em
  `tests/guards.zelomenu.test.js`; a mesma suíte isolada passou (7/7). O build
  concluiu com o warning preexistente de `src/hooks.client.js`.

- Migração Vercel Node.js 24 (2026-08-20): os projetos `zelopdv` e
  `zelopdv-admin` estão confirmados em runtime `24.x` nas configurações Vercel.
  Os commits `743545c`, `5908aef`, `1114c0d` e `228ad99` atualizam o contrato
  de runtime e a documentação, incluindo `@sveltejs/adapter-vercel` explícito
  com `nodejs24.x` no app principal e no admin. Os previews finais estão
  `READY` e os logs não mostram falhas de runtime. A promoção para produção foi
  concluída via `origin/main` no commit integrado `4cc0599`: o app principal
  (`dpl_8v5sq3HWxijrNS2fm6cG4ufFWXX1`) e o admin
  (`dpl_59mYocX714FCyQ6Vc8xtCy8mL2kd`) ficaram `READY`, e as páginas públicas
  verificadas responderam HTTP `200`. O smoke autenticado permanece pendente
  por falta de conta dedicada.

- Simplificação estrutural pós-auditoria (2026-08-20): `ConfirmDialog` agora
  usa `<dialog>` nativo com foco inicial, Escape e retorno ao gatilho; guards de
  assinatura foram consolidados sem alterar seus contratos públicos; wrappers
  `alert-dialog`/`separator`, o rail sem consumidores e helpers de impressão
  sem consumidores foram removidos. O Iconify do Pix foi preservado conforme
  decisão do produto. `npm run check`: 0 erros/0 warnings. `npm test`: 113
  arquivos / 709 testes passando. `npm run build`: bundles e precache PWA
  concluídos; adapter Vercel segue falhando apenas no symlink Windows `EPERM`.

- PIN administrativo opcional (2026-08-20): `empresa_perfil.pin_enabled` agora
  representa explicitamente se a proteção está ativa. O titular pode ativar o
  PIN com um novo valor ou desativá-lo mediante o PIN atual; “Continuar sem
  PIN” grava `pin_admin = null` e `pin_enabled = false`, sem criar `0000`.
  Relatórios e Despesas aguardam o status server-side e falham fechado quando
  o endpoint está indisponível. A migration idempotente
  `20260820154751_admin_pin_optional.sql` garante a coluna em ambientes que
  ainda não a possuem. `.env.local` recebeu a chave service-role apenas para o
  dev server e permanece ignorado pelo Git.

- Refinamento cirúrgico de interface e acessibilidade (2026-08-20): Produtos
  não repete a contagem no cabeçalho; a árvore de categorias separa foco de
  seleção, expansão e menu; o Zelinho Rail global foi removido e o assistant
  retorna foco ao gatilho contextual. Overlays principais usam dialogs
  acessíveis, labels/controles foram associados e `npm run check` termina com
  0 erros e 0 warnings. A paleta/rebranding permanece fora desta rodada.
  A suíte completa atual passa com 113 arquivos / 709 testes. `npm run build`:
  compilação SSR/client e precache PWA
  concluídos; o adapter Vercel falha apenas no symlink local do Windows
  (`EPERM`).

- Dev server — falso prompt de configuração do PIN (2026-08-20): o layout global
  tratava falha, ausência de resposta ou payload incompleto de
  `/api/auth/admin-pin` como PIN inexistente. Isso fazia a prévia local abrir o
  modal mesmo para contas configuradas. `shouldPromptPinSetup` agora exige a
  confirmação explícita `{ configured: false, canSet: true }`; o caso de erro
  fica fechado e coberto por teste direcionado.

- Fichário — cartões da lista lateral com poucos registros (2026-08-20): no
  desktop, `.people-list` continua ocupando a altura disponível para manter a
  rolagem previsível, mas `align-content: start` impede que as linhas implícitas
  do grid estiquem um cartão único ou poucos cartões até cobrir toda a barra
  lateral. O problema foi reproduzido na tela publicada com 1 pessoa (cartão de
  576px para uma lista de 576px); teste de regressão direcionado passa no código.

- Incidente resolvido — Mesas travadas em producao (2026-08-14): todas as
  comandas recusavam item, fechamento e cancelamento com
  `Comanda aberta nao encontrada`. A flag `v_service` das tres RPCs de comanda
  criadas em `20260812234500` era um boolean de tres valores, porque
  `current_setting('request.jwt.claim.role', true)` devolve NULL no PostgREST
  atual; com isso o owner nunca era resolvido e o predicado da comanda virava
  NULL. `20260814200000_mesas_comanda_rpc_service_flag_fix.sql` corrige a
  deteccao com `coalesce(current_setting('role', true) = 'service_role', false)`
  e exige `v_owner` nao nulo, sem tocar no contrato de capabilities. Aplicada em
  producao e confirmada pelo cliente. Detalhe em INC-2026-08-14-01.

- Varredura do mesmo defeito (2026-08-14): o GUC morto deixava o bypass de
  service_role inerte em mais quatro triggers RBAC. Nos dois de Mesa era inocuo;
  nos dois de vendas era o proximo "prod down" latente, porque a primeira rota
  server-side a criar venda ou desconto com service key cairia em
  `Usuario nao autenticado`. `20260814210000` padroniza a deteccao nos quatro e
  corrige as mensagens com acento duplamente codificado que chegavam ilegiveis
  ao operador. Aplicada em producao; DT-SEC-02 fechado. O caminho SECURITY
  DEFINER de `criar_venda_completa` continua exigindo `pdv.vender` +
  `pdv.receber`, coberto por teste.

- Governanca de migrations (2026-08-14): `[db.migrations] enabled` virou `true`
  em `supabase/config.toml` por decisao do dono do repo, e
  `supabase db push --linked` volta a ser o fluxo normal de deploy de banco.
  `scripts/verify-supabase-baseline.ps1` foi ajustado para nao depender mais do
  flag estar `false`. Rodar `--dry-run` antes de todo push. O baseline
  `20260813091000` ficou defasado em duas versoes; nova captura pendente.

- Acesso de leitura ao banco de producao (2026-08-14):
  `supabase db query --linked "<sql>"` reaproveita a sessao ja logada do CLI
  via Management API, sem precisar de Docker nem de token novo. Confirmado com
  leitura real em producao. Resultado sempre vem com um bloco `<boundary>`
  marcado como dado nao confiavel.

- `npm run verify:migrations` investigado e parcialmente corrigido (2026-08-14):
  falhava por dois motivos independentes. (1) 56 arquivos versionados tinham
  CRLF fantasma na working tree desta maquina Windows, mascarado do `git
  status` normal pelo cache de stat do indice — conteudo identico ao HEAD,
  corrigido reescrevendo os bytes exatos via Node (`git checkout` nesta maquina
  reintroduz CRLF, confirmado). Suite completa 695/695 depois da correcao; nada
  para commitar, porque os arquivos ja eram identicos ao commitado. (2) o
  manifest do baseline trava hash de `README.md` e `config.toml`, que mudaram
  ontem por decisao sua; recaptura completa exige Docker (indisponivel nesta
  maquina). Sem impacto real: o script nao esta encadeado em build/test/deploy.
  Detalhe em DT-DEV-01 e DT-DEV-02 em [[TRADEOFFS]].
- Impressao do Zelo Menu no cupom (2026-08-13): `src/lib/escpos.js` e
  `src/lib/receipt.js` agora preservam e exibem descricao, grupos de
  modificadores e opcoes da montagem em linhas separadas no cupom ESC/POS e no
  fallback HTML. O formato segue o padrao estruturado do Zelo Chat e cobre o
  recebimento automatico dos pedidos sem alterar o payload ou o banco.

- Meta ativa do audit de arquitetura (2026-08-13): o escopo foi congelado em
  `docs/projects/architecture-audit-implementation.md`. P0 e reliability de
  webhooks estão concluídos; a reconciliação integral de migrations também foi
  encerrada com 107/107 artefatos classificados, baseline PG17 reproduzível,
  dump/ACL/policies e configuração Storage/Realtime com diff zero e dry-run
  linked sem pendências. O P0 de Storage revelado pela captura também foi
  contido pela migration `20260813092000`: anon/auth perderam upload, listagem e
  delete em `zelochat-media`; service-role e GET público foram preservados, com
  zero fixtures residuais. A primeira fatia RBAC residual também foi encerrada:
  a migration `20260813093000` exige `pdv.cancelar` dentro de
  `fiado_estornar_venda`, após o probe live provar que um papel sem a capability
  conseguia alterar saldo/ledger; owner, papel autorizado, negados, super-admin,
  anon e service-role passaram e não restou fixture. A leitura dos pedidos
  canônicos também foi confirmada e contida pela migration `20260813094000`:
  owner e papéis `pedidos.acessar`/`pedidos.cozinha` mantêm orders/items/events,
  papéis sem leitura foram bloqueados e suas RPCs de ação continuaram válidas.
  Matriz SQL, Data API nested, Realtime, benchmark e zero resíduo passaram.
  O último boundary RBAC, no assistant, também foi verificado: nenhum uso
  histórico foi atribuído a subusuário atual, e o endpoint agora exige
  `relatorios.ver` antes de qualquer leitura financeira com service-role ou
  ferramenta de WhatsApp. Owners e papéis autorizados permanecem. Restam a
  verificação operacional do sweeper de deleção, mutações críticas confirmadas
  do ZeloAdmin e auditoria final. Request
  IDs, structured logging, rate limiting compartilhado, decomposição de
  componentes, dependency cleanup e redesign de confirmação por IA estão
  explicitamente fora da meta. A matriz RBAC 31/31 e a evidência de fechamento estão
  em `docs/operations/RBAC-CAPABILITY-INVENTORY-2026-08-13.md`. Evidência da reconciliação:
  `supabase/baselines/20260813091000/README.md`. O lint de banco continua
  reproduzindo dois findings preexistentes em `criar_venda_completa` e
  `save_zelomenu_delivery_settings`; nenhum foi mascarado ou alterado nesta
  entrega de preservação de comportamento. `npm run build` completou as
  transformações client/server, mas o adapter Vercel terminou vermelho neste
  Windows com `EPERM` ao criar o symlink `.vercel/output/functions/index.func`;
  é uma limitação local de permissão de symlink e permanece registrada.

- RBAC incremental — Zelinho assistant (2026-08-13): o endpoint autenticado
  resolvia qualquer subusuário ativo para o owner e usava service-role para
  vendas, despesas, caixa, fiado, signals e WhatsApp sem capability. O uso live
  agregado mostrou 50 logs históricos, nenhum atribuível a subusuário atual;
  existem 4 subusuários ativos, todos sem `relatorios.ver`. O endpoint agora
  usa `getServerAccessContext` e exige o booleano estrito `relatorios.ver` antes
  de qualquer leitura privilegiada. Owners e papéis autorizados passam; UI,
  assinatura, prompts, rate limit e banco não mudaram. TDD RED→GREEN, 656/656
  testes, typecheck 0 erros/95 warnings e revisão independente aprovados. O
  probe HTTP live ficou bloqueado por um 401 preexistente inclusive para o JWT
  válido do owner e permanece separado desta fatia. Snapshot:
  `docs/operations/ASSISTANT-SERVER-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — leitura de pedidos canônicos (2026-08-13): produção
  confirmou que as policies owner-scoped de `zelo_orders`,
  `zelo_order_items` e `zelo_order_events` deixavam qualquer subusuário ativo
  do tenant ler customer/payment/itens/auditoria. A migration forward-only
  `20260813094000_canonical_orders_select_rbac.sql` preserva owner e restringe
  leitura browser a `pedidos.acessar` ou `pedidos.cozinha`; papéis apenas de
  recebimento/cancelamento continuam executando suas RPCs sem leitura direta.
  Grants, funções, publication Realtime e writes não mudaram. Matriz linked,
  Data API nested e Realtime passaram para owner/acesso/cozinha e negaram o
  action-only; benchmark de 1.000 orders passou de 1,438 ms para 1,852 ms com
  InitPlan. Suíte 654/654 e typecheck 0 erros/95 warnings conhecidos. Snapshot:
  `docs/operations/CANONICAL-ORDERS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — histórico de vendas (2026-08-13): a revalidação remota
  confirmou que um cargo só de Pedidos lia `vendas` e `vendas_itens`. A
  migration forward-only `20260813090000_sales_history_read_rbac.sql` exige
  capacidades legítimas de PDV, Mesas, Caixa, Relatórios ou Fichário e remove
  SELECT anônimo. A companion forward-only
  `20260813091000_sales_history_read_rbac_performance.sql` mantém a mesma
  autorização, mas resolve a união de capabilities uma vez por statement e
  delega itens à policy da venda-pai; o benchmark representativo caiu de
  731,117 ms para 7,593 ms. A matriz de atores e writes foi repetida após a
  companion. O Dashboard continua owner-only na prática, writes e service-role
  não mudaram; matriz/rollback em
  `docs/operations/SALES-HISTORY-READ-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — pagamentos de venda e movimentações de caixa
  (2026-08-13): a revalidação remota mostrou que um cargo sem capacidades
  financeiras lia `vendas_pagamentos` e `caixa_movimentacoes`. A migration
  forward-only `20260813080000_sales_payment_cash_read_rbac.sql` exige as
  capabilities legítimas de PDV, Mesas, Caixa ou Relatórios e revoga SELECT
  anônimo; writes, `vendas`/`vendas_itens` e service-role permanecem. Matriz
  transacional e rollback em
  `docs/operations/SALES-PAYMENT-CASH-READ-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — taxas de plataforma (2026-08-13): a revalidação remota
  confirmou que um subusuário sem `caixa.ver`/`relatorios.ver` lia
  `vendas_taxas_plataforma` pela Data API. A migration forward-only
  `20260813070000_vendas_taxas_select_rbac.sql` exige uma dessas capabilities,
  revoga SELECT anônimo e mantém writes, tabelas de venda, owners,
  super-admins e service-role. O relatório e a tela de Caixa continuam com o
  caminho legítimo; snapshot em
  `docs/operations/VENDAS-TAXAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- Security containment — `empresa_perfil.pin_admin` (2026-08-13): a
  revalidação remota mostrou que o grant de tabela permitia a um subusuário
  pedir o PIN diretamente pela Data API, apesar do fluxo normal já usar o
  endpoint server-side. A migration forward-only
  `20260813060000_empresa_perfil_pin_select_containment.sql` troca o SELECT de
  `anon`/`authenticated` por colunas explícitas sem `pin_admin`; os dois
  wildcards do PDV foram reduzidos aos campos que realmente usam. Policies,
  writes, owners, subusuários, super-admins e service-role foram preservados.
  Snapshot: `docs/operations/EMPRESA-PERFIL-PIN-SELECT-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — leitura de Mesas (2026-08-13): a revalidação remota
  confirmou que um subusuário sem `mesas.acessar` conseguia ler mesas,
  comandas, itens e pagamentos parciais da empresa pela Data API. A migration
  forward-only `20260813050000_mesas_select_rbac.sql` exige a capability nas
  leituras privadas, mantém `relatorios.ver` somente para o resumo de
  comandas usado por `/relatorios` e revoga grants anônimos sem consumidor.
  Owner, subusuário autorizado, report-only, super-admin fora do tenant e
  service-role foram verificados em smoke transacional; a fixture e as
  permissões temporárias foram revertidas. Snapshot:
  `docs/operations/MESAS-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — Zelinho Gerente (2026-08-13): a revalidação remota
  confirmou que as policies owner-scoped de `business_signals` e
  `business_daily_snapshots` deixavam um subusuário sem `relatorios.ver` ler
  sinais/snapshots e marcar `business_signals.read_at` como lido pela Data
  API. A migration forward-only
  `20260813043000_gerente_reports_rbac.sql` exige a capability existente nas
  três policies e `appNavigation` passou a esconder o Zelinho para o mesmo
  contexto sem permissão. Owner, subusuário autorizado, super-admin fora do
  tenant, anon e service-role foram verificados em smoke transacional; a
  fixture foi revertida. Snapshot:
  `docs/operations/GERENTE-REPORTS-RBAC-SNAPSHOT-2026-08-13.md`.

- RBAC incremental — integridade do `access_audit_logs` (2026-08-13): a
  revalidação remota reproduziu que um subusuário podia forjar um evento sob o
  `owner_user_id` de outra empresa, pois a policy aceitava apenas
  `operator_user_id = auth.uid()` como alternativa. A migration forward-only
  `20260813041000_access_audit_logs_tenant_guard.sql` exige operador autenticado
  e owner resolvido pelo helper existente, preservando o helper browser,
  writes service-role, leituras, grants e dados existentes. O smoke
  cross-tenant/same-tenant foi transacional e revertido. Snapshot:
  `docs/operations/ACCESS-AUDIT-LOGS-TENANT-GUARD-SNAPSHOT-2026-08-13.md`.
  O setup E2E com `kdo.vini@gmail.com` resetou e limpou o tenant dedicado,
  mas o harness local voltou a ficar em `/login` após renderizar o app e
  excedeu o timeout de navegação; isso é a mesma flakiness de ambiente já
  registrada, não evidência contra a policy. A matriz SQL de produção é a
  validação autoritativa desta fatia.

- RBAC incremental — leitura do ledger de fiado (2026-08-13): a revalidação
  remota reproduziu que Caixa/Atendente sem `fiado.visualizar` conseguiam ler
  `fiado_lancamentos` diretamente pelo Data API, embora a navegação escondesse
  o Fichário. A migration forward-only
  `20260813034000_fiado_ledger_select_rbac.sql` adiciona a capability à policy
  SELECT, preserva owner, Gerente, service-role, RPC de recebimento e leitura
  operacional de `pessoas.saldo_fiado`. Smoke remoto cobriu owner, subusuário
  com/sem permissão, super-admin e anon sem persistência. Snapshot:
  `docs/operations/FIADO-LEDGER-SELECT-RBAC-SNAPSHOT-2026-08-13.md`.

- Contencao incremental — RPCs SECURITY DEFINER (2026-08-13): a
  revalidacao remota confirmou que `saldo_caixa(bigint)` podia ser executada
  por `anon`/`authenticated` e calculava saldo de qualquer caixa sem guard de
  tenant; `get_user_id_by_email(text)` tambem retornava UUIDs de `auth.users`
  sem consumidor no repositorio. A migration forward-only
  `20260813033000_rpc_security_definer_containment.sql` remove EXECUTE de
  `public`/`anon`/`authenticated` nesses dois RPCs e preserva `service_role`.
  O RPC `add_empresa_membro_por_email(integer,text,text)` tinha consumidor
  browser identificado, entao somente `public`/`anon` foram removidos; o
  grant autenticado, a definicao e o guard owner/admin permanecem. Snapshot:
  `docs/operations/RPC-SECURITY-DEFINER-CONTAINMENT-SNAPSHOT-2026-08-13.md`.
  A producao confirmou anon negado nos tres, authenticated negado nos dois
  server-only e service-role executando os dois sem persistencia. O banco nao
  possui linhas em `empresas`/`empresa_usuarios`, portanto nao foi possivel
  executar um caso owner positivo do legado de membership sem fabricar uma
  fixture; o grant autenticado e a funcao foram preservados sem alteracao.

- Validacao da contenção RPC (2026-08-13): `npm test` passou com 96 arquivos e
  619 testes; `npm run check` passou com 0 erros e 95 avisos preexistentes.
  `npx supabase db lint --linked` manteve somente os dois erros conhecidos de
  `save_zelomenu_delivery_settings`/`criar_venda_completa`, e o advisor de
  seguranca nao reportou mais execucao anonica de `saldo_caixa` ou
  `get_user_id_by_email`. O setup E2E com a conta permanente informada pelo
  usuario passou 2/2 (autenticacao + cleanup), sem persistir senha.

- Contencao incremental — `billing_payments` server-only (2026-08-13): a
  revalidacao remota confirmou que a policy `billing_payments_self_insert`
  permitia que qualquer autenticado criasse uma linha de cobranca arbitraria
  para si pelo Data API, embora nenhum consumidor browser exista. A migration
  forward-only `20260813032000_billing_payments_server_insert_only.sql`
  revoga somente INSERT de `anon`/`authenticated`; SELECT do titular e os
  writes service-role dos fluxos Pix/webhook permanecem iguais. Snapshot:
  `docs/operations/BILLING-PAYMENTS-INSERT-SNAPSHOT-2026-08-12.md`.

- E2E pos-migration (2026-08-13): a conta permanente informada pelo usuario
  foi usada sem persistir a senha. O cleanup dedicado passou, mas o setup do
  Playwright excedeu 30s esperando a URL apos o login, apesar do snapshot
  mostrar a sessao autenticada no app. Trata-se de falha/flakiness do setup
  local, nao de autorizacao do billing; nao foi feito cleanup de UI por causa
  disso. `npm run build` tambem nao concluiu neste Windows porque o
  `adapter-vercel` nao conseguiu criar um symlink em `.vercel/output`
  (`EPERM`); o typecheck e a suite Vitest continuam verdes.

- RBAC incremental — desconto POS (2026-08-12): a revalidacao remota confirmou
  que `pdv.desconto` era apenas gate de UI: um subusuario com venda/recebimento
  conseguia inserir venda com desconto positivo pelo Data API. A migration
  forward-only `20260813030000_discount_rbac.sql` adiciona trigger estreito
  para INSERT/UPDATE de desconto, preserva desconto zero, fechamento de Mesa,
  owner e service-role. Snapshot:
  `docs/operations/DISCOUNT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — extensoes de catalogo ZeloMenu (2026-08-12): a
  revalidacao remota confirmou que um subusuario sem `produtos.gerenciar`
  conseguia alterar grupos/opcoes de modificadores, vinculos opcao-produto e
  publicacoes pelo Data API. A migration forward-only
  `20260813020000_catalog_extensions_rbac.sql` exige a capability nas escritas,
  preserva os checks de ownership dos pais, as leituras do cache POS, grants,
  service-role e o fluxo existente de produto. Snapshot:
  `docs/operations/CATALOG-EXTENSIONS-RBAC-SNAPSHOT-2026-08-12.md`.
  `npm test` e `npm run check` ficaram verdes. O E2E de autorizacao executou o
  setup e quatro cenarios; um cenario antigo de convite continua vermelho por
  esperar o seletor inexistente `#invite-role`, sem relacao com esta migration.

- RBAC incremental — leitura de fechamentos de caixa (2026-08-12): a
  revalidação remota confirmou que um subusuário sem `relatorios.ver` ainda
  conseguia ler `caixa_fechamentos` diretamente pelo Data API, apesar do gate
  client-side de `/relatorios`. A migration forward-only
  `20260813010000_reports_select_rbac.sql` exige a capability na policy SELECT,
  revoga o grant anônimo sem consumidor e preserva owner, relatório autorizado,
  service-role e os caminhos operacionais compartilhados. Snapshot:
  `docs/operations/REPORT-SELECT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — criação de vendas (2026-08-12): a revalidação remota
  confirmou que `criar_venda_completa(jsonb)` e o INSERT direto de `vendas`
  aceitavam subusuários sem `pdv.vender`/`pdv.receber`. A migration forward-only
  `20260813000000_sales_creation_rbac.sql` adiciona guard BEFORE INSERT,
  preserva o INSERT direto de fechamento de Mesa somente com `mesas.fechar`,
  mantém service-role e contratos existentes e revoga EXECUTE anônimo da RPC.
  Snapshot: `docs/operations/SALES-CREATION-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — operação de Mesas (2026-08-12): a revalidação remota
  confirmou que o Atendente, sem `mesas.fechar`/`mesas.cancelar`, conseguia
  alterar diretamente status de comanda/mesa e campos de fechamento por
  policies apenas owner-scoped. A migration forward-only
  `20260812233000_mesas_operational_rbac.sql` separa INSERT/DELETE de
  comandas, mutações de itens e guards de transição/fechamento por
  `mesas.abrir_comanda`, `mesas.editar_itens`, `mesas.fechar` e
  `mesas.cancelar`, mantendo grants, service-role e leituras fora desta fatia.
  A migration complementar `20260812234500_mesas_operational_rpc_rbac.sql`
  resolveu owner de subusuário e capabilities nas três RPCs de estoque já
  consumidas pelo browser, sem alterar seus contratos. Snapshot:
  `docs/operations/MESAS-OPERATIONAL-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — pagamentos parciais de Mesas (2026-08-12): o schema remoto confirmou que um Atendente sem `pdv.receber`/`pedidos.receber` podia inserir pagamentos owner-scoped em `comanda_pagamentos`. A migration `20260812230000_mesas_payment_rbac.sql` exige `mesas.acessar` e uma capacidade de recebimento para INSERT/UPDATE/DELETE nos pagamentos parciais e no ledger `comanda_pagamento_itens`. SELECT, fechamento completo, comandas/itens, grants e service-role ficaram fora desta fatia. Smoke transacional cobriu owner, Atendente sem receber, subusuário temporariamente autorizado, anon, super-admin e service-role; nenhum fixture persistiu. Snapshot: `docs/operations/MESAS-PAYMENT-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — cancelamento de vendas (2026-08-12): o schema remoto
  confirmou que subusuários podiam editar/remover vendas, itens, pagamentos e
  taxas apenas por estarem no tenant owner, ignorando `pdv.cancelar`. As
  migrations `20260812210856_sales_cancel_rbac.sql` e
  `20260812211428_sales_cancel_helper_grant_fix.sql` exigem a permissão para
  mutações pós-criação e preservam somente o rollback de Mesa para venda vazia,
  recente e criada pelo próprio operador. INSERT/criação e leituras não foram
  alterados. Smoke transacional cobriu owner, subusuário sem/com permissão,
  rollback recente/antigo, anon, super-admin e service-role; snapshot:
  `docs/operations/SALES-CANCEL-RBAC-SNAPSHOT-2026-08-12.md`.

- E2E focado pós-cancelamento (2026-08-12): a conta permanente de teste
  autenticou no ambiente local com o tenant configurado; setup, os dois
  cenários de Controle de Acessos e cleanup passaram (4/4). O setup usou a
  chave de serviço somente em memória para semear o fixture, sem persistir
  credenciais ou arquivos no repositório.

- RBAC incremental — caixa (2026-08-12): o schema remoto confirmou que
  subusuários sem `caixa.fechar` podiam alterar/remover caixas e que
  `caixa.movimentar` não era consultada pela policy de movimentações. A
  migration `20260812214518_caixa_role_rbac.sql` exige as capacidades
  existentes, mantém leituras e o comportamento service-role, e preserva a
  criação de histórico de fechamento. Smoke transacional cobriu owner,
  subusuário sem/com capacidades, anon e super-admin; nenhum fixture persistiu.
  Snapshot: `docs/operations/CAIXA-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — `access_users` (2026-08-12): o finding foi confirmado em
  produção e fechado com as migrations forward-only
  `20260812204706_access_users_self_write_containment.sql` e
  `20260812205010_access_users_owner_guard.sql`. Titular mantém CRUD; o
  subusuário mantém apenas self-SELECT para contexto/cargo e não pode alterar
  `role_id`, `owner_user_id` ou `status`, nem remover/criar vínculos. Convite,
  ativação e gestão continuam server-side/service-role. Smoke remoto cobriu
  owner, subusuário, cargo, super-admin, anon e service-role sem persistência;
  snapshot: `docs/operations/ACCESS-USERS-RBAC-SNAPSHOT-2026-08-12.md`.

- RBAC incremental — Pessoas (2026-08-12): a migration
  `20260812202400_pessoas_role_rbac.sql` mantém as leituras owner-scoped usadas
  pelo PDV, Mesas, Fichário e Relatórios, mas exige `pessoas.gerenciar` para
  INSERT/UPDATE/DELETE de subusuários. Titular e Gerente continuam com CRUD;
  Caixa/Atendente não ganham escrita indireta. A página de Pessoas agora grava
  novos cadastros com o `ownerUserId` resolvido do contexto de acesso. Smoke
  remoto transacional cobriu owner, Gerente, subusuário sem permissão, leitura
  compatível, anon e service-role; nenhum dado de produção persistiu. Snapshot:
  `docs/operations/PESSOAS-RBAC-SNAPSHOT-2026-08-12.md`.

- E2E focado pós-Pessoas (2026-08-12): a conta permanente
  `kdo.vini@gmail.com` foi usada com o tenant dedicado; o cleanup remoto
  passou e não ficou manifesto persistido. O setup chegou ao `/app`, mas o
  harness local excedeu o timeout de 30s na asserção de URL do login. Isso não
  é evidência de regressão da policy; a autorização foi coberta pelos smokes
  SQL em produção. O problema do harness continua documentado, sem alteração
  de código para mascará-lo. A repetição pós-`access_users` foi bloqueada no
  setup por `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` ausentes; cleanup passou.

- Segurança/reliabilidade incremental (2026-08-12): `POST /api/account/reactivate` agora falha
  fechada quando o Stripe não consegue retomar a assinatura, preservando a agenda local para retry.
  O schema de produção recebeu o índice parcial `subscriptions_one_live_row_per_user`, mantendo
  histórico terminal e impedindo mais de uma linha viva por titular. O PIN administrativo deixou de
  ser enviado ao browser: status e verificação passam por `/api/auth/admin-pin`, e somente o titular
  pode alterá-lo. A suíte Vitest passou 587/587 e `npm run check` passou com 0 erros/95 avisos
  conhecidos. O lint SQL continua com os dois erros pré-existentes fora desta rodada.

- RBAC incremental (2026-08-12): o catálogo base (`produtos`, `categorias` e
  `subcategorias`) agora exige `produtos.gerenciar` para mutações de
  subusuários no RLS. Owners e o papel Gerente preservam CRUD; Caixa e
  Atendente continuam lendo o catálogo para o PDV, mas não conseguem escrever.
  A migration `20260812195032_products_role_rbac.sql` foi aplicada em produção
  com smoke transacional owner/Caixa/Gerente/anon/service-role e sem linhas
  persistidas. A capacidade separada `estoque.ajustar` foi preservada por
  `20260812200550_catalog_stock_adjustment_rpc.sql`, com a página de Estoque
  usando RPCs que só alteram colunas de estoque. O snapshot está em
  `docs/operations/PRODUCTS-RBAC-SNAPSHOT-2026-08-12.md`.

- Webhook reliability round 2 (2026-08-12): os cenários descritos foram
  confirmados no código e no schema de produção. Stripe agora só registra o
  evento depois dos efeitos locais e propaga falhas de update para permitir
  retry; AbacatePay reabre eventos `received`/`failed`, transforma pagamento
  local ausente em erro retryável em vez de `ignored`; liquidação Pix paga usa
  a RPC transacional `settle_pix_payment`, com lock do pagamento e renovação de
  assinatura no mesmo commit. Testes direcionados passaram (31/31). A migration
  `supabase/migrations/20260812165936_webhook_reliability_pix_atomicity.sql`
  foi aplicada em produção após reconciliação segura do histórico remoto/local.
  O snapshot está em `docs/operations/WEBHOOK-RELIABILITY-SNAPSHOT-2026-08-12.md`;
  o smoke transacional pós-apply confirmou liquidação idempotente e terminou
  com rollback.

- E2E de producao (2026-08-12): a conta informada pelo usuario foi designada
  como tenant dedicado permanente, sem credenciais persistidas no repositorio.
  O setup/teardown Playwright remoto passou 2/2, cobrindo owner e os tres
  subusuarios. A tentativa da suite completa (110 testes) avancou para os
  cenarios, mas encontrou falhas preexistentes do proprio E2E (seletor CSS
  invalido e produto hard-coded ausente); esses cenarios ficaram deliberadamente
  fora deste PR. O fixture foi corrigido para respeitar a restricao de uma
  caixa aberta, evitar corrida de hidratacao no login e limpar apenas IDs do
  manifesto, preservando historico preexistente.

- E2E focado pós-RBAC (2026-08-12): setup e cleanup do tenant dedicado passaram,
  mas o cenário de Gerente que esperava redirecionamento de `/assinatura`
  falhou no servidor local. O dev server registrou `SUPABASE_SERVICE_ROLE_KEY`
  ausente e 500 em `/api/access/audit-login`; isso impede usar esse resultado
  como regressão da policy, já coberta pelo smoke SQL de produção. Não foi
  alterado código para mascarar a falha de ambiente.

- P0 security containment (2026-08-12): a migration forward-only foi preparada
  em `supabase/migrations/20260812150000_p0_security_containment.sql` após
  revalidação do schema remoto. Ela remove grants de cliente nas views
  SECURITY DEFINER sensíveis, torna `user_entitlements` invoker-scoped,
  restringe RPCs administrativas sem consumidor browser a `service_role`,
  mantém os RPCs usados pelo ZeloAdmin com guarda interna de super-admin ativo
  e limita a exposição de `super_admins`. O snapshot pré-mudança está em
  `docs/operations/P0-SECURITY-CONTAINMENT-SNAPSHOT-2026-08-12.md`.
  A matriz transacional anon/authenticated/owner/subuser/super-admin/service-role
  passou no banco vinculado depois do apply. O histórico foi reconciliado sem
  reaplicar SQL histórico; o detalhe está em
  `docs/operations/MIGRATION-HISTORY-RECONCILIATION-2026-08-12.md`. A
  reconstrução de bootstrap das três versões remotas sem SQL local continua
  deliberadamente como trabalho separado.

- Cobertura operacional (2026-08-11): a suíte Vitest passou de 517 para **557/557 testes**
  (78 arquivos), incluindo regras de estoque, pedidos canônicos, impressão automática,
  modifiers, APIs de produtos/acessos/conta e contratos de migrations/RLS/offline. O Playwright
  agora lista **110 testes Playwright** (**108 cenários de produto** em Chromium desktop e Pixel
  mobile, mais setup/teardown), com tenant remoto dedicado,
  seed/reset/cleanup owner-scoped em `e2e/helpers/test-tenant.js`. `npm run check` passou com
  0 erros e 95 avisos conhecidos. A execução transacional remota ainda não foi rodada nesta
  sessão porque as variáveis seguras `E2E_SUPABASE_*`, `E2E_TEST_*` e `E2E_DEDICATED_TENANT`
  não estavam disponíveis; o setup falha explicitamente nesse caso, sem skips novos.

- Fichário — confirmação de pagamento via WhatsApp (2026-08-11): após a RPC
  `fiado_registrar_pagamento_v2` concluir, a ficha exibe um card de sucesso com
  valor recebido, saldo atualizado, impressão opcional e um link `wa.me` com
  mensagem pronta para revisão do operador. O texto diferencia saldo em aberto,
  dívida quitada e crédito disponível; o nome comercial vem de
  `empresa_perfil.nome_exibicao`, sem fallback para “ZeloPDV”. Contatos ausentes
  ou inválidos mantêm o pagamento concluído e exibem atalho para cadastro. Não
  há envio automático nem registro de entrega nesta primeira versão. Testes
  direcionados: 4/4; `npm run check`: 0 erros / 95 avisos conhecidos. `npm run
  build` compila os bundles, mas a etapa final do adapter Vercel permanece
  bloqueada pelo EPERM de symlink conhecido no clone Windows.

- Fichário — hierarquia do CTA de pagamento (2026-08-11): o botão superior
  `Receber pagamento` é um gatilho secundário para abrir o formulário e aparece
  apenas quando ele está fechado no desktop; o botão final `Registrar pagamento`
  fica dentro do formulário. O mobile preserva o gatilho como abertura do bottom
  sheet. Em larguras de laptop, o formulário usa duas colunas para valor e
  previsão, com as opções e o botão em linhas próprias; os campos têm largura
  limitada ao grid para evitar sobreposição.

- Fichário — formatação da confirmação no WhatsApp (2026-08-11): a mensagem
  agora usa quebras CRLF com blocos em branco, marcação de negrito do WhatsApp
  para pagamento/situação e não envia emojis, evitando o caractere `�` no link
  `wa.me`.

- PDV — navegacao desktop com caixa fechado (2026-08-10): o modal
  `Abrir Caixa` continua bloqueando a frente de caixa, mas a sidebar desktop
  permanece acessivel para navegar para Gestao, Financeiro, Relatorios e
  Perfil. O comportamento mobile existente foi preservado. `npm run check`:
  0 erros / 95 avisos conhecidos; requer deploy do frontend para producao.

- Admin — exclusao de usuarios com historico de fiado (2026-08-09): a RPC
  `admin_delete_user` delega para `delete_account`, que agora remove os
  `fiado_lancamentos` da conta antes de apagar `pessoas` e `auth.users`.
  Isso corrige no banco o erro de FK `fiado_lancamentos_id_pessoa_fkey` na
  tela `/users`, inclusive para exclusoes em lote. A migration
  `supabase/history/observed-local/account_deletion_fiado_2026_08_09.sql` foi aplicada via
  Supabase CLI no projeto vinculado e verificada por introspeccao do corpo da
  funcao, ordem dos deletes e grants. Nenhuma conta foi apagada durante a
  correcao. Teste direcionado: 1/1; `npm test`: 513/513; `npm run check`:
  0 erros / 96 avisos conhecidos; `cd admin-dashboard && npm run build`:
  concluido.

- Meta Pixel da LP (2026-08-07): o rastreamento de navegador e o fallback
  `noscript` agora usam o pixel `904797296018757`; a API de Conversões foi
  alinhada ao mesmo ID para manter o funil consistente. O carregamento segue
  a fila local existente e baixa o script externo em idle.

- Fichário (2026-08-04): corrigida a rolagem desktop da lista de pessoas e do
  detalhe do usuário. A tela agora usa uma única rolagem previsível por coluna
  (lista à esquerda e detalhe completo à direita), sem rolagens aninhadas no
  extrato. O grid desktop também força os painéis a ocuparem a altura
  disponível, evitando que o conteúdo cresça além da área rolável. O workspace
  foi limitado ao breakpoint desktop, para que no mobile a página continue
  usando a rolagem natural do conteúdo.

- Mesas/pagamento parcial (2026-08-03): confirmado que o fluxo existente ja
  registrava pagamentos parciais por valor e recalculava o saldo quando novos
  itens eram adicionados. O modulo agora tambem permite selecionar quantidades
  por item, impede sobrealocacao no cliente e no banco, preserva a relacao item
  -> pagamento -> venda no fechamento e corrige a impressao de mesa para separar
  couvert/taxa de servico de taxa de entrega. A migration foi aplicada via
  Supabase CLI no projeto vinculado; `npm run check` terminou com 0 erros/96
  avisos conhecidos e os testes direcionados passaram 38/38.

- Mesas/RLS (2026-08-03): auditoria do fechamento encontrou policies de INSERT
  que comparavam `auth.uid()` diretamente com o owner e bloqueavam subusuarios.
  A migration `20260803170000_mesas_owner_scoped_payment_policies.sql` agora
  usa `get_owner_user_id(auth.uid())` para comanda_pagamentos, vendas,
  vendas_itens e vendas_pagamentos; aplicada via Supabase CLI e verificada no
  schema vinculado.

- QA local do logo (2026-08-03): corrigido o encaixe do logo do header para `object-fit: contain`, mantendo a marca inteira em desktop e mobile. Dev server validado em 127.0.0.1:5173, sem overflow horizontal nem erros de console; nenhuma publicação em produção foi feita.

- Performance da home pública (2026-08-03): o Supabase e o modal de PIN deixaram o bundle inicial do layout por imports dinâmicos; em páginas públicas, a autenticação também aguarda 5s para não competir com a primeira pintura, enquanto rotas protegidas continuam carregando-a imediatamente. GTM, gtag e Meta Pixel mantêm suas filas locais e carregam scripts externos em idle, sem preconnect prematuro. O logo da home ganhou recorte, dimensões e `fetchpriority="high"`; screenshots abaixo da dobra usam WebP responsivo em 800/1600 px e mantêm PNG apenas como fallback. `npm run check`: 0 erros / 96 avisos conhecidos. O build compila os bundles, mas a etapa final do adapter Vercel continua falhando pelo `EPERM` de symlink conhecido no clone Windows.

- Limpeza de overengineering (2026-08-01): removidos o `ToastContainer` legado sem referências, exports/funções sem chamadas (`platformTotalsFromPayments`, `estoqueLabel` e wrappers simples de follow-up), props não consumidas de `ModalPagamento` e duas dependências duplicadas de ícones/Playwright. Os scripts de screenshot continuam usando `chromium` via `@playwright/test`; nenhuma regra de negócio foi alterada. Validação: `npm run check` com 0 erros / 96 avisos conhecidos e `npm test` com 497/497 testes.

- Modais acima da bottom navbar (2026-08-01): a varredura da pasta `src/lib/components/modals` e dos overlays equivalentes em rotas/componentes encontrou modais de produtos montáveis, modificadores, alert dialogs, PIN, perfil, acessos, onboarding, mesas e confirmação que poderiam perder a área inferior no mobile. O shell global agora reserva `--mobile-bottom-nav-offset` para esses overlays e limita seus painéis à altura útil, mantendo desktop/tablet inalterados. Validação: `npm run check` em 0 erros / 99 avisos conhecidos e `npm test` em 497/497.

- Comanda mobile acima da bottom navbar (2026-08-01): o drawer da comanda em `/app` agora reserva `--mobile-bottom-nav-offset` na base quando aberto no celular. O rodapé com tipo de pedido, subtotal, limpeza e `Receber` permanece acessível acima da navbar fixa; o layout desktop e a lógica de venda não foram alterados. Validação: `npm run check` em 0 erros / 99 avisos conhecidos e `npm test` em 497/497.

- Zelinho — auditoria adicional de datas (2026-08-01): os defaults do contexto sazonal e do resumo semanal agora usam a data de negócio em `America/Sao_Paulo`, evitando troca antecipada de dia/semana no rollover UTC. UTC permanece apenas nos cálculos determinísticos de chaves de data e timestamps técnicos. Cobertura adicionada para 23h30 BRT; sem alteração de schema ou dados.

- Zelinho — despesas na virada do mês (2026-07-31): corrigido o contexto financeiro do assistente. O período mensal agora usa os limites do fuso `America/Sao_Paulo`, evitando que o servidor UTC troque para o mês seguinte antes do Brasil; receita e despesas do resultado operacional aproximado usam o mesmo mês local. Despesas e receitas financeiras passaram a ser paginadas, e o contexto inclui quantidade, categorias, participação na receita e categoria mais pesada. Validação na Apex Burgers: 118 vendas / R$ 7.274,30 e 7 despesas / R$ 7.431,00 no mês local; testes direcionados 35/35 e `npm run check` 0 erros / 99 avisos conhecidos.

- Navegação mobile autenticada (2026-07-31): o hamburger/drawer do `GestaoSidebar` foi substituído, abaixo do breakpoint existente `md` (768px), por uma bottom navbar global com PDV, Gestão, Financeiro, Outros e Perfil. Desktop continua consumindo a sidebar; as duas apresentações usam a fonte única `src/lib/navigation/appNavigation.js`, que preserva as permissões de subusuário, os entitlements de Mesas/ZeloMenu/Acessos, o badge dinâmico do Zelinho, o suporte e o logout existentes. `MobileBottomNav.svelte` resolve rotas filhas pelo item compatível mais específico, fecha em navegação/Escape/back, respeita safe area, teclado virtual e reduced motion; layouts autenticados, toasts, atualização PWA, chat de suporte e o drop-up de Produtos usam os mesmos tokens de offset. Validação: `npm run check` em 0 erros / 95 avisos conhecidos; `npm test` em 491/491. O build compilou os bundles e PWA, mas a etapa final do adapter Vercel repetiu o `EPERM` conhecido do clone Windows ao criar symlink em `.vercel/output`. QA visual responsivo realizado em 390×844, 360×740 e 1024×768.

- Elevação de modais (2026-07-31): o design system passou a expor `--shadow-modal` em `src/themes/base.css`. O shell global `.modal-content`, o modal de complementos e os principais modais/diálogos do app usam o mesmo token para separar a superfície do backdrop sem alterar overlays, z-index, handlers ou regras de negócio.

- Ações contextuais de categorias (2026-07-31): a árvore de categorias e subcategorias em `/gestao/produtos` usa o mesmo padrão de três pontos da lista de produtos; editar e excluir ficam dentro do menu contextual, sem alterar os handlers nem a seleção da categoria.

- Cadastro de produtos (2026-07-31): a listagem em `/gestao/produtos` foi alinhada ao novo padrão visual da tabela no desktop e, no mobile, virou uma lista de cards com cabeçalho, categoria/subcategoria e grade 2x2 de preço/complementos/estoque/status. Avatares, iniciais coloridas e códigos foram removidos da listagem em ambos os breakpoints; os fluxos existentes de edição/busca foram preservados. O status segue alternável, as ações ficam no menu de três pontos, a seleção em massa continua disponível e o mobile mantém paginação, busca em largura total, chips horizontais com contagens e o FAB de criação com Produto/Categoria/Subcategoria. O botão de nova categoria, o fluxo de complementos, permissões e handlers existentes foram preservados.
- Ticket médio no admin dashboard (2026-07-31): o Painel Financeiro exibe e exporta o ticket médio (ARPU), calculado como `MRR ÷ contas pagantes ativas`, usando a mesma base do MRR e excluindo trials e contas internas Donutopia/Techne.

- Cardápio por empresa (2026-07-31): a ferramenta de cardápio agora grava configurações e dados no `localStorage` com o UUID do proprietário autenticado; chaves antigas sem escopo são ignoradas para impedir que uma empresa herde o cardápio de outra.

- Zelo Impressão (2026-07-31): depois que o aplicativo Windows é instalado e aberto, o ZeloPDV tenta criar a conexão automaticamente no navegador. O código de 6 dígitos ficou apenas como fallback para agentes antigos ou quando a autorização automática não for concluída. A jornada e a página pública `/zelo-impressao` refletem esse fluxo; pedidos e a configuração da impressora continuam usando o fallback do navegador quando o agente não está disponível.

- Carga operacional Mix Guaraná (2026-07-31): o usuário `39192d38-507c-443c-b075-85998abde740` (`Mix Guaraná`) recebeu o produto-base `Guaraná da Amazônia` (ID 1043), o componente ausente `Guaraná 500ml` (ID 1039), nomes normalizados e 5 grupos montáveis com 78 opções/76 vínculos. Componentes ficam ocultos do PDV via `ocultar_no_pdv` e não publicados no cardápio via `zelomenu_product_publications.visivel_online`; o base fica visível nos dois. Nenhum controle de estoque individual ou compartilhado foi ativado sem saldo confirmado. `zelomenu_slug` foi configurado como `mixguarana` e o link público foi validado.
  - Guardrail do PDV: `pdvCache` busca também os produtos vinculados que estão ocultos no catálogo e `zelomenuModifiers` considera estoque individual e estoque compartilhado da categoria ao resolver disponibilidade. Sem esse fallback, uma opção montável oculta aparecia indisponível por falta de produto no cache.

> Atualizar a cada sprint/sessão.
> Referências: [[CLAUDE]] · [[BILLING]] · [[CODE_REVIEW]] · [[FIXES_PROGRESS]] · [[INCIDENTS]]

- Produtos montáveis no PDV (2026-07-31): cadastro, PDV e Mesas/comandas agora usam os grupos já existentes do ZeloMenu. `ModalModificadores.svelte` permite criar/editar/reordenar grupos e opções, configurar modo de preço, quantidade e vínculo com produto real; produtos com grupos ativos abrem `ModalProdutoMontavel.svelte`, enquanto produtos simples mantêm um toque. A montagem aparece na comanda/cozinha, forma linhas distintas por combinação e segue como snapshot em `vendas_itens` e no caminho offline. A migration `.ai/migrations/produtos_montaveis_pdv_2026_07_31.sql` foi aplicada no Supabase vinculado: as RPCs de comanda agora reservam/devolvem também o estoque dos produtos vinculados e ficaram sem execução para `public`/`anon`; nenhum dado de teste foi persistido.
  - Hotfix de produção (2026-07-31): `comanda_aplicar_delta_item` tinha simultaneamente a assinatura legada de 3 argumentos e a assinatura nova de 5 argumentos com defaults. O PostgREST retornava `Could not choose the best candidate function` para clientes ainda usando o payload antigo. Aplicada via Supabase CLI a migration `.ai/migrations/comanda_aplicar_delta_item_remove_ambiguous_overload_2026_07_31.sql`, removendo apenas a sobrecarga de 3 argumentos; a assinatura de 5 argumentos com defaults preserva a compatibilidade. Verificado no banco: uma única função, `authenticated` com `EXECUTE`, sem dados alterados.
  - Correção pós-revisão (2026-07-31): a revisão encontrou que a venda de balcão (online e replay offline), que passa por `criar_venda_completa`, descartava o snapshot `modifiers` e não baixava estoque dos produtos vinculados às opções — só o fechamento de Mesas fazia isso corretamente. Corrigido: `buildVendaPayload` (`src/lib/finance/saleOps.js`) agora expande `estoque` com os produtos vinculados às opções selecionadas; `resolveModifierSelections` (`src/lib/zelomenuModifiers.js`) agora ordena `selectedOptions` de forma determinística (por `optionId`) e inclui `linkedProductId` no snapshot, evitando linhas duplicadas na comanda quando a mesma combinação é escolhida em ordem de clique diferente. Nova migration `.ai/migrations/criar_venda_completa_persistir_modifiers_2026_07_31.sql` (ainda **não aplicada** no Supabase vinculado — precisa rodar depois da migration `produtos_montaveis_pdv_2026_07_31.sql`) adiciona `modifiers` ao insert de `vendas_itens` dentro de `criar_venda_completa`, sem alterar o restante da função. Testes direcionados: 45/45; `npm run check`: 0 erros / 93 avisos conhecidos.
  - Pendente de verificação: se `zelomenu_modifier_option_products` tem RLS escopado por tenant — a função `comanda_modifier_stock_requirements` resolve o produto vinculado a partir do `optionId` enviado pelo cliente sem revalidar contra os grupos reais do produto, e é concedida a `authenticated`.
- Correção visual do modal de produtos montáveis (2026-07-31): opções agora usam os controles canônicos `.themed-radio`/`.themed-checkbox`, com estado selecionado visível, foco acessível e mesma linguagem visual do restante do PDV. O rodapé mantém altura estável no desktop, o resumo longo é truncado sem barra própria e a lista de opções continua navegável sem barra visual; o comportamento mobile bottom-sheet foi preservado. O modal também recebeu refinamento de estados, espaçamento e hierarquia visual alinhado ao DESIGN.md.
  - Critique + polish `$impeccable` (2026-07-31): critique salva em `.impeccable/critique/2026-07-31T18-43-24Z__lib-components-modals-modalprodutomontavel-svelte.md` (28/40, 2 P0 + 2 P1 + 3 P2). Corrigido: `--bg-page` indefinido quebrando o backdrop de `ModalProdutoMontavel.svelte`; 6 `<select>` nativos trocados por `Select` (shadcn) em `ModalModificadores.svelte`; toque bloqueado num grupo/opção no limite agora avisa via toast e desabilita a opção em vez de travar silenciosamente; botão de confirmar não mostra mais o preço-base quando a seleção é inválida; shell dos dois modais alinhado ao DESIGN.md (`--bg-panel`, 14px, `bg-black/60 backdrop-blur`); Esc fecha os dois modais; alvos de toque do stepper/fechar/mover/editar aumentados; `prefers-reduced-motion` adicionado; ícones trocados por `lucide-svelte`; formatação de dinheiro unificada via `toLocaleString('pt-BR')`; badge `variacao`/`adicional` deixou de usar duas cores idênticas. Fora do escopo, propositalmente: drift de `font-size`/`border-radius` pré-existente em `ModalModificadores.svelte` (legado, não tocado por esta feature). Testes: 460/460; `npm run check`: 0 erros / 97 avisos conhecidos (4 a mais que o baseline, esperados: 2 labels de `Select` sem `for` + 2 seletores CSS aplicados via `Select.Trigger`, mesmo padrão já aceito em `gestao/produtos/+page.svelte`).
  - Bug bloqueante encontrado em teste manual ao vivo (conta real Donutopia, 2026-07-31) e corrigido: `ModalModificadores.svelte` recebia `ownerUserId` vazio da página `gestao/produtos` e mandava `id_usuario: ""` pro Supabase ao salvar um grupo, retornando `invalid input syntax for type uuid` cru pro usuário — travava o cadastro de complementos por completo. Causa provável em `src/routes/gestao/produtos/+page.svelte`: `onMount` resolvia `ownerUserId` via `Promise.all([supabase.auth.getUser(), getAccessContext()])`, e essa concorrência entre duas chamadas de auth do supabase-js no boot da página deixava o valor vazio sem lançar erro (mascarado até aqui porque `criarProduto()` já tinha seu próprio fallback de `getUser()`; `ModalModificadores` não tinha). Corrigido em duas camadas: (1) `+page.svelte` agora resolve `ownerUserId` sequencialmente, não em paralelo; (2) `ModalModificadores.svelte` nunca mais confia só na prop — resolve `resolvedOwnerUserId` com fallback próprio (`supabase.auth.getUser()`) antes de qualquer leitura/escrita, e `salvarGrupo` reforça essa checagem antes de gravar. Também removido o rodapé "Fechar" duplicado (já tinha o X no cabeçalho) nos dois modais, por pedido do usuário. Confirmado ao vivo: salvar grupo funciona (toast "Grupo adicionado."). Testes: 460/460; `npm run check`: sem novos erros/avisos. Ficou um produto de teste "Vitamina de Morango" com grupo "Tamanho" na conta Donutopia (Supabase vinculado) — perguntar ao usuário se remove.
  - Redesign mobile-first de "Complementos e opções" (2026-07-31): implementado o modelo descrito em [[complementos-opcoes-redesign-mobile-first]] — seletor de modelo em cartões (`src/lib/modifierModels.js` + `ModelSelector.svelte`) substituindo os 4 campos crus, navegação lista→detalhe em duas telas no mobile com split lado a lado no desktop (`GroupDetailView.svelte` novo). Implementado com apoio do CLI `verboo` em 3 rodadas de revisão: 1ª rodada corrigiu um bug real (toggle "Obrigatório" no fluxo de criar grupo não tinha efeito nenhum no que era salvo — `salvarGrupo` lia o campo errado), um `<select>` nativo reintroduzido, alvos de toque regredidos, ícones inline em vez de `lucide-svelte`, e um teste (`tests/modelMapping.test.js`) que só comparava uma cópia local dos dados contra si mesma — reescrito pra importar `src/lib/modifierModels.js` de verdade e testar `calcMinSel`. Um bug crítico adicional (cabeçalho do modal — voltar/fechar — completamente invisível e inacessível no mobile, escondido atrás dos painéis de lista/detalhe por `position:absolute` relativo ao elemento errado) foi corrigido diretamente, sem passar pelo CLI. Confirmado ao vivo em 390px e 1440px: modelo com exemplo real do produto, navegação lista↔detalhe funcionando, split desktop 960px/400px correto. Testes: 471/471; `npm run check`: 0 erros / 95 avisos.
    - Passo "tier S" de UX/UI, com o fluxo mobile do Fichário (`gestao/fichario/+page.svelte`) como referência de "fácil de usar" (2026-07-31): implementado o bottom sheet "Ver como fica" que faltava (comparado às imagens do mockup aprovado) — `.summary-bar` virou botão clicável, abre `.resumo-sheet` com o padrão já usado no Fichário (overlay com blur, handle, lista de grupos ativos com as mesmas tags da lista principal, aviso de que é só prévia). Fecha por botão "Fechar", clique no backdrop ou Escape (sem fechar o modal inteiro). Subtítulo explicativo adicionado acima da lista; ícones inline trocados por `lucide-svelte` (`ArrowLeft`, `X`, `ChevronRight`, `SlidersHorizontal`, `Eye`). Alvos de toque: `.close-btn`/`.back-btn` e os botões de rodapé do grupo (Salvar/Cancelar/Ativo-Inativo/Excluir) subiram a 44px — as ações densas por opção em `GroupDetailView.svelte` (mover/editar/excluir por linha) ficaram como estavam (34px), mesmo precedente do Fichário para listas densas. Transição de slide (`transform`, 220ms) adicionada à navegação lista↔detalhe no mobile, ausente até então. Ao testar ao vivo (390px e 1440px) foi encontrado um bug real e corrigido: `.modal-content` deste componente nunca definia `max-width`, então um utilitário genérico `.modal-content { max-w-md }` em `src/app.css:218` (Tailwind, 448px) vencia por padrão e espremia o painel de detalhe do split desktop a ~0px de largura (o conteúdo existia no DOM, mas ficava visualmente invisível). Corrigido com `max-width: none` explícito no `.modal-content` deste arquivo. Confirmado ao vivo: sheet abre/fecha nas três formas, grupo criado/editado/excluído com o confirm-dialog padrão, split desktop agora mostra o painel de detalhe corretamente. Testes: 471/471; `npm run check`: 0 erros / 95 avisos (sem novos avisos).

- Passo visual adicional do redesign de "Complementos e opções" (2026-07-31): `ModalModificadores.svelte` recebeu réplica fiel da hierarquia dos mockups aprovados, com botão primário no topo, cartões de grupos com alça/tags/contagem, criação em tela cheia no desktop e bottom sheet no mobile. `ModelSelector.svelte` agora usa cartões ricos com ícone, descrição e exemplos `Ex.: Suco de Laranja`; `GroupDetailView.svelte` ganhou resumo do modelo, regras em chips e opções em cartões com badge. O split desktop agora usa modal largo (até 1180px) e mantém a área de detalhe visível; o estado de criação não deixa painel vazio ao lado. Validado no navegador em 390x844 e 1440x900, sem erros de console; grupo e opção temporários criados para teste foram removidos pela UI. `npm run check`: 0 erros / 95 avisos; `npx vitest run`: 473/473.

- Correção de bloqueios explicados no fluxo de complementos (2026-07-31): reproduzido no mobile o caso em que “Salvar grupo” ficava desabilitado após escolher um modelo sem que o campo obrigatório estivesse mais visível. O nome do grupo permanece visível na etapa de configuração; a ação bloqueada agora recebe mensagem inline e `aria-describedby` (“Informe um nome para habilitar o salvamento deste grupo”). Controles indisponíveis por modelo e limites de reordenação também mostram textos amigáveis no próprio fluxo, sem depender de hover. Validação manual: criação, edição, prévia/Esc e exclusão com `alertdialog`; `npm run check`: 0 erros / 95 avisos; suíte: 473/473.
- Auditoria de bloqueios silenciosos e helper reutilizável (2026-07-31): criado `src/lib/components/ui/InlineHelper.svelte`, com mensagem persistente, tom de aviso, modo compacto e suporte a `aria-describedby`, para substituir explicações dependentes de hover. Aplicado nos limites de escolha do `ModalProdutoMontavel`, permissões/estado vazio das ações do PDV, bloqueios de cancelamento/conclusão em `/app/pedidos` e `/app/pedidos/cozinha`, preferências do Zelinho para subusuários/regras sempre ativas e ações sem itens na comanda de mesas. Estados de carregamento e paginação foram mantidos apenas como `disabled` operacional, pois já exibem progresso ou contexto. Validação: `npm run check` com 0 erros / 95 avisos; suíte completa `npx vitest run` com 476/476.

- Aviso de atualização (2026-07-30): `UpdateAvailable` agora usa copy em português, exibe somente o botão `Atualizar`, oferece X para dispensar e aceita deslize horizontal no mobile. A dispensa continua suprimindo a mesma versão por duas horas e a atualização preserva o fluxo existente de service worker/cache. `npm run check` passou com 0 erros / 98 avisos conhecidos.

- Exclusão de pessoas quitadas (2026-07-30): a FK do extrato de fiado bloqueava o `DELETE` direto mesmo quando o saldo estava em R$ 0,00. A RPC `fiado_excluir_pessoa` foi aplicada em produção: exige permissão `pessoas.gerenciar`, bloqueia saldo diferente de zero, desvincula vendas históricas e remove os lançamentos do fiado na mesma transação antes de apagar `pessoas`. A tela de Pessoas passou a chamar a RPC e traduz o erro de saldo. Nenhum cadastro foi apagado nesta correção; validação da RPC por assinatura/grants concluída. Deploy do frontend ainda é necessário.

- Admin — usuários e uso de produto (2026-07-30): `/users` agora separa relacionamento de analytics: filtros por atividade e recência de cadastro, data de entrada + idade da conta e cópia de email/telefone com um clique. `/analytics` passa a mostrar cobertura de módulos e permite copiar uma abordagem contextual por cliente, baseada só em dados observados. A migration `.ai/migrations/product_usage_events_2026_07_30.sql` cria telemetria mínima por empresa/módulo/dia (sem cliques, conteúdo ou dados pessoais); o client passa a registrar PDV, Zelinho Gerente, Relatórios e demais módulos, e abrir o chat registra Zelinho. O endpoint server-side `/api/admin/usage-insights` protege snapshots, sinais e essa telemetria com autenticação de super-admin. A migration foi aplicada no Supabase vinculado via `supabase db query --linked --file`; verificação pós-DDL: RLS ativo, sem policies/grants para `anon` ou `authenticated`, e `service_role` como único consumidor de dados. Validação: `npm run check` passou com 0 erros / 96 avisos conhecidos; `cd admin-dashboard && npm run build` passou. O `npm run check` do admin segue bloqueado pela ausência pré-existente de `admin-dashboard/jsconfig.json`; build do app compilou, mas o adapter Vercel falhou no Windows por `EPERM` ao criar symlink em `.vercel/output`.

- Ticket médio no admin dashboard (2026-07-31): o Painel Financeiro agora exibe e exporta o ticket médio (ARPU), calculado como `MRR ÷ contas pagantes ativas`. A base do numerador e do denominador é a mesma do MRR: assinaturas `active` vigentes, sem trials e sem as contas internas Donutopia e Techne. Quando não há pagantes ativos, o valor é `R$ 0,00`.

- Zelinho Gerente (2026-07-30): rollout global implementado. A UI, o resumo semanal, preferências, badge da sidebar, contexto do chat, processamento diário e digest do WhatsApp não dependem mais de `empresa_perfil.intelligence_enabled_at`; a coluna permanece apenas como histórico do piloto. O engine agora processa empresas com assinatura ativa ou em trial e a env `INTELLIGENCE_ENGINE_ENABLED` virou kill switch opt-out (`false` desliga; ausente mantém ligado). Validação local: 13 testes focados passaram e `npm run check` terminou com 0 erros / 98 avisos conhecidos.

- Fila de pedidos (2026-07-29): incidente reportado com `permission denied for table zelo_orders`. O ACL/RLS de producao foi conferido e esta correto (`authenticated` com SELECT, `anon` sem SELECT); a tela agora tenta renovar a sessao, repete a leitura e encaminha sessoes expiradas ao login. O ajuste local passou em 9 testes direcionados e `npm run check` com 0 erros / 96 avisos; aguarda deploy.

- Página de extensões / identidade dos produtos (2026-07-28): o card do ZeloMenu agora usa o mini-mascote extraído da hero com fundo transparente, animação sutil e tratamento roxo próprio por tokens (`--zelomenu-brand*`). O card do ZeloChat usa os tokens verdes oficiais do repo do produto (`--zelochat-brand*`). Os preços exibidos e os textos de meta, FAQ e passos derivam de `src/lib/pricing.js`; não há mais preço atual de produto escrito à mão em `src/lib/data/extensoes.js`. `npm run check` passou com 0 erros / 96 avisos conhecidos; QA visual validou desktop e mobile sem overflow, com os assets carregados.

- Seguranca ZeloMenu (2026-07-28): `public.zelomenu_table_capabilities` foi endurecida em producao via `supabase db query --linked`: RLS ligado, nenhum privilegio para `anon`/`authenticated` e as RPCs `issue_table_capability`/`revoke_table_capability` ficaram restritas ao `service_role`. A tabela estava vazia e sem sessoes usando `capability_id`; o advisor deixou de reportar `rls_disabled_in_public`. Migration registrada em `.ai/migrations/zelomenu_table_capabilities_enable_rls_2026_07_28.sql` e a migration original do ZeloMenu tambem foi corrigida para novos ambientes.

- Fase 2 — implementada e publicada (2026-07-28): o contrato `source='mesa'` agora cobre QR público e envio de item da comanda no mesmo motor `zelo_orders`. QR consome estoque na transição para `accepted`; item já reservado pela comanda leva `fulfillment.comandaItemId`, nasce com `stock_committed_at` e não sofre restituição duplicada em cancelamento. `ensure_zelo_order_sale` fica sem venda para mesa e `close_zelo_order` rejeita fechamento financeiro alternativo. ZeloMenu passou a materializar `table_order` canonicamente e os dois consumidores de entitlement removeram `has_pedidos_addon`; a cópia órfã de `delivery-frontend` também foi atualizada. O DDL foi executado em produção, com asserções de schema e ACL aprovadas; o merge do ZeloPDV é `5a6f45a3`.

- Correção pós-migration (2026-07-28): o primeiro smoke de cancelamento revelou que a função protegia a restituição de estoque de item de comanda, mas ainda preenchia `stock_released_at`. A migration corretiva `.ai/migrations/pedidos_cozinha_mesa_cancel_marker_2026_07_28.sql` condiciona também o marcador; smoke transacional repetido passou 3/3 e terminou com rollback, sem pedidos persistidos.

- Validação da fase 2 local: `npm test -- --run tests/pedidosCozinhaFase2Schema.test.js tests/api.mesas-cozinha.test.js` — 11/11; suíte completa do ZeloPDV — 441/441; `npm run check` — 0 erros / 96 avisos; `cd ../zelomenu && npm run typecheck` — OK; `cd ../zelomenu && npm test` — 262/262; ZeloChat lint e testes direcionados — OK. O endpoint de cozinha valida bearer, permissões, add-on Mesas, owner da empresa, comanda aberta, mesa ativa, item pertencente, idempotência server-side e não devolve erro bruto do RPC. Pré-flight no banco confirmou que só `confirm_zelomenu_cart`, `delete_account` e `proximo_numero_pedido` referenciavam as tabelas legadas; não há dependentes externos exigindo `CASCADE`. O smoke pós-DDL cobriu QR/comanda, estoque, venda e fechamento; `delete_account` passou com usuário sintético em transação e terminou em rollback.

- Validação do ZeloChat (2026-07-28): `npm run lint` e os testes direcionados de entitlement passaram. A suíte completa terminou com 1 falha preexistente e fora do diff desta tarefa em `tests/zelomenuSlug.test.ts`: o teste espera `/menu/:slug`, mas o runtime atual gera `/:slug`.

- Assinatura `d5625be9` (2026-07-28): auditoria de `billing_payments` mostrou último pagamento confirmado de R$89 (PDV + Mesas, sem Acessos), e a assinatura não tem `provider_subscription_id` ativo. A alteração manual sem evidência contratual foi corrigida: `has_acessos_addon=false`, `monthly_value_cents=22800` (bundle + Mesas, R$228), com registro em `admin_activity_logs`; nenhum histórico ou estorno foi alterado.

### Snapshot validado (2026-07-27)

- Módulo Pedidos + Cozinha aposentado (2026-07-28): o add-on legado saiu inteiro do código do ZeloPDV. `ADDONS.pedidos` e `allowsPedidos` foram removidos de `src/lib/pricing.js` e do espelho do Admin; `hasPedidosAddon` saiu de `guards.js` e o fallback `has_pedidos_addon` deixou de conceder `ordering_review`/`kitchen_queue` (D-099 encerrado). O runtime legado foi deletado: rotas `/app/pedidos/novo` e `/app/pedidos/[id]/editar`, os branches da tabela `pedidos` em `/app/pedidos` e `/app/pedidos/cozinha`, o breakdown "Pedidos (Cozinha)" dos relatórios e o unlink em `gestao/+page.svelte`. `/app/pedidos` e `/app/pedidos/cozinha` agora operam só o motor canônico `zelo_orders`. A remoção física das tabelas/colunas e o deploy cross-repo foram concluídos; o botão das Mesas está publicado via `source='mesa'` após deploy e soak.
  - **Cozinha virou exclusiva do ZeloMenu (2026-07-28, decisão de produto):** `hasKitchenQueueAccess` e o `kitchenQueueActive` da sidebar perderam o fallback por `has_mesas_addon` — a fila de preparo é alimentada só pelo motor canônico, então cliente só-Mesas deixa de ver o item Cozinha em vez de abrir uma tela sempre vazia. D-100 fica revogado nessa parte. Guardrail em `tests/guards.zelomenu.test.js` falha se `hasKitchenQueueAccess` e `hasOrderingReviewAccess` divergirem em silêncio.
  - **"Enviar pra cozinha" da comanda: publicado na fase 2 com `source='mesa'`.** O botão foi restaurado apontando para o motor canônico com guardas contra baixa dupla de estoque e cobrança dupla. `comanda_aplicar_delta_item` já decrementa `produtos.estoque_atual`/`categorias.estoque_compartilhado_atual` quando o item entra na comanda, então o endpoint envia `fulfillment.comandaItemId`; `transition_zelo_order` não baixa nem restaura esse estoque, e `ensure_zelo_order_sale`/`close_zelo_order` não criam venda para mesa. A rota QR pública e a comanda convergem no mesmo agregado, com DDL aplicada e smoke técnico pós-deploy aprovado.
  - Chaves de permissão `pedidos.*` foram **mantidas** de propósito (estão persistidas no JSON de `access_roles`; renomear apagaria a permissão de subusuários existentes). Só os rótulos mudaram. `pedidos.criar` saiu da matriz e do cargo Atendente porque a capacidade não existe mais.

- Homepage visual (2026-07-28): a landing foi refeita com a direção visual do pacote Zelinho, preservando a copy de conversão e os preços reais. O hero escuro agora usa o recorte transparente otimizado (`static/images/landing/zelinho-hero-transparent.webp`, 60 KB, com fallback SVG) sem o retângulo da arte original; o restante da página usa superfícies claras frias, screenshots reais do produto, três planos completos, FAQ e um único CTA principal. Header e footer compartilhados foram refinados com o logo original e menu mobile. QA em 360, 390, 768 e 1440 px ficou sem overflow ou erros de console; o detector Impeccable ficou limpo e `npm run check` passou com 0 erros / 96 avisos preexistentes.

- Refinamento da landing (2026-07-28): o hero agora escala em telas acima de 1600 px (shell de até 1536 px, headline de até 88 px e arte de até 896 px no QA de 1920 px), ganhou o caminho secundário "Ver o Zelo funcionando" e a seção do Zelinho virou uma demonstração clicável de pergunta → resposta → números → conclusão, sempre marcada como ilustrativa. Ações preenchidas usam `--marketing-action` para contraste de 5,93:1; o menu mobile fecha com Escape e trava o scroll de fundo; o rodapé passa a colapsar antes de 840 px para não cortar em 768 px. Playwright validou 360, 390, 768, 1440 e 1920 px sem overflow; `npm run check` segue em 0 erros / 96 avisos conhecidos.

- Homepage de conversão (2026-07-28): a home foi reescrita com promessa concreta, hero "Sua lanchonete vendeu bem. Mas sobrou dinheiro? O Zelo te mostra.", registro em 3 toques, lucro depois de aluguel/luz/retiradas, IA do Zelinho, operação offline, fiado digital e três configurações de preço reais (PDV R$59, PDV + Mesas R$89, PDV + ZeloMenu R$99). A `og:image` da home agora aponta para a miniatura desenhada `static/og-image-home.png`. Depoimentos e métricas de clientes não foram adicionados porque não há prova autorizada no repositório; a seção de confiança usa fatos verificáveis do produto. `npm run check` passou com 0 erros / 96 avisos, sendo os avisos conhecidos do projeto. `npm run build` compilou os bundles e continua bloqueado no adapter Vercel por `EPERM` de symlink neste clone Windows.

- Trial de 30 → 14 dias (2026-07-27): decisão de produto vinda de mentoria — em ticket baixo (R$59, dono de lanchonete) 30 dias é tempo demais para esquecer que instalou; o que converte é acompanhamento humano, não a duração do teste. A duração agora sai de `TRIAL_DAYS` em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:1) e é lida por `start-trial` (trial local), `create-subscription` (`trial_period_days` do Stripe), `metaPixel`, `/perfil`, `GestaoSidebar` e `/assinatura`. **Assinaturas em andamento não foram encurtadas** — `current_period_end` é gravado na criação, então quem já está em trial mantém os 30 dias.

- Aviso de fim de trial disparando cedo demais na coorte legada (2026-07-27, corrigido): a sequência inteira era agendada por `daysSince` (idade da assinatura). Com o dia 13 passando a significar "encerra amanhã", uma conta de 30 dias receberia esse e-mail e o WhatsApp correspondente no **dia 13**, quando ainda faltavam 17 — anunciando um vencimento falso e empurrando pra cobrança quem tinha meio trial pela frente. As regras de agendamento saíram do handler para `src/lib/server/onboardingSchedule.js` (`+server.js` só exporta métodos HTTP, e essa é a parte que precisa de teste), com `END_ANCHORED_DAYS = {13}`: os dias de urgência disparam por `diasRestantes <= 1`, calculado de `current_period_end`/`manually_extended_until`, e não pela idade. Num trial de 14 dias o comportamento é idêntico; nas contas de 30 dias e nas estendidas à mão, o aviso passa a sair na véspera real. Coberto por 16 testes, incluindo varredura das idades 0 a 28 de uma conta legada.

- Trials em voo não foram encurtados, mas a UI quebrou (2026-07-27, corrigido): `TRIAL_DAYS` só é lido na criação da assinatura, então quem já estava em trial manteve o `current_period_end` de 30 dias e **ninguém perdeu acesso** — `isSubscriptionActiveStrict` e o cron `expire-trials` olham só a data, nunca a constante. O que quebrou foi a exibição: com 20 dias restantes, `GestaoSidebar` mostrava "Dia 1 de 14", a barra em `/perfil` travava em 0% e o gate `trialDaysLeft <= TRIAL_DAYS` em `/assinatura` escondia o aviso de fim de teste. Corrigido com `getTrialTotalDays(sub, fallback)` em `src/lib/subscriptionStatus.js`, que deriva a duração real de `created_at → current_period_end` (respeitando `manually_extended_until`) e só cai na constante para contas novas. As três telas passaram a buscar `created_at`. O gate de `/assinatura` perdeu o teto numérico: `trialing` já delimita o aviso.

- Nome da loja nas mensagens (2026-07-27): todos os templates recebiam `empresa_perfil.nome_exibicao` e faziam `.split(' ')[0]` tratando como primeiro nome, então "Lanchonete do Zé" virava "Oi, Lanchonete!" nos 6 e-mails e nas 3 mensagens de WhatsApp. As saudações agora tratam o valor como nome de loja ("A conta da Lanchonete do Zé já está ativa") e caem numa saudação sem nome quando o campo vem vazio. De quebra, o nome passou a ser escapado com `escapeHtml`: era entrada de usuário indo crua pro HTML do e-mail. Não existe campo com o nome da pessoa; adicionar um no onboarding continua sendo a correção de fundo.

- Oferta de configuração assistida no dia 0 (2026-07-27): a tese do mentor é que em ticket baixo quem converte é alguém sentando do lado, não a duração do trial. O convite de "a gente configura o sistema e cadastra seus produtos com você" agora sai já na criação da conta, no WhatsApp de boas-vindas (`enviarBoasVindasDetalhado`) e no `emailDay0`. Foi pros dois canais de propósito: o WhatsApp só dispara quando `empresa_perfil.contato` está preenchido e o ZeloChat configurado, então sem a versão por e-mail quem cadastra sem telefone não recebia convite nenhum. O `emailDay5` (antigo `emailDay25`) deixou de ser e-mail de urgência e virou segundo convite pra configurar junto, agora na primeira semana.

- Oferta de extensões condicional (2026-07-27): novo `emailDay9`, o primeiro template que pode devolver `null` para dizer "não faz sentido pra esta empresa". Duas travas: quem tem zero vendas registradas não recebe, e extensão já ativa não aparece; se não sobrar nada, o cron pula sem gravar log (assim a oferta ainda pode sair depois, dentro da janela de catch-up). Os sinais de uso (`produtos`, `vendas`, `access_users`) vêm de `fetchUsageSignals`, uma query por tabela contada em memória. `ADDONS.pedidos` fica fora por ser entitlement legado migrado pro ZeloMenu, e ZeloChat entra como troca de plano, não add-on. **Limite conhecido:** o banco não sabe distinguir hamburgueria de balcão de restaurante com salão, então Mesas e ZeloChat vão por auto-seleção do dono. Um campo de tipo de negócio no onboarding resolveria isso.

- Atribuição de aquisição (2026-07-27): antes disso só o canal de indicação era rastreável ponta a ponta; Google Ads, Meta, orgânico e comparativos não gravavam nada, e o `?origem=` dos links de `/contato` era descartado sem ninguém ler. Agora `src/lib/attribution/client.js` grava first-touch (utm_*, gclid, fbclid, `origem`, referrer reduzido a host+caminho, página de entrada) no localStorage, enviado em dois pontos: `user_metadata.acquisition` no signup, que cobre quem abandona antes do onboarding, e `empresa_perfil.origem_aquisicao` no fim do wizard, que é o que cruza com `subscriptions` por `user_id`. Migration `.ai/migrations/empresa_perfil_origem_aquisicao_2026_07_27.sql` **ainda não aplicada no banco real**. As consultas de canal e de MRR por origem estão no arquivo de verificação correspondente. Não há backfill possível: a origem dos clientes atuais não foi registrada em lugar nenhum.

- Cadência de onboarding remapeada (2026-07-27): `EMAIL_DAYS` foi de `[0,1,3,7,14,25,28]` para `[0,2,5,9,11,13]` e `WHATSAPP_DAYS` de `[0,7,28]` para `[0,7,13]`. Motivo estrutural: o cron só busca `status='trialing' AND current_period_end > now()`, então qualquer dia agendado além do fim do trial **nunca dispara** — com 14 dias, os e-mails 25/28 (oferta de call e último aviso, os dois de maior conversão) sumiriam em silêncio. Templates removidos: `emailDay7` (prova social/estoque) e `emailDay14`. Renomeados para casar com o dia real: `emailDay1→emailDay2`, `emailDay3→emailDay7`, `emailDay25→emailDay11`, `emailDay28→emailDay13`, `enviarFollowup28d*→enviarFollowupFinal*`. As colunas `whatsapp_followup_28d_sent_at` foram mantidas (nome legado, sem migration). Novo `MAX_CATCHUP_DAYS = 3` no cron impede que uma futura mudança de cadência despeje a sequência inteira na caixa de quem já está no meio do trial.

- Montagem do item e reimpressão manual (2026-07-27): `/app/pedidos` e `/app/pedidos/cozinha` agora exibem os grupos de modificadores do ZeloMenu (`zelo_order_items.modifiers`) abaixo do nome do produto, então itens montados como "Monte sua Massa" deixam de aparecer só pelo nome. O detalhe do pedido ganhou botão `Reimprimir`, que ignora de propósito o dedupe de 48h do auto-print (o caso de uso é a via que não saiu) e, ao imprimir, reserva o pedido no store para a reconciliação não gerar uma terceira via. A normalização virou `normalizeModifierGroups` / `itemModifierGroups` em `src/lib/onlineOrders.js`, compartilhada entre tela e bilhete. Testes direcionados: 12/12.

- Impressão automática de pedidos online (2026-07-27): `/app/pedidos` agora detecta pedidos canônicos novos, envia o bilhete textual completo ao Zelo Impressão, reconcilia perdas do Realtime via polling/retorno da aba e persiste o dedupe por 48h. Pedidos existentes no primeiro carregamento não são reimpressos; falhas liberam nova tentativa. Ver `src/lib/orderAutoPrint.js`, `src/lib/orderPrint.js`, `src/lib/printService.js` e `src/routes/app/pedidos/+page.svelte`.

- Validação da mudança de trial (2026-07-27): `npm test` em 425/427, com 40 testes novos entre `emailTemplates.extensoes`, `onboardingSchedule` e o bloco `getTrialTotalDays`. Antes da âncora no fim do trial, 409/411 com 24 testes novos entre `tests/emailTemplates.extensoes.test.js` e o bloco `getTrialTotalDays` em `tests/subscriptionStatus.test.js`. Antes das correções de UI e nome de loja, 401/403 com 12 testes novos em `tests/emailTemplates.extensoes.test.js` cobrindo as travas de fit e um guarda-corpo que falha se algum dia de `EMAIL_DAYS` cair fora de `TRIAL_DAYS` (exatamente o bug silencioso que motivou o remapeamento). Antes disso, `npm test` em 389/391 — as duas falhas continuam sendo as conhecidas de `api.create-subscription` (400 onde se espera 200), confirmadas como pré-existentes via `git stash` antes de tocar no código. `npm run check` em 0 erros / 96 avisos. `cd admin-dashboard && npm run build` passou. `npm run build` do app principal compilou os dois bundles e parou no adapter Vercel por `EPERM` de symlink (limitação conhecida deste clone Windows). `cd admin-dashboard && npm run check` segue quebrado pela ausência pré-existente de `jsconfig.json`.

- Validação desta sessão (2026-07-27): testes direcionados de pedidos/impressão passaram (11/11) e `npm run check` passou com 0 erros / 96 avisos. A suíte completa ficou em 388/390: as duas falhas conhecidas de `api.create-subscription` continuam retornando 400 onde os testes esperam 200; não têm relação com esta alteração. `npm run build` compilou os bundles, mas continua bloqueado no adapter Vercel por `EPERM` ao criar symlink local, limitação já conhecida deste clone.

- Precos no ZeloAdmin (2026-07-24): a edicao de plano manual/Abacate Pay agora grava `monthly_value_cents` junto com plano e add-ons; o catalogo do Admin foi alinhado ao catalogo canonico, tratando ZeloMenu como R$40 no ZeloPDV e Pedidos como legado incluido no ZeloMenu. O pacote Gestao + Atendimento permanece R$198, sem somar R$30 de Pedidos. A sincronizacao Stripe tambem atualiza o valor mensal persistido. Teste direcionado de pricing passou e `cd admin-dashboard && npm run build` passou com warnings pre-existentes.
- ZeloAdmin zerado (2026-07-24): o deploy de 2026-07-22 passou a selecionar `subscriptions.monthly_value_cents`, mas a migration `.ai/migrations/subscriptions_monthly_value_cents_2026_07_22.sql` ainda nao havia sido aplicada no Supabase real. O PostgREST rejeitava a consulta e as telas tratavam o erro como array vazio, zerando Dashboard, Assinaturas e Usuarios sem perda de dados. A migration aditiva foi aplicada no projeto real `xnnjyrblpvsqrtsshawa`; validacao encontrou 18 assinaturas (5 `active`, 7 `trialing`, 5 `trial_expired`, 1 `canceled`). O select do Dashboard tambem passou a incluir `has_pedidos_addon`, evitando subcontagem do MRR quando o valor real ainda esta nulo. `monthly_value_cents` continua nulo nas linhas antigas e o admin usa fallback pelo preco do plano ate o backfill. `cd admin-dashboard && npm run build` passou; `npm run check` continua bloqueado pela ausencia pre-existente de `admin-dashboard/jsconfig.json`; permanecem tambem warnings pre-existentes de a11y/Vite/Svelte.

- Dashboard de Gestão (2026-07-17): decisão de produto — o dashboard (`src/routes/gestao/+page.svelte`) reflete a **sessão do caixa atual**, não o dia de calendário. Motivo: negócios que atravessam a meia-noite (bar, lanchonete) precisam ver a noite inteira num único caixa; cortar por data zeraria os números às 00h. Os números sempre foram do caixa; o bug era só semântico (rótulos diziam "Hoje"). Roupagem corrigida: "Vendas Hoje" → "Vendas do Caixa" ("N cupons no caixa atual"), gráfico "Vendas por Hora (Caixa Atual)", tooltip nos cards de Vendas/Caixa com "aberto desde dd/mm às hh:mm · Xh ativo", link "Ver relatório completo" → `/relatorios` na Atividade Recente e action "Fechar caixa" → `/gestao/caixa` no alerta de caixa aberto há +10h. `npm run check` em 0 erros. Commit `f057edc` na `main` (push direto autorizado).

- Copy e moeda em Produtos (2026-07-17): a opcao "Venda por unidade" foi renomeada para "Venda em atacado" nos fluxos de criacao/edicao. Os campos de preco do modal de novo produto agora exibem o prefixo visual `R$` sem alterar o valor numerico enviado ao formulario. `npm run check` segue em 0 erros / 94 avisos.

- Precos na edicao de Produtos (2026-07-17): os campos de preco do editor inline desktop e do editor em card mobile agora exibem o prefixo visual `R$`, incluindo as tabelas de preco opcionais, sem alterar o valor numerico persistido.

- Acoes duplicadas em Produtos (2026-07-17): o bloco legado com quatro botoes no lado direito do cabecalho foi removido. O novo conjunto `Novo produto` + `Acoes` agora e o unico grupo global visivel e permanece alinhado a direita no desktop; no mobile, os atalhos continuam no fluxo do FAB.

- Triggers de categoria em Produtos (2026-07-17): os formularios deixaram de depender do label interno do Bits UI para renderizar o valor selecionado. Os triggers agora resolvem diretamente o nome da categoria/subcategoria pelo catalogo carregado, evitando que o ID apareca ao editar ou apos selecionar um novo produto. `npm run check` segue em 0 erros / 94 avisos.

- Labels dos selects de Produtos (2026-07-17): categorias e subcategorias nos formularios de criacao/edicao agora usam IDs string na camada do Bits UI para resolver corretamente o label visivel; inserts/updates convertem os IDs de volta para numero antes de persistir. `npm run check` segue em 0 erros / 94 avisos.

- Selects em modais (2026-07-17): o `Select.Content` compartilhado agora usa `z-[300]`, acima do backdrop dos modais de criacao (`z-index: 200`). Isso corrige os dropdowns de categoria/subcategoria nos modais de categoria, subcategoria e produto sem duplicar ajustes por rota.

- Produtos (2026-07-16): a rota `src/routes/gestao/produtos/+page.svelte` foi alinhada ao layout de referencia no desktop e mobile. Desktop ganhou acoes globais com "Novo produto" e menu de acoes; mobile usa filtros compactos, chips de categoria/subcategoria, cards de produto e um FAB de `+` com drop-up animado para criar categoria, subcategoria ou produto. O hamburger e o Zelinho existentes foram preservados e nenhum bottom nav foi adicionado. `npm run check` terminou com 0 erros / 94 avisos; `npm test` ficou em 367/369, com as duas falhas conhecidas de `api.create-subscription`. A validacao visual automatizada ficou pendente porque o navegador embutido nao iniciou nesta sessao.

- Fichario — exclusao de pagamento (2026-07-16): recebimentos exibem um botao X alinhado a direita do valor/saldo. A confirmacao usa um modal nativo do ZeloPDV e chama a RPC `fiado_excluir_pagamento`, que remove o lancamento e a movimentacao de caixa vinculada atomicamente e devolve o valor ao saldo da pessoa. A migration do ledger foi validada no banco real em 2026-07-30.

- Fichário (2026-07-16): a página foi reorganizada em um workspace de três camadas no desktop, com lista de pessoas, ficha ativa e extrato/recebimento no mesmo quadro. Em telas pequenas, a seleção virou um fluxo em duas telas: pessoas primeiro e ficha da pessoa depois, com voltar, ações de pagamento/cobrança e bottom sheets de recebimento/cobrança. A rota mantém a lógica do razão `fiado_lancamentos` e a leitura opcional de `?p=<id>`; `npm run check` segue em 0 errors / 93 warnings pré-existentes. A validação visual automatizada ficou pendente nesta sessão porque o navegador embutido falhou ao iniciar. `npm test` ficou em 367/369, com as duas falhas já conhecidas de `api.create-subscription` (400 onde os testes esperam 200).

- Fiado auditável (2026-07-15): implementados localmente o razão `fiado_lancamentos`, RPCs atômicas de recebimento/estorno, backfill por saldo inicial, fichário pesquisável e responsivo, situação de crédito em Pessoas e nomes no resumo de fechamento. A migration do ledger foi validada no banco real em 2026-07-30. Validação local histórica: 41 testes financeiros direcionados passaram; `npm run check` terminou com 0 errors / 93 warnings pré-existentes; `npm run build` compilou os bundles, mas parou no adapter Vercel por `EPERM` ao criar symlink em `.vercel/output` (limitação local já observada).

- Relatórios — vendas do caixa (2026-07-15): produtos vendidos agora deixam explícito que são um resumo agrupado; vendas do caixa são cupons individuais. O antigo tooltip de itens/cliente dentro de um contêiner rolável foi substituído por detalhes expansíveis, operáveis por mouse, teclado e toque, sem conteúdo essencial depender de hover ou scroll lateral. Rotas com sidebar agora bypassam a shell de viewport do layout raiz. Em telas pequenas, Relatórios usa a rolagem natural do documento; no desktop, a rolagem interna é contida no painel para não vazar ao documento externo e revelar área vazia. O encerramento sem movimentações ocupa o espaço restante como estado vazio explícito. A workspace declara `--text-main` como cor-base, impedindo textos pretos herdados sobre o fundo navy.

- Contraste das áreas autenticadas (2026-07-15): as shells de Gestão, PDV, Ferramentas, Perfil e Assinatura agora declaram `--text-main` junto de `--bg-app`. Isso impede que conteúdo sem cor explícita herde preto quando o layout raiz é bypassado; a varredura também removeu utilitários de texto escuro remanescentes no Dashboard e no Fechar Caixa.

- Selects (2026-07-15): o wrapper compartilhado deixou de passar um slot vazio ao `bits-ui`, que anulava o placeholder nativo, e agora repassa o `label` de cada item ao primitive. Filtros e formulários exibem o placeholder até uma opção ser escolhida e, depois, mostram o nome legível em vez do ID interno.

- Pos-publicacao do Zelinho (2026-07-13): o CTA de contexto usa botao nativo (o wrapper Svelte 5 descartava eventos), o refresh do Gerente aguarda a requisicao mais recente e o chat inicial usa tres icebreakers clicaveis que preenchem o input. Commit enviado ao `main` para o deploy automatico da Vercel; nenhuma publicacao direta foi mantida.

- Branch: `main`
- HEAD inspecionado: `acc90cc` — `fix(caixa): impedir abertura duplicada + fechar orfaos`
- **Audit de design system concluído (2026-07-13):** auditoria impecable em 5 superfícies (PDV, marketing, auth+billing, gestão, admin-dashboard). Health score médio 13.8/20. 14 correções aplicadas (P0-P3): touch targets 44px no carrinho PDV, purple/indigo substituídos por sky-500, glassmorphism do card auth removido, tabular-nums global, tokens CSS em auth pages, shadows do assinatura capadas, numbered markers substituídos por ícones, aria-labels em toggles de senha, polling de pedidos reduzido (3s→30s), guardrail de cancelamento no admin. Detalhes em [[docs/projects/impeccable-audit-2026-07.md]]
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Auditoria UX do Zelinho contextual (2026-07-13): o drawer fechado agora fica `inert`, o foco retorna ao trilho ao fechar e o contexto de tela invalida ao mudar pathname, query ou entidade. Em mobile o painel usa semântica de dialog, foco fica preso no painel e todos os controles principais têm alvo mínimo de 44px. O contraste do cabeçalho usa tokens de tema, a reserva do workspace não anima padding e o motion de digitação/indicador crítico respeita `prefers-reduced-motion`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

### Validação executada nesta sessão

- Branch: `main`
- HEAD inspecionado: `e01d908` — `feat(seo): páginas comparativas vs concorrentes + hub + sitemap dinâmico`
- **Sprint concluída:** marketing redesign 2026-06 — ver [[docs/projects/marketing-redesign-2026-06.md]] para o brief completo. Cover: home hero, 2 templates compartilhados (SegmentLandingPage + CompetitorComparison), pricing section, data files, audit visual.
- App principal: SvelteKit 2 + Svelte 5 + Vercel.
- Admin: app separado em `admin-dashboard/`.
- Backend real: Supabase + Stripe + AbacatePay + Resend + ZeloChat interno para WhatsApp.
- Superfície ativa no código: PDV `/app`, gestão `/gestao`, pedidos/cozinha, mesas, billing, referrals, subusuários, onboarding por email/WhatsApp.

### Validação executada nesta sessão

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

### Falhas abertas confirmadas

- Nenhuma na suíte principal após alinhamento das fixtures ao contrato atual de perfil, CPF/CNPJ e telefone.

### Drifts e riscos ativos

- Controle de Acessos hoje faz enforcement fino majoritariamente no cliente; o servidor/RLS escopa dados por `owner_user_id`, mas não aplica o JSON de permissões como barreira forte em todas as rotas ([[CODE_REVIEW]]).
- `AdminLock`/`pin_admin` agora valida o valor em `/api/auth/admin-pin`; o browser recebe somente status de configuração ([[CODE_REVIEW]]).
- O Supabase real tem `delete_account()` e a fonte do ZeloChat contém o sweeper externo; deploy/monitoramento desse processo ainda precisam de confirmação operacional ([[CODE_REVIEW]]).
- `admin-dashboard/` usa anon key e continua sendo uma superfície de defesa em profundidade; as tabelas administrativas relevantes têm RLS ativo em produção ([[CODE_REVIEW]]).
- O webhook Pix falha fechado sem `ABACATEPAY_PUBLIC_KEY`; não há fallback hardcoded no runtime atual ([[CODE_REVIEW]]).

### Hotspots que pedem cautela

- `src/routes/app/mesas/[id]/+page.svelte` — maior superfície operacional do repo
- `src/routes/assinatura/+page.svelte` — billing UX e Pix
- `src/routes/perfil/+page.svelte` — perfil, add-ons, impressão, deleção
- `src/routes/app/+page.svelte` — frente de caixa e replay offline
- `admin-dashboard/src/routes/subscriptions/+page.svelte` — operação manual de assinatura

### Mudanças recentes visíveis no histórico Git

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

### Planejamento cross-produto

- ZeloMenu/ZeloChat/ZeloPDV: decisões completas e backlog por fases em [[docs/projects/zelomenu-linear-plan.md]]. Impacta pricing, catálogo comum, Pedidos como motor interno, entitlements, ZeloChat e integração futura com Mesas.
- A base de schema PDV-owned para publicação/modificadores do ZeloMenu já está aplicada no Supabase real.
- ZLM-205 (billing e planos) concluído: ZeloMenu como addon (R$40) no checkout, billing APIs, webhook, admin dashboard.
- ZLM-201 bulk publish concluído; self-service individual (nome/descrição/foto/ordem) ainda pendente.
- Status completo em [[docs/projects/zelomenu-zelopdv-status.md]].

### Próximas fatias recomendadas

1. Completar a UI self-service de publicação do ZeloMenu com edição de nome/descrição/foto/ordem, despublicação, pausa e modificadores; a publicação em lote básica já existe em Gestão → Produtos.
2. Expandir o adapter atual de `zelomenu_product_publications` para leitura/edição e adicionar adapters de `zelomenu_modifier_groups`/`zelomenu_modifier_options`, sem alterar o catálogo base `produtos`.
3. Finalizar landing page de marketing do ZeloMenu em `/extensoes` (card + seção detalhada + FAQ + entrada em `extensoes.js`).
4. Validar fim-a-fim o fluxo de deleção agendada com o sweeper externo.
5. Revisar e documentar o modelo de segurança do `admin-dashboard/`.
6. Atacar warnings de `svelte-check` por lote, começando pelos arquivos operacionais e não pelas páginas de marketing.
7. Expandir hero archetypes pra páginas standalone: `/precificacao` e `/vs-planilha` ainda usam layout legado (gradient text, multi-glow) — sprint separada pode ganhar +3-4 pontos no critique.

### Ajustes pós-QA da navegação mobile

- A bottom navbar usa uma camada acima dos modais operacionais, inclusive `Abrir Caixa`, e permanece operável. Os painéis do Zelinho e do suporte terminam acima da faixa reservada pela navbar por meio de `--mobile-bottom-nav-offset`; toasts usam `--toast-offset`.
- `Relatórios` passou de `Outros` para `Financeiro` na configuração central compartilhada por desktop e mobile. A rota `/relatorios`, a permissão `relatorios.ver` e a proteção por PIN não foram alteradas.
- O menu de três pontos dos cards de Produtos agora é ancorado ao próprio gatilho no mobile e acompanha o card durante o scroll, abrindo para cima quando falta espaço. Validação combinada da `main`: `npm run check` com 0 erros/99 avisos conhecidos e `npm test` com 492/492 testes.
Dashboard administrativo (2026-08-04): o escopo global das métricas agora é
  configurável por empresa em `/settings`; novas contas entram por padrão e
  contas de teste/internas podem ser excluídas de MRR, ARR, ticket médio,
  assinaturas, churn, DAU/WAU e custos de IA vinculados à conta.


**2026-09-04 — remoção de acesso e assinatura própria:** correção local de `DELETE /api/access/users/[id]` consulta a existência de qualquer assinatura do usuário com `limit(1)` antes de excluir o vínculo. Erro nessa leitura retorna 500 sem excluir vínculo/Auth nem gravar auditoria; histórico múltiplo, inclusive cancelado/expirado, preserva a conta independente. Oito testes novos passam, incluindo falha com dados parciais, titular comum, subusuário real e convite pendente; `npm run check` terminou com 0 erros/0 avisos. Revisão independente aprovada; alteração ainda sem commit/publicação neste registro.
