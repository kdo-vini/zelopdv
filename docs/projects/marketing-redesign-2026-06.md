# Marketing redesign — junho/2026

> Sprint de redesign das superfícies públicas do ZeloPDV, derivado do snapshot de critique de `2026-06-10`. Escopo: home, `/precificacao`, `/vs-planilha`, e os 2 templates compartilhados (`SegmentLandingPage`, `CompetitorComparison`) que dirigem 4 `/para-*` + 12 `/vs-*` páginas. Internal/produto fica para depois (sprint distinto).
>
> Este documento é o **brief entregável** — codex e claude alternam na execução; cada seção é auto-contida com `file:line` precisos. Não é necessário ler a conversa que gerou este doc.
>
> Refs canônicas: [PRODUCT.md](../../PRODUCT.md) · [DESIGN.md](../../DESIGN.md) · [DESIGN_PATTERNS.md](../DESIGN_PATTERNS.md) · [Critique snapshot](../../.impeccable/critique/2026-06-10T12-29-10Z__src-routes-page-svelte.md)

## Contexto em 60 segundos

O critique encontrou 7 issues nas superfícies públicas: escore atual **23/40** (acceptable, brand-register fraco). Os 5 padrões que produzem o "AI slop" estão centralizados em **dois componentes compartilhados** mais o hero da home. Editar esses 3 arquivos move 16 páginas de uma vez.

**Mapa do trabalho** (10 frentes, ordenadas):

1. **Shape — Home hero conversa Zelinho** (decisão de design ANTES do código)
2. **Shape — /vs-\* editorial-dossier** (decisão de arquitetura ANTES do código)
3. **Distill — eyebrow trope nos 2 templates**
4. **Quieter — home decoration cleanup**
5. **Clarify — voz operador-brasileiro (copy table)**
6. **Harden — MarketingPriceSection gradient + conic**
7. **Adapt — diferenciar os 3 hero archetypes**
8. **Audit — token drift + inline SVG cleanup**
9. **Polish — passada final**
10. **Re-critique — medir delta de escore**

Ordem de execução sugerida: **1 + 2 em paralelo** (decisões), depois **3 + 5 + 6 + 8 em paralelo** (mudanças seguras sem conflito de layout), depois **4 + 7** (mudanças estruturais que dependem das shapes), por fim **9 + 10**.

Tudo aqui assume as regras já documentadas em DESIGN.md (One Voice Rule, Three Layers Rule, Status-Only Rule, Eyebrow Exception Rule, Recessed Card Rule, Lifted Exception Rule, No-Resting-Shadow Rule, Tabular Rule, One Family Rule).

---

## 1. Shape · Home hero como conversa Zelinho

**Decisão.** O hero atual da home (`src/routes/+page.svelte:259-336`) é o ofensor mais visível do site (gradient text, animate-gradient, 8 ambient glows, 256px de padding antes do H1 no iPhone SE). A seção `Zelinho` (`:614-733`) é o **único trecho on-brand** da página inteira — voz de operador, dados reais, mockup útil. A jogada é **promover Zelinho a hero** e remover/demover o resto.

**O hero atual vira o que era a seção Zelinho.** A seção "Zelinho" original deixa de existir como fold separado.

### Composição (desktop)

```
┌────────────────────────────────────────────────────────────────┐
│  [SiteHeader: logo + 4 nav links + Entrar]                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   COLUMN 1 (60% width)             COLUMN 2 (40% width)        │
│                                                                │
│   <h1 text-4xl md:text-6xl>        ┌───────────────────────┐   │
│   Você pergunta.                   │ ⚡ Zelinho · lê seu   │   │
│   Ele responde com os              │    caixa em tempo real│   │
│   seus números.                    ├───────────────────────┤   │
│   </h1>                            │                       │   │
│                                    │   você ▸              │   │
│   <p subtitle>                     │   Quanto lucrei essa  │   │
│   Quanto lucrei essa semana?       │   semana?             │   │
│   Quais produtos venderam mais?    │                       │   │
│   O Zelinho responde a partir do   │   ◂ zelinho           │   │
│   seu próprio caixa.               │   Analisando…         │   │
│                                    │   • Vendas: R$ 3.847  │   │
│   [Testar 30 dias grátis →]        │   • Despesas: R$ 1.290│   │
│   Ver por dentro                   │   • Lucro real: R$    │   │
│                                    │     2.557             │   │
│   30 dias grátis. Sem cartão.      │                       │   │
│   Tem dúvida? Fala com a gente.    │   [Pergunte algo…]    │   │
│                                    └───────────────────────┘   │
│                                                                │
│             ↓ ONE soft sky glow só atrás do chat ↓            │
└────────────────────────────────────────────────────────────────┘
```

### Composição (mobile, ≤ md:)

Empilha — H1 + subtitle + CTA + trust line primeiro; chat mockup depois (a operador-vendo-celular vê a promessa antes do exemplo). NÃO renderiza dois CTAs lado-a-lado em mobile; o secundário é text-link.

### Decisões de design (committed)

- **Sem badge pill.** O chat à direita É o eyebrow visual.
- **H1 em voz de operador.** Pick canônico: *"Você pergunta. Ele responde com os seus números."* Alternativa: *"Pergunte sobre o seu caixa. Ele responde."* Decidir na execução; ambos passam.
- **Subtitle de 3 perguntas + 1 fechamento.** Substitui a bullet list de features da seção Zelinho original. Perguntas operador-real: *Quanto lucrei essa semana? · Quais produtos venderam mais? · Onde tô perdendo dinheiro?* (mesmas que já aparecem nas features).
- **UM CTA primário** (`/cadastro`, "Testar 30 dias grátis"). Secundário vira text-link âncora (`#por-dentro`, copy "Ver por dentro") — não pill button. Reduz ruído do hero.
- **Trust line** logo abaixo: *"30 dias grátis. Sem cartão, sem cobrança automática. Tem dúvida? Fala com a gente."* (o link "Falar com especialista" continua existindo; só some o tom "especialista").
- **Chat mockup é a única surface "lifted" no hero** (DESIGN.md Lifted Exception Rule). Recessed cards / glow / decoração ficam fora.
- **Background**: UMA soft sky glow `absolute w-[480px] h-[480px] bg-sky-500/15 blur-[80px] rounded-full` ATRÁS do chat — não atrás do hero inteiro. Nada mais.
- **Motion**: as mensagens do chat aparecem em stagger fade-in (user-bubble → "Analisando..." → números) durante os primeiros ~800ms. Respeita `prefers-reduced-motion: reduce` (crossfade ou aparição instantânea). Hero text usa `text-wrap: balance`.
- **A seção do dashboard mockup 3D** (atual `:297-336`) **NÃO desaparece** — vira a primeira seção depois do hero, com id `#por-dentro` (alvo do text-link secundário). Apenas perde o ghost-card shadow (`shadow-[0_0_0_1px_rgba(56,189,248,0.1),0_30px_80px_-10px_rgba(14,165,233,0.25)]` viola DESIGN.md ban).

