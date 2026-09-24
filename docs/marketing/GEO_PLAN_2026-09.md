# Plano GEO — ser recomendado por ChatGPT, Gemini, Perplexity e AI Overviews

> Criado em 2026-09-23. Objetivo: transformar "clientes que chegaram pelo ChatGPT"
> de acaso em canal medido e crescente. Horizonte: 90 dias.

## Status da implementação (2026-09-23, branch `feat/geo-ai-visibility`)

| Item | Status |
| --- | --- |
| `ai_source` (referrer/utm, recalculado no servidor) + `$set_once` no PostHog | Feito — `src/lib/attribution/aiSources.js` |
| Pergunta "Como conheceu" no onboarding | Feito — `src/lib/attribution/heardFrom.js`, `OnboardingWizard.svelte` |
| Insights PostHog (tag `geo`) | Feito — `09f33k0o`, `vIptaqqU` |
| Painel de prompts | Feito — [GEO_PROMPT_PANEL.md](GEO_PROMPT_PANEL.md) (execução mensal é manual) |
| `llms.txt` / `llms-full.txt` / `robots.txt` gerados dos dados | Feito — `src/lib/seo/` |
| Página `/sobre` + `productFacts.js` | Feito |
| JSON-LD com preços derivados de `pricing.js` | Feito — `src/lib/seo/site.js` |
| Blog: `updatedAt` e `faq` por post | Suporte pronto; nenhum post preenchido ainda |
| IndexNow | Rota + `npm run indexnow`; falta definir `INDEXNOW_KEY` na Vercel |
| Bing Webmaster Tools | Pendente (ação manual: importar do Google Search Console) |
| Banner para quem veio de IA | Feito — `AiReferralBanner.svelte` na home |
| Frentes 2 e 3 (conteúdo, menções externas) | Não iniciadas — dependem de produção editorial |

## 1. Diagnóstico (estado real em 2026-09-23)

| Ponto | Situação | Impacto |
| --- | --- | --- |
| `static/llms.txt` | Estático e desatualizado: lista 7 de 11 posts; não cita `/para-restaurantes`, as 10 páginas `/vs-*`, `/comparativos`, `/ferramentas`, `/extensoes`; diz "plano único, tudo incluso" mas hoje existem Mesas (R$30), Acessos, ZeloChat (R$149), ZeloMenu, pacote R$198 e integração iFood. O posicionamento ainda diz que o Zelo *não* é para delivery complexo. | LLMs repetem fatos velhos sobre preço e escopo. |
| Blog | Último post publicado em 2026-05-20 (4 meses). 11 posts, quase todos sobre caixa/fiado. | Conteúdo "fresco" pesa na busca que alimenta o ChatGPT. |
| Medição | PostHog (90 dias) mostra só ~7 visitantes com referrer `chatgpt`. O cadastro não pergunta "como conheceu", e `src/lib/server/acquisition.js` não classifica fontes de IA. | A maior parte do tráfego de IA é "escuro": o app mobile do ChatGPT não manda referrer, e a pessoa digita a marca ou busca no Google. Hoje não dá para medir o canal que queremos crescer. |
| Dados estruturados | `FAQPage` só em 4 páginas (`/`, `/extensoes`, `/precificacao`, `/vs-planilha`). As páginas `/vs-*`, `/para-*` e os posts não têm. | Perguntas e respostas prontas facilitam a citação. |

**Sobre o llms.txt, com franqueza:** OpenAI e Google não confirmam que leem o `llms.txt`. O ChatGPT Search busca pelo índice do Bing e por crawlers próprios (`OAI-SearchBot`, `ChatGPT-User`). O resultado atual provavelmente vem mais das páginas `/vs-*` e `/para-*`, que respondem exatamente o que as pessoas perguntam ("alternativa ao Saipos mais barata"), do que do `llms.txt`. Vale manter o arquivo porque é barato, mas o plano não depende dele.

## 2. Como um LLM decide te recomendar

