# Landing Prova Real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task-by-task. Every task below is already implemented in the isolated worktree and checked off after its test cycle.

**Goal:** Manter o hero e o mascote do ZeloPDV, apresentando uma prova real do produto antes da sequência comercial principal.

**Architecture:** A seção financeira foi extraída para um componente de marketing que emite eventos e entrega a imagem selecionada ao lightbox global já existente na home. Footer, CTA e contrato de eventos permanecem pequenos e verificáveis.

**Tech Stack:** SvelteKit, Svelte, Vite, PostHog existente, Vitest e Playwright.

**Spec:** Requisitos de prova comercial ZeloPDV no pedido de 2026-09-05.

## Global Constraints

- Não inventar métricas, depoimentos ou logos de clientes.
- Preservar hero, mascote, CTAs atuais e fatos abaixo do hero.
- Usar capturas WebP/PNG existentes e distinguir funcionalidade de resultado.
- Eventos PostHog são não bloqueantes, sem PII e sem duplicar `$pageview`.
- O build Windows com EPERM de symlink não é aprovação; repetir em Linux/CI.

---

-## Tasks

- [x] **Task 1: Prova operacional após o hero** — `OperationalProofSection.svelte`, helper de contrato e `+page.svelte`.
   - A seção financeira foi extraída para `OperationalProofSection.svelte`.
   - O bloco mostra o selo “Tela real do sistema”, capturas reais de financeiro e dashboard e a indicação “Capturas reais do produto, sem mockup”.
   - A imagem selecionada usa o lightbox global, fecha por Escape/backdrop/botão e restaura o foco no acionador.
   - O CTA “Ver cardápios publicados” aponta para `https://menu.zelopdv.com.br/#empresas` e abre em nova aba.

- [x] **Task 2: Copy e confiança institucional** — `MarketingFooter.svelte`.
   - A explicação diferencia funcionalidade de resultado e não adiciona métricas, depoimentos ou logos sem fonte.
   - O footer remove o Gmail pessoal e mantém WhatsApp, demonstração, razão social, CNPJ e cardápios publicados.

- [x] **Task 3: Instrumentação tolerante a falhas** — `operationalProof.js` e chamadas no hero/prova.
   - Eventos PostHog: `marketing_proof_previewed`, `marketing_published_menus_clicked` e `marketing_trial_clicked`.
   - Captura é tolerante a falhas e não bloqueia navegação.

- [x] **Task 4: Regressão responsiva e acessibilidade** — projeto marketing do Playwright e contrato Vitest.
   - Projeto Playwright dedicado à landing evita dependência de autenticação.
   - E2E cobre hero, prova, lightbox, footer, link externo, viewports 320/390/768/1024/1440 e redução de movimento.
   - As imagens usam os WebP existentes via `picture`/`srcset`.

### Validation commands

Rodar no worktree antes da publicação:

```bash
npm run check
npm test
npm run test:e2e
npm run build
```

Resultado da execução neste worktree: check sem erros/avisos, 174 arquivos de teste com 1058 testes passando e 3 pulados, marketing E2E com 9 testes passando. O build compilou SSR, client e PWA e terminou no adapter Vercel com EPERM de symlink do Windows; repetir em Linux/CI.
