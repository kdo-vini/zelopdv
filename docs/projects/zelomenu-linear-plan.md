# ZeloMenu / ZeloChat — Plano de Produto e Arquitetura

Data: 2026-06-22  
Status: planejamento executivo e técnico  
Formato: backlog por fases, estilo Linear  

## Governança do Projeto

Este plano é o tracker canônico de ZeloMenu/ZeloChat/ZeloPDV. Nenhuma task deste projeto é considerada entregue se a documentação não foi atualizada junto.

### Definition of Done por Ticket

Para marcar qualquer ticket como `Done`, a entrega precisa cumprir:

1. Código, configuração, copy ou decisão implementada.
2. Validação registrada no próprio ticket: teste automatizado, teste manual, comando executado ou motivo explícito para não testar.
3. Status do ticket atualizado neste arquivo.
4. Se o comportamento do ZeloChat mudou, atualizar `CURRENT.md` e, quando aplicável, `FIXES_PROGRESS.md`, `INCIDENTS.md` ou `docs/ai/ZeloChat.memory.md`.
5. Se o comportamento do ZeloPDV mudou, atualizar `docs/CURRENT.md` no repo ZeloPDV e, quando aplicável, a documentação operacional do módulo afetado.
6. Se uma decisão nova foi tomada, adicionar uma nova entrada `D-XXX` no registro de decisões ou atualizar a decisão existente, preservando o histórico quando a decisão foi refinada.
7. Se um ticket altera pricing, plano, acesso ou entitlement, atualizar também o mapa comercial/plano afetado antes de considerar entregue.

### Regra de PM

Documento desatualizado é trabalho incompleto. O PM ou agente responsável deve rejeitar qualquer entrega que muda comportamento sem atualizar este plano e os docs vivos dos repos afetados.

## Norte

O Zelo passa a ser pensado como um sistema operacional comercial para lanchonetes pequenas.

- Marca guarda-chuva: **Zelo**
- Domínio principal por agora: **zelopdv.com.br**
- Produtos/módulos públicos: **ZeloPDV**, **ZeloChat**, **ZeloMenu**
- Não existe produto público "Core"
- ZeloMenu não é app operacional do dia a dia: é camada de cardápio, publicação, carrinho e confirmação
- Operação diária acontece nas superfícies contratadas: ZeloChat, ZeloPDV e a tela comum de Pedidos

## Decisões Fechadas

- ZeloPDV continua **R$59**.
- ZeloMenu para clientes ZeloPDV custa **+R$40**, total **R$99**.
- ZeloChat sobe para **R$147** e passa a incluir ZeloMenu obrigatoriamente.
- Bundle ZeloPDV + ZeloChat + ZeloMenu custa **R$197**.
- Casa dos Salgados é exceção comercial individual: piloto por alguns meses antes do aumento.
- ZeloChat é "IA de atendimento com cardápio online".
- ZeloMenu para ZeloChat é "pedido sem bagunça no WhatsApp".
- ZeloMenu para ZeloPDV é "cardápio online integrado ao seu PDV".
- Pedidos/Cozinha deixa de ser addon comercial e vira motor interno de pedidos da plataforma.
- A UI de Pedidos aparece conforme plano/módulo contratado; ZeloPDV puro R$59 não ganha pedidos/cozinha automaticamente.
- Estado do pedido é único e compartilhado entre ZeloChat e ZeloPDV quando ambos existem.
- ZeloChat conversa. ZeloMenu estrutura. ZeloPDV opera.

## Domínios

- Site principal: `zelopdv.com.br`
- Painel ZeloChat: `chat.zelopdv.com.br`
- ZeloMenu público: `menu.zelopdv.com.br/{slug}`
- Configuração do ZeloMenu fica dentro dos apps autenticados existentes, não em `menu.zelopdv.com.br/admin`
- Futuro: domínio/subdomínio próprio do cliente como recurso posterior

## Módulos Internos

Usar linguagem de módulos profundos: cada módulo tem uma Interface pequena, Implementation forte e Adapters concretos.

- **Catalog**: fonte comum de produtos, categorias, disponibilidade e publicação.
- **Menu Publication**: decide o que aparece online e como aparece.
- **Cart Session**: sessão de carrinho por contexto.
- **Ordering**: motor interno de pedidos, estados, aceite, produção, sincronização e impressão.
- **Entitlements**: decide acesso a PDV, Chat, Menu, Mesas, Acessos e superfícies operacionais.
- **Access**: resolve ator, empresa, dono, subusuário e permissões.
- **Notification Events**: eventos de pedido que podem gerar WhatsApp, alerta interno e impressão.
- **Admin Impersonate**: suporte interno central, completo no MVP, auditado.

## Contextos do ZeloMenu

Implementar primeiro `whatsapp_order`, mas modelar desde o começo:

- `whatsapp_order`: iniciado no ZeloChat, com carrinho pré-montado ou menu vazio.
- `public_order`: iniciado por link público da loja.
- `table_order`: iniciado por QR de mesa/comanda.

## Regras de Produto

- Produto base vem do catálogo comum.
- ZeloMenu controla publicação: visível, nome público, descrição, foto, ordem, disponibilidade, adicionais e variações.
- Preço base sempre vem do produto. ZeloMenu v1 não tem override de preço.
- Adicionais/variações são modelo compartilhado, vinculado ao produto, consumido primeiro pelo ZeloMenu.
- Adicionais/variações podem impactar preço.
- Pedido confirmado salva snapshot humano e estrutura computável.
- Fotos são opcionais.
- Estoque só é considerado se o produto controla estoque.
- Produto com controle de estoque ativo e estoque insuficiente bloqueia confirmação.
- Estoque baixa no aceite da loja, não na confirmação do cliente.
- Produtos sem controle de estoque usam disponibilidade/publicação manual.

## Regras de Carrinho e Confirmação

- IA pode montar pré-carrinho quando houver intenção clara.
- Se a intenção estiver vaga, IA manda ZeloMenu cedo.
- Cliente pode editar, remover e adicionar itens no ZeloMenu.
- Confirmação final do pedido sempre acontece no ZeloMenu.
- Uma conversa tem um carrinho ativo por vez.
- Link de carrinho não expira por tempo fixo; tudo é revalidado na confirmação.
- Carrinho/sessão fica salvo no servidor; link carrega apenas identificador seguro.
- Observação livre é permitida, mas sempre força conferência manual.
- Confirmação automática existe como toggle, mas vem desligada por padrão.
- Mesmo com confirmação automática ligada, guardrails podem forçar conferência.

