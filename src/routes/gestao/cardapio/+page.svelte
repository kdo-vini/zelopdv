<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabaseClient';
  import { addToast } from '$lib/stores/ui';
  import { jsPDF } from 'jspdf';

  // ── State ──────────────────────────────────────────────────────────────
  let mode = 'sistema'; // 'sistema' | 'zero'
  let theme = 'elegante';
  let font = 'classico';
  let twoColumn = false;
  let cardTitle = 'Cardápio';
  let cardSubtitle = '';
  let cardFooter = '';
  let exporting = false;
  let exportingPDF = false;
  let loading = false;
  let previewWrapper;

  // Contact info state
  let storeName = '';
  let cardPhone = '';
  let cardInstagram = '';
  let cardAddress = '';
  let showQRHint = false;

  // Logo state
  let logoBase64 = '';
  let showLogo = true;

  // "Do sistema" state
  let categorias = [];
  let produtos = [];
  let selectedCatIds = new Set();
  let itemOverrides = {}; // prodId -> { price, description }
  let destaqueId = null; // id of the highlighted product
  let itemBadges = {};   // prodId (or item.id for "do zero") -> 'novo' | 'promo' | null

  // "Do zero" state
  let sections = [{ id: uid(), name: 'Seção', items: [] }];

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── Fonts ───────────────────────────────────────────────────────────────
  const fonts = {
    classico:  { label: 'Clássico',  family: "'Playfair Display', Georgia, serif",        google: 'Playfair+Display:wght@700;800' },
    moderno:   { label: 'Moderno',   family: "'Montserrat', 'Helvetica Neue', sans-serif", google: 'Montserrat:wght@600;700;800' },
    artesanal: { label: 'Artesanal', family: "'Dancing Script', cursive",                 google: 'Dancing+Script:wght@700' },
    impacto:   { label: 'Impacto',   family: "'Oswald', 'Arial Narrow', sans-serif",      google: 'Oswald:wght@600;700' },
    suave:     { label: 'Suave',     family: "'Lato', 'Segoe UI', sans-serif",            google: 'Lato:wght@700;900' },
  };

  $: currentFont = fonts[font];

  function loadGoogleFont(googleParam) {
    const id = 'gf-' + googleParam.split(':')[0];
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${googleParam}&display=swap`;
    document.head.appendChild(link);
  }

  // Preload on font change
  $: if (typeof document !== 'undefined' && currentFont) {
    loadGoogleFont(currentFont.google);
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
    },
    noturno: {
      label: 'Noturno',
      swatch: '#1c1c1e',
      bg: '#1c1c1e',
      headerBg: '#111113',
      titleColor: '#ff6b2b',
      titleFont: 'Georgia, serif',
      subtitleColor: '#facc15',
      sectionBg: '#2a2a2e',
      sectionText: '#ff6b2b',
      itemText: '#f4f4f5',
      priceColor: '#facc15',
      descColor: '#a1a1aa',
      divider: '#3f3f46',
      footerBg: '#111113',
      footerText: '#71717a',
      footerBorder: '#2a2a2e',
    },
    vermelho: {
      label: 'Vermelho',
      swatch: '#7f1d1d',
      bg: '#fdf6f0',
      headerBg: '#7f1d1d',
      titleColor: '#fef3c7',
      titleFont: 'Georgia, serif',
      subtitleColor: '#fca5a5',
      sectionBg: '#fee2e2',
      sectionText: '#991b1b',
      itemText: '#1c1917',
      priceColor: '#b91c1c',
      descColor: '#78716c',
      divider: '#fecaca',
      footerBg: '#7f1d1d',
      footerText: '#fca5a5',
      footerBorder: '#991b1b',
    },
    verao: {
      label: 'Verão',
      swatch: '#06b6d4',
      bg: '#f0fdfa',
      headerBg: '#ecfeff',
      titleColor: '#0e7490',
      titleFont: 'Georgia, serif',
      subtitleColor: '#f97316',
      sectionBg: '#cffafe',
      sectionText: '#0e7490',
      itemText: '#134e4a',
      priceColor: '#f97316',
      descColor: '#6b7280',
      divider: '#a5f3fc',
      footerBg: '#ecfeff',
      footerText: '#0891b2',
      footerBorder: '#a5f3fc',
    },
    minimalista: {
      label: 'Minimal',
      swatch: '#e5e7eb',
      bg: '#f9fafb',
      headerBg: '#ffffff',
      titleColor: '#111827',
      titleFont: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      subtitleColor: '#6b7280',
      sectionBg: '#f3f4f6',
      sectionText: '#374151',
      itemText: '#111827',
      priceColor: '#111827',
      descColor: '#9ca3af',
      divider: '#e5e7eb',
      footerBg: '#ffffff',
      footerText: '#d1d5db',
      footerBorder: '#e5e7eb',
    },
    festa: {
      label: 'Festa',
      swatch: '#92400e',
      bg: '#fffbeb',
      headerBg: '#92400e',
      titleColor: '#fef3c7',
      titleFont: 'Georgia, serif',
      subtitleColor: '#fcd34d',
      sectionBg: '#fef3c7',
      sectionText: '#78350f',
      itemText: '#292524',
      priceColor: '#b45309',
      descColor: '#78716c',
      divider: '#fde68a',
      footerBg: '#92400e',
      footerText: '#fcd34d',
      footerBorder: '#78350f',
    }
  };

  $: t = templates[theme];

  // ── Derived: has any contact footer content ─────────────────────────────
  $: hasFooterContent = cardFooter || cardPhone || cardInstagram || cardAddress || showQRHint;

  // ── Preview sections (computed) ─────────────────────────────────────────
  $: previewSections = mode === 'sistema'
    ? categorias
        .filter(c => selectedCatIds.has(c.id))
        .map(c => ({
          name: c.nome,
          items: produtos
            .filter(p => p.id_categoria === c.id)
            .map(p => ({
              id: p.id,
              name: p.nome,
              price: itemOverrides[p.id]?.price !== undefined
                ? itemOverrides[p.id].price
                : Number(p.preco).toFixed(2).replace('.', ','),
              description: itemOverrides[p.id]?.description ?? '',
              isDestaque: p.id === destaqueId,
              badge: itemBadges[p.id] || null
            }))
        }))
        .filter(s => s.items.length > 0)
    : sections.map(s => ({
        name: s.name,
        items: s.items.map(i => ({
          id: i.id,
          name: i.name,
          price: i.price || '',
          description: i.description || '',
          isDestaque: i.isDestaque || false,
          badge: i.badge || null
        }))
      }));

  // ── Page split algorithm ─────────────────────────────────────────────────
  const HEADER_H = 128;  // first page header base (store name + title + subtitle + padding)
  const FOOTER_H = 84;   // last page footer (approximated generously)
  const SECTION_H = 36;  // section label bar height
  const ITEM_H = 42;     // each product row height
  const PAGE_H = 525;    // total page height
  const PADDING_V = 16;  // top+bottom padding of sections area

  // Adjust header height when logo is shown (+56px) or storeName is shown (+18px)
  $: HEADER_H_ACTUAL = 128 + (logoBase64 && showLogo ? 56 : 0) + (storeName ? 18 : 0);

  $: effectiveSectionHeight = (section) =>
    SECTION_H + (twoColumn ? Math.ceil(section.items.length / 2) * ITEM_H : section.items.length * ITEM_H);

  $: pages = (() => {
    if (previewSections.length === 0) return [[]];
    const result = [];
    let current = [];
    let usedH = HEADER_H_ACTUAL + PADDING_V; // first page starts with header

    for (const section of previewSections) {
      const sH = effectiveSectionHeight(section);
      const isFirstPage = result.length === 0;
      const budget = PAGE_H - (isFirstPage ? HEADER_H_ACTUAL + PADDING_V : PADDING_V);

      if (current.length > 0 && usedH + sH > budget) {
        result.push(current);
        current = [section];
        usedH = PADDING_V + sH;
      } else {
        current.push(section);
        usedH += sH;
      }
    }
    if (current.length > 0 || result.length === 0) result.push(current);
    return result;
  })();

  // ── localStorage config persistence ─────────────────────────────────────
  $: if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('zeloPDV_cardapio_config', JSON.stringify({
        mode, theme, font,
        cardTitle, cardSubtitle, cardFooter,
        storeName, cardPhone, cardInstagram, cardAddress,
        showQRHint, twoColumn,
        showLogo, itemBadges
      }));
    } catch {}
    // Save logo separately to handle QuotaExceededError from large base64
    try {
      if (logoBase64) {
        localStorage.setItem('zeloPDV_cardapio_logo', logoBase64);
      } else {
        localStorage.removeItem('zeloPDV_cardapio_logo');
      }
    } catch {}
  }

  // ── Data loading ────────────────────────────────────────────────────────
  onMount(async () => {
    // Load all Google Fonts upfront so exports render correctly
    for (const f of Object.values(fonts)) {
      loadGoogleFont(f.google);
    }

    // Restore saved config
    try {
      const saved = localStorage.getItem('zeloPDV_cardapio_config');
      if (saved) {
        const c = JSON.parse(saved);
        if (c.mode) mode = c.mode;
        if (c.theme && templates[c.theme]) theme = c.theme;
        if (c.font && fonts[c.font]) font = c.font;
        if (c.cardTitle !== undefined) cardTitle = c.cardTitle;
        if (c.cardSubtitle !== undefined) cardSubtitle = c.cardSubtitle;
        if (c.cardFooter !== undefined) cardFooter = c.cardFooter;
        if (c.storeName !== undefined) storeName = c.storeName;
        if (c.cardPhone !== undefined) cardPhone = c.cardPhone;
        if (c.cardInstagram !== undefined) cardInstagram = c.cardInstagram;
        if (c.cardAddress !== undefined) cardAddress = c.cardAddress;
        if (c.showQRHint !== undefined) showQRHint = c.showQRHint;
        if (c.twoColumn !== undefined) twoColumn = c.twoColumn;
        if (c.showLogo !== undefined) showLogo = c.showLogo;
        if (c.itemBadges !== undefined) itemBadges = c.itemBadges;
      }
    } catch {}
    // Restore logo base64 separately (stored in its own key to avoid JSON size bloat)
    try {
      const savedLogo = localStorage.getItem('zeloPDV_cardapio_logo');
      if (savedLogo) logoBase64 = savedLogo;
    } catch {}

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
        ? { ...s, items: [...s.items, { id: uid(), name: '', price: '', description: '', isDestaque: false, badge: null }] }
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
    if (!previewWrapper) return;
    if (type === 'jpg') exporting = true;
    else exportingPDF = true;
    try {
      await document.fonts.ready;
      const { default: html2canvas } = await import('html2canvas');
      const pageEls = previewWrapper.querySelectorAll('.cardapio-page');

      if (type === 'jpg') {
        if (pageEls.length === 1) {
          const canvas = await html2canvas(pageEls[0], {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: t.bg
          });
          const a = document.createElement('a');
          a.download = 'cardapio.jpg';
          a.href = canvas.toDataURL('image/jpeg', 0.95);
          a.click();
        } else {
          for (let i = 0; i < pageEls.length; i++) {
            const canvas = await html2canvas(pageEls[i], {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: t.bg
            });
            const a = document.createElement('a');
            a.download = `cardapio-${i + 1}.jpg`;
            a.href = canvas.toDataURL('image/jpeg', 0.95);
            a.click();
            if (i < pageEls.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }
        addToast('Cardápio exportado como JPG!', 'success');
      } else {
        const canvases = [];
        for (let i = 0; i < pageEls.length; i++) {
          const canvas = await html2canvas(pageEls[i], {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: t.bg
          });
          canvases.push(canvas);
        }

        const w = canvases[0].width / 2;
        const h = canvases[0].height / 2;
        const pdf = new jsPDF({
          orientation: h >= w ? 'portrait' : 'landscape',
          unit: 'px',
          format: [w, h]
        });

        for (let i = 0; i < canvases.length; i++) {
          if (i > 0) pdf.addPage([w, h]);
          const imgData = canvases[i].toDataURL('image/jpeg', 0.95);
          pdf.addImage(imgData, 'JPEG', 0, 0, w, h);
        }

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

  function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      logoBase64 = ev.target.result;
      showLogo = true;
    };
    reader.readAsDataURL(file);
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

      <!-- General settings — Personalização -->
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
            Rodapé livre
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardFooter}
            placeholder="Ex: Promoções válidas até domingo"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <!-- 2-column layout toggle -->
        <label class="flex items-center gap-3 cursor-pointer py-1 select-none">
          <div
            class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
            style="background: {twoColumn ? 'var(--primary)' : 'var(--bg-input)'}; border: 1px solid {twoColumn ? 'var(--primary)' : 'var(--border-subtle)'};"
          >
            <input type="checkbox" bind:checked={twoColumn} class="sr-only" />
            <span
              class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style="transform: translateX({twoColumn ? '16px' : '0px'});"
            ></span>
          </div>
          <span class="text-xs font-medium" style="color: var(--text-label);">Layout 2 colunas (mais itens por página)</span>
        </label>
      </div>

      <!-- Font selector -->
      <div class="rounded-xl p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color: var(--text-muted);">Fonte</p>
        <div class="grid grid-cols-2 gap-2">
          {#each Object.entries(fonts) as [key, f]}
            {@const active = font === key}
            <button
              on:click={() => font = key}
              class="py-2.5 px-3 rounded-xl text-sm transition-all text-left"
              style="
                border: 2px solid {active ? 'var(--primary)' : 'var(--border-subtle)'};
                background: {active ? 'var(--accent-light)' : 'var(--bg-input)'};
                color: {active ? 'var(--primary)' : 'var(--text-label)'};
                font-family: {f.family};
                font-weight: 700;
              "
            >{f.label}</button>
          {/each}
        </div>
      </div>

      <!-- Theme selector — 2-column grid to accommodate 8 themes -->
      <div class="rounded-xl p-4" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <p class="text-xs font-bold uppercase tracking-wider mb-3" style="color: var(--text-muted);">Tema Visual</p>
        <div class="grid grid-cols-4 gap-2">
          {#each Object.entries(templates) as [key, tmpl]}
            {@const active = theme === key}
            <button
              on:click={() => theme = key}
              class="flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border-2 transition-all"
              style="
                border-color: {active ? 'var(--primary)' : 'transparent'};
                outline: {active ? '2px solid var(--primary)' : 'none'};
                background: {active ? 'var(--accent-light)' : 'var(--bg-input)'};
              "
              title="Tema {tmpl.label}"
            >
              <div
                class="w-7 h-7 rounded-lg border-2"
                style="
                  background: {tmpl.swatch};
                  border-color: {active ? 'var(--primary)' : 'var(--border-subtle)'};
                "
              ></div>
              <span class="text-xs font-medium leading-tight text-center" style="color: {active ? 'var(--primary)' : 'var(--text-muted)'};">{tmpl.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Contact info -->
      <div class="rounded-xl p-4 space-y-3" style="background: var(--bg-card); border: 1px solid var(--border-subtle);">
        <p class="text-xs font-bold uppercase tracking-wider" style="color: var(--text-muted);">Informações de Contato</p>

        <!-- Logo upload -->
        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Logo
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>

          {#if logoBase64}
            <!-- Preview + controls -->
            <div class="flex items-center gap-3">
              <img src={logoBase64} alt="Logo" class="w-14 h-14 object-contain rounded-lg flex-shrink-0"
                style="background: var(--bg-input); border: 1px solid var(--border-subtle);" />
              <div class="flex flex-col gap-1.5 flex-1">
                <!-- Show/hide toggle -->
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <div class="relative w-8 h-4 rounded-full transition-colors flex-shrink-0"
                    style="background: {showLogo ? 'var(--primary)' : 'var(--bg-input)'}; border: 1px solid {showLogo ? 'var(--primary)' : 'var(--border-subtle)'};">
                    <input type="checkbox" bind:checked={showLogo} class="sr-only" />
                    <span class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform"
                      style="transform: translateX({showLogo ? '14px' : '0px'});"></span>
                  </div>
                  <span class="text-xs" style="color: var(--text-label);">Exibir no cardápio</span>
                </label>
                <!-- Remove button -->
                <button on:click={() => { logoBase64 = ''; showLogo = true; }}
                  class="text-xs text-left transition-colors"
                  style="color: var(--error); background: none; border: none; cursor: pointer; padding: 0;">
                  Remover logo
                </button>
              </div>
            </div>
          {:else}
            <!-- Upload zone -->
            <label class="flex flex-col items-center gap-2 py-4 rounded-xl cursor-pointer transition-colors"
              style="border: 1.5px dashed var(--border-subtle); background: var(--bg-input);"
              on:mouseenter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
              on:mouseleave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}>
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span class="text-xs" style="color: var(--text-muted);">Clique para enviar (PNG, JPG)</span>
              <input type="file" accept="image/*" class="sr-only" on:change={handleLogoUpload} />
            </label>
          {/if}
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Nome do Estabelecimento
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={storeName}
            placeholder="Ex: Lanchonete do Zé"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Telefone / WhatsApp
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardPhone}
            placeholder="(00) 00000-0000"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Instagram
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardInstagram}
            placeholder="@seulanche"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <div>
          <label class="block text-xs font-medium mb-1.5" style="color: var(--text-label);">
            Endereço
            <span class="font-normal ml-1" style="color: var(--text-muted);">opcional</span>
          </label>
          <input
            type="text"
            bind:value={cardAddress}
            placeholder="Rua das Flores, 123 — Centro"
            class="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none"
            style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
          />
        </div>

        <!-- showQRHint toggle -->
        <label class="flex items-center gap-3 cursor-pointer py-1 select-none">
          <div
            class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
            style="background: {showQRHint ? 'var(--primary)' : 'var(--bg-input)'}; border: 1px solid {showQRHint ? 'var(--primary)' : 'var(--border-subtle)'};"
          >
            <input type="checkbox" bind:checked={showQRHint} class="sr-only" />
            <span
              class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
              style="transform: translateX({showQRHint ? '16px' : '0px'});"
            ></span>
          </div>
          <span class="text-xs font-medium" style="color: var(--text-label);">Mostrar aviso "Peça pelo WhatsApp"</span>
        </label>
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
                              <span class="text-xs font-medium flex-1 min-w-0 truncate" style="color: var(--text-label);">{prod.nome}</span>
                              <!-- Destaque star toggle -->
                              <button
                                on:click={() => destaqueId = destaqueId === prod.id ? null : prod.id}
                                title={destaqueId === prod.id ? 'Remover destaque' : 'Marcar como Destaque do Dia'}
                                class="flex-shrink-0 text-base leading-none p-0.5 transition-colors"
                                style="color: {destaqueId === prod.id ? '#f59e0b' : 'var(--text-muted)'}; background: none; border: none; cursor: pointer;"
                              >★</button>
                              <!-- Badge toggles -->
                              <button
                                on:click={() => itemBadges = { ...itemBadges, [prod.id]: itemBadges[prod.id] === 'novo' ? null : 'novo' }}
                                title="Marcar como Novo"
                                class="flex-shrink-0 font-bold transition-all"
                                style="
                                  background: {itemBadges[prod.id] === 'novo' ? '#3b82f6' : 'var(--bg-input)'};
                                  color: {itemBadges[prod.id] === 'novo' ? '#fff' : 'var(--text-muted)'};
                                  border: 1px solid {itemBadges[prod.id] === 'novo' ? '#3b82f6' : 'var(--border-subtle)'};
                                  font-size: 9px; line-height: 1; padding: 2px 5px; border-radius: 4px; cursor: pointer;
                                ">NOVO</button>
                              <button
                                on:click={() => itemBadges = { ...itemBadges, [prod.id]: itemBadges[prod.id] === 'promo' ? null : 'promo' }}
                                title="Marcar como Em Promoção"
                                class="flex-shrink-0 font-bold transition-all"
                                style="
                                  background: {itemBadges[prod.id] === 'promo' ? '#ef4444' : 'var(--bg-input)'};
                                  color: {itemBadges[prod.id] === 'promo' ? '#fff' : 'var(--text-muted)'};
                                  border: 1px solid {itemBadges[prod.id] === 'promo' ? '#ef4444' : 'var(--border-subtle)'};
                                  font-size: 9px; line-height: 1; padding: 2px 5px; border-radius: 4px; cursor: pointer;
                                ">PROMO</button>
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
                              placeholder="Descreva seu produto (Opcional)"
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
                    <div class="flex items-center gap-1.5">
                      <!-- Destaque star toggle for "do zero" items -->
                      <button
                        on:click={() => updateItem(section.id, item.id, 'isDestaque', !item.isDestaque)}
                        title={item.isDestaque ? 'Remover destaque' : 'Marcar como Destaque do Dia'}
                        class="flex-shrink-0 text-base leading-none p-0.5 transition-colors"
                        style="color: {item.isDestaque ? '#f59e0b' : 'var(--text-muted)'}; background: none; border: none; cursor: pointer;"
                      >★</button>
                      <!-- Badge toggles for "do zero" items -->
                      <button
                        on:click={() => updateItem(section.id, item.id, 'badge', item.badge === 'novo' ? null : 'novo')}
                        title="Marcar como Novo"
                        class="flex-shrink-0 font-bold transition-all"
                        style="
                          background: {item.badge === 'novo' ? '#3b82f6' : 'var(--bg-input)'};
                          color: {item.badge === 'novo' ? '#fff' : 'var(--text-muted)'};
                          border: 1px solid {item.badge === 'novo' ? '#3b82f6' : 'var(--border-subtle)'};
                          font-size: 9px; line-height: 1; padding: 2px 5px; border-radius: 4px; cursor: pointer;
                        ">NOVO</button>
                      <button
                        on:click={() => updateItem(section.id, item.id, 'badge', item.badge === 'promo' ? null : 'promo')}
                        title="Marcar como Em Promoção"
                        class="flex-shrink-0 font-bold transition-all"
                        style="
                          background: {item.badge === 'promo' ? '#ef4444' : 'var(--bg-input)'};
                          color: {item.badge === 'promo' ? '#fff' : 'var(--text-muted)'};
                          border: 1px solid {item.badge === 'promo' ? '#ef4444' : 'var(--border-subtle)'};
                          font-size: 9px; line-height: 1; padding: 2px 5px; border-radius: 4px; cursor: pointer;
                        ">PROMO</button>
                      <input
                        type="text"
                        value={item.name}
                        on:input={e => updateItem(section.id, item.id, 'name', e.target.value)}
                        class="flex-1 px-2.5 py-1.5 rounded-lg text-sm focus:outline-none"
                        style="background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-subtle);"
                        placeholder="Nome do item"
                      />
                    </div>
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

      <!-- Config auto-save hint -->
      <p class="text-xs text-center pb-2" style="color: var(--text-muted);">Configurações salvas automaticamente</p>
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

      <!-- Cardápio preview wrapper — multi-page, centered -->
      <div class="flex justify-center">
        <div bind:this={previewWrapper} class="flex flex-col gap-4 items-center">

          {#each pages as pageSections, pi}
            <!-- Page indicator label (outside card, shown when multiple pages) -->
            {#if pages.length > 1}
              <p class="text-xs" style="color: var(--text-muted);">
                Página {pi + 1} de {pages.length}
              </p>
            {/if}

            <!-- Individual cardápio page — fixed 420×525 (4:5) -->
            <div
              class="cardapio-page"
              style="
                width: 420px;
                height: 525px;
                background: {t.bg};
                font-family: {currentFont.family};
                box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                border-radius: 4px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                flex-shrink: 0;
              "
            >
              <!-- ── Header (first page only) ── -->
              {#if pi === 0}
                <div style="
                  padding: 32px 28px 20px;
                  text-align: center;
                  background: {t.headerBg};
                  border-bottom: 2px solid {t.divider};
                  flex-shrink: 0;
                ">
                  {#if logoBase64 && showLogo}
                    <div style="display: block; text-align: center; margin-bottom: 8px;">
                      <img src={logoBase64} alt="Logo" style="max-height: 48px; max-width: 120px; object-fit: contain; display: inline-block;" />
                    </div>
                  {/if}
                  {#if storeName}
                    <p style="
                      margin: 0 0 6px;
                      font-size: 11px;
                      font-weight: 600;
                      color: {t.subtitleColor};
                      letter-spacing: 0.18em;
                      text-transform: uppercase;
                      font-family: {currentFont.family};
                    ">{storeName}</p>
                  {/if}

                  <h1 style="
                    margin: 0;
                    font-size: 26px;
                    font-weight: 800;
                    color: {t.titleColor};
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    line-height: 1.2;
                    font-family: {currentFont.family};
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
              {/if}

              <!-- ── Sections area ── -->
              <div style="flex: 1; overflow: hidden; padding: 8px 0;">
                {#if pageSections.length === 0 && pi === 0}
                  <!-- Empty state on first/only page -->
                  <div style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: {t.subtitleColor};
                    font-size: 14px;
                    text-align: center;
                    padding: 0 28px;
                  ">
                    {mode === 'sistema' ? 'Selecione categorias no painel ao lado.' : 'Adicione seções e itens no painel ao lado.'}
                  </div>
                {:else}
                  {#each pageSections as section, si}

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
                        font-family: {currentFont.family};
                      ">{section.name}</span>
                    </div>

                    <!-- Items — single or 2-column layout -->
                    <div style="
                      {twoColumn
                        ? 'display: grid; grid-template-columns: 1fr 1fr; gap: 0;'
                        : ''}
                    ">
                      {#each section.items as item, idx}
                        <div style="
                          padding: 11px 28px;
                          {twoColumn && idx % 2 === 0 ? 'border-right: 1px solid ' + t.divider + ';' : ''}
                          {twoColumn
                            ? (Math.floor(idx / 2) < Math.ceil(section.items.length / 2) - 1
                                ? 'border-bottom: 1px solid ' + t.divider + ';'
                                : (section.items.length % 2 === 0 || idx < section.items.length - 1
                                    ? 'border-bottom: 1px solid ' + t.divider + ';'
                                    : ''))
                            : (idx < section.items.length - 1 ? 'border-bottom: 1px solid ' + t.divider + ';' : '')}
                        ">
                          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                            <div style="flex: 1; min-width: 0;">
                              <span style="
                                display: inline;
                                font-size: {twoColumn ? '12px' : '14px'};
                                font-weight: 600;
                                color: {t.itemText};
                                line-height: 1.3;
                              ">{item.name || '—'}</span>
                              {#if item.isDestaque}
                                <span style="
                                  display: inline-block;
                                  margin-left: 6px;
                                  padding: 1px 6px;
                                  border-radius: 10px;
                                  font-size: 9px;
                                  font-weight: 700;
                                  background: #f59e0b;
                                  color: #fff;
                                  letter-spacing: 0.05em;
                                  vertical-align: middle;
                                ">DESTAQUE</span>
                              {/if}
                              {#if item.badge === 'novo'}
                                <span style="
                                  display: inline-block; margin-left: 5px;
                                  padding: 1px 5px; border-radius: 8px;
                                  font-size: 8px; font-weight: 800;
                                  background: #3b82f6; color: #fff;
                                  letter-spacing: 0.06em; vertical-align: middle;
                                  text-transform: uppercase;
                                ">NOVO</span>
                              {:else if item.badge === 'promo'}
                                <span style="
                                  display: inline-block; margin-left: 5px;
                                  padding: 1px 5px; border-radius: 8px;
                                  font-size: 8px; font-weight: 800;
                                  background: #ef4444; color: #fff;
                                  letter-spacing: 0.06em; vertical-align: middle;
                                  text-transform: uppercase;
                                ">PROMO</span>
                              {/if}
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
                                font-size: {twoColumn ? '12px' : '14px'};
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

              <!-- ── Footer (last page only, when content exists) ── -->
              {#if pi === pages.length - 1 && hasFooterContent}
                <div style="
                  padding: 14px 28px;
                  text-align: center;
                  background: {t.footerBg};
                  border-top: 1px solid {t.footerBorder};
                  flex-shrink: 0;
                ">
                  <!-- Free-text footer line -->
                  {#if cardFooter}
                    <p style="margin: 0 0 6px; font-size: 12px; color: {t.footerText}; letter-spacing: 0.02em;">{cardFooter}</p>
                  {/if}

                  <!-- WhatsApp hint badge -->
                  {#if showQRHint}
                    <p style="
                      display: inline-block;
                      margin: 0 0 6px;
                      padding: 3px 10px;
                      border-radius: 20px;
                      font-size: 11px;
                      font-weight: 600;
                      background: #25D366;
                      color: #ffffff;
                      letter-spacing: 0.01em;
                    ">Peca pelo WhatsApp</p>
                  {/if}

                  <!-- Phone -->
                  {#if cardPhone}
                    <div style="margin: 0 0 4px; font-size: 12px; color: {t.footerText}; text-align: center; letter-spacing: 0.01em;">
                      ☎&#xFE0E;&nbsp;{cardPhone}
                    </div>
                  {/if}

                  <!-- Instagram -->
                  {#if cardInstagram}
                    <div style="margin: 0 0 4px; font-size: 12px; color: {t.footerText}; text-align: center; letter-spacing: 0.01em;">
                      &#9642;&nbsp;{cardInstagram.startsWith('@') ? cardInstagram : '@' + cardInstagram}
                    </div>
                  {/if}

                  <!-- Address -->
                  {#if cardAddress}
                    <div style="margin: 0; font-size: 11px; color: {t.footerText}; text-align: center; line-height: 1.5; letter-spacing: 0.01em;">
                      &#9679;&nbsp;{cardAddress}
                    </div>
                  {/if}
                </div>
              {/if}

            </div>
            <!-- end .cardapio-page -->

          {/each}

        </div>
      </div>
    </div>

  </div>
</div>
