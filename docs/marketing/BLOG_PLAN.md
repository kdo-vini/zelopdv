# Plano do blog — conteúdo para ser citado por ChatGPT, Gemini e Perplexity

> Criado em 2026-09-24. Parte da Frente 2 (seção 5.3) do [[GEO_PLAN_2026-09.md]].
> Ver também [[GEO_PROMPT_PANEL.md]] para o painel de 30 prompts mensais.

## 1. Objetivo e KPIs

PostHog mostra que **ChatGPT é o canal de aquisição que efetivamente converte em cliente pagante**,
enquanto anúncios pagos não geraram nenhum cadastro em duas semanas. O blog estava parado desde
2026-05-20 (11 posts). A aposta deste plano é: conteúdo respondendo perguntas reais de dono de
lanchonete/restaurante, formatado para ser recuperável e citável por LLMs, é o canal de maior
retorno disponível agora.

**KPIs (acompanhar nos insights PostHog `09f33k0o` e `vIptaqqU`, tag `geo`):**

- % de cadastros com origem IA (declarada no onboarding + referrer classificado)
- Visitas de referrers de IA (chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com) por mês
- Conversão trial → pago da coorte "veio de IA" vs. outras fontes
- Share of voice no [[GEO_PROMPT_PANEL.md]] (30 prompts fixos, rodados mensalmente)
- Tráfego orgânico por post (Search Console, quando disponível) e páginas que geram mais cliques a partir de resultados de IA

## 2. Template do artigo

Todo post novo e todo post revisado deve seguir esta estrutura:

1. **Abertura resposta-primeiro (2–3 frases):** responde a pergunta do título logo no primeiro parágrafo, sem enrolação. É o trecho que um LLM mais provavelmente cita.
2. **Caixa de TLDR (`tldr: string[]`):** 3–5 bullets que respondem a pergunta central de formas diferentes (definição, número, decisão prática).
3. **H2 por pergunta:** cada seção responde uma sub-pergunta que a pessoa realmente faz (title matching com queries reais, não títulos genéricos de blog).
4. **Pelo menos uma tabela ou checklist** — formato que LLMs extraem com mais facilidade que prosa corrida.
5. **Links internos:** 1 página `/para-*` (segmento) + 1 `/vs-*` (comparação) ou `/extensoes` (add-on relevante) + `/sobre` quando fizer sentido citar os fatos canônicos do produto.
6. **FAQ (`faq: { question, answer }[]`):** 3–5 perguntas reais, resposta direta em texto simples (1–3 frases), sem HTML dentro da resposta.
7. **CTA suave no fechamento:** menção ao Zelo PDV como próximo passo natural, citando os `TRIAL_DAYS` dias grátis via interpolação de `$lib/pricing`, nunca número hardcoded.
8. **Cobertura de imagem:** 1 capa (`cover: { alt }`) + 1–2 figuras inline em posts novos, via `inlineFigure()`.

HTML permitido no `content`: `h2, h3, p, ul, ol, li, strong, em, a, table/thead/tbody/tr/th/td, blockquote, div.callout, figure` (via `inlineFigure`).

### Regra de fatos

- Fatos de produto (preço, o que o Zelo faz/não faz) só vêm de `src/lib/pricing.js`, `src/lib/data/productFacts.js` e `src/lib/data/extensoes.js`. Preços são interpolados via template literal (`${PLANS.pdv.price}`), nunca digitados.
- Números externos (taxa de app, limite MEI, DAS, dados de mercado) só entram no post depois de verificados contra fonte primária/oficial, com link inline e data de verificação anotada na seção 6 deste doc. Sem fonte confiável = sem número (usar faixa ou remover a afirmação).
- Sem depoimento ou cliente fictício. Exemplos ilustrativos são permitidos, sempre rotulados como exemplo ("imagine uma lanchonete que...").

## 3. Diretrizes de imagem