## Regras de Pagamento

- ZeloMenu v1 não processa pagamento online.
- Cliente declara a forma de pagamento.
- Se a loja exige Pix antecipado, ZeloMenu informa claramente antes da confirmação.
- Pedido pode ser confirmado, mas fica bloqueado/aguardando pagamento ou comprovante.
- Comprovante é enviado pelo WhatsApp, não pelo ZeloMenu.
- ZeloChat orienta, recebe e vincula/libera manualmente no MVP.

Copy pública base:

> Esta loja prepara pedidos somente após o pagamento via Pix e o envio do comprovante.

## Agenda, Entrega e Tempo

- Agenda/disponibilidade é fonte única compartilhada já existente no banco.
- ZeloMenu usa essa configuração; não cria agenda paralela.
- V1 representa horário/disponibilidade, não capacidade produtiva.
- Horário escolhido no ZeloMenu é solicitação até o pedido ser aceito.
- Retirada/entrega usam fonte compartilhada, com UI própria de revisão no ZeloMenu.
- Bairros comuns podem ser populados.
- Cliente pode digitar bairro/rua.
- Taxa de entrega v1 é tabela simples por bairro.
- Bairro fora da lista fica com taxa "a confirmar".
- Taxa "a confirmar" permite confirmar pedido, mas força conferência humana.
- Tempo estimado padrão da loja: **50 min**, ajustável manualmente.
- Tempo estimado v1 é único por loja.

## Estados do Pedido

Estados internos iniciais:

- `cart_open`
- `confirmed_waiting_review`
- `confirmed_waiting_payment`
- `needs_customer_adjustment`
- `accepted_for_production`
- `preparing`
- `ready`
- `out_for_delivery`
- `delivered`
- `cancelled`

Estados públicos simplificados:

- pedido recebido
- aguardando confirmação da loja
- aguardando pagamento/comprovante
- confirmado
- em preparo
- pronto/saindo
- concluído/cancelado

## Notificações e Status

- ZeloMenu confirma visualmente.
- ZeloChat envia mensagem automática conforme o estado real do pedido.
- Notificações WhatsApp são configuráveis por evento.
- Defaults essenciais ligados: pedido aceito, recusado/ajuste, pronto para retirada, saiu para entrega.
- Status simples fica disponível no link do ZeloMenu.
- WhatsApp continua sendo o canal principal.
- Segurança do status depende do contexto:
  - WhatsApp: link tokenizado vinculado à conversa.
  - Mesa/QR: sessão temporária vinculada à mesa/comanda.
  - Link público: telefone/código ou token do pedido.

## Impressão

- Impressão automática acontece ao aceitar pedido, quando a empresa tiver Zelo Impressão configurado.
- Pedido recebido/aguardando aceite não imprime por padrão.
- Falha de impressão precisa gerar alerta operacional.
- Reimpressão manual precisa existir.
- V1 imprime o pedido inteiro em uma impressão.
- Arquitetura deve permitir divisão futura por setor/categoria.

## Operação e Apps

- ZeloMenu não precisa ficar aberto no dia a dia.
- Cliente configura publicação/cardápio eventualmente.
- Pedido cai na tela comum de Pedidos.
- Cliente só ZeloPDV + ZeloMenu opera Pedidos no ZeloPDV.
- Cliente só ZeloChat + ZeloMenu opera Pedidos no ZeloChat.
- Cliente bundle pode operar/ver nos dois, sempre sincronizado.
- Sem permissão de PDV, não abre PDV.
- Sem permissão de Chat, não abre Chat.
- Conta única no backend, experiência separada por app por enquanto.
- Novos módulos devem nascer compatíveis com um shell Zelo futuro, sem exigir esse shell agora.

## Registro Completo de Decisões da Entrevista

Este bloco registra as perguntas/respostas tomadas na sessão de planejamento. Quando uma decisão foi refinada depois, a versão final aparece como "Decisão"; a observação explica o ajuste.

### Estratégia, Marca e Domínios

#### D-001 — Categoria que o Zelo quer dominar

Pergunta: qual categoria o Zelo quer dominar nos próximos 3 anos?  
Resposta: sistema operacional comercial para lanchonetes pequenas.  
Decisão: Zelo não deve ser pensado só como PDV barato nem só como IA de WhatsApp; Zelo é uma plataforma operacional modular para lanchonetes.

#### D-002 — Marca guarda-chuva

Pergunta: a marca guarda-chuva deve ser Zelo ou ZeloPDV?  
Resposta: Zelo.  
Decisão: a marca estratégica é Zelo, com subnomes modulares: ZeloPDV, ZeloChat e ZeloMenu.

#### D-003 — Domínio principal

Pergunta: mudar domínio principal agora?  
Resposta: não.  
Decisão: manter `zelopdv.com.br` como domínio principal por agora, por força comercial e SEO.

#### D-004 — "8Core"

Pergunta: usar "8Core" como conceito/produto?  
Resposta: não; foi typo.  
Decisão: não existe produto público "Core"; se houver plataforma interna, ela não vira marca vendida.

#### D-005 — Nome do módulo de cardápio

Pergunta: como chamar o módulo de cardápio/pedido estruturado?  
Resposta: ZeloMenu.  
Decisão: o módulo público se chama ZeloMenu.

#### D-006 — Domínio público do ZeloMenu

Pergunta: `pedir`, `menu` ou `cardapio`?  
Resposta: `menu`.  
Decisão: ZeloMenu público usa `menu.zelopdv.com.br/{slug}`.

#### D-007 — Painel ZeloChat

Pergunta: migrar `chat.zelopdv.com.br`?  
Resposta: manter.  
Decisão: painel do ZeloChat continua em `chat.zelopdv.com.br`.

#### D-008 — Admin do ZeloMenu

Pergunta: ZeloMenu Admin deve viver em `menu.zelopdv.com.br/admin`?  
Resposta: não.  
Decisão: `menu.zelopdv.com.br` é superfície pública; configuração fica dentro dos apps autenticados existentes.

#### D-009 — URL pública da loja

