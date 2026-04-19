<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { jsPDF } from 'jspdf';

  // ── State ──────────────────────────────────────────────────────────────
  let mode = 'sistema'; // 'sistema' | 'zero'
  let theme = 'elegante';
  let cardTitle = 'Cardápio';
  let cardSubtitle = '';
  let cardFooter = '';
  let exporting = false;
  let exportingPDF = false;
  let loading = false;
  let previewEl;

  // "Do sistema" state
  let categorias = [];
  let produtos = [];
  let selectedCatIds = new Set();
  let itemOverrides = {}; // prodId -> { price, description }

  // "Do zero" state
  let sections = [{ id: uid(), name: 'Seção', items: [] }];

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── Templates ──────────────────────────────────────────────────────────
  // All colors are explicit hex — required for html2canvas to render correctly
  const templates = {
    elegante: {
      label: 'Elegante',
      swatch: '#0f172a',
      bg: '#0f172a',
      headerBg: '#0a0f1e',
      titleColor: '#d4af37',
      titleFont: 'Georgia, serif',
      subtitleColor: '#94a3b8',
      sectionBg: '#1e293b',
      sectionText: '#d4af37',
      itemText: '#f1f5f9',
      priceColor: '#86efac',
      descColor: '#94a3b8',
      divider: '#334155',
      footerBg: '#0a0f1e',
      footerText: '#475569',
      footerBorder: '#1e293b',
    },
    claro: {
      label: 'Claro',
      swatch: '#f9fafb',
      bg: '#f9fafb',
      headerBg: '#ffffff',
      titleColor: '#1e3a8a',
      titleFont: 'Georgia, serif',
      subtitleColor: '#6b7280',
      sectionBg: '#eff6ff',
      sectionText: '#1e40af',
      itemText: '#111827',
      priceColor: '#15803d',
      descColor: '#6b7280',
      divider: '#e5e7eb',
      footerBg: '#f3f4f6',
      footerText: '#9ca3af',
      footerBorder: '#e5e7eb',
    },
    tropical: {
      label: 'Tropical',
      swatch: '#14532d',
      bg: '#14532d',
      headerBg: '#052e16',
      titleColor: '#fbbf24',
      titleFont: 'Georgia, serif',
      subtitleColor: '#86efac',
      sectionBg: '#166534',
      sectionText: '#fde68a',
      itemText: '#f0fdf4',
      priceColor: '#fde68a',
      descColor: '#86efac',
      divider: '#15803d',
      footerBg: '#052e16',
      footerText: '#4ade80',
      footerBorder: '#166534',
    }
  };

  $: t = templates[theme];

  // ── Preview sections (computed) ─────────────────────────────────────────
  $: previewSections = mode === 'sistema'
    ? categorias
        .filter(c => selectedCatIds.has(c.id))
        .map(c => ({
          name: c.nome,
          items: produtos
            .filter(p => p.id_categoria === c.id)
            .map(p => ({
              name: p.nome,
              price: itemOverrides[p.id]?.price !== undefined
                ? itemOverrides[p.id].price
                : Number(p.preco).toFixed(2).replace('.', ','),
              description: itemOverrides[p.id]?.description ?? ''
            }))
        }))
        .filter(s => s.items.length > 0)
    : sections.map(s => ({
        name: s.name,
        items: s.items.map(i => ({
          name: i.name,
          price: i.price || '',
          description: i.description || ''
        }))
      }));

  // ── Data loading ────────────────────────────────────────────────────────
  onMount(async () => {
    loading = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [catRes, prodRes] = await Promise.all([
        supabase.from('categorias').select('id, nome').eq('id_usuario', user.id).order('nome'),
        supabase.from('produtos').select('id, nome, preco, id_categoria')
          .eq('id_usuario', user.id)
          .or('ocultar_no_pdv.is.null,ocultar_no_pdv.eq.false')
          .order('nome')
      ]);
      if (catRes.error || prodRes.error) throw new Error('query_error');
      categorias = catRes.data || [];
      produtos = prodRes.data || [];
      selectedCatIds = new Set(categorias.map(c => c.id));
    } catch {
      addToast('Erro ao carregar produtos', 'error');
    } finally {
      loading = false;
    }
  });

  // ── "Do zero" helpers ────────────────────────────────────────────────────
  function addSection() {
    sections = [...sections, { id: uid(), name: 'Nova Seção', items: [] }];
  }
  function removeSection(id) {
    sections = sections.filter(s => s.id !== id);
  }
  function addItem(sectionId) {
    sections = sections.map(s =>
      s.id === sectionId
        ? { ...s, items: [...s.items, { id: uid(), name: '', price: '', description: '' }] }
        : s
    );
  }
  function removeItem(sectionId, itemId) {
    sections = sections.map(s =>
      s.id === sectionId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s
    );
  }
  function updateSection(id, field, value) {
    sections = sections.map(s => s.id === id ? { ...s, [field]: value } : s);
  }
  function updateItem(sectionId, itemId, field, value) {
    sections = sections.map(s =>
      s.id === sectionId
        ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }
        : s
    );
  }

  // ── "Do sistema" helpers ────────────────────────────────────────────────
  function toggleCat(id) {
    const next = new Set(selectedCatIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedCatIds = next;
  }
  function getOv(prodId, field, fallback) {
    return itemOverrides[prodId]?.[field] !== undefined ? itemOverrides[prodId][field] : fallback;
  }
  function setOv(prodId, field, value) {
    itemOverrides = { ...itemOverrides, [prodId]: { ...(itemOverrides[prodId] || {}), [field]: value } };
  }

  // ── Export ──────────────────────────────────────────────────────────────
  async function doExport(type) {
    if (!previewEl) return;
    if (type === 'jpg') exporting = true;
    else exportingPDF = true;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(previewEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: t.bg
      });
      if (type === 'jpg') {
        const a = document.createElement('a');
        a.download = 'cardapio.jpg';
        a.href = canvas.toDataURL('image/jpeg', 0.95);
        a.click();
        addToast('Cardápio exportado como JPG!', 'success');
      } else {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const w = canvas.width / 2;
        const h = canvas.height / 2;
        const pdf = new jsPDF({
          orientation: h >= w ? 'portrait' : 'landscape',
          unit: 'px',
          format: [w, h]
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
        pdf.save('cardapio.pdf');
        addToast('Cardápio exportado como PDF!', 'success');
      }
    } catch {
      addToast('Erro ao exportar. Tente novamente.', 'error');
    } finally {
      exporting = false;
      exportingPDF = false;
    }
  }

  function fmtPrice(p) {
    if (!p && p !== 0) return '';
    // Strip thousand-separator dots before parsing (e.g. "1.500,00" → "1500.00")
    const n = parseFloat(String(p).replace(/\./g, '').replace(',', '.'));
    if (isNaN(n)) return String(p);
    return 'R$ ' + n.toFixed(2).replace('.', ',');
  }
</script>

<svelte:head>
  <title>Cardápio Digital — Zelo PDV</title>
</svelte:head>

<!-- ────────────────────────────────────────────────────────────────────── -->
<div class="max-w-screen-xl mx-auto">

  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center gap-2 mb-1">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="color: var(--primary);">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <h1 class="text-2xl font-bold" style="color: var(--text-main);">Cardápio Digital</h1>
    </div>
    <p class="text-sm" style="color: var(--text-muted);">Monte e exporte seu cardápio para enviar pelo WhatsApp — sem precisar de designer.</p>
  </div>

  <div class="flex flex-col xl:flex-row gap-6 items-start">

    <!-- ═══════════════════════════════ EDITOR ═══════════════════════════ -->
    <div class="w-full xl:w-[420px] flex-shrink-0 space-y-4">

      <!-- Mode toggle -->
      <div class="flex rounded-xl p-1 gap-1" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <button
          class="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
          style="
            background: {mode === 'sistema' ? 'var(--primary)' : 'transparent'};
            color: {mode === 'sistema' ? 'var(--primary-text)' : 'var(--text-muted)'};
          "
          on:click={() => mode = 'sistema'}
        >
          Importar do Sistema
        </button>
        <button
          class="flex-1 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all"
          style="
            background: {mode === 'zero' ? 'var(--primary)' : 'transparent'};
            color: {mode === 'zero' ? 'var(--primary-text)' : 'var(--text-muted)'};
          "
          on:click={() => mode = 'zero'}
        >
          Criar do Zero
        </button>
      </div>

      <!-- General settings -->
      <div class="rounded-xl p-4 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <p class="text-xs font-bold uppercase tracking-wider" style="color: var(--text-muted);">Personalização</p>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">Título</label>
          <input
            type="text"
            bind:value={cardTitle}
            placeholder="Ex: Cardápio da Semana"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Subtítulo
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardSubtitle}
            placeholder="Ex: Sábado, 19 de Abril"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Rodapé
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardFooter}
            placeholder="Ex: WhatsApp: (14) 99999-9999"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>
      </div>

      <!-- Theme selector -->
      <div class="rounded-xl p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color: var(--text-muted);">Tema Visual</p>
        <div class="flex gap-2">
          {#each Object.entries(templates) as [key, tmpl]}
            {@const active = theme === key}
            <button
              on:click={() => theme = key}
              class="flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all"
              style="
                border-color: {active ? 'var(--primary)' : 'transparent'};
                outline: {active ? '2px solid var(--primary)' : 'none'};
                background: {active ? 'var(--accent-light)' : 'var(--bg-input)'};
              "
              title="Tema {tmpl.label}"
            >
              <div
                class="w-8 h-8 rounded-lg border-2"
                style="
                  background: {tmpl.swatch};
                  border-color: {active ? 'var(--primary)' : 'var(--border-subtle)'};
                "
              ></div>
              <span class="text-xs font-medium" style="color: {active ? 'var(--primary)' : 'var(--text-muted)'};">{tmpl.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- ─── DO SISTEMA ─────────────────────────────────────────────────── -->
      {#if mode === 'sistema'}
        <div class="rounded-xl p-4 space-y-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
          <p class="text-xs font-bold uppercase tracking-wider" style="color: var(--text-muted);">Produtos do Sistema</p>

          {#if loading}
            <div class="flex items-center justify-center py-8 gap-2" style="color: var(--text-muted);">
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <span class="text-sm">Carregando produtos...</span>
            </div>

          {:else if categorias.length === 0}
            <div class="py-8 text-center" style="color: var(--text-muted);">
              <svg class="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"/>
              </svg>
              <p class="text-sm">Nenhum produto cadastrado.</p>
              <a href="/gestao/produtos" class="text-xs mt-1 inline-block" style="color: var(--primary);">Cadastrar produtos →</a>
            </div>

          {:else}
            <div class="space-y-4">
              {#each categorias as cat}
                {@const catProds = produtos.filter(p => p.id_categoria === cat.id)}
                {#if catProds.length > 0}
                  <div class="space-y-2">
                    <!-- Category checkbox -->
                    <label class="flex items-center gap-2.5 cursor-pointer py-1 group">
                      <input
                        type="checkbox"
                        checked={selectedCatIds.has(cat.id)}
                        on:change={() => toggleCat(cat.id)}
                        class="w-4 h-4 rounded flex-shrink-0"
                        style="accent-color: var(--primary);"
                      />
                      <span class="text-sm font-semibold" style="color: var(--text-main);">{cat.nome}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded" style="background: var(--bg-input); color: var(--text-muted);">{catProds.length}</span>
                    </label>

                    {#if selectedCatIds.has(cat.id)}
                      <div class="ml-6 space-y-2 border-l-2 pl-3" style="border-color: var(--border-subtle);">
                        {#each catProds as prod}
                          <div class="space-y-1.5">
                            <div class="flex items-center justify-between gap-2">
                              <span class="text-xs font-medium" style="color: var(--text-label);">{prod.nome}</span>
                              <input
                                type="text"
                                value={getOv(prod.id, 'price', Number(prod.preco).toFixed(2).replace('.', ','))}
                                on:input={e => setOv(prod.id, 'price', e.target.value)}
                                class="w-24 px-2 py-1 rounded-lg text-xs text-right focus:outline-none"
                                style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                                placeholder="0,00"
                              />
                            </div>
                            <input
                              type="text"
                              value={getOv(prod.id, 'description', '')}
                              on:input={e => setOv(prod.id, 'description', e.target.value)}
                              class="w-full px-2 py-1 rounded-lg text-xs focus:outline-none"
                              style="background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle);"
                              placeholder="Descrição do dia (ex: Frango com Brócolis)"
                            />
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <!-- ─── DO ZERO ──────────────────────────────────────────────────────── -->
      {#if mode === 'zero'}
        <div class="space-y-3">
          {#each sections as section (section.id)}
            <div class="rounded-xl p-4 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">

              <!-- Section name + delete -->
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  value={section.name}
                  on:input={e => updateSection(section.id, 'name', e.target.value)}
                  class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold focus:outline-none"
                  style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                  placeholder="Nome da seção"
                />
                {#if sections.length > 1}
                  <button
                    on:click={() => removeSection(section.id)}
                    class="p-2 rounded-lg flex-shrink-0 transition-colors"
                    style="color: var(--error);"
                    title="Remover seção"
                    on:mouseenter={e => e.currentTarget.style.background = 'var(--error-bg)'}
                    on:mouseleave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                {/if}
              </div>

              <!-- Items -->
              {#each section.items as item (item.id)}
                <div class="flex items-start gap-2 pl-2 border-l-2" style="border-color: var(--border-subtle);">
                  <div class="flex-1 space-y-1.5">
                    <input
                      type="text"
                      value={item.name}
                      on:input={e => updateItem(section.id, item.id, 'name', e.target.value)}
                      class="w-full px-2.5 py-1.5 rounded-lg text-sm focus:outline-none"
                      style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                      placeholder="Nome do item"
                    />
                    <div class="flex gap-2">
                      <input
                        type="text"
                        value={item.price}
                        on:input={e => updateItem(section.id, item.id, 'price', e.target.value)}
                        class="w-28 px-2.5 py-1.5 rounded-lg text-xs focus:outline-none"
                        style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                        placeholder="R$ 0,00"
                      />
                      <input
                        type="text"
                        value={item.description}
                        on:input={e => updateItem(section.id, item.id, 'description', e.target.value)}
                        class="flex-1 px-2.5 py-1.5 rounded-lg text-xs focus:outline-none"
                        style="background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border-subtle);"
                        placeholder="Descrição (opcional)"
                      />
                    </div>
                  </div>
                  <button
                    on:click={() => removeItem(section.id, item.id)}
                    class="mt-2 p-1.5 rounded-lg transition-colors flex-shrink-0"
                    style="color: var(--text-muted);"
                    title="Remover item"
                    on:mouseenter={e => e.currentTarget.style.color = 'var(--error)'}
                    on:mouseleave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              {/each}

              <!-- Add item -->
              <button
                on:click={() => addItem(section.id)}
                class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all w-full justify-center"
                style="color: var(--primary); border: 1px dashed var(--primary); background: transparent;"
                on:mouseenter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                on:mouseleave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                Adicionar item
              </button>
            </div>
          {/each}

          <!-- Add section -->
          <button
            on:click={addSection}
            class="w-full py-3 rounded-xl text-sm font-medium transition-all"
            style="color: var(--text-muted); border: 1px dashed var(--border-subtle); background: transparent;"
            on:mouseenter={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-main)'; }}
            on:mouseleave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            + Adicionar Seção
          </button>
        </div>
      {/if}
    </div>

    <!-- ════════════════════════════ PREVIEW ════════════════════════════ -->
    <div class="flex-1 min-w-0">

      <!-- Export buttons -->
      <div class="flex items-center justify-between mb-4">
        <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--text-muted);">Pré-visualização</p>
        <div class="flex gap-2">
          <button
            on:click={() => doExport('jpg')}
            disabled={exporting || exportingPDF}
            class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style="background: var(--primary); color: var(--primary-text);"
          >
            {#if exporting}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Gerando...
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Baixar JPG
            {/if}
          </button>

          <button
            on:click={() => doExport('pdf')}
            disabled={exporting || exportingPDF}
            class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-subtle);"
          >
            {#if exportingPDF}
              <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Gerando...
            {:else}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
              Baixar PDF
            {/if}
          </button>
        </div>
      </div>

      <!-- Cardápio preview wrapper — centered, scrollable -->
      <div class="flex justify-center">
        <div
          bind:this={previewEl}
          style="
            width: 420px;
            background: {t.bg};
            font-family: Georgia, 'Times New Roman', serif;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            border-radius: 4px;
            overflow: hidden;
          "
        >
          <!-- ── Header ── -->
          <div style="
            padding: 32px 28px 20px;
            text-align: center;
            background: {t.headerBg};
            border-bottom: 2px solid {t.divider};
          ">
            <h1 style="
              margin: 0;
              font-size: 26px;
              font-weight: 800;
              color: {t.titleColor};
              letter-spacing: 0.08em;
              text-transform: uppercase;
              line-height: 1.2;
            ">{cardTitle || 'Cardápio'}</h1>

            {#if cardSubtitle}
              <p style="
                margin: 8px 0 0;
                font-size: 13px;
                color: {t.subtitleColor};
                font-style: italic;
                letter-spacing: 0.02em;
              ">{cardSubtitle}</p>
            {/if}
          </div>

          <!-- ── Sections ── -->
          <div style="padding: 8px 0;">
            {#if previewSections.length === 0}
              <div style="padding: 48px 28px; text-align: center; color: {t.subtitleColor}; font-size: 14px;">
                {mode === 'sistema' ? 'Selecione categorias no painel ao lado.' : 'Adicione seções e itens no painel ao lado.'}
              </div>
            {:else}
              {#each previewSections as section, si}

                <!-- Section header -->
                <div style="
                  margin-top: {si > 0 ? '8px' : '4px'};
                  padding: 8px 28px;
                  background: {t.sectionBg};
                  border-top: 1px solid {t.divider};
                  border-bottom: 1px solid {t.divider};
                ">
                  <span style="
                    font-size: 11px;
                    font-weight: 700;
                    color: {t.sectionText};
                    letter-spacing: 0.15em;
                    text-transform: uppercase;
                    font-family: Georgia, serif;
                  ">{section.name}</span>
                </div>

                <!-- Items -->
                <div>
                  {#each section.items as item, idx}
                    <div style="
                      padding: 11px 28px;
                      {idx < section.items.length - 1 ? `border-bottom: 1px solid ${t.divider};` : ''}
                    ">
                      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                        <div style="flex: 1; min-width: 0;">
                          <span style="
                            display: block;
                            font-size: 14px;
                            font-weight: 600;
                            color: {t.itemText};
                            line-height: 1.3;
                          ">{item.name || '—'}</span>
                          {#if item.description}
                            <span style="
                              display: block;
                              margin-top: 2px;
                              font-size: 11px;
                              color: {t.descColor};
                              font-style: italic;
                              line-height: 1.4;
                            ">{item.description}</span>
                          {/if}
                        </div>
                        {#if item.price}
                          <span style="
                            font-size: 14px;
                            font-weight: 700;
                            color: {t.priceColor};
                            white-space: nowrap;
                            flex-shrink: 0;
                            margin-top: 1px;
                          ">{fmtPrice(item.price)}</span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>

              {/each}
            {/if}
          </div>

          <!-- ── Footer ── -->
          {#if cardFooter}
            <div style="
              padding: 14px 28px;
              text-align: center;
              background: {t.footerBg};
              border-top: 1px solid {t.footerBorder};
            ">
              <span style="font-size: 12px; color: {t.footerText}; letter-spacing: 0.02em;">{cardFooter}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

  </div>
</div>
