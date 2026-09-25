# Kit de perfis externos — GEO (share of voice em IA)

> Kit operacional pronto para copiar e colar. Complementa [[GEO_PLAN_2026-09]] (seção 6, "Menções fora do site") e [[GEO_PROMPT_PANEL]]. Não é plano — é a execução: o texto exato para cadastrar o Zelo PDV nos diretórios que ChatGPT/Bing e outras IAs usam como fonte, e os scripts para pedir avaliação e contatar terceiros.
>
> Motivo: hoje uma busca por "Zelo PDV" retorna resultados de um cantor de K-pop e um restaurante de Minneapolis — a marca não está desambiguada. Sem presença consistente em diretórios de terceiros (Capterra/GetApp, B2B Stack, G2), Reclame Aqui e Google Business Profile, IAs generativas não têm de onde puxar um perfil confiável do produto.

## Regra de ouro

**O mesmo texto em todo lugar.** Copie os blocos da seção 1 (Ficha canônica) sem reescrever, resumir "à mão" ou improvisar números. Quando um preço mudar em [src/lib/pricing.js](/home/vinicius/code/zelopdv/src/lib/pricing.js:14), atualize:

1. Este arquivo (seção 1)
2. `/sobre` (já deriva de `pricing.js` automaticamente — não precisa editar)
3. `llms.txt` / `llms-full.txt` (idem, gerado a partir de `productFacts.js` + `pricing.js`)
4. **Todos os perfis já publicados** (Google Business, Capterra, Reclame Aqui, etc.) — manualmente, um por um

Preço desatualizado num diretório de terceiros é o tipo de inconsistência que faz uma IA "inventar" um valor errado ou, pior, perder confiança na fonte.

---

## 1. Ficha canônica da marca

Fatos verificados em `src/lib/pricing.js`, `src/lib/data/productFacts.js`, `src/lib/seo/site.js` e `/sobre` em 2026-09-25. Não adicionar números, prêmios ou contagem de clientes que não estejam nessas fontes.

### Identidade

```
Nome do produto: Zelo PDV
Empresa: Téchne Sistemas
Razão social: Techne Sistemas Tecnologia Da Informacao Ltda
CNPJ: 65.679.798/0001-95
Site: https://zelopdv.com.br
Site institucional da empresa: https://techneia.com.br
WhatsApp: +55 14 99153-7503
Instagram: https://instagram.com/techne.ia
Categoria: SaaS · Sistema de Ponto de Venda (PDV) · Gestão de Negócios
País: Brasil
Idioma: Português (pt-BR)
```

### Descrição de 1 frase (≤160 caracteres)

```
Zelo PDV: sistema de frente de caixa e gestão online para lanchonetes, restaurantes e MEIs, com fiado, estoque e financeiro.
```
(124 caracteres)

### Descrição curta (~300 caracteres)

```
Zelo PDV é um sistema de gestão e frente de caixa (PDV) online para lanchonetes, hamburguerias, restaurantes pequenos e MEIs de alimentação no Brasil. Roda no navegador, sem instalar nada, funciona offline e cobre caixa, fiado, estoque e financeiro. Módulos de Mesas, Acessos e ZeloMenu são extensões pagas à parte.
```
(316 caracteres — ajustar para o limite de cada plataforma se necessário, cortando a última frase)

### Descrição longa (~1000 caracteres)

