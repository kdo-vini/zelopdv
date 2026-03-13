<script>
  import BlogCoverArt from '$lib/components/blog/BlogCoverArt.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import { publishedPosts } from '$lib/blog/posts';

  const sortedPosts = [...publishedPosts].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const [featuredPost, ...otherPosts] = sortedPosts;

  const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  function formatDate(date) {
    return dateFormatter.format(new Date(`${date}T00:00:00`));
  }

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog do Zelo PDV',
    description: 'Artigos práticos sobre gestão de lanchonete, controle de caixa, fiado e lucro real para pequenos negócios de alimentação.',
    url: 'https://zelopdv.com.br/blog',
    publisher: {
      '@type': 'Organization',
      name: 'Zelo PDV',
      url: 'https://zelopdv.com.br'
    },
    blogPost: sortedPosts.map((post, i) => ({
      '@type': 'BlogPosting',
      position: i + 1,
      headline: post.title,
      description: post.description,
      url: `https://zelopdv.com.br/blog/${post.slug}`,
      datePublished: post.publishedAt
    }))
  };
</script>

<svelte:head>
  <title>Blog do Zelo PDV — Dicas para Lanchonetes e Pequenos Negócios</title>
  <meta
    name="description"
    content="Artigos práticos sobre gestão de lanchonete, controle de caixa, fiado e lucro real para pequenos negócios de alimentação."
  />
  <link rel="canonical" href="https://zelopdv.com.br/blog" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/blog" />
  <meta property="og:title" content="Blog do Zelo PDV — Dicas para Lanchonetes e Pequenos Negócios" />
  <meta
    property="og:description"
    content="Artigos práticos sobre gestão de lanchonete, controle de caixa, fiado e lucro real para pequenos negócios de alimentação."
  />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/blog" />
  <meta name="twitter:title" content="Blog do Zelo PDV — Dicas para Lanchonetes e Pequenos Negócios" />
  <meta
    name="twitter:description"
    content="Artigos práticos sobre gestão de lanchonete, controle de caixa, fiado e lucro real para pequenos negócios de alimentação."
  />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />

  {@html `<script type="application/ld+json">${JSON.stringify(blogSchema)}</script>`}
</svelte:head>

