<script>
  // Open Graph / Twitter Card para rotas que não montam essas tags na mão.
  // src/app.html não tem mais defaults de og:title/description/image/url —
  // toda rota pública deve renderizar este componente (ou seu próprio
  // og:* manual) para evitar tags duplicadas no <head> (ver CODE_REVIEW).
  import { absoluteUrl, DEFAULT_SOCIAL } from '$lib/seo/site.js';

  /** @type {string} */
  export let title = DEFAULT_SOCIAL.title;
  /** @type {string} */
  export let description = DEFAULT_SOCIAL.description;
  /** Path relativo ('/sobre') ou URL absoluta. Default: página atual não é assumida — sempre informe. */
  export let url = '';
  /** Path relativo ou URL absoluta da imagem. */
  export let image = DEFAULT_SOCIAL.image;
  export let imageWidth = DEFAULT_SOCIAL.imageWidth;
  export let imageHeight = DEFAULT_SOCIAL.imageHeight;
  /** @type {'website' | 'article'} */
  export let type = 'website';

  $: absoluteImage = image ? absoluteUrl(image) : '';
  $: absoluteCanonical = url ? absoluteUrl(url) : '';
</script>

<svelte:head>
  <meta property="og:type" content={type} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  {#if absoluteCanonical}
    <meta property="og:url" content={absoluteCanonical} />
  {/if}
  {#if absoluteImage}
    <meta property="og:image" content={absoluteImage} />
    {#if imageWidth}
      <meta property="og:image:width" content={String(imageWidth)} />
    {/if}
    {#if imageHeight}
      <meta property="og:image:height" content={String(imageHeight)} />
    {/if}
  {/if}

  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {#if absoluteImage}
    <meta name="twitter:image" content={absoluteImage} />
  {/if}
</svelte:head>
