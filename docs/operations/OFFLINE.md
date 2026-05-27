# Funcionamento offline do ZeloPDV

Este documento descreve o comportamento offline atual do ZeloPDV, com foco no módulo de frente de caixa (`/app`). Ele deve ser atualizado sempre que o fluxo de venda, estoque, caixa, fiado ou sincronização offline mudar.

## Resumo executivo

O offline atual é um modo de contingência para o frente de caixa já carregado no navegador. Ele permite registrar uma venda quando a conexão cai no momento de finalizar, salva essa venda no IndexedDB e tenta sincronizar depois pela RPC `criar_venda_completa`.

Não é um modo offline-first completo. A aplicação ainda depende de internet para autenticar/validar assinatura, carregar dados iniciais, abrir caixa, cadastrar/editar produtos, usar módulos de pedidos/mesas/cozinha e consultar relatórios.

## Funciona offline hoje

| Área | Funciona offline? | Observação |
| --- | --- | --- |
| Frente de caixa já aberto (`/app`) | Parcial | Precisa ter sido carregado online antes da queda. |
| Catálogo de produtos na sessão atual | Parcial | Produtos ficam em memória e também são gravados em IndexedDB quando carregados online. |
| Adicionar produtos à comanda | Sim, se os produtos já estavam carregados | Usa a lista local já carregada na tela. |
| Item avulso | Sim | Não depende de produto cadastrado nem de estoque. |
| Finalizar venda quando a RPC falha por conexão | Sim | A venda é salva em `vendas_pendentes` no IndexedDB. |
| Pagamento em dinheiro, pix, cartão e plataforma | Sim, com dados já carregados | O payload é salvo para sincronizar depois. Taxas de plataforma usam o snapshot disponível na tela. |
| Pagamento fiado | Parcial | Funciona se a pessoa já estiver selecionada/carregada antes da queda. Não cadastra nem busca pessoa offline. |
| Desconto, taxa de entrega e múltiplos pagamentos | Sim | Entram no mesmo payload offline da venda. |
| Sincronização ao voltar internet | Sim | O evento `online` chama `syncVendasPendentes(supabase)`. |
| Baixa de estoque na sincronização | Sim | A RPC aplica estoque de forma atômica no servidor quando a venda pendente sincroniza. |
| Débito de fiado na sincronização | Sim | O payload envia `fiados`, e a RPC aplica no servidor. |
| Preservar data da venda offline | Sim | `created_at` é preenchido com o horário original salvo no IndexedDB. |

## Não funciona offline hoje

| Área | Funciona offline? | Motivo |
| --- | --- | --- |
| Abrir a aplicação do zero sem internet | Não garantido | Autenticação, assinatura e service worker/cache de rotas ainda dependem de estado prévio e respostas cacheadas. |
| Validar assinatura sem internet | Não | `ensureActiveSubscription` consulta o estado de assinatura/perfil. |
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

| Store | Uso atual |
| --- | --- |
| `produtos` | Cache local dos produtos carregados no PDV. |
| `vendas_pendentes` | Fila de vendas offline aguardando sincronização. |
| `categorias` | Store legada/prevista, sem fluxo completo de cache no momento. |

## Garantias atuais

- A venda online e o replay offline usam o mesmo formato de payload.
- A RPC centraliza venda, itens, pagamentos, estoque, fiado e taxas de plataforma.
- A sincronização apaga do IndexedDB somente vendas que retornam `data.id`.
- Cada venda enviada pela RPC carrega `client_sale_id`, uma chave gerada no navegador para idempotência.
- Se a mesma venda for reenviada com o mesmo `client_sale_id`, a RPC retorna a venda existente e não baixa estoque nem lança fiado de novo.
- Erros de regra de negócio não são mais colocados na fila offline.
- Vendas pendentes antigas são removidas por `limparVendasAntigas(30)` como limpeza de segurança.

## Riscos conhecidos

- A idempotência depende da migration `offline_sales_idempotency_2026_05_12.sql` estar aplicada no Supabase. Sem ela, o payload já carrega `client_sale_id`, mas a proteção contra duplicidade no banco não existe.
- O estoque local não é decrementado imediatamente quando uma venda fica pendente offline. Isso evita mentir que o banco baixou, mas permite que a tela exiba estoque anterior até sincronizar.
- Se duas máquinas venderem offline o mesmo item, a primeira que sincronizar consome o estoque. A segunda pode falhar no replay se a RPC bloquear estoque insuficiente.
- O modo offline depende de a tela e os dados já estarem carregados antes da queda.
- A fila offline ainda não carrega `ownerUserId`/`id_operador` para o projeto de acessos. Isso está citado no planejamento de acessos e precisa ser endereçado antes de liberar subusuários com offline.

## Critérios para considerar offline-first completo

- Permitir abrir/reabrir o PDV sem internet depois de uma sessão válida.
- Cachear categorias, subcategorias, produtos, pessoas fiado, perfil da empresa e caixa aberto em IndexedDB.
- Ter indicador claro de status offline e quantidade de vendas pendentes.
- Exibir no PDV quantas vendas estão pendentes de sincronização e quais falharam no replay.
- Ter baixa local otimista de estoque pendente, com reconciliação no sync.
- Persistir contexto de operador/empresa dona no payload offline.
- Cobrir com testes unitários e e2e os cenários de queda antes, durante e depois da RPC.
