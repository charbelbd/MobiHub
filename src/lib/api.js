import { supabase, supabaseConfigured } from './supabase';
import { idCode } from './utils';

const mem = {
  categories: [
    { id: 'cat-used', name: 'Used Phones', description: 'Pre-owned phones', created_at: new Date().toISOString() },
    { id: 'cat-new', name: 'New Phones', description: 'Brand new phones', created_at: new Date().toISOString() },
    { id: 'cat-airpods', name: 'AirPods', description: 'Wireless earbuds', created_at: new Date().toISOString() },
    { id: 'cat-cables', name: 'Cables', description: 'Charging and data cables', created_at: new Date().toISOString() }
  ],
  products: [
    { id: 'prod-1', category_id: 'cat-new', name: 'iPhone 15', description: '128GB', barcode: '1110001', price: 899, quantity: 8, created_at: new Date().toISOString() },
    { id: 'prod-2', category_id: 'cat-used', name: 'Used Samsung S22', description: 'Good condition', barcode: '1110002', price: 360, quantity: 4, created_at: new Date().toISOString() },
    { id: 'prod-3', category_id: 'cat-airpods', name: 'AirPods Pro', description: '2nd generation', barcode: '1110003', price: 219, quantity: 15, created_at: new Date().toISOString() },
    { id: 'prod-4', category_id: 'cat-cables', name: 'USB-C Cable', description: '1 meter cable', barcode: '1110004', price: 12, quantity: 70, created_at: new Date().toISOString() }
  ],
  suppliers: [], supplier_categories: [], supplier_orders: [], supplier_order_items: [], pos_orders: [], pos_order_items: [], expenses: []
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const wait = () => new Promise((r) => setTimeout(r, 60));

async function dbList(table, order = 'created_at') {
  if (!supabaseConfigured) { await wait(); return clone(mem[table] || []); }
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false });
  if (error) throw error;
  return data || [];
}
async function dbInsert(table, row) {
  if (!supabaseConfigured) {
    const item = { id: row.id || idCode(table.slice(0, 3).toUpperCase()), created_at: new Date().toISOString(), ...row };
    mem[table].unshift(item); await wait(); return clone(item);
  }
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}
async function dbUpdate(table, id, changes) {
  if (!supabaseConfigured) {
    const list = mem[table]; const idx = list.findIndex(x => x.id === id);
    if (idx >= 0) list[idx] = { ...list[idx], ...changes, updated_at: new Date().toISOString() };
    await wait(); return clone(list[idx]);
  }
  const { data, error } = await supabase.from(table).update(changes).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
async function dbDelete(table, id) {
  if (!supabaseConfigured) { mem[table] = mem[table].filter(x => x.id !== id); await wait(); return; }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export const api = {
  listCategories: () => dbList('categories', 'name'),
  createCategory: (row) => dbInsert('categories', row),
  listProducts: () => dbList('products', 'name'),
  createProduct: (row) => dbInsert('products', row),
  updateProduct: (id, row) => dbUpdate('products', id, row),
  updateProductStock: async (id, qtyDelta) => {
    const products = await api.listProducts();
    const product = products.find(p => p.id === id);
    return dbUpdate('products', id, { quantity: Math.max(0, Number(product?.quantity || 0) + qtyDelta) });
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
      if (!supabaseConfigured) mem.supplier_categories = mem.supplier_categories.filter(r => r.supplier_id !== id);
      else await supabase.from('supplier_categories').delete().eq('supplier_id', id);
      for (const category_id of categoryIds) await dbInsert('supplier_categories', { supplier_id: id, category_id });
    }
    return updated;
  },
  listSupplierOrders: () => dbList('supplier_orders', 'created_at'),
  listSupplierOrderItems: () => dbList('supplier_order_items', 'created_at'),
  createSupplierOrder: async (order, items) => {
    const created = await dbInsert('supplier_orders', { ...order, order_code: order.order_code || idCode('SO'), status: 'pending' });
    for (const item of items) await dbInsert('supplier_order_items', { ...item, supplier_order_id: created.id });
    return created;
  },
  updateSupplierOrder: (id, row) => dbUpdate('supplier_orders', id, row),
  deleteSupplierOrder: async (id) => {
    if (!supabaseConfigured) mem.supplier_order_items = mem.supplier_order_items.filter(i => i.supplier_order_id !== id);
    else await supabase.from('supplier_order_items').delete().eq('supplier_order_id', id);
    return dbDelete('supplier_orders', id);
  },
  listPosOrders: () => dbList('pos_orders', 'created_at'),
  listPosOrderItems: () => dbList('pos_order_items', 'created_at'),
  createPosOrder: async (order, items) => {
    const created = await dbInsert('pos_orders', { ...order, order_code: order.order_code || idCode('POS') });
    for (const item of items) {
      await dbInsert('pos_order_items', { ...item, pos_order_id: created.id });
      await api.updateProductStock(item.product_id, -Number(item.quantity || 0));
    }
    return created;
  },
  updatePosOrder: (id, row) => dbUpdate('pos_orders', id, row),
  deletePosOrder: async (id) => {
    const orderItems = (await api.listPosOrderItems()).filter(i => i.pos_order_id === id);
    for (const item of orderItems) await api.updateProductStock(item.product_id, Number(item.quantity || 0));
    if (!supabaseConfigured) mem.pos_order_items = mem.pos_order_items.filter(i => i.pos_order_id !== id);
    else await supabase.from('pos_order_items').delete().eq('pos_order_id', id);
    return dbDelete('pos_orders', id);
  },
  listExpenses: () => dbList('expenses', 'created_at'),
  createExpense: (row) => dbInsert('expenses', { ...row, expense_code: row.expense_code || idCode('EXP') })
};
