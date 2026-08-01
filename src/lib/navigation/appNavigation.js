import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  ChefHat,
  CircleUserRound,
  Ellipsis,
  HelpCircle,
  LayoutGrid,
  ListChecks,
  LogOut,
  Package,
  Puzzle,
  Radar,
  Receipt,
  ShoppingBag,
  Table2,
  User,
  Users,
  Wallet,
  Wrench,
} from 'lucide-svelte';

/**
 * Fonte unica da navegacao autenticada. Desktop e mobile consomem as mesmas
 * rotas, icones, permissoes e flags de modulo; somente a apresentacao muda.
 */
export const appNavigationSections = [
  {
    id: 'pdv',
    label: 'PDV',
    desktopLabel: 'Vendas',
    icon: ShoppingBag,
    matchRoutes: ['/app'],
    items: [
      {
        id: 'frente-caixa',
        href: '/app',
        label: 'Frente de Caixa',
        requiredPermission: 'pdv.acessar',
        icon: ShoppingBag,
      },
      {
        id: 'mesas',
        href: '/app/mesas',
        label: 'Mesas',
        requiresAddon: 'mesas',
        requiredPermission: 'mesas.acessar',
        icon: Table2,
      },
      {
        id: 'pedidos',
        href: '/app/pedidos',
        label: 'Pedidos',
        requiresAddon: 'orderingReview',
        // O prefixo `pedidos.*` e legado persistido em access_roles.
        requiredPermission: 'pedidos.acessar',
        icon: ListChecks,
      },
      {
        id: 'cozinha',
        href: '/app/pedidos/cozinha',
        label: 'Cozinha',
        requiresAddon: 'kitchenQueue',
        requiredPermission: 'pedidos.cozinha',
        icon: ChefHat,
      },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    desktopLabel: 'Gestão',
    icon: LayoutGrid,
    matchRoutes: ['/gestao'],
    items: [
      { id: 'dashboard', href: '/gestao', label: 'Dashboard', icon: LayoutGrid },
      {
        id: 'zelinho-gerente',
        href: '/gestao/gerente',
        label: 'Zelinho Gerente',
        icon: Radar,
        badge: 'gerente',
      },
      {
        id: 'produtos',
        href: '/gestao/produtos',
        label: 'Produtos',
        requiredPermission: 'produtos.visualizar',
        icon: Package,
      },
      {
        id: 'pessoas',
        href: '/gestao/pessoas',
        label: 'Pessoas',
        requiredPermission: 'pessoas.visualizar',
        icon: Users,
      },
      {
        id: 'estoque',
        href: '/gestao/estoque',
        label: 'Estoque',
        requiredPermission: 'estoque.visualizar',
        icon: Boxes,
      },
      {
        id: 'cadastro-mesas',
        href: '/gestao/mesas',
        label: 'Cadastro de Mesas',
        requiresAddon: 'mesas',
        requiredPermission: 'mesas.acessar',
        icon: Table2,
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    desktopLabel: 'Financeiro',
    icon: Wallet,
    matchRoutes: ['/gestao/caixa', '/gestao/fichario', '/gestao/despesas', '/relatorios'],
    items: [
      {
        id: 'fechar-caixa',
        href: '/gestao/caixa',
        label: 'Fechar Caixa',
        requiredPermission: 'caixa.ver',
        icon: Wallet,
      },
      {
        id: 'fichario',
        href: '/gestao/fichario',
        label: 'Fichário (Fiado)',
        requiredPermission: 'fiado.visualizar',
        icon: BookOpen,
      },
      {
        id: 'despesas',
        href: '/gestao/despesas',
        label: 'Despesas',
        requiredPermission: 'despesas.visualizar',
        icon: Receipt,
      },
      {
        id: 'relatorios',
        href: '/relatorios',
        label: 'Relatórios',
        requiredPermission: 'relatorios.ver',
        icon: BarChart3,
      },
    ],
  },
  {
    id: 'outros',
    label: 'Outros',
    desktopLabel: 'Outros',
    icon: Ellipsis,
    matchRoutes: ['/ferramentas', '/gestao/indicacoes', '/gestao/extensoes', '/gestao/acessos'],
    items: [
      { id: 'ferramentas', href: '/ferramentas', label: 'Ferramentas', icon: Wrench },
      {
        id: 'indicacoes',
        href: '/gestao/indicacoes',
        label: 'Indicações',
        adminOnly: true,
        icon: ArrowUpRight,
      },
      {
        id: 'extensoes',
        href: '/gestao/extensoes',
        label: 'Extensões',
        adminOnly: true,
        icon: Puzzle,
      },
      {
        id: 'acessos',
        href: '/gestao/acessos',
        label: 'Acessos',
        requiresAddon: 'acessos',
        adminOnly: true,
        icon: Users,
      },
      { id: 'suporte', label: 'Suporte', action: 'support', icon: HelpCircle },
    ],
  },
  {
    id: 'perfil',
    label: 'Perfil',
    desktopLabel: 'Perfil',
    icon: CircleUserRound,
    matchRoutes: ['/perfil', '/assinatura'],
    items: [
      { id: 'meu-perfil', href: '/perfil', label: 'Meu Perfil', icon: User },
      { id: 'sair', label: 'Sair', action: 'logout', destructive: true, icon: LogOut },
    ],
  },
];

const routeItems = appNavigationSections.flatMap((section) =>
  section.items.filter((item) => item.href).map((item) => ({ ...item, sectionId: section.id }))
);

function matchesRoute(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function matchesItemRoute(pathname, href) {
  if (href === '/app' || href === '/gestao') return pathname === href;
  return matchesRoute(pathname, href);
}

export function getActiveNavigationItem(pathname) {
  return routeItems
    .filter((item) => matchesItemRoute(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0] || null;
}

export function isNavigationItemActive(item, pathname) {
  if (!item?.href) return false;
  return getActiveNavigationItem(pathname)?.id === item.id;
}

export function getActiveNavigationSectionId(pathname) {
  const activeItem = getActiveNavigationItem(pathname);
  if (activeItem) return activeItem.sectionId;

  const sectionMatch = appNavigationSections
    .flatMap((section) => section.matchRoutes.map((href) => ({ sectionId: section.id, href })))
    .filter(({ href }) => matchesRoute(pathname, href))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return sectionMatch?.sectionId || null;
}

export function shouldShowNavigationItem(item, context) {
  const {
    accessLoaded = false,
    addonFlags = {},
    isSubUser = false,
    permissions = {},
  } = context || {};

  const gatedByAccess = item.adminOnly || item.requiredPermission;
  if (gatedByAccess && !accessLoaded) return false;
  if (item.requiresAddon && !addonFlags[item.requiresAddon]) return false;
  if (isSubUser && item.adminOnly) return false;
  if (isSubUser && item.requiredPermission) return permissions?.[item.requiredPermission] === true;
  return true;
}

export function getVisibleNavigationSections(context) {
  return appNavigationSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => shouldShowNavigationItem(item, context)),
  }));
}
