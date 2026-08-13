# Sweeper de exclusão de conta — contenção e reliability — 2026-08-13

## Estado verificado antes da mudança

O worker existe no ZeloChat implantado em produção. A versão pública
`5c2477508783` corresponde ao `origin/main` do ZeloChat; nesse commit, o
container executa `npx tsx server/index.ts` e chama
`startAccountDeletionSweepLoop()` depois que o servidor começa a escutar. O
primeiro tick ocorre após 3 minutos e os seguintes a cada hora.

O worker não registra startup nem tick vazio. Portanto, ausência de log não é
prova de inatividade. O número de réplicas não pôde ser confirmado pelo painel
Dokploy. Vinte conexões novas retornaram a mesma versão, o que exclui rollout
misto observado, mas não prova exclusão mútua entre réplicas.

Snapshot linked imediatamente antes da migration:

- 22 perfis;
- 0 exclusões agendadas, 0 vencidas e 0 futuras;
- `empresa_perfil` pertence a `postgres`, tem RLS ligado e `FORCE RLS`
  desligado;
- ACL da tabela: `postgres=arwdDxtm`, `anon=awdDxtm`,
  `authenticated=awdDxtm` e `service_role=arwdDxtm`; os grants do browser
  continuam sujeitos a RLS;
- somente `deletion_scheduled_at`, `deletion_requested_at` e
  `deletion_source` existiam; não havia claim, lease ou trigger de fencing;
- `delete_account(uuid,text)` pertence a `postgres`, é `SECURITY DEFINER`, usa
  `search_path=public, pg_temp`, tem EXECUTE somente para `postgres` e
  `service_role` e SHA-256
  `0e3801382c005837d449d0e5d2b4f92d1626dbc3d2533372bf8df585fc34000e`.

A definição e a ACL de `delete_account` ficam inalteradas nesta fatia.

## Findings confirmados

O código implantado selecionava até 50 contas vencidas sem claim, lock,
fencing ou revalidação. Réplicas podiam processar a mesma conta. Uma
reativação concorrente podia limpar o agendamento e ainda perder para um
worker que já havia lido a linha, resultando em exclusão após reativação.

O purge chamava `deleteInstance(empresaId)`. Esse helper podia resolver uma
empresa sem instância dedicada pelo fallback global `WHATSMIAU_INSTANCE`,
arriscando apagar a instância bootstrap de outro tenant.

Falhas de WhatsApp e Storage eram engolidas, a listagem de Storage parava em
1.000 objetos e banco/Auth era apagado após limpeza externa parcial. Isso
removia o marcador de retry e podia deixar cobrança, instância ou PII pública
órfãs. Erro na query da fila era reportado como fila vazia.

No ZeloChat, `/api/account/reactivate` era barrado pelo paywall para assinaturas
inativas e limpava o agendamento mesmo quando a retomada Stripe falhava. A fila
estava vazia no snapshot, portanto não foi encontrado incidente ou conta presa
em produção naquele momento.

## Consumidores e blast radius

- produtores: owner no ZeloPDV `POST /api/account/delete` e owner no ZeloChat
  `DELETE /api/account`;
- reativação: endpoints server-side dos dois produtos;
- consumidor da fila: loop backend do ZeloChat com `service_role`;
- `delete_account` também é chamada por `admin_delete_user`; contrato mantido;
- Storage: `zelochat-media/send/{empresa}`, `received/{empresa}`,
  `delivery-assets/{empresa}`, `logos/zelomenu-products/{user}` e quatro logos
  raiz do user;
- não há consumidor browser ou cron separado das novas RPCs.

| Ator | Comportamento após a contenção |
| --- | --- |
| anon | sem EXECUTE nas seis RPCs |
| authenticated comum | sem EXECUTE |
| owner | agenda antes dos fences; reativa via begin/complete; recebe 409 durante purge ou outra reativação |
| subusuário | sem EXECUTE; endpoints permanecem owner-only |
| super-admin autenticado | sem EXECUTE direto; fluxo admin existente preservado |
| service role | claim/renew/finalize do purge e begin/complete/abort da reativação |
| postgres | manutenção; finalize direto bloqueado sem assumir `service_role`; DELETE bloqueado durante reativação |

## Menor correção

A migration forward-only `20260813095000_account_deletion_purge_claims.sql`
adiciona quatro colunas nullable, sem backfill: `deletion_purge_token`,
`deletion_purge_claimed_at`, `deletion_reactivation_token` e
`deletion_reactivation_started_at`. Seis RPCs service-only formam dois estados
mutuamente exclusivos.

O claim de purge usa `FOR UPDATE SKIP LOCKED`, prioriza linhas ainda não
processadas, nunca seleciona qualquer linha com token de reativação e só
recupera lease de purge com mais de 30 minutos. Renew confirma empresa, user,
token, prazo e lease antes de cada efeito. Finalize repete essas validações,
exige reativação nula e instância WhatsApp nula, e só então chama a definição
existente de `delete_account`.