1. **Recuperação:** a pergunta vira uma busca (Bing no ChatGPT, Google no Gemini e nos AI Overviews). Se você não está no índice com uma página que responde a pergunta, você não entra.
2. **Consenso:** o modelo confia mais em uma marca citada por várias fontes independentes (listas "melhores sistemas", Reclame Aqui, Capterra, Reddit, YouTube) do que por ela mesma.
3. **Fatos extraíveis:** preço, público, diferenciais e comparações em texto claro, com a resposta no começo da página.
4. **Frescor:** datas de atualização visíveis e conteúdo recente.

O plano ataca os quatro pontos em cinco frentes.

## 3. Frente 0 — Medição (semana 1, pré-requisito)

- **Pergunta "Como conheceu o Zelo?"** no onboarding (não no cadastro, para não perder conversão). Opções: ChatGPT/outra IA, Google, Instagram/TikTok, YouTube, Indicação, iFood, Outro. Salvar em `empresa_perfil` ou no payload de aquisição.
- **Classificar referrers de IA** em `acquisition.js` e na captura do cliente: `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`, e `utm_source=chatgpt.com` (o ChatGPT adiciona esse parâmetro nos links que cita). Gravar `ai_source` no signup.
- **PostHog:** coorte "veio de IA" (referrer + resposta declarada) e um funil visita → cadastro → trial → pagante, comparado com as outras fontes.
- **Painel de prompts (share of voice):** 30 perguntas fixas, rodadas todo mês no ChatGPT, Gemini, Perplexity e Google (AI Overview). Anotar se o Zelo aparece, em que posição e quais fontes foram citadas. Exemplos:
  - "melhor sistema PDV para lanchonete barato"
  - "sistema de caixa para hamburgueria com controle de fiado"
  - "alternativa ao Saipos mais barata" (repetir para cada concorrente das páginas `/vs-*`)
  - "PDV que funciona offline para pequeno negócio"
  - "como controlar fiado no computador"
  - "sistema para MEI de alimentação"
  - "PDV com integração iFood barato"
  - "cardápio digital com pedido na mesa"

  Dá para automatizar com um agente agendado que roda os prompts e grava uma planilha.

**KPIs:** % de cadastros com origem IA (declarada + referrer), share of voice no painel, visitas de referrers de IA por mês, conversão trial→pago da coorte IA.

## 4. Frente 1 — Técnico on-site (semanas 1–2)

1. **`llms.txt` gerado a partir do código:** trocar `static/llms.txt` por uma rota prerenderizada (`src/routes/llms.txt/+server.js`) que lê `src/lib/blog/posts.js`, `src/lib/data/competitorComparisons.js`, `segmentLandingPages.js`, `extensoes.js` e `src/lib/pricing.js`. Assim o arquivo não desatualiza de novo. Corrigir o posicionamento (iFood, ZeloMenu, Mesas).
2. **`/llms-full.txt`:** conteúdo completo em markdown (produto, preços, FAQ, comparativos e o texto dos posts).
3. **Página "Fatos sobre o Zelo PDV"** (`/sobre`): uma fonte canônica com preço de cada módulo, público, o que faz, o que *não* faz, empresa, CNPJ, data da última atualização. Os LLMs preferem citar uma página assim a uma landing de marketing.
4. **Bing Webmaster Tools + IndexNow:** verificar o domínio no Bing, enviar o sitemap e avisar via IndexNow a cada deploy de página pública. O ChatGPT busca pelo Bing, então esta é provavelmente a ação de maior retorno por hora investida.
5. **robots.txt:** hoje libera tudo (ok). Liberar explicitamente `OAI-SearchBot`, `ChatGPT-User`, `GPTBot`, `PerplexityBot`, `Google-Extended` e `ClaudeBot`, e conferir que o firewall/BotID da Vercel não bloqueia esses bots.
6. **JSON-LD:**
   - `Organization` + `SoftwareApplication` com `offers` (preço real de cada módulo) no layout de marketing.
   - `FAQPage` em todas as `/vs-*`, `/para-*` e posts. Os dados já existem nos arquivos de `src/lib/data/`.
   - `Article` com `dateModified` nos posts, e a data de atualização visível na página.