### Acceptance criteria

1. No fold inicial do iPhone SE (375×667), o visitante vê: SiteHeader + H1 + 1ª linha do subtitle + 1ª mensagem do chat. Sem precisar scrollar para entender a oferta.
2. Zero classes `animate-gradient`, `animate-border-gradient`, `bg-clip-text bg-linear-to-r`, `from-amber-... via-pink-... to-purple-...` em `+page.svelte`.
3. Apenas UMA cor saturada visível no hero: sky-500. Sem emerald/purple/amber/rose em positions decorativas. (Os números "Lucro real: R$ 2.557" dentro do chat ficam green pq representam STATE — autorizado pela Status-Only Rule.)
4. O número de elementos `blur-[80–120px]` no fold inicial: **≤ 1** (era 2 no hero + 6 abaixo).
5. `prefers-reduced-motion: reduce` produz uma versão sem stagger, sem `animate-ping`, sem `animate-pulse` no fold inicial.

### Arquivos tocados

- `src/routes/+page.svelte` — reescreve o bloco do hero (`:259-336`), remove `animate-gradient` keyframes (`:1208-1215` aprox.), integra o chat mockup do bloco Zelinho atual (`:676-731`) como column 2.
- `src/lib/components/marketing/SiteHeader.svelte` — confirma que `topOffset` continua sendo aceito (Easter banner pode ser removido em Quieter; se for, ajustar default).

---

## 2. Shape · /vs-\* editorial-dossier

**Decisão.** Pivotear o cluster `/vs-*` para **registro editorial**. Hoje ele é um landing page comercial × 12, o que Riley do critique chamou de "templated SEO doorway". A jogada: cada `/vs-*` vira um **dossiê curto de comparação** que se lê como um pequeno artigo editorial, não como uma landing.

A diferença é estrutural, não cosmética. O cabeçalho passa a ser **uma frase de tese editorial**, não um hero com badge + CTA. As fontes ficam **visíveis no topo**, não escondidas no rodapé. O comparativo numérico vira o conteúdo principal. O CTA aparece **uma vez só**, no fim.

### Composição

```
┌────────────────────────────────────────────────────────────────┐
│  [SiteHeader]                                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   COMPARATIVO · Atualizado em jun/2026 · Fontes ↓              │
│                                                                │
│   <h1>Zelo PDV × Saipos</h1>                                   │
│                                                                │
│   <p editorial-thesis>                                         │
│   Saipos é um sistema PDV+ERP voltado pra operação de          │
│   delivery médio com integrações de marketplace. O Zelo PDV    │
│   serve quem precisa de PDV + gestão financeira básica sem     │
│   custo de implementação, e fica abaixo em features de         │
│   delivery integrado. Esta página compara o que cada um faz    │
│   melhor — não vende o Zelo a quem cabe melhor o Saipos.       │
│   </p>                                                         │
│                                                                │
│   [Ver comparativo →]   Falar com a gente                      │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│   Contexto do mercado (1-2 parágrafos)                         │
├────────────────────────────────────────────────────────────────┤
│   <Comparison table>      (mantém — está boa)                  │
├────────────────────────────────────────────────────────────────┤
│   Por que o Zelo (4 cards)  (mantém — Quieter remove o glow)   │
├────────────────────────────────────────────────────────────────┤
│   Sendo justo (mantém — kicker AUTORIZADO, voz de marca)       │
├────────────────────────────────────────────────────────────────┤
│   Preço — quieter version (NÃO renderiza MarketingPriceSection)│
│   "R$ 59/mês — plano único. Ver detalhes em /precificacao →"   │
├────────────────────────────────────────────────────────────────┤
│   FAQ                                                          │
├────────────────────────────────────────────────────────────────┤
│   Compare com outros sistemas (mantém — útil pra SEO)          │
├────────────────────────────────────────────────────────────────┤
│   Fontes (mantém — sai do rodapé pra um bloco visível e        │
│   linkado a partir do header editorial)                        │
└────────────────────────────────────────────────────────────────┘
```

### Decisões de design (committed)

- **Sem hero com badge + 2 CTAs.** O topo é uma faixa editorial de 3 elementos: label de meta ("Comparativo · Atualizado em jun/2026 · Fontes ↓" como pequena âncora) + H1 tipográfico + parágrafo de tese.
- **A "Price anchor card" é removida** (atual `CompetitorComparison.svelte:72-89`). O preço já está na tabela de comparação; mostrar a mesma informação 3× é o que produz a fadiga visual de Riley.
- **`<MarketingPriceSection />` (atual `:172`) é substituído** por um tile compacto: card recessed com 2 linhas (`R$ 59/mês — plano único` + link pra `/precificacao`). Sem conic border, sem checklist duplicada.
- **As Sources saem do final** (atual `:267-284`) **e ganham um link visível no header editorial** (`Fontes ↓` que faz scroll-anchor pra elas). Continuam no fim do documento, mas o leitor sabe que existem.
- **Eyebrow trope** removido em todas as seções (ver §3 — distill).
- **Final CTA** (`:198-227`) vira mais discreto: 1 CTA + a trust line, sem o rounded-4xl shadowed card. Editorial não termina com hard sell.

### Acceptance criteria

1. O visitante numa página `/vs-*` vê **primeiro** uma frase de tese sobre o que cada produto serve, não um botão "Testar grátis".
2. Em qualquer `/vs-*`, o preço R$ 59 aparece no máximo **2 vezes** (era 3): uma vez na tabela de comparação, uma vez no tile compacto final.
3. As fontes têm âncora visível no topo (`Fontes ↓` ou link textual igual).
4. Nenhum animate-border-gradient na página (era 1).
5. Cross-link "Compare com outros sistemas" (`:230-265`) continua existindo — bom para SEO interno.

