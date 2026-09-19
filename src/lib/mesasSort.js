/**
 * Mesa map / CRUD ordering.
 *
 * Natural (cadastro / fallback):
 * 1) pure numeric labels in numeric order (1, 2, 3 … 10 … 50)
 * 2) named / mixed labels after, A→Z
 *
 * Map (`mapa_ordem`): store-synced drag order on /app/mesas.
 */

export function compareMesasByNumero(a, b) {
  const ka = mesaNumeroSortKey(a?.numero);
  const kb = mesaNumeroSortKey(b?.numero);
  if (ka.kind !== kb.kind) return ka.kind - kb.kind;
  if (ka.kind === 0 && ka.n !== kb.n) return ka.n - kb.n;
  const byLabel = ka.label.localeCompare(kb.label, 'pt-BR', { sensitivity: 'base' });
  if (byLabel !== 0) return byLabel;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'en');
}

export function sortMesasByNumero(mesas) {
  return [...(mesas || [])].sort(compareMesasByNumero);
}

/** Operational map: custom `mapa_ordem`, then natural numero. */
export function compareMesasForMap(a, b) {
  const ao = a?.mapa_ordem;
  const bo = b?.mapa_ordem;
  const aNull = ao == null || Number.isNaN(Number(ao));
  const bNull = bo == null || Number.isNaN(Number(bo));
  if (aNull !== bNull) return aNull ? 1 : -1;
  if (!aNull && !bNull && Number(ao) !== Number(bo)) return Number(ao) - Number(bo);
  return compareMesasByNumero(a, b);
}

export function sortMesasForMap(mesas) {
  return [...(mesas || [])].sort(compareMesasForMap);
}

/**
 * Move item from fromIndex to toIndex and renumber mapa_ordem 0..n-1.
 * Returns a new array (does not mutate input).
 */
export function reorderMesas(mesas, fromIndex, toIndex) {
  const list = [...(mesas || [])];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= list.length ||
    toIndex >= list.length ||
    fromIndex === toIndex
  ) {
    return list.map((m, i) => ({ ...m, mapa_ordem: i }));
  }
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return list.map((m, i) => ({ ...m, mapa_ordem: i }));
}

function mesaNumeroSortKey(numero) {
  const label = String(numero ?? '').trim();
  if (/^\d+$/.test(label)) {
    const n = Number(label);
    if (Number.isSafeInteger(n)) return { kind: 0, n, label };
  }
  return { kind: 1, n: 0, label };
}