- **Capa:** toda página do blog (antiga e nova) recebe `cover: { alt: '...' }`. O arquivo vive em `/blog/<slug>/cover.webp` (nome real gerado pelo helper `coverImage()` em `src/lib/blog/images.js` — note que o contrato de arquivo usa o nome `cover`, não `capa`; este doc segue o código real).
- **Figuras inline:** cada post novo ganha 1–2 figuras via `inlineFigure({ slug, name, alt, caption })`, importado de `$lib/blog/images`.
- **Estilo do prompt:** cena editorial realista de um pequeno negócio de alimentação brasileiro (balcão, cozinha, gaveta de caixa, tablet com tela genérica de PDV, sacolas de delivery, potes de açaí etc). Nunca descrever texto, logos, marcas (nada de logo do iFood) ou números legíveis em tela. 1–3 frases em inglês, cena apenas — o gerador acrescenta o sufixo de estilo compartilhado.
- **Alt text:** sempre em português, descritivo do que aparece na cena (não da pauta do post).
- **Manifesto:** `scripts/blog-images.manifest.json` — lista plana `{ slug, name, prompt, alt }[]`. Toda capa e toda figura inline precisa de uma entrada. `name: 'cover'` para capas; nome descritivo em kebab-case para figuras inline (ex.: `estoque-critico`).
- **Geração:** `npm run blog:images` (mantido por outro agente/infra) lê o manifesto e gera os arquivos `.webp` em `static/blog/<slug>/`, nos tamanhos definidos em `src/lib/blog/images.js` (capa 1600×900, inline 1200×675, thumb 800px).

## 4. Calendário editorial — 12 semanas (~24 posts, 2/semana)

Clusters conforme GEO_PLAN seção 5.3. Todo post: FAQ + tldr + cover + links internos (`/para-*` do segmento mais próximo, `/vs-*` ou `/extensoes` relevante, `/sobre` quando citar fato de produto).

