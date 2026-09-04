# Auditoria prática do ecossistema Zelo — 2026-09-04

## Resultado executivo

Foram investigados e alterados **ZeloPDV, ZeloChat, ZeloMenu e ZeloPrinter**, com agentes por projeto, reprodução de falhas, revisão cruzada e validação. As correções mais relevantes protegem dados offline por dono, idempotência de vendas, impressão com resultado incerto, pareamento entre produtos, estoque de complementos e contrato CRM. Uma função de frete realmente quebrada foi corrigida no Supabase compartilhado. Código dos apps e do Printer permanece local, sem push/deploy desta auditoria.

O ecossistema tem regras financeiras e de pedidos concentradas no PostgreSQL e módulos úteis nos clientes; não é necessário substituí-lo por uma arquitetura nova. O risco principal é a combinação de contratos copiados, migrações compartilhadas, checkouts desatualizados e testes que nem sempre exercitam o runtime real. A auditoria eliminou falsos positivos; não certifica toda operação de produção nem garante ausência de outros defeitos.

## Relatórios e fontes

- [ZeloPDV](2026-09-04-zelopdv.md).
- [ZeloChat](C:/Users/Vinicius/orca/zelochat/docs/audits/2026-09-04-zelochat.md).
- [ZeloMenu](C:/Users/Vinicius/orca/zelomenu/docs/audits/2026-09-04-zelomenu.md).
- [ZeloPrinter](C:/Users/Vinicius/Documents/code/zeloprinter/docs/audits/2026-09-04-zeloprinter.md).
- [Performance: laboratório, Dokploy, banco e PostHog](2026-09-04-performance.md).
- [Integração e UX operacional](2026-09-04-integracao.md).

Os relatórios individuais contêm arquivos, comandos, testes e justificativas. Os IDs abaixo agrupam causas relacionadas; não se infla contagem tratando cada assert ou cada advisory como bug independente.

## Escopo efetivamente executado

| Dimensão | Trabalho realizado | Limite |
| --- | --- | --- |
| Código/arquitetura | Inventário dos4 repos, entrypoints, domínio, caches, APIs, jobs, Docker/CI, dependências, SQL e docs | Leitura priorizada por risco nos repos grandes, integral no Printer pequeno; sem alegação de entendimento de cada linha |
| Correção | Patches locais, regressões antes/depois e revisão entre agentes | Sem refatoração cosmética/rebrand |
| Banco live | CLI autenticada primeiro; funções, ACL/RLS, ledger, lint e estatísticas | Sem carga/write de negócio; advisors via conector só após CLI falhar nessa operação |
| Infraestrutura | Dokploy real no navegador do usuário, versão publicada, CPU/RSS, deploys e logs | Snapshot curto; sem restart/deploy/carga |
| Produto/analytics | PostHog real e jornadas locais Menu mobile/desktop | Tracking público recente; não mede caixa interno e não foi habilitada coleta nova |
| Runtime nativo | Build/publish, HTTP Kestrel real, concorrência, seleção fake, paginação em bitmap, benchmark .NET8 | Sem papel/térmica/instalador real |

Classificação usada: **comprovado** por repro/código inequívoco/live; **risco provável** por caminho plausível ainda sem ocorrência; **hipótese** quando faltam trace/amostras; **decisão aceitável** quando o tradeoff é explícito. Severidade reflete impacto e condições descritas, não frequência inventada.

## Lista de bugs reproduzidos e corrigidos

