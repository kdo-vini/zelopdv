# DESIGN_PATTERNS — Referência de UI do ZeloPDV

> **Leitura obrigatória antes de qualquer mudança de UI.** Se for criar/editar
> tela, componente, cabeçalho, botão, card ou navegação, confira aqui primeiro e
> reutilize o padrão existente em vez de inventar um novo.
>
> Hub: [[HOME]] · Instruções: [[CLAUDE]] · Estado atual: [[CURRENT]] · Riscos: [[CODE_REVIEW]]

Este doc reflete os padrões **reais** do código (não um ideal). Quando um padrão
mudar de propósito, atualize aqui e aponte o novo arquivo canônico.

> Para o app separado `admin-dashboard/`, use também [docs/admin/DESIGN_PATTERNS.md](/home/vinicius/code/zelopdv/docs/admin/DESIGN_PATTERNS.md:1).

---

## 0. Princípios

- **Nunca hardcode hex em componente.** Use variáveis de tema (`var(--primary)`, `var(--text-main)`…). Classes Tailwind do palette slate/sky são toleradas nas telas internas, mas cor de marca/estado sempre via token.
- **Reutilize, não recrie.** Sidebar, back-link, toasts, confirm, spinner, botões, selects, ícones — tudo já existe. Importe.
- **Tema escuro único** (navy/slate + acento sky). Sem light mode.
- **JSON-LD em Svelte** usa `{@html}` (ver [[CLAUDE]]).
- **`cn()` para classes condicionais** — nunca template literal ternário. Importar de `$lib/utils`.
- **Ícones via `lucide-svelte`** — nunca SVG inline (ver seção 12).
- Depois de mexer em UI relevante: atualizar [[CURRENT]] e, se aplicável, [[FIXES_PROGRESS]].

---

## 1. Tokens de tema — `src/themes/base.css`

Fonte única de cor. Resumo (ver arquivo para a lista completa):

| Grupo | Tokens |
| --- | --- |
| Fundo | `--bg-app` `--bg-panel` `--bg-card` `--bg-input` `--bg-sidebar` `--bg-header` |
| Texto | `--text-main` `--text-muted` `--text-label` `--text-inverse` |
| Primário | `--primary` `--primary-hover` `--primary-text` |
| Acento/links | `--accent` `--accent-light` `--link` `--link-hover` |
| Bordas | `--border-subtle` `--border-strong` `--border-card` |
| Status | `--success` `--error` `--warning` + `--status-{success,error,warning}-{bg,border,text}` |
| Sidebar | `--sidebar-item-active-bg` `--sidebar-item-active-text` `--sidebar-item-hover-bg` |
| Transições | `--transition-fast` (200ms) `--transition-normal` (300ms) |

Os tokens shadcn (`--background`, `--foreground`, `--primary`…) são mapeados para os mesmos valores em `src/app.css` e expostos como utilities Tailwind (`bg-primary`, `text-muted-foreground`…). Código legado usa `--bg-card`, `--primary` etc. diretamente — ambos convivem.

---

## 2. Shell / layout — quem mostra header x sidebar

- O **root layout** (`src/routes/+layout.svelte`) decide a chrome por rota via `hasSidebarLayout` (~linha 64). Rotas nessa lista **escondem** o header/footer do topo e usam sidebar própria; as demais usam o header horizontal público.
- **Toda área autenticada com sidebar** precisa estar registrada lá. Hoje: `isGestaoPrefixed || isApp || isRelatorios || isPerfil || isAssinatura || isFerramentas`. Também registre em `protectedPaths` (redirect de assinatura) e no `isProtectedArea` (tracking de ads).
- O layout da seção (`src/routes/gestao/+layout.svelte`, `src/routes/ferramentas/+layout.svelte`) faz: `ensureActiveSubscription` → `<GestaoSidebar/>` + `<main>` + `AssistantChat` + `InAppSupportChat`.

> ⚠️ Esquecer de registrar a rota em `hasSidebarLayout` faz aparecer **header do topo + sidebar ao mesmo tempo** (bug real já visto em `/ferramentas`).

**Sidebar:** `src/lib/components/GestaoSidebar.svelte`. Os itens vivem em `navGroups` (grupos: Vendas, Gestão, Financeiro, Outros). Ícones dos itens usam `lucide-svelte` via `svelte:component`. Para adicionar um item, edite `navGroups` e importe o ícone correspondente.