| Semana | Post | Pergunta-alvo / prompt | Keyword | Cluster | Links internos |
| --- | --- | --- | --- | --- | --- |
| 1 | *(feito nesta rodada)* Refresh dos 11 posts antigos | — | — | manutenção | ver seção 5 |
| 1 | *(feito nesta rodada)* Como diminuir a dependência do iFood sem perder vendas | "como vender menos dependente do iFood" | reduzir dependência ifood | iFood | `/para-delivery`, `/extensoes#menu`, `/sobre` |
| 2 | *(feito nesta rodada)* Ficha técnica e CMV: como calcular o custo de cada lanche | "como calcular CMV de lanche" | ficha técnica cmv lanchonete | Precificação/CMV | `/precificacao`, `/para-hamburguerias` |
| 2 | *(feito nesta rodada)* Cardápio digital com QR code: vale a pena? | "cardápio digital QR code vale a pena" | cardápio digital qr code restaurante | Cardápio e mesa | `/extensoes#menu`, `/extensoes#mesas` |
| 3 | *(feito nesta rodada)* MEI de alimentação: limite, DAS e o que controlar em 2026 | "MEI alimentação limite de faturamento 2026" | mei alimentação limite faturamento | MEI | `/para-mei`, `/sobre` |
| 3 | Balcão vs. iFood: qual canal dá mais lucro de verdade | "balcão ou iFood dá mais lucro" | balcão vs ifood lucro | iFood | `/para-delivery`, `/vs-saipos` |
| 4 | Como integrar o iFood ao caixa sem lançar pedido duas vezes | "como integrar iFood ao PDV" | integrar ifood pdv | iFood | `/extensoes#menu`, `/para-delivery` |
| 4 | Como organizar comandas em restaurante pequeno | "como organizar comandas de mesa" | organizar comandas restaurante | Cardápio e mesa | `/extensoes#mesas`, `/para-restaurantes` |
| 5 | Pedido na mesa sem garçom: como funciona e quando vale a pena | "pedido na mesa por QR code sem garçom" | pedido mesa sem garçom | Cardápio e mesa | `/extensoes#mesas`, `/vs-goomer` |
| 5 | CMV ideal para hamburgueria: qual a margem certa | "qual o CMV ideal de hamburgueria" | cmv ideal hamburgueria | Precificação/CMV | `/precificacao`, `/para-hamburguerias` |
| 6 | Como reajustar o preço do cardápio sem perder cliente | "como reajustar preço do cardápio" | reajustar preço cardápio lanchonete | Precificação/CMV | `/precificacao`, `/sobre` |
| 6 | MEI de alimentação precisa emitir nota fiscal? | "MEI precisa emitir nota fiscal" | mei emitir nota fiscal alimentação | MEI | `/para-mei`, `/sobre` |
| 7 | Como controlar estoque de lanchonete sem perder venda | "como controlar estoque de lanchonete" | controle de estoque lanchonete | Estoque e desperdício | `/para-lanchonetes`, `/vs-sisfood` |
| 7 | Como reduzir desperdício de insumos na cozinha | "como reduzir desperdício de comida no restaurante" | reduzir desperdício restaurante | Estoque e desperdício | `/para-restaurantes`, `/precificacao` |
| 8 | Como dar acesso ao caixa para funcionário sem risco | "como dar acesso ao caixa para funcionário" | acesso caixa funcionário | Equipe | `/extensoes#acessos`, `/para-lanchonetes` |
| 8 | Como evitar furo no caixa causado por equipe | "como evitar furo de caixa" | evitar furo caixa lanchonete | Equipe | `/extensoes#acessos`, `/vs-yooga` |
| 9 | Como atender pedido no WhatsApp sem perder venda | "como atender pedido pelo WhatsApp" | atender pedido whatsapp restaurante | Atendimento WhatsApp | `/para-delivery`, `/sobre` |
| 9 | Respostas automáticas para delivery: vale a pena para negócio pequeno? | "resposta automática whatsapp delivery vale a pena" | resposta automática whatsapp restaurante | Atendimento WhatsApp | `/extensoes#menu`, `/para-delivery` |
| 10 | Melhores sistemas PDV para lanchonete em 2026 (comparativo honesto) | "melhor sistema pdv para lanchonete barato" | melhor pdv lanchonete 2026 | Listicle/comparativo | `/vs-saipos`, `/vs-goomer`, `/precificacao` |
| 10 | PDV que funciona offline: por que isso importa para pequeno negócio | "pdv que funciona offline" | pdv offline pequeno negócio | Produto | `/sobre`, `/para-lanchonetes` |
| 11 | Planejamento de fim de ano para lanchonete (estoque, equipe, fluxo de caixa) | "como planejar o fim de ano na lanchonete" | planejamento fim de ano lanchonete | Sazonal | `/para-lanchonetes`, `/precificacao` |
| 11 | Black Friday no food service: como preparar o caixa e o estoque | "black friday restaurante como preparar" | black friday restaurante | Sazonal | `/para-restaurantes`, `/para-hamburguerias` |
| 12 | Como separar conta PF e PJ sendo MEI de alimentação | "MEI separar conta pessoal e da empresa" | mei separar conta pf pj | MEI | `/para-mei`, `/sobre` |
| 12 | Quanto custa abrir uma lanchonete pequena em 2026 | "quanto custa abrir uma lanchonete" | custo abrir lanchonete | Precificação/CMV | `/precificacao`, `/para-lanchonetes` |

Depois da semana 12: cadência cai para 1 post/semana, priorizando os clusters com melhor
performance no painel de prompts e no PostHog.

**Processo por post:** rascunho assistido por IA → revisão humana com números reais e prints do
produto → FAQ no fim → link interno → verificação de qualquer número externo contra fonte
primária → registro da fonte neste doc (seção 6) → `updatedAt` só quando o post for revisado de
fato (não em toda publicação).

## 5. Checklist de refresh de post antigo

- [ ] `tldr` (3–5 bullets) adicionado
- [ ] `faq` (3–5 perguntas) adicionado
- [ ] `cover` com `alt` adicionado
- [ ] Abertura resposta-primeiro presente (2–3 frases logo no início)
- [ ] Pelo menos 1 link para `/para-*`, `/vs-*` ou `/extensoes`, e `/sobre` quando fizer sentido
- [ ] Números externos revisados contra fonte atual; se não confirmável, suavizado para faixa com data
- [ ] `updatedAt: '2026-09-24'` setado (só quando o conteúdo mudou de fato)
- [ ] Slug e `publishedAt` mantidos intactos

