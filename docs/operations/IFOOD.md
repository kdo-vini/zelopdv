# Operações iFood (MVP)

Runbook interno do console de operações em `admin-dashboard` (`/ifood`) e do
worker. Complementa o design em
`docs/superpowers/specs/2026-09-15-ifood-mvp-design.md` e o plano em
`docs/superpowers/plans/2026-09-15-ifood-mvp.md`.

**Escopo deste documento:** diagnóstico, contingência, kill switches, replay
seguro, rotação de segredo e retenção. Não autoriza deploy, migration em
produção nem abertura global — isso é gate da Task 21.

## Superfície operacional

| Peça | Onde | Notas |
| --- | --- | --- |
| Painel | `admin-dashboard` → **iFood Ops** (`/ifood`) | Só super-admin ativo |
| Listagem / replayáveis | `GET /api/ifood/connections` (+ `?connectionId=`) | Bearer do admin; service-role no server |
| Ações | `POST /api/ifood/actions` | `pause` / `resume` / `revoke` / `replay_event` / `replay_command` |
| RPCs | `public.admin_*_ifood_*_v1` | `service_role` only; migration local `20260917040026_ifood_admin_operations.sql` |
| Auditoria | `admin_activity_logs` | `ifood.connection.*`, `ifood.event.replay`, `ifood.command.replay` |
| Worker | Dokploy `ifood-worker` (`ifood-worker-ellizg` / `nARDI-HdMP6OO0HyBhxuE`) | Host e health abaixo. Imagem deve incluir `src/lib/finance/paymentMethods.js` (grafo de `orderNormalizer`); sem isso o container sai com `MODULE_NOT_FOUND` no boot. |

O browser **nunca** recebe payload bruto de webhook, telefone, endereço ou
corpo de pedido — só contagens, status, timestamps e códigos de erro truncados
(≤80 chars).

## Worker (Dokploy)