### Arquivos tocados

- `src/lib/components/marketing/CompetitorComparison.svelte` — rewrite estrutural completo do hero (`:28-91`) e do bloco final price+CTA (`:172-225`).
- Eventualmente: novo `src/lib/data/competitorComparisons.js` ganha campo `editorialThesis: string` (1-3 frases). Adicionar para cada uma das 12 entradas no data file (`/home/vinicius/code/zelopdv/src/lib/data/competitorComparisons.js`). Pode ser sequencial, não bloqueia o restante.

---

## 3. Distill · eyebrow trope nos 2 templates

**Regra geral.** A classe `text-sm uppercase tracking-[0.25em] text-sky-300 mb-4` **NUNCA** aparece acima de uma section H2 a partir desta sprint. A Eyebrow Exception (DESIGN.md) reserva esse estilo para: (a) o breadcrumb acima do Title em produto, (b) form field labels. Em marketing, eyebrow só sobrevive quando **carrega informação real** (metadado de testemunho com nome + cidade, "Sendo justo" como kicker de voz de marca nomeado).

### Diffs precisos

#### `src/lib/components/marketing/SegmentLandingPage.svelte`

| Linha | Antes | Ação |
|---|---|---|
| 71 | `<p class="text-sm uppercase tracking-[0.2em] mb-3 text-sky-300">Zelo PDV</p>` (dentro de cada highlight card) | **DELETE** — o card já está visualmente atribuído ao Zelo PDV pelo container |
| 84 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Problema</p>` | **DELETE** |
| 97 | `<p class="text-xs uppercase tracking-[0.25em] mb-3" style="color: var(--text-muted);">{point.label}</p>` | **KEEP** — `{point.label}` carrega metadado real, não é scaffold |
| 108 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Funcionalidades</p>` | **DELETE** |
| 134 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Como funciona</p>` | **DELETE** |
| 160 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Depoimento</p>` | **REPLACE** com: `<p class="text-xs tracking-wide" style="color: var(--text-muted);">{page.testimonial.name} · {page.testimonial.business}, {page.testimonial.city}</p>` (move o nome pro TOPO do bloco, deixa só o crédito breve abaixo da quote) |
| 184 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">FAQ do segmento</p>` | **DELETE** |
| 210 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Teste gratuito</p>` | **DELETE** |

#### `src/lib/components/marketing/CompetitorComparison.svelte`

| Linha | Antes | Ação |
|---|---|---|
| 74 | `<p class="text-sm uppercase tracking-[0.2em] mb-6 text-sky-300">Comparação de preço</p>` | **DELETE** — bloco inteiro será removido em §2 (price anchor card sai) |
| 96 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Contexto</p>` | **DELETE** |
| 110 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Comparativo</p>` | **DELETE** |
| 145 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Por que o Zelo</p>` | **DELETE** |
| 165 | `<p class="text-sm uppercase tracking-[0.2em] mb-3 text-sky-300">Sendo justo</p>` | **KEEP** — "Sendo justo" é kicker nomeado, carrega voz de marca específica do ZeloPDV |
| 178 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Dúvidas comuns</p>` | **DELETE** |
| 202 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Teste gratuito</p>` | **DELETE** |
| 234 | `<p class="text-sm uppercase tracking-[0.25em] text-sky-300 mb-4">Outros comparativos</p>` | **DELETE** |

#### `src/routes/+page.svelte` (home — apenas eyebrows duplicados)

| Linha (aprox.) | Antes | Ação |
|---|---|---|
| 624 | "Inteligência Artificial para Pequenos Negócios" pill | Tratado em §5 (Clarify) — copy muda; eyebrow some quando a seção Zelinho vira hero |
| 880-895 (pricing eyebrow se houver) | Verificar; se existir eyebrow acima da seção de preço, **DELETE** | — |

### Acceptance criteria

1. `grep -rn "text-sm uppercase tracking-\[0\.25em\] text-sky-300 mb-4" src/` retorna **zero hits** depois do trabalho.
2. Os H2 das seções continuam carregando peso visual (já estão em `text-3xl md:text-4xl font-bold text-white`).
3. "Sendo justo" continua intacta no CompetitorComparison.

---

## 4. Quieter · home decoration cleanup

Removendo decoração que dilui sky-500 e adiciona ruído visual. Lista por região.

### Easter banner (`src/routes/+page.svelte:248-254`)

```svelte
<a href="/pascoa" class="fixed top-0 w-full z-60 bg-linear-to-r from-amber-500 via-pink-500 to-purple-600 py-2 px-4 text-center text-xs md:text-sm font-bold text-white tracking-wide shadow-[0_2px_20px_rgba(236,72,153,0.4)] flex items-center justify-center gap-2 hover:brightness-110 transition-all">
  <Sparkles class="size-4 shrink-0" aria-hidden="true" />
  <span>Páscoa em <strong>{daysUntilEaster} {daysUntilEaster === 1 ? 'dia' : 'dias'}</strong> — veja a oferta especial para doceiras e revendedores</span>
  <span class="hidden sm:inline-flex items-center gap-1 bg-white/20 px-2.5 py-0.5 rounded-full text-xs font-extrabold ml-1">Ver →</span>
</a>
```

**Substituir** por uma pill discreta que vive **dentro do SiteHeader** (não como overlay full-width):

```svelte
{#if daysUntilEaster > 0}
  <a href="/pascoa" class="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-300 text-xs font-medium hover:bg-sky-500/15 transition-colors">
    <Sparkles class="size-3.5" aria-hidden="true" />
    <span>Páscoa em {daysUntilEaster} {daysUntilEaster === 1 ? 'dia' : 'dias'}</span>
  </a>
{/if}
```

E remove o `topOffset={daysUntilEaster > 0 ? 'top-9' : 'top-0'}` do SiteHeader (linha 256 — não precisa mais empurrar nada). O `top-9` foi a causa do logo `h-32` colidir com o nav row no iPhone SE.

### Background glows do hero (`:261-262`)

