# ZeloPDV Context

Este e o ponto de entrada para documentacao interna do repo.

## Docs operacionais (camada AI-first) — agora em `docs/`

Toda a documentacao do repo vive em `docs/` (antes era dividida entre raiz e `docs/`).
A camada operacional/AI-first fica no topo de `docs/`:

- [CURRENT.md](./CURRENT.md): estado curto da sessao/sprint
- [BILLING.md](./BILLING.md): runbook de assinatura/cobranca
- [CODE_REVIEW.md](./CODE_REVIEW.md): auditoria consolidada
- [TRADEOFFS.md](./TRADEOFFS.md): tradeoffs aceitos e divida tecnica conhecida
- [FIXES_PROGRESS.md](./FIXES_PROGRESS.md): trilha viva de correcoes
- [INCIDENTS.md](./INCIDENTS.md): historico/padroes de incidentes
- [ZeloPDV.memory.md](./ZeloPDV.memory.md): fatos confirmados para continuidade
- `pdvObsidian/HOME.md`: hub do vault Obsidian (espelha `docs/` via symlinks)

## O que fica na raiz (so pontos de entrada)

A raiz guarda apenas os tres arquivos que ferramentas e humanos esperam encontrar la:

- `README.md`: porta de entrada para humanos / GitHub.
- `CLAUDE.md`: arquitetura real, fluxos criticos e riscos — carregado automaticamente pelo Claude Code a partir da raiz.
- `AGENTS.md`: instrucoes operacionais para agentes (convencao cross-tool de raiz).

## Documentacao viva

- [setup/DEV_SETUP.md](./setup/DEV_SETUP.md): setup local, stack e prerequisitos.
- [data/SCHEMA_RLS.md](./data/SCHEMA_RLS.md): tenancy, RLS, trust boundaries e limitacoes atuais de enforcement.
- [integrations/EXTERNAL_DEPENDENCIES.md](./integrations/EXTERNAL_DEPENDENCIES.md): mapa das integracoes externas, envs e modos de falha.
- [modules/ACESSOS.md](./modules/ACESSOS.md): contrato operacional atual do add-on Controle de Acessos.
- [modules/MESAS.md](./modules/MESAS.md): contrato operacional atual do add-on Mesas.
- [operations/OFFLINE.md](./operations/OFFLINE.md): comportamento offline real do PDV.
- [roadmap/CLEANUP_FOLLOWUPS.md](./roadmap/CLEANUP_FOLLOWUPS.md): backlog tecnico curto de limpeza e follow-ups.
- [features/update-versioning.md](./features/update-versioning.md): arquitetura do detector de nova versao e refresh seguro.
- [billing/pix-abacatepay-plan.md](./billing/pix-abacatepay-plan.md): nota historica do desenho inicial do Pix. O runbook vivo agora e `BILLING.md`.
- [referral-system.md](./referral-system.md): documentacao do sistema de indicacoes.

## Trackers de projeto

- [projects/PROJETO_ACESSOS.md](./projects/PROJETO_ACESSOS.md): tracker historico por sprint do add-on Controle de Acessos.
- [projects/PROJETO_MESAS.md](./projects/PROJETO_MESAS.md): tracker historico por sprint do add-on Mesas.
- [projects/IFOOD_INTEGRATION_REPORT.md](./projects/IFOOD_INTEGRATION_REPORT.md): viabilidade oficial, aderencia a codebase e arquitetura ampla da integracao iFood.
- [superpowers/specs/2026-09-15-ifood-mvp-design.md](./superpowers/specs/2026-09-15-ifood-mvp-design.md): design aprovado do MVP operacional iFood.
- [adr/0001-ifood-worker-dedicado.md](./adr/0001-ifood-worker-dedicado.md): decisao de processar a integracao em worker dedicado.

## Arquivos historicos / snapshots

- [archive/mesas-initial-plan.md](./archive/mesas-initial-plan.md): plano inicial que originou o tracker de Mesas.
- [roadmap/CLEANUP_FOLLOWUPS.md](./roadmap/CLEANUP_FOLLOWUPS.md): backlog tecnico util, mas nao e source-of-truth operacional do produto.

## Convencoes

