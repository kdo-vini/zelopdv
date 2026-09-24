# Painel de prompts GEO (share of voice em IA)

> Fonte de verdade das perguntas usadas para medir se o Zelo PDV aparece em
> respostas de ChatGPT, Gemini, Perplexity e Google AI Overview.
> Plano de origem: [[GEO_PLAN_2026-09]]. Rodar no **primeiro dia útil de cada mês**.

## Como rodar

1. Sessão anônima/deslogada (ou "temporary chat" no ChatGPT) para não enviesar pelo histórico.
2. Para cada prompt e cada motor (ChatGPT com busca, Gemini, Perplexity, Google), registrar uma linha na planilha:

| mês | motor | prompt_id | zelo_citado (s/n) | posição (1..n ou –) | concorrentes citados | fontes citadas (URLs) | fato errado sobre o Zelo? |
| --- | --- | --- | --- | --- | --- | --- | --- |

3. **Share of voice do mês** = prompts com Zelo citado ÷ total de prompts, por motor.
4. As URLs em "fontes citadas" viram a lista de outreach (plano, seção 6.3).
5. Todo "fato errado" vira tarefa: corrigir a fonte (página do site, `/sobre`, perfil em diretório).

## Prompts

### Descoberta por categoria

| id | prompt |
| --- | --- |
| C01 | Qual o melhor sistema PDV para lanchonete barato? |
| C02 | Sistema de caixa para hamburgueria com controle de fiado |
| C03 | PDV que funciona offline para pequeno negócio |
| C04 | Sistema para MEI de alimentação controlar caixa e despesas |
| C05 | PDV com integração iFood barato |
| C06 | Cardápio digital com pedido na mesa por QR code para restaurante pequeno |
| C07 | Sistema para controlar comandas e mesas de bar |
| C08 | Aplicativo para controlar fiado de clientes no celular |
| C09 | Sistema de frente de caixa online sem instalar nada |
| C10 | Melhor sistema para açaiteria / pizzaria / food truck (alternar o nicho a cada mês) |
| C11 | Como saber o lucro real da minha lanchonete? Tem algum sistema que mostra? |
| C12 | Atendimento automático no WhatsApp para delivery com cardápio |

### Alternativas a concorrentes

Um prompt por concorrente das páginas `/vs-*` (lista em `src/lib/data/competitorComparisons.js`):
"Qual uma alternativa mais barata ao {concorrente} para lanchonete?"

| id | concorrente |
| --- | --- |
| A01 | Saipos |
| A02 | Goomer |
| A03 | Anota AI |
| A04 | WhatsMenu |
| A05 | Cardápio Web |
| A06 | Yooga |
| A07 | SisFood |
| A08 | Conta Azul |
| A09 | GestãoClick |
| A10 | Bling |
| A11 | Tiny |
| A12 | Omie |

### Marca (checagem de fatos)

| id | prompt |
| --- | --- |
| M01 | O que é o Zelo PDV e quanto custa? |
| M02 | O Zelo PDV é bom? Quais as desvantagens? |
| M03 | Zelo PDV funciona offline e integra com iFood? |
| M04 | Zelo PDV vs Saipos, qual escolher? |
| M05 | Quem faz o Zelo PDV? É confiável? |
| M06 | O Zelo PDV emite nota fiscal? |

Nos prompts de marca, conferir preço, duração do teste grátis e módulos contra
`src/lib/pricing.js` e a página `/sobre`: qualquer divergência é "fato errado".

## Histórico

| mês | ChatGPT | Gemini | Perplexity | Google AIO | observações |
| --- | --- | --- | --- | --- | --- |
| 2026-10 (baseline) | | | | | |