Pergunta: loja deve ter slug público?  
Resposta: sim.  
Decisão: v1 usa `menu.zelopdv.com.br/{slug-da-loja}`; domínio próprio do cliente fica para o futuro.

### Produto e Pricing

#### D-010 — ZeloMenu como feature ou produto

Pergunta: ZeloMenu é só feature obrigatória do ZeloChat ou produto/módulo próprio?  
Resposta: módulo próprio, mas obrigatório dentro do ZeloChat.  
Decisão: ZeloMenu nasce como módulo vendável para ZeloPDV e como capacidade obrigatória do ZeloChat novo.

#### D-011 — Standalone inicial do ZeloMenu

Pergunta: ZeloMenu standalone significa independente de PDV/Chat ou módulo para clientes ZeloPDV?  
Resposta: módulo para clientes ZeloPDV.  
Decisão: v1 do ZeloMenu é comercialmente standalone como addon do ZeloPDV, não produto independente real sem base operacional.

#### D-012 — ZeloPDV preço

Pergunta: ZeloPDV muda de preço?  
Resposta: não.  
Decisão: ZeloPDV continua R$59.

#### D-013 — ZeloMenu preço para ZeloPDV

Pergunta: quanto custa ZeloMenu para clientes ZeloPDV?  
Resposta: R$40.  
Decisão: ZeloPDV + ZeloMenu fica R$99.

#### D-014 — ZeloChat preço

Pergunta: ZeloChat sobe com ZeloMenu obrigatório?  
Resposta: sim.  
Decisão: ZeloChat novo custa R$147 e inclui ZeloMenu obrigatoriamente.

#### D-015 — Bundle principal

Pergunta: preço do pacote ZeloPDV + ZeloChat + ZeloMenu?  
Resposta: R$197.  
Decisão: bundle custa R$197.

#### D-016 — Escopo do bundle R$197

Pergunta: bundle inclui quais capacidades?  
Resposta: ZeloPDV + ZeloChat + ZeloMenu completo.  
Decisão: bundle inclui integração entre PDV, Chat e Menu; Mesas e Acessos continuam separados. Pedidos deixa de ser addon comercial e vira motor interno.

#### D-017 — Casa dos Salgados

Pergunta: clientes atuais do ZeloChat migram como?  
Resposta: Casa dos Salgados é exceção individual.  
Decisão: CS testa por alguns meses em condição atual; depois haverá conversa para migração ao novo preço.

#### D-018 — Posicionamento do ZeloChat

Pergunta: como vender o ZeloChat novo?  
Resposta: IA de atendimento com cardápio online.  
Decisão: não vender só como "IA"; vender como atendimento com IA + cardápio online que organiza pedidos.

#### D-019 — Posicionamento do ZeloMenu por contexto

Pergunta: promessa pública principal do ZeloMenu?  
Resposta: depende do contexto.  
Decisão: para ZeloChat, "pedido sem bagunça no WhatsApp"; para ZeloPDV, "cardápio online integrado ao seu PDV".

#### D-020 — Primeiro público pós-piloto

Pergunta: quem vender depois da Casa dos Salgados?  
Resposta: clientes atuais ZeloPDV.  
Decisão: primeiro lote comercial pós-CS é a base ZeloPDV, com addon ZeloMenu por R$40.

### Prioridade e Fases

#### D-021 — Primeiro caso de uso do ZeloMenu

Pergunta: WhatsApp, link público ou QR mesa primeiro?  
Resposta: WhatsApp/ZeloChat.  
Decisão: MVP resolve a dor da Casa dos Salgados: pedido via WhatsApp estruturado pelo ZeloMenu.

#### D-022 — Casos de uso futuros

Pergunta: outros contextos entram depois?  
Resposta: sim.  
Decisão: médio prazo inclui link público e QR de mesa/comanda.

#### D-023 — Repo/entrega prioritária

Pergunta: começar por ZeloChat ou ZeloPDV?  
Resposta: ZeloChat é prioridade.  
Decisão: execução visível começa no ZeloChat porque o motor de atendimento/pedido muda ali.

#### D-024 — Relação com ZeloPDV no MVP

Pergunta: integração real PDV já no MVP ou modelo preparado?  
Resposta: operacional primeiro no ZeloChat, preparado para sincronizar com ZeloPDV.  
Decisão: MVP da Casa dos Salgados resolve no ZeloChat, sem repetir um beco sem saída incompatível com PDV.

#### D-025 — Escopo por fases

Pergunta: separar piloto 3 dias e MVP 3-4 semanas?  
Resposta: não; escopar tudo e trackear por phases em arquivo MD.  
Decisão: este arquivo é o tracker por fases, com backlog estilo Linear.

### Arquitetura, Apps e Conta

#### D-026 — Fonte de verdade do pedido

Pergunta: ZeloChat, ZeloPDV ou nova camada?  
Resposta: pedido confirmado deve cair no modelo operacional do ZeloPDV sempre que possível.  
Decisão: ZeloChat conversa, ZeloMenu estrutura, ZeloPDV opera; no MVP pode haver etapa compatível no ZeloChat, mas o destino arquitetural é pedido operacional comum.

#### D-027 — ZeloChat sem PDV visível

Pergunta: ZeloChat + ZeloMenu exige PDV?  
Resposta: não na UI; sim em infraestrutura comum.  
Decisão: cliente pode comprar ZeloChat sem acesso ao app ZeloPDV, mas usa modelo operacional comum por baixo.

#### D-028 — Guard de acesso ao PDV

Pergunta: cliente Chat-only pode acessar PDV?  
Resposta: não.  
Decisão: infraestrutura comum não concede acesso comercial; entitlements precisam bloquear app/superfícies não contratadas.

#### D-029 — Shell Zelo único

Pergunta: criar shell único agora?  
Resposta: não agora.  
Decisão: manter apps separados por enquanto; novos módulos nascem compatíveis com shell Zelo futuro.

#### D-030 — Conta única

Pergunta: login separado ou conta Zelo única?  
Resposta: conta única no backend, UI separada.  
Decisão: identidade/empresa/entitlements são comuns; experiências podem continuar separadas.

#### D-031 — ZeloMenu como app operacional

Pergunta: lojista precisa deixar ZeloMenu aberto?  
Resposta: não.  
Decisão: ZeloMenu é configuração/publicação + experiência pública do cliente; operação diária ocorre em ZeloChat/ZeloPDV/Pedidos.

