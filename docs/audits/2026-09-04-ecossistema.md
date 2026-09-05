# Correções da auditoria do ecossistema Zelo — 2026-09-04
> Rodada de execução atualizada em 2026-09-05 UTC. A primeira auditoria e suas medições permanecem no histórico Git e nos relatórios individuais. Publicação coordenada em andamento.

## Resultado

As correções abrangem PDV/admin, Chat, Menu, Printer e o PostgreSQL compartilhado. A prioridade foi permitir PDV e Chat conectados ao mesmo agente de impressão, com preferência configurável e deduplicação persistente do mesmo pedido. Também foram reconciliadas cópias atrasadas e o fluxo de migrations do Menu, além de acrescentada verificação do commit realmente servido pelos domínios.

Não foi criada uma arquitetura nova. Foram corrigidos limites e contratos existentes: dono da loja, identidade do pedido, reserva antes de efeitos externos, concorrência, confirmação de gravação e origem do build.

## Publicação verificável

| Componente | Versão / estado |
| --- | --- |
| PDV e admin | Branch codex/ecossistema-confiabilidade-20260904; gates Linux anteriores verdes; consolidação final em curso |
| Chat | main 0d67676; CI completo 33933729882 verde; configuração de versão corrigida, publicação final em conferência |
| Menu | master 37b4b9e; Dokploy Done em 28 s; domínio/32 assets confirmam o mesmo SHA |
| Printer | main e068ff8; release v0.2.0 publicada, instalador/alias/SDK disponíveis; CI 33933244243 verde |
| Supabase | Frete, cupom, lease push, cotação atual, reserva Pix e venda owner/actor aplicados, com ledger/ACL conferidos |

A tabela é atualizada após conferir os artefatos públicos. Código compilado localmente ou um push não equivale a produção atualizada.

## Pendências da primeira auditoria e tratamento

| Grupo | Correção realizada | Evidência / limite |
| --- | --- | --- |
| P01–P06 PDV | Cache por dono, vazio autoritativo, troca de conta, transação Dexie, chave estável e PWA somente público | Regressões de persistência e concorrência; sem apagamento por idade |
| Offline sem dono | Ação de verificação por caixa/RLS, login confirmado duas vezes e CAS do registro local | Recupera apenas vínculo comprovado; inconclusivos ficam intactos para suporte |
| Venda por operador | Owner resolvido no servidor, ator autenticado gravado, RBAC antes do replay, lock por loja/chave | Defeito reproduzido e corrigido em PostgreSQL; operador bloqueado recusado e titular próprio preservado; sem backfill |
| Catálogo grande | Paginação de 500 linhas, IN em lotes de 100, owner explícito e ordem por chave única | 12 regressões; falha/troca de conta não publica leitura parcial |
| P07 e Printer | Tokens simultâneos, diagnóstico real, intenção canônica, preferência PDV/Chat e diário persistente | 38 testes SDK e 33 cenários nativos; resultado incerto não repete automaticamente |
| P08–P09 e admin histórico | Flags preservadas, cancelamento limpa extensão mesmo repetido, ID/owner selecionados e CAS inclusive NULL | Reativação sem prazo é rejeitada; UI usa extensão existente |
| P10 frete SQL | Variável record substituída por JSONB na função real | Migration aplicada, erro de lint correspondente eliminado |
| P11–P12 qualidade | Datas determinísticas, configuração admin e labels acessíveis | Check principal/admin sem erros; builds completos em Linux |
| Dependências PDV/admin | Adapter 6.3.4, SheetJS 0.20.3, Svelte 5/Vite 6 no admin, cookie corrigido | npm audit zero; round-trip real de XLSX e serialização cookie |
| Cadastro | Analytics/referral não bloqueiam navegação e resposta de sucesso | Eventos preservados; ganho de INP de campo ainda não medido |
| Pix sem deadline | Reserva antes do POST, prazo de 15 s incluindo corpo, consulta por externalId em resultado incerto | Duas sessões geram uma reserva; valor/identidade e liquidação tardia protegidos |
| CRM Chat | Cinco argumentos incorretos trocados pelos três live; pessoaId correto | Erro PGRST202 observado anteriormente; regressões de adapter |
| Chat performance/runtime | Painel lazy, Node 24, loader ESM, dependências de runtime, usuário sem root, drain e deadlines | JS inicial −35,1% na mesma base; boot Linux e CI completos |
| Chat websocket | Contenção de erros do transporte, limite de entrada e fila de saída | Testes convencionais locais; reprodução anterior de frames não foi repetida |
| Menu M01–M07 | Boundary público, estoque de complementos, env runtime/HTML, API404, push SSRF, coordenadas e diretório | Unitários, HTTP real e navegador com fixtures |
| Foto e concorrência Menu | Arquivo publicado sobrevive ao rascunho; CAS de edição; reorder não restaura foto antiga | Regressões de serviço e desktop/mobile |
| Cupom e checkout | Função transacional de confirmação pública, token/revisão e resgate único | PGlite e PostgreSQL 17 concorrente; falha reverte pedido e resgate |
| Frete e push concorrentes | CAS no carrinho, request vigente, lease por assinatura e checkpoint correto | Provas de concorrência e ACL; push continua ao menos uma vez após crash |
| Caches e fanout | Limites de cardinalidade/concorrência e paginação; métricas internas autenticadas | Testes de limites e falhas; sem introduzir broker |
| Cópia Menu divergente | Merge preservando autoria local e 40 commits remotos | Gates no commit reconciliado; nenhum force-push |
| Migrations duplicadas | Sete arquivos históricos fora de supabase/migrations do Menu | Bytes e origem preservados; versões colidentes não alteradas no ledger |
| Bundle antigo | SHA real obrigatório, frontend/backend do mesmo commit, runtime sem override e conferência após deploy | Menu verificado; Chat rejeitou placeholder literal e está em publicação corrigida |
| Rebrand/escala visual | Mantidos conforme escopo original | Dívida visual contextual, não escondida como correção funcional |

