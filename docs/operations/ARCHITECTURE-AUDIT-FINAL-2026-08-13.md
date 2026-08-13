# Architecture audit — encerramento da rodada (2026-08-13)

## Resultado

A rodada de contenção foi concluída sem refatoração geral. Cada finding foi
reproduzido antes de ser alterado; o que não pôde ser confirmado ficou
registrado como backlog/candidato, sem mudança de produção.

## Verificado e alterado

- P0 de segurança: views/RPCs sensíveis perderam acesso anon indevido;
  `super_admins` ficou limitado por RLS/grants; RPCs administrativas sem
  consumidor browser ficaram service-role-only. Migration e snapshot:
  `20260812150000_p0_security_containment.sql`.
- Leituras de vendas, pagamentos, caixa, taxas, fiado e relatórios foram
  fechadas em fatias separadas, sempre preservando owner, papel autorizado,
  service-role e os writes que dependem de SELECT/RETURNING.
- Storage `zelochat-media` perdeu INSERT/DELETE público; o bucket continua
  público para download por URL. Migration:
  `20260813092000_zelochat_media_storage_containment.sql`.
- `fiado_estornar_venda` passou a exigir `pdv.cancelar` antes de alterar saldo
  ou ledger (`20260813093000_fiado_estorno_rbac.sql`).
- `zelo_orders`, itens e eventos passaram a exigir `pedidos.acessar` ou
  `pedidos.cozinha`, preservando owner, service-role, actions e Realtime
  (`20260813094000_canonical_orders_select_rbac.sql`).
- O endpoint do assistant passou a bloquear subusuário sem `relatorios.ver`
  antes de qualquer leitura privilegiada; owner e subusuário autorizado foram
  preservados (commit `91ace85`).
- O sweeper de deleção ganhou claim/lease/fencing e a reativação ganhou fence
  pré-Stripe/complete; o worker usa apenas a instância capturada, falha fechado
  em storage/billing e faz retry (`20260813095000_account_deletion_purge_claims.sql`,
  commits `830dc11` e `5388fc0`).

## Verificado e intencionalmente deixado sem mudança

- ZeloAdmin: nenhuma mutação crítica adicional foi confirmada como dependente
  apenas de UI. O dashboard usa anon, mas INSERT/DELETE de despesas, UPDATE de
  assinaturas e `last_login` estão sob RLS de super-admin ativo; RPCs de leitura
  têm guard interno. `admin_extend_subscription` e os jobs de expiração são
  service-role-only e não têm consumidor browser.
- Billing, vendas/offline, Mesa, UI grande, sales/offline architecture,
  request IDs, structured logging, rate limiting compartilhado, decomposição,
  dependências e redesign de confirmação por IA permanecem fora da rodada.
- Lint/advisors existentes de funções e warnings de acessibilidade não foram
  tratados oportunisticamente.

## Testes e observação

- ZeloPDV: `npm test` — 107 arquivos, 681 testes; `npm run check` — 0 erros,
  95 warnings preexistentes; `npm run verify:migrations` — 107/107; migration
  list linked alinhada; verifier SQL de autorização e harness descartável
  passaram.
- ZeloChat: targeted sweeper tests, lint, TypeScript e build passaram. A suíte
  completa teve 47/48 arquivos verdes; o único vermelho é o teste preexistente
  `tests/zelomenuSlug.test.ts`, que espera `/menu/casa-dos-salgados` enquanto o
  runtime atual retorna `/casa-dos-salgados`; não foi alterado por ser fora do
  escopo.
- Produção: migration `20260813095000` aplicada e ACL/RPC matrix passou; fila
  live permaneceu `22 profiles / 0 scheduled / 0 due / 0 claimed / 0 reactivating`.
  ZeloChat responde a versão `5388fc0bf965`. Nenhuma conta real foi apagada ou
  reativada como smoke destrutivo.

## Riscos residuais

- Não há prova destrutiva de uma conta real agendada; deve ser feita apenas em
  janela aprovada. Fences de reativação stale podem reter uma conta até retry
  ou reconciliação manual, por desenho fail-closed.
- O sweeper continua dependente da topologia de réplicas e de chamadas externas
  menores que o lease; a versão implantada não fornece heartbeat de tick vazio.
- O teste de slug continua vermelho e é independente desta contenção.

## Rollback

- Código: reverter/redeployar o commit correspondente; parar o worker antes de
  qualquer rollback de schema.
- Banco: usar migration forward-only que restaure exatamente os grants/policies
  do snapshot da fatia. Nunca reescrever migrations aplicadas nem apagar dados
  já removidos pelo sweeper; rollback de schema não recupera efeitos externos.
