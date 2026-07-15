# Fiado auditável — implantação

## Objetivo

Transformar o fichário em uma fonte financeira verificável: cada compra, pagamento e estorno passa a compor um extrato por pessoa. Um pagamento acima da dívida não é perdido: ele fica como crédito disponível para a próxima compra.

## Decisões de produto

- `pessoas.saldo_fiado` continua sendo o saldo materializado: positivo é valor em aberto; negativo é crédito do cliente.
- `fiado_lancamentos` é o razão imutável. Valores positivos aumentam a dívida e negativos representam pagamento ou estorno.
- Não há edição destrutiva de eventos financeiros. Ao apagar uma venda fiado, o sistema cria um lançamento compensatório.
- O histórico anterior não pode ser reconstituído com precisão porque os pagamentos antigos não tinham evento próprio. A migração cria um único `saldo_inicial` por pessoa com saldo diferente de zero.

## Entrega no código

- Migration: `.ai/migrations/fiado_ledger_2026_07_15.sql` cria razão, RLS, índices, backfill, triggers de débito por venda e RPCs atômicas de recebimento/estorno.
- Fichário: busca por nome, situação textual, valor projetado após o pagamento e extrato cronológico; celular usa lista tocável, sem ações dependentes de hover. `Adicionar ao caixa atual` e `Imprimir recibo` começam desmarcados para que essas ações auxiliares só ocorram por escolha explícita do operador.
- Pessoas: a lista mostra `Em aberto`, `Crédito disponível` ou `Sem saldo` junto ao valor.
- Fechamento de caixa: detalha pessoa, venda e valor de cada lançamento fiado, inclusive a parcela fiado de venda múltipla.
- A RPC de recebimento exige `fiado.receber` para subusuários e cria o suprimento de caixa junto ao pagamento, evitando sucesso parcial.

## Rollout obrigatório

1. Com credencial Supabase com acesso à Management API, conferir tipos de `vendas.id`, `caixas.id` e a definição efetiva de `criar_venda_completa(jsonb)`; a consulta desta sessão recebeu 403.
2. Aplicar a migration em staging e validar saldo materializado contra `sum(fiado_lancamentos.valor)` por pessoa, considerando o `saldo_inicial`.
3. Testar venda fiado simples, venda múltipla com parcela fiado, pagamento parcial, pagamento excedente, pagamento sem caixa, estorno e subusuário sem `fiado.receber`.
4. Aplicar em produção em janela monitorada; acompanhar por sete dias diferenças entre saldo e razão, erros da RPC e crédito gerado.

## Aceite

- O operador vê quanto falta pagar antes e depois de um pagamento parcial.
- Excedente aparece como crédito disponível e é abatido por compras futuras via saldo negativo.
- O resumo do caixa informa o nome do responsável por cada fiado.
- Em 360–393px, todas as pessoas podem ser pesquisadas, abertas e pagas com alvo de toque mínimo de 44px.
