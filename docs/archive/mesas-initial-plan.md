# Plano — Módulo Mesas: Gerenciamento de Projeto + Implementação MVP

> Arquivo historico. Este plano originou o tracker por sprint em [../projects/PROJETO_MESAS.md](../projects/PROJETO_MESAS.md). A fonte viva atual do modulo e `docs/modules/MESAS.md`.

## Contexto

Cliente solicitou módulo de mesas estilo bar. Após dois rounds de refino:

- **Tipo confirmado**: add-on opcional ao plano R$59
- **Preço confirmado**: **+R$30/mês** → total R$89/mês com add-on
- **Persona MVP**: caixa/dono no balcão (garçom anota em papel, externo ao sistema)
- **Estilo operacional**: bar — chopp, torre, porção, mesa acumula consumo
- **Núcleo**: abrir mesa → adicionar consumo → dividir conta → fechar → liberar

**Decisão do usuário**: pular o brainstorm-as-document e ir direto pra **gerenciamento de projeto + começar implementação**.

---

## Entregáveis (após ExitPlanMode aprovado)

### 1. Criar `PROJETO_MESAS.md` como tracker vivo do projeto

**Princípio crítico**: documento de **HANDOFF stateful**. Qualquer agente (Claude, outra IA, outra conta) deve poder continuar do zero só lendo esse arquivo. Os tokens podem acabar a qualquer momento.

**Estrutura obrigatória do doc**:

1. **Contexto geral**
   - Objetivo do módulo (1 parágrafo)
   - Pricing definitivo: R$30 add-on, R$89 total
   - Stack técnica relevante (SvelteKit 5, Supabase, Stripe)
   - Persona alvo: caixa/dono no balcão

2. **Status atual do projeto** (atualizado a cada commit)
   - Sprint atual: [número]
   - Última tarefa concluída + data + commit hash
   - Próxima tarefa
   - Bloqueios ativos

3. **Escopo MVP** — checklist completo com status (☐/🟡/✅) por item

4. **Escopo V2/V3** — fora do MVP, listado explicitamente pra evitar scope creep

5. **Schema SQL** — definitivo, com comentários explicando cada decisão (por que `numero` é TEXT, por que `quantidade` é NUMERIC(10,3), etc.)

6. **Mapa de arquivos** — tabela de `arquivo | propósito | status | última edição`

7. **Decisões técnicas** — log com data, decisão, alternativas consideradas, rationale
   - Ex: "2026-04-27: usar `subscriptions.has_mesas_addon BOOLEAN` em vez de tabela pivot. Razão: MVP só tem 1 add-on, simplicidade > flexibilidade. Reavaliar quando 2º add-on chegar."

8. **Changelog detalhado** — formato:
   ```
   ## [2026-04-27] Sprint 1 — Migração de schema aplicada
   - Files: .ai/migrations/mesas_module.sql (novo)
   - Tables created: mesas, comandas, comanda_itens
   - Column added: subscriptions.has_mesas_addon
   - RLS: enabled em todas as 3 novas tabelas
   - Verification: testado com user A/B em staging — RLS isolando corretamente
   - Commit: <hash>
   - Gotchas: nenhum
   ```

9. **Como testar** — comandos pra rodar (`npm run dev`, queries SQL, etc.) por feature

10. **Gotchas e pitfalls conhecidos** — coisas não-óbvias que outro agente precisa saber
    - Ex: "Svelte não interpola `{}` em `<script type=ld+json>` — usar `{@html}` (CLAUDE.md tem exemplo)"

11. **Riscos ativos** — atualizado conforme aparecem

12. **TODOs deferidos** — coisas que pulamos no MVP mas precisam ser revisitadas

**Princípio de atualização**: a cada commit/tarefa concluída, atualizar a seção "Status atual" + adicionar entrada no Changelog. Esse arquivo é commitado junto com o código.

### 2. Começar implementação — Sprint 1: Fundações

**Sprint 1 (Database + Billing)**:

a) **Migração SQL** em `.ai/migrations/mesas_module.sql`:
   - Tabelas `mesas`, `comandas`, `comanda_itens`
   - Coluna `subscriptions.has_mesas_addon BOOLEAN DEFAULT false`
   - RLS policies consistentes com padrão do projeto
   - Índices críticos
   - Aplicar via Supabase MCP (`mcp__b66dc66d-...__apply_migration`)

b) **Backend billing** — integrar com Stripe:
   - `src/routes/api/billing/create-subscription/+server.js`: aceitar payload `{ addons: { mesas: true } }` e montar `line_items` com o add-on
   - Novo endpoint `src/routes/api/billing/toggle-addon/+server.js`: ativar/desativar add-on em assinatura existente via `subscription_items` no Stripe + flag no DB

c) **Gate de feature**:
   - `src/lib/guards.js`: nova função `hasMesasAddon(userId)` que consulta `subscriptions.has_mesas_addon`
   - Tipagem/JSDoc consistente com `isSubscriptionActiveStrict()`

d) **UI básica do add-on** em `/assinatura`:
   - Toggle "Módulo Mesas (+R$30/mês)"
   - Mostrar total atualizado (R$59 ou R$89)
   - Botão "Ativar/Desativar add-on" chama novo endpoint

