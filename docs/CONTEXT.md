# ZeloPDV Context

Este e o ponto de entrada para documentacao interna do repo.

## O que fica na raiz

- `AGENTS.md`: instrucoes operacionais para agentes e contribuidores automatizados.

## Documentacao viva

- [setup/DEV_SETUP.md](./setup/DEV_SETUP.md): setup local, stack e prerequisitos.
- [operations/OFFLINE.md](./operations/OFFLINE.md): comportamento offline real do PDV.
- [roadmap/CLEANUP_FOLLOWUPS.md](./roadmap/CLEANUP_FOLLOWUPS.md): backlog tecnico curto de limpeza e follow-ups.
- [features/update-versioning.md](./features/update-versioning.md): arquitetura do detector de nova versao e refresh seguro.
- [billing/pix-abacatepay-plan.md](./billing/pix-abacatepay-plan.md): notas de arquitetura do Pix transparente com AbacatePay.
- [referral-system.md](./referral-system.md): documentacao do sistema de indicacoes.

## Trackers de projeto

- [projects/PROJETO_ACESSOS.md](./projects/PROJETO_ACESSOS.md): tracker vivo do add-on Controle de Acessos.
- [projects/PROJETO_MESAS.md](./projects/PROJETO_MESAS.md): tracker vivo do add-on Mesas.

## Arquivos historicos

- [archive/mesas-initial-plan.md](./archive/mesas-initial-plan.md): plano inicial que originou o tracker de Mesas.

## Convencoes

- Preferir docs em `docs/` e evitar criar novos `.md` soltos na raiz.
- Quando uma doc deixar de ser viva, mover para `docs/archive/` ou consolidar numa doc atual.
- Quando houver duplicacao entre uma nota curta e uma doc tecnica mais completa, manter a mais completa e remover a redundante.
