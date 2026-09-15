# Onboarding em dois passos — plano de execução

> Artefato visual (mesmo conteúdo, formato de leitura):
> https://claude.ai/artifact/TigsUMdoyes8jrmj12hPS8
>
> Estado: **Fase 1.2 feita e commitada.** O resto está por fazer.
> Última atualização: 2026-09-15.

## O problema, medido

Consulta ao banco de produção em 14/09/2026, janela de 180 dias:

| | |
|---|---|
| Contas criadas | 38 |
| Concluíram o wizard | 28 (74%) |
| **Travaram sem perfil, sem trial, sem acesso** | **10 (26%)** |
| Dessas, voltaram ao produto depois e travaram de novo | 7 |

Não é ruído: as 10 confirmaram e-mail, e 7 voltaram — a coorte de maio levou em
média ~7 dias entre cadastro e último login. Pessoas que voltaram uma semana
depois, bateram na mesma parede e foram embora.

`tem_assinatura` = 28, exatamente os mesmos que concluíram. Isso prova o
acoplamento: **o trial só nasce no `finalizar()` do wizard**. Quem desiste no
passo 3 fica com conta sem trial, e todo `/app` e `/gestao` devolve para
`/perfil?msg=complete`.

O wizard faz **um único `upsert`, no fim** — por isso não se sabe em qual passo
as 10 desistiram. A informação nunca existiu.

## Decisões fechadas

| Decisão | Resultado |
|---|---|
| Passo 1 | Nome da loja — obrigatório |
| Passo 2 | WhatsApp — obrigatório (é o canal de suporte e da oferta de setup assistido) |
| CPF/CNPJ | **Opcional.** Sai do wizard. Pedido inline no Pix, uma vez, e salvo |
| Largura de bobina | **Sai do wizard.** 80mm por padrão, editável no perfil (já é hoje) |
| Dica de bobina no print | **Não fazer.** Os 5–10% de 58mm falam com o suporte |
| Trial | Continua nascendo no fim do passo 2 |
| Validador de telefone | **Fica como está.** Aceita fixo — e fixo recebe WhatsApp |
| Magic link | **Não migrar.** Ver seção de autenticação |
| Wizard × checklist | Dois artefatos. Wizard bloqueia (modal, 2 passos); checklist não bloqueia |

### Por que o CPF é opcional mas não pode sumir

- **Recibo:** já é condicional — `receipt.js:214,348,420` e `escpos.js:311,465,522`
  fazem `if (est.documento)`. Recibo sem CPF imprime normal.
- **Cartão:** o Stripe **não** coleta documento hoje. Não existe
  `tax_id_collection` na sessão de checkout. Quem barra é código nosso.
- **Pix:** exige de verdade. `billingPix.js:347` monta
  `customer: { name, email, taxId, cellphone: phone }`, e
  `validatePixCustomerProfile` (`billingPix.js:198`) barra antes.
  A AbacatePay não abre cobrança sem pagador identificado.

Depois do wizard de 2 passos, `validatePixCustomerProfile` já terá nome e
telefone. **Falta um campo só.**

## Fases

### Fase 1 — Destravar e medir (nada muda para quem usa)

**1.1 — Instrumentar o wizard atual** · ✅ **FEITO**

Evento por passo em `src/lib/components/OnboardingWizard.svelte`. Diz qual passo
derruba, com dado real.

Eventos (sem PII — nunca o valor digitado): `onboarding_wizard_step_viewed`
{ step, total_steps }, `onboarding_wizard_step_completed` { step, total_steps },
`onboarding_wizard_validation_failed` { step, total_steps, field },
`onboarding_wizard_step_back` { from_step }, `onboarding_wizard_completed`
{ total_steps, largura_bobina }, `onboarding_wizard_save_failed` { step, total_steps }.
`total_steps` separa o baseline de 4 passos do wizard de 2 passos da Fase 3.
Teste em `tests/posthogClient.test.js` garante que os seis atravessam o gate em `/perfil`.

Isto só funciona desde o commit `24e2f16`: antes, `/perfil` estava em
`BLOCKED_PREFIXES` e o `before_send` do `posthogClient.js` derrubava todo evento
disparado lá dentro. Agora o gate é por evento, não por rota.