---

## 3. Cabeçalho de página / breadcrumb  ⭐ padrão de qualidade

Toda página interna abre com um cabeçalho que dá **contexto + navegação**.

### 3a. Breadcrumb + título (telas de gestão)
Padrão canônico — **todas as páginas de gestão devem usar exatamente isto**:

```svelte
<div class="mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4">
  <div>
    <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">
      Gestão / Cadastros
    </p>
    <h1 class="text-xl font-bold text-slate-100 tracking-tight">Pessoas</h1>
  </div>
  <span class="text-xs text-slate-500 tabular-nums">{pessoas.length} registros</span>
</div>
```

**Tipografia obrigatória — não variar:**

| Elemento | Classes Tailwind |
| --- | --- |
| Breadcrumb `<p>` | `text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1` |
| Título `<h1>` | `text-xl font-bold text-slate-100 tracking-tight` |
| Container | `mb-6 flex items-end justify-between border-b border-slate-700/60 pb-4` |

- **Nunca use `text-2xl`, `font-semibold`, `color: var(--text-main)` ou `font-family` inline no h1.**
- **Nunca use classes CSS locais** (`.title`, `.hub-title`, `.pageTitle`) para o h1 — use o Tailwind inline acima.
- Metadado/ação opcional à direita dentro do container.

### 3b. Back link (sub-páginas de um hub, ex.: ferramentas)

```svelte
<script>
  import BackLink from "$lib/components/ui/BackLink.svelte";
</script>

<BackLink href="/ferramentas" label="Ferramentas" />
<h1 class="text-xl font-bold text-slate-100 tracking-tight mt-1">Precificação</h1>
```

O BackLink substitui o breadcrumb `<p>` — não combine os dois.

### 3c. Páginas públicas / landing pages externas

As rotas públicas (`/`, `/para-*`, `/vs-*`, `/precificacao`, `/extensoes`, blog etc.) seguem
um padrão diferente das telas internas. Para novas páginas externas, a referência canônica é:

- `src/lib/components/marketing/SiteHeader.svelte`
- `src/lib/components/marketing/MarketingFooter.svelte`
- `src/lib/components/marketing/SegmentLandingPage.svelte`
- `src/lib/components/marketing/MarketingPriceSection.svelte`
- `src/routes/+page.svelte` como referência visual da home, **não** como markup para copiar inteiro

**Regra prática:** se o padrão já foi extraído para `src/lib/components/marketing/*`, use o componente.
Não duplique a estrutura crua da home em nova rota.

### 3d. Shell público — header, footer e container

Wrapper base das páginas externas:

```svelte
<div
  class="min-h-screen overflow-x-hidden font-sans selection:bg-sky-500/30 selection:text-white"
  style="background: var(--bg-app); color: var(--text-label);"
>
  <SiteHeader />
  <main>…</main>
  <MarketingFooter />
</div>
```

- **Header público:** sempre reutilizar `SiteHeader`. Ele já resolve âncoras da home (`#features`, `#pricing`, `#faq`) quando a rota atual não é `/`.
- **Footer público:** sempre reutilizar `MarketingFooter`. O visual canônico é o rodapé atual da home, encapsulado nesse componente. Ele também precisa resolver âncoras para `/#features`, `/#pricing` e `/#faq` quando a rota atual não é `/`.
- **Container horizontal padrão:** `max-w-7xl mx-auto px-6`.
- **Ritmo vertical padrão:** seções com `py-24`; hero com `pt-32`.
- **Seções são bandas full-width**, não cards soltos flutuando na página inteira.

### 3e. Hero da landing

Padrão base vindo da home e das segment pages:

```svelte
<section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
  <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-center">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium mb-8">
        <span class="inline-flex w-2 h-2 rounded-full bg-sky-400"></span>
        Badge curta
      </div>

      <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
        Título direto com foco no segmento/oferta
      </h1>

      <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-10" style="color: var(--text-muted);">
        Subtítulo curto, operacional e específico.
      </p>

      <div class="flex flex-col sm:flex-row gap-4 mb-5">
        <a href="/cadastro" class="w-full sm:w-auto px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold shadow-xl shadow-sky-900/30 transition-all hover:-translate-y-1 text-center">
          Testar 14 dias grátis
        </a>
        <a href="#features" class="w-full sm:w-auto px-8 py-4 rounded-full font-semibold border border-white/10 bg-white/5 hover:bg-white/10 text-center transition-all hover:text-white" style="color: var(--text-label);">
          Ver como funciona
        </a>
      </div>
    </div>
  </div>
</section>
```