```svelte
<div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-sky-600/20 rounded-full blur-[120px] -z-10 opacity-50 pointer-events-none"></div>
<div class="absolute bottom-0 right-0 w-[800px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] -z-10 pointer-events-none"></div>
```

**Substituir** por UMA soft glow atrás do chat mockup (§1):

```svelte
<div class="absolute right-0 top-1/3 w-[480px] h-[480px] bg-sky-500/15 rounded-full blur-[80px] -z-10 pointer-events-none"></div>
```

### Animate-gradient keyframes (final do `<style>`)

Localizar o bloco `@keyframes gradient` no `<style>` do `+page.svelte` (perto da linha 1209) **e a classe `.animate-gradient`**. **DELETE** ambos. Já não há `text-transparent bg-clip-text bg-linear-to-r ... animate-gradient` em uso depois das mudanças em §1 e §5.

### Animate-border-gradient (`+page.svelte:1186-1203`)

**DELETE** o bloco inteiro:

```css
.animate-border-gradient {
  position: relative;
  border: 1px solid transparent;
}
.animate-border-gradient::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  padding: 1px;
  background: conic-gradient(from var(--border-angle), transparent 20%, #0ea5e9 80%, transparent 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: border-rotate 4s linear infinite;
  pointer-events: none;
}
```

E o `@keyframes border-rotate` + `@property --border-angle` que o suportam. Idem em `MarketingPriceSection.svelte:75-112` (§6).

### Feature section ambient glows

Localizar e **deletar** os colored glows nas seções de feature do home:

- `:438` aprox `bg-emerald-500/20 blur-[80px]`
- `:478` aprox `bg-purple-500/20 blur-[80px]`
- `:513` aprox `bg-amber-500/20 blur-[80px]`
- `:568, 586` `bg-rose-500/20` / `bg-amber-500/20`
- `:677` `bg-sky-500/10 blur-[80px]` — **KEEP**, é a única sobrevivente autorizada (a glow atrás do chat mockup, que vira hero em §1)
- `:614-615` (Zelinho section background) `bg-linear-to-br from-sky-900/20 via-transparent to-indigo-900/20` + `w-[800px] h-[400px] bg-sky-600/10 blur-[120px]` — **DELETE** ambos (a seção Zelinho será re-coreografada como hero em §1; perde os backgrounds duplicados)

### Ghost-card shadow (mockup section)

Em `:300` aprox: `shadow-[0_0_0_1px_rgba(56,189,248,0.1),0_30px_80px_-10px_rgba(14,165,233,0.25)]` é o padrão "1px border + heavy box-shadow" banido. **Substituir** por:

```svelte
class="... border border-card overflow-hidden"
```

(border carries already; the shadow goes.)

### Acceptance criteria

1. Apenas UM `blur-[XYpx]` element fica no fold inicial do home (a sky glow atrás do chat).
2. O Easter banner tri-color não existe mais; a campanha vive em `/pascoa` (e, opcionalmente, uma pill discreta no SiteHeader durante a semana antes).
3. `grep -rn "animate-gradient\|animate-border-gradient" src/routes/+page.svelte src/lib/components/marketing/` retorna **zero**.
4. `npm run check` continua 0 errors.

---

## 5. Clarify · voz operador-brasileiro

Tabela de copy rewrites. Cada linha é uma mudança independente; codex pode executar em qualquer ordem.

### Home (`src/routes/+page.svelte`)

| Linha | Antes | Depois |
|---|---|---|
| 270 (badge eyebrow) | `Novo · IA que mostra seu lucro real` | (deletar — sem badge em §1) |
| 273-276 (H1) | `Sistema PDV simples <br/> para Lanchonetes` (com gradient span em "para Lanchonetes") | `Você pergunta. Ele responde com os seus números.` (sem gradient, sem br interno; balance text via CSS) |
| 278-280 (subtitle) | `Controle pedidos, estoque e caixa em segundos. Ideal para lanchonetes, hamburguerias e pequenos comércios.` | `Quanto lucrei essa semana? Quais produtos venderam mais? Onde tô perdendo dinheiro? O Zelinho responde a partir do seu próprio caixa.` |
| 283 (CTA primário) | `Testar 30 dias grátis` | KEEP |
| 286-288 (CTA secundário) | `Ver como funciona` pill | `Ver por dentro` text-link âncora `#por-dentro` |
| 290-294 (trust line) | `Sem cobranças durante os 30 dias. Cancele quando quiser.` + `Falar com especialista` | `30 dias grátis. Sem cartão, sem cobrança automática.` + `Tem dúvida? Fala com a gente.` (mantém o handler `openSupportChat`) |
| 624 (Zelinho badge eyebrow) | `Inteligência Artificial para Pequenos Negócios` | (deletar — eyebrow some quando a seção Zelinho vira hero em §1) |
| 626-629 (Zelinho H2 — só sobrevive se mantiver uma segunda seção sobre Zelinho; se a seção for absorvida pelo hero, deleta) | `Zelinho: O Primeiro Assistente de IA<br/>Focado no Lucro Real` (com gradient span em "Focado no Lucro Real") | (se mantiver) `Zelinho lê seu caixa e responde com os seus números.` (sem gradient, sem br) |
| 631-633 (Zelinho subtitle) | `Não é um chatbot genérico. O Zelinho lê suas vendas, despesas e estoque reais e responde com contexto do seu negócio.` | (se mantiver) `Não é chat genérico — ele lê seu caixa, suas despesas, seu estoque, e responde com os números que são seus.` |
| 684 (chat header subtitle) | `Parceiro IA · online` | `Lê seu caixa em tempo real` |
| 688 (chat header status) | `ativo` | `ativo` KEEP (ou: `lendo seu caixa`) |
| 669-672 (Zelinho CTA) | `Experimentar o Zelinho grátis` | KEEP (operador, OK) |
| Pricing section (aprox `:881-895` — se houver eyebrow ou subtítulo "Sem pegadinhas") | qualquer "Sem pegadinhas" / "Sem taxas extras de surpresa" | `Um preço. Sem letra miúda.` ou `Sem surpresa no fim do mês.` |

### MarketingPriceSection (`src/lib/components/marketing/MarketingPriceSection.svelte`)

