# Rotas publicas para leads e usuarios sem login

> Atualizado em 2026-06-02.
> Escopo: URLs que podem ser abertas fora do app logado do Zelo PDV.

## Regra rapida

- Use `/cadastro` para qualquer CTA de teste gratis ou criar conta.
- Use o chatbot publico para CTAs de conversa curta, como "Falar com especialista".
- Use `/contato?assunto=demo` para demonstracao agendada ou captura formal de lead.
- Mantenha `wa.me` apenas onde a pagina ja oferece WhatsApp como fallback ou contato direto.
- Nao use rotas de `/app`, `/gestao`, `/perfil`, `/relatorios` ou `/assinatura` em campanha para lead frio.

## Rotas principais de marketing

| Rota | Publico | Uso recomendado | CTA principal atual | Fonte |
| --- | --- | --- | --- | --- |
| `/` | Lead novo, trafego direto, SEO amplo | Landing principal do produto, planos, features e prova visual | `/cadastro`; conversa abre chatbot | `src/routes/+page.svelte` |
| `/contato` | Lead de campanha, demonstracao, suporte inicial | Pagina interna de captura para sitelinks e campanhas sem mandar o usuario para fora do dominio | formulario interno; `/cadastro?origem=contato`; links para planos e Zelo Chat | `src/routes/contato/+page.svelte` |
| `/para-lanchonetes` | Dono de lanchonete | Landing por segmento para caixa, fiado, estoque e lucro real | `/cadastro`; conversa abre chatbot | `src/routes/para-lanchonetes/+page.svelte` + `src/lib/data/segmentLandingPages.js` |
| `/para-hamburguerias` | Hamburgueria | Landing por segmento para pico de pedidos, combos e margem | `/cadastro`; conversa abre chatbot | `src/routes/para-hamburguerias/+page.svelte` + `src/lib/data/segmentLandingPages.js` |
| `/para-delivery` | Delivery proprio, WhatsApp, Instagram | Landing por segmento para organizar pedidos e taxas de plataforma | `/cadastro`; conversa abre chatbot | `src/routes/para-delivery/+page.svelte` + `src/lib/data/segmentLandingPages.js` |
| `/para-mei` | MEI e pequeno negocio de alimentacao | Landing por segmento para rotina simples de caixa, despesas e vendas | `/cadastro`; conversa abre chatbot | `src/routes/para-mei/+page.svelte` + `src/lib/data/segmentLandingPages.js` |
| `/extensoes` | Lead comparando modulos | Pagina consolidada de add-ons e Zelo Chat | `/cadastro`; conversa abre chatbot | `src/routes/extensoes/+page.svelte` + `src/lib/data/extensoes.js` |
| `/precificacao` | Lead que quer calcular preco/lucro de produto | Ferramenta de precificacao de produto; nao e pagina de preco dos planos | `/cadastro`; conversa abre chatbot apos resultado | `src/routes/precificacao/+page.svelte` |
| `/vs-planilha` | Lead usando planilha/caderno | Comparacao para migrar de planilha para PDV | `/cadastro`; conversa abre chatbot | `src/routes/vs-planilha/+page.svelte` |
| `/pascoa` | Campanha sazonal | Landing de oferta sazonal para doceiras/revendedores | campanha sazonal; revisar antes de reusar | `src/routes/pascoa/+page.svelte` |

## Variacoes de `/contato`

`/contato` aceita `assunto` e `utm_content`. A copy da pagina muda quando o valor contem uma das intencoes abaixo. Para URLs unicas no Google Ads, use `assunto` para a intencao principal e `utm_content` para diferenciar o sitelink.

| URL recomendada | Intencao | Quando usar |
| --- | --- | --- |
| `/contato?assunto=demo` | `demo` | Agendar demonstracao |
| `/contato?assunto=especialista` | `especialista` | Fale com um especialista |
| `/contato?assunto=whatsapp` | `whatsapp` | Pedidos via WhatsApp, Zelo Chat, atendimento |
| `/contato?assunto=suporte` | `suporte` | Suporte inicial, duvidas antes de comecar |
| `/contato?assunto=planos` | `planos` | Conhecer planos e extensoes |
| `/contato?assunto=teste` | `teste` | Testar o Zelo PDV com orientacao |
| `/contato?utm_content=gestao-delivery&assunto=especialista` | `especialista` | Sitelink unico para "Gestao de Delivery" |
| `/contato?utm_content=controle-estoque&assunto=especialista` | `especialista` | Sitelink unico para "Controle de Estoque" |
| `/contato?utm_content=frente-caixa-offline&assunto=demo` | `demo` | Sitelink unico para "Frente de Caixa Offline" |
| `/contato?utm_content=relatorios-vendas&assunto=demo` | `demo` | Sitelink unico para "Relatorios de Vendas" |
| `/contato?utm_content=controle-financeiro&assunto=demo` | `demo` | Sitelink unico para "Controle Financeiro" |

Valores aceitos diretamente: `demo`, `especialista`, `whatsapp`, `suporte`, `planos`, `teste`.
Qualquer outro valor cai em `outro`, entao prefira manter `assunto` com uma dessas intencoes e usar `utm_content` so para diferenciar campanha/sitelink.

