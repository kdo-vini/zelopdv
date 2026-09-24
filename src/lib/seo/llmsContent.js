// Gera o conteúdo de llms.txt e llms-full.txt inteiramente a partir dos data
// modules do repo (pricing.js, blog/posts.js, data/segmentLandingPages.js,
// data/competitorComparisons.js, data/extensoes.js, data/productFacts.js) —
// nunca hardcoded. Ver docs/marketing/GEO_PLAN_2026-09.md seção 4/10 e
// CLAUDE.md.

import { ADDONS, PLANS, TRIAL_DAYS } from '$lib/pricing';
import { formatBRL, ORGANIZATION, SITE_URL } from './site';
import { AUDIENCE, CAPABILITIES, FACTS_UPDATED_AT, NON_CAPABILITIES } from '$lib/data/productFacts';
import { segmentPages, generalFaqs } from '$lib/data/segmentLandingPages';
import { competitorComparisons } from '$lib/data/competitorComparisons';
import { extensoes } from '$lib/data/extensoes';
import { publishedPosts } from '$lib/blog/posts';
import { htmlToText } from './htmlToText';

function planLines() {
  return Object.values(PLANS).map(
    (plan) => `- **${plan.name}** — ${formatBRL(plan.price)}/mês — ${plan.tagline}`
  );
}

function addonLines() {
  return Object.values(ADDONS).map(
    (addon) => `- **${addon.name}** — +${formatBRL(addon.price)}/mês — ${addon.tagline}`
  );
}

function publicPagesLines() {
  const lines = [
    `- [Homepage](${SITE_URL}/) — apresentação do produto e call-to-action`,
    `- [Sobre / Fatos](${SITE_URL}/sobre) — página canônica com preço, público, o que faz e o que não faz`,
    `- [Precificação](${SITE_URL}/precificacao) — calculadora de preço de venda`,
    `- [Extensões](${SITE_URL}/extensoes) — módulos opcionais (Mesas, Acessos, ZeloMenu, ZeloChat)`,
    `- [Comparativos](${SITE_URL}/comparativos) — lista de comparações com concorrentes`,
    `- [Zelo PDV vs Planilha](${SITE_URL}/vs-planilha)`,
    `- [Blog](${SITE_URL}/blog) — artigos sobre gestão de lanchonetes e pequenos negócios`,
    `- [Cadastro](${SITE_URL}/cadastro) — criação de conta (começa trial de ${TRIAL_DAYS} dias)`
  ];

  for (const page of Object.values(segmentPages)) {
    lines.push(`- [${page.h1}](${SITE_URL}/${page.slug}) — landing page para o segmento ${page.segmentName}`);
  }

  for (const comparison of Object.values(competitorComparisons)) {
    lines.push(`- [Zelo PDV vs ${comparison.competitor}](${SITE_URL}/${comparison.slug})`);
  }

  return lines;
}

function extensionLines() {
  return Object.values(extensoes).map((item) => {
    const url = item.external ? item.externalUrl : `${SITE_URL}/extensoes#${item.slug}`;
    return `- [${item.h1}](${url}) — ${item.subtitle}`;
  });
}

function blogLines() {
  return publishedPosts.map(
    (post) =>
      `- [${post.title}](${SITE_URL}/blog/${post.slug}) — ${post.description} (publicado ${post.publishedAt}${post.updatedAt ? `, atualizado ${post.updatedAt}` : ''})`
  );
}

function companyBlock() {
  return [
    `**Desenvolvido por:** ${ORGANIZATION.brand} (${ORGANIZATION.legalName}, CNPJ: ${ORGANIZATION.cnpj})`,
    `**Empresa controladora:** ${ORGANIZATION.parentUrl}`,
    `**Instagram:** ${ORGANIZATION.instagram}`
  ].join('\n');
}

/**
 * Markdown de llms.txt — resumo enxuto do produto, preço, público, páginas
 * públicas e política de conteúdo para IA.
 * @returns {string}
 */