> O baseline só vale se for medido **antes** da Fase 3. Se subir junto, o
> "antes" se perde e não há como provar que funcionou.

**1.2 — Partir o `requiredOk`** · ✅ **FEITO** (commit nesta branch)

`src/lib/profileUtils.js` agora expõe dois contratos:

- `operationalProfileOk({ nome_exibicao, contato })` — o mínimo pra abrir o
  caixa e falar com o cliente. Gate do `requireProfile` nos guards.
- `billingProfileOk({ documento })` — o mínimo pra cobrar. Checado no checkout.

`largura_bobina` saiu das duas checagens: todo consumidor já cai em `|| '80mm'`.

Call sites atualizados:

- `src/lib/guards.js:3,268,281` — o `select` também encolheu
- `src/routes/+layout.svelte:18,32,255` — **este é o muro mais duro**: redirect
  global, de qualquer rota, para `/perfil?msg=complete`
- `src/routes/perfil/+page.svelte:9,302,604` — `canSave` virou
  `operationalProfileOk(...) && documentoAceito`, onde `documentoAceito` aceita
  documento vazio mas exige validade quando preenchido

`tests/profileUtils.test.js` reescrito: 9 testes, verdes.

> Decisão deliberada: `contato` é checado por **presença**, não por validade —
> exatamente o critério do `requiredOk` antigo. Apertar aqui expulsaria pro
> wizard toda conta existente cujo telefone não normaliza.

**1.3 — Instrumentar a tela de login** · *a fazer*

Em 30 dias: `/login` teve 19 visitantes, **80 pageviews** e apenas 7
`user_logged_in`. 4,2 views por pessoa numa tela de login. Loop de redirect,
sessão expirando cedo, erro silencioso — não se sabe.

É pré-requisito da trilha de autenticação: não dá pra decidir sobre senha sem
saber o que são esses 80 pageviews.

### Fase 2 — Soltar o billing do cadastro (obrigatória antes da Fase 3)

**2.1 — CPF inline no Pix, persistido na criação da cobrança**

Em `src/routes/assinatura/+page.svelte`, etapa 3 (Pagamento) — não na etapa 2
(Add-ons), porque é dado de cobrança. Aparece só quando o perfil não tem.

Mandar `documento` no corpo de `POST /api/billing/pix/create`. O servidor valida
e **persiste como parte de criar a cobrança**.

> Sem auto-save no blur e sem botão separado: o "Gerar Pix" já é o botão de
> salvar. Auto-save no blur gravaria CPF meio digitado no perfil — e ele vai pro
> recibo. CPF inválido não grava nada; válido fica salvo pra sempre.

Hoje o servidor devolve `redirect: '/perfil?msg=complete'` e a tela joga a pessoa
**para fora do checkout**. Esse caminho tem que morrer.

**2.2 — Remover nosso gate de CPF no cartão**

`src/routes/api/billing/create-subscription/+server.js`: o
`if (!perfil?.documento)` sai. O comentário ali diz que o documento serve "pra
emitir nota fiscal" — o produto não emite NFC-e, o próprio wizard admite isso.

### Fase 3 — O wizard curto

**3.1 — De 4 para 2 passos, com a copy nova**

`src/lib/components/OnboardingWizard.svelte`: passos 3 (CPF) e 4 (bobina) saem.
`totalSteps` vira 2. O `upsert` continua gravando `largura_bobina: '80mm'`.

A bobina **não precisa de tela nova**: já é um campo editável em
`src/routes/perfil/+page.svelte:1162`.

### Fase 4 — Depois da porta

**4.1 — Checklist sem parede no `/gestao`**

Card no `/gestao`, onde a pessoa já cai — **não** uma rota de boas-vindas que
some depois do primeiro acesso. É onde CPF, logo e bobina passam a morar, e onde
"cadastre seu primeiro produto" cabe sem virar mais um passo de wizard.

**4.2 — Salvar por passo + corrigir a RPC do nudge**

As duas coisas sobem **juntas ou nenhuma sobe** (ver armadilha 2).

### Fase 5 — Resgate