| Grupo | Antes | Depois / evidência |
| --- | --- | --- |
| PDV P01–P06 | Catálogo de outra conta, dados antigos em erro/vazio, replay sem owner, chave legacy volátil, erro SQL virando venda offline, cache Workbox autenticado | Isolamento/rollback/concorrência no IndexedDB, chave persistida, erro confirmado respeitado e cache só público |
| PDV P08–P09 | Flag de Acessos descartada; cancelamento admin mantinha extensão ativa | Update persiste flag e limpa exceção de prazo; guard e adapter testados |
| PDV P10 | Salvar regra JSON de frete falhava com erro SQL 42883 | Tipo local JSONB corrigido; aplicado live, lint correspondente resolvido, ACL preservada |
| PDV P11–P12 | Testes quebravam por calendário e check admin não encontrava configuração | Fixtures com data explícita e jsconfig existente; sem afrouxar regra de negócio |
| Chat CRM | Cinco parâmetros enviados a RPC de três; resposta pessoaId lida com outro nome | Contrato corrigido; erro confirmado nos logs reais; testes HTTP adapter + conflito sem associação |
| Chat performance | Login/landing importavam painel inteiro | Grafo inicial JS −35,1%, gzip −34,0% sobre a mesma base |
| Menu M01–M02 | Endpoint público aceitava canal interno; estoque de complementos subcontado | Context runtime validado e demanda agregada por produto/quantidade. Estoque já foi resolvido também upstream; reconciliar ao publicar |
| Menu M03–M04 | Raiz sem env runtime e API inexistente respondendo HTML 200 | HTML injetado/no-store e JSON 404; testes HTTP reais locais |
| Menu M05–M07 | Push aceitava destinos arbitrários, coordenadas null viravam zero, falha do diretório parecia vazio | Allowlist no registro/envio + timeout; parsing e propagação de erro corrigidos; transportes simulados |
| Menu execução/testes | Start Node direto em TS não resolvia imports; testes superficiais/seletores antigos | Start com loader adequado, fixtures de fronteira explícitas e testes de serviço real |
| Menu foto publicada | Upload/remoção de um rascunho apagava imagem que ainda estava referenciada no banco | Cleanup só após confirmação do save; falha mantém antiga e upload para retry. Fechar modal não altera Storage; regressões unit e navegador |
| Printer pareamento | Parear Chat revogava PDV; token morto parecia conectado | Tokens independentes e validação; reinício/limite/revogação cobertos |
| Impressão nos 3 consumidores | Falha pós-POST tratada como aplicativo fechado; fallback/retry podia duplicar | Unknown explícito, deadline do corpo, dedupe preservado, segunda via com intenção nova; 400 legado coberto |
| Printer spool/dispositivo | Sem backpressure; impressora ausente virava outra; texto longo cortado | Executor limitado/serial, dedupe limitado, seleção estrita, paginação por caracteres medidos |
| Printer API/lifecycle | Limite chunked frágil, hash exposto, web podia desabilitar pareamento, startup falso, erro publish ignorado | Limites reais/validação, resposta pública, config protegida, recuperação de bind e checks de exit code |

O patch de retenção remove somente código que tentava apagar vendas sem confirmação; **não apaga vendas**. O patch de entrega substitui exclusivamente uma declaração de tipo da função existente. Não houve backfill de clientes, recálculo financeiro, criação de cobrança ou exclusão de índices.

## Melhorias de engenharia aplicadas

- Cache/transações e testes de persistência reais no PDV; callbacks não engolem assertions de prova de persistência.
- Contrato de impressão coordenado entre nativo, SDK ESM/browser, PDV e Chat; erros descrevem incerteza em português.
- Backpressure/dedup limitados, configuração atômica e logs rotativos no Printer; gates de teste/build/publish melhorados.
- Boundary lazy no Chat, sem nova biblioteca ou fragmentação artificial.
- `.dockerignore` no Menu, remoção de dependências órfãs Electron no Printer, patches de dependências auditados.
- Testes fracos corrigidos: calendário, mesa fictícia, UI que aceitava loading como sucesso, mocks com ramo morto e contratos RPC simulados divergentes.
- Documentação operacional corrigida e documentos históricos marcados/consolidados; links do vault não foram confundidos com duplicatas.

## Validação consolidada

