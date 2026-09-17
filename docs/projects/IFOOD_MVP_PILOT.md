# iFood MVP — piloto e decisão de rollout

**Data:** 2026-09-17  
**Branch de implementação:** `cursor/ifood-task-12-cdb9` (base `codex/ifood-mvp`)  
**Decisão atual:** **NO-GO** (aguardando autorização explícita do owner)

Este arquivo é o registro canônico da Task 21. Ele **não** autoriza migration
em produção, deploy do worker, shadow ativo contra merchants reais nem
self-service global.

## Pré-condições de código (Tasks 1–20)

| Item | Estado |
| --- | --- |
| Domínio, worker, filas Pedidos/Cozinha | Implementado no branch |
| Mapping, impressão, venda/estorno, canal, Zelinho | Implementado |
| Self-service APIs + wizard | Implementado (migrations **locais**) |
| Console ops admin + runbook | Implementado (`docs/operations/IFOOD.md`) |
| Gate `verify:ifood` + resilience + E2E mock | Verde na Task 20 |
| `docker build` da imagem worker | Pendente em ambiente com Docker CLI |
| Migrations `*_ifood_*.sql` no Supabase vinculado | **Não aplicadas** |

## Checklist de mutações (bloqueado sem GO)

Cada linha exige assinatura explícita do owner antes de executar:

| # | Ação | Autorizado? | Quem / quando | Evidência |
| --- | --- | --- | --- | --- |
| 1 | Aplicar forward migrations iFood no projeto vinculado | **Não** | — | — |
| 2 | Deploy worker (imagem por digest) + envs por **nome** | **Não** | — | — |
| 3 | Shadow mode (comandos/presença off) | **Não** | — | — |
| 4 | Ativar 1 loja piloto sem pedidos em andamento | **Não** | — | — |
| 5 | Soak + reconciliação financeira | **Não** | — | — |
| 6 | Liberar self-service gradual | **Não** | — | — |

## Template — shadow (preencher quando autorizado)

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
DECISÃO: NO-GO
DATA: 2026-09-17
MOTIVO: código e gates de laboratório prontos (Tasks 1–20); nenhuma mutação
        de produção, shadow ou loja piloto foi autorizada nesta sessão.
PRÓXIMO PASSO: owner autoriza explicitamente o item #1 da tabela de mutações
               (migrations) e o deploy do worker; então preencher shadow/piloto
               e trocar esta decisão para GO somente com sign-off.
SIGN-OFF OWNER: (pendente)
```

## Rollback (quando houver deploy)

1. Feature flag / pause por merchant no console `/ifood`
2. Revoke se necessário; titular reconecta via wizard
3. Contingência Portal do Parceiro (runbook)
4. Imagem anterior por digest; migrations **nunca** editadas após aplicadas

## Referências

- Runbook: `docs/operations/IFOOD.md`
- Plano: `docs/superpowers/plans/2026-09-15-ifood-mvp.md`
- Design: `docs/superpowers/specs/2026-09-15-ifood-mvp-design.md`
- Estado vivo: `docs/CURRENT.md`
