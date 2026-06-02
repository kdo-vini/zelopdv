# ZeloPDV

Sistema web de PDV e gestão para operação pequena no Brasil, com billing recorrente, Pix, add-ons, subusuários, onboarding automatizado e integração operacional com ZeloChat.

## Stack

- App principal: SvelteKit 2 + Svelte 5 + Vite 6
- Admin interno: `admin-dashboard/` em SvelteKit 2 + Svelte 4
- Backend: Supabase (Auth, Postgres, Storage, Realtime)
- Billing: Stripe + AbacatePay
- Email: Resend
- IA / suporte: OpenAI + ZeloChat interno
- Offline: Dexie / IndexedDB para contingência do PDV

## Estrutura

- `src/` — app principal
- `src/routes/app/` — frente de caixa, pedidos, cozinha e mesas
- `src/routes/gestao/` — gestão
- `src/routes/api/` — endpoints server-side
- `src/lib/` — helpers, stores, integrações e lógica de domínio
- `admin-dashboard/` — painel admin separado
- `tests/` — Vitest
- `e2e/` — Playwright
- `docs/` — documentação detalhada e histórica
- `pdvObsidian/` — vault Obsidian do projeto

## Comandos

```bash
npm install
npm run dev
npm run build
npm run check
npm test
npm run test:e2e
```

Admin:

```bash
cd admin-dashboard
npm install
npm run dev
npm run build
npm run check
```

## Comece por aqui

- [CURRENT.md](/home/vinicius/code/zelopdv/CURRENT.md) — estado validado da sessão
- [CLAUDE.md](/home/vinicius/code/zelopdv/CLAUDE.md) — arquitetura, fluxos críticos, invariantes e riscos
- [BILLING.md](/home/vinicius/code/zelopdv/BILLING.md) — assinatura, Stripe, Pix e operação manual
- [CODE_REVIEW.md](/home/vinicius/code/zelopdv/CODE_REVIEW.md) — riscos técnicos já identificados
- [docs/data/SCHEMA_RLS.md](/home/vinicius/code/zelopdv/docs/data/SCHEMA_RLS.md) — tenancy, RLS e trust boundaries
- [docs/integrations/EXTERNAL_DEPENDENCIES.md](/home/vinicius/code/zelopdv/docs/integrations/EXTERNAL_DEPENDENCIES.md) — integrações externas e blast radius
- [docs/modules/ACESSOS.md](/home/vinicius/code/zelopdv/docs/modules/ACESSOS.md) — contrato atual do add-on Acessos
- [docs/modules/MESAS.md](/home/vinicius/code/zelopdv/docs/modules/MESAS.md) — contrato atual do add-on Mesas
- [docs/setup/DEV_SETUP.md](/home/vinicius/code/zelopdv/docs/setup/DEV_SETUP.md) — setup local
- [pdvObsidian/HOME.md](/home/vinicius/code/zelopdv/pdvObsidian/HOME.md) — hub do vault

## Notas operacionais

- `subscriptions` é a fonte de verdade de acesso.
- O fluxo offline atual é contingência do PDV, não offline-first completo.
- O purge final de contas agendadas depende de um sweeper externo citado nas migrations.
- O admin dashboard assume tabelas administrativas acessíveis via anon key; ver [CODE_REVIEW.md](/home/vinicius/code/zelopdv/CODE_REVIEW.md).
