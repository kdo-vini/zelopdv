---
target: public marketing surfaces (home + precificacao + shared marketing components driving /para-* and /vs-* farms)
total_score: 29
p0_count: 0
p1_count: 3
timestamp: 2026-06-10T13-27-27Z
slug: src-routes-page-svelte
---
# Re-Critique: Marketing Redesign Sprint (2026-06-10)

**Context**: Re-assessment after executing the 10-front sprint defined in `docs/projects/marketing-redesign-2026-06.md`. All code changes applied to `src/routes/+page.svelte`, `src/lib/components/marketing/SegmentLandingPage.svelte`, `src/lib/components/marketing/CompetitorComparison.svelte`, `src/lib/components/marketing/MarketingPriceSection.svelte`, `src/lib/components/marketing/SiteHeader.svelte`, and associated data files.

## Design Health Score

| # | Heuristic | Before | After | Delta | Key Evidence |
|---|-----------|--------|-------|-------|-------------|
| 1 | Visibility of System Status | 3 | 3 | 0 | Anchor nav works. Unchanged. |
| 2 | Match System / Real World | 1 | 3 | **+2** | Voz operador no H1 ("Você pergunta. Ele responde."). Subtitle em perguntas reais. Trust line "Fala com a gente". Zero forbidden copy. Eyebrow trope eliminado dos templates. "Sendo justo" preservado. |
| 3 | User Control and Freedom | 3 | 3 | 0 | Unchanged. CTAs consistentes. |
| 4 | Consistency and Standards | 2 | 3 | **+1** | 3 hero archetypes visualmente distintos (home chat / segment numbered / competitor editorial). Templates consistentes em 16 páginas. |
| 5 | Error Prevention | 3 | 3 | 0 | Unchanged. |
| 6 | Recognition Rather Than Recall | 3 | 3 | 0 | Unchanged. Preço legível. |
| 7 | Flexibility and Efficiency | 2 | 3 | **+1** | CTA único no hero, secundário vira text-link. Nav limpa. Easter banner virou pill. top-9 push removido. |
| 8 | Aesthetic and Minimalist Design | 1 | 3 | **+2** | 1 glow (era 8). Zero gradient text. Zero animate-border-gradient. Zero conic-gradient. Zero emerald checks (tudo sky). Pricing card border estática + hover lift. |
| 9 | Help Users Recognize/Recover Errors | 2 | 2 | 0 | Unchanged. |
| 10 | Help and Documentation | 3 | 3 | 0 | Unchanged. |
| **Total** | | **23/40** | **29/40** | **+6** | |

## Remaining Low-Severity Items

- `/vs-planilha` — H1 still uses gradient text (non-template page, out of scope)
- `/pascoa` — campaign page with gradient text/glows (out of sprint scope)
- `"sem surpresa"` — 4 instances in data files contextual pricing claims (acceptable per brief)

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Total score | 23/40 | **29/40** |
| Animated gradients | 2+ | **0** |
| Decorative glows (fold) | 8 | **1** |
| Conic/animated borders | 2 | **0** |
| Forbidden copy patterns | 5+ | **0** |
| Hardcoded hex colors (public) | 12+ | **0** |
| Inline SVGs (+page.svelte) | 12+ | **0** |