- **Eyebrow/badge**: pill pequena com borda sky, fundo sky translúcido e texto uppercase/compacto.
- **H1**: promessa literal; sem headline genérica de marketing.
- **CTA primário**: quase sempre `/cadastro`.
- **CTA secundário**: âncora para prova/funcionalidades, não outro funil concorrente.
- **Linha de confiança abaixo do CTA**: texto curto (`Sem instalar nada`, `Cancele quando quiser`) + link para suporte/chat quando fizer sentido.

### 3f. Composição das seções públicas

As páginas externas do ZeloPDV usam uma cadência estável. A ordem mais comum é:

1. Hero
2. Problema / contexto
3. Funcionalidades
4. Como funciona
5. Prova (depoimento ou highlights)
6. Preço
7. FAQ
8. CTA final

Padrões de seção:

- **Alternância de fundo:** base `var(--bg-app)` e seções destacadas em `var(--bg-panel)` ou `bg-white/2`.
- **Separação:** `border-b border-white/5` entre bandas.
- **Cabeçalho de seção:** label curta em uppercase + `tracking-[0.25em]` + título `text-3xl md:text-4xl` + parágrafo introdutório em `var(--text-muted)`.
- **Layout:** grid de 2 colunas para problema/feature; grid de 3 colunas para steps; `max-w-3xl` ou `max-w-4xl` quando o foco é leitura.

Exemplo de cabeçalho canônico de seção pública:

```svelte
<div class="max-w-3xl mb-14">
  <p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Funcionalidades</p>
  <h2 class="text-3xl md:text-4xl font-bold text-white mb-6">Título da seção</h2>
  <p class="text-lg leading-relaxed" style="color: var(--text-muted);">
    Introdução curta da seção.
  </p>
</div>
```

### 3g. Cards de marketing

Diferente das telas internas, as páginas externas usam cards maiores e mais respirados:

- **Card padrão de marketing:** `rounded-3xl border p-6` ou `p-7`
- **Card de destaque/depoimento/CTA:** `rounded-4xl border p-8 md:p-10` ou `p-10 md:p-14`
- **Fundo e borda:** `background: var(--bg-card)` + `border-color: var(--border-card)`
- **Hover:** leve elevação visual, nunca animação agressiva

Exemplo:

```svelte
<article class="rounded-3xl border p-7" style="background: var(--bg-card); border-color: var(--border-card);">
  <h3 class="text-2xl font-semibold text-white mb-3">Título</h3>
  <p class="leading-relaxed" style="color: var(--text-muted);">Descrição.</p>
</article>
```

### 3h. FAQ público

FAQ de página externa usa `details/summary` simples, sem componente custom por enquanto:

```svelte
<details class="group rounded-2xl border transition-all duration-300" style="background: var(--bg-card); border-color: var(--border-card);">
  <summary class="flex items-center justify-between cursor-pointer p-6 font-medium text-white select-none gap-4">
    <span>Pergunta</span>
  </summary>
  <div class="px-6 pb-6 leading-relaxed" style="color: var(--text-muted);">
    Resposta.
  </div>
</details>
```

- Use `max-w-4xl mx-auto px-6` ou `max-w-3xl` na seção.
- Perguntas objetivas, com foco em objeção real de compra/uso.

### 3i. Precificação e CTA final

- **Preço:** reutilizar `MarketingPriceSection.svelte` sempre que o bloco for o plano principal padrão.
- **CTA final:** card centralizado com `rounded-4xl`, texto curto e repetição do CTA principal + CTA secundário.
- **Add-ons/extensões:** quando a página falar de módulos extras, seguir o padrão de cards da home/extensões; plano base continua destacado primeiro.

### 3j. Regras específicas para novas rotas externas

