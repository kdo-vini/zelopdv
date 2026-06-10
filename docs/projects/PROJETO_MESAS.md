# PROJETO_MESAS — Add-on Mesas (Sprint Tracker)

> Historico de sprint. Nao tratar este arquivo como fonte canônica do comportamento atual.
> Fonte viva atual: `docs/modules/MESAS.md`.

> **Princípio**: este arquivo é **handoff stateful**. Qualquer agente (Claude, outra IA, outra conta) deve poder continuar do zero só lendo este arquivo. Atualizar a cada commit/tarefa.

---

## 1. Contexto geral

**Objetivo**: módulo de gestão de mesas estilo bar (abrir mesa → adicionar consumo → dividir conta → fechar → liberar) como **add-on opcional** ao plano Zelo PDV.

**Pricing definitivo**:
- Plano base: **R$ 59/mês**
- Add-on Mesas: **+R$ 30/mês**
- Total com add-on: **R$ 89/mês**

**Stack**: SvelteKit 5 (SSR/SPA hybrid) + Supabase (Postgres + Auth + RLS) + Stripe para assinatura + AbacatePay para PIX transparente.

**Persona MVP**: caixa/dono no balcão. Garçom anota em papel (externo ao sistema). Foco: lanchoneterias e bares pequenos.

**Spec original**: [mesas-initial-plan.md](../archive/mesas-initial-plan.md) (arquivo historico).

---

## 2. Status atual do projeto

- **Sprint atual**: 4 (Landing copy + polish) — **CONCLUÍDO**
- **Última tarefa concluída**: Landing page atualizada com seção dedicada do Módulo Mesas, mention no pricing card, FAQ entry + JSON-LD — 2026-04-27
- **Próxima tarefa**: Beta com cliente solicitante (ação externa, não-código)
- **Bloqueios ativos**: nenhum

---

## 3. Escopo MVP — checklist

### Sprint 1 — Fundações ✅
- [✅] Schema SQL pronto em `.ai/migrations/mesas_module.sql`
- [✅] **Migração aplicada em produção** (project `xnnjyrblpvsqrtsshawa`, 2026-04-27)
- [✅] `create-subscription` aceita `addons: { mesas: bool }` e calcula `value = 59 + (mesas ? 30 : 0)`
- [✅] Endpoint `POST /api/billing/toggle-addon` (ativa/desativa add-on em assinatura existente)
- [✅] `hasMesasAddon(userId)` em `src/lib/guards.js`
- [✅] UI do toggle de add-on em `/assinatura` (formulário novo + view de assinante ativo)
- [✅] `npm run build` passou
- [✅] Commit Sprint 1 (`5dd7c5f`)

### Sprint 2 — Telas core ✅
- [✅] `/gestao/mesas` (CRUD de mesas — número, capacidade, ativa, status)
- [✅] `/app/mesas` (mapa visual com tiles coloridos por status)
- [✅] `/app/mesas/[id]` (comanda: produtos grid + itens + totais + ajustes)
- [x] Gate `hasMesasAddon` aplicado nas 3 rotas (redirect/upsell card pra `/assinatura?addon=mesas`)
- [✅] Link "Mesas" adicionado no sidebar (grupo Vendas, após Frente de Caixa)
- [✅] `/assinatura?addon=mesas` mostra banner de upsell + pré-marca o checkbox

### Sprint 3 — Fechamento ✅
- [✅] Modal "Fechar mesa" com 5 formas (dinheiro/débito/crédito/PIX/fiado), troco automático para dinheiro, dropdown de cliente para fiado
- [✅] Conversão `comandas` → `vendas` + `vendas_itens` ao fechar (com snapshot de nome/preço, qty arredondada para int)
- [✅] Pré-conta (modal printável que NÃO fecha a comanda) + recibo final (após fechar) — ambos com `@media print` styles
- [✅] Liberação da mesa (status → 'livre') + comanda fechada com `id_venda` + `total_calculado`
- [✅] Baixa de estoque automática para produtos com `controlar_estoque`
- [✅] RPC `fiado_lancar_debito` para vendas no fiado
- [✅] Divisão igual exibida (informacional) — total / num_pessoas

