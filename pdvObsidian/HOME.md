# ZeloPDV — Base operacional

> Hub central do vault. Use isto como ponto de entrada para engenharia e IA.

## Start here

1. [[CURRENT]] — snapshot validado, testes e riscos imediatos
2. [[CLAUDE]] — arquitetura real, invariantes e pontos frágeis
3. [[BILLING]] — se tocar assinatura, trial, Stripe, Pix ou portal
4. [[ZeloPDV.memory]] — fatos curtos para continuidade entre sessões

## Core operational docs

- [[CURRENT]] — estado atual
- [[CLAUDE]] — architecture / contracts / hotspots
- [[BILLING]] — recurring billing + Pix runbook
- [[CODE_REVIEW]] — known risks and drifts
- [[TRADEOFFS]] — tradeoffs aceitos + dívida técnica conhecida
- [[FIXES_PROGRESS]] — shipped vs pending
- [[INCIDENTS]] — outage and failure patterns
- [[AGENTS]] — operating contract for subagents
- [[DESIGN_PATTERNS]] — padrões de UI (consultar **antes** de mexer em qualquer tela)
- [[ZeloPDV.memory]] — compact memory

## Deep docs

- [[docs/CONTEXT]] — mapa geral da documentação antiga e viva
- [[docs/setup/DEV_SETUP]] — setup local e comandos
- [[docs/data/SCHEMA_RLS]] — tenancy, RLS e trust boundaries
- [[docs/integrations/EXTERNAL_DEPENDENCIES]] — integrações externas e pontos de falha
- [[docs/modules/ACESSOS]] — contrato operacional atual do add-on Acessos
- [[docs/modules/MESAS]] — contrato operacional atual do add-on Mesas
- [[docs/operations/OFFLINE]] — comportamento offline real do PDV
- [[docs/referral-system]] — sistema de indicação
- [[docs/marketing/PUBLIC_ROUTES]] — rotas públicas para leads, Ads, SEO, auth e suporte sem login
- [[docs/billing/pix-abacatepay-plan]] — nota histórica do desenho inicial do Pix
- [[docs/projects/PROJETO_ACESSOS]] — tracker histórico por sprint do add-on Acessos
- [[docs/projects/PROJETO_MESAS]] — tracker histórico por sprint do add-on Mesas
- [[docs/roadmap/CLEANUP_FOLLOWUPS]] — backlog curto de limpeza
- [[docs/features/update-versioning]] — detector de nova versão

## Validate quickly

```bash
npm run check
npm test
npm run build
```

## Hotspots

- `src/routes/app/mesas/[id]/+page.svelte`
- `src/routes/relatorios/+page.svelte`
- `src/routes/gestao/produtos/+page.svelte`
- `src/routes/assinatura/+page.svelte`
- `src/routes/perfil/+page.svelte`
- `src/routes/app/+page.svelte`
- `admin-dashboard/src/routes/subscriptions/+page.svelte`

## Notes

- Este vault reaproveita a pasta `pdvObsidian/.obsidian/` que já existia no projeto.
- Os docs na raiz e este vault são a trilha principal de continuidade.
