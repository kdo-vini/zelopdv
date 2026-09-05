# Estação de impressão pelo navegador

## Objetivo

Permitir que uma operação iniciada em outro aparelho — principalmente celular
de garçom ou celular usado como frente de caixa — seja impressa na impressora
ligada ao computador da empresa. O computador permanece com uma área interna
do ZeloPDV aberta e com o Zelo Impressão em execução.

Esta solução reutiliza o agente Windows atual. O agente continua recebendo
trabalhos somente do navegador local em `127.0.0.1`; a aba autenticada do
ZeloPDV passa a ser a ponte entre o banco e esse agente.

## Experiência do usuário

Em Perfil → Integrações → Zelo Impressão, o usuário poderá ativar **Este
computador recebe impressões**. A preferência é local ao navegador e não muda
o comportamento dos demais aparelhos da empresa.

Quando ativada, a estação:

- verifica se o Zelo Impressão está aberto e pareado;
- informa no próprio ZeloPDV se está pronta, desconectada ou com erro;
- mantém presença no servidor enquanto a aba estiver aberta;
- busca trabalhos pendentes em qualquer rota interna do ZeloPDV;
- reserva cada trabalho antes de imprimir, evitando que duas abas imprimam a
  mesma coisa;
- registra se o agente confirmou o spool, recusou antes do spool ou devolveu
  resultado incerto.

Nos celulares e computadores que não forem estação, uma ação de impressão
primeiro verifica se existe um Zelo Impressão local. Se não existir e a falha
for comprovadamente anterior ao envio, o trabalho é colocado na fila remota.
O usuário recebe a mensagem **Enviado para o computador de impressão**. Se nem
o agente local nem a fila estiverem disponíveis, o fallback atual do navegador
continua disponível.

## Cobertura funcional

Todos os pontos que já usam `printService.js` entram na fila sem duplicar
regras nas telas:

- cupom da frente de caixa;
- pré-conta e recibo de fechamento de Mesa;
- movimentação de caixa;
- recibo de pagamento de fiado;
- reimpressões manuais.

Pedidos de cozinha usam o fluxo canônico já existente:

- pedido do ZeloMenu;
- pedido do ZeloChat/WhatsApp;
- item de Mesa enviado pelo garçom para a cozinha.

O observador de `zelo_orders`, hoje limitado à página `/app/pedidos`, será
montado globalmente nas áreas internas. Assim o computador pode permanecer na
Frente de Caixa, em Mesas ou em Gestão e ainda imprimir novos pedidos. A chave
canônica `owner + zelo_orders.id + order_ticket` continua sendo usada pelo
Zelo Impressão para impedir duplicidade.

Não serão criadas impressões automáticas para simples inclusão/edição de item
na Mesa. O bilhete de cozinha nasce quando o garçom usa **Enviar para cozinha**.
Abrir mesa, alterar quantidade e registrar pagamento parcial continuam sem
impressão automática; pré-conta e recibo continuam sendo ações explícitas.

## Dados persistentes

### `zelo_print_stations`

Representa um navegador autorizado a consumir trabalhos de uma empresa:

- `id` UUID gerado no navegador e persistido no `localStorage`;
- `owner_user_id` da empresa;
- `actor_user_id` da sessão que ativou a estação;
- `label` derivado do navegador/computador e editável no futuro;
- `last_seen_at` atualizado a cada 15 segundos;
- `enabled` e timestamps.

A chave primária é `(owner_user_id, id)`. Uma estação fica considerada online
quando `enabled = true` e seu último heartbeat ocorreu nos últimos 45 segundos.

### `zelo_print_jobs`

Guarda o envelope que o navegador entregará ao agente local:

- `id` UUID;
- `owner_user_id` e `requested_by`;
- `client_job_id`, único por empresa, para retry idempotente;
- `job_type` (`receipt`, `kitchen_order` ou outro tipo já aceito pelo agente);
- `payload` JSONB no contrato de `sendPrintJob`;
- estado `pending`, `claimed`, `spooled`, `failed`, `unknown` ou `expired`;
- estação e instante da reserva;
- tentativas, erro sanitizado e timestamps;
- expiração.

Recibos ESC/POS serão armazenados no formato Base64 já produzido pelo
`printService`. Pedidos de cozinha permanecem como texto. O banco rejeita
payload vazio ou maior que 256 KiB e expiração fora da janela permitida.

## Contratos transacionais