**Sprint 2 (Telas core)** — escopo da próxima conversa:
- `/gestao/mesas` (CRUD de mesas)
- `/app/mesas` (mapa)
- `/app/mesas/[id]` (comanda)

**Sprint 3 (Fechamento)** — escopo da próxima conversa:
- Modal fechar mesa com divisão igual
- Conversão comanda → venda
- Pré-conta + recibo final

**Sprint 4 (Polish + lançamento)**:
- Testes
- Update copy `/precificacao`
- Beta com cliente solicitante

---

## Schema SQL definitivo (será aplicado no Sprint 1)

```sql
-- 1. Tabela de mesas
CREATE TABLE mesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero TEXT NOT NULL,
  capacidade INT,
  status TEXT NOT NULL DEFAULT 'livre' CHECK (status IN ('livre', 'ocupada', 'fechando')),
  ativa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(id_usuario, numero)
);

-- 2. Tabela de comandas
CREATE TABLE comandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_mesa UUID NOT NULL REFERENCES mesas(id),
  id_usuario UUID NOT NULL REFERENCES auth.users(id),
  num_pessoas INT DEFAULT 1,
  observacao TEXT,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  taxa_servico_pct NUMERIC(5,2) DEFAULT 0,
  couvert_valor NUMERIC(10,2) DEFAULT 0,
  desconto NUMERIC(10,2) DEFAULT 0,
  total_calculado NUMERIC(10,2) DEFAULT 0,
  aberta_em TIMESTAMPTZ DEFAULT NOW(),
  fechada_em TIMESTAMPTZ,
  id_venda UUID REFERENCES vendas(id)
);

-- 3. Itens da comanda
CREATE TABLE comanda_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_comanda UUID NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
  id_produto UUID NOT NULL REFERENCES produtos(id),
  quantidade NUMERIC(10,3) NOT NULL DEFAULT 1,
  preco_unitario NUMERIC(10,2) NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add-on flag
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS has_mesas_addon BOOLEAN DEFAULT false;

-- 5. Índices
CREATE INDEX idx_mesas_usuario_status ON mesas(id_usuario, status);
CREATE INDEX idx_comandas_mesa_status ON comandas(id_mesa, status);
CREATE INDEX idx_comandas_usuario_status ON comandas(id_usuario, status);
CREATE INDEX idx_comanda_itens_comanda ON comanda_itens(id_comanda);

-- 6. RLS
ALTER TABLE mesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY mesas_owner ON mesas FOR ALL USING (auth.uid() = id_usuario);

ALTER TABLE comandas ENABLE ROW LEVEL SECURITY;
CREATE POLICY comandas_owner ON comandas FOR ALL USING (auth.uid() = id_usuario);

ALTER TABLE comanda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY comanda_itens_owner ON comanda_itens FOR ALL
  USING (EXISTS (SELECT 1 FROM comandas WHERE comandas.id = comanda_itens.id_comanda AND comandas.id_usuario = auth.uid()));
```

---

## Arquivos a criar/modificar no Sprint 1

**Criar**:
- `docs/projects/PROJETO_MESAS.md` — gerenciamento de projeto
- `.ai/migrations/mesas_module.sql` — migração SQL
- `src/routes/api/billing/toggle-addon/+server.js` — endpoint de toggle do add-on

**Modificar**:
- `src/routes/api/billing/create-subscription/+server.js` — aceitar `addons` no payload
- `src/lib/guards.js` — adicionar `hasMesasAddon(userId)`
- `src/routes/assinatura/+page.svelte` — UI do toggle de add-on

---

## Permissões necessárias (pra ExitPlanMode)

Vou precisar:
- Aplicar migração SQL via Supabase MCP
- Criar arquivos novos (migration, endpoint, doc)
- Editar arquivos existentes (billing, guards.js, assinatura/+page.svelte, etc.)
- Rodar `npm run build` pra validar
- Commits no git pra registrar progresso (cada item significativo do checklist = 1 commit)

## Protocolo de handoff (importante — tokens podem acabar)

Após CADA item concluído do checklist:
1. Atualizar `docs/projects/PROJETO_MESAS.md` (status + changelog detalhado)
2. Commit com mensagem clara referenciando o item
3. Listar próximo item explicitamente no doc

Assim qualquer agente que assumir consegue:
- Ler `docs/projects/PROJETO_MESAS.md` → entender estado atual
- Olhar último commit → saber o que foi feito
- Pegar próxima tarefa do checklist → continuar

## Verificação do Sprint 1

Quando o sprint 1 estiver feito:

1. **DB**: Tabelas `mesas`, `comandas`, `comanda_itens` existem em produção. `subscriptions.has_mesas_addon` existe.
2. **RLS**: Policies aplicadas e testadas (user A não vê mesas do user B).
3. **Billing**: Toggle do add-on em `/assinatura` adiciona/remove o item de add-on na assinatura Stripe.
4. **Webhook**: Próximo `PAYMENT_RECEIVED` cobra R$89 (se add-on ativo) ou R$59 (sem add-on).
5. **Gate**: `hasMesasAddon(userId)` retorna `true`/`false` corretamente. Rotas futuras `/app/mesas` poderão usar o gate.
6. **Build**: `npm run build` passa sem erro.
7. **Tipos**: TypeScript types regenerados via `mcp__...__generate_typescript_types`.

Após Sprint 1 verificado, abrir nova conversa pro Sprint 2 (telas core).