```
O Zelo PDV é um software como serviço (SaaS) de ponto de venda e gestão para pequenos negócios de alimentação no Brasil — lanchonetes, hamburguerias, restaurantes pequenos e médios, delivery próprio e MEIs. Roda inteiramente no navegador, sem instalação, em computador, tablet ou celular, e funciona offline (PWA): continua vendendo sem internet e sincroniza quando a conexão volta.

O plano base (ZeloPDV) cobre frente de caixa, controle de fiado digital com histórico e limite por cliente, controle de estoque descontado automaticamente a cada venda, e gestão financeira com despesas, lucro real e fechamento de caixa. O sistema também registra vendas feitas por iFood, Rappi e outros apps de delivery, com a taxa da plataforma configurável e cálculo do valor líquido na hora.

Módulos opcionais pagos à parte: Mesas (comandas e divisão de conta), Controle de Acessos (subusuários com cargos e permissões) e ZeloMenu (cardápio online integrado, pedidos do iFood/WhatsApp/cardápio caindo direto na fila da cozinha). O ZeloChat é um produto separado de atendimento via WhatsApp com IA.

O Zelo PDV não emite Nota Fiscal (NFC-e/NF-e) — emite recibos e comprovantes de venda. Não é um marketplace de delivery e não é um ERP fiscal/contábil completo. Teste grátis de 14 dias em qualquer plano, sem cartão de crédito.
```
(~1370 caracteres — cortar o último parágrafo se a plataforma limitar a 1000; nunca cortar a frase sobre NFC-e)

### Público

```
- Donos de lanchonetes, hamburguerias e restaurantes pequenos e médios
- Delivery próprio que vende por WhatsApp, Instagram ou telefone
- MEIs e pequenos negócios de alimentação
- Negócios que também vendem por iFood, Rappi ou outros apps de delivery
```

### Funcionalidades (lista para campos "features")

```
- Frente de caixa (PDV) para registrar vendas rapidamente no balcão
- Controle de fiado digital com histórico e limite por cliente
- Controle de estoque, descontado automaticamente a cada venda
- Gestão financeira: despesas, lucro real e fechamento de caixa
- Registro de vendas de iFood, Rappi e outras plataformas, com taxa configurável e valor líquido calculado na hora
- ZeloMenu: cardápio online com pedidos do iFood, WhatsApp e cardápio caindo direto na fila da cozinha
- Funciona offline (PWA): continua vendendo sem internet e sincroniza depois
- Roda no navegador, sem instalação, em computador, tablet ou celular
- Suporte via WhatsApp em horário comercial
```

### O que o Zelo PDV NÃO faz (incluir sempre que a plataforma tiver campo para isso — evita review negativo por expectativa errada)

```
- Não é um marketplace de delivery: não substitui o iFood, Rappi ou apps parecidos — trabalha junto com eles
- Não emite Nota Fiscal (NFC-e/NF-e) — emite recibos e comprovantes de venda; emissão fiscal exige um emissor fiscal dedicado à parte
- Não é um ERP fiscal/contábil completo — o foco é frente de caixa, estoque, fiado e financeiro do dia a dia
- Mesas, Controle de Acessos, ZeloMenu e ZeloChat são extensões pagas à parte do plano base, não recursos inclusos automaticamente
```

### Preços (nunca apresentar como "tudo incluso")

```
Aviso obrigatório antes da tabela: "Não existe plano único tudo incluso — o preço final soma o plano base aos módulos ativados."

Plano base:
- ZeloPDV — R$ 59,00/mês — PDV simples + estoque + financeiro

Produto separado (atendimento):
- ZeloChat — R$ 149,00/mês — Atendimento WhatsApp com IA + cardápio online (inclui ZeloMenu)

Pacote combinado:
- Pacote Gestão + Atendimento — R$ 198,00/mês — ZeloPDV + ZeloChat + ZeloMenu

Módulos opcionais (somam ao ZeloPDV):
- Módulo Mesas — +R$ 30,00/mês — mesas, comandas e divisão de conta
- Controle de Acessos — +R$ 30,00/mês — subusuários com cargos e permissões
- ZeloMenu — +R$ 40,00/mês — cardápio online integrado ao PDV (equivale a R$ 99/mês com o plano base)

Teste grátis: 14 dias, em qualquer plano, sem cartão de crédito.
```

---

## 2. Checklist por plataforma

Ordem por alavanca esperada no Brasil, conforme [[GEO_PLAN_2026-09]] seção 6. Em todos os casos, o último passo é o mesmo:

