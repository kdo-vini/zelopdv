# ZeloPDV — Tradeoffs Aceitos e Dívida Técnica

> Criado em 2026-06-01.
> Riscos abertos detalhados: [[CODE_REVIEW]] · trilha de correções: [[FIXES_PROGRESS]] · base técnica: [[CLAUDE]]

## Para que serve este documento

Todo sistema faz *trading*. Para entregar valor rápido e barato, a gente escolhe deixar algumas coisas
na mesa. Este arquivo registra **o que estamos deixando na mesa de propósito** (tradeoffs aceitos) e
**o que sabemos que está torto mas ainda não pagamos** (dívida técnica conhecida).

A diferença importa:

- **Tradeoff aceito (TA-xx):** decisão consciente. Sabemos o custo, ele é tolerável hoje, e existe um
  gatilho claro que nos faria reabrir a decisão. Não é bug — é escolha.
- **Dívida técnica conhecida (DT-xx):** algo que *queremos* consertar, mas ainda não foi priorizado.
  Tem custo recorrente (risco, lentidão, retrabalho) e um “juros” que cresce com o tempo.

Regra de uso: antes de criar um TA/DT novo, confira se já não está em [[CODE_REVIEW]] como finding.
Aqui guardamos a *decisão* e o *gatilho de revisão*; lá guardamos a *evidência* técnica.

## Governança de migrations — atualização (2026-08-14)

`[db.migrations] enabled` passou de `false` para `true` em
`supabase/config.toml`, por decisão do dono do repositório, depois de dois
incidentes seguidos exigirem SQL colado à mão no painel. O fluxo normal volta a
ser `supabase db push --linked`. O que continua valendo: rodar
`--dry-run` antes de todo push, porque ele lista as versões pendentes exatas e
expõe drift; migrations aplicadas seguem imutáveis; e o harness do baseline
mantém a garantia que realmente importa, que é recusar alvo linkado/remoto e só
replayar contra a URL de loopback. `scripts/verify-supabase-baseline.ps1` foi
ajustado para não depender mais do flag estar `false` — ele agora exige que o
flag exista e força `true` na própria cópia descartável.

Custo aceito: um `db push` distraído passa a alcançar produção direto. Gatilho de
revisão: qualquer push não intencional, ou a entrada de mais gente com acesso de
escrita ao projeto linkado.

## Governança de migrations (2026-08-13)

As 59 migrations já aplicadas permanecem byte a byte imutáveis. O baseline
atual fica fora de `supabase/migrations`, exige um sentinel de stack descartável
e só repara histórico local depois do restore. Dos 23 payloads remotos ausentes,
22 ficam como evidência não executável; o patch de dados de um tenant fica
somente como hash para não versionar identificadores e catálogo. Isso evita
reescrever a história de produção ou transformar um snapshot tardio em migration
pendente. Uma nova captura é necessária quando houver migration posterior ao
cutoff `20260813091000`.

## Progresso RBAC incremental (2026-08-12)

As fatias de risco confirmado seguem pequenas e independentes. A fatia de
extensoes de catalogo ZeloMenu exige `produtos.gerenciar` somente em
INSERT/UPDATE/DELETE; SELECT, cache do PDV, billing, offline e service-role
continuam fora desta mudanca. Itens arquiteturais P2/P3 continuam backlog e
nao sao pretexto para refatoracoes amplas.

O desconto POS segue a mesma regra de contenção: `pdv.desconto` é validado no
trigger somente quando há desconto positivo; Mesa e desconto zero preservam o
contrato operacional existente.

## TA-INTELLIGENCE-01 — Silenciar sinais é apresentação, não detecção

- `muted_types` filtra o briefing e o digest WhatsApp, mas o motor continua calculando e persistindo todos os sinais.
- Motivo: preservar histórico auditável e permitir que o dono reveja um tipo silenciado no feed.
- Reabrir se houver demanda por reduzir custo do motor por empresa.

## TA-INTELLIGENCE-02 — Digest no cron diário

- A conta Vercel atual é Hobby e não aceita crons horários. O resumo WhatsApp é disparado pelo `/api/cron/intelligence-daily` após o processamento dos sinais.
- A preferência de horário sai da V1; uma futura migração para Pro pode reintroduzi-la sem mudar o contrato de opt-in ou idempotência.

---

