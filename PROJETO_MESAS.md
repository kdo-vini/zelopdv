# PROJETO_MESAS — Add-on Mesas (Sprint Tracker)

> **Princípio**: este arquivo é **handoff stateful**. Qualquer agente (Claude, outra IA, outra conta) deve poder continuar do zero só lendo este arquivo. Atualizar a cada commit/tarefa.

---

## 1. Contexto geral

**Objetivo**: módulo de gestão de mesas estilo bar (abrir mesa → adicionar consumo → dividir conta → fechar → liberar) como **add-on opcional** ao plano Zelo PDV.

**Pricing definitivo**:
- Plano base: **R$ 59/mês**
- Add-on Mesas: **+R$ 30/mês**
- Total com add-on: **R$ 89/mês**

**Stack**: SvelteKit 5 (SSR/SPA hybrid) + Supabase (Postgres + Auth + RLS) + Asaas (PIX/Boleto/Cartão).

**Persona MVP**: caixa/dono no balcão. Garçom anota em papel (externo ao sistema). Foco: lanchoneterias e bares pequenos.

**Spec original**: [`mesas.md`](mesas.md) (raiz do repo).

---

## 2. Status atual do projeto

- **Sprint atual**: 1 (Fundações)
- **Última tarefa concluída**: Frontend toggle de add-on em `/assinatura`
- **Pendência crítica**: aplicar a migração SQL em produção (`xnnjyrblpvsqrtsshawa`) — bloqueada por política de aprovação explícita; SQL pronto em [`.ai/migrations/mesas_module.sql`](.ai/migrations/mesas_module.sql).
- **Próxima tarefa**: usuário aprovar e aplicar migração + rodar `npm run build` + commit.
- **Bloqueios ativos**: migração SQL (precisa aprovação manual).

---

## 3. Escopo MVP — checklist

### Sprint 1 — Fundações
- [✅] Schema SQL pronto em `.ai/migrations/mesas_module.sql`
- [☐] **Migração aplicada em produção** (bloqueada — pendente aprovação)
- [✅] `updateSubscriptionValue()` em `src/lib/server/asaas.js`
- [✅] `create-subscription` aceita `addons: { mesas: bool }` e calcula `value = 59 + (mesas ? 30 : 0)`
- [✅] Endpoint `POST /api/billing/toggle-addon` (ativa/desativa add-on em assinatura existente)
- [✅] `hasMesasAddon(userId)` em `src/lib/guards.js`
- [✅] UI do toggle de add-on em `/assinatura` (formulário novo + view de assinante ativo)
- [☐] `npm run build` passou
- [☐] Commit Sprint 1

### Sprint 2 — Telas core
- [☐] `/gestao/mesas` (CRUD de mesas — número, capacidade, ativa)
- [☐] `/app/mesas` (mapa visual de mesas, status livre/ocupada/fechando)
- [☐] `/app/mesas/[id]` (comanda — adicionar itens via grid de produtos, observações)
- [☐] Gate `hasMesasAddon` aplicado nas rotas acima

### Sprint 3 — Fechamento
- [☐] Modal "Fechar mesa" com divisão igual entre N pessoas
- [☐] Conversão `comandas` → `vendas` + `vendas_itens` ao fechar
- [☐] Pré-conta (impressão sem fechar) + recibo final
- [☐] Liberação da mesa (status → 'livre')

### Sprint 4 — Polish + lançamento
- [☐] Testes unit + E2E
- [☐] Update copy `/precificacao` com tier add-on
- [☐] Beta com cliente que solicitou

---

## 4. Escopo V2/V3 (fora do MVP, registrado pra evitar scope creep)

- Múltiplas comandas por mesa
- Transferência de itens entre mesas
- Reservas
- Time-tracking de mesa (tempo médio de ocupação)
- Garçom com login próprio
- KDS (Kitchen Display System)
- Couvert artístico variável (hoje fixo na comanda)
- Taxa de serviço opcional por item (hoje só por comanda)

---

## 5. Schema SQL (definitivo — Sprint 1)

Arquivo: [`.ai/migrations/mesas_module.sql`](.ai/migrations/mesas_module.sql)

| Tabela | Propósito | FK chave |
|---|---|---|
| `mesas` | cadastro de mesas (número, capacidade) | `id_usuario → auth.users` |
| `comandas` | sessão de mesa aberta (totais, taxa, couvert, desconto) | `id_mesa → mesas`, `id_usuario`, `id_venda → vendas` (após fechar) |
| `comanda_itens` | itens consumidos | `id_comanda → comandas`, `id_produto → produtos` |

**Nova coluna**: `subscriptions.has_mesas_addon BOOLEAN DEFAULT false`.

**Decisões de tipos**:
- `mesas.numero TEXT` — pra suportar "M1", "Varanda 2", etc.
- `comanda_itens.quantidade NUMERIC(10,3)` — 3 casas pra fracionar (ex: 0.5 chopp).
- `comanda_itens.preco_unitario NUMERIC(10,2)` — snapshot do preço na hora do pedido (preço futuro de produto não retroage).
- `comandas.status` CHECK: `'aberta'|'fechada'|'cancelada'`.
- `mesas.status` CHECK: `'livre'|'ocupada'|'fechando'`.