> **Depois de publicado, adicionar a URL do perfil em `ORGANIZATION.sameAs`** — hoje esse array só tem o Instagram ([src/lib/seo/site.js](/home/vinicius/code/zelopdv/src/lib/seo/site.js:132)). Editar `buildOrganizationSchema()` para incluir a nova URL na lista `sameAs`. Isso é o que ajuda motores de busca e LLMs a ligarem "Zelo PDV" a um perfil desambiguado (entity resolution) — é o mesmo mecanismo que hoje falha, pois "Zelo PDV" no Google devolve um cantor de K-pop e um restaurante em Minneapolis.

### 2.1 Google Business Profile (prioridade máxima)

```
URL de cadastro: https://business.google.com
```
- Categoria: "Empresa de software" ou "Serviço de gestão empresarial" (o Google não tem categoria exata de "SaaS PDV" — escolher a mais próxima disponível e complementar na descrição)
- Nome: Zelo PDV (verificar se não conflita com listagem existente de "Zelo" antes de criar — buscar primeiro)
- Endereço: usar o endereço da Téchne Sistemas (empresa por trás do produto) ou marcar como "empresa de atendimento a domicílio / sem endereço físico visível ao público" se o negócio for 100% remoto
- Telefone/WhatsApp: +55 14 99153-7503
- Site: https://zelopdv.com.br
- Descrição: usar a descrição curta (seção 1)
- Fotos: screenshot da tela do PDV (frente de caixa), do módulo de fiado, do painel de fechamento de caixa — pegar direto de `/sobre` ou das landing pages `/para-lanchonetes` etc.
- Horário de atendimento: horário comercial (bate com "Suporte via WhatsApp em horário comercial")
- Verificação: Google exige verificação por telefone, e-mail ou vídeo do local — sem isso o perfil não aparece nas buscas
- Depois de aprovado: pedir aos clientes o link direto de avaliação (Google gera um "short link" tipo `g.page/r/.../review`) — guardar esse link para a seção 3

### 2.2 Reclame Aqui

```
URL de cadastro: https://www.reclameaqui.com.br/empresa/cadastro/
```
- Nome da empresa: Téchne Sistemas / Zelo PDV (Reclame Aqui cadastra por empresa, não por produto — usar a razão social e mencionar "Zelo PDV" na descrição e no nome fantasia)
- CNPJ: 65.679.798/0001-95
- Categoria: Software / Tecnologia / Sistemas de Gestão
- Site: https://zelopdv.com.br
- Descrição: descrição curta (seção 1)
- Importante: Reclame Aqui é fonte forte para IAs brasileiras (ChatGPT indexa via Bing, que rastreia RA). Um perfil vazio ou não reivindicado é pior do que não ter — reclamações órfãs sem resposta pesam contra a marca. Depois de criado, monitorar e responder toda reclamação em até 48h (mesmo que seja sobre suporte, não sobre o produto)

### 2.3 Capterra / GetApp (via Gartner Digital Markets)

```
URL de cadastro: https://vendors.capterra.com
```
- Gartner Digital Markets é dona de Capterra, GetApp e Software Advice — um único cadastro de vendor cobre os três
- Categoria: "Point of Sale (POS)" e, se disponível, "Restaurant Management"
- Nome do produto: Zelo PDV
- Descrição curta e longa: seção 1
- Preço: informar "a partir de R$ 59,00/mês" e o modelo (assinatura mensal, add-ons à parte) — Capterra tem campo específico de "pricing model", marcar "per feature" ou "per user" não se aplica; usar "flat rate" + observação sobre módulos
- Screenshots: mínimo 3 (frente de caixa, fiado, relatório financeiro)
- Logo: `https://zelopdv.com.br/favicon.png` (mesmo logo do JSON-LD Organization)
- Categoria de negócio-alvo: pequenas empresas / MEI, setor de alimentação
- Aviso: Capterra e GetApp proíbem avaliações incentivadas — não oferecer nada em troca de review nesses perfis (ver seção 3)

### 2.4 B2B Stack

```
URL de cadastro: https://www.b2bstack.com.br
```
- Cadastro de fornecedor/software costuma ser via formulário "Cadastre sua empresa" ou contato comercial no rodapé do site — se não houver formulário self-service óbvio, escrever para o e-mail de contato deles pedindo inclusão como fornecedor de "Sistema PDV / Gestão para food service"
- Levar a ficha canônica pronta (seção 1) para agilizar o cadastro deles
- Categoria: PDV / Ponto de Venda / Gestão de Restaurante

