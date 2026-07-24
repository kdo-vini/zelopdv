<script>
  import { page } from '$app/stores';
  import CompetitorComparison from '$lib/components/marketing/CompetitorComparison.svelte';
  import {
    buildComparisonFaqSchema,
    competitorComparisons,
    softwareApplicationSchema
  } from '$lib/data/competitorComparisons';
  import { error } from '@sveltejs/kit';

  const comparison = Object.values(competitorComparisons).find(c => c.slug === `vs-${$page.params.slug}`);
  if (!comparison) {
    throw error(404, 'Comparação não encontrada');
  }
  const faqSchema = buildComparisonFaqSchema(comparison);
</script>

<svelte:head>
  <title>{comparison.meta.title}</title>
  <meta name="description" content={comparison.meta.description} />
  <link rel="canonical" href={comparison.meta.canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:url" content={comparison.meta.canonical} />
  <meta property="og:title" content={comparison.meta.title} />
  <meta property="og:description" content={comparison.meta.description} />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={comparison.meta.canonical} />
  <meta name="twitter:title" content={comparison.meta.title} />
  <meta name="twitter:description" content={comparison.meta.description} />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(softwareApplicationSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}
</svelte:head>

<CompetitorComparison {comparison} />