- Toda documentacao vive em `docs/`. Nao criar `.md` operacionais novos na raiz.
- A raiz guarda apenas os pontos de entrada: `README.md`, `CLAUDE.md` e `AGENTS.md`.
- O vault `pdvObsidian/` espelha `docs/` via symlinks; ao criar uma doc nova em `docs/`, adicionar o symlink correspondente no vault se quiser que apareca no Obsidian.
- Quando uma doc deixar de ser viva, mover para `docs/archive/` ou consolidar numa doc atual.
- Quando houver duplicacao entre uma nota curta e uma doc tecnica mais completa, manter a mais completa e remover a redundante.

## Linguagem do domínio — integração iFood

**MVP operacional iFood**:
Primeira entrega que recebe e opera no ZeloPDV pedidos iFood de entrega, entrega própria, retirada, imediatos e agendados, materializando sua venda operacional. Não inclui sincronização de cardápio nem conciliação financeira do iFood.
_Evitar_: integração iFood completa, MVP completo

**Venda operacional iFood**:
Registro da venda bruta originada por um pedido iFood concluído, com itens, descontos, entrega, pagamento, origem e total. Não representa o valor líquido que será repassado pelo iFood.
_Evitar_: venda líquida, repasse iFood

**Conciliação iFood**:
Comparação posterior entre vendas operacionais e os lançamentos, comissões, ajustes e repasses fornecidos pelo módulo Financial do iFood.
_Evitar_: taxa estimada, comissão fixa

**Conexão self-service iFood**:
Jornada em que o titular configura a integração pelo ZeloPDV e conclui no ambiente do iFood as autorizações obrigatórias, sem depender do suporte Zelo. A conexão pode permanecer aguardando autorização externa e não implica ativação instantânea.
_Evitar_: conexão instantânea, ativação automática

**Produto iFood mapeado**:
Item externo associado de forma inequívoca a um produto do ZeloPDV, podendo participar dos efeitos locais de estoque. Item não mapeado continua pertencendo ao pedido e à venda, mas não altera estoque.
_Evitar_: produto sincronizado

**Falha fechada do iFood**:
Estado de proteção no qual o ZeloPDV deixa de sinalizar presença operacional para uma loja cuja integração não consegue receber ou processar pedidos com segurança.
_Evitar_: integração offline

**Confirmação iFood**:
Decisão manual do operador no ZeloPDV que aceita um pedido recebido e aguarda o evento do iFood antes de considerá-lo confirmado.
_Evitar_: aceite automático, confirmação otimista

**Venda iFood fora do caixa**:
Venda operacional que participa dos relatórios, mas não é atribuída ao turno de caixa físico nem altera o valor esperado em gaveta no MVP, mesmo quando o pagamento declarado é dinheiro.
_Evitar_: venda sem pagamento, venda ignorada

**Estorno iFood**:
Compensação auditável de uma venda operacional já criada quando o iFood confirma um cancelamento integral posterior à conclusão. A venda original permanece no histórico.
_Evitar_: apagar venda, cancelar silenciosamente

**Consciência de canal do Zelinho**:
Capacidade da inteligência geral do ZeloPDV de distinguir a origem das vendas e produzir comparações ou insights por canal, incluindo iFood. Não constitui um assistente separado nem acesso do modelo ao payload pessoal do pedido.
_Evitar_: Zelinho do iFood, assistente iFood

**Comprador iFood**:
Pessoa identificada apenas no contexto operacional do pedido iFood. No MVP não se torna automaticamente uma Pessoa do ZeloPDV.
_Evitar_: cliente cadastrado, pessoa sincronizada

**Responsável pela impressão iFood**:
Sistema escolhido pela loja para produzir a comanda de pedidos iFood: ZeloPDV ou impressão externa. Apenas um responsável deve permanecer ativo para evitar duplicidade.
_Evitar_: impressão simultânea, fallback automático de impressão

**Alerta operacional de pedido**:
Capacidade geral do ZeloPDV de sinalizar um pedido que exige atenção por aviso visual e sonoro, independentemente do canal de origem. Não pertence ao adaptador iFood, embora seja uma dependência operacional do MVP.
_Evitar_: som do iFood, alerta específico do iFood

**Comando iFood**:
Intenção registrada pelo ZeloPDV para alterar um pedido externo, como confirmar, iniciar preparo ou cancelar. Uma resposta HTTP de aceite não transforma o comando em mudança confirmada.
_Evitar_: transição iFood, estado confirmado

**Evento iFood**:
Fato recebido do iFood que confirma ou informa uma mudança externa e pode avançar a projeção do pedido no ZeloPDV de forma idempotente.
_Evitar_: comando, resposta HTTP