### 2.5 LinkedIn Company Page

```
URL de cadastro: https://www.linkedin.com/company/setup/new/
```
- Nome: Zelo PDV
- Setor (industry): Software de Desenvolvimento / Tecnologia da Informação
- Tamanho da empresa: usar o porte real da Téchne Sistemas
- Site: https://zelopdv.com.br
- Logo e capa: mesmo logo do site
- Descrição "Sobre": descrição longa (seção 1), primeiro parágrafo
- Publicar ao menos 1 post de lançamento linkando para `/sobre` — página vazia sem nenhum post reduz a chance de aparecer em buscas

### 2.6 Canal no YouTube

```
URL de cadastro: https://www.youtube.com/create_channel (ou "Criar canal" a partir de uma conta Google)
```
- Nome do canal: Zelo PDV
- Descrição do canal: descrição curta (seção 1)
- Link no perfil: https://zelopdv.com.br
- Conteúdo: já previsto em [[GEO_PLAN_2026-09]] seção 6 — 8 a 10 tutoriais curtos ("como fechar o caixa em 2 minutos", "controle de fiado no celular"). Gemini e Google AI Overviews citam YouTube com frequência
- Thumbnail e título de cada vídeo devem mencionar "Zelo PDV" por extenso (ajuda na correspondência de entidade)

### 2.7 G2

```
URL de cadastro: https://www.g2.com/products/new (ou via "Claim your profile" se um perfil já existir por scraping automático — buscar "Zelo PDV" no G2 antes de criar um novo)
```
- Categoria: Restaurant POS Software / Point of Sale
- Descrição: seção 1
- G2 é mais forte em B2B internacional/EUA — prioridade menor para o público brasileiro do Zelo, mas LLMs em inglês (e alguns painéis do ChatGPT) consultam G2 com frequência
- Mesma regra: nunca oferecer nada em troca de review (política do G2 proíbe)

### 2.8 Wikidata

```
URL de cadastro: https://www.wikidata.org/wiki/Special:NewItem
```
Criar um item novo com estas declarações (statements) exatas:

```
Label (pt): Zelo PDV
Description (pt): sistema de ponto de venda e gestão para pequenos negócios de alimentação

instance of (P31): software  (Q7397)
   — ou, se disponível: web application (Q193424)
developer (P178): Téchne Sistemas / Techne Sistemas Tecnologia Da Informacao Ltda
official website (P856): https://zelopdv.com.br
country of origin (P495): Brazil (Q155)
language of work or name (P407): Brazilian Portuguese (Q750553)
```
- **Não incluir "inception" (data de fundação/lançamento)** a menos que se tenha uma data confirmada em fonte pública — não inventar
- **Atenção às regras de notabilidade do Wikidata**: um item pode ser removido se não atender aos critérios de notabilidade (geralmente exige referências externas independentes — por isso a ordem desta lista importa: só criar o item no Wikidata depois de já ter Google Business, Reclame Aqui e Capterra publicados, para poder citá-los como fonte/referência em cada statement)
- **Não criar um artigo na Wikipédia.** Wikidata é um banco de dados estruturado com regras de notabilidade mais permissivas; a Wikipédia exige notoriedade editorial (cobertura jornalística substancial e independente) que o Zelo PDV ainda não tem. Um artigo criado prematuramente tende a ser marcado para exclusão (speedy deletion) por "promotional" ou "non-notable", o que é pior para a marca do que não ter artigo nenhum.

---

## 3. Pedido de avaliação