| Linha | Antes | Depois |
|---|---|---|
| 8 (H2) | `Preço Único. Tudo Incluso.` | `Um preço. Tudo dentro.` |
| 9 (subtitle) | `Sem pegadinhas, sem taxas extras de surpresa.` | `Sem letra miúda. Sem surpresa no fim do mês.` |
| 18 (pill) | `Plano Único` | KEEP |
| 22 (above price) | `Acesso Completo` | KEEP |
| 30 (free trial title) | `30 Dias Grátis` | KEEP |
| 31 (free trial sub) | `Teste por 30 dias. Se não amar, não paga.` | `30 dias pra testar. Se não rolar, é só cancelar.` |
| 39 | `Vendas Ilimitadas` | KEEP |
| 45 | `Controle de Estoque e Fiado` | KEEP |
| 51 | `Gestão Financeira (Lucro)` | `Controle de lucro e despesa` |
| 57 | `Suporte via WhatsApp` | KEEP |
| 65 (CTA) | `Começar teste gratuito` | KEEP |
| 68 (trust line) | `Sem cartão de crédito necessário. Cancele quando quiser.` | `Sem cartão. Cancele a qualquer hora.` |

### SegmentLandingPage (`src/lib/components/marketing/SegmentLandingPage.svelte`)

| Linha | Antes | Depois |
|---|---|---|
| 61 (trust line) | `Sem instalar nada. Cancele quando quiser durante o teste.` | `30 dias grátis, sem instalar nada.` |
| 185 (FAQ H2) | `Dúvidas comuns antes de começar` | `Dúvidas que aparecem` |
| 186-188 (FAQ subtitle) | `Perguntas específicas da sua operação, junto com as dúvidas gerais mais comuns sobre o Zelo PDV.` | `As do seu segmento + as gerais. Se ficou uma de fora, manda.` |
| 211 (final CTA H2) | depende da data file `page.finalCtaTitle` | revisar caso a caso em `src/lib/data/segmentLandingPages.js`; padrão: trocar "Comece" por "Testa" |

### CompetitorComparison (`src/lib/components/marketing/CompetitorComparison.svelte`)

| Linha | Antes | Depois |
|---|---|---|
| 65 (trust line) | `Sem instalar nada. Cancele quando quiser durante o teste.` | `30 dias grátis, sem instalar nada.` |
| 111 (comparativo H2) | `Zelo PDV vs {comparison.competitor}, ponto a ponto` | `Zelo PDV × {comparison.competitor}, lado a lado` (× em vez de "vs", "lado a lado" em vez de "ponto a ponto") |
| 179 (FAQ H2) | `Zelo PDV vs {comparison.competitor}: o que perguntam` | `As perguntas mais comuns: Zelo PDV × {comparison.competitor}` |
| 235 (cross-link H2) | `Compare o Zelo PDV com outros sistemas` | KEEP |
| 236-238 (cross-link sub) | `Veja como o Zelo PDV se compara a outras opções do mercado, sempre com preço a partir de R$ 59/mês.` | `Mais 11 comparativos. Mesmo Zelo PDV, outros competidores.` |
| 280 (fontes disclaimer) | `Preços e informações de {comparison.competitor} foram coletados das fontes públicas acima em {comparison.priceCheckedAt} e podem ter mudado. Relatos de clientes citados são de terceiros (ex: Reclame Aqui). Marcas citadas pertencem aos respectivos titulares; esta página é um comparativo informativo.` | KEEP (jurídico) |

### `/vs-planilha` (`src/routes/vs-planilha/+page.svelte`)

| Linha | Antes | Depois |
|---|---|---|
| 153 (aprox) | `Funcionalidade por funcionalidade, sem enrolação` | `Funcionalidade por funcionalidade, lado a lado` |
| 197 (aprox) | `Sem enrolação` em outros lugares | substituir por `Sem firula` OU simplesmente deletar o adjetivo |

### Data files

- `src/lib/data/segmentLandingPages.js` — passada em todas as `heroBadge`, `subtitle`, `problemTitle`, `featuresIntro`, `howIntro`, `testimonial.note`, `finalCtaText`. Procurar e substituir: `solução`, `plataforma`, `integrada`, `360`, `gestão completa`, `produtividade`, `eficiência operacional`. Trocar por voz de operador (ex.: `solução completa` → `tudo o que precisa pra abrir o balcão`).
- `src/lib/data/competitorComparisons.js` — idem. Especialmente os campos `subtitle`, `introParagraphs`, `comparisonIntro`, `reasonsTitle`, `fairnessNote`, `finalCtaText`.

### Regra de revisão

Antes de aceitar qualquer copy nova, perguntar: **"O Marcos da lanchonete diria isso falando com o cliente dele?"** Se a resposta é "não, isso é coisa de palestra de SaaS / consultoria", reescreve.

### Acceptance criteria

1. `grep -rn "Sem pegadinhas\|Sem enrolação\|sem enrolação\|sem surpresa\|Inteligência Artificial para Pequenos\|Solução integrada\|Plataforma completa\|Gestão 360" src/` → zero hits.
2. Não há mais "vs" minúsculo entre marcas — só "×" ou "lado a lado".
3. A trust line do home + segment + competitor padroniza: `30 dias grátis. Sem cartão. [Fala com a gente]`.

---

## 6. Harden · MarketingPriceSection gradient + conic

Tornando o `MarketingPriceSection.svelte` DESIGN.md-compliant. Este componente é renderizado **17× no site** (home + 16 templated pages) — é o multiplicador de motion mais alto da superfície pública.

### Mudanças

#### 1. Deletar o glow externo animado (`:13`)

```svelte
<div class="absolute -inset-1 bg-linear-to-r from-sky-500 to-blue-600 rounded-2xl blur-sm opacity-30 animate-pulse"></div>
```

**DELETE** — não substituir por nada. A border sky + o shadow on-hover (abaixo) já carregam o destaque.

#### 2. Remover `animate-border-gradient` (`:15`)

```svelte
<div class="relative rounded-2xl p-8 md:p-12 shadow-2xl animate-border-gradient" style="background: var(--bg-card);">
```

**Substituir por** (status default + hover with documented Sky Lift shadow):

```svelte
<div class="relative rounded-2xl p-8 md:p-12 border-2 transition-shadow hover:shadow-[0_12px_24px_-8px_rgba(2,132,199,0.40)]"
     style="background: var(--bg-card); border-color: var(--primary);">
```

