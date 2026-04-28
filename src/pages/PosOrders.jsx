import { useEffect, useState } from 'react';
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

export default function PosOrders({ refreshKey, refresh }) {
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [paid, setPaid] = useState('all');
  const [range, setRange] = useState('day');
  const [detail, setDetail] = useState(null);
  const [deleteOrder, setDeleteOrder] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  const load = () =>
    Promise.all([api.listPosOrders(), api.listPosOrderItems()]).then(([o, i]) => {
      setOrders(o);
      setItems(i);
    });

  useEffect(() => {
    load();
  }, [refreshKey]);

  const filtered = orders.filter(o => {
    if (
      clientSearch.trim() &&
      !String(o.client_name || '')
        .toLowerCase()
        .includes(clientSearch.trim().toLowerCase())
    ) {
      return false;
    }

    if (paid !== 'all' && String(o.paid) !== paid) return false;

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
          <p>Review sales, unpaid orders, discounts, and client names.</p>
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
            <option value="true">Paid</option>
            <option value="false">Not Paid</option>
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
              <th>Discount</th>
              <th>Paid / Not Paid</th>
              <th>View Details</th>
              <th>Delete</th>
              <th>Mark as Paid</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(o => (
              <tr key={o.id}>
                <td>{o.order_code}</td>
                <td>{o.client_name || '-'}</td>
                <td>{formatDate(o.created_at)}</td>
                <td>{money(o.total_price)}</td>
                <td>{discountLabel(o)}</td>
                <td>
                  <span className={o.paid ? 'pill good' : 'pill bad'}>
                    {o.paid ? 'Paid' : 'Not Paid'}
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
                  <button
                    disabled={o.paid}
                    className="secondary"
                    onClick={() =>
                      api
                        .updatePosOrder(o.id, {
                          paid: true,
                          paid_at: new Date().toISOString()
                        })
                        .then(() => {
                          load();
                          refresh();
                          toast('POS order marked as paid');
                        })
                    }
                  >
                    Mark as Paid
                  </button>
                </td>
              </tr>
            ))}

            {!filtered.length && (
              <tr>
                <td colSpan="9" className="emptyCell">
                  No POS orders match the selected filters.
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
            <span>Status: {detail.paid ? 'Paid' : 'Not Paid'}</span>
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
        </Modal>
      )}

      {deleteOrder && (
        <Modal title="Delete POS Order" onClose={() => setDeleteOrder(null)}>
          <div className="confirmBox">
            <p>This will delete the POS order and restore every product quantity to stock.</p>
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