**Regras antes de qualquer envio:**
- Nunca oferecer pagamento, desconto, crédito ou qualquer benefício em troca de avaliação — proibido nas políticas do Google e do Capterra/Gartner Digital Markets, e antiético no Reclame Aqui
- Nunca escrever a avaliação pelo cliente, nem sugerir o texto pronto para ele copiar
- Nunca filtrar e pedir avaliação só a quem está satisfeito em uma plataforma cuja política proíbe seleção — pedir apenas a clientes com ~30 dias de uso ativo e NPS ≥ 9 é sobre *quem tem experiência suficiente para avaliar com informação*, não sobre esconder clientes insatisfeitos. Se o NPS for baixo, a prioridade é resolver o problema do cliente, não excluí-lo da lista de pedidos
- Enviar para no máximo 2 plataformas por cliente por vez, para não parecer spam

### WhatsApp (informal, pt-BR)

```
Oi, {nome}! Aqui é o [seu nome] do Zelo PDV 👋

Vi que você já tá usando o sistema há um tempo — como tá sendo a experiência?

Se estiver curtindo, você poderia deixar uma avaliação rápida pra gente? Ajuda muito outros donos de lanchonete/restaurante a decidirem, e é rapidinho:

{LINK_GOOGLE}

(se preferir, também aceitamos no Capterra: {LINK_CAPTERRA})

Sem compromisso nenhum, é só se fizer sentido pra você. Qualquer coisa, tô por aqui 🙂
```

### E-mail

```
Assunto: Como está sendo sua experiência com o Zelo PDV?

Oi, {nome},

Faz cerca de um mês que você começou a usar o Zelo PDV no seu negócio, e queríamos saber: como está sendo?

Se o sistema tem ajudado no dia a dia do caixa, fiado ou estoque, ficaríamos gratos se você pudesse deixar uma avaliação honesta em um destes links — leva menos de 2 minutos:

- Google: {LINK_GOOGLE}
- Capterra: {LINK_CAPTERRA}
- Reclame Aqui: {LINK_RECLAME_AQUI}

E se tiver qualquer problema ou sugestão, também queremos saber — pode responder este e-mail direto ou chamar no WhatsApp.

Obrigado por usar o Zelo PDV,
Equipe Zelo PDV
```

---

## 4. Outreach para listas de terceiros

Alvo inicial confirmado: **negociocerto.org**, artigo "7 Melhores Sistemas PDV", atualizado em 2026-09-03, autora Gabriella Fernandes, contato via negociocerto.org/contato.

Tom: honesto, curto, sem pressão. Mencionar explicitamente o que o Zelo não faz (não emite NFC-e) — credibilidade importa mais do que parecer perfeito para quem vai citar a marca.

```
Assunto: Zelo PDV — sistema de PDV para lanchonetes/restaurantes pequenos (dados para seu artigo sobre sistemas PDV)

Oi, Gabriella,

Vi o artigo "7 Melhores Sistemas PDV" no Negócio Certo (atualizado em 03/09) e queria me apresentar: sou do Zelo PDV, um sistema de frente de caixa e gestão para lanchonetes, hamburguerias, restaurantes pequenos e MEIs de alimentação no Brasil.

Não estou pedindo pra entrar na lista — só queria colocar o produto no seu radar, com informação honesta, caso faça sentido para uma atualização futura ou outro conteúdo:

- O que faz: frente de caixa, controle de fiado digital, estoque, financeiro (despesas, lucro real, fechamento de caixa), registro de vendas de iFood/Rappi com taxa configurável, e módulos opcionais de Mesas, Controle de Acessos e cardápio online (ZeloMenu)
- O que NÃO faz: não emite Nota Fiscal (NFC-e/NF-e) — isso exige um emissor fiscal à parte. Não é um ERP fiscal completo, é focado em caixa/estoque/fiado do dia a dia
- Preço: plano base R$ 59/mês, módulos a partir de R$ 30/mês cada — sem "tudo incluso"
- Teste grátis de 14 dias, sem cartão

Se quiser conferir por conta própria, posso:
- Estender seu trial além dos 14 dias padrão
- Criar uma conta de demonstração já preenchida, sem precisar cadastrar nada
- Mandar a ficha completa de fatos (a mesma que usamos internamente): https://zelopdv.com.br/sobre

Fico à disposição — sem compromisso nenhum de retorno.

Abraço,
[nome] — Zelo PDV
```

