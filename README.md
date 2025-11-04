# Zelo PDV — Sangria de Caixa

Este projeto é um PDV em SvelteKit com Supabase e Stripe. Abaixo, detalhes da funcionalidade de Sangria (retirada de dinheiro do caixa).

## Movimentar Caixa (Entrada/Saída)

- Acesse a tela do PDV em `/app`.
- No rodapé da Comanda, use o botão "Movimentar Caixa".
- No modal, escolha o tipo da movimentação: "Entrada" (suprimento) ou "Saída" (sangria).
- Informe o valor (R$), um motivo/observação opcional e, se desejar, marque para imprimir o recibo.
- Requer um caixa aberto; a movimentação é registrada no banco e, opcionalmente, imprime um recibo simples.
- O sistema impede saídas maiores do que o saldo disponível em caixa.

### Estrutura no banco (Supabase)

Foi adicionada a tabela `public.caixa_movimentacoes` para registrar sangrias e suprimentos:

```
create table if not exists public.caixa_movimentacoes (
  id bigint generated always as identity primary key,
  id_caixa bigint not null references public.caixas(id) on delete cascade,
  id_usuario uuid not null,
  tipo text not null check (tipo in ('sangria','suprimento')),
  valor numeric not null check (valor >= 0),
  motivo text,
  created_at timestamptz not null default now()
);
```

Políticas RLS permitem apenas o usuário autenticado visualizar e inserir suas próprias movimentações.

Arquivo SQL: `supabase/caixa_movs_schema.sql`.

### Como aplicar o schema

- Abra o Supabase SQL Editor e execute o conteúdo de `supabase/caixa_movs_schema.sql`.
- Alternativamente, use a CLI/SDK da sua preferência para rodar o script.

### Observações

- A tela do PDV mostra o saldo atual em caixa (dinheiro) logo abaixo do cabeçalho. Esse saldo considera: valor inicial + vendas em dinheiro - sangrias + suprimentos.
- O recibo da movimentação inclui: nome/identificação do estabelecimento, número do caixa e da movimentação, data/hora, motivo (se informado) e valor (retirado ou adicionado, conforme o tipo).

## Desenvolvimento

- Dev: `npm run dev`
- Testes: `npm test` (Vitest)