Note: `shadow-2xl` (large resting shadow) também sai — a Recessed Card Rule + No-Resting-Shadow Rule. O card recebe `border-2` em sky-500 que carrega o destaque sem motion.

#### 3. Deletar o `<style>` inteiro (`:75-112`)

```css
@keyframes border-rotate { ... }
@property --border-angle { ... }
.animate-border-gradient { ... }
.animate-border-gradient::before { ... }
@media (prefers-reduced-motion: reduce) { .animate-border-gradient::before { ... } }
```

**DELETE** todo o bloco. Não há mais necessidade.

#### 4. Check icons → sky em vez de emerald (`:35-58`)

A Status-Only Rule diz que green/red/amber não são decorativos. O check de "vai estar incluso" não é STATE; é AFIRMAÇÃO de marca. Trocar emerald → sky em todos os 4 itens da lista:

Antes:
```svelte
<div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
  <Check class="size-3.5" aria-hidden="true" />
</div>
```

Depois:
```svelte
<div class="w-5 h-5 rounded-full bg-sky-500/15 flex items-center justify-center text-sky-300">
  <Check class="size-3.5" aria-hidden="true" />
</div>
```

#### 5. CTA button shadow (`:63`)

```svelte
class="... shadow-lg shadow-sky-900/50 ..."
```

KEEP — `shadow-lg` (10px blur) está abaixo do ban-line de 16px+ box-shadow blur com 1px border na mesma elemento. OK.

### Reflexos em outros arquivos

O home (`+page.svelte`) tem o **MESMO padrão** de animate-border-gradient duplicado em `:1186-1203` (CSS) + uso ao redor da pricing card (procurar `animate-border-gradient` no markup, provavelmente `:893-895`). Idem: deletar a classe do markup, deletar o CSS, aplicar a mesma fix com `border-2 border-primary` + Sky Lift hover.

### Acceptance criteria

1. `grep -rn "animate-border-gradient\|conic-gradient\|border-rotate\|--border-angle" src/` → zero hits.
2. O pricing card tem border sky-500 estática, hover ativa Sky Lift (documented shadow do DESIGN.md), sem motion infinita.
3. As checkmarks são sky, não emerald. (Sky-only é a regra; status colors só pra state real.)
4. O componente continua renderizando idêntico em todas as 17 páginas.

---

## 7. Adapt · diferenciar os 3 hero archetypes

Depois que §1 e §2 definiram as decisões, este passo executa estruturalmente. Cada hero arquétipo tem uma identidade visual diferente; sameness no marketing é o slop.

### Home hero (`/` → `src/routes/+page.svelte`)

Implementação completa em §1. Resumo: conversação Zelinho, 2-col com chat à direita, sem badge, sem gradient, 1 sky glow, motion em stagger reduce-motion-safe.

### Segment hero (`SegmentLandingPage.svelte:25-79`)

**Antes**: 2-col grid `[1.1fr_0.9fr]`, left = badge+H1+subtitle+2 CTAs+trust, right = 3 highlight cards empilhados verticalmente (com eyebrow "Zelo PDV" em cada um — removido em §3).

**Depois**: pivota pra **assimétrico com weight no lado esquerdo**. Estrutura proposta:

```svelte
<section class="relative pt-32 pb-20 overflow-hidden border-b border-white/5">
  <div class="absolute right-0 top-1/4 w-[420px] h-[420px] bg-sky-500/15 rounded-full blur-[80px] -z-10 pointer-events-none"></div>

  <div class="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.4fr_1fr] gap-16 items-start">
    <div>
      <p class="text-sm font-semibold tracking-tight text-sky-300 mb-3">Para {page.segmentName}</p>

      <h1 class="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6" style="text-wrap: balance;">
        {page.h1}
      </h1>

      <p class="text-lg md:text-xl max-w-2xl leading-relaxed mb-10" style="color: var(--text-muted);">
        {page.subtitle}
      </p>

      <div class="flex flex-col sm:flex-row gap-4 items-start mb-5">
        <a href="/cadastro" class="px-8 py-4 text-white bg-sky-600 hover:bg-sky-500 rounded-full font-semibold transition-all hover:-translate-y-1 text-center">
          Testar 30 dias grátis
        </a>
        <a href="#features" class="px-4 py-4 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors text-center">
          Ver funcionalidades
        </a>
      </div>

      <p class="text-sm" style="color: var(--text-muted);">
        30 dias grátis, sem instalar nada.
        <button type="button" on:click={openSupportChat} class="ml-1 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4">
          Fala com a gente
        </button>
      </p>
    </div>

    <aside class="space-y-3">
      {#each page.highlights as highlight, i}
        <p class="text-lg leading-relaxed text-white" style="text-wrap: balance;">
          <span class="text-sky-400 font-bold mr-2">{String(i + 1).padStart(2, '0')}</span>
          {highlight}
        </p>
      {/each}
    </aside>
  </div>
</section>
```

Mudanças vs. antes:
- **Badge pill some.** Substituído por um pequeno `<p>` `Para {segmentName}` que carrega informação real.
- **Right column NÃO é mais 3 cards idênticos.** Agora é 3 frases curtas listadas, numeradas com os números em sky-bold. Sem cards = sem o "identical card grid" tell. Os números aqui são **uma sequência real** (3 highlights numerados), o que autoriza o uso (DESIGN.md Numbered Marker exception).
- **Glow único atrás da right column.**
- **CTA secundário vira text-link**, como no home.

### Competitor hero (`CompetitorComparison.svelte:28-91`)

**Antes**: 2-col grid com badge+H1+subtitle+2 CTAs à esquerda, price-anchor card à direita.

**Depois**: editorial-dossier opening por §2. Estrutura proposta:

