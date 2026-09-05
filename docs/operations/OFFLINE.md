# Funcionamento offline do ZeloPDV

## Pedidos manuais — implementação local em 2026-09-05

`/app/pedidos` possui **Criar pedido**, usando catálogo local e o mesmo modal
de montáveis/pizzas da frente de caixa. Nome, telefone, endereço, pagamento,
data e horário são opcionais. Data/hora iniciam pelo relógio local e indicam
previsão de entrega/retirada; não reescrevem a data financeira. Frete é manual
para entrega; total soma produtos/montagem e frete. Fiado não é oferecido neste
formulário porque o fechamento atual não coleta vínculo de cliente.

O rascunho pertence à loja/operador. Criar grava `order.create` em IndexedDB
e limpa o rascunho na mesma transação; só depois informa salvamento. A chave
permanece estável em falhas/reenvios. Pedidos locais aparecem na fila com
**Salvo neste aparelho**, sobrevivem a reload e entram no motor canônico como
`source=manual`/`pending_review` após sincronização. A resposta remota vincula
o ID local ao remoto sem duplicar e a próxima leitura não ressuscita pedidos
já concluídos. Preço/configuração divergentes ficam na central de conferência;
pizzas utilizam a revisão histórica validada.

A preparação baixa também a fila de pedidos. Navegação lateral/mobile usa
permissões e add-ons validados em cache para titular e subusuário, inclusive
ZeloMenu e Mesas. O aparelho precisa ser preparado com conexão antes do uso
offline. Somente dados já baixados ou criados no próprio aparelho podem ser
consultados sem rede. **Aceite, avanço de preparo, cancelamento, fechamento e
recebimento de pedidos de outros aparelhos continuam exigindo conexão.**
Frente de caixa, Mesas e Caixa mantêm o protocolo offline existente.

Rollout: a migration `20260905210000_manual_offline_orders.sql` já foi aplicada
no projeto Supabase vinculado e registrada pelo CLI; ainda é necessário publicar
o cliente e atualizar a preparação dos aparelhos. A criação exige `pedidos.acessar`
e `pedidos.receber`, entitlement ZeloMenu e dispositivo registrado, com
revalidação no replay. Validação e limites do build em [CURRENT](../CURRENT.md).

Verificação: `node tests/browser/offline-shell/run.mjs --checkout --orders
--mesas --cash` passou com SW real em 390/1280 px. O teste confirma produto
montável, frete, dados opcionais, reload da mesma intenção e navegação por
links; a rodada final `--checkout --orders` também verifica cabeçalho/rodapé
contidos no modal durante scroll. PGlite verifica RPC, permissões, preços,
pizza histórica e idempotência sem utilizar pedidos de clientes.

## Protocolo v1 — implementação local em 2026-09-05

**Status: implementação e validação em andamento no checkout; não publicado.**
O diagnóstico abaixo é histórico. O protocolo novo exige a migration
`20260905152642_offline_operation_protocol.sql`, servidor compatível e preparação
explícita do aparelho. Não considerar um cliente antigo automaticamente migrado.

### Fluxo operacional

- A confirmação de venda depende do commit IndexedDB, antes de qualquer envio.
  Intenção, chave, rascunho e projeção são persistidos por loja/operador; a
  transação com erro não pode anunciar venda salva. Referência `LOCAL-*` não é
  número de venda confirmado pelo servidor.
- Catálogo, modificadores/pizzas, categorias, pessoas para fiado, recibo, turno
  e Mesas são preparados com internet. O botão de preparação solicita
  persistência, testa escrita e carrega os dados; falha deixa a preparação
  incompleta. O indicador exige também Service Worker controlando a página.
- A autorização local tem validade de sete dias. Token ausente/expirado impede
  sincronizar, mas não apaga os lançamentos nem revoga sozinho o contexto local.
  Login/logout e troca de loja não podem reaproveitar snapshots de outra conta.
  Consultas de acesso/assinatura têm prazo de 3 s, inclusive quando o navegador
  ainda informa conexão. Resultado tardio fica sem efeito; negativas
  confirmadas não são tratadas como simples oscilação.