- Preferir componentes compartilhados de marketing antes de criar markup novo.
- Se a página for uma landing de segmento, usar `SegmentLandingPage.svelte` com dados em `src/lib/data/segmentLandingPages.js`.
- Não levar padrões visuais de gestão (`breadcrumb`, header interno, cards compactos, sidebar) para páginas públicas.
- A home ainda tem trechos legados com hex inline e SVG inline; **não replique isso em código novo**. Em novas páginas, seguir este doc: tokens de tema + `lucide-svelte`.

---

## 4. Botões

### 4a. Código novo — componente `Button` (shadcn-svelte)

```svelte
<script>
  import { Button } from '$lib/components/ui/button/index.js';
  import { Trash2 } from 'lucide-svelte';
</script>

<Button>Salvar</Button>
<Button variant="destructive">Excluir</Button>
<Button variant="outline" size="sm">Cancelar</Button>
<Button size="icon"><Trash2 /></Button>
```

| `variant` | Uso |
| --- | --- |
| `default` | ação principal (fundo `--primary` = sky-500) |
| `secondary` | ação secundária |
| `destructive` | destrutiva (vermelho) |
| `outline` | ghost com borda |
| `ghost` | transparente |
| `link` | estilo link |

| `size` | Dimensão |
| --- | --- |
| `default` | h-8 |
| `sm` / `lg` | h-7 / h-9 |
| `icon` / `icon-sm` / `icon-lg` | quadrado (size-8/7/9) |

### 4b. Código legado — classes CSS (manter; não retrofitar hotspots)

| Classe | Uso |
| --- | --- |
| `.btn-primary` | ação principal |
| `.btn-secondary` | secundária/ghost |
| `.btn-danger` | destrutiva |
| `.icon-btn` / `.icon-btn-danger` | botões de ícone 34px |
| `.action-primary` / `.action-ghost` | ações inline de formulário |

---

## 5. Cards / painéis

```svelte
<div class="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 h-fit"> … </div>
```

Variante com token (mesas): `background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px;`.
Card clicável (hub de ferramentas): `.tool-card`, hover sobe 2px + borda `--primary`.

---

## 6. Formulários

### 6a. Checkbox

**Classe canônica:** `themed-checkbox` — definida globalmente em `src/app.css`.

```svelte
<label class="flex items-center gap-2 cursor-pointer select-none text-sm" style="color: var(--text-label);">
  <input class="themed-checkbox" type="checkbox" bind:checked={valor} />
  <span>Rótulo da opção</span>
</label>
```

- Variante compacta para contextos densos: `class="themed-checkbox compact"`.
- **Nunca use** `style="accent-color: var(--primary);"`.
- `checkbox-custom` em `/gestao/acessos` é específica daquele contexto — não copie.

### 6b. Campos de texto

```svelte
<label class="block">
  <span class="field-label">Nome</span>
  <input class="field-input" bind:value={form.nome} placeholder="Nome completo" />
</label>
```

- `.field-label`: `text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500`.
- `.field-input`: `w-full px-3 py-2 rounded-lg bg-slate-900/60 border-slate-600/60 focus:ring-1 focus:ring-sky-500`.
- Cabeçalho de coluna de tabela: `.col-header` (mesma tipografia do label).

### 6c. Select — componente shadcn-svelte (código novo)

Ver **seção 13** para API e exemplos. Não use `<select>` nativo em páginas novas.

---

## 7. Modais / diálogos

- **Confirmação:** `confirmAction(title, message)` de `$lib/stores/ui` — retorna `Promise<boolean>`. Usa `AlertDialog` (bits-ui) internamente, com focus trap e dismiss via Escape.
- **Modal custom:** padrão overlay + scale. `.modal-overlay` (`fixed inset-0 bg-black/60 backdrop-blur z-100`) + `.modal` (`var(--bg-card)`, `border-radius: 14px`, `max-width: 460px`). Ref: `gestao/mesas/+page.svelte`.

---

## 8. Feedback

- **Toasts:** `addToast(msg, 'success'|'error'|'warning'|'info')` de `$lib/stores/ui` — wrapper sobre `svelte-sonner`, já montado no root como `<Toaster />`. Em código novo, pode usar `toast.success(msg)` etc. de `svelte-sonner` diretamente.
- **Spinner:** `<Spinner />` de `$lib/components/ui/Spinner.svelte`. Props: `size` (sm/md/lg, padrão md), `label` (aria-label).
- **Empty state:** card pontilhado centralizado (`border: 1px dashed var(--border-subtle)`, ícone 56px, título + descrição). Ref: `gestao/mesas`.