export function buildLlmsTxt() {
  return `# Zelo PDV — Sistema de Gestão e PDV para Lanchonetes, Restaurantes e Pequenos Negócios

> Zelo PDV é um sistema de gestão e frente de caixa (PDV) online para lanchonetes, hamburguerias, restaurantes pequenos, delivery próprio e MEIs brasileiros do setor de alimentação. Roda no navegador, sem instalar nada, e funciona offline via PWA. O plano base cobre caixa, fiado, estoque e financeiro; módulos como Mesas, Controle de Acessos, ZeloMenu e ZeloChat são extensões pagas à parte, e o sistema também registra vendas feitas por iFood e outros apps de delivery.

## Produto

- **URL:** ${SITE_URL}
- **Categoria:** SaaS · POS (Point of Sale) · Gestão de Negócios
- **Público-alvo:** ${AUDIENCE.join('; ')}
- **Teste grátis:** ${TRIAL_DAYS} dias, sem cartão de crédito
- **Última atualização destes fatos:** ${FACTS_UPDATED_AT}

## Preço (plano base + módulos opcionais)

${planLines().join('\n')}

Módulos opcionais (somam ao plano base):

${addonLines().join('\n')}

Não existe "plano único, tudo incluso": o preço final depende do plano escolhido e dos módulos ativados.

## O que o Zelo PDV faz

${CAPABILITIES.map((item) => `- ${item}`).join('\n')}

## O que o Zelo PDV não faz

${NON_CAPABILITIES.map((item) => `- ${item}`).join('\n')}

## Páginas públicas

${publicPagesLines().join('\n')}

## Extensões e integrações

${extensionLines().join('\n')}

## Blog — posts publicados

${blogLines().join('\n')}

## Empresa

${companyBlock()}

## Política de conteúdo para IA

Os artigos do blog e as páginas públicas do Zelo PDV são de livre indexação e citação, desde que a fonte seja preservada. Não indexe conteúdo das rotas autenticadas (/api/, /app, /gestao/, /relatorios, /perfil, /assinatura).

Para o conteúdo completo (FAQs, comparativos e texto integral dos posts do blog), veja ${SITE_URL}/llms-full.txt.
`;
}

/**
 * Markdown de llms-full.txt — conteúdo completo: produto, preços, FAQs
 * gerais, FAQ de cada segmento e comparativo, e o texto de cada post do
 * blog convertido para texto plano.
 * @returns {string}
 */
export function buildLlmsFullTxt() {
  const base = buildLlmsTxt();

  const generalFaqBlock = generalFaqs
    .map((item) => `### ${item.question}\n\n${item.answer}`)
    .join('\n\n');

  const segmentBlocks = Object.values(segmentPages)
    .map((page) => {
      const faq = (page.faqSpecific || [])
        .map((item) => `#### ${item.question}\n\n${item.answer}`)
        .join('\n\n');
      return `### ${page.h1}\n\n${page.subtitle}\n\nURL: ${SITE_URL}/${page.slug}\n\n${faq}`;
    })
    .join('\n\n---\n\n');

  const comparisonBlocks = Object.values(competitorComparisons)
    .map((comparison) => {
      const rows = comparison.comparisonRows
        .map((row) => `- ${row.feature}: Zelo PDV — ${row.zelo}; ${comparison.competitor} — ${row.competitor}`)
        .join('\n');
      const faq = (comparison.faqSpecific || [])
        .map((item) => `#### ${item.question}\n\n${item.answer}`)
        .join('\n\n');
      return `### Zelo PDV vs ${comparison.competitor}\n\n${comparison.subtitle}\n\nURL: ${SITE_URL}/${comparison.slug}\n\nPreço: Zelo PDV ${comparison.priceAnchor.zelo} · ${comparison.competitor} ${comparison.priceAnchor.competitor} (consultado em ${comparison.priceCheckedAt})\n\n${rows}\n\n${faq}`;
    })
    .join('\n\n---\n\n');

  const postBlocks = publishedPosts
    .map((post) => {
      const date = post.updatedAt || post.publishedAt;
      const faq = post.faq
        ? post.faq.map((item) => `#### ${item.question}\n\n${item.answer}`).join('\n\n')
        : '';
      return `### ${post.title}\n\nURL: ${SITE_URL}/blog/${post.slug}\nData: ${date}\n\n${htmlToText(post.content)}${faq ? `\n\n${faq}` : ''}`;
    })
    .join('\n\n---\n\n');

  return `${base}
---

# Conteúdo completo

## Perguntas frequentes gerais

${generalFaqBlock}

## Páginas por segmento (com FAQ)

${segmentBlocks}

## Comparativos com concorrentes (com FAQ)

${comparisonBlocks}

## Posts do blog (texto completo)

${postBlocks}
`;
}