## Promovido para a próxima sprint — 3 críticas a resolver (2026-06-02)

> Estas 3 críticas saíram de uma revisão em 2026-06-02 e foram **commitadas para a próxima sprint**.
> Não são itens novos: consolidam TA/DT já existentes (abaixo), reordenados por risco real, mais uma
> lacuna de teste ainda não catalogada. Ao iniciar cada frente, mova o trabalho para [[FIXES_PROGRESS]];
> se reabrir uma decisão, atualize o TA/DT correspondente aqui.

### SPRINT-1 — Quebrar os god-components, começando pelo fluxo de pagamento

> Backlog excluído da meta ativa do audit em 2026-08-13. A decisão não apaga
> a dívida; apenas impede que ela seja executada como parte deste trabalho de
> contenção/reconciliação.

- **Crítica:** `src/routes/app/mesas/[id]/+page.svelte` (~3.400 linhas / ~124 KB) concentra estado, UI e
  regra de negócio inline, sem componentes filhos. `relatorios` (~96 KB), `gestao/produtos` (~88 KB) e
  `assinatura` (~80 KB) seguem o mesmo padrão.
- **Consolida:** `DT-ARCH-01`.
- **Registro histórico:** em 2026-06-02 a prioridade de `DT-ARCH-01` subiu de *baixa* para *ativa*. Os juros **já estão
  sendo pagos** — os 133 warnings de `svelte-check` (`DT-QUALITY-01`) se concentram nesses arquivos, e o
  fluxo de pagamento (maior risco de receita) é o trecho mais ilegível do maior arquivo.
- **Plano de ação:**
  1. Extrair o fluxo de pagamento/comanda de `mesas/[id]` para componentes dedicados (puxar lógica do
     `+page.svelte` para fora, reusando `ModalPagamento`).
  2. Isolar o estado de pagamento num store/composable testável.
  3. Repetir o padrão em `relatorios` e `gestao/produtos` só depois que `mesas` estabilizar.
- **Definição de pronto:** `mesas/[id]` abaixo de um teto de linhas acordado, fluxo de pagamento com teste
  de unidade próprio, warnings do arquivo zerados.

### SPRINT-2 — Defesa em profundidade em acessos (parar de depender só do RLS)

- **Crítica remanescente:** permissão por papel ainda é gating de UI em várias superfícies e o `admin-dashboard` fala
  direto com Supabase via anon key. Ainda há gaps de defesa em profundidade nas superfícies não migradas:
  uma policy de RLS mal configurada continua sendo crítica em módulos sem enforcement de papel. Os testes
  também não cobrem escalonamento de papel nem edição concorrente de forma ampla.
- **Consolida:** `TA-SEC-01`, `TA-SEC-02`, `TA-ARCH-01`, `TA-DATA-02` + lacuna de testes (nova).
- **Progresso (2026-08-12):** o PIN foi movido para `/api/auth/admin-pin`; o módulo de Despesas agora
  aplica `despesas.visualizar`/`despesas.gerenciar` no RLS e o catálogo base
  aplica `produtos.gerenciar` em mutações, sem alterar owners, leituras do PDV
  ou o papel Gerente. Snapshots e smokes owner/anon/subusuário/Gerente estão
  em [[FIXES_PROGRESS]].
- **Plano de ação remanescente:**
  1. Repetir enforcement server-side nas próximas mutações sensíveis por módulo, uma por vez.
  2. Listar as tabelas do admin sem RLS e mover mutações críticas para handlers server-side quando houver
     consumidor real que justifique o blast radius.
  3. Adicionar testes de **escalonamento de papel** (subusuário não eleva o próprio cargo; titular não é
     trancado por subusuário) e de **edição concorrente** (dois operadores, mesmo caixa/produto).
- **Definição de pronto:** mutação sensível recusada no servidor para papel sem permissão, com teste
  cobrindo o caminho negado.

### SPRINT-3 — Trocar invariantes-por-convenção por enforcement (dinheiro + LGPD)

- **Crítica remanescente:** o purge de conta depende de sweeper externo; a fonte do ZeloChat foi
  localizada, mas deploy/monitoramento ainda não foram confirmados. Os itens de billing foram tratados:
  reativação fail-closed, índice de linha viva e verificação Pix sem fallback embutido.
