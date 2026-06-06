# ADMIN DASHBOARD — Design Patterns

> Referência viva para `admin-dashboard/`.
> Baseado nas preferências já alinhadas em implementação real.

## 1. Direção visual

- O admin deve ser **operacional, denso e quieto**.
- Evitar blocos explicativos duplicados, cards de instrução e texto de apoio quando a própria ação já está clara.
- Preferir superfícies compactas, com ações aparecendo no contexto exato em que são úteis.
- Elementos destrutivos devem chamar atenção pelo suficiente, sem virar o ponto focal da página inteira.
- Em ações óbvias e recorrentes, preferir botão de ícone em vez de texto + ícone. Ex.: lápis para editar, `X` ou lixeira para excluir.
- No admin, usar sempre Heroicons para ações e navegação.

## 2. Checkboxes

- Usar o padrão canônico `themed-checkbox` do produto, também no admin.
- Em contextos densos de tabela, usar `themed-checkbox compact`.
- Não usar checkbox nativo com `accent-color` nem versões improvisadas com utilitários soltos.
- A checkbox-mãe de tabelas deve:
  - selecionar apenas os itens realmente elegíveis na página visível;
  - refletir `checked` quando todos os itens elegíveis estiverem selecionados;
  - usar estado `indeterminate` quando houver seleção parcial.

## 3. Ações em lote

- Não usar cards grandes de orientação como "Seleção em lote" quando a interface já comunica isso.
- Mostrar ações em lote apenas quando houver itens selecionados.
- O layout preferido é:
  - contador curto de selecionados;
  - ação destrutiva compacta;
  - sem botão redundante de limpar seleção, a menos que a tela realmente precise.
- Ações destrutivas em lote devem ficar restritas ao conjunto seguro da tela. Exemplo atual em `/users`: apenas contas inativas sem assinatura.

## 4. Tabelas do admin

- Tabelas devem priorizar leitura rápida e ação.
- Evitar avatares decorativos quando o espaço pode virar controle útil.
- Quando uma coluna de seleção existir, ela substitui elementos visuais de baixo valor operacional.
- Feedback visual de linha selecionada deve ser sutil, sem competir com badges de status.

## 5. Copy e economia de interface

- Se a ação já está contextualizada pelo filtro ativo, não repetir a instrução em outro bloco.
- Preferir rótulos curtos:
  - `Excluir selecionados`
  - `Atualizar`
  - `Exportar PDF`
- Evitar microcopy explicando o óbvio em áreas recorrentes do admin.

## 6. Aplicação imediata

Padrões já aplicados em `admin-dashboard/src/routes/users/+page.svelte`:

- checkbox canônico do ZeloPDV;
- seleção em lote sem card explicativo;
- botão destrutivo mais contido;
- header checkbox sincronizada com seleção total/parcial.

## 8. Tailwind v4

O admin migrou de Tailwind v3 → v4 junto com o app principal.

- `@import 'tailwindcss'` substitui as diretivas `@tailwind base/components/utilities`
- `postcss.config.js` usa `@tailwindcss/postcss` (não mais `tailwindcss: {}`)
- `tailwind.config.js` foi removido; configuração vive em `src/app.css`
- `@apply` em `<style>` de componente precisa de `@reference "tailwindcss";` na primeira linha

## 9. shadcn-svelte no admin

O admin roda Svelte 4, que **não é compatível** com `shadcn-svelte@latest` (requer Svelte 5).

Estratégia atual:
- O admin usa os padrões visuais do ZeloPDV (checkboxes, botões, tabelas) documentados nas seções acima.
- Componentes auxiliares como `cn()` podem ser copiados/importados do app principal quando necessário.
- Quando o admin for migrado para Svelte 5, instalar `shadcn-svelte@latest` e adotar os padrões da seção 11 do [DESIGN_PATTERNS.md principal](../DESIGN_PATTERNS.md).

**Não instalar** `shadcn-svelte@0.x` (Svelte 4 legacy) — o admin não tem volume de telas que justifique a dívida de migração posterior.

## 7. Comunicação

- A aba `/communications` deve seguir o mesmo princípio operacional do resto do admin: lista de destinatários à esquerda e composer à direita, sem cards de instrução.
- A lista deve permitir seleção em lote no mesmo contexto da busca, sem abrir modal ou tela secundária para montar audiência.
- Placeholders devem ser inseridos por chips clicáveis no contexto do campo em foco.
- O modo de envio deve usar controle segmentado compacto, não tabs pesadas nem blocos separados.
- Filtros de origem do produto devem ser objetivos e operacionais. Estado atual:
  - `ZeloPDV`
  - `ZeloChat`
  - `Ambos`
- O CTA principal de envio pode ter texto porque a ação muda conforme o canal ativo; fora isso, manter a interface econômica.
- Mostrar o número de saída do WhatsApp apenas como dado auxiliar curto, sem transformar isso em banner ou bloco explicativo.
