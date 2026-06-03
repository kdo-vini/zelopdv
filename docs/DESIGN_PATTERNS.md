# DESIGN_PATTERNS — Referência de UI do ZeloPDV

> **Leitura obrigatória antes de qualquer mudança de UI.** Se for criar/editar
> tela, componente, cabeçalho, botão, card ou navegação, confira aqui primeiro e
> reutilize o padrão existente em vez de inventar um novo.
>
> Hub: [[HOME]] · Instruções: [[CLAUDE]] · Estado atual: [[CURRENT]] · Riscos: [[CODE_REVIEW]]

Este doc reflete os padrões **reais** do código (não um ideal). Quando um padrão
mudar de propósito, atualize aqui e aponte o novo arquivo canônico.

---

## 0. Princípios

- **Nunca hardcode hex em componente.** Use variáveis de tema (`var(--primary)`,
  `var(--text-main)`…). Classes utilitárias Tailwind do palette slate/sky são
  toleradas nas telas internas (`text-slate-100`, `bg-slate-800/50`), mas cor de
  marca/estado sempre via token.
- **Reutilize, não recrie.** Sidebar, back-link, toasts, confirm, spinner já
  existem. Importe.
- **Tema escuro único** (navy/slate + acento sky). Sem light mode.
- **JSON-LD em Svelte** usa `{@html}` (ver [[CLAUDE]]).
- Depois de mexer em UI relevante: atualizar [[CURRENT]] e, se aplicável,
  [[FIXES_PROGRESS]].

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

> O `var(--primary-text)` existe em base.css — botões primários dentro do app
> renderizam com texto branco corretamente. Páginas marketing podem sobrescrever
> `--bg-*` no wrapper (ex.: `.page-shell` em `/precificacao`); os tokens cascateiam
> para componentes filhos.

---

## 2. Shell / layout — quem mostra header x sidebar

- O **root layout** (`src/routes/+layout.svelte`) decide a chrome por rota via
  `hasSidebarLayout` (~linha 64). Rotas nessa lista **escondem** o header/footer
  do topo e usam sidebar própria; as demais usam o header horizontal público.
- **Toda área autenticada com sidebar** precisa estar registrada lá. Hoje:
  `isGestaoPrefixed || isApp || isRelatorios || isPerfil || isAssinatura || isFerramentas`.
  Também registre em `protectedPaths` (redirect de assinatura) e no
  `isProtectedArea` (tracking de ads).
- O layout da seção (`src/routes/gestao/+layout.svelte`, `src/routes/ferramentas/+layout.svelte`)
  faz: `ensureActiveSubscription` → `<GestaoSidebar/>` + `<main class="flex-1 overflow-y-auto p-6 pt-16 md:p-8">` + `AssistantChat` + `InAppSupportChat`.

> ⚠️ Esquecer de registrar a rota em `hasSidebarLayout` faz aparecer **header do
> topo + sidebar ao mesmo tempo** (bug real já visto em `/ferramentas`).

**Sidebar:** `src/lib/components/GestaoSidebar.svelte`. Os itens vivem em `navGroups`
(grupos: Vendas, Gestão, Financeiro, Outros). Item ativo via `isActive(href, path)`
(exato para `/app` e `/gestao`, senão prefixo). Para adicionar um item, edite `navGroups`.

---

## 3. Cabeçalho de página / breadcrumb  ⭐ padrão de qualidade

Toda página interna abre com um cabeçalho que dá **contexto + navegação**.

### 3a. Breadcrumb + título (telas de gestão)
Padrão canônico — **todas as páginas de gestão devem usar exatamente isto** (`pessoas/+page.svelte:~65`):

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

- **Nunca use `text-2xl`, `font-semibold`, `color: var(--text-main)` ou `font-family` inline no h1.** Isso quebra a consistência entre páginas.
- **Nunca use classes CSS locais** (`.title`, `.hub-title`, `.pageTitle`) para o h1 — use o Tailwind inline acima.
- **Nunca use `style="color: var(--text-muted)"`** no breadcrumb — use `text-slate-500`.
- Metadado/ação opcional à direita (contagem, botão "Atualizar" etc.) dentro do container.
- Páginas com subtítulo descritivo podem adicionar `<p class="text-sm text-slate-400 mt-1">` após o h1, mas nunca no lugar do padrão acima.

### 3b. Back link (sub-páginas de um hub, ex.: ferramentas)
Quando a página é filha de um hub (`/ferramentas/*`), use o componente
**`src/lib/components/ui/BackLink.svelte`** no topo do header — clicável, leva ao pai.
O h1 usa as mesmas classes do padrão 3a:

```svelte
<script>
  import BackLink from "$lib/components/ui/BackLink.svelte";
</script>

    <BackLink href="/ferramentas" label="Ferramentas" />
<h1 class="text-xl font-bold text-slate-100 tracking-tight mt-1">Precificação</h1>
```

Usado em `/ferramentas/precificacao` e `/ferramentas/cardapio`. O BackLink substitui
o breadcrumb `<p>` — não combine os dois. Não duplique o markup do link; use o componente.

