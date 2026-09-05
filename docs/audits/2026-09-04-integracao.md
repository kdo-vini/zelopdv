# Integração e operação — Zelo — 2026-09-04
> Atualizado na rodada de correções de 2026-09-05 UTC. Este documento substitui o estado de pendências da primeira auditoria. Consulte a tabela de versões e os endpoints públicos antes de assumir que um artefato está em produção.

## Impressão PDV + Chat

PDV e Chat podem manter autorização simultânea no mesmo Printer. O segundo pareamento não invalida o primeiro. Tokens já publicados pelo 0.1.4 são preservados, até o limite de 50; atingir o limite é um erro explícito, sem descartar navegadores silenciosamente.

A impressão automática usa uma identidade comum: **owner da loja + zelo_orders.id + finalidade order_ticket**. empresa_perfil.id, ID de venda e ID do pedido legado não substituem esses campos. Os dois consumidores enviam o mesmo contrato ao Printer 0.2.0.

- **Preferência padrão: PDV**, alterável para Chat na configuração local.
- O canal secundário aguarda 1,5 segundo. Se o preferido chegar nessa janela, ele assume o trabalho. Se estiver ausente ou chegar depois do início, o secundário atende; o pedido continua sendo impresso uma vez.
- O diário em disco registra a reserva antes de chamar o spooler. Repetição pelo outro produto ou após reinício recupera o resultado, em vez de iniciar uma nova impressão.
- Falha explicitamente anterior ao spool pode usar a alternativa já recebida. Resultado incerto não autoriza retry nem fallback automático.
- **Segunda via é manual**, com uma nova intenção. Nenhuma mensagem de sucesso comprova que saiu papel.
- Consumidores novos recusam impressão automática em Printer sem a capability de coordenação. A mensagem orienta atualizar o agente; não simula conexão bem-sucedida.

O histórico permanece por sete dias. Há capacidade configurável localmente de 10 mil a 50 mil registros; lotação/corrupção bloqueiam novas impressões de forma explícita, sem apagar entradas válidas para esconder o problema. O diário guarda hashes e estado, sem conteúdo do pedido, telefone ou nome da impressora. A proteção vale para o mesmo agente/PC; dois agentes independentes em máquinas distintas não compartilham esse diário.

O /connect do 0.1.4 foi preservado na reconciliação. **Revogar navegadores** remove tokens e desabilita emissão automática por origem confiável; reativação só ocorre na tela local. Pareamento por código continua disponível. A página web não pode reativar essa autorização pelo endpoint de configuração.

## Origem única e publicação

| Produto | Origem do código | Artefato e conferência |
| --- | --- | --- |
| PDV e admin | kdo-vini/zelopdv, main | GitHub/Vercel; CI compila ambos outputs completos em Linux |
| Chat | kdo-vini/zelochat, main `dc52af487cc9999a905eb9262884110fbb2f6ed5` | Duas imagens do mesmo commit; /build-info.json no frontend e /api/version no backend conferidos |
| Menu | kdo-vini/zelomenu, master `4faa1f32f3275a2cf21b8d382e2a6e9b48a6ca44` | Uma imagem com frontend/backend compilados juntos; /api/health, x-app-version e 32 assets conferidos |
| Printer | kdo-vini/zeloprinter, main + tag de versão | CI Windows, instalador e SDK publicados na mesma release |

Os builds Chat/Menu derivam a versão do commit real, recusam override divergente e código de produção fora do commit. Normalização CRLF/LF é aceita como faz o Git; alteração real e arquivo novo continuam sendo recusados. Metadados no runtime não podem mascarar a origem do artefato. Os workflows verificam código e imagens antes de considerar seus gates concluídos; a verificação pós-deploy compara os endpoints e o bundle servido com o SHA esperado.

No Dokploy foi encontrado **um serviço ativo de Menu**, com domínio menu.zelopdv.com.br na porta 3101, sem volume de código e sem comando substituto. O arquivo legado zelomenu.yml estava vazio; não era uma segunda rota ativa. Imagens antigas sem uso não foram confundidas com containers servindo clientes.

No Chat, os nomes internos frontend/backend estão invertidos em relação aos nomes mostrados na UI. As rotas foram conferidas; não se renomeou serviço referenciado por configuração existente. O contexto de Dockerfile.frontend foi explicitado como ponto. O backend recebeu 60 segundos de stop grace para o drain de até 55 segundos. A publicação efetiva exige conferir os dois endpoints, não apenas um deploy verde.

O checkout Menu com um commit local e 40 remotos foi reconciliado por merge, preservando ambos. As sete migrations históricas do Menu foram movidas, sem alterar bytes, para supabase/history/conversation-ordering. Duas versões numéricas já pertenciam a migrations diferentes do PDV no ledger real. **Somente o PDV mantém o fluxo executável do banco compartilhado.** Não reaplicar aqueles arquivos nem reparar suas versões remotas como se fossem migrations do Menu.