### Status desta rodada (2026-09-24)

Todos os 11 posts existentes revisados: `tldr`, `faq`, `cover` e links internos adicionados a
todos; `updatedAt` setado em todos porque todos ganharam conteúdo novo (link interno + tldr/faq
contam como revisão material). Destaque: `como-calcular-taxa-aplicativo-delivery` teve os números
de Rappi, 99Food e Aiqfome corrigidos/suavizados (ver seção 6) — o iFood já estava correto e foi
mantido, só a redação da taxa de pagamento online foi ajustada de "3,2% a 3,5%" para "3,2%"
(valor único confirmado na fonte oficial atual).

## 6. Fontes externas verificadas (2026-09-24)

| Fato | Valor usado no post | Fonte | Observação |
| --- | --- | --- | --- |
| iFood — Plano Básico | 12% comissão + 3,2% pagamento online + mensalidade R$110 (isenta até R$1.800/mês) | https://blog-parceiros.ifood.com.br/taxas-ifood/ | Página oficial de parceiros iFood, atualização de 23/06/2026 |
| iFood — Plano Entrega | 23% comissão + 3,2% pagamento online + mensalidade R$150 (isenta até R$1.800/mês) | https://blog-parceiros.ifood.com.br/taxas-ifood/ | Idem |
| Rappi — comissão | Não divulgada publicamente de forma fixa; informada só no cadastro | https://merchants.rappi.com/pt-br/quanto-a-rappi-cobra-de-comissao-das-lojas-que-vendem-em-sua-plataforma | Página oficial do Rappi Partners confirma que não há percentual público único; suavizado no post em vez de repetir número não confirmável |
| 99Food — comissão | Faixa aproximada 8,9%–12% conforme modalidade de entrega, mais taxa de pagamento de ~3,2% | https://99app.com/99food/restaurantes/guias/entendendo-as-cobrancas-da-99food/ | Domínio oficial 99app.com; página retornou 429 na tentativa de fetch direto nesta sessão, valor mantido como faixa aproximada e sinalizado como "consulte o cadastro para sua região" |
| Aiqfome — comissão | 14,99% (entrega própria) ou 19,99% (entrega aiqfome), taxa única, mensalidade R$89,90 (isenta até R$1.500/mês) | https://www.parceiros.aiqfome.com/ | Página oficial de parceiros; valor mais alto do que a versão anterior do post (12%), corrigido |
| Uber Eats no Brasil | Encerrou operação de delivery de restaurantes em 2022 | Fato mantido do post original (não obtiveram desmentido em nenhuma busca desta sessão) | Sem mudança |
| MEI — limite de faturamento anual | R$ 81.000/ano (vigente); PLP 186/2026 propõe R$110 mil em 2027 e R$140 mil em 2028, ainda não em vigor | https://www.gov.br/memp/pt-br/teto-do-mei | Portal oficial gov.br/MEMP |
| MEI — DAS 2026 | INSS R$81,05 (5% do salário mínimo de R$1.621,00) + ISS R$5,00 e/ou ICMS R$1,00 conforme atividade | https://www8.receita.fazenda.gov.br/simplesnacional/Noticias/NoticiaCompleta.aspx?id=c3b2044c-ff97-432a-b33c-ecf2a3df6dc3 | Receita Federal / Simples Nacional, salário mínimo 2026 fixado pelo Decreto 12.797/2025-12-23 |

## 7. Referências

- [[GEO_PLAN_2026-09.md]] — plano completo de visibilidade em IA (seções 4–8)
- [[GEO_PROMPT_PANEL.md]] — painel de 30 prompts mensais
- PostHog insights `09f33k0o` e `vIptaqqU` (tag `geo`)
- `src/lib/pricing.js`, `src/lib/data/productFacts.js`, `src/lib/data/extensoes.js` — fonte de fatos de produto
- `src/lib/data/segmentLandingPages.js`, `src/lib/data/competitorComparisons.js` — páginas para link interno
