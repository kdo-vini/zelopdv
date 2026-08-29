# Funcionamento offline do ZeloPDV

Este documento descreve o comportamento offline atual do ZeloPDV, com foco no módulo de frente de caixa (`/app`). Ele deve ser atualizado sempre que o fluxo de venda, estoque, caixa, fiado, gate de assinatura ou sincronização offline mudar. Espelho no vault: `pdvObsidian/OFFLINE.md`.

## Resumo executivo

O payload offline preserva `forma_pagamento` como texto e, portanto, aceita o
ID nativo `vale_refeicao` sem mudança de versão do Dexie. A fila e o replay
usam o mesmo contrato de venda única ou múltipla; a separação no relatório e o
snapshot `caixa_fechamentos.totais_pagamento` acontecem quando a venda já foi
confirmada e o caixa é fechado online.

O frente de caixa (`/app`) opera em modo **offline-first na leitura e online-confirm na escrita**. Ele renderiza catálogo, categorias e estoque a partir de um cache persistente (IndexedDB), registra a venda mesmo sem rede e sincroniza depois pela RPC atômica `criar_venda_completa`. O gate de assinatura tolera queda de rede reusando o último entitlement validado, então recarregar a página offline não expulsa mais o operador (janela de carência de 7 dias).

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
| Sincronização ao voltar internet | Sim | O evento `online` chama `syncVendasPendentes(supabase)`. |
| Baixa de estoque na sincronização | Sim | A RPC aplica estoque de forma atômica no servidor quando a venda pendente sincroniza. |
| Débito de fiado na sincronização | Sim | O payload envia `fiados`; após a migration de razão auditável, a venda também gera o lançamento de débito idempotente no extrato. |
| Preservar data da venda offline | Sim | `created_at` é preenchido com o horário original salvo no IndexedDB. |

## Não funciona offline hoje

| Área | Funciona offline? | Motivo |
| --- | --- | --- |
| Abrir a aplicação pela primeira vez sem internet | Não | Sem snapshot prévio, o gate precisa validar online ao menos uma vez; o service worker/cache de rotas também depende de estado prévio. |
| Reabrir/recarregar o PDV offline após sessão válida | Sim (≤ 7 dias) | `ensureActiveSubscription` cai no snapshot de entitlement quando a falha é de rede. Após a carência, exige rede. |
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
- Cada venda enviada pela RPC carrega `client_sale_id`, uma chave gerada no navegador para idempotência.
- Se a mesma venda for reenviada com o mesmo `client_sale_id`, a RPC retorna a venda existente e não baixa estoque nem lança fiado nem cria evento de extrato de novo.
- Recebimentos de fiado continuam online: exigem a RPC atômica para manter saldo, extrato e suprimento de caixa consistentes.
- Erros de regra de negócio não são mais colocados na fila offline.
- Vendas pendentes antigas são removidas por `limparVendasAntigas(30)` como limpeza de segurança.

## Decisões aceitas (tradeoffs)

Registradas em `TRADEOFFS.md`:

- **TA-OFF-01** — gate de assinatura reusa o último entitlement validado por até 7 dias em falha de rede. Custo: assinatura cancelada acessível offline dentro da carência. Não é bypass eterno (snapshot só nasce de validação positiva; negativo confirmado redireciona).
- **TA-OFF-02** — venda offline não bloqueia por estoque; a baixa e a checagem ficam para o sync. Oversell possível com múltiplos caixas; tolerável para um caixa por loja.

## Riscos conhecidos

- A idempotência depende da migration `offline_sales_idempotency_2026_05_12.sql` estar aplicada no Supabase. Sem ela, o payload já carrega `client_sale_id`, mas a proteção contra duplicidade no banco não existe.
- O estoque local não é decrementado imediatamente quando uma venda fica pendente offline. Isso evita mentir que o banco baixou, mas permite que a tela exiba estoque anterior até sincronizar.
- Se duas máquinas venderem offline o mesmo item, a primeira que sincronizar consome o estoque. A segunda pode falhar no replay se a RPC bloquear estoque insuficiente.
- O snapshot de entitlement é por dispositivo/navegador (localStorage); limpar dados do navegador zera a carência offline e exige nova validação online.
- A fila offline Dexie ja carrega `ownerUserId` e `operatorUserId`, e o replay injeta `operador_id` quando necessario. Isso reduz o risco para subusuarios, mas o suporte offline continua restrito basicamente ao fluxo de venda no PDV.

## Critérios para considerar offline-first completo

Feito nesta iteração (2026-06-02):

- [x] Reabrir/recarregar o PDV sem internet depois de uma sessão válida (gate tolerante, carência de 7 dias).
- [x] Cachear categorias, subcategorias e produtos (com estoque) em IndexedDB e **lê-los** no cold-start.
- [x] Indicador de vendas pendentes no PDV + botão de sincronizar + retry periódico.

Pendente:

- [ ] Cachear pessoas (fiado), perfil da empresa e caixa aberto em IndexedDB.
- [ ] Exibir quais vendas falharam no replay (hoje mostra só a contagem de pendentes).
- [ ] Baixa local otimista de estoque pendente, com reconciliação no sync.
- [ ] Cobrir com testes e2e os cenários de queda antes, durante e depois da RPC e de cold-start offline.
- [ ] Avaliar pré-cache do app-shell (PWA) para abrir do zero sem rede.
