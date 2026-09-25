// Paleta ZeloPDV (copiada de src/themes/base.css) — valores fixos porque este
// projeto Remotion e isolado do app SvelteKit e nao importa CSS do app.
export const colors = {
  bgApp: '#0F172A',
  bgCard: '#0b1220',
  marketingDark: '#020815',
  marketingDarkSoft: '#050E1F',
  marketingDarkPanel: '#07172E',
  marketingDarkBorder: 'rgba(121, 176, 255, 0.18)',
  marketingMuted: '#B8C7DE',
  marketingAction: '#0369A1',
  marketingInk: '#0F2B46',
  textMain: '#F8FAFC',
  textMuted: '#94A3B8',
  primary: '#0EA5E9',
  primaryHover: '#0284C7',
  success: '#10b981',
  warning: '#f59e0b',
  borderSubtle: '#334155',
  borderCard: '#1f2937',
};

// Mesma pilha de fontes usada na landing (src/routes/+page.svelte linha 652 /
// font-sans do Tailwind) — sem Google Font custom, entao usamos o stack de
// sistema para renderizar identico ao que o Chromium desta maquina mostra.
export const fontFamily =
  "'Segoe UI', ui-sans-serif, system-ui, -apple-system, sans-serif";
