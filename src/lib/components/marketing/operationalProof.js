export const PUBLISHED_MENUS_URL = 'https://menu.zelopdv.com.br/#empresas';

export const OPERATIONAL_PROOF_EVENTS = Object.freeze({
  previewed: 'marketing_proof_previewed',
  publishedMenus: 'marketing_published_menus_clicked',
  trial: 'marketing_trial_clicked',
});

export const OPERATIONAL_PROOF_SCREENS = Object.freeze([
  Object.freeze({
    key: 'financial',
    src: '/images/screenshots/financial-screen.png',
    srcset: '/images/screenshots/financial-screen-800.webp 800w, /images/screenshots/financial-screen-1600.webp 1600w',
    alt: 'Relatório financeiro do Zelo PDV com vendas, formas de pagamento e receita líquida.',
    label: 'Relatório financeiro',
  }),
  Object.freeze({
    key: 'dashboard',
    src: '/images/screenshots/dashboard-desktop.png',
    srcset: '/images/screenshots/dashboard-desktop-800.webp 800w, /images/screenshots/dashboard-desktop-1600.webp 1600w',
    alt: 'Frente de caixa do Zelo PDV com produtos e comanda.',
    label: 'Frente de caixa',
  }),
]);
