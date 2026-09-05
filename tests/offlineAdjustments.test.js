import fs from 'node:fs';
import { parse } from 'svelte/compiler';
import { expect, it, vi } from 'vitest';
const source = fs.readFileSync('src/lib/components/OfflineAdjustments.svelte', 'utf8');
const node = parse(source).instance.content.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'load');
function mount(context, supabase, cached = null) {
  const saved = vi.fn();
  const ui = new Function('getOfflineContext', 'supabase', 'readSnapshot', 'saveSnapshot', 'navigator', `
    let busy=false, active=true, adjustments=[], divergences=[], message='';
    ${source.slice(node.start,node.end)}
    return { load, state:()=>({adjustments,divergences,message}) };
  `)(context, supabase, async () => cached, saved, { onLine: true });
  return { ...ui, saved };
}
it('loads owner-scoped adjustments and stores them separately from operations', async () => {
  const scopes = [];
  const supabase = { from(table) { const q = { select: () => q, eq: (key,value) => { scopes.push([table,key,value]); return q; }, order: () => q, limit: () => q, abortSignal: async () => ({ data: [{ id: table }] }) }; return q; } };
  const ui = mount(() => ({ ownerUserId: 'owner', userId: 'owner' }), supabase);
  await ui.load();
  expect(scopes).toEqual([['offline_caixa_adjustments','owner_user_id','owner'],['offline_stock_divergences','owner_user_id','owner']]);
  expect(ui.saved).toHaveBeenCalledWith('owner','offline:adjustments', expect.any(Object));
});
it('never queries owner-only conference data as a subuser', async () => {
  const from = vi.fn();
  await mount(() => ({ ownerUserId: 'owner', userId: 'cashier', isSubUser: true }), { from }).load();
  expect(from).not.toHaveBeenCalled();
});