#### D-032 — Tela comum de Pedidos

Pergunta: pedidos do ZeloMenu caem onde?  
Resposta: na tela comum de Pedidos.  
Decisão: Pedidos é superfície operacional comum do motor interno, não tela pertencente ao ZeloMenu.

#### D-033 — ZeloPDV + ZeloMenu operação

Pergunta: para cliente ZeloPDV + ZeloMenu, onde aparece Pedidos?  
Resposta: no menu lateral do ZeloPDV como parte da contratação do ZeloMenu.  
Decisão: o cliente não abre app extra; opera pedidos online dentro do ZeloPDV.

#### D-034 — ZeloChat + ZeloMenu operação

Pergunta: para cliente ZeloChat + ZeloMenu, onde aparece Pedidos?  
Resposta: no ZeloChat.  
Decisão: cliente Chat-only opera pedidos no ZeloChat e não acessa ZeloPDV.

#### D-035 — Bundle e sincronização

Pergunta: quando empresa tem bundle, PDV e Chat ficam sincronizados?  
Resposta: sim, o tempo todo.  
Decisão: estado do pedido é único; aceitar no Chat reflete no PDV e vice-versa.

### Pedidos/Cozinha e Motor Operacional

#### D-036 — ZeloMenu sem ZeloChat

Pergunta: ZeloMenu para ZeloPDV precisa funcionar sem Chat?  
Resposta: sim, com pedido simplificado/operacional.  
Decisão: ZeloMenu sem Chat aceita pedidos, mas sem IA/conversa automatizada.

#### D-037 — Destino operacional do link público

Pergunta: link público precisa de módulo Pedidos?  
Resposta: sim, precisa de destino operacional.  
Decisão: link público cai no motor/tela comum de Pedidos; link de mesa cai em comanda.

#### D-038 — Pedidos/Cozinha como addon

Pergunta: remover Pedidos/Cozinha como addon comercial?  
Resposta: sim.  
Decisão: Pedidos/Cozinha deixa de ser vendido separado e vira motor interno usado por ZeloMenu, ZeloChat, Mesas e PDV quando aplicável.

#### D-039 — ZeloPDV puro e Pedidos

Pergunta: PDV R$59 ganha tela de pedidos/cozinha?  
Resposta: não.  
Decisão: motor interno não libera UI; ZeloPDV puro segue simples.

#### D-040 — Interface operacional compartilhada

Pergunta: uma tela por produto ou uma tela comum?  
Resposta: tela comum.  
Decisão: a mesma superfície operacional de Pedidos aparece no app contratado, guiada por entitlements.

### Catálogo, Publicação e Produto

#### D-041 — Fonte do catálogo

Pergunta: catálogo do PDV, catálogo próprio do Menu ou camada comum?  
Resposta: catálogo comum com UIs diferentes.  
Decisão: Catalog vira módulo interno comum; PDV/Chat/Menu são portas diferentes para editar/publicar.

#### D-042 — Publicação do ZeloMenu

Pergunta: Menu só usa produtos do PDV diretamente?  
Resposta: não; usa camada de publicação.  
Decisão: produto base é comum; ZeloMenu decide visibilidade, apresentação e publicação online.

#### D-043 — Preço

Pergunta: preço vem do PDV ou pode ter override no Menu?  
Resposta: sempre do produto.  
Decisão: ZeloMenu v1 não tem override de preço; empresa escolhe o que fica visível.

#### D-044 — Revenda/preço especial

Pergunta: como lidar com revenda/preço diferente?  
Resposta: removendo/organizando produto na frente principal.  
Decisão: v1 não cria preço por canal; casos de revenda devem ser modelados no catálogo/produto.

#### D-045 — Fotos

Pergunta: fotos obrigatórias?  
Resposta: opcionais.  
Decisão: produto pode ser publicado com ou sem foto.

#### D-046 — Configuração do cardápio

Pergunta: cliente ou equipe Zelo configura?  
Resposta: cliente self-service.  
Decisão: cliente configura o próprio ZeloMenu; equipe Zelo usa impersonate para suporte.

#### D-047 — Sync de edição entre PDV/Chat/Menu

Pergunta: cardápio editável em PDV e Chat fica sincronizado?  
Resposta: sim.  
Decisão: produto base é único; o que muda é a UI e a camada de publicação.

### Adicionais, Variações e Snapshot

#### D-048 — Adicionais/variações no MVP

Pergunta: entram no MVP?  
Resposta: sim, com modelo mais completo.  
Decisão: ZeloMenu v1 suporta estrutura de adicionais/variações, não apenas observação livre.

#### D-049 — Preço em adicionais/variações

Pergunta: adicionais podem alterar preço?  
Resposta: sim.  
Decisão: modelo e carrinho suportam preço adicional desde o início.

#### D-050 — Onde vivem adicionais/variações

Pergunta: PDV, Menu ou compartilhado?  
Resposta: modelo compartilhado.  
Decisão: opções/adicionais ficam vinculados ao produto comum e são consumidos primeiro pelo ZeloMenu.

#### D-051 — Como salvar no pedido

Pergunta: texto, estrutura ou ambos?  
Resposta: ambos.  
Decisão: pedido salva snapshot textual para humanos e estrutura computável para auditoria/relatório/integração.

#### D-052 — Observações livres

Pergunta: permitir observação livre?  
Resposta: sim, mas força conferência.  
Decisão: qualquer observação livre força conferência manual mesmo com confirmação automática ligada.

### Estoque e Disponibilidade

#### D-053 — Estoque no ZeloMenu

Pergunta: estoque entra no v1?  
Resposta: só quando produto controla estoque no PDV/catálogo.  
Decisão: ZeloMenu não inventa estoque; respeita controle existente.

#### D-054 — Produto sem controle de estoque

Pergunta: como tratar produto sem estoque controlado?  
Resposta: disponibilidade manual.  
Decisão: produto sem controle de estoque ignora estoque e pode ser pausado/publicado manualmente.

#### D-055 — Produto com estoque controlado e sem estoque

Pergunta: bloquear ou forçar conferência?  
Resposta: bloquear.  
Decisão: estoque insuficiente em produto controlado impede confirmação no ZeloMenu.

#### D-056 — Momento de baixa de estoque

Pergunta: baixa na confirmação ou aceite?  
Resposta: aceite.  
Decisão: estoque só reduz quando a loja aceita o pedido.