As operações são feitas por RPCs owner-scoped; o cliente nunca escolhe o
`owner_user_id`:

- `enqueue_zelo_print_job_v1(client_job_id, job_type, payload, expires_at)`
  deriva empresa e ator da sessão, valida o envelope e devolve a linha existente
  em retries;
- `heartbeat_zelo_print_station_v1(station_id, label, enabled)` registra a
  presença da estação da empresa da sessão;
- `claim_zelo_print_jobs_v1(station_id, limit)` usa lock com `skip locked`,
  recupera reservas abandonadas e devolve somente trabalhos da mesma empresa;
- `finish_zelo_print_job_v1(job_id, station_id, outcome, error_code, error_message)`
  aceita a conclusão somente da estação que mantém a reserva.

Uma reserva sem confirmação volta para `pending` após dois minutos somente se
o navegador comprovar que o POST ao agente local não começou. Resultado
`PRINT_OUTCOME_UNKNOWN` vira `unknown` e nunca é repetido automaticamente.

Os trabalhos comuns expiram após duas horas. Um trabalho expirado não imprime
quando o computador é ligado no dia seguinte; permanece visível para
reimpressão manual.

## Segurança

As duas tabelas terão RLS ativo e nenhuma permissão para `anon`. Usuários
autenticados acessam somente a empresa resolvida por `get_owner_user_id`.
As RPCs validam a sessão, a empresa, o ator e a posse da reserva. O payload não
aceita URLs, comandos ou nome livre de impressora vindo do celular; a impressora
é sempre a selecionada localmente no Zelo Impressão.

O conteúdo pode conter nome, telefone e itens do pedido. Ele permanece no
banco apenas durante a janela operacional e uma rotina de limpeza remove o
payload de trabalhos concluídos antigos, preservando metadados mínimos para
auditoria e deduplicação.

## Fluxo do navegador

`remotePrintQueue.js` será responsável por gerar IDs, serializar bytes,
enfileirar, fazer heartbeat, reservar e concluir trabalhos. Ele não renderiza
interface e recebe o cliente Supabase como dependência nos testes.

`RemotePrintStation.svelte` será responsável pelo ciclo de vida do consumidor:

1. confirmar preferência local e sessão autenticada;
2. resolver o owner pelo helper canônico de Acessos;
3. detectar o Zelo Impressão;
4. enviar heartbeat;
5. buscar até três trabalhos;
6. imprimir sequencialmente com `sendPrintJob`;
7. concluir cada trabalho de acordo com o resultado;
8. repetir após dois segundos, pausando quando a aba ou a rede estiverem
   indisponíveis.

`CanonicalOrderAutoPrinter.svelte` extrairá o observador atualmente contido em
`/app/pedidos`. Ele continuará usando a reconciliação de 15 minutos e a
deduplicação local existentes, mas ficará montado em todas as áreas internas.

## Falhas e mensagens

- Sem estação online: o trabalho continua `pending`; o celular informa que foi
  enviado, mas que aguarda o computador.
- Agente local fechado: a estação permanece online com estado de erro e não
  reserva novos trabalhos até o agente voltar.
- Impressora recusou antes do spool: o trabalho retorna para `pending` com
  backoff curto e limite de três tentativas.
- Resultado incerto: estado `unknown`, alerta persistente no PC e nenhuma nova
  tentativa automática.
- Duas abas ou computadores: somente uma reserva cada trabalho; o agente local
  mantém sua deduplicação adicional para pedidos automáticos.
- Logout ou troca de conta: heartbeat é desligado e nenhum trabalho da empresa
  anterior continua em memória.

## Compatibilidade e rollout

O modo remoto é opt-in por navegador. Quem não ativar uma estação mantém o
comportamento atual. O agente Windows 0.2.0 continua compatível e não precisa de
nova release.

A migration é aplicada antes do frontend. Depois do deploy, a Degust ativa a
estação no computador, deixa a aba interna aberta e executa uma impressão de
teste. O rollout deve validar uma venda pelo celular, um item de Mesa enviado à
cozinha, uma pré-conta e um pedido online, sempre conferindo o papel físico.

## Fora do escopo

- imprimir com o navegador completamente fechado;
- conexão direta celular → PC pela rede local;
- divisão de bilhetes por setor ou por impressora;
- impressão automática de toda alteração feita em uma Mesa;
- afirmar que o papel saiu apenas porque o spooler aceitou o trabalho.