7. **Formato "resposta primeiro":** em cada página pública, um parágrafo de 2–3 frases no topo que responde a pergunta principal, com o preço em texto e não só em imagem ou componente.

## 5. Frente 2 — Conteúdo feito para ser citado (semanas 2–12)

### 5.1 Páginas programáticas de alto valor (antes do blog)

- **Novos nichos em `/para-*`:** açaí, pizzaria, padaria, food truck, sorveteria, marmitaria, cafeteria, pastelaria, bar. Hoje só existem lanchonetes, restaurantes e hamburguerias (mais delivery e MEI no `llms.txt`). Cada página precisa de dor, fluxo e FAQ específicos do nicho. Não fazer só trocando a palavra-chave: página rasa prejudica.
- **Mais `/vs-*` e páginas "alternativa a":** incluir Consumer, iFood Gestor de Pedidos/PDV, Stone/Ton PDV, Kyte, MarketUP e Linx. As comparações precisam ser honestas, inclusive dizendo quando o concorrente é melhor, porque os LLMs dão mais peso a esse tom.
- **Listicle próprio e honesto:** "Melhores sistemas PDV para lanchonete em 2026" com 6–8 opções, incluindo o Zelo, com critérios e preços. É o tipo de página que mais aparece como fonte em respostas de "qual o melhor…".
- **Ferramentas:** as calculadoras de `/ferramentas` são muito citáveis. Adicionar calculadora de CMV/ficha técnica, simulador de taxa do iFood e calculadora de ponto de equilíbrio.

### 5.2 Dado original (o que mais gera citação externa)

- **"Raio-X das lanchonetes brasileiras 2026":** ticket médio, horário de pico, mix de pagamento (Pix, cartão, dinheiro, fiado) e % de vendas iFood vs. balcão, a partir de dados agregados e anonimizados da base. Só publicar agregados com número mínimo de empresas por recorte (LGPD). Publicar como página + post + divulgação para imprensa e blogs de food service.

### 5.3 Blog — voltar com cadência

- **Ritmo:** 2 posts por semana durante 12 semanas (≈24 posts), depois 1 por semana.
- **Processo:** rascunho assistido por IA → revisão humana com prints reais do produto, números concretos e um exemplo de cliente → FAQ no fim → link interno para a página `/para-*` ou `/vs-*` correspondente.
- **Atualizar os 11 posts antigos** (números, prints, `dateModified`) antes de escrever novos: é rápido e sinaliza frescor.

Clusters que ainda não existem:

| Cluster | Exemplos de pauta | Liga com |
| --- | --- | --- |
| iFood | Quanto o iFood cobra em 2026; como reduzir a dependência do iFood; balcão vs. iFood: qual dá mais lucro; como integrar o iFood ao caixa | Integração iFood, `/ferramentas` |
| Cardápio e mesa | Cardápio digital com QR code: vale a pena?; como organizar comandas; pedido na mesa sem garçom | ZeloMenu, Mesas |
| Precificação/CMV | Como montar ficha técnica; CMV ideal para hamburgueria; como reajustar preço sem perder cliente | `/precificacao` |
| MEI de alimentação | Limite de faturamento do MEI em lanchonete; MEI precisa emitir nota?; separar conta PF e PJ | `/para-mei` |
| Estoque e desperdício | Como controlar estoque de lanchonete; como reduzir desperdício | PDV |
| Equipe | Como dar acesso ao caixa para funcionário sem risco; como evitar furo no caixa | Acessos |
| Atendimento WhatsApp | Como atender pedidos no WhatsApp sem perder venda; respostas automáticas para delivery | ZeloChat |
| Sazonal | Planejamento de fim de ano para lanchonete (publicar em outubro); Black Friday no food service | — |

## 6. Frente 3 — Menções fora do site (maior alavanca além do SEO)