## Contratos corrigidos

| Fronteira | Correção | Prova |
| --- | --- | --- |
| Cache e contas | Dono explícito; vazio autoritativo; erro de autorização não reusa cache; troca de conta descarta resposta antiga | IndexedDB e testes de memória |
| Venda offline | Chave persistida antes da RPC; exclusão só após ID confirmado | Retry e concorrência entre abas |
| Venda por operador | Titular resolvido no servidor, id_operador autenticado, RBAC antes de replay e lock por loja/chave | Matrizes de estoque/fiado e duas corridas titular/operador; inativo recusado e titular próprio preservado |
| Catálogo grande | Paginação e lotes IN por owner, ordem por chave única; publicação só após leitura completa | 12 testes incluindo mais de 1000 linhas e troca de conta A/B/A |
| Pendência sem dono | Recuperação explícita exige caixa pertencente ao titular via RLS, login estável e CAS local | Seis testes; payload preservado e registros inconclusivos intactos |
| Admin de assinatura | ID selecionado, owner, CAS inclusive updated_at NULL; cancelamento repetido limpa extensão; reativação expirada exige prazo | Revisão independente e regressões de API |
| Cadastro | Navegação SPA e tarefas de analytics/referral independentes; waitUntil no servidor | Analytics pendente/falhando não impede conclusão |
| CRM Chat → PDV | RPC de três argumentos e resposta pessoaId | Contrato live e adapter; conflito não vira associação |
| Publicação de produto | Foto antiga só é limpa depois de salvar; CAS evita sobrescrever edição concorrente; reorder altera somente ordem | Unitários e navegador |
| Cupom → pedido | Revalidação, pedido e resgate na mesma transação; retry recupera pedido | PostgreSQL 17 com duas conexões e rollback |
| Frete manual | CAS da sessão; resolução exige o request ainda ligado ao carrinho | Request antigo/nulo recusado sem mutações |
| Push | Destino permitido, timeout, paginação e concorrência limitadas; lease por assinatura e checkpoint correspondente | Transporte simulado e locks PostgreSQL |
| Pix | Reserva durável antes do POST; externalId estável; reconciliação por GET; valor e identidade conferidos | PostgreSQL concorrente, deadlines e webhooks simulados |
| Chat lifecycle | Sem sobreposição de timers; drain; deadlines; erros do socket contidos e filas limitadas | Runtime Linux e testes convencionais, sem reprodução de frames malformados |

## Banco já aplicado nesta rodada

As migrations aditivas de cupom, lease de push, guard de cotação e reserva Pix foram aplicadas antes dos consumidores, usando a CLI Supabase vinculada. ACL conferida: somente service_role executa esses novos contratos. A correção anterior de record para JSONB em salvar regra de frete também está aplicada. Não houve criação de pedidos/cobranças reais, transferência de pendências entre contas ou limpeza de histórico financeiro.

A migration `20260905003227` também foi aplicada: a RPC de venda grava o dono e
o ator corretos, compartilha a intenção entre operadores e verifica autorização
antes do replay. Authenticated/service_role preservados, anon negado. Legado
sob operador exige reconciliação quando seu vínculo ainda existe; nenhum
histórico foi reassociado. Ex-operador com assinatura própria preserva sua loja.

O harness descartável restaura o baseline, aplica as migrations de schema e executa sete matrizes de identidade, pedidos, tokens, confirmação WhatsApp, estorno de fiado, RBAC e venda por operador. Três probes com conexões independentes validam identidade concorrente, emissão versus confirmação e venda entre titular/operador. Foi necessário corrigir acesso às tabelas temporárias dos testes e reconhecer a cadeia transitiva de locks do PostgreSQL; as permissões das tabelas de aplicação não foram afrouxadas.

Comando do harness: `./scripts/verify-supabase-baseline.ps1 -ApplyForwardMigrations -ExcludeTenantDataSeeds -RunConcurrencyProbes -PostMigrationVerification <lista de SQLs em supabase/verification>`.
O seed comercial excluído exige hash exato; todos os schemas permanecem no teste.

## Limites operacionais

- Spool aceito não comprova papel. USB/rede, driver e impressora térmica da loja ainda exigem smoke físico após atualizar o Printer.
- O instalador 0.2.0 passou instalação/desinstalação isolada e CI Windows, mas não possui assinatura Authenticode da empresa. Não foi inventado nem adquirido certificado.
- Venda offline não resolve disputa de estoque entre caixas desconectados. Pendências rejeitadas no replay permanecem salvas.
- Analytics de campo deve ser medido após rollout. Remover a espera de analytics não demonstra, por si só, a causa ou a resolução do INP observado no cadastro.
- Nenhum rebrand foi feito. Avisos visuais preexistentes foram classificados no contexto, sem suppressions para silenciar hooks.