<div class="blog-shell min-h-screen overflow-x-hidden font-sans">
  <MarketingHeader />

  <main class="pt-28 pb-20">
    <section class="hero-wrap relative">
      <div class="hero-glow hero-glow-a"></div>
      <div class="hero-glow hero-glow-b"></div>

      <div class="max-w-7xl mx-auto px-6">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="hero-kicker">Conteúdo editorial</p>
            <h1 class="hero-title">Blog do ZeloPDV: ideias práticas para caixa, fiado e lucro real</h1>
            <p class="hero-description">
              Um espaço para quem toca lanchonete, hamburgueria, delivery próprio ou MEI de alimentação e precisa
              organizar a operação com mais clareza, sem sistema pesado nem gestão no improviso.
            </p>

            {#if featuredPost}
              <div class="hero-meta">
                <span>{formatDate(featuredPost.publishedAt)}</span>
                <span aria-hidden="true">•</span>
                <span>{featuredPost.readingTime}</span>
              </div>

              <a href={`/blog/${featuredPost.slug}`} class="hero-cta">
                Ler artigo
              </a>
            {/if}
          </div>

          {#if featuredPost}
            <article class="featured-card">
              <a href={`/blog/${featuredPost.slug}`} class="featured-link" aria-label={`Abrir artigo ${featuredPost.title}`}>
                <div class="featured-media">
                  <img
                    src="/blog/1-blog.jpeg"
                    alt="Operadora de lanchonete conferindo fechamento de caixa em um sistema PDV"
                    class="featured-image"
                  />
                </div>

                <div class="featured-body">
                  <div class="featured-date">{formatDate(featuredPost.publishedAt)}</div>
                  <h2 class="featured-title">{featuredPost.title}</h2>
                  <p class="featured-description">{featuredPost.description}</p>
                </div>
              </a>
            </article>
          {/if}
        </div>
      </div>
    </section>

    {#if otherPosts.length > 0}
      <section class="stories-section">
        <div class="max-w-7xl mx-auto px-6">
          <div class="stories-head">
            <h2>Mais histórias</h2>
          </div>

          <div class="stories-grid">
            {#each otherPosts as post}
              <article class="story-card">
                <a href={`/blog/${post.slug}`} class="story-link" aria-label={`Abrir artigo ${post.title}`}>
                  <BlogCoverArt
                    variant={post.coverVariant}
                    compact={true}
                    title="Zelo"
                    label="Equipe Zelo PDV"
                  />

                  <div class="story-body">
                    <div class="story-date">{formatDate(post.publishedAt)}</div>
                    <h3 class="story-title">{post.title}</h3>
                    <p class="story-description">{post.description}</p>
                  </div>
                </a>
              </article>
            {/each}
          </div>
        </div>
      </section>
    {/if}
  </main>

  <MarketingFooter />
</div>

<style>
  .blog-shell {
    background:
      radial-gradient(circle at 20% 0%, var(--blog-glow-a), transparent 32%),
      radial-gradient(circle at 78% 4%, var(--blog-glow-b), transparent 28%),
      linear-gradient(180deg, var(--blog-bg) 0%, color-mix(in srgb, var(--blog-bg) 92%, white) 100%);
    color: var(--blog-text);
  }

  .hero-wrap {
    padding-top: 2.5rem;
    padding-bottom: 5.25rem;
  }

  .hero-grid {
    display: grid;
    gap: 2.5rem;
    align-items: center;
  }

  .hero-copy {
    position: relative;
    z-index: 1;
    max-width: 33rem;
  }

  .hero-kicker {
    color: var(--blog-text);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin-bottom: 1.5rem;
  }

  .hero-title {
    color: var(--blog-text);
    font-size: clamp(3.2rem, 5.8vw, 5.6rem);
    line-height: 0.92;
    letter-spacing: -0.07em;
    font-weight: 700;
    text-wrap: balance;
    margin-bottom: 2rem;
  }

  .hero-description {
    color: var(--blog-muted);
    font-size: clamp(1.22rem, 2.2vw, 1.5rem);
    line-height: 1.58;
    margin-bottom: 2rem;
  }

  .hero-meta {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    color: var(--blog-muted);
    font-size: 1rem;
    margin-bottom: 2rem;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 1.6rem;
    border-radius: 9999px;
    background: var(--blog-surface);
    color: var(--blog-text);
    font-size: 1.05rem;
    font-weight: 600;
    box-shadow: 0 10px 30px var(--blog-shadow);
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .hero-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 34px var(--blog-shadow);
  }

  .featured-card,
  .story-card {
    background: var(--blog-card);
    border: 1px solid var(--blog-border);
    border-radius: 1.7rem;
    overflow: hidden;
    box-shadow: 0 14px 35px var(--blog-shadow);
  }

  .featured-link,
  .story-link {
    display: block;
  }

  .featured-media {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    border-bottom: 1px solid var(--blog-border);
    background: color-mix(in srgb, var(--blog-bg) 82%, white);
  }

  .featured-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .featured-body,
  .story-body {
    padding: 1.7rem 1.8rem 1.9rem;
  }

  .featured-date,
  .story-date {
    color: var(--blog-muted);
    font-size: 0.98rem;
    margin-bottom: 0.8rem;
  }

  .featured-title,
  .story-title {
    color: color-mix(in srgb, var(--blog-text) 86%, black);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.12;
    margin-bottom: 0.85rem;
  }

  .featured-title {
    font-size: clamp(2rem, 2.6vw, 2.5rem);
  }

  .story-title {
    font-size: clamp(1.45rem, 2vw, 1.95rem);
  }

  .featured-description,
  .story-description {
    color: var(--blog-muted);
    font-size: 1.02rem;
    line-height: 1.55;
  }

  .stories-section {
    padding-bottom: 3.5rem;
  }

  .stories-head {
    margin-bottom: 1.6rem;
  }

  .stories-head h2 {
    color: var(--blog-text);
    font-size: clamp(2rem, 3vw, 2.4rem);
    line-height: 1;
    letter-spacing: -0.05em;
    font-weight: 700;
  }

  .stories-grid {
    display: grid;
    gap: 1.25rem;
  }

  .hero-glow {
    position: absolute;
    border-radius: 9999px;
    filter: blur(80px);
    pointer-events: none;
    opacity: 0.9;
  }

  .hero-glow-a {
    width: 22rem;
    height: 22rem;
    top: 0;
    left: 8%;
    background: var(--blog-glow-a);
  }

  .hero-glow-b {
    width: 26rem;
    height: 26rem;
    top: 2rem;
    left: 34%;
    background: var(--blog-glow-b);
  }

  @media (min-width: 960px) {
    .hero-grid {
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
      gap: 4.5rem;
    }

    .stories-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 959px) {
    .hero-wrap {
      padding-bottom: 3.5rem;
    }
  }

  @media (max-width: 640px) {
    .hero-wrap {
      padding-top: 1.5rem;
    }

    .hero-description {
      font-size: 1.08rem;
    }

    .featured-body,
    .story-body {
      padding: 1.25rem 1.15rem 1.35rem;
    }
  }
</style>