**5.1 — Chamar os 10 órfãos de volta.** Só com a Fase 3 no ar — antes disso,
manda essas pessoas pra mesma parede.

### Paralela — Autenticação (independe das cinco fases)

**A.1 — Medir quanto do login já é Google.** O `GoogleAuthButton` já está em
`/cadastro` e `/login`.

**A.2 — OTP por WhatsApp como recuperação.** Mata o "esqueci a senha" sem trocar
o motor. `api/auth/pin-reset-otp` já chama `signInWithOtp` com limite de 5/dia —
o primitivo está em produção. E o envio sai por infra própria
(`ZELOCHAT_INTERNAL_SEND_URL`), a custo marginal quase zero.

> **Aberto:** OTP de autenticação por WhatsApp cai na categoria *authentication*
> da Meta. Status de aprovação da conta interna não verificado.

## Três armadilhas

### 1. Fase 2 antes da Fase 3 — não é preferência, é ordem obrigatória

Tirar o CPF do wizard antes do campo inline no Pix existir **quebra todo Pix de
cliente novo**: `validatePixCustomerProfile` falha, o servidor devolve 400 e a
pessoa é jogada pra fora do pagamento. No Brasil, com Pix, isso não é caso de
borda.

### 2. Salvar por passo desliga o e-mail de resgate, em silêncio

`admin_get_users_without_profile` seleciona por `p.user_id IS NULL` — pela
**ausência da linha** em `empresa_perfil`. No instante em que o passo 1 gravar o
nome, quem parar no passo 2 passa a ter linha, some do radar da RPC e nunca mais
recebe o nudge. Justamente quem mais precisa dele.

A RPC precisa mudar de "não tem linha" para "não tem perfil operacional"
(nome + contato), na mesma fatia.

### 3. `canSave` no perfil — ✅ já tratado na Fase 1.2

Era `requiredOk(...)` com `documento` dentro: ninguém salvava o perfil sem CPF.
Se o CPF virasse opcional sem isso mudar junto, a pessoa sem CPF ficaria
impedida de salvar qualquer coisa — inclusive o CPF que acabou de digitar.

## A copy

Escrita contra três princípios: cada campo justifica a própria existência
(Wroblewski); reescrever rótulo rende mais que cortar campo — no teste do
Aagaard, cortar 9 campos para 6 derrubou 14%, reescrever os mesmos 9 subiu
19,2%; botão com no máximo três palavras (Podmajersky).

### Passo 1

```
Passo 1 de 2
Como se chama sua loja?
É o nome que vai no recibo do seu cliente.

[ Ex: Lanchonete do João ]

Continuar
```

### Passo 2

```
Passo 2 de 2
Qual o seu WhatsApp?
É por onde a gente te ajuda. Se quiser, cadastramos seus produtos
junto com você — uns 15 minutos, sem custo.

[ (11) 98765-4321 ]

Começar a usar
```

A linha do setup assistido não é invenção: é o que
`enviarBoasVindasDetalhado` (`src/lib/server/whatsapp.js`) realmente manda no
dia 0. Específica, verificável, e o produto cumpre.

> **Não** existe linha sobre "gente, não robô": o robô responde mesmo.
> Promessa quebrada custa mais que promessa não feita.

### Erros

```
nome vazio       → Coloque o nome da loja.
telefone sem DDD → Faltou o DDD. Escreva os 11 números: (11) 98765-4321
falha ao salvar  → Não deu pra salvar agora. Confira sua internet e tente de novo.
```

Não existe erro de "esse número não recebe WhatsApp": fixo recebe.
E `Informe…` saiu — é a palavra mais ERP que existe, e ERP brasileiro é o risco
estético número um listado no `PRODUCT.md`.

### CPF inline no Pix

```
CPF ou CNPJ
O Pix precisa do documento de quem recebe. Fica salvo no seu perfil,
você digita uma vez só.

[ 000.000.000-00 ]
```

### Checklist no `/gestao`

```
Terminar de configurar
Nada disso trava o caixa. Faça quando sobrar um tempo.

☐ Cadastrar seu primeiro produto
☐ CPF ou CNPJ no recibo
☐ Logo da loja no recibo
☐ Largura da bobina — hoje em 80 mm
```

