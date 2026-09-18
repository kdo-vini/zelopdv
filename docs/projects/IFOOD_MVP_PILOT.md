# iFood MVP — piloto e decisão de rollout

**Data:** 2026-09-17  
**Branch de implementação:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`)  
**Projeto Supabase:** `xnnjyrblpvsqrtsshawa` (ZeloPDV)  
**Decisão atual:** **GO operacional pós-homolog (2026-09-18)** — Order/Events homologados 60/60 no app `zelopdv`; worker Dokploy + Vercel com `IFOOD_CLIENT_*` do Zelopdv (prefix `cbfb1f1f`); flags de ciclo on; live+ready 200. **Ainda falta** reautorizar merchant(s) no app oficial e soak com loja real (tokens do app de teste não transferem).

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
| 3 | Shadow mode (comandos/presença off) | Pendente | — | **Não feito.** Código do worker agora aceita flags `IFOOD_WORKER_PROCESS_INBOX` / `PROCESS_COMMANDS` / `ENABLE_HTTP_ADAPTER` (default off). Falta ligar flags + merchant/sandbox. Bloqueios: `IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET` **não** definidas; nenhum merchant sandbox atribuído. |
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
existem no código e ficam **off** por default. Sem GO completo.

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
DECISÃO: GO PARCIAL (SCHEMA + WORKER LIVE+READY)
DATA: 2026-09-17
SIGN-OFF OWNER: schema apply autorizado verbalmente (“Autorizo”); deploy Dokploy evidenciado
NÃO É GO COMPLETO.

FEITO:
  1. apply das migrations forward iFood no projeto xnnjyrblpvsqrtsshawa
  2. docker build OK no Dokploy; container Docker-healthy (HEALTHCHECK /health/live)
  3. processo worker live; GET /health/live → 200 serving
  4. redeploy do probe de produção; GET /health/ready → 200 fresh_probe
     no instante do probe (PostgREST claim_ifood_events_v1 /
     INVALID_CLAIM_ARGUMENTS, sem claim). TTL default agora 600s (> intervalo
     300s) para não oscilar em stale_probe ocioso.

PENDENTE PARA GO COMPLETO:
  1. ligar flags IFOOD_WORKER_PROCESS_INBOX / PROCESS_COMMANDS /
     ENABLE_HTTP_ADAPTER (default off) + IFOOD_CLIENT_ID/SECRET
  2. merchant/sandbox atribuído
  3. Shadow → loja piloto → soak → sign-off GO pleno
  4. Só então liberar self-service gradual

BLOQUEADO AGORA: flags de ciclo off no Dokploy; IFOOD_CLIENT_ID/SECRET
não definidas; sem merchant sandbox; shadow/piloto/soak não feitos.
Ready=200 não é ciclo operacional.
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