| Projeto | Resultado observado |
| --- | --- |
| PDV | Após os patches finais de dependências: **984 testes passam**, três probes SQL ignorados; check 0/0; ledger107/107+59/59+38. Build termina EPERM no adapter após compilar client/SSR/PWA; admin check0 erros / 6 avisos |
| Chat | 120/120 arquivos de testes convencionais passam, dois probes de banco explicitamente pulados; build, lint e server typecheck verdes sobre e6c7ca4+patches |
| Menu | **466 unit passam / 49 arquivos**; frontend/server typecheck e build verdes; **E2E 40 passes / 4 skips**, fixtures locais e OAuth interceptado |
| Printer | 24 JS + 14 cenários nativos passam; build/publish self-contained/SDK verdes; npm/NuGet zero alertas; instalador Inno e papel não validados |

Não somar “arquivos” do Chat a “testes” dos outros produtos. Não atribuir ganho de runtime à queda do tempo de suíte. Falha de E2E por credencial ausente, skip de SQL e EPERM estão registrados como limites, não convertidos em sucesso.

### Dependências: resultado final

PDV/admin receberam Kit 2.70.3 e PostCSS 8.5.28; PDV DOMPurify 3.4.14,
Vite 6.4.3, Vitest 3.2.7 e ws 8.21.3; transitivas compatíveis foram atualizadas
com npm, incluindo tar 7.5.22. Fake-indexeddb 6.2.5 foi adicionado só para
testar persistência. Manifests e lockfiles foram revisados; não houve npm
audit fix --force nem edição manual de lockfile.

| Projeto | Entradas npm audit iniciais → finais | Residual |
| --- | --- | --- |
| PDV | 17 → **8**, críticos 2→0 | 6 low derivados de cookie,1 moderate adapter,1 high xlsx |
| Admin | 14 → **6** | 2 low cookie/Kit,3 moderate adapter/esbuild/Svelte,1 high Vite 5 |
| Menu | 12 → **0** | Sem advisory reportado no momento da consulta |
| Printer | 1 baixo → **0** | NuGet também sem pacote vulnerável reportado |