```svelte
<section class="relative pt-32 pb-16 overflow-hidden border-b border-white/5">
  <div class="max-w-3xl mx-auto px-6">
    <p class="text-xs tracking-wider" style="color: var(--text-muted);">
      Comparativo · Atualizado em {comparison.priceCheckedAt} ·
      <a href="#fontes" class="text-sky-300 hover:text-sky-200 underline underline-offset-4">Fontes</a>
    </p>

    <h1 class="mt-4 text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight" style="text-wrap: balance;">
      Zelo PDV × {comparison.competitor}
    </h1>

    <p class="mt-6 text-lg md:text-xl leading-relaxed" style="color: var(--text-label);">
      {comparison.editorialThesis}
    </p>

    <div class="mt-10 flex flex-col sm:flex-row gap-4 items-start">
      <a href="#comparativo" class="px-6 py-3 rounded-full font-semibold border border-sky-500/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/15 transition-colors">
        Ver comparativo →
      </a>
      <a href="/cadastro" class="px-6 py-3 text-sky-300 hover:text-sky-200 font-semibold underline underline-offset-4 transition-colors">
        Testar Zelo PDV grátis
      </a>
    </div>
  </div>
</section>
```

Mudanças vs. antes:
- **Single column, centrada em `max-w-3xl`.** Não é landing comercial; é leitura editorial.
- **Header meta-line** com data + link visível pras fontes (resolve o Riley red flag).
- **H1 tipográfico** "Zelo PDV × {competitor}", sem gradient.
- **Tese editorial** (`comparison.editorialThesis` — campo novo no data file, ver §2) — uma frase que admite o que cada produto faz melhor.
- **Price anchor card sai.** O preço aparece na tabela e no tile final.
- **CTA primário invertido**: agora é "Ver comparativo →" (que ancora ao corpo do conteúdo). "Testar" vira secundário. Editorial não vende; deixa o conteúdo vender.

### Acceptance criteria

1. Os 3 heroes têm composição visualmente distinta: centered+chat (home), asymmetric 2-col com lista numerada (segment), single-col editorial (competitor).
2. Apenas o home tem o chat mockup como surface lifted.
3. Apenas o competitor tem um link "Fontes" visível no topo.
4. Apenas o segment usa numbered sequence (3 highlights) — não como decoration mas como uma lista real.

### Arquivos tocados

- `src/routes/+page.svelte` — implementação do home hero
- `src/lib/components/marketing/SegmentLandingPage.svelte` — re-estrutura do hero
- `src/lib/components/marketing/CompetitorComparison.svelte` — re-estrutura do hero
- `src/lib/data/competitorComparisons.js` — adicionar campo `editorialThesis: string` em cada uma das 12 entradas (texto operador)

---

## 8. Audit · token drift + inline SVG cleanup

Limpeza técnica. Tabela direta — codex pode atacar em sequência, cada linha é independente.

### Hex hardcoded → tokens

| File:line | Atual | Substituir |
|---|---|---|
| `src/routes/+page.svelte:302, 348` | `bg-[#0d1117]` (browser toolbar mockup) | `style="background: var(--bg-panel);"` |
| `src/routes/+page.svelte:315` | `bg-[#161b22]` | `style="background: var(--bg-card);"` |
| `src/routes/+page.svelte:325` | `from-[#0B0F19]/50` (gradient stop) | `style="background: linear-gradient(... , var(--bg-app) ... );"` ou refatorar pra Tailwind arbitrary com token CSS-var |
| `src/routes/+page.svelte:422, 440, 497, 515, 678, 895` | `bg-[#121620]` (×6) | `style="background: var(--bg-card);"` |
| `src/routes/+page.svelte:680, 724, 1045, 1140` | `bg-[#0B0F19]` (×4) | `style="background: var(--bg-app);"` |
| `src/routes/+page.svelte:1196` | `#0ea5e9` no conic-gradient CSS | **DELETE o bloco** (tratado em §4 + §6) |
| `src/routes/precificacao/+page.svelte:171-174` | `:root { --bg-app: #0b0f19; --bg-panel: #111827; --bg-card: #0f172a; }` (override local!) | **DELETE o bloco `:root {}` inteiro.** Comentário "Align with main landing page" é incorreto — usar tokens globais de `src/themes/base.css` (que são `#0F172A / #1E293B / #0B1220`). O home está divergente, não precificacao. Esta deleção uniformiza |
| `src/routes/vs-planilha/+page.svelte:137` | `bg-[#0B0F19] text-slate-300` | `style="background: var(--bg-app); color: var(--text-label);"` |

### Inline SVG → lucide-svelte

| File:linhas | Atual | Substituir |
|---|---|---|
| `src/routes/+page.svelte:757-799` (3 blocos de testemunho × 5 estrelas inline) | `<svg ... viewBox="0 0 20 20"><path d="M9.049 2.927...">` | `<Star class="size-4" fill="currentColor" aria-hidden="true" />` × 5. Adicionar `import { Star } from 'lucide-svelte';` no `<script>` |
| `src/routes/+page.svelte:641` (gráfico de barras) | inline SVG | `<BarChart3 />` |
| `src/routes/+page.svelte:651` (triângulo de alerta) | inline SVG | `<AlertTriangle />` |
| `src/routes/+page.svelte:661` (bulb/sugestão) | inline SVG | `<Lightbulb />` |
| `src/routes/+page.svelte:671` (seta direita CTA) | inline SVG | `<ArrowRight />` |
| `src/routes/+page.svelte:727` (botão enviar do chat) | inline SVG | `<SendHorizontal />` |
| `src/routes/+page.svelte:569, 579, 587, 597, 605` | inline SVGs (provável: chart/box/wallet/etc) | identificar cada um e substituir conforme tabela de mapeamento de `docs/DESIGN_PATTERNS.md` (seção 12) |
| `src/routes/+page.svelte:1096, 1106, 1116, 1126, 1144` | inline SVGs (FAQ chevrons?) | provavelmente `<ChevronDown />` |

### Outros pequenos

- `src/routes/+page.svelte:684, 688` — confirmar que a animação `animate-ping` + `animate-pulse` no chat header status é reduce-motion-safe (precisa de `@media (prefers-reduced-motion: reduce) { animation: none !important; }` nas duas classes ou trocar pra um `bg-emerald-400` estático).
- `src/lib/components/marketing/MarketingFooter.svelte` — re-revisar. Foi alinhada à canonical recentemente; spot-check pra hex hardcoded e copy "Sem enrolação"-style.

### Acceptance criteria