---

## 9. Responsivo / mobile

- Breakpoint principal: `md` (Tailwind). Sidebar vira off-canvas com hambúrguer (overlay `bg-black/50 z-[55]`, `aside` `fixed md:static`).
- Header público tem menu mobile próprio (`+layout.svelte`).
- Grids de tool/cards: `grid-template-columns` 1 → 2 (`sm`) → 3 (`lg`).

---

## 10. Checklist antes de mexer em UI

1. A cor que vou usar tem token em `base.css`? (não hardcode hex)
2. Já existe componente pra isso? (`Button`, `Spinner`, `BackLink`, `ConfirmDialog`, `GestaoSidebar`…)
3. Se é rota nova com sidebar: registrei em `hasSidebarLayout` + `protectedPaths`?
4. Se é tela interna: a página tem cabeçalho com **título e caminho de volta** (seção 3)?
5. Se é página pública: usei `SiteHeader` + `MarketingFooter` + hero/CTA dentro do padrão de landing?
6. Botões usam `Button` do shadcn (código novo) ou classes CSS legadas (código existente)?
7. Ícones usam `lucide-svelte`? (seção 12 — não SVG inline)
8. Selects usam `Select` do shadcn? (seção 13 — não `<select>` nativo)
9. Usei `cn()` de `$lib/utils` para classes condicionais?
10. Rodei `npm run check` (0 erros) e olhei no navegador?

---

## 11. shadcn-svelte — componentes instalados

Adicionar novos componentes: `npx shadcn-svelte@latest add <componente>` na raiz do projeto (requer `components.json`).

### Componentes ativos

| Componente | Caminho | Substitui |
|---|---|---|
| `AlertDialog` | `$lib/components/ui/alert-dialog/` | `ConfirmDialog` legado (mantém API `confirmAction()`) |
| `Button` | `$lib/components/ui/button/` | `.btn-primary` / `.btn-danger` etc. em código novo |
| `Select` | `$lib/components/ui/select/` | `<select>` nativo em código novo |
| `Separator` | `$lib/components/ui/separator/` | `<hr>` ou `border-t` decorativos |
| `Spinner` | `$lib/components/ui/Spinner.svelte` | `div.animate-spin` inline |
| `Toaster` | montado no root layout | `ToastContainer.svelte` (removido) |

### Infraestrutura

| Artefato | Caminho | Papel |
|---|---|---|
| `components.json` | raiz do projeto | config do CLI |
| `bits-ui` | node_modules | primitivos Svelte 5 (acessibilidade, focus, keyboard) |
| `lucide-svelte` | node_modules | biblioteca de ícones |
| `clsx` + `tailwind-merge` | node_modules | base do `cn()` |
| `svelte-sonner` | node_modules | engine dos toasts |
| `cn()` | `src/lib/utils.js` | merge de classes sem conflito |
| Tokens shadcn | `src/app.css` (bloco final) | mapeados para paleta ZeloPDV |
| `@theme inline` | `src/app.css` | expõe tokens como utilities (`bg-primary`, `text-muted-foreground`…) |

### Regras de uso

- **Dimensões quadradas**: `size-*` — não `w-* h-*`.
- **Espaçamento**: `gap-*` — nunca `space-x-*` / `space-y-*`.
- **Cores em componentes shadcn**: tokens semânticos (`bg-primary`, `text-muted-foreground`) — nunca `bg-sky-500` direto.
- **Dialog/AlertDialog**: sempre incluir `Title` (usar `class="sr-only"` se visualmente oculto).
- **Hotspots**: não retrofitar `mesas/[id]`, `app/+page`, `relatorios`, `produtos`, `assinatura`. Migração gradual.

### Mapeamento de tokens ZeloPDV ↔ shadcn

| Token shadcn | Equivalente ZeloPDV | Valor |
|---|---|---|
| `--background` | `--bg-app` | `#0F172A` |
| `--foreground` | `--text-main` | `#F8FAFC` |
| `--card` | `--bg-card` | `#0b1220` |
| `--primary` | `--primary` | `#0EA5E9` (sky-500) |
| `--muted-foreground` | `--text-muted` | `#94A3B8` |
| `--destructive` | `--error` | `#EF4444` |
| `--border` | `--border-subtle` | `#334155` |