### Sprint 4 — Polish + lançamento
- [☐] Testes unit + E2E (deferido)
- [✅] Update copy na **landing** (`/`) — usuário decidiu não tocar em `/precificacao`
- [☐] Beta com cliente que solicitou (ação externa)

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
| `docs/archive/mesas-initial-plan.md` | Spec original (não editar) | locked | 2026-04-27 |
| `docs/projects/PROJETO_MESAS.md` | Este doc (handoff) | living | 2026-04-27 |
| `.ai/migrations/mesas_module.sql` | Schema | pronto, não aplicado | 2026-04-27 |
| `src/routes/api/billing/create-subscription/+server.js` | aceita `addons` | aplicado | 2026-04-27 |
| `src/routes/api/billing/toggle-addon/+server.js` | endpoint toggle | criado | 2026-04-27 |
| `src/lib/guards.js` | + `hasMesasAddon()` | aplicado | 2026-04-27 |
| `src/routes/assinatura/+page.svelte` | toggle UI | aplicado | 2026-04-27 |
| `src/routes/gestao/mesas/+page.svelte` | CRUD mesas | criado | 2026-04-27 |
| `src/routes/app/mesas/+page.svelte` | mapa visual | criado | 2026-04-27 |
| `src/routes/app/mesas/[id]/+page.svelte` | comanda | criado | 2026-04-27 |
| `src/lib/components/GestaoSidebar.svelte` | + link "Mesas" no grupo Vendas | editado | 2026-04-27 |

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

### 2026-04-27 — Stripe: add-ons modelados como `subscription_items`
- **Decisão**: cada add-on vira um item separado na assinatura Stripe.
- **Alternativa considerada**: recalcular um único price fixo por combinação de plano + add-ons.
- **Rationale**: reduz explosão de preços cadastrados no Stripe, permite toggles independentes e mantém o modelo alinhado ao `buildStripeLineItems()`.

### 2026-04-27 — Toggle com proration no Stripe
- **Decisão**: `toggle-addon` usa `proration_behavior: 'create_prorations'`.
- **Rationale**: a cobrança ou crédito proporcional acontece no ciclo atual, com feedback imediato para o assinante. O DB também é atualizado sincronicamente para a UX não depender do webhook.

### 2026-04-27 — Tipos de FK: `id_produto integer`, `id_venda bigint`
- **Decisão**: `comanda_itens.id_produto` é `integer`, `comandas.id_venda` é `bigint`.
- **Alternativa considerada**: `uuid` (assumido inicialmente).
- **Rationale**: a inspeção do schema real revelou que `produtos.id` é `integer` e `vendas.id` é `bigint`. A primeira tentativa de migração falhou no `comandas_id_venda_fkey` por incompatibilidade de tipos. Lição: sempre verificar `information_schema.columns` antes de criar FKs.

---

## 8. Changelog detalhado

### [2026-04-27] Sprint 3 — Fechamento (close + recibo + pré-conta)

**Files**:
- `src/routes/app/mesas/[id]/+page.svelte` (editado) — adicionados:
  - Estado: `closeModalOpen`, `preContaOpen`, `formaPagamento`, `valorRecebido`, `pessoaFiadoId`, `pessoas`, `idCaixaAberto`, `recibo`, `recibosOpen`, `nomeEmpresa`
  - Funções: `loadCaixaEPerfil()`, `loadPessoasFiado()`, `abrirCloseModal()`, `fecharMesa()`, `imprimir()`, `fecharRecibo()`
  - 3 novos modais: pré-conta (printable, mantém comanda aberta), fechar mesa (com seletor de forma + cash/troco + dropdown fiado), recibo (após confirmação)
  - Print styles `@media print` (oculta tudo exceto `.print-target`, força preto/branco)

