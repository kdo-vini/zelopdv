# ZeloAdmin — snapshot de mutações críticas (2026-08-13)

## Escopo

Revalidação read-only do `admin-dashboard` e do schema vinculado. O objetivo foi
confirmar se alguma mutação administrativa dependia apenas do gate do browser
ou de uma permissão genérica. Nenhuma migration nova foi necessária nesta
fatia: os contratos já estão contidos pela migration P0
`20260812150000_p0_security_containment.sql`.

## Consumidores e blast radius

- O dashboard usa somente a chave `anon` do Supabase, mas o layout bloqueia a
  aplicação sem uma sessão que seja um `super_admin` ativo. O banco repete essa
  decisão em RLS/guards; o gate visual não é a única barreira.
- Mutações browser-side confirmadas: INSERT/DELETE em
  `admin_finance_fixed_expenses`, UPDATE em `subscriptions` e UPDATE do
  próprio `super_admins.last_login`. Todas têm políticas para
  `authenticated` condicionadas a um `super_admin` ativo.
- `admin_delete_user` é chamado pela tela de usuários, mas o próprio
  SECURITY DEFINER valida `auth.uid()` contra `super_admins.is_active` antes de
  registrar ou apagar qualquer conta.
- `admin_get_all_auth_users`, `admin_get_sales_counts`,
  `admin_get_users_last_seen` e `admin_get_total_sales_value` são leituras do
  dashboard; cada uma mantém guard interno para super-admin ativo ou
  `service_role`.
- `admin_extend_subscription` não tem consumidor browser encontrado e é
  `service_role`-only. O mesmo vale para `admin_get_users_without_profile`,
  `deactivate_expired_subscriptions` e `run_subscription_expiration_check`.

## Snapshot live

| superfície | anon | authenticated comum | super-admin ativo | service-role |
|---|---:|---:|---:|---:|
| admin RPCs de leitura | sem EXECUTE | 0 linhas/`42501` pelo guard | permitido | permitido |
| `admin_delete_user` | sem EXECUTE | `P0001` antes do efeito | permitido | permitido |
| `admin_extend_subscription` | sem EXECUTE | sem EXECUTE | sem EXECUTE (service-only) | permitido |
| `admin_get_users_without_profile` | sem EXECUTE | sem EXECUTE | sem EXECUTE (service-only) | permitido |
| funções de expiração | sem EXECUTE | sem EXECUTE | sem EXECUTE (service-only) | permitido |
| `super_admins` SELECT | negado | somente própria linha ativa | linhas administrativas | bypass intencional |
| `super_admins` INSERT/DELETE | negado | sem privilégio de tabela | sem privilégio de tabela | bypass intencional |

Probes transacionais vinculados:

- 1 super-admin ativo e 1 linha total em `super_admins`.
- authenticated sem identidade administrativa: 0 linhas em
  `super_admins`, `admin_get_all_auth_users`, `admin_get_sales_counts` e
  `admin_get_users_last_seen`; `admin_get_total_sales_value` e
  `admin_delete_user` retornaram `42501`/`P0001` antes de qualquer efeito.
- super-admin ativo: 29 usuários, 7 grupos de vendas, 29 linhas de last-seen
  e 17 grupos de receita retornados pelos RPCs de leitura.
- service-role: `admin_get_all_auth_users` e `admin_get_users_last_seen`
  retornaram os mesmos escopos; os RPCs service-only permaneceram executáveis.
- Não existe hoje uma linha `super_admins` removida/inativa para uma prova
  positiva separada; um JWT sem linha ativa foi exercitado como authenticated
  comum e permaneceu sem acesso. O dashboard é global, sem uma dimensão de
  tenant adicional para criar um caminho cross-tenant distinto.

## Decisão

Finding administrativo P0 **não confirmado** além do que já foi contido pela
migration P0 existente. Não mover chamadas do dashboard para APIs SvelteKit,
não alterar billing e não ampliar RLS nesta rodada. O corpo de
`admin_extend_subscription` continua sem guard próprio, mas isso é deliberado:
o ACL live é exclusivamente `service_role`; conceder EXECUTE a uma role de
browser seria uma mudança insegura e exigiria outro PR.

## Rollback

Não há mudança de produção neste snapshot. A contenção anterior permanece
rollbackável somente por uma migration forward-only que restaure os grants e a
policy registrados em
`docs/operations/P0-SECURITY-CONTAINMENT-SNAPSHOT-2026-08-12.md`; não reescrever
`20260812150000`.
