<script>
  import SiteHeader from "$lib/components/marketing/SiteHeader.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";

  // defaultMarkup = markup sobre o custo (%). Converted from the antigas margens
  // sobre a venda via markup = margem / (1 - margem), preservando os preços atuais.
  const niches = [
    {
      id: "marmitaria",
      label: "Marmitaria",
      defaultMarkup: 39,
      commonRange: "28% a 54%",
      placeholder: "Marmita de frango grelhado",
      defaultPlatformFee: true,
      description: "Boa para quem vende unidade avulsa e também por app.",
    },
    {
      id: "lanchonete",
      label: "Lanchonete / Hot-dog",
      defaultMarkup: 43,
      commonRange: "33% a 67%",
      placeholder: "Hot-dog especial",
      defaultPlatformFee: false,
      description:
        "Ideal para lanche unitário, combo simples e venda no balcão.",
    },
    {
      id: "hamburgueria",
      label: "Hamburgueria",
      defaultMarkup: 47,
      commonRange: "39% a 82%",
      placeholder: "Burger artesanal",
      defaultPlatformFee: true,
      description: "Funciona bem para combo, smash e delivery por app.",
    },
    {
      id: "pizzaria",
      label: "Pizzaria",
      defaultMarkup: 43,
      commonRange: "33% a 61%",
      placeholder: "Pizza média de calabresa",
      defaultPlatformFee: true,
      description: "Use quando embalagem, entrega e taxa influenciam bastante.",
    },
    {
      id: "doceria",
      label: "Açaí / Doceria / Páscoa",
      defaultMarkup: 54,
      commonRange: "43% a 100%",
      placeholder: "Ovo de Páscoa de 350g",
      defaultPlatformFee: false,
      description:
        "Serve para doce unitário, kit sazonal e produção por encomenda.",
    },
    {
      id: "delivery",
      label: "Delivery puro",
      defaultMarkup: 39,
      commonRange: "28% a 54%",
      placeholder: "Combo delivery",
      defaultPlatformFee: true,
      description: "Escolha este se a maior parte das vendas passa por app.",
    },
    {
      id: "mercadinho",
      label: "Mercadinho / Mercearia",
      defaultMarkup: 25,
      commonRange: "18% a 39%",
      placeholder: "Cesta promocional",
      defaultPlatformFee: false,
      description: "Melhor para itens simples com giro recorrente.",
    },
    {
      id: "outro",
      label: "Outro",
      defaultMarkup: 43,
      commonRange: "25% a 67%",
      placeholder: "Seu produto principal",
      defaultPlatformFee: false,
      description: "Use quando seu caso não encaixa nos exemplos acima.",
    },
  ];

  const unitOptions = [
    { value: "g", label: "g", family: "weight", factor: 1 },
    { value: "kg", label: "kg", family: "weight", factor: 1000 },
    { value: "ml", label: "ml", family: "volume", factor: 1 },
    { value: "l", label: "L", family: "volume", factor: 1000 },
    { value: "un", label: "un", family: "count", factor: 1 },
  ];

  const faqItems = [
    {
      question: "Preciso saber quantas vou vender no mês?",
      answer:
        "Não. Se você quer descobrir quanto cobrar em uma unidade, use o modo Preço de 1 produto. A estimativa de vendas por mês só entra no modo de negócio completo.",
    },
    {
      question: "Posso lancar ingrediente por ingrediente?",
      answer:
        "Sim. Você pode informar quantidade comprada, unidade, preço pago e quantidade usada na receita. A calculadora faz a proporção automaticamente.",
    },
    {
      question: "Posso usar para ovo de Páscoa, hot-dog ou bolo no pote?",
      answer:
        "Sim. O modo rápido foi desenhado exatamente para produto unitário e sazonal. Serve para hot-dog, marmita, ovo de Páscoa, doce, pizza e vários outros casos.",
    },
    {
      question: "A taxa da plataforma entra no calculo?",
      answer:
        "Sim. Se você vende por app, marketplace ou outro canal com percentual de desconto, basta ativar a taxa e informar o número.",
    },
    {
      question: "Qual margem de lucro devo usar?",
      answer:
        "Não existe um número único. O ideal é partir de um preset equilibrado e ajustar se o preço final ficar alto ou baixo demais para o seu público.",
    },
  ];

  const productStepLabels = [
    "O que",
    "Custos",
    "Extras",
    "Margem",
    "Resultado",
  ];

  const nicheMap = niches.reduce((acc, niche) => {
    acc[niche.id] = niche;
    return acc;
  }, {});

  const unitMap = unitOptions.reduce((acc, unit) => {
    acc[unit.value] = unit;
    return acc;
  }, {});

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  let productStep = 1;
  let ingredientId = 2;

  let productForm = createProductForm("outro");
  let ingredientRows = [createIngredientRow()];

  function openSupportChat() {
    window.dispatchEvent(new CustomEvent("zelo:open-support-chat"));
  }

  function createProductForm(nicheId) {
    const niche = nicheMap[nicheId] || niches[0];
    return {
      niche: niche.id,
      productName: "",
      costMode: "simple",
      totalCost: 0,
      packagingCost: 0,
      extraUnitCost: 0,
      includePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? 12 : 0,
      marginPreset: "balanced",
      useCustomMarkup: false,
      customMarkup: niche.defaultMarkup,
    };
  }

  function createIngredientRow() {
    return {
      id: ingredientId++,
      name: "",
      purchaseQuantity: 0,
      purchaseUnit: "kg",
      purchasePrice: 0,
      usageQuantity: 0,
      usageUnit: "g",
    };
  }

  function clampNumber(value, min = 0, max = 9999999) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function parseCurrencyInput(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits ? Number(digits) / 100 : 0;
  }

  function formatCurrencyInput(value) {
    if (!value) return "";
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatCurrency(value) {
    return currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  function formatWholeNumber(value) {
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  }

  function getPresetMarkups(nicheId) {
    const niche = nicheMap[nicheId] || niches[0];
    return {
      competitive: Math.max(1, niche.defaultMarkup - 10),
      balanced: niche.defaultMarkup,
      premium: Math.min(300, niche.defaultMarkup + 20),
    };
  }

  function updateProductField(field, value) {
    productForm = { ...productForm, [field]: value };
  }

  function selectProductNiche(nicheId) {
    const niche = nicheMap[nicheId];
    if (!niche) return;
    productForm = {
      ...productForm,
      niche: niche.id,
      includePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? productForm.platformFee || 12 : 0,
      customMarkup: niche.defaultMarkup,
    };
  }

  function setProductCostMode(mode) {
    productForm = { ...productForm, costMode: mode };
  }

  function addIngredientRow() {
    ingredientRows = [...ingredientRows, createIngredientRow()];
  }

  function removeIngredientRow(id) {
    if (ingredientRows.length === 1) return;
    ingredientRows = ingredientRows.filter((row) => row.id !== id);
  }

  function updateIngredientRow(id, field, value) {
    ingredientRows = ingredientRows.map((row) =>
      row.id === id ? { ...row, [field]: value } : row,
    );
  }

  function getUnitDefinition(unit) {
    return unitMap[unit] || unitMap.g;
  }

  function isIngredientCompatible(row) {
    const purchaseUnit = getUnitDefinition(row.purchaseUnit);
    const usageUnit = getUnitDefinition(row.usageUnit);
    return purchaseUnit.family === usageUnit.family;
  }

  function getIngredientRowCost(row) {
    if (!isIngredientCompatible(row)) return 0;
    const purchaseUnit = getUnitDefinition(row.purchaseUnit);
    const usageUnit = getUnitDefinition(row.usageUnit);
    const purchaseQuantity =
      Number(row.purchaseQuantity || 0) * purchaseUnit.factor;
    const usageQuantity = Number(row.usageQuantity || 0) * usageUnit.factor;
    const purchasePrice = Number(row.purchasePrice || 0);

    if (purchaseQuantity <= 0 || usageQuantity <= 0 || purchasePrice <= 0)
      return 0;
    return purchasePrice * (usageQuantity / purchaseQuantity);
  }

  function goToProductStep(step) {
    if (step < 1 || step > 5) return;
    productStep = step;
  }

  function nextProductStep() {
    if (productStep < 5) productStep += 1;
  }

  function previousProductStep() {
    if (productStep > 1) productStep -= 1;
  }

  $: productNiche = nicheMap[productForm.niche] || niches[0];
  $: productPresetMarkups = getPresetMarkups(productForm.niche);
  $: productMarkup = productForm.useCustomMarkup
    ? productForm.customMarkup
    : productPresetMarkups[productForm.marginPreset];
  $: ingredientCostTotal = ingredientRows.reduce(
    (total, row) => total + getIngredientRowCost(row),
    0,
  );
  $: ingredientRowCountWithData = ingredientRows.filter(
    (row) =>
      row.name ||
      row.purchaseQuantity ||
      row.purchasePrice ||
      row.usageQuantity,
  ).length;
  $: productBaseCost =
    productForm.costMode === "simple"
      ? productForm.totalCost
      : ingredientCostTotal;
  $: productDirectCost =
    productBaseCost + productForm.packagingCost + productForm.extraUnitCost;
  $: productFeeRate = productForm.includePlatformFee
    ? productForm.platformFee / 100
    : 0;
  $: productMarkupRate = productMarkup / 100;
  // Parcela do preço que sobra pro vendedor depois da taxa da plataforma.
  // Como a taxa é limitada a 35%, esse denominador nunca zera (sem dead-end).
  $: productNetRate = 1 - productFeeRate;
  // Preço mínimo = ponto de equilíbrio (recupera o custo já contando a taxa).
  $: productMinimumPrice =
    productDirectCost > 0 && productNetRate > 0
      ? productDirectCost / productNetRate
      : 0;
  // Markup é sobre o CUSTO; depois fazemos o "gross up" pela taxa pra preservar
  // o lucro alvo mesmo pagando a plataforma: preço = custo × (1 + markup) ÷ (1 − taxa).
  $: productSuggestedPrice =
    productDirectCost > 0 && productNetRate > 0
      ? (productDirectCost * (1 + productMarkupRate)) / productNetRate
      : 0;
  $: productFeeValue = productSuggestedPrice * productFeeRate;
  $: productProfitPerUnit =
    productSuggestedPrice > 0
      ? productSuggestedPrice - productDirectCost - productFeeValue
      : 0;
  // Margem sobre a venda real (já líquida da taxa). Sem taxa, equivale a
  // markup / (1 + markup) — ex.: markup 100% = 50% de margem.
  $: productMarginOnSale =
    productSuggestedPrice > 0
      ? productProfitPerUnit / productSuggestedPrice
      : productMarkupRate / (1 + productMarkupRate);
  $: productResultReady = productDirectCost > 0 && productNetRate > 0;
  $: productLabel = productForm.productName || productNiche.placeholder;

  $: webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Calculadora de Precificação Zelo PDV",
    url: "https://zelopdv.com.br/precificacao",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    description:
      "Ferramenta grátis para calcular preço de venda de produtos e precificação completa de pequenos negócios.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "BRL",
    },
    featureList: [
      "Cálculo rápido para produto específico",
      "Lançamento ingrediente por ingrediente",
      "Precificação completa com custos fixos",
      "Preço mínimo e preço recomendado",
    ],
  };

  $: faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
