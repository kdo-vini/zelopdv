import { writable } from 'svelte/store';

export const isOpen = writable(false);
export const messages = writable([]);
export const contextType = writable('geral');
export const signalContext = writable(null);
export const screenContext = writable(null);

export function screenContextMatchesLocation(context, pathname, search = '') {
  if (!context?.route) return true;
  return context.route === `${pathname}${search}`;
}

const VALID_CONTEXT_TYPES = new Set(['geral', 'vendas', 'produtos', 'despesas']);

const signalContextTypes = {
  REVENUE_BELOW_WEEKDAY_AVG: 'vendas',
  REVENUE_ABOVE_WEEKDAY_AVG: 'vendas',
  AVG_TICKET_DOWN: 'vendas',
  PRODUCT_SALES_DROP: 'produtos',
  TOP_PRODUCT_CONCENTRATION: 'produtos',
  PAYMENT_MIX_SHIFT: 'vendas',
  FIADO_ISSUED_SHARE_HIGH: 'vendas',
  CASH_DIFFERENCE_RECURRING: 'despesas',
  STOCK_COVERAGE_LOW: 'produtos',
  STOCK_ZERO_WITH_DEMAND: 'produtos',
  CAIXA_LEFT_OPEN: 'vendas',
};

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, maxLength);
  return text || null;
}

function normalizeScreenContext(context) {
  if (!context || typeof context !== 'object') return null;

  const contextTypeValue = VALID_CONTEXT_TYPES.has(context.contextType)
    ? context.contextType
    : 'geral';
  const source = cleanText(context.source, 80);
  const title = cleanText(context.title, 120);
  const route = cleanText(context.route, 240);

  if (!source || !title || !route?.startsWith('/')) return null;

  const entity = context.entity && typeof context.entity === 'object'
    ? {
        type: cleanText(context.entity.type, 48),
        id: cleanText(String(context.entity.id ?? ''), 120),
        name: cleanText(context.entity.name, 120),
      }
    : null;

  return {
    source,
    title,
    route,
    contextType: contextTypeValue,
    ...(entity?.type && entity?.id ? { entity } : {}),
  };
}

export function toggleAssistant() {
  isOpen.update(v => !v);
}

export function openAssistant() {
  contextType.set('geral');
  signalContext.set(null);
  screenContext.set(null);
  messages.set([]);
  isOpen.set(true);
}

export function closeAssistant() {
  isOpen.set(false);
  contextType.set('geral');
  signalContext.set(null);
  screenContext.set(null);
}

export function setScreenContext(context) {
  const normalized = normalizeScreenContext(context);
  if (!normalized) return false;
  screenContext.set(normalized);
  contextType.set(normalized.contextType);
  return true;
}

export function clearScreenContext() {
  screenContext.set(null);
}

export function openAssistantWithContext(context) {
  if (!setScreenContext(context)) return false;
  signalContext.set(null);
  messages.set([]);
  isOpen.set(true);
  return true;
}

export function openAssistantWithSignal(signal) {
  if (!signal?.id) return false;
  signalContext.set(signal);
  setScreenContext({
    source: 'gerente-sinal',
    title: 'Aviso do Zelinho Gerente',
    route: '/gestao/gerente',
    contextType: signalContextTypes[signal.type] || 'geral',
    entity: { type: 'business_signal', id: signal.id },
  });
  messages.set([]);
  isOpen.set(true);
  return true;
}

export function clearSignalContext() {
  signalContext.set(null);
  contextType.set('geral');
  screenContext.update((current) => current?.source === 'gerente-sinal' ? null : current);
}