### Tailwind v4 — notas

- `tailwind.config.js` removido; config em `src/app.css` (CSS-first).
- `@apply` em `<style>` de componente Svelte precisa de `@reference "tailwindcss";` na primeira linha.
- `@custom-variant dark (&:is(.dark *))` — dark mode ativo quando há `.dark` em algum ancestral.

---

## 12. Ícones — `lucide-svelte`

**Regra:** nunca SVG inline. Sempre importar de `lucide-svelte`.

```svelte
<script>
  import { Trash2, Pencil, Plus, X, Check } from 'lucide-svelte';
</script>

<!-- Ícone standalone -->
<Trash2 class="size-4" aria-hidden="true" />

<!-- Ícone em Button shadcn -->
<Button size="icon"><Trash2 /></Button>

<!-- Ícone em botão legado -->
<button class="icon-btn"><Pencil class="size-4" aria-hidden="true" /></button>
```

- **Dimensão padrão:** `size-4` (16px) inline, `size-5` (20px) em sidebar/avatares.
- **Dentro de componentes shadcn** (Button, etc.): não adicione classes de tamanho — o componente lida com isso.
- **Acessibilidade:** `aria-hidden="true"` quando o ícone é puramente decorativo e o contexto já tem texto/label.
- `stroke-width` padrão do lucide é 2 — se precisar de 1.5 (para paridade com Heroicons), passe como prop: `<Icon stroke-width={1.5} />`.

### Mapeamento Heroicons → Lucide (ícones usados no projeto)

| Uso | Lucide |
|---|---|
| fechar / X | `X` |
| lixeira | `Trash2` |
| editar | `Pencil` |
| adicionar | `Plus` |
| enviar | `SendHorizontal` |
| check simples | `Check` |
| check com círculo | `CheckCircle2` |
| círculo vazio | `Circle` |
| menu hambúrguer | `Menu` |
| seta direita | `ChevronRight` |
| seta esquerda | `ChevronLeft` |
| seta baixo | `ChevronDown` |
| home | `Home` |
| tabela/grade | `Table2` |
| lista de tarefas | `ListChecks` |
| layout grade | `LayoutGrid` |
| sacola | `ShoppingBag` |
| usuários | `Users` |
| usuário único | `User` |
| caixas/estoque | `Boxes` |
| gráfico barra | `BarChart3` |
| ferramenta | `Wrench` |
| seta externa | `ArrowUpRight` |
| configurações | `Settings` |
| cadeado | `Lock` |
| ajuda | `HelpCircle` |
| raio/zap | `Zap` |
| carteira | `Wallet` |
| peça/extensão | `Puzzle` |
| chef/cardápio | `ChefHat` |
| livro | `BookOpen` |
| recibo | `Receipt` |
| IA/brilho | `Sparkles` |
| logout | `LogOut` |

---

## 13. Select — componente shadcn-svelte

**Regra:** não usar `<select>` nativo em páginas novas. Usar o componente abaixo.

```svelte
<script>
  import * as Select from '$lib/components/ui/select/index.js';

  let tipo = 'cliente';
  const opcoes = [
    { value: 'cliente', label: 'Cliente' },
    { value: 'funcionario', label: 'Funcionário' },
  ];
  const label = $derived(opcoes.find(o => o.value === tipo)?.label ?? 'Selecione...');
</script>

<Select.Root bind:value={tipo}>
  <Select.Trigger>
    {label}
  </Select.Trigger>
  <Select.Content>
    {#each opcoes as op}
      <Select.Item value={op.value} label={op.label} />
    {/each}
  </Select.Content>
</Select.Root>
```

- `bind:value` funciona igual ao `<select>` nativo.
- O `Select.Trigger` exibe o rótulo do item selecionado — calcule via `$derived` ou `$:`.
- Para opções estáticas simples, passe `label` e `value` diretamente no `Select.Item`.
- Adicione `class="field-input"` no `Select.Trigger` para manter a aparência dos campos do formulário de gestão.
- **Opção vazia (filtro):** `<Select.Item value="" label="Todas as categorias" />` — funciona com `bind:value=""`.

Exemplo já em uso: `gestao/pessoas`, `gestao/despesas`, `gestao/empresas`.