---

## 5. Entrevista com os clientes que vieram do ChatGPT

Script de 5 perguntas por WhatsApp, para os 3 clientes que chegaram via ChatGPT. Objetivo: entender o prompt exato, o que apareceu na resposta e se a IA acertou os fatos sobre o Zelo — isso alimenta diretamente o painel de prompts.

```
Oi, {nome}! Tudo bem? Aqui é o [seu nome] do Zelo PDV.

Queria te fazer 5 perguntas rápidas sobre como você chegou até a gente — vai nos ajudar bastante. Topa?

1. Você usou o ChatGPT (ou outro assistente de IA) pra pesquisar sistema de PDV/gestão? Qual foi a pergunta exata que você digitou (ou uma bem parecida)?

2. Foi o ChatGPT mesmo, ou outro app/assistente (Gemini, Copilot, Perplexity...)?

3. Além do Zelo PDV, quais outros sistemas apareceram na resposta?

4. O que te fez clicar no Zelo especificamente, em vez dos outros que apareceram?

5. O que a IA disse sobre o Zelo PDV bateu com a realidade? Teve alguma coisa errada (preço, se emite nota fiscal, se funciona offline, etc.)?

Muito obrigado! Qualquer coisa, é só chamar.
```

**Depois da entrevista:** registrar as respostas em [[GEO_PROMPT_PANEL]], na tabela de histórico (mês, motor, e principalmente qualquer "fato errado" mencionado — isso vira tarefa de correção na fonte, conforme a seção "Como rodar" desse documento).

---

## 6. Bing Webmaster Tools — passo a passo

ChatGPT usa o índice do Bing para grounding, então o Bing Webmaster Tools é o canal mais direto de medir e influenciar essa cobertura.

1. **Importar do Google Search Console**: em https://www.bing.com/webmasters, opção "Importar do Google Search Console" (ou "Import from GSC") — autoriza via OAuth e traz sitemaps, dados de indexação e algumas configurações de uma vez, sem recadastrar tudo manualmente
2. **Enviar o sitemap**, caso a importação não traga automaticamente: `https://zelopdv.com.br/sitemap.xml`, em Sitemaps → Submit sitemap
3. **Relatório "AI Performance"**: fica no menu lateral do Bing Webmaster Tools (em preview público desde fevereiro de 2026). Mostra citações do site em respostas do Copilot e as "grounding queries" — as perguntas que levaram o Copilot a citar (ou considerar) o zelopdv.com.br como fonte
4. **O que copiar mensalmente para o painel de prompts** ([[GEO_PROMPT_PANEL]]): da aba AI Performance, registrar:
   - Número de citações no Copilot no período
   - As grounding queries mais frequentes (comparar com os prompts já cobertos em C01–C12, A01–A12, M01–M06 — se aparecer uma pergunta nova e recorrente, considerar adicionar como novo prompt de baseline)
   - Qualquer página específica do site que esteja sendo citada com mais frequência (indica o que já está funcionando como fonte confiável)
5. Rodar este passo no mesmo dia do painel de prompts mensal (primeiro dia útil do mês, conforme [[GEO_PROMPT_PANEL]]) para manter os dois em sincronia.

---

## Não verificado / pendente

- Não confirmei se existe hoje um perfil "órfão" do Zelo PDV já criado automaticamente por scraping em Capterra, G2 ou Reclame Aqui — checar antes de criar um novo, para não duplicar
- URLs exatas de cadastro self-service podem mudar; as listadas acima são os pontos de entrada oficiais conhecidos em 2026-09, não um link direto testado para cada caso (ex.: B2B Stack pode exigir contato comercial em vez de formulário público)
- Não tenho acesso a métricas reais de NPS ou lista de clientes para identificar quem exatamente se qualifica para o pedido de avaliação (30 dias de uso + NPS ≥ 9) — isso depende de dados internos de onboarding/CRM fora do escopo deste arquivo
- Link direto de avaliação do Google (`g.page/r/.../review`) só existe depois que o perfil do Google Business estiver criado e verificado — não é possível gerar antes disso