- **Consolida:** `TA-OPS-01`, `TA-DATA-01`, `DT-RELIABILITY-01`, `DT-SEC-01`.
- **O que muda agora:** confirmar o sweeper de deleção (LGPD é a maior
  exposição); os demais são quick wins.
- **Plano de ação:**
  1. Localizar o sweeper que consome `deletion_scheduled_at` (provável ZeloChat), documentar owner +
     monitoramento e escrever runbook de reconciliação (`TA-OPS-01` / OPS-DELETE-01).
  2. Manter o runbook de reconciliação e observar a operação externa; não duplicar o sweeper sem evidência.
- **Definição de pronto parcial:** reativação com caminho de falha explícito, uma linha viva por titular
  e webhook Pix sem fallback silencioso já estão concluídos; sweeper continua pendente de confirmação operacional.

---

## Progresso de RBAC (2026-08-12)

O histórico de fechamentos (`caixa_fechamentos`) agora exige `relatorios.ver`
para SELECT de subusuários; owners continuam com bypass e service-role não muda.
As tabelas compartilhadas do PDV/caixa permanecem owner-scoped nesta fatia para
não quebrar consumidores operacionais; um report API/RPC dedicado seria outra
decisão, não uma consequência automática desta migration.

Criação de venda agora exige `pdv.vender` e `pdv.receber` no caminho POS/
offline e no INSERT direto não-Mesa. O fechamento de Mesa continua separado e
exige `mesas.fechar`; o guard identifica o caminho SECURITY DEFINER sem expor
um atalho de payload `tipo_pedido = 'mesa'`. O custo é que subusuários que
antes contornavam a UI deixam de criar vendas; owners e service-role continuam
com o comportamento anterior.

Operação de Mesas agora separa abertura, edição, fechamento e cancelamento
por capabilities existentes (`mesas.abrir_comanda`, `mesas.editar_itens`,
`mesas.fechar`, `mesas.cancelar`). Triggers foram usados para comparar estado
anterior/novo e proteger campos financeiros que uma policy de UPDATE não
consegue distinguir sozinha. O custo é um corte de comportamento para
subusuários sem a capability correta; owners e service-role mantêm o bypass.

Pagamentos parciais de Mesas agora exigem `mesas.acessar` e `pdv.receber` ou
`pedidos.receber` para INSERT/UPDATE/DELETE tanto no pagamento quanto no ledger
de alocação. SELECT, fechamento completo e comandas/itens continuam separados
para não misturar esta correção com o RPC de venda e o fluxo financeiro maior.

Caixa agora consulta `caixa.abrir`, `caixa.fechar` e `caixa.movimentar` no RLS
para mutações autenticadas. Delete de caixa continua reservado ao titular;
leituras e service-role não mudaram. A próxima superfície deve ser avaliada
separadamente, sem assumir que o RPC compartilhado de vendas pode receber uma
permissão adicional sem revisar seus consumidores.

Cancelamento de vendas agora é enforcement no RLS: subusuário sem
`pdv.cancelar` não altera/remover histórico financeiro, enquanto o rollback
transacional estreito do fechamento de Mesa permanece permitido. A criação e o
recebimento de vendas continuam separados e serão avaliados em outra fatia.

`access_users` agora separa CRUD do titular de self-SELECT do subusuario. O
tenant continua owner-scoped, mas o proprio vinculo de acesso nao pode mais
ser alterado pelo subusuario via Data API; convites e ativacao continuam
server-side. Isso reduz o bypass de escalonamento sem transformar o modulo em
uma refatoracao ampla.

Além de Despesas e do catálogo base, Pessoas agora exige `pessoas.gerenciar`
para writes diretos de subusuários. Leituras permanecem owner-scoped porque
Caixa/Atendente precisam selecionar clientes no PDV e Mesas. O restante das
superfícies client-side continua backlog incremental, sem refatoração ampla.

## Tradeoffs aceitos

### TA-SEC-01 — Permissão por papel é gating de UI, não RBAC forte no servidor

- **O que deixamos na mesa:** enforcement real de permissão por cargo no servidor, rota por rota.
- **O que ganhamos:** velocidade de entrega do add-on Acessos e um modelo simples (RLS escopa por
  *owner*, UI esconde o que o papel não pode).
- **Custo aceito:** um subusuário tecnicamente capaz consegue contornar restrições de *papel* via API,
  mesmo sem conseguir sair da empresa dona (o RLS owner-scoped continua valendo — inclusive em
  `expenses`, endurecido em 2026-06-01).
