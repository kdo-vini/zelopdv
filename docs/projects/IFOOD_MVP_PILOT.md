# iFood MVP — piloto e decisão de rollout

**Data:** 2026-09-17  
**Branch de implementação:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`)  
**Projeto Supabase:** `xnnjyrblpvsqrtsshawa` (ZeloPDV)  
**Decisão atual:** **GO parcial (schema + worker live+ready + poll→inbox)** — migrations aplicadas (incluindo `20260917050000_ifood_worker_polling`); worker Dokploy com `/health/live` 200 e `/health/ready` 200 enquanto o probe for fresco (TTL default 600s > intervalo 300s); reconciler poll→inbox ligado atrás de `IFOOD_WORKER_ENABLE_HTTP_ADAPTER`. **Não é GO completo** (defaults de código ainda fail-closed; loja piloto/soak/`PROCESS_COMMANDS` pendentes).

## Flags de shadow (não ligar o trio)

As três flags são independentes e default **off**. Shadow de ingestão:

| Env | Valor |
| --- | --- |
| `IFOOD_WORKER_ENABLE_HTTP_ADAPTER` | `1` |
| `IFOOD_WORKER_PROCESS_INBOX` | `1` |
| `IFOOD_WORKER_PROCESS_COMMANDS` | `0` |

`ENABLE_HTTP_ADAPTER=1` exige `IFOOD_CLIENT_ID` + `IFOOD_CLIENT_SECRET`; sem o
par o adapter fica `null` e não há poll/ACK. `PROCESS_INBOX=1` sozinha só
drena `event_inbox` — não polla o iFood. `PROCESS_COMMANDS` fica **off** no
shadow (confirm/cancel/presença não saem). Ordem do ciclo:
`probe → reconcile → processInbox → processCommands`.

## Pré-condições de código (Tasks 1–20)

| Item | Estado |
| --- | --- |
| Domínio, worker, filas Pedidos/Cozinha | Implementado no branch |
| Mapping, impressão, venda/estorno, canal, Zelinho | Implementado |
| Self-service APIs + wizard | Implementado |
| Console ops admin + runbook | Implementado (`docs/operations/IFOOD.md`) |
| Gate `verify:ifood` + resilience + E2E mock | Verde na Task 20 |
| `docker build` da imagem worker | **OK** no Dokploy (2026-09-17); boot exigia `src/lib/finance/paymentMethods.js` no image (fix 2026-09-17, `MODULE_NOT_FOUND` no container) |
| Migrations iFood no Supabase vinculado | **Aplicadas** (2026-09-17, após autorização do owner) |
| Processo worker no Dokploy | **Live+ready (GO parcial)** — liveness 200; readiness 200 `fresh_probe` só enquanto o probe for mais novo que `readyMaxAgeMs` (default 600s, intervalo 300s). 503 `stale_probe` com defaults antigos (90s) era bug de TTL, não queda de deps |

## Checklist de mutações

| # | Ação | Autorizado? | Quem / quando | Evidência |
| --- | --- | --- | --- | --- |
| 1 | Aplicar forward migrations iFood no projeto vinculado | **Sim** | Owner 2026-09-17 (“Autorizo”) | Ver tabela abaixo |
| 2 | Deploy worker (imagem por digest) + envs por **nome** | **Sim** | Owner 2026-09-17 (intenção) + evidência Dokploy 2026-09-17 | Ver seção Deploy Dokploy abaixo. Envs presentes **só por nome**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `IFOOD_WORKER_HOST`, `NODE_ENV`. Opcionais `IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET` **não** definidas. Sem valores neste doc. |
| 3 | Shadow mode (comandos/presença off) | Parcial | 2026-09-17 | **Ingestão via polling medida.** Código: reconciler atrás de `ENABLE_HTTP_ADAPTER` (`b075032` / PR #37); ciclo `reconcile` antes de `processInbox` (`efb6df3` / PR #41). Em prod (~17:54Z): 6 eventos / 2 Pedidos de teste em `event_inbox` (todos `processed`, `last_webhook_at` null). `order_commands`: 0. Comparação formal vs Gestor e soak ainda pendentes. Receita: `ENABLE_HTTP_ADAPTER=1`, `PROCESS_INBOX=1`, `PROCESS_COMMANDS=0`. |
| 4 | Ativar 1 loja piloto sem pedidos em andamento | Pendente | — | **Não feito.** Falta merchant/sandbox + loja piloto |
| 5 | Soak + reconciliação financeira | Pendente | — | **Não feito** |
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

## Deploy Dokploy (item #2) — evidência 2026-09-17

| Campo | Valor (sem segredos) |
| --- | --- |
| Projeto Dokploy | ZeloPDV |
| App | `ifood-worker` (`appName` `ifood-worker-ellizg`, id `nARDI-HdMP6OO0HyBhxuE`) |
| Git | `kdo-vini/zelopdv`, branch `cursor/ifood-task-12-cdb9` |
| Dockerfile | `workers/ifood/Dockerfile`, context `.` |
| Host | `ifood-worker-ellizg-90c105-2-24-66-12.sslip.io` |
| TLS | Let's Encrypt habilitado; TLS pode ainda estar assentando |
| Health | `GET /health/live`, `GET /health/ready` |
| Supabase | `xnnjyrblpvsqrtsshawa` |

**Build / container:** Docker build OK. Container running **Docker-healthy** (`HEALTHCHECK GET /health/live`).

**Verificado over HTTP (não HTTPS):**

- `GET /health/live` → **200** `{"status":"ok","reason":"serving"}` (processo no ar, 2026-09-17)
- `GET /health/ready` → **503** `{"status":"not_ready","reason":"dependencies_unavailable"}` **antes** do probe de produção
- Após redeploy do commit de probe (`b576c9a`): `GET /health/ready` → **200** `{"status":"ready","reason":"fresh_probe"}` no instante do probe. Com o TTL antigo (90s) vs intervalo (5 min) o ready voltava a **503 `stale_probe`** até o próximo ciclo — corrigido para `readyMaxAgeMs` default 600s, sempre `> intervalMs`.

**Causa do ready 503 (evidência pré-probe):** `workers/ifood/index.js`
bootstrapava `createUnreadyWorkerDependencies()`. O branch liga
`workers/ifood/supabaseRepository.js` em `main()` quando as envs Supabase
existem. O ready 200 pós-redeploy prova o caminho PostgREST
`claim_ifood_events_v1` (`INVALID_CLAIM_ARGUMENTS`, sem claim de inbox).
**Não** prova ciclos reais de pedido, webhook, comando ou presença: as flags
`IFOOD_WORKER_PROCESS_INBOX` / `PROCESS_COMMANDS` / `ENABLE_HTTP_ADAPTER`
existem no código e ficam **off** por default. Shadow de ingestão usa
adapter+inbox on e **commands off**. Sem GO completo.

## Template — shadow (preencher quando ciclos reais estiverem ligados)

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
DECISÃO: GO PARCIAL (SCHEMA + WORKER LIVE+READY + POLL→INBOX)
DATA: 2026-09-17 (docs de shadow 2026-09-23)
SIGN-OFF OWNER: schema apply autorizado verbalmente (“Autorizo”); deploy Dokploy evidenciado
NÃO É GO COMPLETO.

FEITO:
  1. apply das migrations forward iFood no projeto xnnjyrblpvsqrtsshawa
     (incluindo 20260917050000_ifood_worker_polling)
  2. docker build OK no Dokploy; container Docker-healthy (HEALTHCHECK /health/live)
  3. processo worker live; GET /health/live → 200 serving
  4. redeploy do probe de produção; GET /health/ready → 200 fresh_probe
     no instante do probe (PostgREST claim_ifood_events_v1 /
     INVALID_CLAIM_ARGUMENTS, sem claim). TTL default agora 600s (> intervalo
     300s) para não oscilar em stale_probe ocioso.
  5. reconciler poll→inbox atrás de ENABLE_HTTP_ADAPTER; Pedido de teste
     medido em event_inbox via polling (commands off)

PENDENTE PARA GO COMPLETO:
  1. manter shadow com ENABLE_HTTP_ADAPTER=1 + PROCESS_INBOX=1 +
     PROCESS_COMMANDS=0 + IFOOD_CLIENT_ID/SECRET (não ligar o trio)
  2. comparação formal vs Gestor + merchant/sandbox de piloto
  3. Shadow → loja piloto → soak → sign-off GO pleno
  4. Só então liberar self-service gradual / PROCESS_COMMANDS=1

BLOQUEADO AGORA: loja piloto, soak e comandos. Poll→inbox de Pedido de
teste já foi medido. Ready=200 sozinho não é GO completo.
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