- Apenas o aparelho principal abre, movimenta e fecha caixa. Todos os aparelhos
  autorizados podem vender e operar Mesas; sem rede não há visão instantânea
  dos lançamentos dos outros aparelhos. Fechamento local é provisório.
- Fila global com leases entre abas, dependências, duas entidades independentes
  em paralelo, prazo de envio e backoff com jitter. Resposta perdida repete a
  mesma intenção; conflito e autenticação exigem ações distintas.
- O servidor usa contexto autenticado, recibo de operação, locks e transação
  única. Fechamentos online também usam a fronteira atômica, sem sequência de
  inserts no navegador. Replay de venda recebida permite estoque negativo com
  divergência registrada; não descarta receita por saldo de estoque posterior.
- Pagamentos parciais mantêm o turno original, inclusive após a comanda fechar
  em outro turno. Vendas tardias geram ajuste separado; o fechamento original
  não é reescrito silenciosamente.
- Central por loja lista pendências e permite recuperação criptografada por
  senha, preservando IDs e origem. Recuperação de outro operador exige
  conferência do titular. Conflitos nunca são descartados automaticamente.
  A conferência permite repetir após correção, reconhecer registro repetido,
  registrar consumo adicional como venda avulsa auditada ou registrar uma
  devolução **já realizada**. Não executa devolução em banco/adquirente.
  Recebimento sem turno identificável e múltiplos clientes fiado ambíguos
  permanecem para investigação; a central não inventa a atribuição financeira.
  Ajustes posteriores e divergências de estoque ficam consultáveis pelo titular
  mesmo depois de a fila esvaziar (50 registros recentes de cada tipo).
- Aviso discreto por episódio, com intervalo mínimo de dois minutos. A perda
  de conexão não abre modal. Falha de gravação é erro explícito. Atualização de
  PWA fica bloqueada durante escrita, sincronização, pendências ou falta de rede.

### Persistência: mensagem correta ao cliente