### Carrinho, Link e IA

#### D-057 — Papel da IA no carrinho

Pergunta: cliente monta tudo ou IA pré-monta?  
Resposta: ambos.  
Decisão: IA pode montar pré-carrinho; cliente revisa/edita/confirma no ZeloMenu.

#### D-058 — Momento de mandar ZeloMenu

Pergunta: perguntar tudo no chat ou mandar cedo?  
Resposta: híbrido.  
Decisão: IA monta pré-carrinho quando intenção é clara; se vago, manda ZeloMenu cedo.

#### D-059 — Confirmação final

Pergunta: IA pode finalizar pedido complexo sozinha?  
Resposta: não.  
Decisão: pedido só vale após confirmação estruturada no ZeloMenu.

#### D-060 — Modos/contextos

Pergunta: modelar contextos desde v1?  
Resposta: sim.  
Decisão: arquitetura nasce com `whatsapp_order`, `public_order` e `table_order`, implementando primeiro `whatsapp_order`.

#### D-061 — Expiração de link

Pergunta: link expira por tempo fixo?  
Resposta: não.  
Decisão: link não expira fixamente; preço, horário, disponibilidade e regras revalidam na confirmação.

#### D-062 — Armazenamento do carrinho

Pergunta: carrinho no link ou servidor?  
Resposta: servidor.  
Decisão: link carrega identificador seguro; sessão/carrinho fica no banco.

#### D-063 — Carrinhos por conversa

Pergunta: múltiplos carrinhos abertos por conversa?  
Resposta: não no MVP.  
Decisão: uma conversa tem um carrinho ativo por vez; novo carrinho só após confirmar/cancelar/arquivar o anterior.

#### D-064 — Recuperação de carrinho abandonado

Pergunta: recuperar carrinho abandonado?  
Resposta: sim, simples.  
Decisão: ZeloChat envia uma recuperação após 2 horas, no máximo uma vez.

### Confirmação, Aceite e Estados

#### D-065 — Confirmar pedidos automaticamente

Pergunta: precisa toggle igual iFood?  
Resposta: sim.  
Decisão: loja tem toggle "Confirmar pedidos automaticamente".

#### D-066 — Default do toggle

Pergunta: automático ligado ou desligado por padrão?  
Resposta: desligado.  
Decisão: novos clientes começam com conferência manual por segurança.

#### D-067 — Guardrails do automático

Pergunta: automático sempre respeitado?  
Resposta: não.  
Decisão: observação livre, taxa a confirmar, Pix pendente, estoque, horário/regra inválida ou risco operacional forçam conferência.

#### D-068 — Quem aprova no ZeloChat v1

Pergunta: quem pode aceitar pedido?  
Resposta: qualquer atendente logado no ZeloChat.  
Decisão: v1 é simples; registrar quem aceitou e quando.

#### D-069 — Pedido e conversa

Pergunta: estado de conversa e pedido são o mesmo?  
Resposta: não.  
Decisão: conversa tem modo IA/manual; pedido tem estado operacional próprio.

#### D-070 — Roteamento pós-confirmação

Pergunta: conversa volta para IA ou humano?  
Resposta: depende do estado.  
Decisão: estado do pedido decide se IA comunica, aguarda Pix, chama humano ou envia ajuste.

#### D-071 — Mensagens automáticas por status

Pergunta: ZeloChat deve mandar mensagem após confirmação?  
Resposta: sim, conforme status.  
Decisão: mensagem automática reflete o estado real: aguardando aceite, aguardando Pix, produção, ajuste etc.

### Pagamento, Pix e Comprovante

#### D-072 — Pagamento online

Pergunta: processar pagamento no ZeloMenu v1?  
Resposta: não.  
Decisão: v1 usa pagamento declarativo; sem gateway/checkout online.

#### D-073 — Pix antecipado

Pergunta: se loja exige Pix, bloquear como?  
Resposta: pedido confirma, mas fica aguardando pagamento/comprovante.  
Decisão: ZeloMenu informa antes; ZeloChat conduz comprovante pelo WhatsApp.

#### D-074 — Canal do comprovante

Pergunta: comprovante pelo ZeloMenu ou WhatsApp?  
Resposta: WhatsApp.  
Decisão: ZeloMenu é cardápio/carrinho/confirmação; comprovante continua no ZeloChat.

### Agenda, Horário, Retirada e Entrega

#### D-075 — Dados coletados no contexto WhatsApp

Pergunta: ZeloMenu coleta quais dados?  
Resposta: carrinho + data/horário + retirada/entrega.  
Decisão: pagamento/comprovante ficam no Chat; para mesa/comanda, esses campos não se aplicam.

#### D-076 — Agendamento no WhatsApp

Pergunta: ZeloMenu v1 suporta agendamento?  
Resposta: sim.  
Decisão: contexto `whatsapp_order` suporta data e horário.

#### D-077 — Fonte da agenda

Pergunta: horários vêm de config do Menu ou do Chat?  
Resposta: fonte única compartilhada já existente no banco.  
Decisão: ZeloMenu expõe/consome a mesma agenda/disponibilidade usada pelo ZeloChat.

#### D-078 — Capacidade produtiva

Pergunta: agenda representa capacidade completa?  
Resposta: não.  
Decisão: v1 é horário/disponibilidade, sem limite por slot/produto.

#### D-079 — Horário como promessa

Pergunta: horário escolhido é compromisso da loja?  
Resposta: só após aceite/automático.  
Decisão: antes do aceite, horário é solicitação.

#### D-080 — Retirada/entrega

Pergunta: usar config existente ou própria?  
Resposta: fonte compartilhada com UI própria de revisão.  
Decisão: ZeloMenu usa regras de retirada/entrega existentes, permitindo revisão/apresentação própria.

#### D-081 — Bairros e endereço

Pergunta: bairro só pré-cadastrado?  
Resposta: popular comuns, mas permitir digitar bairro/rua.  
Decisão: cliente pode usar bairro listado ou endereço livre.

#### D-082 — Taxa de entrega

Pergunta: calcular taxa como?  
Resposta: tabela por bairro com fallback a confirmar.  
Decisão: bairro listado soma taxa; bairro fora da lista fica "a confirmar".

#### D-083 — Taxa a confirmar

