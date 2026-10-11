import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { idCode } from './utils';
import { ALL_PERMISSION_IDS, normalizePermissions } from './permissions';

// Used only to sign up new users. It must not store or broadcast its session,
// otherwise signing up a user replaces the signed-in admin's session.
const authAdminClient = supabaseConfigured
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'mobihub-signup-client'
    }
  })
  : null;

const now = () => new Date().toISOString();

const mem = {
  categories: [
    { id: 'cat-used', name: 'Used Phones', description: 'Pre-owned phones', created_at: now() },
    { id: 'cat-new', name: 'New Phones', description: 'Brand new phones', created_at: now() },
    { id: 'cat-airpods', name: 'AirPods', description: 'Wireless earbuds', created_at: now() },
    { id: 'cat-cables', name: 'Cables', description: 'Charging and data cables', created_at: now() }
  ],
  products: [
    { id: 'prod-1', category_id: 'cat-new', name: 'iPhone 15', description: '128GB', barcode: '1110001', price: 850, profit_price: 49, quantity: 8, created_at: now() },
    { id: 'prod-2', category_id: 'cat-used', name: 'Used Samsung S22', description: 'Good condition', barcode: '1110002', price: 320, profit_price: 40, quantity: 4, created_at: now() },
    { id: 'prod-3', category_id: 'cat-airpods', name: 'AirPods Pro', description: '2nd generation', barcode: '1110003', price: 200, profit_price: 19, quantity: 15, created_at: now() },
    { id: 'prod-4', category_id: 'cat-cables', name: 'USB-C Cable', description: '1 meter cable', barcode: '1110004', price: 8, profit_price: 4, quantity: 70, created_at: now() }
  ],
  app_users: [
    { id: 'usr-admin', name: 'Demo', last_name: 'Admin', username: 'demo@admin.local', permissions: ALL_PERMISSION_IDS, is_admin: true, created_at: now() }
  ],
  suppliers: [], supplier_categories: [], supplier_orders: [], supplier_order_items: [], pos_orders: [], pos_order_items: [], pos_payments: [], expenses: []
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = () => new Promise((r) => setTimeout(r, 60));

function cleanProductRow(row) {
  const cleaned = { ...row };
  if ('price' in cleaned) cleaned.price = Number(cleaned.price || 0);
  if ('profit_price' in cleaned) cleaned.profit_price = Number(cleaned.profit_price || 0);
  if ('quantity' in cleaned) cleaned.quantity = Number(cleaned.quantity || 0);
  if ('barcode' in cleaned && (!cleaned.barcode || String(cleaned.barcode).trim() === '')) cleaned.barcode = null;
  return cleaned;
}


const SUPABASE_PAGE_SIZE = 1000;

// Supabase/PostgREST caps a single select() response at SUPABASE_PAGE_SIZE rows.
// The first request also returns the total row count, then all remaining pages
// are requested at the same time instead of one after another.
async function fetchAllRows(buildQuery) {
  const first = await buildQuery({ count: 'exact' }).range(0, SUPABASE_PAGE_SIZE - 1);
  if (first.error) throw first.error;

  const firstPage = first.data || [];
  const total = first.count ?? firstPage.length;
  if (firstPage.length < SUPABASE_PAGE_SIZE || total <= SUPABASE_PAGE_SIZE) return firstPage;

  const rest = [];
  for (let from = SUPABASE_PAGE_SIZE; from < total; from += SUPABASE_PAGE_SIZE) {
    rest.push(buildQuery().range(from, from + SUPABASE_PAGE_SIZE - 1));
  }

  const pages = await Promise.all(rest);
  return pages.reduce((all, { data, error }) => {
    if (error) throw error;
    return all.concat(data || []);
  }, firstPage);
}

// Short-lived cache so moving between pages doesn't download every table again.
// Any write through the api clears it (see the wrapper at the bottom of this file).
const LIST_CACHE_MS = 30000;
const listCache = new Map();
const clearListCache = () => listCache.clear();

function cachedList(key, load) {
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.promise;

  const promise = load();
  listCache.set(key, { at: Date.now(), promise });
  promise.catch(() => { if (listCache.get(key)?.promise === promise) listCache.delete(key); });
  return promise;
}

async function listPaymentRows() {
  if (!supabaseConfigured) { await wait(); return clone(mem.pos_payments || []); }
  try {
    return await cachedList('pos_payments:payment_date', () => fetchAllRows((opts) =>
      supabase.from('pos_payments').select('*', opts).order('payment_date', { ascending: false }).order('id')
    ));
  } catch (error) {
    throw new Error(`Failed to load payments: ${error.message}`);
  }
}

async function insertPaymentRow(row) {
  const payment = {
    id: row.id || idCode('PAY'),
    created_at: row.created_at || now(),
    pos_order_id: row.pos_order_id,
    order_code: row.order_code || null,
    amount: Number(row.amount || 0),
    payment_date: row.payment_date || now(),
    note: row.note || null
  };

  if (!supabaseConfigured) {
    mem.pos_payments.unshift(payment);
    await wait();
    return clone(payment);
  }

  const { data, error } = await supabase.from('pos_payments').insert(payment).select().single();
  if (error) throw new Error(`Failed to save payment: ${error.message}`);
  return data;
}

async function deletePaymentRowsForOrder(orderId) {
  if (!supabaseConfigured) {
    mem.pos_payments = mem.pos_payments.filter(p => p.pos_order_id !== orderId);
    return true;
  }

  const { error } = await supabase.from('pos_payments').delete().eq('pos_order_id', orderId);
  if (error) throw new Error(`Failed to remove payments for order: ${error.message}`);
  return true;
}

function cleanUserRow(row) {
  const permissions = row.is_admin ? ALL_PERMISSION_IDS : normalizePermissions(row.permissions);
  return {
    ...row,
    username: String(row.username || '').trim().toLowerCase(),
    permissions,
    is_admin: Boolean(row.is_admin)
  };
}

async function dbList(table, order = 'created_at') {
  if (!supabaseConfigured) { await wait(); return clone(mem[table] || []); }
  return cachedList(`${table}:${order}`, () =>
    fetchAllRows((opts) => supabase.from(table).select('*', opts).order(order, { ascending: false }).order('id'))
  );
}

// Uncached lookups used inside write operations, which need current data.
async function dbGet(table, id) {
  if (!supabaseConfigured) return clone(mem[table].find(x => x.id === id) || null);
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function dbListWhere(table, column, value) {
  if (!supabaseConfigured) return clone(mem[table].filter(x => x[column] === value));
  return fetchAllRows((opts) => supabase.from(table).select('*', opts).eq(column, value).order('id'));
}

async function dbDeleteWhere(table, column, value) {
  if (!supabaseConfigured) { mem[table] = mem[table].filter(x => x[column] !== value); return true; }
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) throw error;
  return true;
}

async function dbInsert(table, row) {
  const insertRow = table === 'products' ? cleanProductRow(row) : table === 'app_users' ? cleanUserRow(row) : row;
  if (!supabaseConfigured) {
    const item = { id: insertRow.id || idCode(table.slice(0, 3).toUpperCase()), created_at: now(), ...insertRow };
    mem[table].unshift(item); await wait(); return clone(item);
  }
  const { data, error } = await supabase.from(table).insert(insertRow).select().single();
  if (error) throw error;
  return data;
}

async function dbUpdate(table, id, changes) {
  const updateRow = table === 'products' ? cleanProductRow(changes) : table === 'app_users' ? cleanUserRow(changes) : changes;
  if (!supabaseConfigured) {
    const list = mem[table]; const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...updateRow, updated_at: now() };
    await wait(); return clone(list[idx]);
  }
  const { data, error } = await supabase.from(table).update(updateRow).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function dbDelete(table, id) {
  if (!supabaseConfigured) { mem[table] = mem[table].filter(x => x.id !== id); await wait(); return true; }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  return true;
}

export const api = {
  getUserAccess: async (authUser) => {
    const email = String(authUser?.email || '').trim().toLowerCase();
    if (!email) throw new Error('User email was not found.');

    if (!supabaseConfigured) {
      const found = mem.app_users.find((u) => u.username === email) || mem.app_users[0];
      return clone(found);
    }

    const { data: existing, error } = await supabase.from('app_users').select('*').eq('username', email).maybeSingle();
    if (error) throw error;
    if (existing) return existing;

    const { count, error: countError } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
    if (countError) throw countError;

    if (count === 0) {
      return dbInsert('app_users', {
        name: authUser.user_metadata?.name || 'Admin',
        last_name: '',
        username: email,
        permissions: ALL_PERMISSION_IDS,
        is_admin: true
      });
    }

    throw new Error('This account does not have permissions. Ask an Admin to add it in Users Page.');
  },

  listAppUsers: () => dbList('app_users', 'created_at'),

  createAppUser: async (row) => {
    const password = row.password;
    const userRow = cleanUserRow(row);
    delete userRow.password;

    if (supabaseConfigured && password) {
      const { error } = await authAdminClient.auth.signUp({
        email: userRow.username,
        password,
        options: { data: { name: userRow.name, last_name: userRow.last_name } }
      });
      if (error && !String(error.message || '').toLowerCase().includes('already registered')) throw error;
    }

    return dbInsert('app_users', userRow);
  },

  updateAppUser: async (id, row) => {
    const password = row.password;
    const userRow = cleanUserRow(row);
    delete userRow.password;

    const updated = await dbUpdate('app_users', id, userRow);

    if (supabaseConfigured && password) {
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      const { error } = await supabase.rpc('admin_update_user_password', {
        target_username: userRow.username,
        new_password: password
      });
      if (error) throw error;
    }

    return updated;
  },
  deleteAppUser: (id) => dbDelete('app_users', id),

  listCategories: () => dbList('categories', 'name'),
  createCategory: (row) => dbInsert('categories', row),
  updateCategory: (id, row) => dbUpdate('categories', id, row),

  deleteCategory: async (id, deleteProducts = false) => {
    const products = await dbListWhere('products', 'category_id', id);
    if (products.length && !deleteProducts) throw new Error('This category has products. Delete with products or move them first.');
    if (deleteProducts) await dbDeleteWhere('products', 'category_id', id);
    await dbDeleteWhere('supplier_categories', 'category_id', id);
    return dbDelete('categories', id);
  },

  listProducts: () => dbList('products', 'name'),
  createProduct: (row) => dbInsert('products', row),
  updateProduct: (id, row) => dbUpdate('products', id, row),
  deleteProduct: (id) => dbDelete('products', id),

  updateProductStock: async (id, qtyDelta) => {
    const product = await dbGet('products', id);
    return dbUpdate('products', id, { quantity: Math.max(0, Number(product?.quantity || 0) + Number(qtyDelta || 0)) });
  },

  listSuppliers: () => dbList('suppliers', 'name'),
  listSupplierCategories: () => dbList('supplier_categories', 'created_at'),
  createSupplierCategory: (row) => dbInsert('supplier_categories', row),
  createSupplier: async (supplier, categoryIds) => {
    const created = await dbInsert('suppliers', supplier);
    for (const category_id of categoryIds) await dbInsert('supplier_categories', { supplier_id: created.id, category_id });
    return created;
  },
  updateSupplier: async (id, changes, categoryIds) => {
    const updated = await dbUpdate('suppliers', id, changes);
    if (Array.isArray(categoryIds)) {
      await dbDeleteWhere('supplier_categories', 'supplier_id', id);
      for (const category_id of categoryIds) await dbInsert('supplier_categories', { supplier_id: id, category_id });
    }
    return updated;
  },
  deleteSupplier: async (id) => {
    const orders = await dbListWhere('supplier_orders', 'supplier_id', id);
    if (orders.length) throw new Error('This supplier has orders and cannot be deleted safely.');
    await dbDeleteWhere('supplier_categories', 'supplier_id', id);
    return dbDelete('suppliers', id);
  },

  listSupplierOrders: () => dbList('supplier_orders', 'created_at'),
  listSupplierOrderItems: () => dbList('supplier_order_items', 'created_at'),
  createSupplierOrder: async (order, items) => {
    const created = await dbInsert('supplier_orders', { ...order, order_code: order.order_code || idCode('SO'), status: order.status || 'pending' });
    for (const item of items) await dbInsert('supplier_order_items', { ...item, supplier_order_id: created.id });
    return created;
  },
  updateSupplierOrder: (id, row) => dbUpdate('supplier_orders', id, row),
  deleteSupplierOrder: async (id) => {
    await dbDeleteWhere('supplier_order_items', 'supplier_order_id', id);
    return dbDelete('supplier_orders', id);
  },

  listPosOrders: () => dbList('pos_orders', 'created_at'),
  listPosOrderItems: () => dbList('pos_order_items', 'created_at'),
  createPosOrder: async (order, items) => {
    const created = await dbInsert('pos_orders', { ...order, order_code: order.order_code || idCode('POS'), paid_at: order.paid ? now() : null });
    for (const item of items) {
      await dbInsert('pos_order_items', { ...item, pos_order_id: created.id });
      await api.updateProductStock(item.product_id, -Number(item.quantity || 0));
    }
    if (created.paid) {
      await insertPaymentRow({
        pos_order_id: created.id,
        order_code: created.order_code,
        amount: Number(created.total_price || 0),
        payment_date: created.paid_at || created.created_at || now(),
        note: 'Full payment'
      });
    }
    return created;
  },
  updatePosOrder: (id, row) => dbUpdate('pos_orders', id, row),
  listPosPayments: () => listPaymentRows(),
  createPosPayment: async (row) => {
    const order = await dbGet('pos_orders', row.pos_order_id);
    if (!order) throw new Error('POS order was not found.');

    const payments = await dbListWhere('pos_payments', 'pos_order_id', order.id);
    const alreadyPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = Number(order.total_price || 0);
    const amount = Number(row.amount || 0);
    if (!amount || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    if (alreadyPaid + amount > total + 0.009) throw new Error('Payment amount is greater than the remaining balance.');

    const payment = await insertPaymentRow({
      ...row,
      order_code: order.order_code,
      amount,
      payment_date: row.payment_date || now()
    });

    const newPaidTotal = alreadyPaid + amount;
    await api.updatePosOrder(order.id, {
      paid: newPaidTotal >= total - 0.009,
      paid_at: newPaidTotal >= total - 0.009 ? payment.payment_date : null
    });

    return payment;
  },
  deletePosOrder: async (id) => {
    const orderItems = await dbListWhere('pos_order_items', 'pos_order_id', id);
    for (const item of orderItems) await api.updateProductStock(item.product_id, Number(item.quantity || 0));
    await deletePaymentRowsForOrder(id);
    await dbDeleteWhere('pos_order_items', 'pos_order_id', id);
    return dbDelete('pos_orders', id);
  },

  listExpenses: () => dbList('expenses', 'created_at'),
  createExpense: (row) => dbInsert('expenses', { ...row, expense_code: row.expense_code || idCode('EXP') }),
  updateExpense: (id, row) => dbUpdate('expenses', id, row),

  clearCache: clearListCache
};

// Every write clears the list cache before and after it runs, so pages reload
// fresh data after a change and writes never decide based on cached rows.
for (const [name, fn] of Object.entries(api)) {
  if (name.startsWith('list') || name === 'getUserAccess' || name === 'clearCache') continue;
  api[name] = async (...args) => {
    clearListCache();
    try {
      return await fn(...args);
    } finally {
      clearListCache();
    }
  };
}