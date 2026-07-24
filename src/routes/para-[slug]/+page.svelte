<script>
  import { page } from '$app/stores';
  import SegmentLandingPage from '$lib/components/marketing/SegmentLandingPage.svelte';
  import { buildFaqSchema, segmentPages, softwareApplicationSchema } from '$lib/data/segmentLandingPages';
  import { error } from '@sveltejs/kit';

  const pageData = segmentPages[$page.params.slug];
  if (!pageData) {
    throw error(404, 'Página não encontrada');
  }
  const faqSchema = buildFaqSchema(pageData);
</script>

<svelte:head>
  <title>{pageData.meta.title}</title>
  <meta name="description" content={pageData.meta.description} />
  <link rel="canonical" href={pageData.meta.canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:url" content={pageData.meta.canonical} />
  <meta property="og:title" content={pageData.meta.title} />
  <meta property="og:description" content={pageData.meta.description} />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={pageData.meta.canonical} />
  <meta name="twitter:title" content={pageData.meta.title} />
  <meta name="twitter:description" content={pageData.meta.description} />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(softwareApplicationSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}
</svelte:head>

<SegmentLandingPage page={pageData} />