Pergunta: taxa a confirmar bloqueia pedido?  
Resposta: não.  
Decisão: permite confirmar, mas força conferência humana.

#### D-084 — Tempo estimado

Pergunta: mostrar tempo estimado de preparo?  
Resposta: sim, default 50 min.  
Decisão: empresa ajusta manualmente um tempo único por loja.

### Status, Notificações e Segurança do Link

#### D-085 — Notificações por evento

Pergunta: mudanças operacionais notificam WhatsApp?  
Resposta: configurável por evento.  
Decisão: defaults essenciais ligados; loja pode ajustar.

#### D-086 — Status no ZeloMenu

Pergunta: cliente acompanha status pelo link?  
Resposta: sim, simples.  
Decisão: ZeloMenu mostra estados públicos principais; WhatsApp continua canal principal.

#### D-087 — Segurança do status

Pergunta: exigir login/código sempre?  
Resposta: depende do contexto.  
Decisão: WhatsApp usa token vinculado à conversa; mesa usa sessão temporária; link público pode usar telefone/código/token.

### Impressão

#### D-088 — Impressão automática

Pergunta: imprimir ao confirmar ou aceitar?  
Resposta: ao aceitar.  
Decisão: pedido aceito imprime automaticamente via Zelo Impressão quando configurado.

#### D-089 — App Zelo Impressão

Pergunta: usar integração existente?  
Resposta: sim.  
Decisão: usar app de impressão já existente que escuta o SaaS via porta/local.

#### D-090 — Modelo de impressão

Pergunta: imprimir por setor/categoria ou único?  
Resposta: único no MVP, preparado para setor.  
Decisão: v1 imprime pedido inteiro; arquitetura permite divisão futura.

### Acessos, Admin e Suporte

#### D-091 — Acessos como módulo compartilhado

Pergunta: gestão de acessos precisa entrar na arquitetura?  
Resposta: sim, mas não travar MVP.  
Decisão: Acessos deve evoluir para módulo compartilhado, com guard server-side para ações sensíveis.

#### D-092 — Impersonate

Pergunta: equipe Zelo pode acessar conta de clientes?  
Resposta: sim, completo.  
Decisão: admin interno central terá impersonate completo no MVP, com auditoria mínima e banner visual.

#### D-093 — Onde vive impersonate

Pergunta: Chat, PDV ou admin interno?  
Resposta: admin interno central.  
Decisão: impersonate é recurso do admin interno, não do app operacional.

## Contradições Resolvidas

- ZeloMenu começou sendo discutido como feature obrigatória do ZeloChat, mas foi refinado para módulo próprio: addon do ZeloPDV e obrigatório dentro do ZeloChat.
- O destino operacional começou como "Chat primeiro", mas foi refinado: MVP opera no ZeloChat, porém o estado de pedido deve ser compatível com o motor comum e sincronizar com ZeloPDV no bundle.
- "Pedidos/Cozinha" começou como possível addon necessário para ZeloMenu, mas foi decidido que deixa de ser addon comercial e vira motor interno.
- ZeloMenu poderia parecer app próprio, mas foi decidido que não é app operacional diário; operação acontece em Pedidos dentro do app contratado.
- Agenda/entrega pareciam configuração nova do Menu, mas foi decidido usar fonte compartilhada já existente no banco, com UI própria de revisão.

## Backlog por Fases

Legenda:

- `Todo`: não iniciado
- `Doing`: em execução
- `Blocked`: depende de decisão externa
- `Done`: concluído

### Phase 0 — Contrato, Escopo e Preparação

#### ZLM-001 — Consolidar decisão de produto e pricing

Status: Todo  
Type: Discuss  
Depends on: nenhum  
Owner: CEO/Produto  

Escopo:
- Fixar matriz R$59 / R$99 / R$147 / R$197.
- Definir copy comercial dos planos.
- Definir tratamento Casa dos Salgados.
- Decidir como remover Pedidos/Cozinha da grade comercial sem quebrar clientes existentes.

Aceite:
- Pricing documentado.
- Billing/plan tiers mapeados.
- Texto comercial base aprovado.

#### ZLM-002 — Mapear schema atual ZeloChat/ZeloPDV para pedido canônico

Status: Todo  
Type: Research  
Depends on: ZLM-001  
Owner: Engenharia  

Escopo:
- Ler `zelochat_orders`, `zelochat_pending_orders`, `pedidos`, `pedido_itens`, `comandas`, `mesas`.
- Identificar quais campos suportam `whatsapp_order`, `public_order`, `table_order`.
- Definir se v1 usa `zelochat_orders` com compatibilidade ou nova tabela de sessões/pedidos no ZeloChat.

Aceite:
- Documento curto com fonte de verdade do pedido no MVP e destino futuro.
- Lista de migrations necessárias, separando ZeloChat-owned e ZeloPDV-owned.

#### ZLM-003 — Definir Interface do módulo Ordering

Status: Todo  
Type: Discuss  
Depends on: ZLM-002  
Owner: Engenharia  

Escopo:
- Desenhar Interface pequena para criar carrinho, revalidar, confirmar, aceitar, recusar, mudar status e emitir eventos.
- Definir Adapters iniciais para ZeloChat e futuro ZeloPDV.
- Definir invariantes: estado único, aceite único, revalidação, estoque no aceite.

Aceite:
- Interface proposta.
- Estados e transições aprovados.
- Test cases de domínio listados antes da UI.

#### ZLM-004 — Definir Interface do módulo Catalog/Menu Publication

Status: Done  
Type: Discuss  
Depends on: ZLM-002  
Owner: Engenharia/Produto  

Escopo:
- Produto base comum.
- Publicação no ZeloMenu.
- Fotos opcionais.
- Adicionais/variações com preço.
- Disponibilidade manual e estoque controlado.

Aceite:
- Modelo de publicação definido.
- Modelo de adicionais/variações definido.
- Regras de preço/estoque documentadas.

