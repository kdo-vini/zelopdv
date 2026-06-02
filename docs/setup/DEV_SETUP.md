# DEV_SETUP.md — ZeloPDV

Setup local e comandos úteis para trabalhar no repo sem depender de contexto oral.

## Stack

| Área | Stack |
| --- | --- |
| App principal | SvelteKit 2 + Svelte 5 + Vite 6 |
| Admin dashboard | SvelteKit 2 + Svelte 4 + Vite 5 |
| Backend | Supabase cloud |
| Billing | Stripe + AbacatePay |
| Email | Resend |
| Offline | Dexie / IndexedDB |
| Testes | Vitest + Playwright |
| Deploy | Vercel Node 20 |

## Pré-requisitos

- Node `20.x`
- npm `10.x`
- Git
- Chromium para Playwright

## Instalação

```bash
cd /home/vinicius/code/zelopdv
npm install

cd admin-dashboard
npm install
```

## Variáveis de ambiente

Raiz do app principal:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_PUBLIC_SUPABASE_URL`
- `VITE_PUBLIC_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`
- `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `ABACATEPAY_API_KEY`
- `ABACATEPAY_WEBHOOK_SECRET`
- `ABACATEPAY_PUBLIC_KEY`
- `ABACATEPAY_BASE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `OPENAI_API_KEY`
- `PUBLIC_APP_URL`
- `CRON_SECRET`
- `ZELOCHAT_INTERNAL_API_KEY`
- `ZELOCHAT_INTERNAL_SEND_URL` ou `ZELOCHAT_API_BASE_URL`

Para E2E:

- `E2E_BASE_URL`
- `E2E_TEST_EMAIL`
- `E2E_TEST_PASSWORD`

## Comandos

### App principal

```bash
cd /home/vinicius/code/zelopdv
npm run dev
npm run build
npm run preview
npm run check
npm test
npm run test:e2e
```

### Admin dashboard

```bash
cd /home/vinicius/code/zelopdv/admin-dashboard
npm run dev
npm run build
npm run check
```

## Portas esperadas

- App principal: `5173`
- Admin dashboard: `5174`

## Fluxo de validação recomendado

Para mudanças normais no app principal:

```bash
npm run check
npm test
npm run build
```

Para mudanças em billing, guards, offline, acessos ou telas críticas:

```bash
npm run check
npm test
npm run build
npm run test:e2e
```

Para mudanças no admin:

```bash
cd admin-dashboard
npm run check
npm run build
```

## Caveats conhecidos

- `npm test` não está totalmente verde no estado validado de 2026-06-01; veja `CURRENT.md`.
- `npm run check` passa, mas com warnings; veja `CURRENT.md` e `CODE_REVIEW.md`.
- O admin dashboard tem stack e dependências próprias; não assuma paridade de versão com o app principal.
- O fluxo de deleção de conta depende de um sweeper externo fora deste repo.