1. `grep -rn "bg-\[#0\|bg-\[#1\|from-\[#0\|to-\[#0\|to-\[#1" src/routes/ src/lib/` → zero ou apenas hits **fora** dos arquivos públicos cobertos aqui.
2. `grep -rn '<svg.*viewBox="0 0' src/routes/+page.svelte src/lib/components/marketing/` → zero hits.
3. `npm run check` continua 0 errors (provável que diminuam warnings de a11y pois lucide componentes têm `aria-hidden` correto).
4. `src/routes/precificacao/+page.svelte` não tem `:root {}` override.

---

## 9. Polish · passada final

Depois que §1-8 estiverem aplicadas, antes do re-critique:

1. **Build sanity**:
   ```bash
   npm run check  # esperar 0 errors
   npm run build  # esperar sucesso
   ```
2. **Walk manual** das superfícies:
   - `/` — novo hero Zelinho-conversation, sem Easter banner global, glow único atrás do chat
   - `/para-delivery` — hero asymmetric + lista numerada, sem badge pill, sem eyebrows nas seções
   - `/para-mei`, `/para-hamburguerias`, `/para-lanchonetes` — confirmação que a mudança propagou via template
   - `/vs-saipos` — editorial-dossier com tese, Fontes linkado no topo, sem badge, sem price-anchor card
   - `/vs-bling`, `/vs-omie`, `/vs-conta-azul` etc. — propagação do template
   - `/precificacao` — não mudou estrutura, só perdeu o `:root` override
   - `/vs-planilha` — copy operador, sem "sem enrolação"
   - `/blog` — não tocada; sanity-check que continua editorial-light (é a exceção light documentada)
3. **iPhone SE viewport (375×667)**:
   - Hero do `/` cabe no fold com H1 + 1ª linha + chat header visíveis (sem scroll pra entender a oferta)
   - SiteHeader sem o `top-9` push
   - Nenhum elemento estourando horizontalmente
4. **Reduced motion**:
   - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`
   - Chat mockup aparece sem stagger
   - Sem `animate-ping`, `animate-pulse`, `animate-gradient`, `animate-border-gradient` rodando
5. **Performance smoke**:
   - Lighthouse na home: LCP < 2.5s, CLS < 0.05 (deveria melhorar pq removemos blur layers pesados)
   - `prefers-reduced-data` opcional; não bloqueia
6. **Update docs/CURRENT.md**:
   - Adicionar entrada na "Mudanças recentes visíveis no histórico Git" mencionando o redesign + linkar este brief
   - Marcar a sprint como concluída

### Acceptance criteria

1. `npm run check` 0 errors, contagem de warnings ≤ ao snapshot anterior
2. `npm run build` sucesso
3. Manual walk passa em todas as superfícies listadas
4. iPhone SE viewport não tem overflow nem hero quebrado
5. Reduced-motion experience é estática

---

## 10. Re-critique · medir o delta

```bash
$impeccable critique src/routes/+page.svelte
```

Escore previsto: **32-36/40** (era 23/40).

Subidas esperadas:
- **#2 Match with brand register**: 1 → 3 (voz + gradient + glows resolvidos)
- **#4 Consistency**: 2 → 3 (3 archetypes distinguíveis, templates limpos)
- **#7 Flexibility**: 2 → 3 (CTAs reduzidos, hierarquia mais clara)
- **#8 Aesthetic and Minimalist**: 1 → 3 (1 glow vs 8, 0 gradient vs 2, 0 conic vs 2)
- **#9 Visual hierarchy**: 2 → 3 (sem gradient text fighting H1, balance applied)

Se algum heurística **não subiu** o esperado, abrir issue específica e iterar pontualmente (não refazer a sprint inteira).

Comparação automática:

```bash
node .agents/skills/impeccable/scripts/critique-storage.mjs trend src-routes-page-svelte 5
```

Deve mostrar: `23 → XX` (com XX ≥ 32).

---

## Apêndice

### Refs

- **PRODUCT.md** — `/home/vinicius/code/zelopdv/PRODUCT.md`. Voz "warm Brazilian operador", 4 anti-references (legacy BR ERPs, generic SaaS, loud fintech, bland enterprise).
- **DESIGN.md** — `/home/vinicius/code/zelopdv/DESIGN.md`. Named rules invocadas neste brief: One Voice Rule, Three Layers Rule, Status-Only Rule, Eyebrow Exception Rule, Recessed Card Rule, Lifted Exception Rule, No-Resting-Shadow Rule, Tabular Rule, One Family Rule.
- **DESIGN_PATTERNS.md** — `/home/vinicius/code/zelopdv/docs/DESIGN_PATTERNS.md`. Mapeamento técnico (icon table seção 12, components shadcn seção 11).
- **Critique snapshot** — `/home/vinicius/code/zelopdv/.impeccable/critique/2026-06-10T12-29-10Z__src-routes-page-svelte.md`. Inclui evidência completa, persona red flags, sameness map. Re-rodar após esta sprint pra medir delta.

### Convenções de execução

- **Codex e Claude alternam** na execução. Cada seção é auto-contida; commits podem ser feitos por seção.
- **Ordem de commit sugerida** (pra facilitar review):
  1. `feat(marketing): tokenize hex + replace inline SVG (audit)` — §8
  2. `refactor(marketing): remove eyebrow trope from 2 templates (distill)` — §3
  3. `feat(marketing): operador voice rewrites (clarify)` — §5
  4. `refactor(marketing): static border + sky checks on price section (harden)` — §6
  5. `refactor(home): quieter background + remove gradient/conic (quieter)` — §4
  6. `feat(home): Zelinho conversation hero` — §1
  7. `feat(vs): editorial-dossier architecture` — §2
  8. `feat(marketing): differentiate 3 hero archetypes (adapt)` — §7
  9. `chore(marketing): polish pass + update CURRENT` — §9
- **Não fazer um commit gigante** ("redesign marketing"). Risk de revert/conflito altíssimo.

### Fora de escopo (sprint distinto depois)

- Rotas internas (`/app`, `/gestao`, `/relatorios`, `/perfil`, `/assinatura`) — o usuário sinalizou que vamos "verificar inside" em uma sprint separada.
- Blog (`/blog`) — light editorial, padrão documentado e funcionando.
- Páginas legais (`/termos`, `/privacidade`) — sem prioridade.
- `/zelo-impressao`, `/downloads`, `/landing` — verificar individualmente se entram em sprint futuro.
