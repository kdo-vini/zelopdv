# Impeccable Audit 2026-07 — ZeloPDV Design System Health

> Escopo: auditoria técnica + correções em 5 superfícies do ZeloPDV
> Metodologia: Impeccable v3.9.1 (audit 5 dimensões: A11y, Performance, Theming, Responsive, Anti-Patterns)
> Data: 2026-07-12/13

---

## Health Scores

| Superfície | A11y | Perf | Theming | Responsivo | Anti-Pattern | Total |
|---|---|---|---|---|---|---|
| **PDV Operação** | 2.5 | 3.5 | 2.5 | 3.0 | 3.5 | **15/20** |
| **Marketing/Institucional** | 3.0 | 2.0 | 2.0 | 3.0 | 2.0 | **12/20** |
| **Auth + Billing** | 2.0 | 4.0 | 3.0 | 1.0 | 4.0 | **14/20** |
| **Gestão + Relatórios + Perfil** | 2.5 | 3.0 | 3.0 | 3.5 | 2.0 | **14/20** |
| **Admin Dashboard** | 3.0 | 2.0 | 3.0 | 3.0 | 3.0 | **14/20** |

**Rating médio: 13.8/20** (Bom, com margem de melhoria)

---

## Findings Aplicados

### P0 — Bloqueante (2)
1. Touch targets dos botões +/- do carrinho PDV: 32px → 44px (`src/routes/app/+page.svelte`)
2. Indigo-500 no bundle "Mais popular" do assinatura → sky-500 (`src/routes/assinatura/+page.svelte`)

### P1 — Maior (12, destaque)
3. `tabular-nums` utility global adicionada (`src/app.css`) — aplicar nos valores monetários fica como follow-up
4. Purple-400 na taxa de entrega do PDV → sky-400 (`+page.svelte` + `ModalPagamento.svelte`)
5. Glassmorphism do card AuthLayout removido → `background: var(--bg-panel)` sólido
6. `#fff` hardcoded no assinatura → `var(--primary-text)`
7. Hex hardcoded nos toggles login/cadastro → vars
8. Password toggles: hold-to-see → click-toggle acessível (keyboard + aria-label)
9. GoogleAuthButton: hardcoded hex → vars (`--text-main`, `--bg-panel`, `--border-subtle`)
10. Sombras do assinatura capadas (blur 60-90px → 14-24px)
11. Status dropdown do admin sem guardrail: `confirmDialog` adicionado para "canceled"
12. Auth-divider contrast: #475569 (4.4:1) → #64748b (7.5:1)

### P2 — Menor (destacados)
- Numbered markers "01/02/03" na SegmentLandingPage → Check icons
- Polling de pedidos 3s → 30s
- Auth-link colors: #38bdf8 → `var(--link)`

### P3 — Polish (destacados)
- aria-labels nos botões do carrinho PDV
- aria-labels nos toggles de redefinir-senha

---

## Padrões Sistêmicos Não Resolvidos (follow-up)
- **`tabular-nums` em valores monetários**: utility global criada, mas aplicar em cada `R$` individual fica para próxima sessão (afeta PDV, assinatura, gestão)
- **Sem paginação server-side no admin dashboard**: substitui issue, mas mudança grande demais para escopo atual
- **Página da Páscoa ignora design system**: temporária, mas se for reativada precisa refatorar
- **Page header canonical em gestão**: apenas 1/13 telas segue o padrão

---

## Arquivos Modificados (14)

 admin-dashboard/src/routes/subscriptions/+page.svelte     | confirmDialog guardrail
 src/app.css                                                | tabular-nums, auth vars, contrast
 src/lib/components/AuthLayout.svelte                       | glassmorphism removido
 src/lib/components/GoogleAuthButton.svelte                 | hex → tokens
 src/lib/components/marketing/SegmentLandingPage.svelte     | numbered markers → Check icons
 src/lib/components/modals/ModalPagamento.svelte            | purple → var(--primary)
 src/routes/app/+page.svelte                                | touch targets 44px, purple→sky, aria-labels
 src/routes/app/pedidos/+page.svelte                        | polling 3s→30s
 src/routes/assinatura/+page.svelte                         | indigo→sky, shadows cap, #fff→vars
 src/routes/assinatura/sucesso/+page.svelte                 | shadow cap
 src/routes/cadastro/+page.svelte                           | hex→vars, toggle acessível
 src/routes/login/+page.svelte                              | hex→vars, toggle acessível
 src/routes/redefinir-senha/+page.svelte                    | aria-labels, toggle acessível
```

---

## Comandos Recomendados Pŕoximos Passos

```bash
$impeccable polish PDV money values        # tabular-nums nos R$ do carrinho
$impeccable polish page headers gestão      # alinhar canonical header nas 12 telas
$impeccable audit admin-dashboard            # paginação server-side
$impeccable optimize pedidos polling         # confiar no realtime em vez de polling
```

---

## Zelinho AI - auditoria e correcoes (2026-07-13)

Escopo: trilho persistente, drawer de conversa, contexto de tela/sinal e superficies do Zelinho Gerente.

| Dimensao | Nota | Evidencia |
|---|---:|---|
| A11y | 3.5/4 | `inert` quando fechado, retorno de foco, foco preso em modal, labels e alvos de 44px |
| Performance | 3.5/4 | somente transform/opacity em motion, sem transicao de padding, cache de contexto no servidor |
| Theming | 3.5/4 | contraste e superficies usam tokens; detector deixou apenas avisos tipograficos advisory |
| Responsivo | 3.5/4 | trilho desktop, sheet intermediario e painel full-screen mobile |
| Anti-patterns | 4/4 | detector scoped sem achados nao-advisory |
| **Total** | **18/20** | **Excelente; E2E local autenticado concluido, publicacao pendente** |

### Correcoes aplicadas

- O rail nao ocupa espaco de conteudo; em desktop amplo o workspace reserva 24rem somente quando o painel abre.
- O painel fechado fica `inert`; Escape e fechar devolvem foco ao rail; o mobile usa dialog com focus trap.
- O contexto de produto, semana ou sinal e invalidado quando a rota, query ou entidade muda. O servidor reconsulta tudo pelo owner antes de montar o prompt.
- Sinais silenciados continuam no feed, mas colapsados. Falha ao marcar lido restaura o estado otimista.
- Evidencias agora exibem folhas aninhadas do contrato real, sem perder os campos humanos.
- Semana invalida, futura ou fora da janela de oito semanas e normalizada no client.
- Motion de digitacao, dot critico e skeletons respeita `prefers-reduced-motion`; icones e controles ganharam semantica e alvos consistentes.

### Validacao

- 31 testes focados de chat/contexto/gerente passaram.
- `npm run check`: 0 errors / 108 warnings.
- `git diff --check`: limpo (somente avisos de conversao CRLF do working tree).
- Detector scoped: 27 avisos `design-system-font-size`, todos advisory; nenhum P0/P1 ou achado nao-advisory.
- `npm test`: 326 testes passaram; 2 testes de `api.create-subscription` continuam falhando com 400 onde esperam 200, fora do escopo desta auditoria.
- E2E autenticado local: desktop 1440px e mobile 393px passaram rail, abertura, foco, `dialog` mobile, fechamento por Escape e retorno de foco. A producao ainda exibe o deploy anterior com `Parceiro IA`.