Resultado (2026-06-23, ZeloPDV):
- Modelo PDV-owned definido em `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql`.
- `zelomenu_product_publications` controla visibilidade online, nome/descrição/foto públicos, ordem e pausa manual por produto.
- `zelomenu_modifier_groups` + `zelomenu_modifier_options` modelam adicionais/variações com limites de seleção e `price_delta`.
- Catálogo base continua em `produtos`/`categorias`; preço base continua em `produtos.preco`; v1 não tem override de preço.
- `produtos.ocultar_no_pdv` não é usado para publicação online.
- RLS por `get_owner_user_id(auth.uid())`, writes com checagem de posse do produto/grupo e grants explícitos para `authenticated`/`service_role`.
- Validação: `npm test -- tests/zelomenuPublicationSchema.test.js` — 5/5; `npm test` — 166/166; `npm run check` — 0 errors / 106 warnings; `npm run build` — ok com warnings pré-existentes de Svelte/PWA/dependências opcionais. Migration ainda não aplicada em produção.
- Rollout Supabase (2026-06-23): tentativa de aplicação interrompida antes desta migration porque o conector Supabase passou a retornar HTTP 500/-32603. Verificação via service role retornou `PGRST205` para `zelomenu_product_publications`; produção ainda não tem a camada de publicação.

#### ZLM-005 — Definir entitlements e navegação

Status: Todo  
Type: Discuss  
Depends on: ZLM-001  
Owner: Engenharia/Produto  

Escopo:
- Quem vê ZeloMenu config.
- Quem vê tela comum de Pedidos.
- Quem acessa ZeloPDV, ZeloChat, Mesas, Acessos.
- Como bundle sincroniza superfícies.

Aceite:
- Matriz de entitlement por plano.
- Lista de guards frontend/backend.

### Phase 1 — Piloto Casa dos Salgados no ZeloChat

#### ZLM-101 — Criar sessões de carrinho do ZeloMenu

Status: Todo  
Type: Prototype  
Depends on: ZLM-003, ZLM-004  
Owner: Engenharia  

Escopo:
- Sessão de carrinho server-side.
- Contexto inicial `whatsapp_order`.
- Link tokenizado.
- Um carrinho ativo por conversa.
- Revalidação na confirmação.

Aceite:
- IA consegue criar link com carrinho pré-montado.
- Cliente consegue abrir e editar.
- Link antigo revalida antes de confirmar.

#### ZLM-102 — Criar UI pública inicial do ZeloMenu

Status: Todo  
Type: Prototype  
Depends on: ZLM-101  
Owner: Frontend  

Escopo:
- Rota pública inicial compatível com `menu.zelopdv.com.br/{slug}`.
- Lista de produtos publicados.
- Carrinho editável.
- Data/horário e retirada/entrega para contexto WhatsApp.
- Avisos de Pix/comprovante quando configurado.

Aceite:
- Cliente final monta ou revisa pedido sem WhatsApp.
- Campos variam por contexto.
- Textos em PT-BR e sem jargão técnico.

#### ZLM-103 — Confirmação do ZeloMenu volta para ZeloChat

Status: Todo  
Type: Prototype  
Depends on: ZLM-101, ZLM-102  
Owner: Engenharia  

Escopo:
- Confirmar carrinho.
- Criar pedido em estado `confirmed_waiting_review` ou `confirmed_waiting_payment`.
- Adicionar evento/mensagem no chat.
- ZeloChat envia resposta conforme estado.

Aceite:
- Pedido confirmado aparece no Chat.
- Chat não mostra estado falso de pendência quando pedido já existe.
- Cliente recebe próximo passo correto no WhatsApp.

#### ZLM-104 — Aceite manual no ZeloChat

Status: Todo  
Type: Prototype  
Depends on: ZLM-103  
Owner: Frontend/Backend  

Escopo:
- Qualquer atendente logado no ZeloChat pode aceitar no v1.
- Registrar quem aceitou e quando.
- Aceite muda estado único do pedido.
- Falhas de estoque/revalidação no aceite bloqueiam e pedem ajuste.

Aceite:
- Pedido só entra em produção após aceite.
- Ação fica auditável.
- Estado muda em tempo real na UI.

#### ZLM-105 — Recuperação simples de carrinho abandonado

Status: Todo  
Type: Prototype  
Depends on: ZLM-101  
Owner: Engenharia  

Escopo:
- Uma mensagem automática após 2h.
- Sem insistência.
- Se cliente responder, conversa segue normalmente.

Aceite:
- Carrinho abandonado gera no máximo uma recuperação.
- Recuperação não dispara para carrinho confirmado/cancelado.

#### ZLM-106 — Impressão no aceite via Zelo Impressão

Status: Todo  
Type: Prototype  
Depends on: ZLM-104  
Owner: Engenharia  

Escopo:
- Ao aceitar pedido, enviar impressão se configurado.
- Imprimir pedido inteiro.
- Mostrar falha de impressão.
- Permitir reimpressão manual.

Aceite:
- Pedido aceito imprime quando integração está ativa.
- Falha não fica silenciosa.

### Phase 2 — Produto Comercial ZeloMenu para Base ZeloPDV

#### ZLM-201 — Publicação self-service do ZeloMenu

Status: In Progress  
Type: Prototype  
Depends on: ZLM-004, ZLM-005  
Owner: Frontend/Produto  

Escopo:
- Tela de publicação/configuração.
- Produto visível/invisível.
- Nome público, descrição, foto opcional, ordem.
- Pausar item manualmente.
- Configurar adicionais/variações.

Aceite:
- Cliente configura sozinho o básico.
- Equipe Zelo não precisa cadastrar tudo manualmente.

Progresso (2026-06-23, ZeloPDV):
- Base de dados desbloqueada por ZLM-004: publicação e modificadores já têm contrato versionado em migration local.
- Ainda falta a UI self-service autenticada para criar/editar essas linhas e o consumo pelo menu público.
- Ainda falta aplicar/validar a migration em staging/prod antes de conectar ZeloChat/ZeloMenu a essa camada.
- Tentativa de rollout em produção parou por indisponibilidade do conector Supabase antes da migration PDV-owned; retomar pela aplicação de `.ai/migrations/zelomenu_publication_schema_2026_06_23.sql`.

#### ZLM-202 — Tela comum de Pedidos liberada por ZeloMenu

Status: Todo  
Type: Prototype  
Depends on: ZLM-003, ZLM-005, ZLM-104  
Owner: Engenharia/Frontend  

Escopo:
- Motor de pedidos interno.
- Tela operacional comum.
- Cliente ZeloPDV + ZeloMenu vê a tela no ZeloPDV.
- Cliente ZeloChat + ZeloMenu vê no ZeloChat.
- Bundle sincroniza os dois.