---

## 4. Botões — `src/app.css:63-103`

| Classe | Uso |
| --- | --- |
| `.btn-primary` | ação principal (fundo `--primary`, texto `--primary-text`) |
| `.btn-secondary` | secundária/ghost (suporta `aria-pressed`/`.selected`) |
| `.btn-danger` | destrutiva (vermelho) |
| `.icon-btn` / `.icon-btn-danger` | botões de ícone 34px (ver `gestao/mesas`) |
| `.action-primary` / `.action-ghost` | ações inline de formulário (ver `gestao/pessoas`) |

Botão de ferramenta/CTA com pílula arredondada: ver `PricingCalculator.svelte`
(`.primary-button`/`.ghost-button`, `border-radius: 999px`).

---

## 5. Cards / painéis

Container padrão das telas internas:

```svelte
<div class="bg-slate-800/50 border border-slate-700/60 rounded-xl p-5 h-fit"> … </div>
```

Variante com token (mesas): `background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 16px;`.
Card "clicável inteiro" (hub de ferramentas): ver `/ferramentas/+page.svelte` (`.tool-card`, hover sobe 2px + borda `--primary`).

---

## 6. Checkbox

**Classe canônica:** `themed-checkbox` — definida globalmente em `src/app.css`.

```svelte
<label class="flex items-center gap-2 cursor-pointer select-none text-sm" style="color: var(--text-label);">
  <input class="themed-checkbox" type="checkbox" bind:checked={valor} />
  <span>Rótulo da opção</span>
</label>
```

- Usa `appearance: none` + `::after` (checkmark rotacionado), fundo `--bg-card`, borda `--border-strong`.
- Checked: fundo `--primary`, borda `--primary`, glow com `color-mix`.
- Hover: borda `--primary`. Focus: ring `--primary` sem outline.
- Variante compacta para contextos densos: adicione `compact` (width/height 1rem, sem margin-top). Ex.: `class="themed-checkbox compact"`.
- **Nunca use** `style="accent-color: var(--primary);"` — isso só colore o checkbox nativo; não substitui o padrão.
- **Não use** para toggle-switch (ver `/gestao/mesas` — padrão `.switch-row` próprio para inputs escondidos com thumb visual).
- A classe `checkbox-custom` em `/gestao/acessos` é específica daquele contexto de permissões (varia cor conforme estado ativo/inativo) — não copie para outros usos.

## 6b. Campos de formulário — `gestao/pessoas/+page.svelte:~212`

```svelte
<label class="block">
  <span class="field-label">Nome</span>
  <input class="field-input" bind:value={form.nome} placeholder="Nome completo" />
</label>
```

- `.field-label`: `text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500`.
- `.field-input`: `w-full px-3 py-2 rounded-lg bg-slate-900/60 border-slate-600/60 focus:ring-1 focus:ring-sky-500`.
- Cabeçalho de coluna de tabela: `.col-header` (mesma tipografia do label).

---

## 7. Modais / diálogos

- **Confirmação:** use o store global — `src/lib/components/ConfirmDialog.svelte`
  (já montado no root). Não crie confirm próprio.
- **Modal custom:** padrão overlay + scale. `.modal-overlay` (`fixed inset-0 bg-black/60 backdrop-blur z-100`)
  + `.modal` (`var(--bg-card)`, `border-radius: 14px`, `max-width: 460px`). Ref: `gestao/mesas/+page.svelte:~677`.

---

## 8. Feedback

- **Toasts:** `addToast(msg, 'success'|'error'|'warning'|'info')` → `ToastContainer.svelte`
  (fixo bottom-right). Já montado no root.
- **Spinner:** `gestao/+layout.svelte:~29`:
  ```svelte
  <div class="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
       style="border-color: var(--primary); border-top-color: transparent;"
       role="status" aria-label="…"></div>
  ```
- **Empty state:** card pontilhado centralizado (`border: 1px dashed var(--border-subtle)`, ícone 56px, título + descrição). Ref: `gestao/mesas`.

---

## 9. Responsivo / mobile

- Breakpoint principal: `md` (Tailwind). Sidebar vira off-canvas com hambúrguer
  (`GestaoSidebar.svelte:~282`, overlay `bg-black/50 z-[55]`, `aside` `fixed md:static`).
- Header público tem menu mobile próprio (`+layout.svelte:~586`).
- Grids de tool/cards: `grid-template-columns` 1 → 2 (`sm`) → 3 (`lg`).

---

## 10. Checklist antes de mexer em UI

1. A cor que vou usar tem token em `base.css`? (não hardcode hex)
2. Já existe componente pra isso? (`BackLink`, `ConfirmDialog`, `ToastContainer`, `GestaoSidebar`…)
3. Se é rota nova com sidebar: registrei em `hasSidebarLayout` + `protectedPaths`?
4. A página tem cabeçalho com **título e caminho de volta** (seção 3)?
5. Botões/campos/cards usam as classes canônicas (seções 4–6)?
6. Rodei `npm run check` (0 erros) e olhei no navegador?