A reativação segue `begin → Stripe → complete`. Begin trava a linha, recusa
purge e preserva o agendamento. Complete usa CAS de empresa + user + token para
limpar agendamento e fence na mesma transação. Abort usa o mesmo CAS, limpa
somente o fence e preserva o agendamento. Erro Stripe ambíguo não faz abort: o
fence abandonado bloqueia purge até uma nova tentativa assumir o token após 30
minutos. O timeout Stripe padrão é 80 segundos, abaixo dessa janela; o retry
repete a retomada idempotente antes de completar.

O trigger bloqueia, durante os fences: mudança de agenda/source, identidade ou
ponteiro WhatsApp; DELETE direto; mutação browser dos tokens; liberação manual
de purge; e transições fora dos formatos begin/complete/abort. Durante purge,
`service_role` só pode renovar a lease ou limpar o ponteiro dedicado
nonnull→null mantendo o token exato.

O worker usa somente o ponteiro dedicado capturado pelo claim, com CAS por
empresa + ponteiro + token; nunca usa fallback global. Billing, provedor e cada
list/remove de Storage são precedidos por renew. Falhas preservam o claim para
retry. Storage é paginado e idempotente. QR/connect consulta os fences antes de
cache/provider, persiste somente sem claim e compensa a instância exata se
perder o CAS.

As duas aplicações exigem os dois fences nulos para agendar. Reativação usa as
RPCs begin/complete/abort; no ZeloChat ela é uma exceção exata do paywall e só
limpa o agendamento depois do sucesso Stripe.

## Verificação

- [x] finding reproduzido estaticamente no código implantado;
- [x] versão, comando do container, startup e cadência verificados;
- [x] fila linked reconciliada somente em leitura: 0 agendadas/0 vencidas;
- [x] TDD RED → GREEN do contrato estrutural da migration;
- [x] baseline PG17 descartável reaplicado com o state machine de quatro colunas;
- [x] matriz descartável nova: anon, authenticated, owner, subusuário,
  super-admin, service role, exclusão mútua, takeover, claims disjuntos, lease,
  tokens antigos, DELETE, complete/abort, finalize sintético e rollback;
- [x] `delete_account` não é redefinida pela migration e sua ACL não é alterada;
- [x] migration aplicada linked;
- [x] matriz transacional repetida linked e zero resíduo confirmado;
- [ ] ZeloPDV e ZeloChat implantados na ordem compatível;
- [ ] reconciliação final somente em leitura e observação de tráfego natural;
  nenhum smoke destrutivo de agendamento ou Stripe em produção;
- [x] suítes, typechecks, build e DB lint/security finais registrados (lint/advisors
  mantêm findings preexistentes fora desta migration; nenhum novo finding da
  migration 0950 foi introduzido).

A matriz usa somente usuários e perfis sintéticos em transação com `ROLLBACK`.
Não usa conta real, Storage real, cobrança ou instância WhatsApp como fixture.

## Rollout e observação

1. aplicar a migration;
2. implantar ZeloPDV e ZeloChat prontamente;
3. repetir a matriz transacional sintética e verificar `0` resíduo;
4. confirmar versão do ZeloChat e fila `scheduled/due/claimed/reactivating`;
5. observar o primeiro tick e reconciliar a fila somente em leitura.

Código novo antes da migration causaria erro por coluna/RPC ausente. A migration
primeiro deixa o worker antigo temporariamente sem claim; o snapshot de zero
agendadas/vencidas elimina blast radius atual dessa janela, mas ela deve ser
mantida curta.

## Rollback

Rollback operacional imediato:

1. parar/redeployar worker e aplicações para a versão anterior;
2. confirmar zero claims/fences ativos;
3. manter objetos aditivos inertes até uma migration forward-only revisada.

Rollback de schema, sempre em nova migration: remover as seis RPCs
(`finalize`, `renew`, `claim`, `begin`, `complete`, `abort`), trigger/função
guard, três constraints e quatro colunas. Nunca editar `20260813095000` depois
de aplicada.

Rollback não restaura Auth, dados, Storage, Stripe ou WhatsApp que um purge
legítimo já tenha removido.

## Riscos restantes deliberados

- réplicas Dokploy não foram confirmadas independentemente; o claim de banco
  torna múltiplas réplicas seguras;
- cada chamada externa deve terminar em menos de 30 minutos; renew reduz a
  janela, mas uma chamada individual travada além da lease pode se sobrepor a
  retry idempotente;
- falha ambígua/crash durante Stripe deixa deliberadamente um fence de
  reativação abandonado; purge não o expira, e o owner precisa repetir a
  reativação após 30 minutos para assumir o token;
- heartbeat, structured logging e revogação absoluta de JWT/Storage já
  autorizado permanecem fora desta fatia.
