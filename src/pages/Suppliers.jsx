import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { formatDate, money } from '../lib/utils';
import { finalPrice, profitPrice } from '../lib/pricing';
import { useToast } from '../components/ToastProvider';

export default function Suppliers({ refreshKey, refresh }) {
  const toast = useToast();

  const [tab, setTab] = useState('suppliers');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [relations, setRelations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [deleteSupplier, setDeleteSupplier] = useState(null);
  const [lines, setLines] = useState([]);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('day');
  const [cancelOrder, setCancelOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return Promise.all([
      api.listCategories(),
      api.listProducts(),
      api.listSuppliers(),
      api.listSupplierCategories(),
      api.listSupplierOrders(),
      api.listSupplierOrderItems()
    ]).then(([c, p, s, r, o, i]) => {
      setCategories(c);
      setProducts(p);
      setSuppliers(s);
      setRelations(r);
      setOrders(o);
      setItems(i);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const saveSupplier = async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);
    const row = {
      name: f.get('name'),
      description: f.get('description'),
      phone_number: f.get('phone_number')
    };
    const cats = f.getAll('categories');

    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, row, cats);
        toast('Supplier updated successfully');
      } else {
        await api.createSupplier(row, cats);
        toast('Supplier added successfully');
      }

      setEditingSupplier(null);
      setModal(null);
      await load();
      refresh();
    } catch (err) {
      toast(err.message || 'Supplier action failed', 'error');
    }
  };

  const confirmDeleteSupplier = async () => {
    if (!deleteSupplier) return;

    try {
      await api.deleteSupplier(deleteSupplier.id);
      setDeleteSupplier(null);
      await load();
      refresh();
      toast('Supplier deleted successfully');
    } catch (err) {
      toast(err.message || 'Could not delete supplier', 'error');
    }
  };

  const saveOrder = async e => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    if (!lines.length) {
      return toast('Add at least one product line before saving', 'error');
    }

    const supplier = suppliers.find(s => s.id === f.get('supplier_id'));

    if (!supplier) {
      return toast('Select a supplier before saving', 'error');
    }

    const total = lines.reduce((s, l) => s + Number(l.total_price), 0);

    try {
      await api.createSupplierOrder(
        {
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          total_price: total
        },
        lines
      );

      setLines([]);
      setModal(null);
      await load();
      refresh();
      toast('Supplier order created successfully');
    } catch (err) {
      toast(err.message || 'Could not create supplier order', 'error');
    }
  };

  const markArrived = async o => {
    try {
      for (const it of items.filter(i => i.supplier_order_id === o.id)) {
        await api.updateProductStock(it.product_id, Number(it.quantity));
      }

      await api.updateSupplierOrder(o.id, {
        status: 'arrived',
        arrived_at: new Date().toISOString()
      });

      await load();
      refresh();
      toast('Supplier order marked as arrived');
    } catch (err) {
      toast(err.message || 'Could not mark supplier order as arrived', 'error');
    }
  };

  const cancelConfirmed = async () => {
    if (!cancelOrder) return;

    try {
      await api.deleteSupplierOrder(cancelOrder.id);
      setCancelOrder(null);
      await load();
      refresh();
      toast('Order cancelled successfully');
    } catch (err) {
      toast(err.message || 'Could not cancel supplier order', 'error');
    }
  };

  const filteredOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    const now = new Date();

    if (filter === 'day') return d.toDateString() === now.toDateString();
    if (filter === 'week') return now - d < 7 * 864e5;
    if (filter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filter === 'year') return d.getFullYear() === now.getFullYear();

    return true;
  });

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Suppliers & Orders</h1>
          <p>Manage suppliers, purchase orders, and arrived stock.</p>
        </div>

        <button
          className="primary"
          onClick={() => {
            setEditingSupplier(null);
            setModal(tab === 'suppliers' ? 'supplier' : 'order');
          }}
        >
          {tab === 'suppliers' ? 'Add Supplier' : 'Add Order'}
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'suppliers' ? 'active' : ''} onClick={() => setTab('suppliers')}>
          Suppliers
        </button>
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
          Orders
        </button>
      </div>

      {tab === 'orders' && (
        <select className="filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="day">day</option>
          <option value="week">week</option>
          <option value="month">month</option>
          <option value="year">year</option>
          <option value="custom">custom</option>
        </select>
      )}

      <div className="tableWrap">
        <table>
          <thead>
            {tab === 'suppliers' ? (
              <tr>
                <th>Name</th>
                <th>Products provided</th>
                <th>Description</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            ) : (
              <tr>
                <th>Order ID</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total</th>
                <th>Mark as Arrived</th>
                <th>Cancel</th>
                <th>View Details</th>
              </tr>
            )}
          </thead>

          <tbody>
            {tab === 'suppliers'
              ? suppliers.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>
                      {relations
                        .filter(r => r.supplier_id === s.id)
                        .map(r => categories.find(c => c.id === r.category_id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </td>
                    <td>{s.description}</td>
                    <td>{s.phone_number}</td>
                    <td>
                      <div className="tableActions">
                        <button
                          className="ghost"
                          onClick={() => {
                            setEditingSupplier(s);
                            setModal('supplier');
                          }}
                        >
                          Edit
                        </button>

                        <button className="ghost dangerText" onClick={() => setDeleteSupplier(s)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              : filteredOrders.map(o => (
                  <tr key={o.id}>
                    <td>{o.order_code}</td>
                    <td>{o.supplier_name}</td>
                    <td>{formatDate(o.created_at)}</td>
                    <td>{money(o.total_price)}</td>
                    <td>
                      <button
                        disabled={o.status === 'arrived'}
                        className="secondary"
                        onClick={() => markArrived(o)}
                      >
                        {o.status === 'arrived' ? 'Arrived' : 'Mark as Arrived'}
                      </button>
                    </td>
                    <td>
                      {o.status === 'arrived' ? (
                        <span className="mutedText">Unavailable</span>
                      ) : (
                        <button className="ghost dangerText" onClick={() => setCancelOrder(o)}>
                          Cancel
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="ghost" onClick={() => setDetail(o)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}

            {loading && (
              <tr>
                <td colSpan="7" className="emptyCell">Loading...</td>
              </tr>
            )}

            {!loading && tab === 'suppliers' && !suppliers.length && (
              <tr>
                <td colSpan="5" className="emptyCell">
                  No suppliers yet.
                </td>
              </tr>
            )}

            {!loading && tab === 'orders' && !filteredOrders.length && (
              <tr>
                <td colSpan="7" className="emptyCell">
                  No supplier orders match the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal === 'supplier' && (
        <SupplierModal
          supplier={editingSupplier}
          categories={categories}
          relations={relations}
          onClose={() => {
            setModal(null);
            setEditingSupplier(null);
          }}
          onSubmit={saveSupplier}
        />
      )}

      {modal === 'order' && (
        <OrderModal
          onClose={() => {
            setModal(null);
            setLines([]);
          }}
          saveOrder={saveOrder}
          suppliers={suppliers}
          relations={relations}
          categories={categories}
          products={products}
          lines={lines}
          setLines={setLines}
          reload={load}
          refresh={refresh}
          toast={toast}
        />
      )}

      {detail && (
        <Modal title="Order Details" onClose={() => setDetail(null)} wide>
          <h3>{detail.order_code}</h3>

          {items
            .filter(i => i.supplier_order_id === detail.id)
            .map(i => (
              <div className="detailLine" key={i.id}>
                <span>{i.product_name}</span>
                <span>
                  {i.quantity} × {money(i.unit_price)}
                </span>
                <b>{money(i.total_price)}</b>
              </div>
            ))}
        </Modal>
      )}

      {cancelOrder && (
        <Modal title="Cancel Supplier Order" onClose={() => setCancelOrder(null)}>
          <div className="confirmBox">
            <p>Are you sure you want to cancel this supplier order?</p>
            <strong>{cancelOrder.order_code}</strong>

            <div className="modalActions">
              <button className="ghost" onClick={() => setCancelOrder(null)}>
                Keep Order
              </button>
              <button className="primary dangerButton" onClick={cancelConfirmed}>
                Cancel Order
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteSupplier && (
        <Modal title="Delete Supplier" onClose={() => setDeleteSupplier(null)}>
          <div className="confirmBox">
            <p>Are you sure you want to delete this supplier?</p>
            <strong>{deleteSupplier.name}</strong>
            <p className="mutedText">
              Suppliers with existing orders will not be deleted to protect order history.
            </p>

            <div className="modalActions">
              <button className="ghost" onClick={() => setDeleteSupplier(null)}>
                Keep Supplier
              </button>

              <button className="primary dangerButton" onClick={confirmDeleteSupplier}>
                Delete Supplier
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SupplierModal({ supplier, categories, relations, onClose, onSubmit }) {
  const selected = relations.filter(r => r.supplier_id === supplier?.id).map(r => r.category_id);

  return (
    <Modal title={supplier ? 'Edit Supplier' : 'Add Supplier'} onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Name
          <input name="name" required defaultValue={supplier?.name || ''} placeholder="Supplier name" />
        </label>

        <label>
          Products provided
          <select name="categories" multiple required defaultValue={selected}>
            {categories.map(c => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Description
          <textarea name="description" defaultValue={supplier?.description || ''} placeholder="Products, notes, terms" />
        </label>

        <label>
          Phone number
          <input name="phone_number" defaultValue={supplier?.phone_number || ''} placeholder="Phone number" />
        </label>

        <button className="primary">Save Supplier</button>
      </form>
    </Modal>
  );
}

function OrderModal({
  onClose,
  saveOrder,
  suppliers,
  relations,
  categories,
  products,
  lines,
  setLines,
  reload,
  refresh,
  toast
}) {
  const [sup, setSup] = useState('');
  const [cat, setCat] = useState('');
  const [prod, setProd] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('');
  const [total, setTotal] = useState('');
  const [last, setLast] = useState('unit');
  const [applyProfit, setApplyProfit] = useState(false);
  const [subModal, setSubModal] = useState(null);

  const supplierCats = categories.filter(c =>
    relations.some(r => r.supplier_id === sup && r.category_id === c.id)
  );

  const catProducts = products.filter(p => p.category_id === cat);
  const selectedProduct = products.find(p => p.id === prod);
  const orderTotal = lines.reduce((s, l) => s + Number(l.total_price || 0), 0);

  const recalc = (nextQty = qty, nextUnit = unit, nextTotal = total, nextLast = last) => {
    const q = Number(nextQty || 0);

    if (nextLast === 'unit') {
      const u = Number(nextUnit || 0);
      setTotal(q && u ? (q * u).toFixed(2) : '');
    } else {
      const t = Number(nextTotal || 0);
      setUnit(q && t ? (t / q).toFixed(2) : '');
    }
  };

  const add = () => {
    const p = products.find(x => x.id === prod);

    if (!p) return toast('Select a product before adding the line', 'error');

    const q = Math.max(1, Number(qty || 1));
    const enteredUnit = Number(unit || 0);
    const productProfit = applyProfit ? profitPrice(p) : 0;
    const u = Number(unit || (total ? Number(total) / q : 0));
    const finalUnit = applyProfit ? (enteredUnit || finalPrice(p)) : u;
    const t = Number(total || q * finalUnit);

    setLines([
      ...lines,
      {
        product_id: p.id,
        category_id: cat,
        product_name: p.name,
        quantity: q,
        unit_price: finalUnit,
        profit_price: productProfit,
        total_price: t,
        total_profit: productProfit * q
      }
    ]);

    setProd('');
    setQty(1);
    setUnit('');
    setTotal('');
    setLast('unit');
    setApplyProfit(false);
  };

  const saveCategory = async e => {
    e.preventDefault();

    try {
      const f = new FormData(e.currentTarget);

      const created = await api.createCategory({
        name: f.get('name'),
        description: f.get('description')
      });

      if (sup) {
        await api.createSupplierCategory({
          supplier_id: sup,
          category_id: created.id
        });
      }

      setCat(created.id);
      setSubModal(null);
      await reload();
      refresh();
      toast('Subproduct created successfully');
    } catch (err) {
      toast(err.message || 'Could not create subproduct', 'error');
    }
  };

  const saveProduct = async e => {
    e.preventDefault();

    if (!cat) {
      return toast('Select a subproduct before creating a product', 'error');
    }

    try {
      const f = new FormData(e.currentTarget);

      const created = await api.createProduct({
        category_id: cat,
        name: f.get('name'),
        description: f.get('description'),
        barcode: f.get('barcode'),
        price: Number(f.get('price') || 0),
        profit_price: Number(f.get('profit_price') || 0),
        quantity: Number(f.get('quantity') || 0)
      });

      setProd(created.id);
      setSubModal(null);
      await reload();
      refresh();
      toast('Product created and selected');
    } catch (err) {
      toast(err.message || 'Could not create product', 'error');
    }
  };

  return (
    <Modal title="Add Supplier Order" onClose={onClose} wide>
      <form onSubmit={saveOrder} className="orderModalForm">
        <div className="formSection">
          <label>
            Supplier name
            <select
              name="supplier_id"
              value={sup}
              onChange={e => {
                setSup(e.target.value);
                setCat('');
                setProd('');
              }}
              required
            >
              <option value="">Select supplier</option>
              {suppliers.map(s => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="lineCard">
          <div className="lineCardTitle">
            <div>
              <h3>Product order line</h3>
              <p>Choose a category and product, or create them without leaving this order.</p>
            </div>

            <button type="button" className="secondary" onClick={() => setSubModal('category')}>
              Create New Subproduct
            </button>
          </div>

          <label className="checkboxRow"><input type="checkbox" checked={applyProfit} onChange={e => { const checked = e.target.checked; setApplyProfit(checked); if (selectedProduct) { const nextUnit = checked ? finalPrice(selectedProduct) : Number(selectedProduct.price || 0); setUnit(String(nextUnit)); recalc(qty, nextUnit, total, 'unit'); } }} /> Apply product profit to this supplier order line</label>

          <div className="lineBuilder pro">
            <label>
              Subproduct / category
              <select
                value={cat}
                onChange={e => {
                  setCat(e.target.value);
                  setProd('');
                }}
              >
                <option value="">Select category</option>
                {supplierCats.map(c => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Product
              <select value={prod} onChange={e => { setProd(e.target.value); const p = products.find(x => x.id === e.target.value); if (p && !unit) setUnit(String(applyProfit ? finalPrice(p) : Number(p.price || 0))); }} disabled={!cat}>
                <option value="">Select product</option>
                {catProducts.map(p => (
                  <option value={p.id} key={p.id}>
                    {p.name} - final {money(finalPrice(p))}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quantity
              <input
                type="number"
                min="1"
                value={qty}
                onChange={e => {
                  setQty(e.target.value);
                  recalc(e.target.value, unit, total, last);
                }}
              />
            </label>

            <label>
              Unit price
              <input
                type="number"
                step="0.01"
                value={unit}
                onChange={e => {
                  setUnit(e.target.value);
                  setLast('unit');
                  recalc(qty, e.target.value, total, 'unit');
                }}
              />
            </label>

            <label>
              Total price
              <input
                type="number"
                step="0.01"
                value={total}
                onChange={e => {
                  setTotal(e.target.value);
                  setLast('total');
                  recalc(qty, unit, e.target.value, 'total');
                }}
              />
            </label>
          </div>

          <div className="lineActions">
            <button type="button" className="ghost" disabled={!cat} onClick={() => setSubModal('product')}>
              Create New Product
            </button>

            <button type="button" className="secondary addLineButton" onClick={add}>
              Add Product Line
            </button>
          </div>
        </div>

        <div className="lineList">
          {lines.map((l, i) => (
            <div className="detailLine supplierLine" key={i}>
              <span>{l.product_name}</span>
              <span>
                Qty {l.quantity} × {money(l.unit_price)}{Number(l.profit_price || 0) ? ` (profit ${money(l.profit_price)} each)` : ''}
              </span>
              <b>{money(l.total_price)}</b>
              <button className="ghost dangerText" type="button" onClick={() => setLines(lines.filter((_, x) => x !== i))}>
                Delete
              </button>
            </div>
          ))}
        </div>

        <div className="orderTotal">
          <span>Total order amount</span>
          <b>{money(orderTotal)}</b>
        </div>

        <button className="primary">Save Order</button>
      </form>

      {subModal === 'category' && (
        <Modal title="Create New Subproduct" onClose={() => setSubModal(null)}>
          <form onSubmit={saveCategory} className="form">
            <label>
              Name
              <input name="name" required placeholder="Category name" />
            </label>

            <label>
              Description
              <textarea name="description" placeholder="Description" />
            </label>

            <button className="primary">Save Subproduct</button>
          </form>
        </Modal>
      )}

      {subModal === 'product' && (
        <Modal title="Create New Product" onClose={() => setSubModal(null)}>
          <form onSubmit={saveProduct} className="form">
            <label>
              Name
              <input name="name" required placeholder="Product name" />
            </label>

            <label>
              Description
              <textarea name="description" placeholder="Description" />
            </label>

            <label>
              Barcode
              <input name="barcode" autoFocus placeholder="Scan or type barcode" />
            </label>

            <label>
              Price
              <input name="price" type="number" step="0.01" placeholder="Base price / cost" />
            </label>

            <label>
              Profit Price
              <input name="profit_price" type="number" step="0.01" placeholder="Profit added to POS price" />
            </label>

            <label>
              Current quantity
              <input name="quantity" type="number" defaultValue="0" />
            </label>

            <button className="primary">Save Product</button>
          </form>
        </Modal>
      )}
    </Modal>
  );
}