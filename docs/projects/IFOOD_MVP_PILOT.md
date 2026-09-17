# iFood MVP — piloto e decisão de rollout

**Data:** 2026-09-17  
**Branch de implementação:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`)  
**Projeto Supabase:** `xnnjyrblpvsqrtsshawa` (ZeloPDV)  
**Decisão atual:** **GO parcial (schema)** — migrations aplicadas; worker/shadow/piloto operacional ainda pendentes

## Pré-condições de código (Tasks 1–20)

| Item | Estado |
| --- | --- |
| Domínio, worker, filas Pedidos/Cozinha | Implementado no branch |
| Mapping, impressão, venda/estorno, canal, Zelinho | Implementado |
| Self-service APIs + wizard | Implementado |
| Console ops admin + runbook | Implementado (`docs/operations/IFOOD.md`) |
| Gate `verify:ifood` + resilience + E2E mock | Verde na Task 20 |
| `docker build` da imagem worker | Pendente (CLI Docker ausente neste ambiente) |
| Migrations iFood no Supabase vinculado | **Aplicadas** (2026-09-17, após autorização do owner) |

## Checklist de mutações

| # | Ação | Autorizado? | Quem / quando | Evidência |
| --- | --- | --- | --- | --- |
| 1 | Aplicar forward migrations iFood no projeto vinculado | **Sim** | Owner 2026-09-17 (“Autorizo”) | Ver tabela abaixo |
| 2 | Deploy worker (imagem por digest) + envs por **nome** | **Sim (intenção)** | Owner 2026-09-17 | **Bloqueado neste ambiente:** sem `docker` CLI e sem alvo de hosting do worker documentado/acessível. Envs necessárias por nome: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, opcional `IFOOD_CLIENT_ID`+`IFOOD_CLIENT_SECRET`, `IFOOD_WORKER_PORT`/`PORT`, `IFOOD_WORKER_INTERVAL_MS`, `IFOOD_WORKER_READY_MAX_AGE_MS` |
| 3 | Shadow mode (comandos/presença off) | Pendente | — | Exige worker + merchant sandbox |
| 4 | Ativar 1 loja piloto sem pedidos em andamento | Pendente | — | — |
| 5 | Soak + reconciliação financeira | Pendente | — | — |
| 6 | Liberar self-service gradual | Pendente | — | Somente após GO completo |

## Migrations aplicadas (item #1)

Já estavam no remoto (Tasks 1–11): `ifood_mvp_foundation`, `ifood_webhook_enqueue`, `ifood_canonical_order_projection`, `ifood_order_commands`, `ifood_order_sync_state`, `ifood_projection_display_fields`.

Aplicadas nesta autorização (conteúdo das migrations locais Tasks 12–19; versões remotas geradas pelo MCP `apply_migration`):

| Versão remota | Nome |
| --- | --- |
| `20260917105056` | `ifood_product_mapping_stock` (+ commits/release split) |
| `20260917105319` | `ifood_product_mapping_stock_commit` |
| `20260917105341` | `ifood_product_mapping_stock_release` |
| `20260917105434`–`20260917105607` | `ifood_sales_and_reversals` (+ materialize/reverse/ensure) |
| `20260917105632` | `ifood_self_service_connection` |
| `20260917105712` | `ifood_admin_operations` |
| `20260917105724` | `ifood_connection_print_owner` |

**Verificação pós-apply:** 27 funções `public.*ifood*`, coluna `vendas.canal_origem`, `admin_ifood_connections_overview_v1()` presente.

Fonte local canônica do SQL continua em `supabase/migrations/20260917014734_*.sql` … `20260917040500_*.sql` (não editar após apply).

## Template — shadow (preencher quando worker estiver no ar)

- Amostra: _N pedidos / período_
- Comparar vs Gestor: modalidade, horário, itens, complementos, total,
  pagamento, agendamento, cancelamento, conclusão
- Comandos e presença: **desligados**
- Divergências: _

## Template — loja piloto (preencher quando autorizado)

- Empresa / merchant: _
- Som genérico disponível: sim/não
- `printOwner` único: zelo | external
- Kill switch pause/resume testado: sim/não
- Contingência Portal documentada ao titular: sim/não
- Suporte de plantão: _

## Template — soak / métricas

| Meta | Medido | OK? |
| --- | --- | --- |
| p95 webhook ≤ 10s | — | — |
| Comando registrado ≤ 2s | — | — |
| Alertas 4/6 min, SLA 8 min | — | — |
| Duplicatas | — | — |
| Venda / estorno / estoque | — | — |
| Relatório ≡ Zelinho (canal) | — | — |

Qualquer divergência financeira ou perda de pedido → **NO-GO**.

## Decisão

```
DECISÃO: GO PARCIAL (SCHEMA ONLY)
DATA: 2026-09-17
SIGN-OFF OWNER: autorizado verbalmente nesta sessão (“Autorizo”)
FEITO: apply das migrations forward iFood no projeto xnnjyrblpvsqrtsshawa
PENDENTE PARA GO COMPLETO:
  1. docker build -f workers/ifood/Dockerfile -t zelopdv-ifood-worker:candidate .
  2. Deploy do worker com digest + envs por nome (sem logar valores)
  3. Shadow → loja piloto → soak → sign-off GO pleno
  4. Só então liberar self-service gradual
```

## Rollback

1. Feature flag / pause por merchant no console `/ifood`
2. Revoke se necessário; titular reconecta via wizard
3. Contingência Portal do Parceiro (runbook)
4. Imagem anterior por digest; migrations **nunca** editadas após aplicadas

## Referências

- Runbook: `docs/operations/IFOOD.md`
- Plano: `docs/superpowers/plans/2026-09-15-ifood-mvp.md`
- Design: `docs/superpowers/specs/2026-09-15-ifood-mvp-design.md`
- Estado vivo: `docs/CURRENT.md`