**Fluxo de fechamento**:
1. `vendas` insert (valor_total, forma, troco, id_caixa quando disponível, id_cliente para fiado, tipo_pedido='mesa')
2. `vendas_itens` insert (snapshot nome+preço, qty arredondada para int)
3. Se fiado: `rpc('fiado_lancar_debito', {p_id_pessoa, p_valor})`
4. Baixa de estoque: `rpc('decrementar_estoque')` para produtos com `controlar_estoque`
5. `comandas` update: status='fechada', fechada_em, id_venda, total_calculado
6. `mesas` update: status='livre'
7. Mostra recibo modal + redireciona ao clicar "Voltar"

**Verification**: `npm run build` passou.

**Commit**: pendente

**Gotchas**:
- `vendas_itens.quantidade` é `integer` (não numeric). Comanda permite `quantidade` numérica (0.5 chopp), mas no momento do fechamento arredondamos. Documentado em gotcha #11.
- `id_caixa` é nullable — se não houver caixa aberto, salva como null. Relatório de fechamento de caixa não vai capturar essa venda nesse caso.
- Pré-conta NÃO altera estado da comanda. Só print.
- `numero_venda` é gerado automaticamente pelo DB (sequence/trigger). Não passamos.

---

### [2026-04-27] Sprint 2 — Telas core (CRUD + mapa + comanda)

**Files**:
- `src/routes/gestao/mesas/+page.svelte` (novo) — CRUD com modal de criar/editar, tabela com status pills, exclusão com proteção de FK
- `src/routes/app/mesas/+page.svelte` (novo) — mapa de tiles coloridos por status (verde=livre, vermelho=ocupada, âmbar=fechando), abre/cria comanda ao clicar
- `src/routes/app/mesas/[id]/+page.svelte` (novo) — split-view comanda: produtos com busca/categorias à esquerda, itens com qty stepper + totais à direita, ajustes (taxa serviço, couvert, desconto) em accordion
- `src/lib/components/GestaoSidebar.svelte` (editado) — link "Mesas" no grupo Vendas
- `src/routes/assinatura/+page.svelte` (editado) — query `?addon=mesas` mostra banner de upsell e pré-marca o checkbox

**UX**:
- Cada página tem upsell card próprio quando `hasMesasAddon = false` (botão para `/assinatura?addon=mesas`)
- Comanda usa `pdvCache` para produtos/categorias (evita duplicar fetch)
- Adicionar produto na comanda: se já existe, incrementa qty (não duplica row)
- Botão "Fechar mesa" presente mas disabled (Sprint 3)
- Botão "Cancelar comanda" funcional: marca comanda como cancelada + libera mesa

**Verification**: `npm run build` passou — 3 novas entries em `.svelte-kit/output/server/entries/pages/` (gestao/mesas, app/mesas, app/mesas/_id_).

**Commit**: pendente

**Gotchas**:
- Mesa só aparece no mapa se `ativa = true`. CRUD permite desativar sem excluir.
- Excluir mesa com comandas → bloqueado pelo FK; tratamos a mensagem de erro.
- `numero` é único por usuário (constraint `mesas_usuario_numero_unique`); duplicate gera toast amigável.

---

### [2026-04-27] Sprint 1 — Migração aplicada em produção

**Files**:
- `.ai/migrations/mesas_module.sql` (atualizado: tipos de FK corrigidos)
- `docs/projects/PROJETO_MESAS.md` (atualizado: status, gotcha de tipos, log de decisão)

**Tabelas criadas em produção** (`xnnjyrblpvsqrtsshawa`):
- `mesas` (RLS habilitada, policy `mesas_owner`)
- `comandas` (RLS habilitada, policy `comandas_owner`)
- `comanda_itens` (RLS habilitada, policy `comanda_itens_owner` via EXISTS)
- Coluna nova: `subscriptions.has_mesas_addon BOOLEAN DEFAULT false`

**Verification**: confirmado via `information_schema` + `pg_policies` — 3 tabelas, 3 policies, RLS=true em todas.

**Gotcha encontrado**: primeira tentativa falhou com `cannot be implemented: Key columns "id_venda" and "id" are of incompatible types: uuid and bigint`. Causa: assumi `uuid` para todas as FKs, mas `produtos.id=integer` e `vendas.id=bigint`. Schema do plano inicial de Mesas estava errado nesse ponto. Corrigido e re-aplicado com sucesso.