**RLS**: 3 tabelas com `auth.uid() = id_usuario`. `comanda_itens` usa EXISTS via `comandas` (não tem `id_usuario` direto).

---

## 6. Mapa de arquivos

| Arquivo | Propósito | Status | Última edição |
|---|---|---|---|
| `mesas.md` | Spec original (não editar) | locked | 2026-04-27 |
| `PROJETO_MESAS.md` | Este doc (handoff) | living | 2026-04-27 |
| `.ai/migrations/mesas_module.sql` | Schema | pronto, não aplicado | 2026-04-27 |
| `src/lib/server/asaas.js` | + `updateSubscriptionValue()` | aplicado | 2026-04-27 |
| `src/routes/api/billing/create-subscription/+server.js` | aceita `addons` | aplicado | 2026-04-27 |
| `src/routes/api/billing/toggle-addon/+server.js` | endpoint toggle | criado | 2026-04-27 |
| `src/lib/guards.js` | + `hasMesasAddon()` | aplicado | 2026-04-27 |
| `src/routes/assinatura/+page.svelte` | toggle UI | aplicado | 2026-04-27 |
| `src/routes/gestao/mesas/+page.svelte` | CRUD mesas (Sprint 2) | TODO | — |
| `src/routes/app/mesas/+page.svelte` | mapa de mesas (Sprint 2) | TODO | — |
| `src/routes/app/mesas/[id]/+page.svelte` | comanda (Sprint 2) | TODO | — |

---

## 7. Decisões técnicas (log)

### 2026-04-27 — `id_usuario` nas tabelas de domínio (não `user_id`)
- **Decisão**: usar `id_usuario` em `mesas`, `comandas`, `comanda_itens`.
- **Alternativa considerada**: `user_id` (que é o padrão de `subscriptions`).
- **Rationale**: `produtos`, `vendas`, `pessoas`, `categorias` usam `id_usuario`. As novas tabelas são tabelas de **domínio**, não de billing. Manter consistência com domínio facilita queries que fazem JOIN entre `comanda_itens` e `produtos`. `subscriptions` é exceção isolada.

### 2026-04-27 — flag `has_mesas_addon BOOLEAN` em vez de tabela pivot
- **Decisão**: 1 coluna boolean em `subscriptions`.
- **Alternativa considerada**: tabela `subscription_addons (id, sub_id, addon_key, enabled, ...)`.
- **Rationale**: MVP só tem 1 add-on; simplicidade > flexibilidade. Reavaliar quando 2º add-on chegar.

### 2026-04-27 — Asaas: `POST /v3/subscriptions/{id}` para atualizar valor
- **Decisão**: usar `updateSubscriptionValue(subscriptionId, newValue)` para toggle.
- **Alternativa considerada**: cancelar + recriar.
- **Rationale**: cancelar+recriar resetaria `nextDueDate` e poderia bagunçar o trial. Asaas suporta update de valor in-place; o pro-rata não acontece (próximo ciclo já vem com novo valor) — ok pra MVP.

### 2026-04-27 — Toggle não passa `nextDueDate`
- **Decisão**: chamar `updateSubscriptionValue` sem `nextDueDate`.
- **Rationale**: preserva a data de vencimento atual (e o trial ativo). Asaas só ajusta o valor da próxima fatura.

---

## 8. Changelog detalhado

### [2026-04-27] Sprint 1 — Backend + UI prontos, migração pendente

**Files**:
- `.ai/migrations/mesas_module.sql` (novo)
- `src/lib/server/asaas.js` (modificado: + `updateSubscriptionValue`)
- `src/routes/api/billing/create-subscription/+server.js` (modificado: aceita `addons`, `value` agora dinâmico, persiste `has_mesas_addon`)
- `src/routes/api/billing/toggle-addon/+server.js` (novo)
- `src/lib/guards.js` (modificado: + `hasMesasAddon`)
- `src/routes/assinatura/+page.svelte` (modificado: checkbox em formulários novos + toggle card em assinante ativo + total dinâmico)
- `PROJETO_MESAS.md` (novo)

**Tabelas a criar** (após aplicação da migração):
- `mesas`, `comandas`, `comanda_itens`
- Coluna nova: `subscriptions.has_mesas_addon`
- RLS habilitada nas 3 novas tabelas (policy `auth.uid() = id_usuario`; `comanda_itens` usa EXISTS)

**Verificação**: pendente — migração precisa ser aplicada antes que o build funcione end-to-end.

**Commit**: pendente

**Gotchas**: ver seção 10.

---

## 9. Como testar

### Backend
```bash
# 1. Aplicar migração (pendente — usar Supabase MCP ou SQL Editor)
# 2. Rodar dev server
npm run dev

# 3. Testar create-subscription com add-on (precisa de JWT do usuário logado):
curl -X POST http://localhost:5173/api/billing/create-subscription \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"billingType":"PIX","addons":{"mesas":true}}'
# → Deve criar subscription com value=89.00 e has_mesas_addon=true

# 4. Testar toggle-addon:
curl -X POST http://localhost:5173/api/billing/toggle-addon \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"addon":"mesas","enabled":false}'
# → Deve voltar value para 59.00 e has_mesas_addon=false
```