- **Por que é tolerável hoje:** o tenant está protegido por owner; o vazamento possível é *entre papéis
  da mesma empresa*, não entre empresas. O titular já confia nos próprios funcionários.
- **Gatilho de revisão:** primeiro cliente enterprise que exija separação forte de funções, ou qualquer
  incidente de subusuário abusando de permissão. Ver finding P1 em [[CODE_REVIEW]] e [[docs/modules/ACESSOS]].
- **Status (2026-06-02):** gatilho puxado por decisão — agendado em SPRINT-2 (enforcement server-side das mutações sensíveis).

### TA-SEC-02 (resolvido 2026-08-12) — `AdminLock` / `pin_admin` era trava de conveniência

- **Resolução:** o valor não é mais selecionado no cliente; GET/POST server-side resolvem o titular,
  com comparação constante, rate limit e alteração somente pelo owner. O round-trip é deliberado para
  que o PIN seja uma barreira real de defesa em profundidade.

### TA-OPS-01 — Purge final de conta depende de sweeper externo (fora deste repo)

- **O que deixamos na mesa:** purge garantido dentro do próprio app/repo.
- **O que ganhamos:** o app só *agenda* a deleção (grace de 14 dias) e cancela Stripe; a execução pesada
  fica num processo separado, mantendo o request de deleção simples e reversível.
- **Custo aceito:** se o sweeper externo não existir ou parar, contas ficam presas em estado
  intermediário — risco operacional e de LGPD.
- **Por que é tolerável hoje:** a janela de 14 dias dá folga para reconciliar manualmente.
- **Gatilho de revisão:** confirmar onde o sweeper roda (provável ZeloChat) e ter monitoramento. Enquanto
  não confirmado, continua sendo **risco**, não tradeoff limpo — ver OPS-DELETE-01 em [[FIXES_PROGRESS]]
  e finding P1 em [[CODE_REVIEW]].
- **Status (2026-06-02):** agendado em SPRINT-3 como item de maior prioridade (exposição LGPD).

### TA-ARCH-01 — `admin-dashboard/` fala direto com Supabase via anon key

- **O que deixamos na mesa:** uma camada server-side própria para o admin.
- **O que ganhamos:** dashboard interno entregue rápido, reusando o Supabase já existente.
- **Custo aceito:** o painel usa anon key no browser e depende de `super_admins` + policies RLS; qualquer
  relaxamento de policy pode expor operação sensível no cliente. A verificação de produção confirmou RLS
  ativo nas tabelas administrativas relevantes, então não há ausência de RLS confirmada neste momento.
- **Por que é tolerável hoje:** público restrito (operação interna), superfície pequena.
- **Gatilho de revisão:** crescer o time de admin ou mover mutações críticas para handlers server-side.
  Ver finding P1 em [[CODE_REVIEW]].

### TA-DATA-01 (resolvido 2026-08-12) — “Última linha vence” em `subscriptions`, sem constraint única por `user_id`

- **Resolução:** o índice parcial `subscriptions_one_live_row_per_user` impede mais de uma linha viva
  por titular e mantém estados terminais como histórico append-only. O contrato de leitura existente
  continua compatível; snapshot pré-mudança e rollback estão documentados.

### TA-DATA-02 — Migrations em `.ai/migrations/`, sem snapshot único do schema de produção

- **O que deixamos na mesa:** uma fonte única e versionada do schema (`supabase/migrations/` + dump).
- **O que ganhamos:** fluxo de migration leve, sem amarrar a um pipeline formal de Supabase.
- **Custo aceito:** a verdade do banco fica espalhada entre código, docs e SQLs avulsos; produção precisa
  ser inferida, não lida.
- **Por que é tolerável hoje:** projeto ainda em evolução rápida; o custo de formalizar agora supera o
  benefício.
- **Gatilho de revisão:** quando o schema estabilizar ou num incidente que exija reconstruir o estado.
  Ver finding P2 em [[CODE_REVIEW]].

### TA-INFRA-01 — Dois apps, dois Svelte (5 no principal, 4 no admin)

