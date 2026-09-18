# Root cause: Permissões=Ativo no Portal vs Merchant API vazia/403

**Data:** 2026-09-18  
**Escopo:** app centralizado de produção **Zelopdv** (`clientId` `cbfb1f1f-1664-4e7c-a38b-74e77b6619e1`)  
**Sintoma observado:** na aba **Permissões** do Developer Portal a loja **Bem Servido** aparece como **Ativo**; com `client_credentials` do mesmo app, `GET /merchant/v1.0/merchants` retorna `[]` e `GET /merchant/v1.0/merchants/{id}/status` retorna **403**. App marcado como **Parcialmente homologado**; homologação **Order/Events 60/60** concluída.  
**Método:** fontes primárias oficiais em [developer.ifood.com.br](https://developer.ifood.com.br). `WebFetch`/bots frequentemente batem em Cloudflare 403/404; conteúdo de páginas SPA foi validado via browser autenticado ao challenge (Chrome) e/ou fetch HTML quando disponível.

---

## Conclusão (veredito) — **confirmado por JWT + Portal 2026-09-18**

A UI **Permissões=Ativo** **não** basta para Merchant API. Medição com
`clientId`/`clientSecret` do Zelopdv (`cbfb1f1f-…`):

| Claim / chamada | Valor observado |
| --- | --- |
| `client_id` / `app_name` | `cbfb1f1f-…` / `zelopdv` (credencial correta) |
| Portal → Ver detalhes Bem Servido | **ID real** `d848b8aa-da9f-4003-9461-5c21ff47ec31` |
| Módulos autorizados no Portal | **Order + Events** apenas (Merchant ausente) |
| `merchant_scope` (JWT) | `d848b8aa-…:order` + `…:events` (bate com o Portal) |
| ID antigo no Zelo DB | `4e29e9a3-…` (**errado** — nunca esteve no grant) |
| `GET /merchants` | `200` `[]` (precisa módulo Merchant) |
| `GET …/d848b8aa-…/status` | `403` (mesmo com ID correto — sem `:merchant`) |
| Events polling | `200` com eventos de `d848b8aa-…` |

**Root cause (duas camadas):**

1. **Merchant ID errado no Zelo** (`4e29e9a3`) ≠ ID do Portal (`d848b8aa`).
2. **Módulo Merchant não homologado** — só Order/Events no grant → `/merchants`
   vazio e `/status` 403 mesmo com o ID certo. Order/Events **funcionam**.

**Ações:** conexão DB corrigida para `d848b8aa` + `active`; adapter Zelo passa
a ativar via JWT Order/Events; ticket iFood **#33599767** (Homologação Merchant).

**Descartado:** credencial errada, token stale sozinho, marketplace, “pendência
no Portal do Parceiro”.

---

## 1. O que “Ativo” na aba Permissões significa vs o que o token `client_credentials` enxerga

### O que a documentação diz sobre o fluxo centralizado

Em [Request access](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access):

1. **My Apps** → selecionar o app  
2. Aba **Permissions** → localizar loja por ID ou CNPJ  
3. Confirmar e enviar a solicitação  
4. Responsável da loja aprova no **Partner Portal** → “you access the store data **according to the registered modules**. **Generate a new `accessToken`.**”

Pré-condição na mesma página: *“To request access, you must complete the homologation process.”*

### O que a API enxerga

Em [Authentication — Introduction](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro):

- Após nova permissão: **solicitar um novo `access_token`**; esse token incluirá as permissões de **todos** os merchants autorizados.
- Verificação oficial sugerida:
  1. o app tem permissão no módulo **`merchant`**;
  2. consultar o endpoint de listagem de merchants;
  3. o novo merchant **aparece na lista**.
- Sem token novo, o token antigo **não** ganha a loja.

Em [Merchant — How it works](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/workflow):

- `GET /merchants` — “Lists all stores **linked to your token**”
- “The **token determines** which stores you can access via API.”
- `403 Forbidden` em detalhe/status: “**No permission** … **Token not linked to this store**”

Em [Authentication — Centralized](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/centralized):

- App centralizado usa `grantType=client_credentials` com `clientId`/`clientSecret`.
- O JWT de exemplo na própria página carrega escopos no formato `merchant_scope: ["<merchantId>:<module>"]` (ex.: `…:order`) e `scope: ["order"]` — evidência oficial de que o vínculo é **por merchant e por módulo**, não um booleano genérico “Ativo”.

### Interpretação

| Superfície | O que prova |
| --- | --- |
| Permissões = Ativo | Solicitação/aprovação registrada no lado Portal (merchant ↔ app). |
| `client_credentials` + `GET /merchants` | Merchants cujos escopos **Merchant** já estão no JWT atual. |
| `GET …/status` → 403 | Token autenticado, mas **sem vínculo** àquela loja (para esse recurso/módulo). |
| `GET …/status` → 401 | Token inválido/expirado (não é o sintoma atual). |

**Ativo ≠ “listMerchants já retorna a loja”.** Ativo é pré-condição de Portal; a prova de API é lista não vazia **após** token novo.

---

## 2. App “parcialmente homologado” pode autorizar na UI e a Merchant API negar?

### O que a política oficial separa

Em [Homologation policy (categories)](https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories):

- **“Automatic homologation — exclusive to Order and Events (Food). All other modules are homologated via ticket.”**
- Categoria **PDV** desbloqueia para homologação: Merchant, Events, Order, Catalog, Review, Shipping, Analytics.
- Merchant é o módulo de **Store status**; Order/Events são módulos distintos.

Em [Merchant — Homologation criteria](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/homologacao):

- Critérios próprios incluem `GET /merchants`, `GET /merchants/{id}`, `GET …/status`, interruptions e opening-hours.
- `403` na homologação Merchant = “No access to store / insufficient permission”.

Em [Request access](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access) + [Authentication intro](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro):

- Acesso pós-aprovação é **“according to the registered modules”**.
- Checklist de validação exige permissão no módulo **`merchant`** antes de confiar na listagem.

### O que a doc **não** afirma literalmente

Não há frase do tipo: *“parcialmente homologado sempre permite Ativo na UI e sempre nega Merchant API”*.

### O que a doc **implica** com alta confiança

Para o caso Zelopdv (Order/Events 60/60, status parcial, Merchant API `[]`/`403`):

- Homologação automática **não** cobre Merchant.
- Sem Merchant homologado/registrado no grant, a UI pode já mostrar autorização de parceiro enquanto o token **não** carrega escopo Merchant → listagem vazia e status 403.
- Isso é **compatível** com “parcialmente homologado” + Permissões Ativo + Merchant API muda.

**Resposta:** sim, esse gap é **plausível e alinhado** às regras oficiais de módulos; não é um bug inventado só no Zelo. A confirmação final é olhar o JWT (`merchant_scope` / `scope`) e o status de homologação do módulo Merchant no Portal.

---

## 3. Tempo de propagação e necessidade de novo `access_token`

Fonte: [Authentication — Introduction](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro) (e eco em [Financial best practices](https://developer.ifood.com.br/en-US/docs/guides/modules/financial/best-practices-and-troubleshooting)):

1. Sempre que o app recebe nova permissão → **pedir token novo**.
2. Propagação de authorize/revoke: **até 10 minutos**.
3. Se a loja ainda não aparece em `GET /merchants` → esperar 10 minutos e **gerar outro** `access_token`.

Centralizado: sem refresh token ([Centralized flow](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/centralized)); renovação = novo `client_credentials`. Validade: usar `expiresIn` (doc cita 3h na intro e 6h no fluxo centralizado — **não hardcodar**).

**Implicação para o incidente:** se o token em uso foi emitido antes do Ativo (ou nos primeiros minutos), `[]`/`403` é comportamento **esperado** pela doc, mesmo com Permissões Ativo.

---

## 4. App de teste vs app oficial (produção)

Fontes: [Create an application](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-app), [Create an account](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-account), FAQ na [home](https://developer.ifood.com.br/en-US):

| | App de teste | App de produção |
| --- | --- | --- |
| Criação | Automática no cadastro | Manual: Apps → New Application, **depois** homologar o de teste |
| Credenciais | `clientId`/`clientSecret` próprios | Outro par — **não** intercambiável |
| Lojas | Loja de teste / pedidos de teste | Lojas reais via request access pós-homologação |
| Tipo | Centralizado ou distribuído na criação | Idem (`Centralized (SaaS)` vs `Distributed`) |

No Zelo: o snapshot de contrato (`CONTRACT_SNAPSHOT.md`) provou Merchant `200` no **app de teste**; o runtime oficial usa o par do **Zelopdv**. Credenciais de teste **não** autorizam lojas de produção do app oficial, e vice-versa.

**Descartar como causa única** se as chamadas que falham usam de fato o `clientId` `cbfb1f1f-…` (e não o app de teste). **Não descartar** até conferir o `client_id` claim do JWT.

---

## 5. Marketplace público / publicação / módulos para `listMerchants`

### O que **é** requisito

- Módulo **Merchant** no app + permissão desse módulo no token ([Auth intro](https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro)).
- Homologação do Merchant (critérios em [Merchant homologation](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/homologacao)); política: não é automática com Order/Events ([categories](https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories)).
- Autorização do merchant + **token novo** ([Request access](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access)).

### O que **não** aparece como requisito de `GET /merchants`

Em [Create an application](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-app):

- **Visibility:** public (visível no marketplace) **ou** private.
- Listar para todos os parceiros **ou** exclusivo a clientes específicos.
- Category (PDV etc.) afeta quais módulos ficam disponíveis para homologação — não “só apps públicos listam merchants”.

`MARKETPLACE` em [Merchant operations](https://developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/operations) é **canal de vendas da loja** (app/site iFood), não “publicação do integrador na vitrine de apps”.

**Conclusão:** falta de publicação em marketplace público **não** é a causa mais provável do `[]`/`403`. Privacidade do app não substitui Merchant homologado + token com vínculo.

---

## 6. Caminho real de autorização no Portal do Parceiro (centralizado)

### Documentado

**Centralizado** ([Request access](https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access)):

- Início no **Developer Portal** (My Apps → Permissions → ID/CNPJ → enviar).
- Aprovação pelo responsável no **Partner Portal**.
- **Não** há deep link/menu detalhado (ex.: qual tela exata do parceiro) para o aceite da solicitação iniciada pelo integrador.

**Distribuído / userCode** (mesma página — **não** é o fluxo principal do Zelopdv centralizado):

- Partner Portal → **Services and solutions** → **Integrations** → **Activate application via code** → informar `userCode` → receber `authorizationCode`.

### Lacuna oficial

O caminho de menu do **aceite** da solicitação centralizada (o que o lojista clica após o integrador pedir por CNPJ/ID) **não está documentado** além de “approval in the Partner Portal”. Isso já estava registrado como pendência em `CONTRACT_SNAPSHOT.md` §1.

Para o sintoma atual, o Portal já mostra **Ativo** — o gap não parece ser “parceiro não autorizou na UI”; parece ser **módulo/token**.

---

## Causas ranqueadas

| Rank | Hipótese | Por que encaixa | Como falsificar rápido |
| --- | --- | --- | --- |
| **1** | Módulo **Merchant** não homologado / não presente no grant (“parcialmente homologado” = só Order/Events) | Política: auto-homologação só Order/Events; acesso “according to registered modules”; checklist exige módulo `merchant`; JWT exemplo é `merchantId:module` | No Portal: status de homologação **Merchant**. No JWT: existe escopo `merchant` / `merchantId:merchant`? Se Order/Events ok e Merchant ausente → causa confirmada |
| **2** | `access_token` **stale** (pré-autorização ou pré-propagação) | Doc manda token novo + até 10 min | Novo `client_credentials` **agora** (e de novo após ≥10 min do Ativo); repetir `GET /merchants` |
| **3** | Propagação incompleta isolada | Doc: até 10 min | Se após >10 min + token fresco ainda `[]`, desce de prioridade |
| **4** | Credenciais do **app de teste** / outro `clientId` | Apps têm pares distintos; teste já listava merchant | Claim `client_id` do JWT = `cbfb1f1f-…`? |
| **5** | `merchantId` errado no `/status` | 403 = “token not linked”; lista vazia reforça | Só confiar no UUID que vier de `GET /merchants` após grant real |
| **6** | App não listado no marketplace público | Doc permite private; request access não exige vitrine | Descartar como causa primária salvo orientação **não pública** do suporte iFood |

---

## O que descartar (com o que sabemos)

- **“Permissões=Ativo deveria bastar sem novo token”** — contradiz Request access + Auth intro.
- **“403 em `/status` significa loja fechada/offline”** — 403 é permissão/vínculo; estado operacional vem no JSON **200** (`OK`/`WARNING`/`CLOSED`/`ERROR`).
- **“Order/Events 60/60 libera Merchant API”** — política oficial separa Merchant (ticket) de Order/Events (automático).
- **“Precisa publicar no marketplace para listMerchants”** — não sustentado pelas páginas oficiais citadas.
- **“Credencial inválida”** — sintoma seria predominantemente `401`, não `200 []` + `403`.

---

## Próximos passos verificáveis (ordem sugerida)

1. **Emitir token fresco**  
   `POST …/authentication/v1.0/oauth/token` com `grantType=client_credentials` do Zelopdv → `GET /merchant/v1.0/merchants`.  
   Registrar horário vs horário do Ativo (Δt ≥ 10 min?).

2. **Inspecionar JWT (sem colar secret/token no Git)**  
   Conferir claims: `client_id`, `scope`, `merchant_scope` / equivalentes.  
   Esperado se Merchant ok: entrada da Bem Servido **e** módulo merchant.  
   Esperado se hipótese #1: só `order`/`events` (ou merchant ausente) → lista Merchant vazia.

3. **Portal Developer — Homologação**  
   Confirmar se **Merchant** está aprovado ou só Order/Events. Se só Order/Events: abrir/agendar homologação Merchant (ticket; critérios em [Merchant homologation](https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/homologacao)).

4. **Portal — módulos do app**  
   Em My Apps / credenciais: Merchant está entre os módulos registrados do Zelopdv (categoria PDV)?

5. **Smoke pós-correção**  
   - `GET /merchants` contém Bem Servido  
   - `GET /merchants/{id}/status` → **200** (não 403)  
   - Só então confiar em polling/events com `x-polling-merchants`

6. **Se 1–4 ok e ainda `[]`**  
   Ticket no suporte Developer com: `clientId`, merchantId/CNPJ, horário do Ativo, horário do token novo, HTTP `[]`/`403`, confirmação de módulo Merchant homologado. Pedir confirmação se grant parcial esconde Merchant até ticket.

7. **Não misturar apps**  
   Não validar produção com credenciais do app de teste (e o contrário).

---

## Fontes primárias usadas

| Tema | URL |
| --- | --- |
| Solicitar acessos (centralizado / Permissões / Partner Portal) | https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/request-access |
| Auth: token novo, módulo merchant, 10 min | https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro |
| Fluxo `client_credentials` + JWT exemplo | https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/centralized |
| Merchant: lista ligada ao token, 403 | https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/workflow |
| Critérios homologação Merchant | https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/homologacao |
| Política: Order/Events automático; demais via ticket; PDV inclui Merchant | https://developer.ifood.com.br/en-US/docs/getting-started/homologation/categories |
| App teste vs produção; visibility marketplace | https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-app |
| Conta → loja/app de teste | https://developer.ifood.com.br/en-US/docs/getting-started/first-steps/create-account |
| Roteiro “homologar → solicitar acessos” | https://developer.ifood.com.br/en-US |
| Canal MARKETPLACE (loja, não vitrine do app) | https://developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/operations |
| Eco 10 min / novo token | https://developer.ifood.com.br/en-US/docs/guides/modules/financial/best-practices-and-troubleshooting |

---

## Relação com docs internos

- `docs/integrations/ifood/CONTRACT_SNAPSHOT.md` — Merchant `200` no **app de teste**; lacuna do menu do Partner Portal para centralizado.
- `docs/operations/IFOOD.md` — cutover para credenciais Zelopdv; merchants de produção ainda precisam autorizar o app oficial.
- `docs/projects/IFOOD_INTEGRATION_REPORT.md` — já mapeava Merchant por ticket separado de Order/Events.

Este arquivo não altera runtime; é diagnóstico de plataforma iFood para o gap Permissões ↔ Merchant API.