</script>

<svelte:head>
  <title>Calculadora de Precificação Grátis | Zelo PDV</title>
  <meta
    name="description"
    content="Calcule o preço ideal dos seus produtos. Ferramenta grátis para lanchonetes, hamburguerias, delivery, marmitarias e pequenos negócios."
  />
  <meta
    name="keywords"
    content="precificação, calcular preço de venda, margem de lucro, preço de custo, quanto cobrar, delivery, marmitaria"
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://zelopdv.com.br/precificacao" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://zelopdv.com.br/precificacao" />
  <meta
    property="og:title"
    content="Calculadora de Precificação Grátis | Zelo PDV"
  />
  <meta
    property="og:description"
    content="Descubra quanto cobrar em um produto específico ou monte a precificação completa do seu negócio."
  />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/precificacao" />
  <meta
    name="twitter:title"
    content="Calculadora de Precificação Grátis | Zelo PDV"
  />
  <meta
    name="twitter:description"
    content="Calcule o preço de venda ideal para hot-dog, marmita, ovo de Páscoa e outros produtos sem precisar criar conta."
  />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />
</svelte:head>

{@html `<script type="application/ld+json">${JSON.stringify(webAppSchema)}</script>`}
{@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}

<div class="min-h-screen page-shell">
  <SiteHeader />

  <section class="hero-shell">
    <div class="max-w-6xl mx-auto px-6 hero-stack">
      <h1 class="hero-title">Descubra quanto cobrar</h1>
      <p class="hero-subtitle">
        Calcule o preço de venda de qualquer produto de forma simples e descubra
        sua margem real.
      </p>
    </div>
  </section>

  <section class="pb-24">
    <div class="max-w-6xl mx-auto px-6 page-content">
      <section class="section-card section-spacing">
        <div class="progress-shell">
          {#each productStepLabels as label, index}
            <button
              type="button"
              class="progress-step"
              class:progress-step-complete={index + 1 < productStep}
              class:progress-step-current={index + 1 === productStep}
              on:click={() => goToProductStep(index + 1)}
            >
              <span class="progress-circle">{index + 1}</span>
              <small>{label}</small>
            </button>
          {/each}
        </div>

        {#if productStep === 1}
          <div class="input-grid">
            <label class="field">
              <span class="field-label">Nome do produto</span>
              <input
                class="input"
                type="text"
                placeholder={productNiche.placeholder}
                value={productForm.productName}
                on:input={(event) =>
                  updateProductField("productName", event.currentTarget.value)}
              />
            </label>
          </div>

          <details class="details-card compact-top">
            <summary
              >Quer margens pré-configuradas? Escolha seu segmento</summary
            >
            <div class="details-body">
              <div class="niche-chips">
                {#each niches as niche}
                  <button
                    type="button"
                    class="niche-chip"
                    class:chip-selected={productForm.niche === niche.id}
                    on:click={() => selectProductNiche(niche.id)}
                  >
                    <span>{niche.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          </details>
        {/if}

        {#if productStep === 2}
          <div class="mode-grid">
            <button
              type="button"
              class="mode-card"
              class:mode-card-active={productForm.costMode === "simple"}
              on:click={() => setProductCostMode("simple")}
            >
              <strong>Tenho o custo total da unidade</strong>
              <p>
                Melhor para quem já sabe o custo final da receita ou quer um
                cálculo rápido.
              </p>
            </button>

            <button
              type="button"
              class="mode-card"
              class:mode-card-active={productForm.costMode === "ingredients"}
              on:click={() => setProductCostMode("ingredients")}
            >
              <strong>Quero lançar ingrediente por ingrediente</strong>
              <p>
                Melhor para quando você quer calcular proporção por peso, volume
                ou unidades.
              </p>
            </button>
          </div>

          {#if productForm.costMode === "simple"}
            <div class="hero-input-area compact-top">
              <label class="hero-field">
                <span class="hero-field-label"
                  >Custo total da receita / unidade</span
                >
                <p class="hero-field-subtitle">
                  Insira o valor final de produção da sua unidade.
                </p>
                <div class="hero-money-input">
                  <span>R$</span>
                  <input
                    class="hero-money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(productForm.totalCost)}
                    on:input={(event) =>
                      updateProductField(
                        "totalCost",
                        parseCurrencyInput(event.currentTarget.value),
                      )}
                  />
                </div>
              </label>
            </div>
          {:else}
            <div class="builder-shell">
              <div class="builder-head">
                <div>
                  <p class="field-label no-gap">Ingredientes da receita</p>
                  <p class="builder-copy">
                    Preencha quanto você comprou, quanto pagou e quanto entra na
                    receita.
                  </p>
                </div>
              </div>

              <div class="ingredient-list">
                {#each ingredientRows as row, index}
                  <div class="ingredient-row">
                    <div class="ingredient-row-top">
                      <div>
                        <strong>Linha {index + 1}</strong>
                        {#if row.name}
                          <span>{row.name}</span>
                        {:else}
                          <span>Ingrediente sem nome</span>
                        {/if}
                      </div>
                      <div class="ingredient-row-actions">
                        <span class="row-cost"
                          >{formatCurrency(getIngredientRowCost(row))}</span
                        >
                        <button
                          type="button"
                          class="icon-button"
                          aria-label="Remover ingrediente"
                          on:click={() => removeIngredientRow(row.id)}
                          disabled={ingredientRows.length === 1}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    <div class="ingredient-grid">
                      <label class="field">
                        <span class="field-label">Ingrediente</span>
                        <input
                          class="input"
                          type="text"
                          placeholder="Ex: salsicha, chocolate, creme"
                          value={row.name}
                          on:input={(event) =>
                            updateIngredientRow(
                              row.id,
                              "name",
                              event.currentTarget.value,
                            )}
                        />
                      </label>

                      <label class="field">
                        <span class="field-label">Quantidade comprada</span>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.purchaseQuantity}
                          on:input={(event) =>
                            updateIngredientRow(
                              row.id,
                              "purchaseQuantity",
                              clampNumber(event.currentTarget.value, 0),
                            )}
                        />
                      </label>

                      <label class="field">
                        <span class="field-label">Unidade comprada</span>
                        <select
                          class="input"
                          value={row.purchaseUnit}
                          on:change={(event) =>
                            updateIngredientRow(
                              row.id,
                              "purchaseUnit",
                              event.currentTarget.value,
                            )}
                        >
                          {#each unitOptions as unit}
                            <option value={unit.value}>{unit.label}</option>
                          {/each}
                        </select>
                      </label>

                      <label class="field">
                        <span class="field-label">Preço pago</span>
                        <div class="money-input">
                          <span>R$</span>
                          <input
                            class="money-field"
                            type="text"
                            inputmode="numeric"
                            placeholder="0,00"
                            value={formatCurrencyInput(row.purchasePrice)}
                            on:input={(event) =>
                              updateIngredientRow(
                                row.id,
                                "purchasePrice",
                                parseCurrencyInput(event.currentTarget.value),
                              )}
                          />
                        </div>
                      </label>

                      <label class="field">
                        <span class="field-label">Quantidade usada</span>
                        <input
                          class="input"
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.usageQuantity}
                          on:input={(event) =>
                            updateIngredientRow(
                              row.id,
                              "usageQuantity",
                              clampNumber(event.currentTarget.value, 0),
                            )}
                        />
                      </label>

                      <label class="field">
                        <span class="field-label">Unidade usada</span>
                        <select
                          class="input"
                          value={row.usageUnit}
                          on:change={(event) =>
                            updateIngredientRow(
                              row.id,
                              "usageUnit",
                              event.currentTarget.value,
                            )}
                        >
                          {#each unitOptions as unit}
                            <option value={unit.value}>{unit.label}</option>
                          {/each}
                        </select>
                      </label>
                    </div>

                    {#if !isIngredientCompatible(row) && row.purchaseQuantity && row.usageQuantity}
                      <p class="warning-copy">
                        As unidades comprada e usada precisam ser da mesma
                        família.
                      </p>
                    {/if}
                  </div>
                {/each}
              </div>

              <button
                type="button"
                class="secondary-button"
                on:click={addIngredientRow}
                style="margin-top: 1rem;"
              >
                + Adicionar ingrediente
              </button>

              <div class="builder-summary">
                <span>Subtotal dos ingredientes</span>
                <strong>{formatCurrency(ingredientCostTotal)}</strong>
              </div>
            </div>
          {/if}
        {/if}

        {#if productStep === 3}
          <div class="input-grid">
            <label class="field">
              <span class="field-label">Embalagem</span>
              <div class="money-input">
                <span>R$</span>
                <input
                  class="money-field"
                  type="text"
                  inputmode="numeric"
                  placeholder="0,00"
                  value={formatCurrencyInput(productForm.packagingCost)}
                  on:input={(event) =>
                    updateProductField(
                      "packagingCost",
                      parseCurrencyInput(event.currentTarget.value),
                    )}
                />
              </div>
            </label>

            <label class="field">
              <span class="field-label">Outros custos por unidade</span>
              <div class="money-input">
                <span>R$</span>
                <input
                  class="money-field"
                  type="text"
                  inputmode="numeric"
                  placeholder="0,00"
                  value={formatCurrencyInput(productForm.extraUnitCost)}
                  on:input={(event) =>
                    updateProductField(
                      "extraUnitCost",
                      parseCurrencyInput(event.currentTarget.value),
                    )}
                />
              </div>
            </label>
          </div>
        {/if}

        {#if productStep === 4}
          <div class="markup-heading">
            <span class="field-label no-gap">Markup sobre o custo</span>
            <span
              class="info-tip"
              tabindex="0"
              role="note"
              aria-label="O que é markup e o que é margem sobre a venda"
            >
              i
              <span class="info-pop">
                <strong>Markup sobre o custo</strong> — quanto você soma em cima do
                que o produto te custa. Ex.: custo R$ 10 com 100% de markup → você
                quer R$ 10 de lucro, então o preço-base é R$ 20.<br />
                Conta: <em>preço = custo × (1 + markup) ÷ (1 − taxa)</em>.
                <br /><br />
                <strong>Margem sobre a venda</strong> — quanto do preço final é
                lucro de verdade. Ex.: R$ 10 de lucro num preço de R$ 20 = 50%.<br />
                Conta: <em>margem = lucro ÷ preço</em>.
                <br /><br />
                Markup de 100% (vender pelo dobro do custo) equivale a 50% de
                margem. A taxa da plataforma é descontada à parte e reduz a margem
                real.
              </span>
            </span>
          </div>
          <div class="preset-grid">
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={!productForm.useCustomMarkup &&
                productForm.marginPreset === "competitive"}
              on:click={() => updateProductField("marginPreset", "competitive")}
            >
              <strong>Mais competitivo</strong>
              <span>{productPresetMarkups.competitive}%</span>
            </button>
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={!productForm.useCustomMarkup &&
                productForm.marginPreset === "balanced"}
              on:click={() => updateProductField("marginPreset", "balanced")}
            >
              <strong>Equilibrado</strong>
              <span>{productPresetMarkups.balanced}%</span>
            </button>
            <button
              type="button"
              class="preset-card"
              class:preset-card-active={!productForm.useCustomMarkup &&
                productForm.marginPreset === "premium"}
              on:click={() => updateProductField("marginPreset", "premium")}
            >
              <strong>Mais lucrativo</strong>
              <span>{productPresetMarkups.premium}%</span>
            </button>
          </div>

          <details class="details-card compact-top">
            <summary>Ajuste fino de markup e taxas</summary>
            <div class="details-body">
              <label class="toggle-line">
                <input
                  type="checkbox"
                  checked={productForm.useCustomMarkup}
                  on:change={(event) =>
                    updateProductField(
                      "useCustomMarkup",
                      event.currentTarget.checked,
                    )}
                />
                <span>Usar markup customizado</span>
              </label>

              {#if productForm.useCustomMarkup}
                <div class="slider-card compact-top">
                  <div class="slider-head">
                    <div>
                      <p class="field-label">Markup desejado</p>
                      <p class="slider-copy">
                        Para {productNiche.label.toLowerCase()}, markups entre {productNiche.commonRange}
                        sao comuns.
                      </p>
                    </div>
                    <strong>{productForm.customMarkup}%</strong>
                  </div>
                  <input
                    class="range-input"
                    type="range"
                    min="1"
                    max="300"
                    step="1"
                    value={productForm.customMarkup}
                    on:input={(event) =>
                      updateProductField(
                        "customMarkup",
                        clampNumber(event.currentTarget.value, 1, 300),
                      )}
                  />
                  <p class="slider-equivalence">
                    ≈ {formatWholeNumber(productMarginOnSale * 100)}% de margem sobre
                    a venda
                  </p>
                </div>
              {/if}

              <label class="toggle-line compact-top">
                <input
                  type="checkbox"
                  checked={productForm.includePlatformFee}
                  on:change={(event) =>
                    updateProductField(
                      "includePlatformFee",
                      event.currentTarget.checked,
                    )}
                />
                <span>Aplicar taxa de plataforma / app</span>
              </label>

              {#if productForm.includePlatformFee}
                <label class="field field-compact compact-top">
                  <span class="field-label">Taxa da plataforma (%)</span>
                  <input
                    class="input"
                    type="number"
                    min="0"
                    max="35"
                    step="0.1"
                    value={productForm.platformFee}
                    on:input={(event) =>
                      updateProductField(
                        "platformFee",
                        clampNumber(event.currentTarget.value, 0, 35),
                      )}
                  />
                </label>
              {/if}
            </div>
          </details>
        {/if}

        {#if productStep === 5}
          {#if productResultReady}
            <div class="result-highlight-grid">
              <div class="price-spotlight">
                <span>Preço mínimo</span>
                <strong>{formatCurrency(productMinimumPrice)}</strong>
                <p>
                  Ponto de equilíbrio (custo{#if productForm.includePlatformFee}
                    + taxa{/if}). Abaixo disso você vende no prejuízo.
                </p>
              </div>

              <div class="price-spotlight price-spotlight-strong">
                <span>Preço recomendado</span>
                <strong>{formatCurrency(productSuggestedPrice)}</strong>
                <p>Com o markup escolhido e custos informados.</p>
              </div>
            </div>

            <div class="metric-grid compact-top">
              <div class="metric-card">
                <span class="metric-label-row">
                  Markup / margem
                  <span
                    class="info-tip"
                    tabindex="0"
                    role="note"
                    aria-label="Diferença entre markup e margem"
                  >
                    i
                    <span class="info-pop">
                      <strong>Markup sobre o custo</strong> — quanto você soma em
                      cima do custo. Conta:
                      <em>preço = custo × (1 + markup) ÷ (1 − taxa)</em>.
                      <br /><br />
                      <strong>Margem sobre a venda</strong> — quanto do preço final
                      é lucro. Conta: <em>margem = lucro ÷ preço</em>.
                      <br /><br />
                      Markup de 100% = vender pelo dobro do custo = 50% de margem
                      (sem taxa).
                    </span>
                  </span>
                </span>
                <strong
                  >{formatWholeNumber(productMarkup)}% / {formatWholeNumber(
                    productMarginOnSale * 100,
                  )}%</strong
                >
              </div>
              <div class="metric-card">
                <span>Lucro por unidade</span>
                <strong>{formatCurrency(productProfitPerUnit)}</strong>
              </div>
              <div class="metric-card">
                <span>Custo total da unidade</span>
                <strong>{formatCurrency(productDirectCost)}</strong>
              </div>
              <div class="metric-card">
                <span>Ingredientes / base</span>
                <strong>{formatCurrency(productBaseCost)}</strong>
              </div>
              {#if productForm.includePlatformFee}
                <div class="metric-card">
                  <span>Taxa estimada nesta venda</span>
                  <strong>{formatCurrency(productFeeValue)}</strong>
                </div>
              {/if}
            </div>

            <div class="helper-box compact-top">
              <strong>Leitura simples</strong>
              <p>
                A sobra estimada por unidade fica em
                <strong>{formatCurrency(productProfitPerUnit)}</strong> para
                cada <strong>{formatCurrency(productSuggestedPrice)}</strong> vendidos.
              </p>
            </div>
          {:else}
            <div class="empty-state">
              <strong>Faltam dados para fechar a conta</strong>
              <p>
                Preencha pelo menos o custo da unidade para exibir os
                resultados.
              </p>
            </div>
          {/if}
        {/if}

        {#if productStep === 5 && productResultReady}
          <section class="cta-card compact-top">
            <div>
              <p class="section-kicker">O que vem depois?</p>
              <h2 class="cta-title">
                Tire essas contas do papel e automatize seu caixa
              </h2>
              <p class="cta-copy">
                O sistema Zelo PDV calcula seu lucro real automaticamente a cada
                venda. Sem planilhas.
              </p>
            </div>

            <div class="cta-actions" style="margin-top: 0.5rem;">
              <a href="/cadastro" class="primary-link">Criar conta grátis</a>
              <button type="button" class="ghost-button" on:click={openSupportChat}>
                Falar com especialista
              </button>
              <p style="font-size: 0.85rem; color: var(--text-muted)">
                Teste grátis de 7 dias. Aceitamos PIX, e Cartão.
              </p>
            </div>
          </section>
        {/if}

        <div class="actions-row">
          <button
            class="ghost-button"
            type="button"
            on:click={previousProductStep}
            disabled={productStep === 1}
          >
            Voltar
          </button>

          {#if productStep < 5}
            <button
              class="primary-button"
              type="button"
              on:click={nextProductStep}
            >
              {productStep === 4 ? "Ver resultado" : "Continuar"}
            </button>
          {/if}
        </div>
      </section>
    </div>
  </section>

  <section class="py-24 border-t border-white/5 bg-[#0B0F19]">
    <div class="max-w-3xl mx-auto px-6">
      <div class="text-center mb-12">
        <h2 class="text-3xl font-bold text-white mb-4">Perguntas Frequentes</h2>
        <p class="text-slate-400">
          Tire suas dúvidas e entenda os detalhes dos cálculos.
        </p>
      </div>

      <div class="space-y-4">
        {#each faqItems as item}
          <details
            class="group rounded-xl border border-white/5 bg-white/[0.02] open:bg-white/[0.04] transition-all duration-300"
          >
            <summary
              class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none"
            >
              <span>{item.question}</span>
              <svg
                class="w-5 h-5 text-slate-500 transition-transform group-open:rotate-180 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                /></svg
              >
            </summary>
            <div class="px-6 pb-6 text-slate-400 leading-relaxed">
              {item.answer}
            </div>
          </details>
        {/each}
      </div>
    </div>
  </section>

  {#if productResultReady}
    <div class="sticky-bar">
      <div class="sticky-inner max-w-6xl mx-auto px-6">
        <div class="sticky-info">
          <span class="sticky-label">Preço sugerido</span>
          <strong class="sticky-price"
            >{formatCurrency(productSuggestedPrice)}</strong
          >
          {#if productForm.productName}<span class="sticky-name"
              >· {productForm.productName}</span
            >{/if}
        </div>
        {#if productStep < 5}
          <button
            type="button"
            class="primary-button"
            on:click={() => goToProductStep(5)}
          >
            Ver detalhes →
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <MarketingFooter />
</div>

<style>
  .page-shell {
    --bg-app: #0b0f19; /* Align with main landing page */
    --bg-panel: #111827;
    --bg-card: #0f172a;
    background: var(--bg-app);
    color: var(--text-label);
  }

  .hero-shell {
    padding-top: 7.5rem;
    padding-bottom: 3rem;
  }

  .hero-stack {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .page-content {
    display: grid;
    gap: 1.5rem;
  }

  .section-kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 999px;
    padding: 0.38rem 0.8rem;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    color: color-mix(in srgb, white 70%, var(--primary));
    border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  }

  .hero-title {
    color: var(--text-main);
    font-size: clamp(2rem, 4vw, 3.2rem);
    line-height: 1.08;
    letter-spacing: -0.05em;
    font-weight: 800;
    max-width: 20ch;
  }

  /* Mode toggle pills */
  .mode-toggle {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .mode-pill {
    display: inline-flex;
    align-items: center;
    height: 2.6rem;
    padding: 0 1.2rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, white 10%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
    color: var(--text-muted);
    font-weight: 600;
    font-size: 0.9rem;
    transition: all var(--transition-fast);
  }

  .mode-pill:hover {
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    color: var(--text-main);
  }

  .mode-pill-active {
    background: color-mix(in srgb, var(--primary) 14%, var(--bg-panel));
    border-color: color-mix(in srgb, var(--primary) 40%, transparent);
    color: var(--text-main);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent);
  }

  .section-note,
  .cta-copy,
  .subtle-copy {
    color: var(--text-muted);
    line-height: 1.75;
  }

  .section-card,
  .result-card,
  .cta-card,
  .faq-item {
    border-radius: 1.65rem;
    border: 1px solid color-mix(in srgb, white 8%, var(--border-subtle));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, white 4%, transparent),
      color-mix(in srgb, var(--bg-card) 96%, transparent)
    );
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 8%, transparent),
      0 18px 45px color-mix(in srgb, black 25%, transparent);
  }

  .section-spacing,
  .result-card,
  .cta-card {
    padding: 1.4rem;
  }

  .section-head,
  .block-head,
  .builder-head {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .section-title,
  .cta-title {
    color: var(--text-main);
  }

  .section-title {
    font-size: clamp(1.7rem, 3vw, 2.7rem);
    line-height: 1.06;
    letter-spacing: -0.04em;
  }

  .mode-grid,
  .preset-grid,
  .metric-grid,
  .cta-benefits,
  .faq-shell,
  .faq-list,
  .input-grid {
    display: grid;
    gap: 1rem;
  }

  .mode-card,
  .preset-card,
  .metric-card {
    text-align: left;
    border-radius: 1.2rem;
    border: 1px solid color-mix(in srgb, white 8%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
    padding: 1rem;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      background var(--transition-fast);
  }

  .mode-card:hover,
  .mode-card-active,
  .preset-card:hover,
  .preset-card-active {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--primary) 34%, transparent);
    background: color-mix(in srgb, var(--primary) 8%, var(--bg-panel));
    box-shadow: 0 10px 24px color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .mode-card strong,
  .preset-card strong,
  .metric-card strong {
    display: block;
    color: var(--text-main);
  }

  .mode-card p,
  .metric-card span,
  .builder-copy,
  .slider-copy,
  .faq-item div,
  .empty-state p,
  .helper-box p {
    color: var(--text-muted);
  }

  /* Niche chips */
  .niche-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .niche-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.4rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, white 9%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 85%, transparent);
    color: var(--text-label);
    font-size: 0.88rem;
    font-weight: 500;
    transition: all var(--transition-fast);
  }

  .niche-chip:hover {
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
    color: var(--text-main);
  }

  .chip-selected {
    border-color: color-mix(in srgb, var(--primary) 50%, transparent);
    background: color-mix(in srgb, var(--primary) 12%, var(--bg-panel));
    color: var(--text-main);
    font-weight: 600;
  }

  .field {
    display: block;
  }

  .field-label {
    display: block;
    margin-bottom: 0.55rem;
    color: var(--text-label);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .no-gap {
    margin-bottom: 0.2rem;
  }

  .input,
  .money-input,
  .secondary-button,
  .icon-button {
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, white 8%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 94%, transparent);
    color: var(--text-main);
  }

  .input,
  .money-input {
    width: 100%;
    min-height: 3.35rem;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .input {
    padding: 0.92rem 1rem;
  }

  .input:focus,
  .money-input:focus-within,
  .range-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--primary) 38%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
  }

  .money-input {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0 1rem;
  }

  .money-input span {
    color: var(--text-muted);
    font-weight: 700;
  }

  .money-field {
    flex: 1;
    min-width: 0;
    height: 3.1rem;
    border: none;
    background: transparent;
    color: var(--text-main);
  }

  .money-field:focus {
    outline: none;
  }

  .builder-shell,
  .details-card,
  .slider-card,
  .helper-box,
  .empty-state {
    border-radius: 1.2rem;
    border: 1px solid color-mix(in srgb, white 8%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 92%, transparent);
    padding: 1rem;
  }

  .compact-top {
    margin-top: 1rem;
  }

  .builder-head {
    gap: 0.85rem;
  }

  .secondary-button,
  .icon-button {
    padding: 0.75rem 1rem;
    font-weight: 600;
  }

  .secondary-button:hover,
  .icon-button:hover {
    border-color: color-mix(in srgb, var(--primary) 34%, transparent);
  }

  .ingredient-list {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .ingredient-row {
    border-radius: 1rem;
    border: 1px solid color-mix(in srgb, white 8%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-card) 94%, transparent);
    padding: 1rem;
  }

  .ingredient-row-top,
  .ingredient-row-actions,
  .toggle-line,
  .metric-row,
  .actions-row,
  .benefit-row {
    display: flex;
    align-items: center;
  }

  .ingredient-row-top,
  .metric-row,
  .actions-row {
    justify-content: space-between;
    gap: 1rem;
  }

  .ingredient-row-top strong,
  .row-cost,
  .price-spotlight strong,
  .metric-row strong,
  .helper-box strong,
  .empty-state strong {
    color: var(--text-main);
  }

  .ingredient-row-top span {
    display: block;
    margin-top: 0.2rem;
    color: var(--text-muted);
    font-size: 0.92rem;
  }

  .ingredient-row-actions {
    gap: 0.75rem;
  }

  .row-cost {
    font-weight: 700;
  }

  .ingredient-grid {
    display: grid;
    gap: 0.9rem;
    margin-top: 1rem;
  }

  .builder-summary,
  .metric-stack {
    display: grid;
    gap: 0.85rem;
  }

  .builder-summary {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px dashed color-mix(in srgb, white 10%, var(--border-subtle));
  }

  .builder-summary span,
  .metric-row span {
    color: var(--text-muted);
  }

  .warning-copy {
    margin-top: 0.75rem;
    color: color-mix(in srgb, var(--warning) 88%, white);
    font-size: 0.88rem;
  }

  .details-card summary {
    cursor: pointer;
    list-style: none;
    color: var(--text-main);
    font-weight: 700;
  }

  .details-card summary::-webkit-details-marker {
    display: none;
  }

  .details-body {
    margin-top: 1rem;
  }

  .toggle-line {
    gap: 0.7rem;
    color: var(--text-main);
    font-weight: 600;
  }

  .toggle-line input {
    margin: 0;
  }

  .preset-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }

  .preset-card span {
    display: block;
    margin-top: 0.35rem;
    color: var(--text-muted);
  }

  .slider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.9rem;
  }

  .slider-head strong {
    color: var(--text-main);
    font-size: 1.45rem;
  }

  .range-input {
    width: 100%;
    accent-color: var(--primary);
  }

  .markup-heading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.85rem;
  }

  .slider-equivalence {
    margin-top: 0.7rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .metric-label-row {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .info-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--text-main);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    cursor: help;
    flex-shrink: 0;
  }

  .info-pop {
    position: absolute;
    bottom: calc(100% + 0.55rem);
    left: 50%;
    transform: translateX(-50%);
    width: min(20rem, 78vw);
    padding: 0.85rem 0.95rem;
    border-radius: 0.85rem;
    border: 1px solid color-mix(in srgb, white 12%, var(--border-subtle));
    background: var(--bg-panel);
    color: var(--text-label);
    font-size: 0.82rem;
    font-weight: 400;
    line-height: 1.55;
    text-align: left;
    box-shadow: 0 16px 40px color-mix(in srgb, black 45%, transparent);
    opacity: 0;
    visibility: hidden;
    transition:
      opacity var(--transition-fast),
      visibility var(--transition-fast);
    z-index: 60;
  }

  .info-pop strong {
    color: var(--text-main);
  }

  .info-pop em {
    font-style: normal;
    color: var(--primary);
    font-weight: 600;
  }

  .info-tip:hover .info-pop,
  .info-tip:focus .info-pop,
  .info-tip:focus-within .info-pop {
    opacity: 1;
    visibility: visible;
  }

  .primary-button,
  .ghost-button,
  .primary-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 3rem;
    border-radius: 999px;
    padding: 0.82rem 1.4rem;
    font-weight: 700;
    transition:
      transform var(--transition-fast),
      background var(--transition-fast),
      opacity var(--transition-fast);
  }

  .primary-button,
  .primary-link {
    background: var(--primary);
    color: var(--primary-text);
    box-shadow: 0 12px 28px color-mix(in srgb, var(--primary) 24%, transparent);
  }

  .primary-button:hover,
  .primary-link:hover {
    transform: translateY(-1px);
    background: var(--primary-hover);
  }

  .ghost-button {
    border: 1px solid color-mix(in srgb, white 10%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 90%, transparent);
    color: var(--text-main);
  }

  .ghost-button:disabled,
  .icon-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .cta-title {
    margin-top: 0.75rem;
  }

  /* Sticky result bar */
  .sticky-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: color-mix(in srgb, var(--bg-card) 92%, transparent);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid color-mix(in srgb, white 10%, var(--border-subtle));
    padding: 0.85rem 0;
    animation: slideUp 0.25s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .sticky-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .sticky-info {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .sticky-label {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .sticky-price {
    color: var(--primary);
    font-size: 1.55rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    text-shadow: 0 0 16px color-mix(in srgb, var(--primary) 40%, transparent);
  }

  .sticky-name {
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .price-spotlight {
    border-radius: 1.25rem;
    padding: 1rem;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  }

  .price-spotlight span,
  .price-spotlight p {
    color: var(--text-label);
  }

  .price-spotlight strong {
    display: block;
    font-size: clamp(2rem, 4vw, 3rem);
    letter-spacing: -0.05em;
    margin-top: 0.2rem;
  }

  .price-spotlight-strong {
    background: color-mix(in srgb, var(--primary) 14%, transparent);
  }

  .result-highlight-grid {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .metric-grid {
    margin-top: 1rem;
    display: grid;
    gap: 1rem;
  }

  .metric-card {
    min-height: 7rem;
  }

  .metric-card span {
    display: block;
    margin-bottom: 0.5rem;
  }

  .metric-card strong {
    font-size: 1.4rem;
    line-height: 1.1;
  }

  .progress-shell {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    position: relative;
    margin-bottom: 2rem;
  }

  .progress-shell::before {
    content: "";
    position: absolute;
    top: 1rem;
    left: 1.5rem;
    right: 1.5rem;
    height: 2px;
    background: color-mix(in srgb, white 10%, var(--border-subtle));
    z-index: 0;
  }

  .progress-step {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    color: var(--text-muted);
    background: transparent;
    padding: 0 0.5rem;
  }

  .progress-circle {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 2px solid
      color-mix(in srgb, var(--bg-panel) 96%, var(--border-subtle));
    background: var(--bg-card);
    color: var(--text-label);
    font-size: 0.88rem;
    font-weight: 700;
    transition: all var(--transition-fast);
  }

  .progress-step small {
    font-size: 0.8rem;
    font-weight: 500;
    color: inherit;
    white-space: nowrap;
  }

  .progress-step-complete .progress-circle {
    border-color: color-mix(in srgb, var(--primary) 60%, transparent);
    background: color-mix(in srgb, var(--primary) 12%, var(--bg-card));
    color: var(--primary);
  }

  .progress-step-current .progress-circle {
    border-color: var(--primary);
    background: var(--primary);
    color: var(--primary-text);
    box-shadow: 0 0 16px color-mix(in srgb, var(--primary) 50%, transparent);
  }

  .progress-step-current,
  .progress-step-complete {
    color: var(--text-main);
  }

  .progress-step-current small {
    font-weight: 600;
    color: var(--primary);
  }

  /* Hero Input specific styling */
  .hero-input-area {
    border-radius: 1.25rem;
    border: 2px dashed color-mix(in srgb, white 10%, var(--border-subtle));
    background: color-mix(in srgb, var(--bg-panel) 60%, transparent);
    padding: 2.5rem 1rem;
    text-align: center;
    transition: all var(--transition-fast);
  }

  .hero-input-area:focus-within {
    border-color: color-mix(in srgb, var(--primary) 40%, transparent);
    background: color-mix(in srgb, var(--bg-panel) 80%, transparent);
  }

  .hero-field-label {
    display: block;
    color: var(--text-main);
    font-size: 1.1rem;
    font-weight: 700;
  }

  .hero-field-subtitle {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin-top: 0.3rem;
  }

  .hero-money-input {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 1.5rem;
  }

  .hero-money-input span {
    font-size: 2.2rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .hero-money-field {
    font-size: 3rem;
    font-weight: 800;
    color: var(--text-main);
    width: 5ch;
    text-align: left;
    background: transparent;
    border: none;
    outline: none;
    transition: all var(--transition-fast);
  }

  .hero-money-field:focus {
    color: var(--primary);
  }

  .cta-card {
    display: grid;
    gap: 1.4rem;
  }

  .cta-title {
    font-size: clamp(2rem, 3vw, 2.8rem);
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .benefit-row {
    gap: 0.75rem;
    color: var(--text-label);
  }

  .benefit-row span:first-child {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--success) 18%, transparent);
    color: var(--text-main);
    font-size: 0.72rem;
    font-weight: 700;
  }

  .cta-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.7rem;
  }

  .faq-item {
    overflow: hidden;
  }

  .faq-item summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.2rem;
    color: var(--text-main);
    font-weight: 700;
  }

  .faq-item summary::-webkit-details-marker {
    display: none;
  }

  .faq-item div {
    padding: 0 1.2rem 1.2rem;
    line-height: 1.75;
  }

  @media (min-width: 768px) {
    .tool-choice-grid,
    .mode-grid,
    .input-grid,
    .preset-grid,
    .metric-grid,
    .cta-benefits {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .result-highlight-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ingredient-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1024px) {
    .ingredient-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .hero-shell {
      padding-top: 8rem;
    }

    .section-spacing,
    .result-card,
    .cta-card {
      padding: 1.15rem;
    }

    .ingredient-row-top,
    .ingredient-row-actions,
    .actions-row,
    .metric-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