Os6 low do PDV incluem propagação do mesmo advisory de cookie pelos
dependentes; não são seis caminhos de exploração distintos. Kit atualizado
ainda exige cookie 0.6; callers first-party usam nomes/path/domínio constantes.
SheetJS 0.18.5 é usado em exportação (`excelReport.js`), sem XLSX.read encontrado;
o alerta não desaparece por isso. A correção requer mudar a distribuição para
o pacote publicado fora do npm e validar arquivos gerados, conforme a
[instalação oficial SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

**Prioridade alta residual:** adapter 5 afeta cache de rotas; corrigir exige
≥6.3.2. A [advisory oficial SvelteKit](https://github.com/sveltejs/kit/security/advisories/GHSA-9pq4-5hcf-288c)
descreve mitigação na Vercel, mas esta auditoria não confirmou sua configuração
no projeto. Upgrade major ficou pendente de preview/build completo; não é
“seguro por estar em devDependencies”. Vite 5/esbuild admin afetam o servidor
de desenvolvimento; o admin não deve expor esse servidor publicamente.

Rodada final pós-dependências: unit PDV 78,75 s (81,22s wall), check 13,8 s,
admin check 8,14 s, build PDV 51,96 s / admin 11,20 s com EPERM. Logs
`unit-patched`, `check-patched`, `admin-check-patched`, `build-patched` e
`admin-build-patched` em `.codex/audit-2026-09-04`; audits JSON preservados.

## Principais problemas ainda não corrigidos

| Prioridade | Problema / classificação | Justificativa e próximo passo |
| --- | --- | --- |
| P1 | Menu cupom fora da transação e CAS incompleto de frete — risco provável | Resolver no write-path canônico/reconciliação com teste PostgreSQL concorrente; fallback app-side cego pode piorar duplicidade/perda |
| P1 | Homologação física e distribuição Printer — limite confirmado | Dedup é volátil e spool não comprova papel. Precisa instalador assinado, Windows limpo, térmica USB/rede e fault tests |
| P1 | Build PDV/Admin e E2E transacional — ambiente/coverage | EPERM Windows e Docker indisponível; testar em CI/Linux e tenant descartável com credenciais de teste |
| P1 | Menu um commit local e 40 remotos divergentes — comprovado | Não reescrever commit local alheio. Reconciliar index/cart/testes e evitar reaplicar fix de estoque já upstream |
| P1 | RPC admin atualiza histórico por user_id; reativação não renova prazo — risco de comportamento | Definir semântica com teste de múltiplas assinaturas e data; não alterar cobrança histórica por suposição |
| P1 | Cadastro com INP p90 6,48s — sinal de campo, causa não provada | Capturar interação/long task e amostras; separar do tempo de analytics/referral antes da navegação |
| P1 | Resiliência websocket Chat — investigação incompleta | Primeira reprodução isolada foi interrompida pela revisão automática de segurança por possível risco cibernético; não foi repetida. Artefato temporário removido, nenhum patch desse domínio publicado; revisão defensiva convencional permanece pendente |
| P2 | Node 20 EOL, dev tooling no runtime Chat/Menu, shutdown sem drain coordenado — código confirmado | Migrar runtime com build/boot/stop Linux e fault tests. Não mudar só npm omit=dev: tsx atual depende disso |
| P2 | Caches sem teto/push fanout/automação sobreposta — risco de escala | Medir cardinalidade, tick duration, heap e queue age; implementar limites onde comprovados, sem novo broker por padrão |
| P2 | Dívida de dependências/ACLs/índices — apontamentos triados | Patches seguros aplicados; major adapter/admin e SheetJS pedem trilha própria de compatibilidade. Advisors não autorizam remoção cega de índice ou grant |
| P3 | Escala visual/fontes/bordas/layout — dívida de rebrand | Sem defeito operacional grave comprovado nesses alertas; preservado por instrução explícita |

## Próximos passos por impacto

1. Reconciliar o Menu com upstream preservando seu commit local; revisar diffs por grupo e executar gates na base que será publicada.
2. Publicar as correções CRM/offline/admin/HTML/impressão após build e smoke aplicáveis; confirmar desaparecimento do PGRST202 no Dokploy. A migração de frete já está aplicada, não reaplicar com outra versão.
3. Montar tenant PostgreSQL descartável e completar fault tests financeiros, pedidos/cupom/CAS e permissões de subusuário. Priorizar idempotência após commit com resposta perdida.
4. Homologar e distribuir Printer/SDKs/clientes juntos; validar pareamento de dois produtos, timeout, papel/driver e segunda via.
5. Atualizar imagens Node suportadas e introduzir drain de shutdown testado; observar queue age/heap/event-loop antes de separar processos.
6. Investigar INP do cadastro e medir jornada até primeira venda; manter analytics fora do caminho de sucesso comercial quando isso puder ser feito sem perder atribuição.
7. Tratar paginação, caches e advisories remanescentes com dados reais. Deixar estilo/identidade para o rebrand.

## Integridade e limitações

Consultas de navegador usaram a sessão indicada pelo usuário no Brave, incluindo Dokploy e PostHog. Não foram expostos segredos nos relatórios. Nenhuma mensagem foi enviada a terceiros, nenhum ambiente reiniciado, nenhum deploy disparado e nenhum cliente usado como carga sintética. As métricas têm instante, recorte e limites no relatório de performance.

Há alterações paralelas na mesma pasta PDV, especialmente apresentação de pedido; foram preservadas e separadas da autoria desta auditoria. A revisão final deve continuar respeitando essa separação ao criar commits. O estado local está melhorado, mas as pendências acima impedem chamá-lo de homologação completa de produção.