## Infraestrutura conferida no navegador do usuário

O Dokploy mostra um serviço ativo de Menu, GitHub/master, contexto ponto e porta 3101, sem volume de código. O arquivo legado de rota estava vazio. Não se apagaram imagens ou volumes como tentativa genérica de resolver cache.

O Chat possui frontend e backend no mesmo repo/main. Os nomes internos dos serviços estão invertidos; as rotas foram conferidas. O contexto do Dockerfile.frontend foi explicitado e o backend recebeu 60 segundos para shutdown. O código faz drain até 55 segundos, para novas aquisições e aguarda trabalhos já admitidos.

Os builds recusam código de produção sujo/não versionado e versão informada diferente do commit. CRLF equivalente ao Git é normalizado. Health/version e bundle devem comprovar o mesmo SHA. O CI de branch executa os gates antes do avanço da branch de produção; o verificador pós-deploy deve falhar se o domínio continuar servindo outra versão.

## Banco e provas de consistência

| Migration aplicada | Objetivo |
| --- | --- |
| 20260904222157 | Corrigir record/JSONB em configuração de frete |
| 20260904232549 | Confirmar pedido público e cupom atomicamente |
| 20260904234946 | Lease de despacho de push |
| 20260904235540 | Recusar resolução de cotação que já não pertence ao carrinho |
| 20260905001053 | Reservar cobrança Pix antes de contatar o provedor |
| 20260905003227 | Venda na loja titular, ator correto e replay compartilhado entre operadores |

Os contratos novos de serviço foram conferidos com anon/authenticated sem EXECUTE e service_role com EXECUTE. A RPC existente de venda preserva authenticated/service_role, com autorização interna e anon negado. Não houve uso de credenciais de clientes para teste nem DML de negócio em produção.

O baseline e migrations de schema foram restaurados em PostgreSQL 17 descartável. Sete matrizes transacionais e três provas de concorrência passaram em rodadas separadas. O seed de catálogo de um cliente é excluído somente mediante opção explícita e hash conferido; não se fabrica esse cliente no banco de teste. Os probes de cliente aceitam apenas a URL descartável fixa. Acesso às tabelas temporárias foi corrigido sem ampliar grants de aplicação. O baseline congelado permaneceu intacto, inclusive seu README; as novas evidências ficam nos documentos atuais.

Apontamentos de advisors continuam classificados individualmente: tabelas de serviço com RLS sem policy, índices aparentemente redundantes e funções privilegiadas não foram alterados por contagem. Não são automaticamente vulnerabilidades nem justificativa para excluir índices.

## Validação observada

| Projeto | Evidência desta rodada |
| --- | --- |
| PDV/admin | 1.031 testes passam / três probes unitários opt-in; check zero; builds Vercel completos no GitHub/Linux; sete SQL e três concorrências executados pelo harness |
| Chat | 123 arquivos de testes, lint dos dois lados, duas imagens e smoke sem rede/credenciais reais; quatro regressões de socket e oito de verificação de deploy |
| Menu | 650 unitários; 44 E2E locais e 40 passam/quatro opt-in no CI; typechecks, SQL PGlite/PostgreSQL, build, audit, Docker/HTTP; domínio público com SHA validado |
| Printer | 38 testes SDK, 33 cenários nativos, publish self-contained, installer, instalação/desinstalação isolada; CI Windows Node 24 verde |

Os números referem-se às rodadas identificadas, não a uma soma de métricas incompatíveis. O total será consolidado após os últimos patches. Três skips do Vitest não escondem os probes SQL: o harness separado executou as verificações correspondentes.

## Limites que permanecem

1. A impressora térmica física, papel, driver USB/rede e política de acesso local do navegador precisam de teste na loja após instalar 0.2.0. Spool não comprova papel.
2. O instalador não possui assinatura Authenticode da empresa; a assinatura do instalador da ferramenta Inno não é assinatura do produto.
3. A causa do INP alto no cadastro não foi certificada por trace de campo. O bloqueio por analytics foi removido; nova medição depende de uso após rollout.
4. Offline continua contingência: não impede disputa de estoque entre terminais desconectados. Registros sem prova de dono não são atribuídos automaticamente.
5. Histórico de venda ligado a operador só pode ser correlacionado automaticamente enquanto existe o vínculo em access_users. Consulta live encontrou zero nesse conjunto; vínculos já apagados não foram inferidos nem houve backfill. Paginação de catálogo não é snapshot transacional: edição simultânea pode exigir refresh.
6. A revisão automática de segurança interrompeu uma reprodução websocket na primeira auditoria. Esse artefato foi removido e o procedimento não foi repetido. A correção defensiva posterior usa eventos locais de transporte, sem frames malformados.

## Relatórios de apoio

- [PDV](2026-09-04-zelopdv.md) e [performance](2026-09-04-performance.md), com a primeira rodada preservada como histórico.
- [Integração e operação](2026-09-04-integracao.md), com o contrato Printer e a distribuição.
- [Chat](C:/Users/Vinicius/orca/zelochat/docs/audits/2026-09-04-zelochat.md).
- [Menu](C:/Users/Vinicius/orca/zelomenu/docs/audits/2026-09-04-zelomenu.md).
- [Printer](C:/Users/Vinicius/Documents/code/zeloprinter/docs/audits/2026-09-04-zeloprinter.md).
- [Incidentes](../INCIDENTS.md) e [billing](../BILLING.md).
