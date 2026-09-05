# Continuidade offline — execução do plano aprovado

Plano aprovado na conversa em 2026-09-05. Contratos e diagnóstico em
[OFFLINE](../../operations/OFFLINE.md). A execução não representa homologação
de produção ou de aparelhos físicos.

## Decisões vinculantes

- Operação por aparelho; LAN/cozinha entre aparelhos em fase posterior.
- Todos podem operar Mesas; conflitos preservados e conferidos pelo titular.
- Aparelho principal abre/movimenta/fecha turno; outros continuam vendas.
- Salvar localmente antes de confirmar; ID estável, replay idempotente.
- Venda recebida com falta posterior de estoque preserva financeiro e gera divergência.
- Sem dados autenticados no cache HTTP; snapshots por loja/operador.
- Mensagem discreta por episódio; falha de armazenamento nunca mostra sucesso.
- Preservar as alterações de pizza/montagem presentes no checkout.

## Entregas

- [x] Transações atômicas de Mesa/Caixa e operações remotas idempotentes.
- [x] Persistência local, rascunhos, migração e recuperação criptografada.
- [x] Sincronização global, classificação, leases e reconexão.
- [x] Frente de Caixa local-first, estoque/recibos.
- [x] Turno offline com aparelho principal e reconciliação.
- [x] Mesas locais e tratamento de concorrência.
- [x] Shell/PWA, sessão e avisos discretos.
- [x] Testes, instrumentação e documentação; publicação/piloto separados.

## Registro de execução

- Base: checkout existente `feat/pizzas-montaveis`, com alterações de usuário
  ainda não commitadas. Trabalho no mesmo checkout para preservar contratos;
  agentes têm superfícies de escrita separadas. Nenhum reset/stash/commit em lote.
- Skill de execução delegada aplicada; revisão financeira obrigatória antes
  de qualquer publicação. Sem alterações em produção durante implementação.
- Aceite: 1.000 operações sem perda/duplicação, cenários de resultado incerto,
  reload offline do build real, RBAC/SQL descartável, celular físico separado.

## Validação

Checkboxes representam implementação local validada, não implantação.

- `npm test` (13:19): 185 arquivos, 1.123 testes passam; três skips de runners
  opcionais preexistentes. Regressões focadas posteriores registradas em CURRENT.
  A reexecução geral posterior não está verde: duas falhas em cadastro de pizza
  alterado paralelamente e três timeouts que passaram isoladamente. Ver CURRENT.
- Verificação focada final: **107 passam em 21 arquivos**, após o último
  ajuste de timeout e identidade. O agente principal repetiu o harness completo
  sobre o build atualizado: seis rotas/viewport e as três jornadas passam.
  Matriz SQL offline+pizza também repetida com sucesso pelo agente principal.
  No recheck dos testes paralelos, resta somente `modelMapping` (quatro versus
  cinco modelos); não pertence às alterações offline e permanece documentado.
- `npm run check`: zero erros/avisos. `git diff --check`: sem erros.
- 1.000 intenções em Dexie/fake-indexeddb, reabertura, dois sincronizadores,
  50 respostas perdidas depois de confirmar no servidor simulado: sem perda ou
  duplicação. Teste conservado em `tests/offline.operations.test.js`.
- `node tests/browser/offline-shell/run.mjs --checkout --mesas --cash`: build/SW
  reais, rotas, venda com reload, Mesa com parcial+fechamento e turno completo
  em desktop e celular emulado. Rede externa
  bloqueada, identidade e dados sintéticos. Sem vendas reais.
- SQL em PGlite descartável com baseline e migrations reais: fechamento
  atômico, RBAC/tenant, estoque negativo exclusivo do replay, fiado, turno de
  parciais, recibos e reconciliação. Não testa concorrência multi-sessão.
- Build client/SSR/PWA gerado; `npm run build` não termina verde por EPERM
  de symlink no adapter Vercel em Windows. Docker local indisponível.

## Homologação e publicação separadas

- [ ] PostgreSQL com conexões concorrentes: dois fechamentos/último item/turno.
- [x] Build completo em ambiente que permita o adapter Vercel; deployment
  remoto `dpl_BExkssRHXWVrFzzZ5exeURa24d98` ficou READY em produção.
- [ ] Android/iPhone físicos, impressão, interrupção de energia e turno longo.
- [x] Migration e backend compatíveis aplicados no projeto remoto e smoke-tested;
  ainda falta piloto controlado antes de ampliar o rollout para toda a base.

Nunca habilitar indiscriminadamente antes desses gates nem apagar uma fila no
rollback. Desabilitar a entrada de novas operações preserva o replay das
anteriores, sujeito à autorização atual no servidor.
