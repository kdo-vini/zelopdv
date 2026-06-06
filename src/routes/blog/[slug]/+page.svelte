<script>
  import BlogCoverArt from '$lib/components/blog/BlogCoverArt.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";

  export let data;

  const { post } = data;

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  $: formattedDate = dateFormatter.format(new Date(`${post.publishedAt}T00:00:00`));
  $: articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    url: `https://zelopdv.com.br/blog/${post.slug}`,
    image: 'https://zelopdv.com.br/og-image.png',
    author: {
      '@type': 'Organization',
      name: 'Equipe Zelo PDV',
      url: 'https://zelopdv.com.br'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Zelo PDV',
      url: 'https://zelopdv.com.br',
      logo: {
        '@type': 'ImageObject',
        url: 'https://zelopdv.com.br/logo-horizontal.png'
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://zelopdv.com.br/blog/${post.slug}`
    }
  };
  $: breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Blog',
        item: 'https://zelopdv.com.br/blog'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: post.title,
        item: `https://zelopdv.com.br/blog/${post.slug}`
      }
    ]
  };
</script>

<svelte:head>
  <title>{post.title} | Zelo PDV</title>
  <meta name="description" content={post.description} />
  <link rel="canonical" href={`https://zelopdv.com.br/blog/${post.slug}`} />

  <meta property="og:type" content="article" />
  <meta property="og:url" content={`https://zelopdv.com.br/blog/${post.slug}`} />
  <meta property="og:title" content={post.title} />
  <meta property="og:description" content={post.description} />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={`https://zelopdv.com.br/blog/${post.slug}`} />
  <meta name="twitter:title" content={post.title} />
  <meta name="twitter:description" content={post.description} />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`}
</svelte:head>

<div class="article-shell min-h-screen overflow-x-hidden font-sans">
  <SiteHeader />

  <main class="pt-28 pb-20">
    <section class="article-stage">
      <div class="article-glow article-glow-a"></div>
      <div class="article-glow article-glow-b"></div>

      <div class="max-w-6xl mx-auto px-6">
        <nav class="article-breadcrumb">
          <a href="/blog">Blog</a>
          <span aria-hidden="true">→</span>
          <span>{post.title}</span>
        </nav>

        <div class="article-hero">
          <div class="article-intro">
            <div class="article-meta">
              <span>{formattedDate}</span>
              <span aria-hidden="true">•</span>
              <span>{post.readingTime}</span>
            </div>

            <h1 class="article-title">{post.title}</h1>
            <p class="article-deck">{post.description}</p>
          </div>

          <div class="article-cover-shell">
            <BlogCoverArt
              variant={post.coverVariant}
              title="Zelo"
              label="Equipe Zelo PDV"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="article-body-wrap">
      <div class="max-w-184 mx-auto px-6">
        <article class="article-card">
          <div class="article-content">
            {@html post.content}
          </div>
        </article>

        <section class="article-cta">
          <p class="article-cta-title">Quer colocar em prática? O Zelo PDV faz isso por você.</p>
          <a
            href="/cadastro"
            class="article-cta-button"
          >
            Testar 30 dias grátis →
          </a>
        </section>
      </div>
    </section>
  </main>

  <MarketingFooter />
</div>

<style>
  .article-shell {
    background:
      radial-gradient(circle at 16% 0%, var(--blog-glow-a), transparent 26%),
      radial-gradient(circle at 80% 0%, var(--blog-glow-b), transparent 22%),
      linear-gradient(180deg, var(--blog-bg) 0%, color-mix(in srgb, var(--blog-bg) 90%, white) 100%);
    color: var(--blog-text);
  }

  .article-stage {
    position: relative;
    padding-top: 1.5rem;
    padding-bottom: 3rem;
  }

  .article-breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.95rem;
    color: var(--blog-muted);
    margin-bottom: 2rem;
  }

  .article-breadcrumb a {
    transition: color 180ms ease;
  }

  .article-breadcrumb a:hover {
    color: var(--blog-text);
  }

  .article-hero {
    display: grid;
    gap: 1.75rem;
    align-items: end;
  }

  .article-intro {
    max-width: 42rem;
  }

  .article-meta {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--blog-muted);
    font-size: 1rem;
    margin-bottom: 1.2rem;
  }

  .article-title {
    color: var(--blog-text);
    font-size: clamp(2.8rem, 6vw, 4.9rem);
    line-height: 0.95;
    letter-spacing: -0.07em;
    font-weight: 700;
    text-wrap: balance;
    margin-bottom: 1.3rem;
  }

  .article-deck {
    color: var(--blog-muted);
    font-size: clamp(1.15rem, 2.2vw, 1.4rem);
    line-height: 1.58;
    max-width: 36rem;
  }

  .article-cover-shell {
    background: var(--blog-card);
    border: 1px solid var(--blog-border);
    border-radius: 1.8rem;
    overflow: hidden;
    box-shadow: 0 16px 40px var(--blog-shadow);
  }

  .article-body-wrap {
    padding-top: 0.5rem;
  }

  .article-card {
    background: var(--blog-surface);
    border: 1px solid var(--blog-border);
    border-radius: 2rem;
    box-shadow: 0 18px 44px var(--blog-shadow);
    padding: clamp(1.4rem, 3vw, 2.2rem);
  }

  .article-content :global(h2) {
    color: var(--blog-text);
    font-size: clamp(1.9rem, 3vw, 2.4rem);
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: -0.05em;
    margin-top: 2.8rem;
    margin-bottom: 1rem;
  }

  .article-content :global(p) {
    color: color-mix(in srgb, var(--blog-text) 78%, var(--blog-muted));
    font-size: 1.09rem;
    line-height: 1.9;
    margin-bottom: 1.25rem;
  }

  .article-content :global(ul) {
    margin: 0 0 1.5rem 1.25rem;
    color: color-mix(in srgb, var(--blog-text) 78%, var(--blog-muted));
    list-style: disc;
  }

  .article-content :global(li) {
    margin-bottom: 0.8rem;
    line-height: 1.8;
    font-size: 1.04rem;
  }

  .article-content :global(strong) {
    color: var(--blog-text);
    font-weight: 700;
  }

  .article-cta {
    margin-top: 1.4rem;
    background: var(--blog-surface);
    border: 1px solid var(--blog-border);
    border-radius: 1.8rem;
    box-shadow: 0 14px 36px var(--blog-shadow);
    padding: 2rem 1.5rem;
    text-align: center;
  }

  .article-cta-title {
    color: var(--blog-text);
    font-size: clamp(1.35rem, 3vw, 2rem);
    line-height: 1.18;
    font-weight: 700;
    margin-bottom: 1.4rem;
    letter-spacing: -0.04em;
  }

  .article-cta-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 1.8rem;
    border-radius: 9999px;
    background: linear-gradient(135deg, var(--primary), var(--primary-hover));
    color: var(--primary-text);
    font-size: 1rem;
    font-weight: 600;
    box-shadow: 0 14px 34px color-mix(in srgb, var(--primary) 28%, transparent);
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .article-cta-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 38px color-mix(in srgb, var(--primary) 34%, transparent);
  }

  .article-glow {
    position: absolute;
    border-radius: 9999px;
    filter: blur(80px);
    pointer-events: none;
    opacity: 0.9;
  }

  .article-glow-a {
    width: 18rem;
    height: 18rem;
    top: 2rem;
    left: 11%;
    background: var(--blog-glow-a);
  }

  .article-glow-b {
    width: 20rem;
    height: 20rem;
    top: 1rem;
    right: 12%;
    background: var(--blog-glow-b);
  }

  @media (min-width: 980px) {
    .article-hero {
      grid-template-columns: minmax(0, 0.95fr) minmax(19rem, 24rem);
      gap: 2rem;
    }
  }

  @media (max-width: 640px) {
    .article-stage {
      padding-top: 0.5rem;
      padding-bottom: 2rem;
    }

    .article-breadcrumb {
      gap: 0.45rem;
      font-size: 0.88rem;
      margin-bottom: 1.25rem;
    }

    .article-content :global(p),
    .article-content :global(li) {
      font-size: 1rem;
    }
  }
</style>
