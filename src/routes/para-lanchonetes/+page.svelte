<script>
  import SegmentLandingPage from '$lib/components/marketing/SegmentLandingPage.svelte';
  import { buildFaqSchema, segmentPages, softwareApplicationSchema } from '$lib/data/segmentLandingPages';

  const page = segmentPages.lanchonetes;
  const faqSchema = buildFaqSchema(page);
</script>

<svelte:head>
  <title>{page.meta.title}</title>
  <meta name="description" content={page.meta.description} />
  <link rel="canonical" href={page.meta.canonical} />

  <meta property="og:type" content="website" />
  <meta property="og:url" content={page.meta.canonical} />
  <meta property="og:title" content={page.meta.title} />
  <meta property="og:description" content={page.meta.description} />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={page.meta.canonical} />
  <meta name="twitter:title" content={page.meta.title} />
  <meta name="twitter:description" content={page.meta.description} />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  <script type="application/ld+json">{JSON.stringify(softwareApplicationSchema)}</script>
  <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
</svelte:head>

<SegmentLandingPage {page} />
