# PROJETO_RECEBIMENTOS_ABACATEPAY — Lojista recebendo de clientes finais (exploração)

> **Status: exploração / decisão futura. NÃO implementado.**
> Doc de avaliação para ter em mente no futuro. Não tratar como feature ativa.
> Data da análise: 2026-06-03. Validar taxas e disponibilidade de split com a AbacatePay antes de qualquer implementação — preços e features mudam.

---

## 1. Pergunta

Pode o ZeloPDV permitir que o **lojista** receba pagamentos dos **clientes finais** dele (Pix/cartão) dentro do PDV? O dinheiro cairia direto pro lojista ou o ZeloPDV receberia e repassaria? Quais taxas?

> Atenção ao escopo: hoje a AbacatePay no ZeloPDV é usada **só para o billing do próprio ZeloPDV** (cobrar a assinatura do lojista via Pix transparente — `src/lib/server/abacatePay.js`, com **uma única** `ABACATEPAY_API_KEY` que é a conta do ZeloPDV). Este projeto é o cenário inverso: a conta que recebe seria a **do lojista**, não a do ZeloPDV.

---

## 2. O que a AbacatePay oferece hoje (confirmado nos docs em 2026-06-03)

| Recurso | Existe? | Observação |
|---|---|---|
| Receber Pix (QR / copia-e-cola) | Sim | Cai **na hora** no saldo da conta |
| Receber cartão de crédito | Sim | Disponível em **D+32** (ou D+2 com antecipação) |
| Receber boleto | Sim | R$ 2,50 por emissão |
| Saque (payout) p/ chave Pix própria **ou de terceiro** | Sim | `POST /payouts/create` |
| Enviar Pix p/ terceiros (debita saldo) | Sim | `POST /pix/send`, **rate limit 1/min** |
| Consultar saldo (`available/pending/blocked`) | Sim | `GET /store/get` |
| **Split de pagamento (divisão automática entre recebedores)** | **NÃO ainda** | "em desenvolvimento / em breve" |
| Subcontas / marketplace nativo / onboarding de sub-recebedor | NÃO | Não existe na doc |

**Ponto central:** a AbacatePay **não tem split nem marketplace hoje**. Cada conta é uma loja única. Isso elimina, por enquanto, o modelo ideal (take-rate por transação) e restringe as opções viáveis.

---

## 3. Taxas (confirmadas em 2026-06-03 — revalidar antes de usar)

- **Pix recebido:** R$ 0,80 por transação (fixo, sem %). Dinheiro na hora.
- **Cartão:** 3,5% + R$ 0,60 (D+32). Antecipação D+2: ~5% + R$ 0,60.
- **Parcelado:** 2–6x → 4% + R$ 0,60; 7–12x → 4,5% + R$ 0,60.
- **Boleto:** R$ 2,50.
- **Saque/payout:** R$ 0,80 (1º ao 20º/mês), R$ 2,50 do 21º em diante. Mínimo R$ 3,50.
- **Enviar Pix a terceiro (`pix/send`):** `platformFee` (doc não cravou valor; na prática ~R$ 0,80). Mínimo R$ 1,00.
- Sem mensalidade, sem custo para gerar QR.

---

## 4. Modelos possíveis

### Modelo A — Cada lojista conecta a própria conta AbacatePay ("dinheiro direto") — RECOMENDADO

Lojista cria/conecta a conta AbacatePay dele; o ZeloPDV guarda a API key dele e gera as cobranças **na conta dele**. O dinheiro do cliente final cai **direto no saldo do lojista**; ele saca pro banco dele.

- **Repasse?** Nenhum. O ZeloPDV nunca toca no dinheiro.
- **Taxa por venda Pix:** R$ 0,80, paga pelo lojista. Sem dupla cobrança.
- **Risco regulatório p/ ZeloPDV:** ~zero. Não custodiamos dinheiro de terceiros.
- **Chargeback/fraude:** responsabilidade do lojista.
- **Monetização do ZeloPDV:** add-on de assinatura ("Receba pelo PDV") — **não** uma % por transação (sem split, não dá pra fatiar automaticamente).
- **Contras:** cada lojista faz onboarding/KYC na AbacatePay (fricção); precisamos guardar API keys por lojista com segurança (criptografia, escopo por owner).