Host (2026-09-17): `ifood-worker-ellizg-90c105-2-24-66-12.sslip.io`
(Let's Encrypt ligado; TLS pode ainda estar assentando). Conferir over HTTP
se HTTPS ainda não assentar.

| Checagem | Caminho | Evidência 2026-09-17 |
| --- | --- | --- |
| Liveness | `GET /health/live` | 200 `{"status":"ok","reason":"serving"}` — container Docker-healthy |
| Readiness (pré-probe) | `GET /health/ready` | 503 `{"status":"not_ready","reason":"dependencies_unavailable"}` |
| Readiness (pós-redeploy `b576c9a`) | `GET /health/ready` | 200 `{"status":"ready","reason":"fresh_probe"}` no instante do probe |
| Readiness (bug TTL, pré-fix) | `GET /health/ready` | 503 `{"status":"not_ready","reason":"stale_probe"}` ~90s após o probe, até o próximo ciclo de 5 min |

Ready 200 prova o probe PostgREST `claim_ifood_events_v1`
(`INVALID_CLAIM_ARGUMENTS`, sem claim de inbox) com `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`. **Não** fica 200 o tempo todo só porque o
processo está no ar: o TTL é `IFOOD_WORKER_READY_MAX_AGE_MS` (default
**600_000**, estritamente maior que o intervalo default **300_000**). Com
essas defaults, idle com banco/lease saudáveis não deve cair em
`stale_probe`. `readyMaxAgeMs <= intervalMs` é auto-ajustado no boot.
O bootstrap **pode** ligar ciclos reais só com flags explícitas (default
**off**): `IFOOD_WORKER_PROCESS_INBOX`, `IFOOD_WORKER_PROCESS_COMMANDS`,
`IFOOD_WORKER_ENABLE_HTTP_ADAPTER`. Adapter HTTP exige o par
`IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET`; sem o par o adapter fica null
(fail-closed). **Cutover 2026-09-18 (homolog 60/60):** Dokploy e Vercel
usam o par do app centralizado **Zelopdv** (`cbfb1f1f-…`); flags de ciclo
`IFOOD_WORKER_PROCESS_INBOX` / `PROCESS_COMMANDS` /
`ENABLE_HTTP_ADAPTER` estão **on** (`1`); intervalo de poll `60000`.
Live+ready 200 após o redeploy. Merchants ainda precisam autorizar o app
oficial (tokens do app de teste não servem).

## Piloto / rollout (Task 21)

Registro canônico: `docs/projects/IFOOD_MVP_PILOT.md`.

**Decisão vigente: GO parcial (schema + worker live+ready)** — owner
autorizou apply em 2026-09-17; migrations iFood forward aplicadas em
`xnnjyrblpvsqrtsshawa`; worker Dokploy live **e** ready 200 (`fresh_probe`)
enquanto o probe for mais novo que o TTL (default 600s). **Não é GO
completo.** Flags de ciclo default **off** (`IFOOD_WORKER_PROCESS_INBOX`,
`IFOOD_WORKER_PROCESS_COMMANDS`, `IFOOD_WORKER_ENABLE_HTTP_ADAPTER`);
`IFOOD_CLIENT_ID` / `IFOOD_CLIENT_SECRET` ausentes; sem merchant sandbox;
shadow, loja piloto e soak ainda pendentes.

Antes do GO completo:

1. Ligar flags de ciclo no worker + `IFOOD_CLIENT_ID` / `SECRET` + merchant/sandbox
2. Shadow (comandos/presença off) → loja piloto
3. Testar kill switch pause/resume no console `/ifood`
4. Confirmar som de chegada em `/app/pedidos` (dois tons em iFood
   `pending_review` novo), `printOwner` único e contingência Portal
5. Shadow → soak → sign-off GO pleno

## Gate automatizado (Task 20)

```bash
npm test
npm run check
npm run verify:migrations
npm run verify:ifood
npx playwright test tests/e2e/ifood-mvp.spec.js --project=ifood-mvp
docker build -f workers/ifood/Dockerfile -t zelopdv-ifood-worker:candidate .
```

- `verify:ifood` sobe o worker com adapter/repositório **in-memory**, espera
  `/health/ready`, projeta o fixture `placed` e confirma um comando via mock —
  sem iFood real e sem Supabase vinculado.
- E2E em `tests/e2e/ifood-mvp.spec.js` (projeto Playwright `ifood-mvp`) cobre
  wizard, intents operacionais, venda/canal/Zelinho sem PII.
- Fault injection: `tests/ifood.resilience.test.js`.
- `docker build` do worker é parte do gate; se Docker não existir no ambiente,
  registrar o skip como dependência de infraestrutura — nunca skip de
  idempotência, tenant, venda ou fail-closed.

## Diagnóstico rápido

1. Abrir `/ifood` e conferir a linha do merchant: `status`, fila, DLQ,
   comandos, unmapped, lag de webhook e heartbeat do worker.
2. Worker: `GET /health/live` 200 só prova processo no ar.
   `GET /health/ready` 200 exige probe fresco com banco + função de lease
   (`claim_ifood_events_v1` via argumentos inválidos, sem claim real).
   503 `dependencies_unavailable` = credenciais ausentes, PostgREST/DB
   inacessível, RPC de lease ausente, ou timeout/auth no probe.
   503 `stale_probe` = último probe saudável passou de `readyMaxAgeMs`
   (ciclo travado, ou TTL era ≤ intervalo — o boot auto-bumpeia esse par).
3. Se `status=degraded` ou heartbeat parado: checar worker (processo/container),
   renovação de token (`lastTokenAt`) e último poll (`lastPollAt`).
4. Selecionar a conexão e listar itens reprocessáveis (eventos/comandos em
   estado retryable / dead-letter elegível).
5. Confirmar no Gestor/Portal do Parceiro se o pedido ainda existe e em qual
   estado — o ZeloPDV é a UI operacional; o Portal é contingência.

Sinais úteis (sem PII):

- `queuedEvents` / `deadLetterEvents` — inbox atrasada ou esgotada
- `queuedCommands` / `failedCommands` — envio ao iFood travado
- `unmappedProducts` — mapping progressivo pendente (não bloqueia o painel)
- `printOwner` — exatamente um responsável (`zelo` ou externo)
- `lastWebhookAt` / `lastPollAt` / `lastTokenAt` / `workerHeartbeatAt`

## Contingência no Portal do Parceiro

Quando a conexão perde saúde ou o worker está fora:

1. Pedidos **já recebidos** continuam visíveis no ZeloPDV.
2. Novas ações que exijam comando ao iFood ficam bloqueadas ou falham de forma
   controlada (fail-closed).
3. Oriente o titular a operar no **Portal / Gestor de Pedidos** até a
   recuperação (autorização válida + worker saudável + configuração completa).
4. Não invente pedido, venda ou estorno manual no banco para “corrigir” o
   atraso — use replay da mesma identidade ou pause.

## Kill switches (separados de propósito)

| Ação | Efeito | Quando usar |
| --- | --- | --- |
| `pause` | `status=paused` na conexão endereçada | Contingência temporária; fila/poll param de avançar operação ativa |
| `resume` | `status=active` | Só depois de saúde/token/config OK |
| `revoke` | `status=revoked` | Corte duro até nova conexão self-service |

Pause ≠ revoke. Pause é incidente/contingência; revoke exige reconexão pelo
wizard do titular. O admin age pelo `connectionId` da linha — nunca por
“qualquer conexão desta empresa”.

Há também gates de produto (feature flag / entitlement / worker) fora deste
painel; rollback por flag continua sendo o caminho de feature, não de merchant.

## Replay seguro (mesma identidade)

- `replay_event` recebe **somente** `inboxId`. O server rejeita `payload` ou
  `eventId` inventados pelo browser (`422 invalid_payload`).
- A RPC zera lease, reagenda a **mesma** linha da inbox (`status=queued`) e
  devolve `requeued` ou `not_replayable` (`409`).
- `replay_command` idem para a linha de comando — sem payload arbitrário.
- Replay **não** cria outro evento, outra venda, outro estorno nem outra
  impressão: a idempotência de domínio (event id / command id / sale ref)
  continua valendo.

Antes de replay em massa: pause a conexão se a fila estiver bombando e o
worker estiver doente; senão o replay só alimenta o mesmo gargalo.

## Token revogado / 401

1. Confirmar `lastTokenAt` e erros truncados no painel / logs do worker
   (sem logar Authorization).
2. Pause o merchant afetado.
3. Titular reconecta pelo wizard (Perfil > Integrações) ou, se a sessão de
   autorização expirou, reinicia o fluxo self-service.
4. Resume só após health OK.

## Segredo de webhook / HMAC

1. Rotacionar o segredo no provedor e nas envs do worker/app **por nome**
   (nunca colar valor em ticket/chat).
2. Durante a troca, esperar 429/5xx transitórios; não duplicar filas.
3. Validar HMAC com bytes exatos e comparação em tempo constante (já no
   adapter); falha de assinatura não enfileira payload.

## Fila acumulada, `429`, `5xx`, timeout

- **Fila acumulada:** checar heartbeat e DLQ; se worker vivo, deixar drenar;
  se morto, pause → recuperar infra → resume → replay pontual dos
  dead-letters elegíveis.
- **`429`:** respeitar backoff do worker; não martelar replay.
- **`5xx` / timeout:** retry automático; se virar DLQ, diagnosticar no Portal
  antes do replay.
- **Ordem invertida / duplicata:** o processador é idempotente por identidade
  externa — não “consertar” apagando linhas à mão.

## Presença incorreta

Se a loja aparece aberta/fechada errado no iFood:

1. Confirmar health e `status` da conexão.
2. Worker deve retirar presença **somente daquele merchant** em fail-closed.
3. Se divergência persistir: pause + orientar Portal + abrir incidente interno
   com `connectionId` / `merchantId` (sem PII de cliente).

## Impressão

Exatamente um `printOwner` por conexão. Divergência Zelo × externo = risco de
cupom duplicado. Ajuste via self-service do titular (`print_owner`); o painel
admin só observa.

## Retenção / purge de payload

Payload bruto da inbox tem retenção curta (política operacional: manter só o
necessário para replay/debug, depois purge agendado no worker/job — sem
exposição PostgREST). Acesso administrativo a métricas já é auditado; acesso a
payload bruto, se existir no futuro, deve ser auditado e excepcional. Comprador
iFood **não** vira Pessoa no MVP.

## Rollback por feature flag

Desligar a integração no nível de app/worker (flag / env) é o rollback de
feature. Pause/revoke por merchant é o rollback de loja. Os dois não se
substituem.

## Checklist de plantão

- [ ] Super-admin consegue abrir `/ifood` e ver métricas sem PII
- [ ] Pause → confirmação no painel → Resume funciona
- [ ] Replay de um inbox/command id conhecido requeueia a mesma linha
- [ ] Contingência Portal documentada para o titular
- [ ] Envs do worker presentes por nome; segredos fora do chat
- [ ] Migration `*_ifood_admin_operations.sql` aplicada **só** com autorização
      explícita (Task 21)

## O que este runbook não faz

- Não aplica migration em produção.
- Não libera self-service global.
- Não altera pedidos históricos nem cria venda/estorno manual.
