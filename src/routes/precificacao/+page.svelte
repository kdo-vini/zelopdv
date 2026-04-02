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
  <meta property="og:title" content="Calculadora de Precificação Grátis | Zelo PDV" />
  <meta
    property="og:description"
    content="Descubra quanto cobrar em um produto específico ou monte a precificação completa do seu negócio."
  />
  <meta property="og:image" content="https://zelopdv.com.br/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://zelopdv.com.br/precificacao" />
  <meta name="twitter:title" content="Calculadora de Precificação Grátis | Zelo PDV" />
  <meta
    name="twitter:description"
    content="Calcule o preço de venda ideal para hot-dog, marmita, ovo de Páscoa e outros produtos sem precisar criar conta."
  />
  <meta name="twitter:image" content="https://zelopdv.com.br/og-image.png" />
</svelte:head>

<script>
  import MarketingHeader from '$lib/components/marketing/MarketingHeader.svelte';
  import MarketingFooter from '$lib/components/marketing/MarketingFooter.svelte';

  const niches = [
    {
      id: 'marmitaria',
      label: 'Marmitaria',
      badge: 'MT',
      defaultMargin: 28,
      commonRange: '22% a 35%',
      placeholder: 'Marmita de frango grelhado',
      defaultPlatformFee: true,
      description: 'Boa para quem vende unidade avulsa e também por app.'
    },
    {
      id: 'lanchonete',
      label: 'Lanchonete / Hot-dog',
      badge: 'HD',
      defaultMargin: 30,
      commonRange: '25% a 40%',
      placeholder: 'Hot-dog especial',
      defaultPlatformFee: false,
      description: 'Ideal para lanche unitário, combo simples e venda no balcão.'
    },
    {
      id: 'hamburgueria',
      label: 'Hamburgueria',
      badge: 'HB',
      defaultMargin: 32,
      commonRange: '28% a 45%',
      placeholder: 'Burger artesanal',
      defaultPlatformFee: true,
      description: 'Funciona bem para combo, smash e delivery por app.'
    },
    {
      id: 'pizzaria',
      label: 'Pizzaria',
      badge: 'PZ',
      defaultMargin: 30,
      commonRange: '25% a 38%',
      placeholder: 'Pizza média de calabresa',
      defaultPlatformFee: true,
      description: 'Use quando embalagem, entrega e taxa influenciam bastante.'
    },
    {
      id: 'doceria',
      label: 'Açaí / Doceria / Páscoa',
      badge: 'DC',
      defaultMargin: 35,
      commonRange: '30% a 50%',
      placeholder: 'Ovo de Páscoa de 350g',
      defaultPlatformFee: false,
      description: 'Serve para doce unitário, kit sazonal e produção por encomenda.'
    },
    {
      id: 'delivery',
      label: 'Delivery puro',
      badge: 'DL',
      defaultMargin: 28,
      commonRange: '22% a 35%',
      placeholder: 'Combo delivery',
      defaultPlatformFee: true,
      description: 'Escolha este se a maior parte das vendas passa por app.'
    },
    {
      id: 'mercadinho',
      label: 'Mercadinho / Mercearia',
      badge: 'MG',
      defaultMargin: 20,
      commonRange: '15% a 28%',
      placeholder: 'Cesta promocional',
      defaultPlatformFee: false,
      description: 'Melhor para itens simples com giro recorrente.'
    },
    {
      id: 'outro',
      label: 'Outro',
      badge: 'OT',
      defaultMargin: 30,
      commonRange: '20% a 40%',
      placeholder: 'Seu produto principal',
      defaultPlatformFee: false,
      description: 'Use quando seu caso não encaixa nos exemplos acima.'
    }
  ];

  const unitOptions = [
    { value: 'g', label: 'g', family: 'weight', factor: 1 },
    { value: 'kg', label: 'kg', family: 'weight', factor: 1000 },
    { value: 'ml', label: 'ml', family: 'volume', factor: 1 },
    { value: 'l', label: 'L', family: 'volume', factor: 1000 },
    { value: 'un', label: 'un', family: 'count', factor: 1 }
  ];

  const faqItems = [
    {
      question: 'Preciso saber quantas vou vender no mês?',
      answer:
        'Não. Se você quer descobrir quanto cobrar em uma unidade, use o modo Preço de 1 produto. A estimativa de vendas por mês só entra no modo de negócio completo.'
    },
    {
      question: 'Posso lancar ingrediente por ingrediente?',
      answer:
        'Sim. Você pode informar quantidade comprada, unidade, preço pago e quantidade usada na receita. A calculadora faz a proporção automaticamente.'
    },
    {
      question: 'Posso usar para ovo de Páscoa, hot-dog ou bolo no pote?',
      answer:
        'Sim. O modo rápido foi desenhado exatamente para produto unitário e sazonal. Serve para hot-dog, marmita, ovo de Páscoa, doce, pizza e vários outros casos.'
    },
    {
      question: 'A taxa da plataforma entra no calculo?',
      answer:
        'Sim. Se você vende por app, marketplace ou outro canal com percentual de desconto, basta ativar a taxa e informar o número.'
    },
    {
      question: 'Qual margem de lucro devo usar?',
      answer:
        'Não existe um número único. O ideal é partir de um preset equilibrado e ajustar se o preço final ficar alto ou baixo demais para o seu público.'
    }
  ];

  const stepLabels = ['Seu nicho', 'Produto', 'Custos fixos', 'Margem', 'Resultado'];
  const productStepLabels = ['O que', 'Custos', 'Extras', 'Margem', 'Resultado'];

  const nicheMap = niches.reduce((acc, niche) => {
    acc[niche.id] = niche;
    return acc;
  }, {});

  const unitMap = unitOptions.reduce((acc, unit) => {
    acc[unit.value] = unit;
    return acc;
  }, {});

  const currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  let selectedCalculator = 'product';
  let businessStep = 1;
  let productStep = 1;
  let ingredientId = 2;

  let productForm = createProductForm('marmitaria');
  let ingredientRows = [createIngredientRow()];
  let fullForm = createFullForm('delivery');

  function createProductForm(nicheId) {
    const niche = nicheMap[nicheId] || niches[0];
    return {
      niche: niche.id,
      productName: '',
      costMode: 'simple',
      totalCost: 0,
      packagingCost: 0,
      extraUnitCost: 0,
      includePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? 12 : 0,
      marginPreset: 'balanced',
      useCustomMargin: false,
      customMargin: niche.defaultMargin
    };
  }

  function createIngredientRow() {
    return {
      id: ingredientId++,
      name: '',
      purchaseQuantity: 0,
      purchaseUnit: 'kg',
      purchasePrice: 0,
      usageQuantity: 0,
      usageUnit: 'g'
    };
  }

  function createFullForm(nicheId) {
    const niche = nicheMap[nicheId] || niches[0];
    return {
      niche: niche.id,
      productName: '',
      ingredientsCost: 0,
      packagingCost: 0,
      extraUnitCost: 0,
      usePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? 12 : 0,
      rent: 0,
      staff: 0,
      utilities: 0,
      internet: 0,
      otherFixed: 0,
      salesPerMonth: 300,
      margin: niche.defaultMargin
    };
  }

  function clampNumber(value, min = 0, max = 9999999) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function parseCurrencyInput(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits ? Number(digits) / 100 : 0;
  }

  function formatCurrencyInput(value) {
    if (!value) return '';
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatCurrency(value) {
    return currencyFormatter.format(Number.isFinite(value) ? value : 0);
  }

  function formatWholeNumber(value) {
    return new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 0
    }).format(Number.isFinite(value) ? value : 0);
  }

  function getPresetMargins(nicheId) {
    const niche = nicheMap[nicheId] || niches[0];
    return {
      competitive: Math.max(15, niche.defaultMargin - 5),
      balanced: niche.defaultMargin,
      premium: Math.min(80, niche.defaultMargin + 7)
    };
  }

  function updateProductField(field, value) {
    productForm = { ...productForm, [field]: value };
  }

  function updateFullField(field, value) {
    fullForm = { ...fullForm, [field]: value };
  }

  function selectCalculator(mode) {
    selectedCalculator = mode;
  }

  function selectProductNiche(nicheId) {
    const niche = nicheMap[nicheId];
    if (!niche) return;
    productForm = {
      ...productForm,
      niche: niche.id,
      includePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? (productForm.platformFee || 12) : 0,
      customMargin: niche.defaultMargin
    };
  }

  function selectFullNiche(nicheId) {
    const niche = nicheMap[nicheId];
    if (!niche) return;
    fullForm = {
      ...fullForm,
      niche: niche.id,
      margin: niche.defaultMargin,
      usePlatformFee: niche.defaultPlatformFee,
      platformFee: niche.defaultPlatformFee ? (fullForm.platformFee || 12) : 0
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
      row.id === id ? { ...row, [field]: value } : row
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
    const purchaseQuantity = Number(row.purchaseQuantity || 0) * purchaseUnit.factor;
    const usageQuantity = Number(row.usageQuantity || 0) * usageUnit.factor;
    const purchasePrice = Number(row.purchasePrice || 0);

    if (purchaseQuantity <= 0 || usageQuantity <= 0 || purchasePrice <= 0) return 0;
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

  function goToBusinessStep(step) {
    if (step < 1 || step > 5) return;
    businessStep = step;
  }

  function nextBusinessStep() {
    if (businessStep < 5) businessStep += 1;
  }

  function previousBusinessStep() {
    if (businessStep > 1) businessStep -= 1;
  }

  $: productNiche = nicheMap[productForm.niche] || niches[0];
  $: productPresetMargins = getPresetMargins(productForm.niche);
  $: productMargin =
    productForm.useCustomMargin
      ? productForm.customMargin
      : productPresetMargins[productForm.marginPreset];
  $: ingredientCostTotal = ingredientRows.reduce(
    (total, row) => total + getIngredientRowCost(row),
    0
  );
  $: ingredientRowCountWithData = ingredientRows.filter(
    (row) => row.name || row.purchaseQuantity || row.purchasePrice || row.usageQuantity
  ).length;
  $: productBaseCost =
    productForm.costMode === 'simple' ? productForm.totalCost : ingredientCostTotal;
  $: productDirectCost =
    productBaseCost + productForm.packagingCost + productForm.extraUnitCost;
  $: productFeeRate = productForm.includePlatformFee ? productForm.platformFee / 100 : 0;
  $: productMarginRate = productMargin / 100;
  $: productMinimumDenominator = 1 - productFeeRate;
  $: productSuggestedDenominator = 1 - productFeeRate - productMarginRate;
  $: productMinimumPrice =
    productDirectCost > 0 && productMinimumDenominator > 0
      ? productDirectCost / productMinimumDenominator
      : 0;
  $: productSuggestedPrice =
    productDirectCost > 0 && productSuggestedDenominator > 0
      ? productDirectCost / productSuggestedDenominator
      : 0;
  $: productFeeValue = productSuggestedPrice * productFeeRate;
  $: productProfitPerUnit =
    productSuggestedPrice > 0
      ? productSuggestedPrice - productDirectCost - productFeeValue
      : 0;
  $: productResultReady = productDirectCost > 0 && productSuggestedDenominator > 0;
  $: productLabel = productForm.productName || productNiche.placeholder;

  $: fullNiche = nicheMap[fullForm.niche] || niches[0];
  $: fullProductLabel = fullForm.productName || fullNiche.placeholder;
  $: fullDirectCost =
    fullForm.ingredientsCost + fullForm.packagingCost + fullForm.extraUnitCost;
  $: fullTotalFixedCosts =
    fullForm.rent +
    fullForm.staff +
    fullForm.utilities +
    fullForm.internet +
    fullForm.otherFixed;
  $: fullFixedCostPerUnit =
    fullForm.salesPerMonth > 0 ? fullTotalFixedCosts / fullForm.salesPerMonth : 0;
  $: fullTotalUnitCost = fullDirectCost + fullFixedCostPerUnit;
  $: fullFeeRate = fullForm.usePlatformFee ? fullForm.platformFee / 100 : 0;
  $: fullMarginRate = fullForm.margin / 100;
  $: fullMinimumDenominator = 1 - fullFeeRate;
  $: fullSuggestedDenominator = 1 - fullFeeRate - fullMarginRate;
  $: fullMinimumPrice =
    fullTotalUnitCost > 0 && fullMinimumDenominator > 0
      ? fullTotalUnitCost / fullMinimumDenominator
      : 0;
  $: fullSuggestedPrice =
    fullTotalUnitCost > 0 && fullSuggestedDenominator > 0
      ? fullTotalUnitCost / fullSuggestedDenominator
      : 0;
  $: fullPlatformValue = fullSuggestedPrice * fullFeeRate;
  $: fullProfitPerUnit =
    fullSuggestedPrice > 0
      ? fullSuggestedPrice - fullTotalUnitCost - fullPlatformValue
      : 0;
  $: fullMonthlyRevenue = fullSuggestedPrice * fullForm.salesPerMonth;
  $: fullMonthlyProfit = fullProfitPerUnit * fullForm.salesPerMonth;
  $: fullContributionPerSale =
    fullSuggestedPrice - fullDirectCost - fullPlatformValue;
  $: fullBreakEvenUnits =
    fullContributionPerSale > 0 ? fullTotalFixedCosts / fullContributionPerSale : 0;
  $: fullHasResult =
    fullDirectCost > 0 &&
    fullForm.salesPerMonth > 0 &&
    fullSuggestedDenominator > 0;

  $: webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Calculadora de Precificação Zelo PDV',
    url: 'https://zelopdv.com.br/precificacao',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web Browser',
    description:
      'Ferramenta grátis para calcular preço de venda de produtos e precificação completa de pequenos negócios.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'BRL'
    },
    featureList: [
      'Cálculo rápido para produto específico',
      'Lançamento ingrediente por ingrediente',
      'Precificação completa com custos fixos',
      'Preço mínimo e preço recomendado'
    ]
  };

  $: faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