1. **Perfis de avaliação**, com a mesma descrição e preço do `/sobre`: Capterra BR, GetApp, B2B Stack, G2, Google Business Profile, **Reclame Aqui** (muito indexado e citado no Brasil) e a listagem de parceiros/marketplace do iFood, se aplicável.
2. **Programa de avaliações:** após ~30 dias de uso ativo e NPS ≥ 9, pedir avaliação por WhatsApp/email (já existe infraestrutura de onboarding). Meta: 30 avaliações em 90 dias. Nunca avaliação falsa ou comprada.
3. **Listas de terceiros:** mapear os artigos "melhores sistemas para lanchonete/restaurante" que aparecem como fonte no painel de prompts e contatar os autores (trial estendido, dados, entrevista) para entrar na lista.
4. **YouTube:** 8–10 tutoriais curtos ("como fechar o caixa da lanchonete em 2 minutos", "controle de fiado no celular"). Gemini e AI Overviews citam muito o YouTube. Recortar para Reels/TikTok.
5. **Comunidades:** responder de verdade em grupos de donos de lanchonete, Reddit (r/empreendedorismo, r/brdev para o lado técnico) e Quora PT, sempre dizendo que é do Zelo. Nada de spam.
6. **Parcerias:** contadores de MEI, Sebrae (conteúdo e eventos), fornecedores de food service, influenciadores de gestão de restaurante. Um guest post ou uma menção em blog de parceiro vale mais que 5 posts próprios.
7. **PR com o dado original** (5.2): enviar para portais de food service e de pequenos negócios.

## 7. Frente 4 — Converter quem chega pela IA

- Quem vem do ChatGPT cai na `/` já com intenção alta e com um "resumo" na cabeça. A home precisa confirmar em 5 segundos: preço, 14 dias grátis sem cartão, funciona offline, para quem é.
- Testar no PostHog uma faixa discreta para `ai_source` ("Viu o Zelo no ChatGPT? Comece seus 14 dias grátis") contra o controle.
- Conferir que o que os LLMs dizem sobre o Zelo está certo (painel de prompts) e corrigir a fonte quando estiver errado.

## 8. Cronograma de 90 dias

| Semana | Entregas |
| --- | --- |
| 1 | Classificação `ai_source` + pergunta no onboarding; coorte PostHog; painel de 30 prompts (baseline); Bing Webmaster + sitemap |
| 2 | `llms.txt` dinâmico + `llms-full.txt`; página `/sobre`; JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage` em `/vs-*` e `/para-*`); IndexNow |
| 3–4 | Atualizar os 11 posts; listicle "melhores PDV 2026"; perfis Capterra/B2B Stack/Reclame Aqui/Google Business; início do programa de avaliações |
| 5–8 | 4 novas `/para-*` (açaí, pizzaria, food truck, marmitaria); 3 novas `/vs-*`; 8 posts (clusters iFood, cardápio, precificação); 4 vídeos |
| 9–12 | Relatório de dados original + PR; 4 novas `/para-*`; 8 posts (MEI, equipe, WhatsApp, fim de ano); outreach para listas de terceiros; 2º painel de prompts e comparação com o baseline |

## 9. O que NÃO fazer

- Gerar centenas de páginas rasas com IA: derruba a qualidade do domínio inteiro.
- Avaliações falsas, contas fantasmas em fórum ou spam em grupos: além de antiético, um LLM que "descobre" isso passa a citar a polêmica.
- Esconder módulos pagos: se o LLM disser "R$59 tudo incluso" e o cliente descobrir add-ons, vira reclamação no Reclame Aqui.

## 10. Implementação no repositório (por onde começar)

1. `src/lib/server/acquisition.js` + captura no cliente (`src/lib/attribution/client.js`): derivar `ai_source`.
2. `src/routes/llms.txt/+server.js` e `src/routes/llms-full.txt/+server.js` prerenderizados, gerados a partir de `src/lib/blog/posts.js`, `src/lib/data/*` e `src/lib/pricing.js`; remover `static/llms.txt`.
3. JSON-LD `FAQPage` em `src/routes/vs-[slug]/+page.svelte` e `src/routes/para-[slug]/+page.svelte` a partir dos dados existentes (usar `{@html}`, conforme o CLAUDE.md).
4. Nova rota `/sobre` + entrada no `sitemap.xml`.
5. Pergunta "Como conheceu" no `OnboardingWizard.svelte` (consultar `DESIGN_PATTERNS` antes).