- **O que deixamos na mesa:** stack unificada e dependências compartilhadas.
- **O que ganhamos:** o admin evolui sem arrastar risco para o produto do cliente, e vice-versa.
- **Custo aceito:** duplicação de padrões, dois ciclos de upgrade, conhecimento dividido.
- **Por que é tolerável hoje:** o admin é interno e muda pouco.
- **Gatilho de revisão:** quando o custo de manter dois mundos passar do custo de unificar.

### TA-OFF-01 — Janela de carência de 7 dias no gate de assinatura offline

- **O que deixamos na mesa:** revalidação online obrigatória a cada cold-start do PDV.
- **O que ganhamos:** o operador não é mais expulso para `/assinatura` quando a rede oscila (caso da
  fábrica do Agreste Salgados). `ensureActiveSubscription` reusa o último entitlement validado quando — e
  só quando — a falha é de rede (`isNetworkError`); negativo confirmado pelo servidor segue redirecionando.
- **Custo aceito:** uma assinatura cancelada/expirada continua acessível offline por até 7 dias desde a
  última validação online bem-sucedida (por dispositivo, snapshot em localStorage).
- **Por que é tolerável hoje:** a carência é curta, o snapshot só nasce após confirmação positiva, e a
  receita real depende de cartão/Pix recorrente — não de quem consegue abrir o PDV. Não é bypass eterno.
- **Gatilho de revisão:** abuso real observado, exigência regulatória de corte imediato, ou suporte a
  multi-dispositivo que torne o snapshot por navegador insuficiente. Ver [[docs/operations/OFFLINE]].

### TA-OFF-02 — Venda offline não bloqueia por estoque

- **O que deixamos na mesa:** validação de estoque no momento da venda quando não há rede.
- **O que ganhamos:** a venda offline sempre conclui; a baixa e a checagem ficam para o sync (RPC atômica).
- **Custo aceito:** oversell possível se duas máquinas venderem o mesmo item offline — a primeira que
  sincroniza consome o estoque; a segunda pode falhar no replay.
- **Por que é tolerável hoje:** o público-alvo do modo offline é loja/fábrica com um caixa só. Baixo risco real.
- **Gatilho de revisão:** clientes com múltiplos caixas simultâneos offline. Aí entra baixa otimista local
  com reconciliação. Ver [[docs/operations/OFFLINE]].

---

## Dívida técnica conhecida

### DT-BILLING-01 — Preços no prompt de suporte são copy literal, não lidos de `pricing.js`

- **Estado:** o drift de `R$ 20` → `R$ 30` foi corrigido manualmente (FX-SUPPORT-01 em
  [[FIXES_PROGRESS]]), mas o texto continua hardcoded em [src/routes/api/chat/support/+server.js](/home/vinicius/code/zelopdv/src/routes/api/chat/support/+server.js:26).
- **Juros:** cada mudança de preço pode reabrir o drift; o bot pode mentir preço sem ninguém perceber.
- **Conserto certo:** montar a seção de preços do prompt a partir do catálogo canônico em
  [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:7).
- **Custo de conserto:** baixo. **Prioridade:** média (toca comunicação de preço ao cliente).

### DT-RELIABILITY-01 — Reativação de conta não falha fechada se o Stripe recusar

- **Estado:** [src/routes/api/account/reactivate/+server.js](/home/vinicius/code/zelopdv/src/routes/api/account/reactivate/+server.js:28)
  limpa `deletion_scheduled_at` localmente mesmo se `cancel_at_period_end=false` falhar no Stripe.
- **Juros:** usuário parece reativado enquanto a assinatura segue cancelando no fim do ciclo.
- **Conserto certo:** falhar fechada ou gravar estado de reconciliação pendente para o suporte.
- **Custo de conserto:** baixo/médio. **Prioridade:** média. Ver finding P2 em [[CODE_REVIEW]].
- **Status (2026-06-02):** agendado em SPRINT-3.

### DT-SEC-01 — Fallback de `DEFAULT_ABACATEPAY_PUBLIC_KEY` hardcoded no webhook Pix

- **Estado:** se `ABACATEPAY_PUBLIC_KEY` faltar, a verificação usa uma chave embutida em
  [src/lib/server/billingPix.js](/home/vinicius/code/zelopdv/src/lib/server/billingPix.js:5).
- **Juros:** ambiguidade na trust boundary do webhook; difícil garantir que o ambiente está correto.
- **Conserto certo:** confirmar com a AbacatePay se o fallback é oficial. Se não for, remover o default e
  falhar fechado.
