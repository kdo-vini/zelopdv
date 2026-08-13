# Zelinho assistant — boundary server-side — 2026-08-13

## Finding verificado

O endpoint `POST /api/chat/assistant` autenticava o bearer e chamava apenas
`resolveOwnerUserId(user.id)`. Para qualquer subusuário ativo, o helper
resolvia o titular e o endpoint passava a usar `service_role` para carregar:

- perfil, catálogo e estoque;
- vendas, itens, pagamentos, despesas e caixa;
- saldos de fiado e sinais gerenciais;
- contexto de tela/sinal;
- o número de WhatsApp do titular e a ferramenta de envio de resumo.

Não existia capability server-side antes dessas leituras. O rail
`AssistantChat` é montado nos layouts `/app`, `/gestao`, `/ferramentas` e
`/relatorios`, sem gate próprio. Não há consumidor cron, administrativo ou
server-to-server do endpoint; o consumidor é browser autenticado.

O boundary existente do produto para os mesmos dados é `relatorios.ver`: ele
protege Relatórios, Zelinho Gerente, `business_signals`, snapshots e as leituras
financeiras detalhadas. Os cargos padrão Caixa e Atendente não possuem essa
capability; Gerente possui.

## Evidência live e blast radius

`ai_usage_logs` foi consultado apenas em agregado, sem conteúdo de mensagens ou
identificadores pessoais:

| Classe atual do ator | Histórico | Últimos 30 dias | Últimos 7 dias |
| --- | ---: | ---: | ---: |
| owner ou usuário hoje sem vínculo | 41 | 6 | 2 |
| ator nulo/excluído | 9 | 9 | 0 |
| subusuário atual com `relatorios.ver` | 0 | 0 | 0 |
| subusuário atual sem `relatorios.ver` | 0 | 0 | 0 |

O banco possui 4 subusuários ativos, todos em papéis sem `relatorios.ver`, e
nenhum uso do assistant atribuído a eles. Portanto o comportamento removido
atinge quatro chamadas diretas potenciais, mas zero uso legítimo observado.
Owners permanecem inalterados; subusuários com a capability permanecem
autorizados.

Uma tentativa de integração HTTP usou a conta E2E dedicada e um usuário/cargo
sintético, mas o deploy respondeu `401 Não autorizado` antes do boundary novo.
O mesmo diagnóstico com JWT válido do owner também retornou 401, embora o JWT
fosse aceito diretamente pelo Auth do projeto linked. Isso é um desvio
preexistente do deploy e impede usar o HTTP live como prova desta fatia; não foi
misturado à correção RBAC. Todos os usuários/cargos/logs sintéticos foram
removidos e o catálogo confirmou zero resíduo.

## Menor correção

O endpoint troca a resolução simples por `getServerAccessContext(user.id)` e,
antes de `last_seen_at`, signals, screen context, business context, OpenAI ou
WhatsApp, aplica:

```js
if (
  accessContext.isSubUser &&
  accessContext.permissions?.['relatorios.ver'] !== true
) {
  return json({ error: 'Você não tem permissão para usar o Zelinho.' }, { status: 403 });
}
```

O owner continua com bypass. A comparação booleana é estrita; chaves ausentes,
`false` ou valores não booleanos não concedem acesso. O rail permanece visível
e renderiza a resposta 403 existente; esconder UI seria outra mudança. O
contrato de assinatura/add-on, cache, prompts, rate limit, OpenAI, WhatsApp e
banco não foi alterado.

## Matriz

| Ator | Resultado |
| --- | --- |
| anon/token inválido | 401, inalterado |
| owner | atravessa o gate, inalterado |
| subusuário ativo com `relatorios.ver: true` | atravessa o gate |
| subusuário ativo sem a capability | 403 antes de qualquer leitura service-role |
| subusuário com chave ausente/false | 403 |
| removido/bloqueado | não resolve mais o antigo owner; contrato do helper preservado |
| super-admin externo | tratado como sua própria conta, sem alvo cross-tenant |
| service-role bearer | não é consumidor suportado da rota autenticada |

## Verificação

- [x] inventário de consumidores browser/server/cron/admin;
- [x] uso live agregado e distribuição de papéis;
- [x] TDD: o teste novo falhou antes do gate com `Aviso não encontrado`, provando
  que alcançava a leitura service-role;
- [x] após o gate, o mesmo ator recebe o 403 específico e nenhuma tabela é
  consultada;
- [x] owner e subusuário autorizado atravessam o boundary;
- [x] signal tenant-scope continua preservado;
- [x] testes focados do assistant/access context: 45/45;
- [x] suíte completa: 106 arquivos/656 testes;
- [x] typecheck: 0 erros e 95 warnings preexistentes;
- [ ] deploy;
- [ ] repetir HTTP owner/autorizado/negado após o deploy corrigir ou explicar o
  401 preexistente.

## Rollback

Rollback é somente reaplicar o deploy anterior ou reverter este commit de
aplicação. Não há migration nem mutação de dados. O rollback reabre
deliberadamente o contexto financeiro e a ferramenta de WhatsApp para todos os
subusuários ativos.
