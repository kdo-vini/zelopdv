# Preflight da fase 2 — Pedidos + Cozinha (2026-07-28)

Este registro separa o que foi verificado antes do DDL do que ainda depende de uma decisao operacional. O DDL foi executado depois do preflight e as assercoes pos-migration passaram.

## Estado de deploy

- ZeloPDV fase 1: commit `8945f17` ancestral da versao de producao `e5e79c6383c487799aac13fc25a4b9f7d1801121`.
- ZeloMenu: PR #2 mergeado em `master`, merge commit `c204ed4`.
- ZeloChat: PR #21 mergeado em `main`, merge commit `a6cad04`.
- Soak observado depois dos merges: `/api/version` do ZeloChat respondeu a versao `a6cad04f9267` de forma estavel; a raiz do ZeloMenu respondeu HTTP 200 em tres verificacoes entre 20:27 e 20:29 BRT.
- A fase 2 do ZeloPDV foi mergeada em `5a6f45a3` e esta em producao depois da conclusao do DDL.

## Snapshot sanitizado somente leitura

Consulta feita no projeto Supabase linkado `xnnjyrblpvsqrtsshawa` (ZeloPDV, producao):

| Medida | Resultado |
| --- | ---: |
| `pedidos` | 3 linhas |
| `pedido_itens` | 5 linhas |
| Soma de `pedido_itens.subtotal` | R$ 65 |
| Vendas vinculadas (`id_venda`) | 0 |
| Pedido mais recente | 2026-07-11T21:57:58.994678+00:00 |

Nomes, observacoes, emails, telefones e documentos nao foram persistidos neste artefato. A decisao do dono do produto e nao preservar o historico financeiro legado de `billing_payments.has_pedidos_addon`; os demais registros de cobranca permanecem fora do escopo.

## Backup e reversibilidade

- Backup fisico mais recente listado pelo Supabase: id `1231217586`, concluido em `2026-07-28T09:23:38.182Z`.
- `walg_enabled`: `true`.
- `pitr_enabled`: `false`; nao ha janela de PITR disponivel para esta operacao.
- Nao existe branch Supabase disponivel para um smoke test isolado.
- A tentativa de `supabase db dump --linked --schema public` nao gerou dump porque o CLI exigiu Docker Desktop. Portanto, este arquivo nao afirma que exista um dump SQL completo.

## Dependencias verificadas antes do DDL

- As colunas legadas ainda existem em `subscriptions` e `billing_payments`.
- `user_entitlements` ainda existe, tem dependencia zero fora da propria view e ainda expoe a coluna legada.
- As funcoes `confirm_zelomenu_cart` e `delete_account` ainda sao os pontos que precisam ser substituidos na mesma transacao dos drops.
- Os ACLs atuais das funcoes protegidas foram preservados na migration com `CREATE OR REPLACE`; `proximo_numero_pedido` e o unico alvo com execucao anonima que sera removido.

## Resultado do DDL

- `pedidos`, `pedido_itens` e `proximo_numero_pedido` nao existem mais.
- `subscriptions.has_pedidos_addon` e `billing_payments.has_pedidos_addon` nao existem mais.
- `user_entitlements` permanece como view e nao expoe a coluna legada.
- O `CHECK` de `zelo_orders.source` aceita `mesa`.
- Os ACLs de `create_zelo_order`, `confirm_zelomenu_cart`, `delete_account`, `transition_zelo_order` e `close_zelo_order` continuam restritos aos mesmos papeis esperados.

## Smoke transacional pós-migration

- O primeiro smoke encontrou um defeito real: a restituição era guardada, mas `stock_released_at` ainda era marcado para itens de comanda.
- A migration corretiva `.ai/migrations/pedidos_cozinha_mesa_cancel_marker_2026_07_28.sql` foi aplicada em produção com `CREATE OR REPLACE` transacional.
- O smoke repetido passou 3/3: cancelamento de item de comanda sem restituição nem marcador, entrega de pedido mesa sem `sale_id` e rejeição de fechamento financeiro mesa.
- A transação terminou em `ROLLBACK`; a consulta posterior confirmou `smoke_orders = 0`.

## Gate restante

O preflight, DDL, deploy e smoke técnico estão concluídos. A rota QR pública também respondeu 200 sem escrita. Ainda falta `delete_account` com conta/tenant de teste descartável; nenhuma conta real deve ser usada para esse teste. A assinatura `d5625be9` continua pendente de decisão humana sobre qualquer ação comercial; nenhum estorno ou alteração foi feito.