- **Custo de conserto:** baixo (depende de 1 confirmação externa). **Prioridade:** média. Ver finding P2
  em [[CODE_REVIEW]].
- **Status (2026-06-02):** agendado em SPRINT-3.

### DT-QUALITY-01 — 133 warnings de `svelte-check`

- **Estado:** `npm run check` passa com `0 errors / 133 warnings`, concentrados em páginas grandes.
- **Juros:** ruído esconde regressões reais e dívida de a11y; a barra de qualidade fica ambígua.
- **Conserto certo:** tratar por lotes, começando por fluxos operacionais e componentes compartilhados.
- **Custo de conserto:** médio (incremental). **Prioridade:** baixa/média. Ver finding P2 em [[CODE_REVIEW]].

### DT-ARCH-01 — Hotspots gigantes concentram lógica em arquivos únicos

- **Estado:** `mesas/[id]` (~124 KB), `relatorios` (~96 KB), `gestao/produtos` (~88 KB) e outros.
- **Juros:** onboarding lento, merges frágeis, regressão lateral, difícil paralelizar trabalho.
- **Conserto certo:** decompor por superfícies de domínio, não por “limpeza geral”.
- **Custo de conserto:** alto. **Prioridade:** ~~baixa, mas crescente~~ → **ativa** (reclassificada em
  2026-06-02). Ver finding P3 em [[CODE_REVIEW]] e os hotspots listados em [[CLAUDE]].
- **Status:** backlog arquitetural excluído da meta ativa em 2026-08-13; só
  retomar por decisão própria, começando pelo fluxo de pagamento de
  `mesas/[id]`.

### DT-SEC-02 (resolvido 2026-08-14) — Bypass de `service_role` inerte nos triggers RBAC que leem o GUC legado

- **Resolução:** `20260814210000_rbac_guards_service_role_detection_fix.sql`
  recria os quatro guards com detecção em dois valores e corrige, de quebra, as
  mensagens com UTF-8 duplamente codificado que chegavam ao toast do operador.
  Aplicada em produção via `supabase db push --linked`; ledger conferido.
  Verificação de não-regressão: o caminho SECURITY DEFINER de
  `criar_venda_completa` continua exigindo `pdv.vender` + `pdv.receber`, porque
  uma chamada autenticada do browser reporta role `authenticated` mesmo com
  `current_user = 'postgres'`. Registro histórico abaixo.
- **Estado (antes):** `20260812233000` (mesas/comandas), `20260813000000` (criação de
  venda), `20260813030000` e `20260813031000` (desconto) detectam service-role
  com `current_setting('request.jwt.claim.role', true)`. O PostgREST não
  popula mais esse GUC desde a v9, então a variável é sempre NULL e o bypass
  nunca dispara. Guardam o valor como `text`, não como boolean, então não
  sofrem a propagação de NULL que causou INC-2026-08-14-01 — o efeito é só o
  bypass morto.
- **Juros:** hoje é latente, porque nenhuma rota server-side cria venda ou
  desconto via service-role (`src/routes/api/` não chama
  `criar_venda_completa` nem insere em `vendas`). No dia em que existir, o
  trigger cai em `auth.uid() is null` e levanta `Usuario nao autenticado`
  (28000) — outra falha total de fluxo, igual à de 14/08.
- **Conserto certo:** migration forward-only trocando as quatro declarações
  pelo padrão já adotado em `20260813095000` e no hotfix `20260814200000`:
  `coalesce(current_setting('role', true) = 'service_role', false)`, com o GUC
  legado só como fallback dentro de `coalesce`.
- **Custo de conserto:** baixo. **Prioridade:** média — fazer antes de expor
  qualquer criação de venda/desconto server-side. Ver INC-2026-08-14-01 e
  FX-MESAS-COMANDA-SERVICE-FLAG-01 em [[FIXES_PROGRESS]].

---

## Como manter este arquivo

- Ao fechar um item de [[CODE_REVIEW]] deixando dívida residual, registre o que sobrou aqui (TA ou DT).
- Ao decidir conscientemente *não* consertar algo, registre como **TA** com o gatilho de revisão.
- Quando um gatilho de revisão disparar, mova o item de volta para [[CODE_REVIEW]]/[[FIXES_PROGRESS]] como
  trabalho ativo.
