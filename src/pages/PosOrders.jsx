import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { formatDate, money } from '../lib/utils';
import { useToast } from '../components/ToastProvider';

const discountLabel = o =>
  Number(o.discount_value || 0)
    ? o.discount_type === '%'
      ? `${Number(o.discount_value)}%`
      : money(o.discount_value)
    : '-';

const inputDateTimeNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export default function PosOrders({ refreshKey, refresh }) {
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState('all');
  const [range, setRange] = useState('day');
  const [detail, setDetail] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [deleteOrder, setDeleteOrder] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const load = () => {
    setLoading(true);
    return Promise.all([api.listPosOrders(), api.listPosOrderItems(), api.listPosPayments()]).then(([o, i, p]) => {
      setOrders(o);
      setItems(i);
      setPayments(p);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const paidByOrder = useMemo(() => {
    const map = {};
    payments.forEach(p => {
      map[p.pos_order_id] = (map[p.pos_order_id] || 0) + Number(p.amount || 0);
    });

    orders.forEach(o => {
      if (o.paid && !map[o.id]) map[o.id] = Number(o.total_price || 0);
    });

    return map;
  }, [orders, payments]);

  const balanceFor = order => Math.max(0, Number(order.total_price || 0) - Number(paidByOrder[order.id] || 0));
  const statusFor = order => {
    const paidAmount = Number(paidByOrder[order.id] || 0);
    const total = Number(order.total_price || 0);
    if (paidAmount >= total - 0.009) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
  };

  const filtered = orders.filter(o => {
    if (
      clientSearch.trim() &&
      !String(o.client_name || '')
        .toLowerCase()
        .includes(clientSearch.trim().toLowerCase())
    ) {
      return false;
    }

    if (paid !== 'all' && statusFor(o) !== paid) return false;

    const d = new Date(o.created_at);
    const n = new Date();

    if (range === 'day') return d.toDateString() === n.toDateString();
    if (range === 'week') return n - d < 7 * 864e5;
    if (range === 'month') return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    if (range === 'year') return d.getFullYear() === n.getFullYear();

    if (range === 'custom') {
      if (from && d < new Date(from)) return false;

      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      return true;
    }

    return true;
  });

  const savePayment = async e => {
    e.preventDefault();
    if (!paymentOrder) return;

    const f = new FormData(e.currentTarget);
    try {
      await api.createPosPayment({
        pos_order_id: paymentOrder.id,
        amount: Number(f.get('amount')),
        payment_date: new Date(f.get('payment_date')).toISOString(),
        note: f.get('note') || null
      });
      setPaymentOrder(null);
      await load();
      refresh();
      toast('Payment saved successfully');
    } catch (err) {
      toast(err.message || 'Could not save payment', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteOrder) return;

    try {
      await api.deletePosOrder(deleteOrder.id);
      setDeleteOrder(null);
      await load();
      refresh();
      toast('POS order deleted and stock restored');
    } catch (err) {
      toast(err.message || 'Could not delete POS order', 'error');
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>POS Orders</h1>
          <p>Review sales, unpaid orders, discounts, partial payments, and client names.</p>
        </div>
      </div>

      <div className="filterBar">
        <div>
          <label>Client name</label>
          <input
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            placeholder="Search client name..."
          />
        </div>

        <div>
          <label>Payment status</label>
          <select value={paid} onChange={e => setPaid(e.target.value)}>
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="partial">Partially Paid</option>
            <option value="unpaid">Not Paid</option>
          </select>
        </div>

        <div>
          <label>Time range</label>
          <select value={range} onChange={e => setRange(e.target.value)}>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {range === 'custom' && (
          <>
            <div>
              <label>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>

            <div>
              <label>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </>
        )}

        <div className="filterCount">
          <span>Count</span>
          <b>{filtered.length}</b>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Client name</th>
              <th>Date</th>
              <th>Price</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Discount</th>
              <th>Status</th>
              <th>View Details</th>
              <th>Delete</th>
              <th>Add Payment</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(o => {
              const status = statusFor(o);
              const paidAmount = Number(paidByOrder[o.id] || 0);
              const balance = balanceFor(o);

              return (
                <tr key={o.id}>
                  <td>{o.order_code}</td>
                  <td>{o.client_name || '-'}</td>
                  <td>{formatDate(o.created_at)}</td>
                  <td>{money(o.total_price)}</td>
                  <td>{money(paidAmount)}</td>
                  <td>{money(balance)}</td>
                  <td>{discountLabel(o)}</td>
                  <td>
                    <span className={status === 'paid' ? 'pill good' : status === 'partial' ? 'pill warn' : 'pill bad'}>
                      {status === 'paid' ? 'Paid' : status === 'partial' ? 'Partially Paid' : 'Not Paid'}
                    </span>
                  </td>
                  <td>
                    <button className="ghost" onClick={() => setDetail(o)}>
                      View
                    </button>
                  </td>
                  <td>
                    <button className="ghost dangerText" onClick={() => setDeleteOrder(o)}>
                      Delete
                    </button>
                  </td>
                  <td>
                    <button disabled={balance <= 0} className="secondary" onClick={() => setPaymentOrder(o)}>
                      Add Payment
                    </button>
                  </td>
                </tr>
              );
            })}

            {!filtered.length && (
              <tr>
                <td colSpan="11" className="emptyCell">
                  {loading ? 'Loading orders...' : 'No POS orders match the selected filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title="POS Order Details" onClose={() => setDetail(null)} wide>
          <h3>
            {detail.order_code} {detail.client_name ? `- ${detail.client_name}` : ''}
          </h3>

          <div className="detailMeta">
            <span>Date: {formatDate(detail.created_at)}</span>
            <span>Discount: {discountLabel(detail)}</span>
            <span>Paid: {money(paidByOrder[detail.id] || 0)}</span>
            <span>Balance: {money(balanceFor(detail))}</span>
          </div>

          {items
            .filter(i => i.pos_order_id === detail.id)
            .map(i => (
              <div className="detailLine" key={i.id}>
                <span>{i.product_name}</span>
                <span>
                  {i.quantity} × {money(i.unit_price)}
                </span>
                <b>{money(i.total_price)}</b>
              </div>
            ))}

          <h2>Total: {money(detail.total_price)}</h2>

          <h3>Payments</h3>
          {payments.filter(p => p.pos_order_id === detail.id).map(p => (
            <div className="detailLine" key={p.id}>
              <span>{formatDate(p.payment_date)}</span>
              <span>{p.note || '-'}</span>
              <b>{money(p.amount)}</b>
            </div>
          ))}
          {!payments.filter(p => p.pos_order_id === detail.id).length && detail.paid && (
            <div className="detailLine">
              <span>{formatDate(detail.paid_at || detail.created_at)}</span>
              <span>Legacy full payment</span>
              <b>{money(detail.total_price)}</b>
            </div>
          )}
        </Modal>
      )}

      {paymentOrder && (
        <Modal title={`Add Payment - ${paymentOrder.order_code}`} onClose={() => setPaymentOrder(null)}>
          <form className="form" onSubmit={savePayment}>
            <label>
              Remaining Balance
              <input value={money(balanceFor(paymentOrder))} disabled />
            </label>
            <label>
              Payment Amount
              <input
                name="amount"
                type="number"
                min="0.01"
                max={balanceFor(paymentOrder)}
                step="0.01"
                defaultValue={balanceFor(paymentOrder)}
                required
              />
            </label>
            <label>
              Payment Date
              <input name="payment_date" type="datetime-local" defaultValue={inputDateTimeNow()} required />
            </label>
            <label>
              Note
              <input name="note" placeholder="Optional note" />
            </label>
            <button className="primary">Save Payment</button>
          </form>
        </Modal>
      )}

      {deleteOrder && (
        <Modal title="Delete POS Order" onClose={() => setDeleteOrder(null)}>
          <div className="confirmBox">
            <p>This will delete the POS order, its payments, and restore every product quantity to stock.</p>
            <strong>{deleteOrder.order_code}</strong>

            <div className="modalActions">
              <button className="ghost" onClick={() => setDeleteOrder(null)}>
                Keep Order
              </button>
              <button className="primary dangerButton" onClick={confirmDelete}>
                Delete & Restore Stock
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}