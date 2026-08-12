import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_PATH = path.join(import.meta.dirname, '..', '.auth', 'test-tenant.json');
const DEFAULT_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2E-Only-Change-Me-123!';
const TEST_EMAIL_RE = /(^|[.+_-])e2e([.+_@-]|$)|\.test$/i;

const ROLE_FIXTURES = [
  {
    name: 'Caixa',
    permissions: {
      'pdv.acessar': true,
      'pdv.vender': true,
      'pdv.receber': true,
      'caixa.abrir': true,
      'caixa.fechar': true,
      'caixa.movimentar': true,
      'caixa.ver': true,
    },
  },
  {
    name: 'Atendente',
    permissions: {
      'pdv.acessar': true,
      'mesas.acessar': true,
      'mesas.abrir_comanda': true,
      'mesas.editar_itens': true,
      'pedidos.acessar': true,
      'pedidos.criar': true,
      'pedidos.cozinha': true,
      'pedidos.receber': true,
      'pedidos.cancelar': true,
    },
  },
  {
    name: 'Gerente',
    permissions: {
      'pdv.acessar': true,
      'pdv.vender': true,
      'pdv.receber': true,
      'pdv.desconto': true,
      'caixa.abrir': true,
      'caixa.fechar': true,
      'caixa.movimentar': true,
      'caixa.ver': true,
      'produtos.visualizar': true,
      'produtos.gerenciar': true,
      'pedidos.acessar': true,
      'pedidos.criar': true,
      'pedidos.cozinha': true,
      'pedidos.receber': true,
      'pedidos.cancelar': true,
      'estoque.visualizar': true,
      'estoque.ajustar': true,
      'pessoas.visualizar': true,
      'pessoas.gerenciar': true,
      'fiado.visualizar': true,
      'fiado.receber': true,
      'despesas.visualizar': true,
      'despesas.gerenciar': true,
      'relatorios.ver': true,
      'relatorios.exportar': true,
      'perfil.editar': true,
    },
  },
];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatório para o tenant E2E dedicado.`);
  return value;
}

export function testTenantConfig() {
  const email = requiredEnv('E2E_TEST_EMAIL');
  if (!TEST_EMAIL_RE.test(email) && process.env.E2E_ALLOW_NON_TEST_TENANT !== 'true') {
    throw new Error(
      `E2E_TEST_EMAIL=${email} não parece uma conta de teste. ` +
      'Use um email com e2e/.test ou defina E2E_ALLOW_NON_TEST_TENANT=true conscientemente.',
    );
  }

  return {
    email,
    password: requiredEnv('E2E_TEST_PASSWORD'),
    supabaseUrl: requiredEnv('E2E_SUPABASE_URL'),
    serviceRoleKey: requiredEnv('E2E_SUPABASE_SERVICE_ROLE_KEY'),
    prefix: process.env.E2E_TENANT_PREFIX?.trim() || 'e2e-zelopdv-',
  };
}

export function createTestAdminClient() {
  const config = testTenantConfig();
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function throwOnError(label, result) {
  if (result?.error) throw new Error(`${label}: ${result.error.message}`);
  return result?.data;
}

async function findUser(admin, email) {
  let page = 1;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users || [];
    const user = users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (users.length < 1000) return null;
    page += 1;
  }
  return null;
}

async function ensureUser(admin, email, password) {
  const existing = await findUser(admin, email);
  if (existing) {
    const data = await throwOnError(
      `auth user ${email}`,
      await admin.auth.admin.updateUserById(existing.id, { email, password, email_confirm: true }),
    );
    return data?.user ?? data;
  }

  const data = await throwOnError(
    `auth user ${email}`,
    await admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  return data?.user ?? data;
}

async function insertRows(admin, table, rows, label = table) {
  return throwOnError(label, await admin.from(table).insert(rows).select('*'));
}

async function deleteByIds(admin, table, ids) {
  const values = [...new Set((ids || []).filter(Boolean))];
  if (!values.length) return;
  await throwOnError(`cleanup ${table}`, await admin.from(table).delete().in('id', values));
}

async function deleteByField(admin, table, field, values) {
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  for (const value of uniqueValues) {
    await throwOnError(`cleanup ${table}.${field}`, await admin.from(table).delete().eq(field, value));
  }
}

async function idsByField(admin, table, field, value) {
  if (Array.isArray(value) && value.length === 0) return [];
  const query = admin.from(table).select('id');
  const filtered = Array.isArray(value) ? query.in(field, value) : query.eq(field, value);
  return throwOnError(
    `list ${table}.${field}`,
    await filtered,
  ).then((rows) => (rows || []).map((row) => row.id));
}

async function cleanupOwnerOperationalData(admin, ownerId, empresaId) {
  const orderIds = await idsByField(admin, 'zelo_orders', 'empresa_id', empresaId);
  await deleteByField(admin, 'zelo_order_items', 'order_id', orderIds);
  await deleteByField(admin, 'zelo_order_events', 'order_id', orderIds);
  await deleteByField(admin, 'zelo_order_outbox', 'order_id', orderIds);
  await deleteByIds(admin, 'zelo_orders', orderIds);

  const saleIds = await idsByField(admin, 'vendas', 'id_usuario', ownerId);
  await deleteByField(admin, 'comanda_pagamento_itens', 'id_venda', saleIds);
  await deleteByField(admin, 'vendas_pagamentos', 'id_venda', saleIds);
  await deleteByField(admin, 'vendas_taxas_plataforma', 'id_venda', saleIds);
  await deleteByField(admin, 'vendas_itens', 'id_venda', saleIds);
  await deleteByIds(admin, 'vendas', saleIds);
  await deleteByField(admin, 'fiado_lancamentos', 'id_usuario', [ownerId]);

  const comandaIds = await idsByField(admin, 'comandas', 'id_usuario', ownerId);
  const comandaItemIds = await idsByField(admin, 'comanda_itens', 'id_comanda', comandaIds);
  await deleteByField(admin, 'comanda_pagamento_itens', 'id_comanda', comandaIds);
  await deleteByField(admin, 'comanda_pagamento_itens', 'id_comanda_item', comandaItemIds);
  await deleteByField(admin, 'comanda_pagamentos', 'id_comanda', comandaIds);
  await deleteByField(admin, 'comanda_itens', 'id_comanda', comandaIds);
  await deleteByIds(admin, 'comandas', comandaIds);

  const cashIds = await idsByField(admin, 'caixas', 'id_usuario', ownerId);
  await deleteByField(admin, 'caixa_movimentacoes', 'id_caixa', cashIds);
  await deleteByField(admin, 'caixa_fechamentos', 'id_caixa', cashIds);
  await deleteByIds(admin, 'caixas', cashIds);
  await throwOnError('cleanup expenses', await admin.from('expenses').delete().eq('user_id', ownerId));
  await throwOnError('cleanup access audit logs', await admin.from('access_audit_logs').delete().eq('owner_user_id', ownerId));
}

async function seedRoles(admin, ownerUserId) {
  const rows = ROLE_FIXTURES.map((role) => ({
    owner_user_id: ownerUserId,
    name: role.name,
    is_system: true,
    permissions: role.permissions,
  }));
  await throwOnError(
    'access roles',
    await admin.from('access_roles').upsert(rows, { onConflict: 'owner_user_id,name' }),
  );
  const roles = await throwOnError(
    'access role ids',
    await admin.from('access_roles').select('id,name').eq('owner_user_id', ownerUserId),
  );
  return Object.fromEntries((roles || []).map((role) => [role.name, role.id]));
}

async function seedSubusers(admin, ownerUserId, ownerEmail) {
  const roleIds = await seedRoles(admin, ownerUserId);
  await throwOnError(
    'access settings',
    await admin.from('access_settings').upsert({
      owner_user_id: ownerUserId,
      pin_enabled: true,
      max_subusers: 5,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_user_id' }),
  );

  const users = {};
  for (const role of ROLE_FIXTURES) {
    const slug = role.name.toLowerCase();
    const email = `${slug}.${ownerEmail.replace(/[^a-z0-9]/gi, '-')}@e2e.zelopdv.test`;
    const user = await ensureUser(admin, email, DEFAULT_PASSWORD);
    await throwOnError(
      `access user ${role.name}`,
      await admin.from('access_users').upsert({
        owner_user_id: ownerUserId,
        auth_user_id: user.id,
        email,
        role_id: roleIds[role.name],
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_user_id,email' }),
    );
    users[slug] = { id: user.id, email, password: DEFAULT_PASSWORD, role: role.name };
  }

  return { roleIds, users };
}

export async function seedTestTenant() {
  const config = testTenantConfig();
  const admin = createTestAdminClient();
  const owner = await ensureUser(admin, config.email, config.password);
  const runId = `${config.prefix}${Date.now()}-${randomUUID().slice(0, 8)}`;

  const profile = (await throwOnError(
    'empresa_perfil',
    await admin.from('empresa_perfil').upsert({
      user_id: owner.id,
      nome_exibicao: `${runId} Loja Teste`,
      razao_social: `${runId} LTDA`,
      documento: '52998224725',
      contato: '5511999999999',
      largura_bobina: '80mm',
      pin_admin: '1234',
    }, { onConflict: 'user_id' }).select('*').single(),
  ));

  const subscription = await throwOnError(
    'subscription lookup',
    await admin.from('subscriptions').select('id').eq('user_id', owner.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  );
  if (subscription?.id) {
    await throwOnError(
      'subscription reset',
      await admin.from('subscriptions').update({
        status: 'active',
        plan_tier: 'pdv',
        current_period_end: '2099-12-31T23:59:59.000Z',
        manually_extended_until: null,
        has_mesas_addon: true,
        has_acessos_addon: true,
        has_zelo_menu: true,
        updated_at: new Date().toISOString(),
      }).eq('id', subscription.id),
    );
  } else {
    await throwOnError(
      'subscription seed',
      await admin.from('subscriptions').insert({
        user_id: owner.id,
        status: 'active',
        plan_tier: 'pdv',
        current_period_end: '2099-12-31T23:59:59.000Z',
        has_mesas_addon: true,
        has_acessos_addon: true,
        has_zelo_menu: true,
        monthly_value_cents: 5900,
      }),
    );
  }

  const access = await seedSubusers(admin, owner.id, config.email);
  const categoryRows = await insertRows(admin, 'categorias', [
    {
      id_usuario: owner.id,
      nome: `${runId} Estoque Individual`,
      ordem: 1,
      controlar_estoque_compartilhado: false,
      estoque_compartilhado_atual: 0,
    },
    {
      id_usuario: owner.id,
      nome: `${runId} Estoque Compartilhado`,
      ordem: 2,
      controlar_estoque_compartilhado: true,
      estoque_compartilhado_atual: 20,
    },
  ], 'categories');
  const subcategoryRows = await insertRows(admin, 'subcategorias', [{
    id_usuario: owner.id,
    id_categoria: categoryRows[0].id,
    nome: `${runId} Subcategoria`,
    ordem: 1,
  }], 'subcategories');
  const productRows = await insertRows(admin, 'produtos', [
    {
      id_usuario: owner.id,
      nome: `${runId} Produto Estoque`,
      preco: 12.5,
      id_categoria: categoryRows[0].id,
      id_subcategoria: subcategoryRows[0].id,
      eh_item_por_unidade: true,
      ocultar_no_pdv: false,
      controlar_estoque: true,
      estoque_atual: 20,
    },
    {
      id_usuario: owner.id,
      nome: `${runId} Produto Compartilhado`,
      preco: 8,
      id_categoria: categoryRows[1].id,
      eh_item_por_unidade: true,
      ocultar_no_pdv: false,
      controlar_estoque: false,
      estoque_atual: 0,
    },
    {
      id_usuario: owner.id,
      nome: `${runId} Produto Montável`,
      preco: 20,
      id_categoria: categoryRows[0].id,
      eh_item_por_unidade: true,
      ocultar_no_pdv: false,
      controlar_estoque: true,
      estoque_atual: 20,
    },
    {
      id_usuario: owner.id,
      nome: `${runId} Produto Sem Estoque`,
      preco: 5,
      id_categoria: categoryRows[0].id,
      eh_item_por_unidade: true,
      ocultar_no_pdv: false,
      controlar_estoque: false,
      estoque_atual: 0,
    },
  ], 'products');
  const peopleRows = await insertRows(admin, 'pessoas', [
    { id_usuario: owner.id, nome: `${runId} Cliente Devedor`, tipo: 'cliente', contato: '5511988888888', saldo_fiado: 25 },
    { id_usuario: owner.id, nome: `${runId} Cliente Quitado`, tipo: 'cliente', contato: '5511977777777', saldo_fiado: 0 },
    { id_usuario: owner.id, nome: `${runId} Cliente Credor`, tipo: 'cliente', contato: '5511966666666', saldo_fiado: -10 },
  ], 'people');
  const tableRows = await insertRows(admin, 'mesas', [
    { id_usuario: owner.id, numero: `${runId}-1`, capacidade: 4, ativa: true, status: 'livre' },
    { id_usuario: owner.id, numero: `${runId}-2`, capacidade: 2, ativa: true, status: 'ocupada' },
  ], 'tables');
  const comandaRows = await insertRows(admin, 'comandas', [{
    id_mesa: tableRows[1].id,
    id_usuario: owner.id,
    id_operador: owner.id,
    status: 'aberta',
    num_pessoas: 2,
  }], 'open command');
  const comandaItemRows = await insertRows(admin, 'comanda_itens', [{
    id_comanda: comandaRows[0].id,
    id_produto: productRows[0].id,
    quantidade: 1,
    preco_unitario: 12.5,
    nome_produto_na_venda: `${runId} Produto Estoque`,
    modifiers: [],
  }], 'open command item');
  const existingOpenCash = await throwOnError(
    'existing open cash lookup',
    await admin.from('caixas').select('id').eq('id_usuario', owner.id).is('data_fechamento', null).limit(1).maybeSingle(),
  );
  const cashRows = await insertRows(admin, 'caixas', [
    ...(existingOpenCash ? [] : [{
      id_usuario: owner.id,
      id_operador: owner.id,
      data_abertura: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      valor_inicial: 100,
      data_fechamento: null,
    }]),
    {
      id_usuario: owner.id,
      id_operador: owner.id,
      data_abertura: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      valor_inicial: 50,
      data_fechamento: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      valor_fechamento: 50,
      diferenca_fechamento: 0,
    },
  ], 'cash sessions');
  const modifierGroupRows = await insertRows(admin, 'zelomenu_modifier_groups', [{
    id_usuario: owner.id,
    id_produto: productRows[2].id,
    nome: `${runId} Escolha uma opção`,
    tipo: 'variacao',
    min_selecoes: 1,
    max_selecoes: 1,
    ativo: true,
    ordem: 1,
    modo_preco: 'somar',
  }], 'modifier groups');
  const modifierOptionRows = await insertRows(admin, 'zelomenu_modifier_options', [
    {
      id_usuario: owner.id,
      id_grupo: modifierGroupRows[0].id,
      nome: `${runId} Opção A`,
      price_delta: 2,
      ativo: true,
      ordem: 1,
    },
    {
      id_usuario: owner.id,
      id_grupo: modifierGroupRows[0].id,
      nome: `${runId} Opção vinculada`,
      price_delta: 0,
      ativo: true,
      ordem: 2,
    },
  ], 'modifier options');
  await insertRows(admin, 'zelomenu_modifier_option_products', [{
    id_opcao: modifierOptionRows[1].id,
    id_usuario: owner.id,
    id_produto: productRows[0].id,
    price_override: null,
  }], 'linked modifier products');
  const publicationRows = await insertRows(admin, 'zelomenu_product_publications', [{
    id_usuario: owner.id,
    id_produto: productRows[2].id,
    nome_publico: `${runId} Produto Montável`,
    visivel_online: true,
    pausado_manualmente: false,
    ordem: 1,
  }], 'menu publications');

  let orderRows = await insertRows(admin, 'zelo_orders', [
    {
      empresa_id: profile.id,
      source: 'manual',
      status: 'pending_review',
      revision: 1,
      customer: { name: `${runId} Cliente Pedido` },
      fulfillment: { type: 'retirada', pickup_time: '18:00' },
      payment: { declaredMethod: 'pix' },
      subtotal: 12.5,
      delivery_fee: 0,
      discount: 0,
      total: 12.5,
      observations: `${runId} observação`,
      idempotency_key: `${runId}-pending-review`,
    },
    {
      empresa_id: profile.id,
      source: 'manual',
      status: 'accepted',
      revision: 1,
      customer: { name: `${runId} Pedido Cozinha` },
      fulfillment: { type: 'retirada' },
      payment: { declaredMethod: 'dinheiro' },
      subtotal: 12.5,
      delivery_fee: 0,
      discount: 0,
      total: 12.5,
      idempotency_key: `${runId}-accepted`,
    },
    {
      empresa_id: profile.id,
      source: 'manual',
      status: 'preparing',
      revision: 1,
      customer: { name: `${runId} Pedido Preparando` },
      fulfillment: { type: 'retirada' },
      payment: { declaredMethod: 'pix' },
      subtotal: 12.5,
      delivery_fee: 0,
      discount: 0,
      total: 12.5,
      idempotency_key: `${runId}-preparing`,
    },
    {
      empresa_id: profile.id,
      source: 'manual',
      status: 'ready',
      revision: 1,
      customer: { name: `${runId} Pedido Pronto` },
      fulfillment: { type: 'delivery' },
      payment: { declaredMethod: 'cartao_credito' },
      subtotal: 12.5,
      delivery_fee: 3,
      discount: 0,
      total: 15.5,
      idempotency_key: `${runId}-ready`,
    },
    {
      empresa_id: profile.id,
      source: 'manual',
      status: 'cancelled',
      revision: 2,
      customer: { name: `${runId} Pedido Cancelado` },
      fulfillment: { type: 'retirada' },
      payment: { declaredMethod: 'pix' },
      subtotal: 12.5,
      delivery_fee: 0,
      discount: 0,
      total: 12.5,
      idempotency_key: `${runId}-cancelled`,
    },
  ], 'canonical orders');
  const remainingOrderRows = await insertRows(admin, 'zelo_orders', [
    ['pending_payment', 'Pagamento pendente', 'pix', 'retirada', 0],
    ['out_for_delivery', 'Pedido saiu', 'pix', 'delivery', 3],
    ['delivered', 'Pedido entregue', 'pix', 'delivery', 0],
    ['rejected', 'Pedido rejeitado', 'pix', 'retirada', 0],
  ].map(([status, label, method, fulfillmentType, deliveryFee], index) => ({
    empresa_id: profile.id,
    source: 'manual',
    status,
    revision: 1,
    customer: { name: `${runId} ${label}` },
    fulfillment: { type: fulfillmentType },
    payment: { declaredMethod: method },
    subtotal: 12.5,
    delivery_fee: deliveryFee,
    discount: 0,
    total: 12.5 + deliveryFee,
    idempotency_key: `${runId}-${status}-${index}`,
  })), 'remaining canonical orders');
  orderRows = [...orderRows, ...remainingOrderRows];
  const orderItemRows = await insertRows(admin, 'zelo_order_items', orderRows.map((order, index) => ({
    order_id: order.id,
    product_id: productRows[index % productRows.length].id,
    name: `${runId} Item ${index + 1}`,
    unit_price: 12.5,
    quantity: 1,
    subtotal: 12.5,
    modifiers: index === 1 ? [{ groupName: `${runId} Escolha uma opção`, selectedOptions: [{ optionName: `${runId} Opção A`, quantity: 1 }] }] : [],
    position: 0,
  })), 'canonical order items');

  const manifest = {
    version: 1,
    runId,
    owner: { id: owner.id, email: config.email, password: config.password },
    profile: { id: profile.id, userId: owner.id },
    access,
    categoryIds: categoryRows.map((row) => row.id),
    subcategoryIds: subcategoryRows.map((row) => row.id),
    productIds: productRows.map((row) => row.id),
    peopleIds: peopleRows.map((row) => row.id),
    tableIds: tableRows.map((row) => row.id),
    comandaIds: comandaRows.map((row) => row.id),
    comandaItemIds: comandaItemRows.map((row) => row.id),
    cashIds: cashRows.map((row) => row.id),
    modifierGroupIds: modifierGroupRows.map((row) => row.id),
    modifierOptionIds: modifierOptionRows.map((row) => row.id),
    publicationIds: publicationRows.map((row) => row.id),
    orderIds: orderRows.map((row) => row.id),
    orderItemIds: orderItemRows.map((row) => row.id),
    createdAt: new Date().toISOString(),
  };
  writeTestTenantManifest(manifest);
  return { admin, manifest };
}

export async function cleanupTestTenant(manifest = readTestTenantManifest()) {
  if (!manifest) return;
  const admin = createTestAdminClient();

  await deleteByIds(admin, 'zelo_order_items', manifest.orderItemIds);
  await deleteByField(admin, 'zelo_order_events', 'order_id', manifest.orderIds);
  await deleteByField(admin, 'zelo_order_outbox', 'order_id', manifest.orderIds);
  await deleteByIds(admin, 'zelo_orders', manifest.orderIds);
  await deleteByField(admin, 'comanda_pagamento_itens', 'id_comanda', manifest.comandaIds);
  await deleteByField(admin, 'comanda_pagamento_itens', 'id_comanda_item', manifest.comandaItemIds);
  await deleteByField(admin, 'comanda_pagamentos', 'id_comanda', manifest.comandaIds);
  await deleteByIds(admin, 'comanda_itens', manifest.comandaItemIds);
  await deleteByIds(admin, 'comandas', manifest.comandaIds);
  await deleteByField(admin, 'caixa_movimentacoes', 'id_caixa', manifest.cashIds);
  await deleteByField(admin, 'caixa_fechamentos', 'id_caixa', manifest.cashIds);
  await deleteByIds(admin, 'caixas', manifest.cashIds);
  await deleteByField(admin, 'zelomenu_modifier_option_products', 'id_opcao', manifest.modifierOptionIds);
  await deleteByIds(admin, 'zelomenu_modifier_options', manifest.modifierOptionIds);
  await deleteByIds(admin, 'zelomenu_modifier_groups', manifest.modifierGroupIds);
  await deleteByIds(admin, 'zelomenu_product_publications', manifest.publicationIds);
  await deleteByIds(admin, 'pessoas', manifest.peopleIds);
  await deleteByIds(admin, 'mesas', manifest.tableIds);
  await deleteByIds(admin, 'produtos', manifest.productIds);
  await deleteByIds(admin, 'subcategorias', manifest.subcategoryIds);
  await deleteByIds(admin, 'categorias', manifest.categoryIds);

  await deleteByIds(admin, 'access_users', Object.values(manifest.access?.users || {}).map((user) => user.id));
  await deleteByIds(admin, 'access_roles', Object.values(manifest.access?.roleIds || {}));

  if (process.env.E2E_DELETE_TEST_USERS !== 'false') {
    for (const user of Object.values(manifest.access?.users || {})) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }

  if (fs.existsSync(MANIFEST_PATH)) fs.unlinkSync(MANIFEST_PATH);
}

export async function resetTestTenant() {
  const previous = readTestTenantManifest();
  if (previous) await cleanupTestTenant(previous);
  return seedTestTenant();
}

export function writeTestTenantManifest(manifest) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

export function readTestTenantManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

export { MANIFEST_PATH, ROLE_FIXTURES };
