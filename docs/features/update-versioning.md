# Update Versioning

Documentacao consolidada do sistema de deteccao de nova versao e refresh seguro do frontend.

## Objetivo

Detectar quando existe um deploy mais novo que o bundle carregado no navegador, avisar o usuario sem atrapalhar fluxos criticos e executar um refresh com o menor risco possivel de cache stale.

## Arquitetura

- `vite.config.js` define `__ZELO_BUILD_VERSION__` para client e server.
- `src/lib/version.js` expoe `APP_VERSION`.
- `src/routes/api/version/+server.js` devolve a versao atual do deploy com cache `no-store`.
- `src/lib/components/UpdateAvailable.svelte` e montado globalmente em `src/routes/+layout.svelte`.

## Fonte da versao

Ordem de prioridade usada no build:

- `PUBLIC_APP_VERSION`
- `VITE_PUBLIC_APP_VERSION`
- `VERCEL_GIT_COMMIT_SHA`
- `VERCEL_DEPLOYMENT_ID`
- `package.json` + timestamp de build

Em producao na Vercel, o identificador preferido e `VERCEL_GIT_COMMIT_SHA`.

## Como a deteccao funciona

- O client consulta `GET /api/version` no startup.
- A consulta tambem roda em foco, `visibilitychange`, `online` e em polling periodico.
- O componente compara a versao remota com `APP_VERSION` embutido no bundle.
- Eventos de refresh do service worker via Vite PWA tambem passam por confirmacao usando `/api/version`.
- `BroadcastChannel` sincroniza o estado entre abas abertas.

## Protecoes de UX

O aviso de nova versao e adiado quando o app detecta:

- digitacao em andamento;
- modal aberto;
- venda ativa no PDV via `sessionStorage.zelo_comanda`;
- rotas de edicao de pedidos;
- outros estados criticos inferidos por DOM e sessao.

O refresh:

- tenta pedir update do service worker quando disponivel;
- limpa caches do app ligados a Workbox, SvelteKit e Vite PWA;
- recarrega a URL atual com `appVersion` na query para cache busting;
- usa `sessionStorage` para evitar loop de prompt apos reload;
- usa `localStorage` para lembrar a acao "Later" por versao alvo.

## Arquivos afetados

- `vite.config.js`
- `src/lib/version.js`
- `src/routes/api/version/+server.js`
- `src/lib/components/UpdateAvailable.svelte`
- `src/routes/+layout.svelte`

## Riscos e limites

- A deteccao de fluxo critico ainda e heuristica. Se surgirem novas superficies sensiveis, elas devem marcar bloqueio explicitamente.
- Se a plataforma nao fornecer um identificador estavel e `PUBLIC_APP_VERSION` nao estiver setado, o fallback por timestamp continua correto para deteccao, mas piora a rastreabilidade.
- A limpeza de cache depende dos prefixes atuais. Mudancas futuras de naming no service worker exigem revisao.
- O usuario que escolhe "Later" nao ve o mesmo aviso novamente por um periodo de deferral local.

## Follow-ups uteis

- Criar um store explicito de `updateBlocking`.
- Adicionar cobertura Playwright para prompt adiado durante venda ativa.
- Expor o build hash numa tela interna de diagnostico.
- Considerar analytics leves para `detected`, `later` e `refresh`.
