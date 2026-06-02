# ZeloPDV Context

Este e o ponto de entrada para documentacao interna do repo.

## Docs operacionais (camada AI-first) — agora em `docs/`

Toda a documentacao do repo vive em `docs/` (antes era dividida entre raiz e `docs/`).
A camada operacional/AI-first fica no topo de `docs/`:

- [CURRENT.md](./CURRENT.md): estado curto da sessao/sprint
- [BILLING.md](./BILLING.md): runbook de assinatura/cobranca
- [CODE_REVIEW.md](./CODE_REVIEW.md): auditoria consolidada
- [TRADEOFFS.md](./TRADEOFFS.md): tradeoffs aceitos e divida tecnica conhecida
- [FIXES_PROGRESS.md](./FIXES_PROGRESS.md): trilha viva de correcoes
- [INCIDENTS.md](./INCIDENTS.md): historico/padroes de incidentes
- [ZeloPDV.memory.md](./ZeloPDV.memory.md): fatos confirmados para continuidade
- `pdvObsidian/HOME.md`: hub do vault Obsidian (espelha `docs/` via symlinks)

## O que fica na raiz (so pontos de entrada)

A raiz guarda apenas os tres arquivos que ferramentas e humanos esperam encontrar la:

- `README.md`: porta de entrada para humanos / GitHub.
- `CLAUDE.md`: arquitetura real, fluxos criticos e riscos — carregado automaticamente pelo Claude Code a partir da raiz.
- `AGENTS.md`: instrucoes operacionais para agentes (convencao cross-tool de raiz).

## Documentacao viva

- [setup/DEV_SETUP.md](./setup/DEV_SETUP.md): setup local, stack e prerequisitos.
- [data/SCHEMA_RLS.md](./data/SCHEMA_RLS.md): tenancy, RLS, trust boundaries e limitacoes atuais de enforcement.
- [integrations/EXTERNAL_DEPENDENCIES.md](./integrations/EXTERNAL_DEPENDENCIES.md): mapa das integracoes externas, envs e modos de falha.
- [modules/ACESSOS.md](./modules/ACESSOS.md): contrato operacional atual do add-on Controle de Acessos.
- [modules/MESAS.md](./modules/MESAS.md): contrato operacional atual do add-on Mesas.
- [operations/OFFLINE.md](./operations/OFFLINE.md): comportamento offline real do PDV.
- [roadmap/CLEANUP_FOLLOWUPS.md](./roadmap/CLEANUP_FOLLOWUPS.md): backlog tecnico curto de limpeza e follow-ups.
- [features/update-versioning.md](./features/update-versioning.md): arquitetura do detector de nova versao e refresh seguro.
- [billing/pix-abacatepay-plan.md](./billing/pix-abacatepay-plan.md): nota historica do desenho inicial do Pix. O runbook vivo agora e `BILLING.md`.
- [referral-system.md](./referral-system.md): documentacao do sistema de indicacoes.

## Trackers de projeto

- [projects/PROJETO_ACESSOS.md](./projects/PROJETO_ACESSOS.md): tracker historico por sprint do add-on Controle de Acessos.
- [projects/PROJETO_MESAS.md](./projects/PROJETO_MESAS.md): tracker historico por sprint do add-on Mesas.

## Arquivos historicos / snapshots

- [archive/mesas-initial-plan.md](./archive/mesas-initial-plan.md): plano inicial que originou o tracker de Mesas.
- [roadmap/CLEANUP_FOLLOWUPS.md](./roadmap/CLEANUP_FOLLOWUPS.md): backlog tecnico util, mas nao e source-of-truth operacional do produto.

## Convencoes

- Toda documentacao vive em `docs/`. Nao criar `.md` operacionais novos na raiz.
- A raiz guarda apenas os pontos de entrada: `README.md`, `CLAUDE.md` e `AGENTS.md`.
- O vault `pdvObsidian/` espelha `docs/` via symlinks; ao criar uma doc nova em `docs/`, adicionar o symlink correspondente no vault se quiser que apareca no Obsidian.
- Quando uma doc deixar de ser viva, mover para `docs/archive/` ou consolidar numa doc atual.
- Quando houver duplicacao entre uma nota curta e uma doc tecnica mais completa, manter a mais completa e remover a redundante.