</script>

{@html `<script type="application/ld+json">${JSON.stringify(webAppSchema)}</script>`}
{@html `<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>`}

<div class="min-h-screen page-shell">
  <MarketingHeader />

  <section class="hero-shell">
    <div class="max-w-6xl mx-auto px-6 hero-stack">
      <h1 class="hero-title">Descubra quanto cobrar</h1>
      <div class="mode-toggle">
        <button
          type="button"
          class="mode-pill"
          class:mode-pill-active={selectedCalculator === 'product'}
          on:click={() => selectCalculator('product')}
        >
          Preço de 1 produto
        </button>
        <button
          type="button"
          class="mode-pill"
          class:mode-pill-active={selectedCalculator === 'business'}
          on:click={() => selectCalculator('business')}
        >
          Negócio completo
        </button>
      </div>
    </div>
  </section>

  <section class="pb-24">
    <div class="max-w-6xl mx-auto px-6 page-content">

      {#if selectedCalculator === 'product'}
        <section class="section-card section-spacing">
          <div class="section-head">
            <div>
              <p class="section-kicker">Cálculo individual</p>
              <h2 class="section-title">Preço de 1 produto</h2>
            </div>
            <p class="section-note">Ideal para descobrir quanto faturar com um item avulso ou lançamento rápido.</p>
          </div>

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
                  on:input={(event) => updateProductField('productName', event.currentTarget.value)}
                />
              </label>
            </div>

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
          {/if}

          {#if productStep === 2}
            <div class="mode-grid">
              <button
                type="button"
                class="mode-card"
                class:mode-card-active={productForm.costMode === 'simple'}
                on:click={() => setProductCostMode('simple')}
              >
                <strong>Tenho o custo total da unidade</strong>
                <p>Melhor para quem já sabe o custo final da receita ou quer um cálculo rápido.</p>
              </button>

              <button
                type="button"
                class="mode-card"
                class:mode-card-active={productForm.costMode === 'ingredients'}
                on:click={() => setProductCostMode('ingredients')}
              >
                <strong>Quero lançar ingrediente por ingrediente</strong>
                <p>Melhor para quando você quer calcular proporção por peso, volume ou unidades.</p>
              </button>
            </div>

            {#if productForm.costMode === 'simple'}
              <div class="hero-input-area compact-top">
                <label class="hero-field">
                  <span class="hero-field-label">Custo total da receita / unidade</span>
                  <p class="hero-field-subtitle">Insira o valor final de produção da sua unidade.</p>
                  <div class="hero-money-input">
                    <span>R$</span>
                    <input
                      class="hero-money-field"
                      type="text"
                      inputmode="numeric"
                      placeholder="0,00"
                      value={formatCurrencyInput(productForm.totalCost)}
                      on:input={(event) => updateProductField('totalCost', parseCurrencyInput(event.currentTarget.value))}
                    />
                  </div>
                </label>
              </div>
              {:else}
                <div class="builder-shell">
                  <div class="builder-head">
                    <div>
                      <p class="field-label no-gap">Ingredientes da receita</p>
                      <p class="builder-copy">Preencha quanto você comprou, quanto pagou e quanto entra na receita.</p>
                    </div>
                    <button type="button" class="secondary-button" on:click={addIngredientRow}>
                      + Adicionar ingrediente
                    </button>
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
                            <span class="row-cost">{formatCurrency(getIngredientRowCost(row))}</span>
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
                              on:input={(event) => updateIngredientRow(row.id, 'name', event.currentTarget.value)}
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
                              on:input={(event) => updateIngredientRow(row.id, 'purchaseQuantity', clampNumber(event.currentTarget.value, 0))}
                            />
                          </label>

                          <label class="field">
                            <span class="field-label">Unidade comprada</span>
                            <select
                              class="input"
                              value={row.purchaseUnit}
                              on:change={(event) => updateIngredientRow(row.id, 'purchaseUnit', event.currentTarget.value)}
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
                                on:input={(event) => updateIngredientRow(row.id, 'purchasePrice', parseCurrencyInput(event.currentTarget.value))}
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
                              on:input={(event) => updateIngredientRow(row.id, 'usageQuantity', clampNumber(event.currentTarget.value, 0))}
                            />
                          </label>

                          <label class="field">
                            <span class="field-label">Unidade usada</span>
                            <select
                              class="input"
                              value={row.usageUnit}
                              on:change={(event) => updateIngredientRow(row.id, 'usageUnit', event.currentTarget.value)}
                            >
                              {#each unitOptions as unit}
                                <option value={unit.value}>{unit.label}</option>
                              {/each}
                            </select>
                          </label>
                        </div>

                        {#if !isIngredientCompatible(row) && row.purchaseQuantity && row.usageQuantity}
                          <p class="warning-copy">As unidades comprada e usada precisam ser da mesma família.</p>
                        {/if}
                      </div>
                    {/each}
                  </div>

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
                    on:input={(event) => updateProductField('packagingCost', parseCurrencyInput(event.currentTarget.value))}
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
                    on:input={(event) => updateProductField('extraUnitCost', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>
            </div>
          {/if}

          {#if productStep === 4}
            <div class="preset-grid">
              <button
                type="button"
                class="preset-card"
                class:preset-card-active={!productForm.useCustomMargin && productForm.marginPreset === 'competitive'}
                on:click={() => updateProductField('marginPreset', 'competitive')}
              >
                <strong>Mais competitivo</strong>
                <span>{productPresetMargins.competitive}%</span>
              </button>
              <button
                type="button"
                class="preset-card"
                class:preset-card-active={!productForm.useCustomMargin && productForm.marginPreset === 'balanced'}
                on:click={() => updateProductField('marginPreset', 'balanced')}
              >
                <strong>Equilibrado</strong>
                <span>{productPresetMargins.balanced}%</span>
              </button>
              <button
                type="button"
                class="preset-card"
                class:preset-card-active={!productForm.useCustomMargin && productForm.marginPreset === 'premium'}
                on:click={() => updateProductField('marginPreset', 'premium')}
              >
                <strong>Mais lucrativo</strong>
                <span>{productPresetMargins.premium}%</span>
              </button>
            </div>

            <details class="details-card compact-top">
                <summary>Ajuste fino de margem e taxas</summary>
                <div class="details-body">
                  <label class="toggle-line">
                    <input
                      type="checkbox"
                      checked={productForm.useCustomMargin}
                      on:change={(event) => updateProductField('useCustomMargin', event.currentTarget.checked)}
                    />
                    <span>Usar margem customizada</span>
                  </label>

                  {#if productForm.useCustomMargin}
                    <div class="slider-card compact-top">
                      <div class="slider-head">
                        <div>
                          <p class="field-label">Margem desejada</p>
                          <p class="slider-copy">Para {productNiche.label.toLowerCase()}, margens entre {productNiche.commonRange} sao comuns.</p>
                        </div>
                        <strong>{productForm.customMargin}%</strong>
                      </div>
                      <input
                        class="range-input"
                        type="range"
                        min="15"
                        max="80"
                        step="1"
                        value={productForm.customMargin}
                        on:input={(event) => updateProductField('customMargin', clampNumber(event.currentTarget.value, 15, 80))}
                      />
                    </div>
                  {/if}

                  <label class="toggle-line compact-top">
                    <input
                      type="checkbox"
                      checked={productForm.includePlatformFee}
                      on:change={(event) => updateProductField('includePlatformFee', event.currentTarget.checked)}
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
                        max="80"
                        step="0.1"
                        value={productForm.platformFee}
                        on:input={(event) => updateProductField('platformFee', clampNumber(event.currentTarget.value, 0, 80))}
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
                  <p>Abaixo disso sua margem tende a ficar apertada.</p>
                </div>

                <div class="price-spotlight price-spotlight-strong">
                  <span>Preço recomendado</span>
                  <strong>{formatCurrency(productSuggestedPrice)}</strong>
                  <p>Com a margem escolhida e custos informados.</p>
                </div>
              </div>

              <div class="metric-grid compact-top">
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
                  <strong>{formatCurrency(productProfitPerUnit)}</strong> para cada <strong>{formatCurrency(productSuggestedPrice)}</strong> vendidos.
                </p>
              </div>
            {:else}
              <div class="empty-state">
                <strong>Faltam dados para fechar a conta</strong>
                <p>Preencha pelo menos o custo da unidade para exibir os resultados.</p>
              </div>
            {/if}
          {/if}

          <div class="actions-row">
            <button class="ghost-button" type="button" on:click={previousProductStep} disabled={productStep === 1}>
              Voltar
            </button>

            {#if productStep < 5}
              <button class="primary-button" type="button" on:click={nextProductStep}>
                {productStep === 4 ? 'Ver resultado' : 'Continuar'}
              </button>
            {/if}
          </div>
        </section>
      {:else}
        <section class="section-card section-spacing">
          <div class="section-head">
            <div>
              <p class="section-kicker">Análise completa</p>
              <h2 class="section-title">Precificação completa do negócio</h2>
            </div>
            <p class="section-note">Ideal para quem quer enxergar custos fixos, lucro mensal e ponto de equilíbrio com clareza.</p>
          </div>

          <div class="progress-shell">
            {#each stepLabels as label, index}
              <button
                type="button"
                class="progress-step"
                class:progress-step-complete={index + 1 < businessStep}
                class:progress-step-current={index + 1 === businessStep}
                on:click={() => goToBusinessStep(index + 1)}
              >
                <span class="progress-circle">{index + 1}</span>
                <small>{label}</small>
              </button>
            {/each}
          </div>

          {#if businessStep === 1}
            <div class="niche-chips">
              {#each niches as niche}
                  <button
                  type="button"
                  class="niche-chip"
                  class:chip-selected={fullForm.niche === niche.id}
                  on:click={() => selectFullNiche(niche.id)}
                >
                  <span>{niche.label}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if businessStep === 2}
            <div class="input-grid">
              <label class="field">
                <span class="field-label">Nome do produto</span>
                <input
                  class="input"
                  type="text"
                  placeholder={fullNiche.placeholder}
                  value={fullForm.productName}
                  on:input={(event) => updateFullField('productName', event.currentTarget.value)}
                />
              </label>

              <label class="field">
                <span class="field-label">Custo dos ingredientes / matéria-prima</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.ingredientsCost)}
                    on:input={(event) => updateFullField('ingredientsCost', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Embalagem</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.packagingCost)}
                    on:input={(event) => updateFullField('packagingCost', parseCurrencyInput(event.currentTarget.value))}
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
                    value={formatCurrencyInput(fullForm.extraUnitCost)}
                    on:input={(event) => updateFullField('extraUnitCost', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>
            </div>

            <label class="toggle-line compact-top">
              <input
                type="checkbox"
                checked={fullForm.usePlatformFee}
                on:change={(event) => updateFullField('usePlatformFee', event.currentTarget.checked)}
              />
              <span>Aplicar taxa de plataforma / app</span>
            </label>

            {#if fullForm.usePlatformFee}
              <label class="field field-compact compact-top">
                <span class="field-label">Taxa da plataforma (%)</span>
                <input
                  class="input"
                  type="number"
                  min="0"
                  max="80"
                  step="0.1"
                  value={fullForm.platformFee}
                  on:input={(event) => updateFullField('platformFee', clampNumber(event.currentTarget.value, 0, 80))}
                />
              </label>
            {/if}
          {/if}

          {#if businessStep === 3}
            <div class="input-grid">
              <label class="field">
                <span class="field-label">Aluguel</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.rent)}
                    on:input={(event) => updateFullField('rent', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Funcionarios</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.staff)}
                    on:input={(event) => updateFullField('staff', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Energia / água / gás</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.utilities)}
                    on:input={(event) => updateFullField('utilities', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Internet / telefone</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.internet)}
                    on:input={(event) => updateFullField('internet', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Outros custos fixos</span>
                <div class="money-input">
                  <span>R$</span>
                  <input
                    class="money-field"
                    type="text"
                    inputmode="numeric"
                    placeholder="0,00"
                    value={formatCurrencyInput(fullForm.otherFixed)}
                    on:input={(event) => updateFullField('otherFixed', parseCurrencyInput(event.currentTarget.value))}
                  />
                </div>
              </label>

              <label class="field">
                <span class="field-label">Estimativa de vendas por mês</span>
                <input
                  class="input"
                  type="number"
                  min="1"
                  step="1"
                  value={fullForm.salesPerMonth}
                  on:input={(event) => updateFullField('salesPerMonth', clampNumber(event.currentTarget.value, 0, 999999))}
                />
              </label>
            </div>
          {/if}

          {#if businessStep === 4}
            <div class="slider-card">
              <div class="slider-head">
                <div>
                  <p class="field-label">Margem de lucro desejada</p>
                  <p class="slider-copy">Para {fullNiche.label.toLowerCase()}, margens entre {fullNiche.commonRange} sao comuns.</p>
                </div>
                <strong>{fullForm.margin}%</strong>
              </div>
              <input
                class="range-input"
                type="range"
                min="15"
                max="80"
                step="1"
                value={fullForm.margin}
                on:input={(event) => updateFullField('margin', clampNumber(event.currentTarget.value, 15, 80))}
              />
            </div>
          {/if}

          {#if businessStep === 5}
            <div class="result-highlight-grid">
              <div class="price-spotlight">
                <span>Preço mínimo</span>
                <strong>{formatCurrency(fullMinimumPrice)}</strong>
                <p>Valor mínimo para cobrir a estrutura informada.</p>
              </div>

              <div class="price-spotlight price-spotlight-strong">
                <span>Preço recomendado</span>
                <strong>{formatCurrency(fullSuggestedPrice)}</strong>
                <p>Já considerando custos fixos, taxa e margem desejada.</p>
              </div>
            </div>

            {#if fullHasResult}
              <div class="metric-grid compact-top">
                <div class="metric-card">
                  <span>Lucro por unidade</span>
                  <strong>{formatCurrency(fullProfitPerUnit)}</strong>
                </div>
                <div class="metric-card">
                  <span>Lucro mensal estimado</span>
                  <strong>{formatCurrency(fullMonthlyProfit)}</strong>
                </div>
                <div class="metric-card">
                  <span>Faturamento mensal</span>
                  <strong>{formatCurrency(fullMonthlyRevenue)}</strong>
                </div>
                <div class="metric-card">
                  <span>Ponto de equilíbrio</span>
                  <strong>{formatWholeNumber(fullBreakEvenUnits)} vendas</strong>
                </div>
              </div>
            {:else}
              <div class="empty-state compact-top">
                <strong>Faltam alguns dados para fechar o cálculo</strong>
                <p>Preencha custos do produto, custos fixos e estimativa de vendas para ver o resultado completo.</p>
              </div>
            {/if}
          {/if}

          <div class="actions-row">
            <button class="ghost-button" type="button" on:click={previousBusinessStep} disabled={businessStep === 1}>
              Voltar
            </button>

            {#if businessStep < 5}
              <button class="primary-button" type="button" on:click={nextBusinessStep}>
                {businessStep === 4 ? 'Ver resultado' : 'Continuar'}
              </button>
            {/if}
          </div>
        </section>
      {/if}

      <section class="cta-card">
        <div>
          <p class="section-kicker">Depois do cálculo</p>
          <h2 class="cta-title">Agora aplique essa precificação no seu negócio</h2>
          <p class="cta-copy">O Zelo PDV calcula seu lucro real automaticamente a cada venda e tira essas contas do papel.</p>
        </div>

        <div class="cta-benefits">
          <div class="benefit-row"><span>✅</span><span>Controle de caixa sem planilha</span></div>
          <div class="benefit-row"><span>✅</span><span>Gestão de estoque e baixa automática</span></div>
          <div class="benefit-row"><span>✅</span><span>Relatórios de vendas e lucro real</span></div>
          <div class="benefit-row"><span>✅</span><span>Fiado e histórico do cliente no mesmo lugar</span></div>
        </div>

        <div class="cta-actions">
          <a href="/cadastro" class="primary-link">Testar 30 dias grátis</a>
          <p>Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      <section class="section-card section-spacing faq-shell">
        <div class="faq-intro">
          <p class="section-kicker">FAQ</p>
          <h2 class="section-title">Perguntas frequentes sobre precificação</h2>
        </div>

        <div class="faq-list">
          {#each faqItems as item}
            <details class="faq-item">
              <summary>
                <span>{item.question}</span>
                <span>+</span>
              </summary>
              <div>{item.answer}</div>
            </details>
          {/each}
        </div>
      </section>
    </div>
  </section>

  {#if productResultReady && selectedCalculator === 'product'}
    <div class="sticky-bar">
      <div class="sticky-inner max-w-6xl mx-auto px-6">
        <div class="sticky-info">
          <span class="sticky-label">Preço sugerido</span>
          <strong class="sticky-price">{formatCurrency(productSuggestedPrice)}</strong>
          {#if productForm.productName}<span class="sticky-name">· {productForm.productName}</span>{/if}
        </div>
        {#if productStep < 5}
          <button type="button" class="primary-button" on:click={() => goToProductStep(5)}>
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

  .eyebrow,
  .section-kicker,
  .result-kicker {
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
    background:
      linear-gradient(180deg, color-mix(in srgb, white 4%, transparent), color-mix(in srgb, var(--bg-card) 96%, transparent));
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
  .cta-title,
  .block-title,
  .result-card h3 {
    color: var(--text-main);
  }

  .section-title {
    font-size: clamp(1.7rem, 3vw, 2.7rem);
    line-height: 1.06;
    letter-spacing: -0.04em;
  }

  .block-head {
    gap: 0.9rem;
    margin-bottom: 1.2rem;
  }

  .block-number {
    width: 2rem;
    height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
    color: var(--text-main);
    font-size: 0.88rem;
    font-weight: 700;
  }

  .block-title {
    font-size: 1.3rem;
    margin-bottom: 0.2rem;
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

  .chip-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary) 16%, transparent);
    color: var(--text-main);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .product-layout {
    display: grid;
    gap: 1.5rem;
  }

  .product-main {
    display: grid;
    gap: 1.5rem;
    align-content: start;
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
  .empty-state,
  .summary-card {
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

  .aligned-start {
    align-items: flex-start;
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

  .result-card h3,
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
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
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

  .product-result-card {
    padding: 1.4rem;
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
    content: '';
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
    border: 2px solid color-mix(in srgb, var(--bg-panel) 96%, var(--border-subtle));
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

    .result-highlight-grid,
    .faq-shell {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .ingredient-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .progress-shell {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .progress-step {
      flex-direction: column;
      align-items: flex-start;
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