### Acoplamento de copy

O botão do passo 2 diz **"Começar a usar"** enquanto a pessoa cair no `/gestao`.
Quando o destino virar o PDV, vira **"Abrir meu caixa"** — a linguagem literal do
ritual diário do operador. Antes disso, seria mentira.

## Autenticação: por que não migramos pra magic link

Magic link elimina o reset de senha — não há o que resetar. Mas não elimina o
chamado: troca "esqueci minha senha", que é self-service e funciona, por **"não
chegou o e-mail"**, que não é self-service e você não conserta do seu lado.

| Razão | Por quê, neste produto |
|---|---|
| **Subusuário quebra** | `inviteSubUser` manda convite → `/redefinir-senha` → o funcionário define senha e entra no tablet compartilhado. Com magic link, todo início de turno dependeria do e-mail pessoal dele naquele aparelho. Num balcão de três turnos, não funciona. **Este sozinho decide.** |
| **É o login que mais depende de rede** | Senha autentica com um round-trip. Magic link precisa que o e-mail saia, seja entregue, não caia em Promoções, e que exista cliente de e-mail no aparelho. O produto tem replay offline justamente porque a conexão oscila. |
| **Pioraria o cadastro** | `/api/auth/signup` já devolve sessão e o cliente faz `setSession` — a pessoa digita a senha uma vez e entra direto. Magic link trocaria isso por "saia da página, vá no e-mail, volte". Com 82% mobile e 70% vindo de anúncio pago, tirar a pessoa da página é o movimento mais caro que existe. |
| **Não é o problema medido** | Em 30 dias, `/esqueci-senha` teve **2** visitantes. |

Caminho recomendado: e-mail+senha ou Google como identidade, **OTP por WhatsApp
como recuperação**. Código de 6 dígitos ganha de magic link aqui — a pessoa não
sai da página, e funciona em tablet de balcão sem cliente de e-mail.

## Como saber se funcionou

- **Norte:** % de contas criadas que completam o wizard. Hoje **74%** (28 de 38).
- **Ativação de verdade:** mediana entre cadastro e `first_sale_completed`.
  Completar cadastro não é ativação — vender é.
- **Guardrail:** `checkout_failed` com `reason: profile_incomplete`. Se disparar,
  a parede migrou pro pagamento em vez de sumir.
- **Guardrail:** % de perfis com WhatsApp preenchido. Se cair, a cadência de
  onboarding quebra — e ela é o motivo do passo 2 existir.
- **Guardrail:** chamados de recibo cortado. Custo assumido de tirar a bobina.

## Política de teste desta rodada

Decisão do dono do produto: **suíte completa roda uma vez, no fim das cinco
fases.** Velocidade acima de granularidade.

Custo medido, para a decisão ficar informada:

- suíte inteira: **180 s** (1.222 testes)
- arquivos de uma fase isolada: **< 1 s**

O que se paga por empilhar: quando abrir vermelho, o bisect é a pilha toda.
Superfícies de maior risco, por onde começar a investigar:

- `ensureActiveSubscription` (`src/lib/guards.js`) — gate primário de acesso
- `src/routes/api/billing/create-subscription/+server.js`
- `src/routes/api/billing/pix/create/+server.js`

Sugestão que não cobra velocidade: `npx vitest run tests/<arquivo>` da fase antes
de fechar cada uma. É um segundo e mantém o bisect barato.

## Trocas aceitas de propósito

- Perfis nascem com menos dado. Razão social, endereço e logo já eram opcionais;
  o CPF passa a ser.
- Quem paga no Pix ganha um campo no momento do pagamento — onde a intenção é
  máxima, e por isso o lugar certo pra cobrar fricção.
- Os 5–10% de bobina 58 mm vão imprimir um recibo cortado pelo menos uma vez.
- Nenhum evento cobre abandono dentro do checkout hospedado do Stripe — isso se
  mede por `stripe_checkout_created` sem `payment_confirmed`.
- Onde a pessoa cai depois do passo 2 continua sendo o `/gestao` vazio.
  Decisão de fase 2 do produto, fora deste escopo.