### DB (Supabase SQL Editor)
```sql
-- Confirma flag adicionada
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'subscriptions' AND column_name = 'has_mesas_addon';

-- Confirma RLS isolando entre usuários
SET ROLE authenticated;
SET request.jwt.claim.sub = '<userA-uuid>';
SELECT count(*) FROM mesas;  -- deve ver só as do user A

SET request.jwt.claim.sub = '<userB-uuid>';
SELECT count(*) FROM mesas;  -- deve ver só as do user B (zero se A criou e B não)
```

### UI
1. Acessar `/assinatura` como usuário sem assinatura → ver checkbox "Módulo Mesas" e total dinâmico (R$ 59 ↔ R$ 89).
2. Como assinante ativo → ver card "Módulo Mesas" com botão Ativar/Desativar.
3. Clicar toggle → confirmar dialog → toast de sucesso → status do card atualiza.

---

## 10. Gotchas e pitfalls conhecidos

1. **Asaas não pro-rata**: toggle no meio do ciclo só vale para o **próximo** pagamento. A cobrança em andamento permanece com o valor antigo.
2. **Asaas não emite evento `SUBSCRIPTION_UPDATED`**: nenhum webhook dispara quando se chama `POST /v3/subscriptions/{id}`. Reconciliação acontece no próximo `PAYMENT_RECEIVED` (que vem com o novo `value`).
3. **`subscriptions` tem RLS desabilitada**: leituras client-side funcionam (RLS não bloqueia), mas escritas só via service role. O endpoint `toggle-addon` usa `supabaseAdmin`.
4. **`id_usuario` vs `user_id`**: tabelas de domínio (`mesas`, `comandas`, `comanda_itens`) usam `id_usuario`. Tabela de billing (`subscriptions`) usa `user_id`. Não trocar.
5. **CC ainda usa endpoint legado Stripe**: `/api/billing/create-checkout-session` (Stripe) recebe `addons` no body mas pode ignorar — verificar quando CC migrar pra Asaas. PIX já passa pelo fluxo Asaas correto.
6. **Trial não pode ser resetado**: `toggle-addon` chama `updateSubscriptionValue` SEM passar `nextDueDate`, preservando a data atual.
7. **Svelte não interpola `{}` em `<script type="application/ld+json">`**: usar `{@html}` (ver CLAUDE.md, seção SEO).
8. **Tema**: nunca hardcoded `#hex` em components — usar CSS variables (`var(--primary)`, etc.).
9. **PIX está em manutenção** na UI atual (`disabled` no radio). Quando reativar, addon deve continuar funcionando.

---

## 11. Riscos ativos

| Risco | Severidade | Mitigação |
|---|---|---|
| Migração não aplicada → endpoints quebram em produção | **alto** | Aplicar antes do deploy. Validar em staging primeiro. |
| Asaas API muda contrato de update de subscription | médio | Função isolada em `asaas.js` — fácil ajustar. |
| Cliente ativa addon mas não tem mesas configuradas → UX confusa no Sprint 2 | médio | Empty state em `/gestao/mesas` com CTA "criar primeira mesa". |
| Webhook reconciliation atrasa (PAYMENT_RECEIVED só dispara mensalmente) → DB pode ficar dessincronizado se update de Asaas falhar silenciosamente | baixo | Endpoint `toggle-addon` faz rollback se DB falhar. Logs vão pra console. |

---

## 12. TODOs deferidos

- [ ] Aplicar migração em produção (bloqueado — pendente aprovação)
- [ ] Migrar fluxo CC para Asaas (atualmente vai pro endpoint legado Stripe)
- [ ] Adicionar telemetria: quantos % dos assinantes ativam o add-on?
- [ ] Atualizar `/precificacao` com pricing do add-on
- [ ] Atualizar `/termos` mencionando que o add-on não é pro-rata
- [ ] Considerar tabela `subscription_addons` quando 2º add-on chegar
- [ ] Verificar se Asaas suporta ajuste de `nextDueDate` em sandbox sem efeitos colaterais (testar antes de Sprint 2)
- [ ] Decidir: ao desativar add-on, o que acontece com mesas/comandas existentes? (esconder UI vs deletar dados — tendência: esconder, manter dados pro caso de re-ativar)

---

## Protocolo de handoff

Após CADA item significativo do checklist concluído:
1. Atualizar **seção 2 (Status atual)** + adicionar entrada no **changelog** (seção 8).
2. Commit referenciando o item: `feat(mesas): <ação concluída>`.
3. Marcar item como `[✅]` no checklist.
4. Listar próximo item explicitamente em "próxima tarefa".

Assim qualquer agente que assumir consegue:
- Ler este arquivo → entender estado atual
- Ver último commit → confirmar o que foi feito
- Pegar próxima tarefa → continuar