**Commit (doc update)**: pendente

---

### [2026-04-27] Sprint 1 — Backend + UI prontos, migração pendente

**Files**:
- `.ai/migrations/mesas_module.sql` (novo)
- `src/routes/api/billing/create-subscription/+server.js` (modificado: aceita `addons`, `value` agora dinâmico, persiste `has_mesas_addon`)
- `src/routes/api/billing/toggle-addon/+server.js` (novo)
- `src/lib/guards.js` (modificado: + `hasMesasAddon`)
- `src/routes/assinatura/+page.svelte` (modificado: checkbox em formulários novos + toggle card em assinante ativo + total dinâmico)
- `docs/projects/PROJETO_MESAS.md` (novo)

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

1. **`toggle-addon` no Stripe usa proration**: a alteração pode gerar cobrança ou crédito proporcional no ciclo atual.
2. **`subscriptions` tem RLS desabilitada**: leituras client-side funcionam (RLS não bloqueia), mas escritas só via service role. O endpoint `toggle-addon` usa `supabaseAdmin`.
3. **`id_usuario` vs `user_id`**: tabelas de domínio (`mesas`, `comandas`, `comanda_itens`) usam `id_usuario`. Tabela de billing (`subscriptions`) usa `user_id`. Não trocar.
4. **Endpoint legado**: `/api/billing/create-checkout-session` está descontinuado. O fluxo suportado é `/api/billing/create-subscription`.
5. **Svelte não interpola `{}` em `<script type="application/ld+json">`**: usar `{@html}` (ver CLAUDE.md, seção SEO).
6. **Tema**: nunca hardcoded `#hex` em components — usar CSS variables (`var(--primary)`, etc.).
7. **PIX do checkout principal depende de flag**: `create-subscription` só expõe `pix` no Stripe se `BILLING_PIX_ENABLED=true`.
8. **`produtos.id = integer`, `vendas.id = bigint`** — não são UUIDs. Qualquer nova FK que aponte pra essas tabelas precisa do tipo certo. `comanda_itens.id_produto` é `integer`; `comandas.id_venda` é `bigint`.
9. **`vendas_itens.quantidade = integer`**, mas `comanda_itens.quantidade = numeric(10,3)`. Ao fechar uma mesa, arredondamos com `Math.round` (mín. 1). Se o negócio precisar registrar fração na venda final, precisará migration `ALTER TABLE vendas_itens ALTER COLUMN quantidade TYPE numeric(10,3)`.
10. **`numero_venda` em `vendas`** é gerado pelo DB (sequence ou trigger). NUNCA passar manualmente no insert.

---

## 11. Riscos ativos

| Risco | Severidade | Mitigação |
|---|---|---|
| Migração não aplicada → endpoints quebram em produção | ~~alto~~ ✅ resolvido | Aplicada em 2026-04-27. |
| Mudança futura na modelagem de preços/add-ons no Stripe | médio | `buildStripeLineItems()` e `toggle-addon` concentram a lógica de billing. |
| Cliente ativa addon mas não tem mesas configuradas → UX confusa no Sprint 2 | médio | Empty state em `/gestao/mesas` com CTA "criar primeira mesa". |
| Divergência entre update síncrono do DB e webhook Stripe em caso de falha parcial | baixo | Endpoint `toggle-addon` atualiza DB para UX imediata; webhook de `customer.subscription.updated` reconcilia estado. |

---

## 12. TODOs deferidos

- [x] ~~Aplicar migração em produção~~ ✅ feito 2026-04-27
- [ ] Revisar UX entre checkout Stripe e PIX transparente para manter jornada de billing consistente
- [ ] Adicionar telemetria: quantos % dos assinantes ativam o add-on?
- [ ] Atualizar `/precificacao` com pricing do add-on
- [ ] Atualizar `/termos` mencionando que o add-on não é pro-rata
- [ ] Considerar tabela `subscription_addons` quando 2º add-on chegar
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