**Único modelo seguro e viável hoje.**

### Modelo B — Conta única ZeloPDV recebe tudo e repassa ("nós repassamos") — NÃO RECOMENDADO

Cliente final paga → cai no saldo do **ZeloPDV** → ZeloPDV repassa pro lojista via `pix/send` ou payout.

Tecnicamente funciona, mas:

1. **Regulatório pesado:** ZeloPDV passa a custodiar/repassar dinheiro de terceiros = vira, na prática, **subadquirente/agregador** (obrigações Bacen conforme volume, PLD/AML). O dinheiro entra como **receita no CNPJ do ZeloPDV** (problema fiscal sério).
2. **Taxa dobrada:** R$ 0,80 receber + R$ 0,80 repassar = **R$ 1,60/transação** + reconciliação.
3. **Rate limit mata o modelo:** `pix/send` é **1 transferência/min** — inviável repassar a vários lojistas em pico.
4. **Float, fraude e chargeback concentrados no ZeloPDV.**

Só faria sentido como "carteira ZeloPDV" com licença de pagamentos — fora do escopo atual.

### Modelo C — Split nativo (ideal, mas ainda não existe) — AGUARDAR

Quando a AbacatePay lançar **split**, uma **única** cobrança divide automaticamente: maior parte direto pro lojista + uma % (take rate) pro ZeloPDV — sem custódia, sem dupla taxa, sem rate limit, monetizando por transação. É o modelo de marketplace correto. Desenhar a feature já pensando em migrar A → C.

---

## 5. Decisão (2026-06-03)

- **Não implementar agora.** Registro para ter em mente no futuro.
- Quando/se for fazer: **começar pelo Modelo A** (conta própria por lojista, dinheiro direto, monetização via add-on de assinatura).
- **Evitar o Modelo B** (repasse via conta única) — risco regulatório/fiscal + limites técnicos.
- **Acompanhar o Modelo C** (split): é a única forma limpa de cobrar take-rate por transação.

---

## 6. Esforço técnico do Modelo A (alto nível, para quando for priorizado)

- Onboarding: fluxo para o lojista conectar/criar a conta AbacatePay (link/instrução + colar API key, ou OAuth se a AbacatePay oferecer — **a confirmar**).
- Armazenar a key **por owner** com criptografia (não em texto puro), respeitando o tenancy de `docs/data/SCHEMA_RLS.md`.
- Generalizar `src/lib/server/abacatePay.js` para aceitar a key do lojista (hoje é fixa na env do ZeloPDV) — **não misturar** com o billing do próprio ZeloPDV.
- Gerar a cobrança Pix na venda (reusar `transparents/create`), webhook por conta de lojista, conciliar com `vendas` / `vendas_pagamentos`.
- UI seguindo `DESIGN_PATTERNS` antes de qualquer tela nova.

---

## 7. A validar diretamente com a AbacatePay antes de implementar

- Data/condições do **split** e se haverá take-rate/marketplace nativo.
- Existe **OAuth/connect** para o lojista autorizar sem colar API key manualmente?
- Valor exato do `platformFee` em `pix/send`.
- Política de KYC e limites por conta de lojista.
- Revalidar **todas** as taxas da seção 3 (mudam com o tempo).

---

## 8. Fontes consultadas (2026-06-03)

- AbacatePay — Documentação (welcome): https://docs.abacatepay.com/pages/start/welcome
- AbacatePay — Pricing: https://www.abacatepay.com/pricing
- AbacatePay — Criar Saque (payout): https://docs.abacatepay.com/pages/payouts/create.md
- AbacatePay — Enviar Pix (transferência a terceiros): https://docs.abacatepay.com/pages/pix/create.md
- AbacatePay — Detalhes da loja / saldo: https://docs.abacatepay.com/pages/store/get.md
- AbacatePay — índice da doc: https://docs.abacatepay.com/llms.txt
- AbacatePay — site (split "em breve"): https://www.abacatepay.com/
