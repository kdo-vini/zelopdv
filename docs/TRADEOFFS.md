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

---

## Promovido para a próxima sprint — 3 críticas a resolver (2026-06-02)

> Estas 3 críticas saíram de uma revisão em 2026-06-02 e foram **commitadas para a próxima sprint**.
> Não são itens novos: consolidam TA/DT já existentes (abaixo), reordenados por risco real, mais uma
> lacuna de teste ainda não catalogada. Ao iniciar cada frente, mova o trabalho para [[FIXES_PROGRESS]];
> se reabrir uma decisão, atualize o TA/DT correspondente aqui.

### SPRINT-1 — Quebrar os god-components, começando pelo fluxo de pagamento

- **Crítica:** `src/routes/app/mesas/[id]/+page.svelte` (~3.400 linhas / ~124 KB) concentra estado, UI e
  regra de negócio inline, sem componentes filhos. `relatorios` (~96 KB), `gestao/produtos` (~88 KB) e
  `assinatura` (~80 KB) seguem o mesmo padrão.
- **Consolida:** `DT-ARCH-01`.
- **O que muda agora:** a prioridade de `DT-ARCH-01` sobe de *baixa* para *ativa*. Os juros **já estão
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

- **Crítica:** permissão por papel é gating de UI, o PIN é comparado no cliente e o `admin-dashboard` fala
  direto com Supabase via anon key. Empilhados, esses tradeoffs deixam o sistema com **zero defesa em
  profundidade**: se uma policy de RLS for mal configurada, cai a única barreira real — e não há snapshot
  de schema para auditar o RLS contra uma fonte de verdade. Os testes também não cobrem escalonamento de
  papel nem edição concorrente.
- **Consolida:** `TA-SEC-01`, `TA-SEC-02`, `TA-ARCH-01`, `TA-DATA-02` + lacuna de testes (nova).
- **Plano de ação:**
  1. Enforcement server-side nas **mutações sensíveis** por papel (não só esconder na UI) — definir a
     lista de rotas/ações que exigem isso (responde à open question de [[CODE_REVIEW]]).
  2. Decidir o destino do PIN: validar no servidor sem expor o valor, **ou** rebaixar formalmente para
     "trava de balcão" e parar de chamá-lo de proteção.
  3. Listar as tabelas do admin sem RLS e mover mutações críticas para handlers server-side.
  4. Adicionar testes de **escalonamento de papel** (subusuário não eleva o próprio cargo; titular não é
     trancado por subusuário) e de **edição concorrente** (dois operadores, mesmo caixa/produto).
- **Definição de pronto:** mutação sensível recusada no servidor para papel sem permissão, com teste
  cobrindo o caminho negado.

### SPRINT-3 — Trocar invariantes-por-convenção por enforcement (dinheiro + LGPD)

- **Crítica:** garantias críticas dependem de convenção ou de processo externo, não de enforcement: o
  purge de conta depende de sweeper externo não confirmado (risco LGPD); `subscriptions` usa "última
  linha vence" sem constraint; a reativação não falha fechada; o webhook Pix tem chave hardcoded de
  fallback.
- **Consolida:** `TA-OPS-01`, `TA-DATA-01`, `DT-RELIABILITY-01`, `DT-SEC-01`.
- **O que muda agora:** ordenar por risco. **Primeiro** confirmar o sweeper de deleção (LGPD é a maior
  exposição); os demais são quick wins.
- **Plano de ação:**
  1. Localizar o sweeper que consome `deletion_scheduled_at` (provável ZeloChat), documentar owner +
     monitoramento e escrever runbook de reconciliação (`TA-OPS-01` / OPS-DELETE-01).
  2. `reactivate`: falhar fechada se o Stripe recusar `cancel_at_period_end=false`, ou gravar estado de
     reconciliação pendente (`DT-RELIABILITY-01`).
  3. Confirmar com a AbacatePay se `DEFAULT_ABACATEPAY_PUBLIC_KEY` é oficial; se não, remover o fallback e
     falhar fechado (`DT-SEC-01`).
  4. Decidir o contrato de `subscriptions`: constraint única por `user_id` **ou** registrar formalmente
     "última linha vence" e centralizar a leitura (`TA-DATA-01`).
- **Definição de pronto:** sweeper confirmado e monitorado; reativação com caminho de falha explícito;
  webhook Pix sem fallback silencioso.

---

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

### TA-SEC-02 — `AdminLock` / `pin_admin` é trava de conveniência, não barreira de segurança

- **O que deixamos na mesa:** validação de PIN no servidor com o valor nunca exposto ao cliente.
- **O que ganhamos:** UX simples para “travar” telas sensíveis sem round-trip e sem novo endpoint.
- **Custo aceito:** o PIN é legível por quem inspeciona o cliente (subusuário lê `empresa_perfil` via RLS).
- **Por que é tolerável hoje:** o objetivo real é evitar que um funcionário *casual* abra telas de gestão
  no balcão — não barrar um atacante técnico. É uma trava de balcão, não um cofre.
- **Gatilho de revisão:** se o PIN passar a proteger algo de valor real (ex.: estorno, sangria sem
  rastro). Ver finding P1 em [[CODE_REVIEW]].

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
- **Custo aceito:** a segurança depende de `super_admins` + ausência de RLS nas tabelas admin; qualquer
  relaxamento de policy expõe operação sensível no cliente.
- **Por que é tolerável hoje:** público restrito (operação interna), superfície pequena.
- **Gatilho de revisão:** crescer o time de admin ou mover mutações críticas para handlers server-side.
  Ver finding P1 em [[CODE_REVIEW]].

### TA-DATA-01 — “Última linha vence” em `subscriptions`, sem constraint única por `user_id`

- **O que deixamos na mesa:** uma invariante forte (uma linha viva por usuário) garantida no schema.
- **O que ganhamos:** flexibilidade de histórico append-only e menos atrito em migrações de billing.
- **Custo aceito:** entitlement, cancelamento e reconciliação dependem da convenção implícita
  `order(updated_at desc).limit(1)`, espalhada por guards, checkout, portal e Pix.
- **Por que é tolerável hoje:** produção atual não tem usuários com múltiplas rows.
- **Gatilho de revisão:** primeiro caso real de linhas duplicadas, ou antes de qualquer refactor de
  billing. Ver finding P2 em [[CODE_REVIEW]].

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
- **Status (2026-06-02):** agendado em SPRINT-1, começando pelo fluxo de pagamento de `mesas/[id]`.

---

## Como manter este arquivo

- Ao fechar um item de [[CODE_REVIEW]] deixando dívida residual, registre o que sobrou aqui (TA ou DT).
- Ao decidir conscientemente *não* consertar algo, registre como **TA** com o gatilho de revisão.
- Quando um gatilho de revisão disparar, mova o item de volta para [[CODE_REVIEW]]/[[FIXES_PROGRESS]] como
  trabalho ativo.