## Extensoes e anchors

Use anchors da rota consolidada:

| URL | Uso |
| --- | --- |
| `/extensoes#mesas` | Modulo Mesas |
| `/extensoes#pedidos-cozinha` | Pedidos + Cozinha |
| `/extensoes#acessos` | Controle de Acessos |
| `/extensoes#chat` | Zelo Chat / WhatsApp com IA |

As rotas `/extensoes/mesas`, `/extensoes/pedidos-cozinha` e `/extensoes/chat` redirecionam para anchors. Evite usar rota dinamica em campanha; use a URL final com `#anchor`.

## Blog e SEO editorial

| Rota | Uso |
| --- | --- |
| `/blog` | Lista de artigos |
| `/blog/como-calcular-lucro-real-lanchonete` | Lucro real de lanchonete |
| `/blog/sistema-pdv-para-lanchonete-online` | Sistema PDV online para lanchonete |
| `/blog/controle-de-caixa-para-hamburgueria` | Controle de caixa para hamburgueria |
| `/blog/como-controlar-fiado-em-lanchonete` | Fiado em lanchonete |
| `/blog/como-calcular-taxa-aplicativo-delivery` | Taxas de apps de delivery |
| `/blog/como-fechar-caixa-lanchonete` | Fechamento de caixa |
| `/blog/controle-de-fiado-lanchonete` | Controle de fiado |
| `/blog/7-erros-lanchonetes-perdem-dinheiro` | Erros que reduzem lucro |
| `/blog/5-coisas-lanchonete-deveria-controlar` | Controles essenciais |
| `/blog/10-dicas-organizar-caixa-restaurante` | Organizacao de caixa |
| `/blog/6-sinais-lanchonete-desorganizada` | Sinais de desorganizacao |

Fonte: `src/lib/blog/posts.js`.

## Auth, conta e suporte publico

| Rota | Publico | Uso correto | Observacao |
| --- | --- | --- | --- |
| `/cadastro` | Lead pronto para testar | Criar conta e iniciar teste | Destino obrigatorio para botoes de teste gratis |
| `/login` | Usuario existente | Entrada no sistema | Nao usar como CTA de lead frio |
| `/esqueci-senha` | Usuario existente | Recuperar senha | Publica, mas operacional |
| `/redefinir-senha` | Usuario em fluxo de reset | Finalizar redefinicao de senha | Depende de sessao/link do Supabase |
| `/auth/callback` | OAuth/Supabase | Callback tecnico de autenticacao | Nao divulgar; redireciona para `/app` ou `/login` |
| `/assinatura/sucesso` | Usuario pos-pagamento | Confirmacao de pagamento e tracking de conversao | `noindex`; nao usar em Ads |
| `/zelo-impressao` | Cliente ou usuario em setup | Passo a passo para instalar o Zelo Impressao | Suporte publico; nao e rota de lead |
| `/downloads/zelo-impressao/latest/Zelo-Impressao-Setup.exe` | Cliente em instalacao | Link direto reservado do instalador | Hoje ha apenas `.gitkeep` no path; publicar o `.exe` antes de divulgar |
| `/indica/[codigo]` | Lead indicado | Pagina publica de indicacao/referral | Codigo dinamico vindo do programa de indicacao |
| `/termos` | Qualquer visitante | Termos de uso | Juridico |
| `/privacidade` | Qualquer visitante | Politica de privacidade | Juridico |

## Rotas publicas legadas ou tecnicas

| Rota | Status | Recomendacao |
| --- | --- | --- |
| `/landing` | Placeholder/legado | Nao usar em campanha; editar a landing principal em `/` |
| `/assinatura` | Pagina de billing com layout logado | Nao usar para lead frio; fluxo esperado e usuario autenticado |

## Rotas internas protegidas

Estas rotas nao devem ser usadas como destino para leads ou usuarios sem login:

- `/app`
- `/app/mesas`
- `/app/mesas/[id]`
- `/app/pedidos`
- `/app/pedidos/novo`
- `/app/pedidos/cozinha`
- `/app/pedidos/[id]/editar`
- `/ferramentas`
- `/ferramentas/cardapio`
- `/ferramentas/precificacao`
- `/gestao`
- `/gestao/acessos`
- `/gestao/caixa`
- `/gestao/despesas`
- `/gestao/empresas`
- `/gestao/estoque`
- `/gestao/extensoes`
- `/gestao/fichario`
- `/gestao/indicacoes`
- `/gestao/mesas`
- `/gestao/pessoas`
- `/gestao/produtos`
- `/perfil`
- `/relatorios`

## Arquivos que controlam este mapa

- Rotas SvelteKit: `src/routes/**`
- Layout e exclusoes de header/footer/chat: `src/routes/+layout.svelte`
- Segmentos: `src/lib/data/segmentLandingPages.js`
- Extensoes: `src/lib/data/extensoes.js`
- Blog: `src/lib/blog/posts.js`
- Sitemap publico: `static/sitemap.xml`