Fechar normalmente e reabrir preserva gravações confirmadas em IndexedDB.
Isso não equivale a cópia remota: limpar dados do site, remover o aplicativo,
modo privado, expulsão pelo navegador ou defeito físico podem causar perda.
`navigator.storage.persist()` reduz expulsão automática quando concedido;
não impede exclusão deliberada. Não prometer sobrevivência absoluta a falha
de energia. [Referência do navegador](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

### Validação e liberação

- Teste de 1.000 intenções duráveis, duas instâncias de sync e 50 respostas
  perdidas após commit: 1.000 confirmações, 1.000 efeitos no servidor simulado,
  nenhuma duplicação. Usa Dexie/fake-indexeddb; não é medição de carga real.
- Harness do build com Service Worker real testa `/app`, `/app/mesas` e
  `/gestao/caixa` sem rede em 1280 e 390 px. Checkout real preparado e retomada
  são testados com dados sintéticos; nenhuma venda de cliente é enviada.
- Matriz PostgreSQL descartável cobre atomicidade, idempotência, fiado,
  divergência de estoque e atribuição de turno. O fallback PGlite executa SQL
  real em sessão única; não substitui teste de concorrência multi-sessão.
- Resultados finais, comandos e limitações em [CURRENT](../CURRENT.md) e no
  [plano de execução](../superpowers/plans/2026-09-05-offline-continuity.md).

Reproduzir SQL sem acesso remoto (PowerShell):

```powershell
node supabase/verification/offline-pglite.mjs (Join-Path $env:TEMP 'zelo-offline-pglite/node_modules/@electric-sql/pglite')
```

O runner exige o pacote externo `@electric-sql/pglite@0.3.14`, instalado em
diretório temporário; não adiciona dependências ao produto. Executa a matriz
offline e a regressão existente de pizza; exclui seed específico de cliente
e policy de Storage sem relação financeira.

Publicar somente após migration e backend compatíveis, validar uma loja piloto
e preparar cada aparelho. Antes de expandir: Android/iPhone físicos, impressão,
turno prolongado, queda de energia e concorrência PostgreSQL multi-sessão. LAN
e transmissão de cozinha entre aparelhos sem internet continuam fora da fase 1.
Rollback desabilita novas entradas no protocolo; não deve apagar IndexedDB,
recibos, migrations ou as filas já existentes.

## Histórico anterior ao protocolo v1

**As seções seguintes preservam o diagnóstico e os contratos legados. Não são
a descrição vigente da implementação acima.**

Este documento descreve o comportamento offline atual do ZeloPDV, com foco no módulo de frente de caixa (`/app`). Ele deve ser atualizado sempre que o fluxo de venda, estoque, caixa, fiado, gate de assinatura ou sincronização offline mudar. Espelho no vault: `pdvObsidian/OFFLINE.md`.

## Resumo executivo

### Auditoria de operação sob queda de rede — 2026-09-05

**Veredito: frente de caixa tem contingência parcial; Mesas não tem operação
offline. O conjunto ainda não atende continuidade de atendimento sob pressão.**
Esta rodada é diagnóstico solicitado antes de implementar melhorias. Só foram
adicionados probes de teste e documentação; nenhuma venda real, migration ou
publicação foi executada. Há edições simultâneas de montagem/pizza no workspace,
fora desta análise. Resultados não certificam essas edições nem produção.

#### Evidência executada

- 70 testes existentes passam: `offlineDb`, persistência e recuperação,
  `offlineEntitlement`, `guards.offline`, `finance.saleOps` e `pdvCache`.
- `npx vitest run tests/offline.audit.test.js`: três reproduções passam ao
  **confirmar limitações**, não ao aprovar o comportamento. O harness extrai
  funções originais pelo AST Svelte e executa seus corpos com respostas de rede
  simuladas. Não é um teste da interface nem do PostgreSQL.
  1. `verificarCaixaAberto`: erro de rede zera ID, marca caixa fechado e abre
     modal mesmo partindo de um caixa aberto conhecido.
  2. `abrirMesa`: falha de rede impede entrar na comanda existente.
  3. `fecharMesa`: após sucesso de venda/itens e falha nos pagamentos, repetir
     produz duas inserções de venda sem `client_sale_id`. Banco simulado;
     comprova reenvio inseguro do cliente, não duplicação observada em produção.
- `node tests/browser/offline/run.mjs`: dois cenários passam em Chromium,
  desktop e Pixel 5 **emulado**. Módulo real `offlineDb`, IndexedDB real,
  `context.setOffline(true)`: catálogo e venda persistem sem rede; fechar/reabrir
  o banco preserva dados; recarregar o harness depois de reconectar também.
  Replay com resposta perdida preserva pendência e chave; confirmação posterior
  remove a linha. RPC simulada, conexões externas bloqueadas.
- Não executado: jornada autenticada completa, reload do aplicativo real sem
  rede, build novo, banco de homologação, Android/iPhone físico, impressão em
  papel e teste prolongado de carga. Não confundir este probe de armazenamento
  com aprovação de PWA, autenticação, SQL ou experiência móvel.

#### Achados e prioridade

| Prioridade | Achado | Consequência operacional / evidência |
| --- | --- | --- |
| P0 | Fechamento de Mesa sem transação única e sem intenção idempotente | Queda entre venda, itens, pagamentos, fiado e fechamento deixa resultado parcial; retry pode reenviar venda. Reprodução acima; `mesas/[id]/+page.svelte`, `fecharMesa`. Alguns updates finais nem verificam `error`. |
| P0 | Retomada do caixa depende de consulta online | Recarregar pode mostrar produtos mas bloquear atendimento com modal de abrir caixa. `app/+page.svelte`, `verificarCaixaAberto`; reproduzido. Entitlement em cache não resolve isso. |
| P1 | Mesas não possui réplica local nem fila de operações | Abrir, lançar/alterar item, parcial, transferir e fechar dependem do servidor. `offlineDb` só tem catálogo e fila de vendas de PDV. Gate `hasMesasAddon` também consulta rede sem snapshot do add-on. |
| P1 | PDV salva localmente somente depois da falha da RPC | Consulta de estoque e RPC são aguardadas antes da persistência, sem deadline explícito nessas chamadas. Rede que não responde pode prender o atendimento; fechar processo antes do catch pode perder a intenção/chave. Chave do carrinho não é persistida antes do primeiro envio. |
| P1 | Confirmação online sem validar `data.id` | O caminho online da tela aceita resposta sem ID, diferente do replay. Falha de contrato não deve limpar ou concluir a intenção. Achado de leitura, ainda sem reprodução da tela. |
| P1 | Estoque local e saldo não incorporam pendências | Mesmo dispositivo pode continuar vendendo contra snapshot antigo. `atualizarSaldoCaixa` consulta servidor; não há projeção das vendas locais. Conflito posterior precisa de resolução operacional, não retry infinito. |
| P1 | Fila sem classificação durável dos erros | Só `aguardando` + contagem; falha de rede, acesso revogado e conflito de estoque não têm tratamento distinto na tela. Retry é sequencial, sem deadline/backoff por registro e ligado ao ciclo da página `/app`. |
| P1 | Bootstrap offline não certificado | SW gerado localmente em 2026-09-04 usa `NavigationRoute(createHandlerBoundToURL('/'))`; o plugin instalado adota `/` por padrão. Não há prova de que esse fallback público hidrata corretamente `/app` e Mesas. Precisa testar build servido, incluindo reload e abertura direta. |
| P2 | Dados auxiliares incompletos | Pessoas para fiado, perfil de recibo, plataformas/tabelas de preço, caixa e permissões não formam snapshot operacional persistente coerente. Permissões usam cache de sessão separado, limpo em eventos de autenticação; validar remount e sessão expirada. |
| P2 | Rascunho e armazenamento sem proteção operacional completa | `zelo_comanda` usa sessionStorage, sem escopo de loja na chave e sem chave persistente da intenção; cache de catálogo substitui a loja anterior. Não há verificação de persistência/quota no módulo offline auditado. |
| P2 | Reconciliação altera contexto financeiro | RPC usa caixa original somente se ainda aberto, senão caixa atual/null; grava ator autenticado do replay. Preservar separadamente turno de origem, operador original e sincronizador com autorização verificável. Não confiar cegamente no operador declarado pelo cliente. |

O banner global atual diz “Você está offline. Verifique sua conexão.”; o checkout
mostra “Venda realizada com sucesso!” para ambas as situações, e o número remoto
ainda não existe no offline. Isso informa pouco sobre o que foi salvo e o que
continua disponível. A fila segura é uma boa base, mas não resolve a jornada.

#### Proposta de evolução, na ordem recomendada

1. **Integridade de Mesas antes de habilitar replay.** Criar comando atômico de
   fechamento, com chave estável, lock/revisão de comanda e retorno idempotente.
   Venda, itens, pagamentos parciais, vínculos, fiado e status devem confirmar
   juntos. Estoque já reservado não pode ser baixado duas vezes. Repetições de
   adicionar/remover item também precisam de ID de operação; repetir delta sem
   dedupe é perigoso. Testar a migration em PostgreSQL descartável com RBAC.
2. **PDV com confirmação local durável.** Gravar intenção e chave em IndexedDB
   antes de enviar; confirmar na interface somente após commit local. Projetar
   carrinho, saldo e estoque pendente a partir desse registro; sincronizar em
   segundo plano. Erro de negócio confirmado recebe estado próprio e resolução,
   não desaparece nem é disfarçado como venda remota confirmada. Recuperar caixa,
   catálogo, recibo e capacidades do snapshot da mesma loja/operador.
3. **Arranque e retomada completos.** Shell operacional cacheado e testado,
   snapshot versionado com validade, política de sessão offline distinta da
   renovação do token remoto, tratamento de quota e persistência. Inicializar pela
   leitura local e atualizar depois, sem esperar falha da rede. Não autoatualizar
   a aplicação em meio a atendimento/pendências. Coordenar o sync entre abas e
   cancelar a execução se identidade/tenant mudar durante a fila.
4. **Mesas locais com reconciliação explícita.** Guardar mapa, comandas, itens,
   pagamentos e comandos ordenados por comanda. IDs locais estáveis, versões,
   dedupe, dependências e conflitos visíveis. Começar com responsabilidade por
   mesa/dispositivo; pagamento/transferência/fechamento concorrente nunca deve
   usar “última gravação vence”. Preservar todos os lançamentos em conflito.
5. **Experiência e homologação.** Indicador discreto “Operando offline · 3 vendas
   salvas neste aparelho”; confirmação com referência local estável; reconexão
   silenciosa; “Tudo sincronizado” após confirmação. Central com detalhes,
   última tentativa, causa e ação para pendências que exigem conferência.
   O operador continua vendendo enquanto o sync roda. Mostrar “Pronto para
   trabalhar offline” só após validar shell, snapshot e gravação local.

Armazenamento persistente reduz expulsão automática, mas não torna dados locais
imunes a limpeza pelo usuário ou falha do dispositivo; medir espaço disponível e
oferecer recuperação segura das pendências da própria loja. Referências:
[MDN — quotas e remoção](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
e [Vite PWA — SvelteKit](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html).

**Vários aparelhos e cozinha:** se todos perdem internet, mas continuam na mesma
rede local, um coordenador local pode permitir que caixa, garçons e cozinha se
comuniquem. Isso exige serviço acessível na LAN, disponibilidade, autenticação e
compatibilidade dos navegadores; é uma fase arquitetural, não recurso já existente.
Se os aparelhos também perdem comunicação entre si, não conseguem conhecer os
lançamentos uns dos outros em tempo real. Cada um pode continuar localmente, mas
é necessário assumir responsabilidade por mesa e reconciliar depois. O fluxo
HTTP de cozinha atual não entrega novos pedidos offline.

#### Critérios de aceite propostos (ainda não atingidos)

- Catálogo e caixa disponíveis após reload e reabertura offline com preparação
  prévia; login inicial continua exigindo conexão.
- Feedback local de inclusão/checkout com meta p95 <= 300 ms em dispositivos
  de referência; medir em aparelho real, não apenas computador emulado.
- Lote de 1.000 vendas com queda antes do envio, após commit e antes da resposta:
  zero perda e uma única venda/baixa/débito por intenção após reconciliação.
- Reiniciar aba/navegador durante commit, quota cheia, cache antigo, migração de
  IndexedDB, atualização de SW, rede lenta sem resposta e falhas 401/403/5xx.
- Mesas: abrir, modificar, dividir/parcial, transferir, cancelar, fechar e enviar
  cozinha; dois dispositivos disputando a mesma comanda; nenhum pagamento perdido
  ou duplicado. As indisponibilidades de comunicação devem aparecer claramente.
- Estoque simples/compartilhado/componentes, desconto, múltiplos pagamentos, fiado,
  preços, caixa fechado remotamente e operador revogado/trocado durante replay.
- Chrome/Edge desktop, Android real e Safari/PWA iPhone real; suspensão de tela,
  retomada, impressão local e turno de 8 horas com oscilações.

Comandos desta rodada:

```powershell
npx vitest run tests/offlineDb.test.js tests/offlineDb.persistence.test.js tests/offlineDb.recovery.test.js tests/offlineEntitlement.test.js tests/guards.offline.test.js tests/finance.saleOps.test.js tests/pdvCache.test.js
npx vitest run tests/offline.audit.test.js
node tests/browser/offline/run.mjs
```

Desde 2026-09-04, catálogo/categorias/subcategorias são persistidos com owner
e só podem ser lidos pelo mesmo titular. Linhas antigas sem dono exigem
atualização online; uma resposta online vazia substitui o cache. O replay
exige contexto de owner e preserva registros desconhecidos/outras contas.
Não há exclusão automática de vendas por idade. O service worker cacheia
somente objetos públicos de storage, nunca REST/Auth ou objetos privados.

O carregador `pdvCache` lê produtos, categorias, subcategorias e complementos
em páginas de 500, com desempate pela chave primária e filtros explícitos por
owner. Vínculos são consultados em lotes de até 100 IDs. Só entrega o catálogo
completo à tela/persistência: falha em qualquer página preserva o snapshot
anterior; troca de conta cancela a leitura, inclusive se voltar à primeira
conta antes da resposta. Isso remove o corte implícito em 1000 linhas. As
páginas não são uma transação de leitura do banco; uma edição simultânea no
catálogo ainda pode exigir atualização posterior.

### Recuperar pendências antigas sem titular

A frente de caixa mostra um aviso agregado somente para o titular. A ação
**Verificar pendências antigas** consulta, pela sessão autenticada e RLS, os
caixas referenciados pelas vendas. Só atribui o owner quando o caixa pertence
à conta atual, o login continua sendo o mesmo e o registro local não mudou
durante a consulta. Não altera payload, operador ou chave de idempotência;
não envia nem exclui a venda nessa operação. Depois, o replay normal pode
sincronizar as pendências comprovadas.

Registros sem caixa verificável, com owner conflitante ou de outra loja ficam
intactos. O aviso orienta procurar suporte no mesmo computador e preservar os
dados do navegador. Não há exportação de conteúdo de outras contas nem botão
para assumir todas as vendas como pertencentes à conta atual.

O payload offline preserva `forma_pagamento` como texto e, portanto, aceita o
ID nativo `vale_refeicao` sem mudança de versão do Dexie. A fila e o replay
usam o mesmo contrato de venda única ou múltipla; a separação no relatório e o
snapshot `caixa_fechamentos.totais_pagamento` acontecem quando a venda já foi
confirmada e o caixa é fechado online.

O frente de caixa (`/app`) usa cache em memória e fallback IndexedDB na leitura,
com tentativa online antes da escrita local. Registra vendas quando a tentativa
remota falha por conexão e sincroniza depois pela RPC `criar_venda_completa`.
O gate de assinatura reusa entitlement por até 7 dias, mas isso não garante
retomada da operação: caixa aberto, sessão e shell também precisam funcionar
sem rede, conforme os achados de 2026-09-05 acima.

Não é um modo offline-first completo. A aplicação ainda depende de internet para autenticar/validar assinatura na primeira vez, login, abrir/fechar caixa, cadastrar/editar produtos, usar módulos de pedidos/mesas/cozinha e consultar relatórios.

## Mudanças 2026-06-02 (motivadas pelo cliente Agreste Salgados)

A causa do "fica faltando produto offline" não era a fila de vendas (já estava robusta), e sim a leitura online-first e o gate de entrada que exigia rede. Três camadas:

1. **Gate tolerante a offline** — `ensureActiveSubscription` (`src/lib/guards.js`) distingue falha de rede (`src/lib/netStatus.js`) de negativo confirmado, e reusa o snapshot de entitlement (`src/lib/offlineEntitlement.js`, localStorage, carência de 7 dias). Negativo confirmado pelo servidor segue redirecionando.
2. **Leitura offline-first** — `carregarProdutos/Categorias/Subcategorias` em `src/routes/app/+page.svelte` caem no IndexedDB quando a rede falha. Antes o IndexedDB era escrito e nunca lido. Dexie subiu para **v5** (passa a persistir subcategorias).
3. **Robustez de sync** — retry periódico a cada 30s além do evento `online`, função única `tentarSincronizarPendentes`, e badge "N vendas a sincronizar" + botão manual no PDV.

## Funciona offline hoje

| Área | Funciona offline? | Observação |
| --- | --- | --- |
| Frente de caixa já aberto (`/app`) | Parcial | Precisa ter sido carregado online antes da queda. |
| Catálogo de produtos na sessão atual | Parcial | Produtos ficam em memória e também são gravados em IndexedDB quando carregados online. |
| Adicionar produtos à comanda | Sim, se os produtos já estavam carregados | Usa a lista local já carregada na tela. |
| Item avulso | Sim | Não depende de produto cadastrado nem de estoque. |
| Finalizar venda quando a RPC falha por conexão | Sim | A venda é salva em `vendas_pendentes` no IndexedDB. |
| Pagamento em dinheiro, pix, cartão, Vale-Refeição e plataforma | Sim, com dados já carregados | O payload é salvo para sincronizar depois. Vale usa o ID `vale_refeicao`; taxas de plataforma usam o snapshot disponível na tela. |
| Pagamento fiado | Parcial | Funciona se a pessoa já estiver selecionada/carregada antes da queda. Não cadastra nem busca pessoa offline. |
| Desconto, taxa de entrega e múltiplos pagamentos | Sim | Entram no mesmo payload offline da venda. |
| Sincronização ao voltar internet | Sim | O evento `online` chama o replay com contexto `{ ownerUserId, operatorUserId }`. |
| Baixa de estoque na sincronização | Sim | A RPC aplica estoque de forma atômica no servidor quando a venda pendente sincroniza. |
| Débito de fiado na sincronização | Sim | O payload envia `fiados`; após a migration de razão auditável, a venda também gera o lançamento de débito idempotente no extrato. |
| Preservar data da venda offline | Sim | `created_at` é preenchido com o horário original salvo no IndexedDB. |

## Não funciona offline hoje

| Área | Funciona offline? | Motivo |
| --- | --- | --- |
| Abrir a aplicação pela primeira vez sem internet | Não | Sem snapshot prévio, o gate precisa validar online ao menos uma vez; o service worker/cache de rotas também depende de estado prévio. |
| Reabrir/recarregar o PDV offline após sessão válida | Não garantido | O gate tem carência de 7 dias, mas a verificação de caixa falha fechado e o shell/renovação de sessão não estão certificados; ver auditoria 2026-09-05. |
| Login/logout | Não | Depende do Supabase Auth. |
| Abrir caixa | Não | O fluxo consulta e grava no Supabase. |
| Fechar caixa | Não | Depende de vendas, sangrias, suprimentos e persistência online. |
| Cadastrar/editar/excluir produtos, categorias e estoque | Não | Gestão é online. |
| Atualizar estoque local após venda offline | Não imediatamente | A baixa real acontece na sincronização. A tela pode continuar mostrando o estoque anterior até recarregar/sincronizar. |
| Bloqueio perfeito contra oversell offline | Não | Sem servidor no momento da venda, o estoque pode mudar em outro dispositivo. A RPC valida/aplica no sync. |
| Módulo de Pedidos (`/app/pedidos`) | Não | Criação, edição, cozinha e fechamento de pedidos dependem de Supabase em tempo real. |
| Módulo de Mesas | Não | Comandas, itens, pagamentos parciais, transferência e fechamento dependem de Supabase. |
| Cozinha/KDS | Não | Depende de polling/consulta online. |
| Relatórios | Não | Consultas e agregações vêm do banco. |
| Fiado: cadastrar pessoa ou buscar lista | Não | A lista de pessoas não é cacheada em IndexedDB. |
| Impressão com dados atualizados da empresa | Parcial | Usa dados já carregados; se não carregou antes da queda, pode faltar informação. |

## Fluxo técnico da venda offline

1. O caixa monta a comanda no `/app`.
2. Ao confirmar venda, o sistema monta o payload com `buildVendaPayload`.
3. Antes da RPC, tenta validar estoque com dados frescos do Supabase. Se essa consulta falhar por conexão, a validação é ignorada e a venda tenta seguir.
4. A tela chama `supabase.rpc('criar_venda_completa', { p_payload: payload })`.
5. Se a RPC falhar por erro de conexão/timeout, `shouldQueueVendaOffline` permite salvar no IndexedDB via `salvarVendaOffline`.
6. Se a RPC falhar por regra de negócio, permissão, FK, estoque insuficiente ou payload inválido, a venda não é enfileirada offline; o erro aparece no modal.
7. Quando a conexão volta, `handleSyncOnline` chama `syncVendasPendentes`.
8. Cada venda pendente é enviada novamente para a RPC atômica.
9. Se a RPC confirmar uma venda com `id`, o registro pendente é apagado do IndexedDB.
10. Após sincronizar, o frente de caixa invalida/recarrega produtos para refletir estoque atualizado.

## Tabelas IndexedDB

Banco local: `ZeloPDVDB`

Schema atual: **v5**.

| Store | Uso atual |
| --- | --- |
| `produtos` | Cache local do catálogo completo (inclui estoque e join de categoria). Lido no cold-start offline. |
| `categorias` | Cache de categorias para o filtro offline (passou a ser lido na v5). |
| `subcategorias` | Novo na v5 — cache de subcategorias para o filtro offline. |
| `vendas_pendentes` | Fila de vendas offline aguardando sincronização. |

O snapshot de entitlement do gate de assinatura vive em **localStorage** (`zelo_entitlement_snapshot`), não no IndexedDB.

## Garantias atuais

- A venda online e o replay offline usam o mesmo formato de payload.
- A RPC centraliza venda, itens, pagamentos, estoque, fiado e taxas de plataforma.
- A sincronização apaga do IndexedDB somente vendas que retornam `data.id`.
- O replay persiste `client_sale_id` antes de enviar; registros legados recebem a chave em transação Dexie para que abas concorrentes reutilizem a mesma intenção. Na primeira tentativa online do checkout, a chave ainda fica somente em memória até eventual fallback offline.
- Se a mesma venda for reenviada com o mesmo `client_sale_id`, a RPC retorna a venda existente e não baixa estoque nem lança fiado nem cria evento de extrato de novo.
- Recebimentos de fiado continuam online: exigem a RPC atômica para manter saldo, extrato e suprimento de caixa consistentes.
- Erros de regra de negócio não são mais colocados na fila offline.
- Vendas pendentes não são removidas por idade. Somente confirmação com `data.id` permite removê-las; suporte deve identificar o dono de registros legados sem owner antes de recuperá-los.

## Decisões aceitas (tradeoffs)

Registradas em `TRADEOFFS.md`:

- **TA-OFF-01** — gate de assinatura reusa o último entitlement validado por até 7 dias em falha de rede. Custo: assinatura cancelada acessível offline dentro da carência. Não é bypass eterno (snapshot só nasce de validação positiva; negativo confirmado redireciona).
- **TA-OFF-02** — venda offline não bloqueia por estoque; a baixa e a checagem ficam para o sync. Oversell possível com múltiplos caixas; tolerável para um caixa por loja.

## Riscos conhecidos

- A idempotência depende da RPC e do índice único por titular/client_sale_id.
  Ambos foram conferidos; a migration `20260905003227` acrescenta o lock
  compartilhado entre operadores e corrige o titular da venda. Não substituir
  a chave ao recuperar erro ou histórico que exige reconciliação.
- O estoque local não é decrementado imediatamente quando uma venda fica pendente offline. Isso evita mentir que o banco baixou, mas permite que a tela exiba estoque anterior até sincronizar.
- Se duas máquinas venderem offline o mesmo item, a primeira que sincronizar consome o estoque. A segunda pode falhar no replay se a RPC bloquear estoque insuficiente.
- O snapshot de entitlement é por dispositivo/navegador (localStorage); limpar dados do navegador zera a carência offline e exige nova validação online.
- A fila Dexie preserva `ownerUserId` e `operatorUserId` capturados localmente.
  O banco grava como ator da RPC quem está autenticado no replay; o operador
  declarado pelo payload não pode substituir essa autorização. O suporte
  offline continua restrito basicamente ao fluxo de venda no PDV.

## Critérios para considerar offline-first completo

Feito nesta iteração (2026-06-02):

- [ ] Reabrir/recarregar o PDV sem internet depois de uma sessão válida: gate tolerante implementado, mas jornada reaberta pela auditoria de 2026-09-05 por bloqueio na verificação do caixa e ausência de homologação do shell.
- [x] Cachear categorias, subcategorias e produtos (com estoque) em IndexedDB e **lê-los** no cold-start.
- [x] Indicador de vendas pendentes no PDV + botão de sincronizar + retry periódico.

Pendente:

- [ ] Cachear pessoas (fiado), perfil da empresa e caixa aberto em IndexedDB.
- [ ] Exibir quais vendas falharam no replay (hoje mostra só a contagem de pendentes).
- [ ] Baixa local otimista de estoque pendente, com reconciliação no sync.
- [ ] Cobrir com testes e2e os cenários de queda antes, durante e depois da RPC e de cold-start offline.
- [ ] Avaliar pré-cache do app-shell (PWA) para abrir do zero sem rede.
