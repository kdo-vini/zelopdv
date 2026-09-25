import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const sonner = vi.hoisted(() => {
  const fn = vi.fn();
  fn.success = vi.fn();
  fn.error = vi.fn();
  fn.warning = vi.fn();
  return fn;
});
vi.mock('svelte-sonner', () => ({ toast: sonner }));

const { addToast, confirmAction, confirmModal, dismissZeloToast, splitToastMessage, zeloToasts } = await import('../src/lib/stores/ui.js');
const { currentSurface } = await import('../src/lib/theme/surface.js');

afterEach(() => {
  currentSurface.set('legacy');
  zeloToasts.set([]);
  vi.clearAllMocks();
});

describe('splitToastMessage', () => {
  it('splits a short first sentence into title + detail', () => {
    expect(splitToastMessage('Conexão instável. Os próximos lançamentos serão salvos neste aparelho.'))
      .toEqual({ title: 'Conexão instável', detail: 'Os próximos lançamentos serão salvos neste aparelho.' });
  });

  it('keeps single sentences and decimals intact', () => {
    expect(splitToastMessage('Produto desativado.')).toEqual({ title: 'Produto desativado.', detail: '' });
    expect(splitToastMessage('Recebido R$ 1.500,00 em dinheiro')).toEqual({ title: 'Recebido R$ 1.500,00 em dinheiro', detail: '' });
  });

  it('does not split when the first sentence is long', () => {
    const long = 'Impressão dos pedidos iFood agora é responsabilidade deste aparelho principal. Confira.';
    expect(splitToastMessage(long)).toEqual({ title: long, detail: '' });
  });
});

describe('addToast routing', () => {
  it('uses svelte-sonner on the legacy surface (unchanged API)', () => {
    addToast('Salvo', 'success');
    addToast('Falhou', 'error', 0);
    addToast('Oi');
    expect(sonner.success).toHaveBeenCalledWith('Salvo', { duration: 3000 });
    expect(sonner.error).toHaveBeenCalledWith('Falhou', { duration: Infinity });
    expect(sonner).toHaveBeenCalledWith('Oi', { duration: 3000 });
    expect(get(zeloToasts)).toEqual([]);
  });

  it('feeds the Zelo toaster on app/brand surfaces', () => {
    currentSurface.set('app');
    addToast('Venda registrada. R$ 54,80', 'success', 4000);
    addToast('Sem tom conhecido', 'loading');
    expect(sonner.success).not.toHaveBeenCalled();
    const list = get(zeloToasts);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ tone: 'success', title: 'Venda registrada', detail: 'R$ 54,80', duration: 4000 });
    expect(list[1]).toMatchObject({ tone: 'info', duration: 3000 });
  });

  it('dedupes identical toasts, caps the stack at 3 and dismisses by id', () => {
    currentSurface.set('brand');
    addToast('A', 'info');
    addToast('A', 'info');
    expect(get(zeloToasts)).toHaveLength(1);
    addToast('B', 'info'); addToast('C', 'info'); addToast('D', 'warning', 0, { detail: 'detalhe' });
    const list = get(zeloToasts);
    expect(list.map((t) => t.title)).toEqual(['B', 'C', 'D']);
    expect(list[2]).toMatchObject({ detail: 'detalhe', duration: 0 });
    dismissZeloToast(list[0].id);
    expect(get(zeloToasts).map((t) => t.title)).toEqual(['C', 'D']);
  });
});

describe('confirmAction', () => {
  it('keeps the two-argument API and accepts optional labels/destructive', async () => {
    const pending = confirmAction('Limpar comanda', 'Remover todos os itens?', { confirmLabel: 'Limpar', destructive: true });
    const state = get(confirmModal);
    expect(state).toMatchObject({ isOpen: true, title: 'Limpar comanda', confirmLabel: 'Limpar', cancelLabel: '', destructive: true });
    state.resolve(true);
    await expect(pending).resolves.toBe(true);
    expect(get(confirmModal)).toMatchObject({ isOpen: false, destructive: false });

    const plain = confirmAction('Sair?', '');
    expect(get(confirmModal)).toMatchObject({ confirmLabel: '', destructive: false });
    get(confirmModal).reject();
    await expect(plain).resolves.toBe(false);
  });
});
