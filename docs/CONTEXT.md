# ZeloPDV Context

Este e o ponto de entrada para documentacao interna do repo.

## Docs operacionais na raiz / vault

O repo agora tambem tem uma camada AI-first/operacional:

- `CURRENT.md`: estado curto da sessao/sprint
- `CLAUDE.md`: arquitetura real, fluxos criticos e riscos
- `BILLING.md`: runbook de assinatura/cobranca
- `CODE_REVIEW.md`: auditoria consolidada
- `FIXES_PROGRESS.md`: trilha viva de correcoes
- `INCIDENTS.md`: historico/padroes de incidentes
- `ZeloPDV.memory.md`: fatos confirmados para continuidade
- `pdvObsidian/HOME.md`: hub do vault Obsidian

Esses arquivos existem para engenharia + IA. O restante da documentacao detalhada continua em `docs/`.

## O que fica na raiz

- `AGENTS.md`: instrucoes operacionais para agentes e contribuidores automatizados.

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

- Preferir docs em `docs/` para notas tecnicas detalhadas.
- Reservar a raiz apenas para os docs operacionais centrais (`CURRENT`, `CLAUDE`, `BILLING`, `CODE_REVIEW`, `FIXES_PROGRESS`, `INCIDENTS`, `*.memory`, `AGENTS`).
- Quando uma doc deixar de ser viva, mover para `docs/archive/` ou consolidar numa doc atual.
- Quando houver duplicacao entre uma nota curta e uma doc tecnica mais completa, manter a mais completa e remover a redundante.
