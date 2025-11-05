# Zelo PDV — PDV com Supabase e Stripe

Este projeto é um PDV em SvelteKit com Supabase e Stripe.

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

## Autenticação

O app usa Supabase Auth (e-mail/senha). Com confirmação de e-mail habilitada, o usuário deve confirmar antes de entrar.

### Cadastro (validações)
- E-mail único: o Supabase já impede e-mails duplicados; a UI mostra mensagem amigável quando detecta e-mail existente.
- Senha mínima: a tela de cadastro exige pelo menos 8 caracteres.

### Confirmação de e-mail e redirecionamento
- Durante o sign up enviamos `emailRedirectTo` para que, após confirmar o e-mail, o usuário seja redirecionado para `/login?confirmed=1`.
- A página de login exibe uma mensagem “E-mail confirmado com sucesso. Agora faça login.” quando este parâmetro está presente.

### Personalização do e-mail de confirmação (Supabase)
Personalize o conteúdo do e-mail diretamente no painel do Supabase:
1. Supabase > Authentication > Email Templates (modo correspondente: Test ou Live)
2. Ajuste o assunto e o HTML, incluindo branding e links.
3. Configure domínio e remetente (SMTP) em Authentication > Providers, se preciso.

Observação: para o Portal de Cobrança do Stripe em produção (live), crie e salve uma configuração padrão em https://dashboard.stripe.com/settings/billing/portal ou informe `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` no `.env`.