Aceite:
- Um aceite em uma superfície atualiza a outra.
- Não existe aceite duplicado.
- ZeloPDV puro R$59 não vê a tela sem módulo que libere.

#### ZLM-203 — Link público `menu.zelopdv.com.br/{slug}`

Status: Todo  
Type: Prototype  
Depends on: ZLM-102, ZLM-201  
Owner: Engenharia/Infra  

Escopo:
- Slug público por loja.
- Cardápio público.
- Pedido público com telefone/código ou token.
- Status simples no link.

Aceite:
- Loja pode compartilhar URL pública.
- Cliente final consegue pedir sem conversa prévia no WhatsApp.

#### ZLM-204 — Entrega por bairro

Status: Todo  
Type: Prototype  
Depends on: ZLM-102  
Owner: Produto/Engenharia  

Escopo:
- Bairros comuns pré-populados.
- Taxa por bairro.
- Bairro/rua livre.
- Taxa a confirmar.

Aceite:
- Bairro listado soma taxa.
- Bairro fora da lista permite confirmar e força conferência.

#### ZLM-205 — Billing e planos novos

Status: Todo  
Type: Research  
Depends on: ZLM-001, ZLM-005  
Owner: Produto/Engenharia  

Escopo:
- Atualizar preços no ZeloChat e ZeloPDV.
- Criar/ajustar price IDs.
- Mapear plan_tier/addons sem quebrar `subscriptions`.
- Remover Pedidos/Cozinha como addon vendido.
- Preservar Casa dos Salgados como exceção temporária.

Aceite:
- Checkout e paywall mostram preços corretos.
- Entitlements batem com planos.
- Clientes antigos não quebram.

### Phase 3 — Integração Profunda com ZeloPDV

#### ZLM-301 — Sincronização real com pedidos do ZeloPDV

Status: Todo  
Type: Prototype  
Depends on: ZLM-202  
Owner: Engenharia  

Escopo:
- Pedido do ZeloMenu/Chat compatível com `pedidos`/`pedido_itens`.
- Origem `zelochat`, `zelomenu`, `mesa`.
- Cozinha/produção entende origem.
- Estado único entre superfícies.

Aceite:
- Pedido aceito no Chat aparece no PDV quando há bundle.
- Pedido aceito no PDV atualiza Chat.
- Não há duas fontes de verdade.

#### ZLM-302 — Estoque integrado quando produto controla estoque

Status: Todo  
Type: Prototype  
Depends on: ZLM-301  
Owner: Engenharia  

Escopo:
- Produto com controle de estoque bloqueia confirmação se insuficiente.
- Estoque baixa no aceite.
- Produto sem controle de estoque ignora estoque.

Aceite:
- Revalidação ocorre na confirmação e no aceite.
- Estoque insuficiente não entra em produção.

#### ZLM-303 — Admin interno com impersonate completo auditado

Status: Todo  
Type: Prototype  
Depends on: ZLM-005  
Owner: Engenharia/Admin  

Escopo:
- Impersonate no admin interno central.
- Acesso completo no MVP para superadmins.
- Banner visual de suporte.
- Log de entrada e ações principais.
- Billing fora de ações acidentais.

Aceite:
- Equipe Zelo consegue acessar conta de clientes.
- Auditoria mínima existe.
- Recurso não mora dentro do ZeloChat.

#### ZLM-304 — Endurecer Access para superfície compartilhada

Status: Todo  
Type: Research  
Depends on: ZLM-005, ZLM-303  
Owner: Engenharia  

Escopo:
- Resolver ator/dono/empresa no servidor.
- Definir permissões de aceitar pedido, configurar menu, pausar item, reimprimir.
- Não depender só de bloqueio client-side.

Aceite:
- Novas ações sensíveis passam por guard server-side.
- Modelo fica compatível com Acessos do ZeloPDV.

### Phase 4 — Mesa/Comanda e Expansão

#### ZLM-401 — Contexto `table_order`

Status: Todo  
Type: Prototype  
Depends on: ZLM-301  
Owner: Engenharia  

Escopo:
- QR de mesa.
- Sessão temporária até a comanda fechar.
- Cliente escolhe itens e envia para comanda.
- Não precisa informar data/horário/retirada.

Aceite:
- Pedido cai na comanda correta.
- Produção é alertada.
- Sessão expira ao fechar comanda.

#### ZLM-402 — Status e notificações por mesa/comanda

Status: Todo  
Type: Prototype  
Depends on: ZLM-401  
Owner: Produto/Engenharia  

Escopo:
- Status simples do pedido da mesa.
- Alertas internos para produção.
- Evitar WhatsApp quando o contexto é mesa.

Aceite:
- Cliente entende que pedido foi enviado.
- Time operacional recebe o pedido.

#### ZLM-403 — Impressão por setor/categoria

Status: Todo  
Type: Prototype  
Depends on: ZLM-106, ZLM-301  
Owner: Engenharia  

Escopo:
- Separar impressão por cozinha, bebida, balcão ou categoria.
- Configuração por loja.
- Reimpressão por setor.

Aceite:
- Pedido pode gerar múltiplas impressões quando configurado.
- V1 de impressão única continua funcionando.

## Riscos de Efeito Borboleta

- Duplicar pedido entre `zelochat_orders` e `pedidos` cria divergência operacional.
- Fazer ZeloMenu como app operacional obrigatório aumenta carga do lojista.
- Cobrar ZeloMenu sem destino operacional de pedidos reduz valor percebido.
- Manter Pedidos/Cozinha como addon separado conflita com ZeloMenu.
- Permitir Chat-only usar infraestrutura de pedidos sem entitlements fortes pode liberar PDV indevidamente.
- Observação livre sem conferência manual gera pedido errado.
- Pix/comprovante dentro do ZeloMenu aumenta escopo e confunde o papel do Menu.
- Estoque baixando antes do aceite prende estoque em pedido que pode ser recusado.
- Link público sem revalidação aceita preço/horário/produto obsoleto.
- Impersonate completo sem auditoria vira risco interno sério.

## Próximo Passo Obrigatório

Executar ZLM-002 antes de implementar a primeira migration.

Motivo: o banco é compartilhado com ZeloPDV. O ZeloChat pode criar suas próprias tabelas, mas não deve alterar schema de tabelas ZeloPDV-owned a partir deste repo.
