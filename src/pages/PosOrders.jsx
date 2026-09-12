import { useEffect, useMemo, useState } from 'react';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { formatDate, money } from '../lib/utils';
import { useToast } from '../components/ToastProvider';
import { useBusyGuard } from '../lib/useBusyGuard';
import * as XLSX from 'xlsx-js-style';

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

const monthKeyOf = dateValue => {
  const d = new Date(dateValue);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const THIN_LINE = { style: 'thin', color: { rgb: 'DCE7DF' } };

const EXPORT_TITLE_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: '15803D' } },
  fill: { fgColor: { rgb: 'F0FDF4' } },
  alignment: { horizontal: 'left', vertical: 'center' },
};

const EXPORT_HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: '16A34A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: '15803D' } },
    bottom: { style: 'thin', color: { rgb: '15803D' } },
    left: { style: 'thin', color: { rgb: '15803D' } },
    right: { style: 'thin', color: { rgb: '15803D' } },
  },
};

const EXPORT_TOTAL_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: '0F2518' } },
  fill: { fgColor: { rgb: 'D1FAE5' } },
  border: {
    top: { style: 'medium', color: { rgb: '16A34A' } },
    bottom: { style: 'medium', color: { rgb: '16A34A' } },
    left: { style: 'thin', color: { rgb: '86EFAC' } },
    right: { style: 'thin', color: { rgb: '86EFAC' } },
  },
};

const EXPORT_DATA_BORDER = { top: THIN_LINE, bottom: THIN_LINE, left: THIN_LINE, right: THIN_LINE };

const rowFillFor = status => {
  if (status === 'paid') return { fill: { fgColor: { rgb: 'DCFCE7' } }, color: '166534' };
  if (status === 'partial') return { fill: { fgColor: { rgb: 'FEF3C7' } }, color: '92400E' };
  return { fill: { fgColor: { rgb: 'FEE2E2' } }, color: '991B1B' };
};

export default function PosOrders({ refreshKey, refresh, currentUserAccess }) {
  const toast = useToast();

  const canDeleteOrders = String(currentUserAccess?.username || '').trim().toLowerCase() === 'boss@badboy.com';

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

  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPaidFilter, setExportPaidFilter] = useState('all');
  const [exportMonths, setExportMonths] = useState({});

  const load = () => {
    setLoading(true);
    return Promise.all([api.listPosOrders(), api.listPosOrderItems(), api.listPosPayments()]).then(([o, i, p]) => {
      setOrders(o);
      setItems(i);
      setPayments(p);
    }).catch(err => {
      toast(err.message || 'Could not load POS orders', 'error');
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

  const availableMonths = useMemo(() => {
    const map = new Map();
    orders.forEach(o => {
      const key = monthKeyOf(o.created_at);
      if (!map.has(key)) {
        const d = new Date(o.created_at);
        map.set(key, new Date(d.getFullYear(), d.getMonth(), 1));
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, date]) => ({
        key,
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      }));
  }, [orders]);

  const openExportModal = () => {
    const initial = {};
    availableMonths.forEach(m => { initial[m.key] = true; });
    setExportMonths(initial);
    setExportPaidFilter('all');
    setExportModal(true);
  };

  const toggleExportMonth = key => setExportMonths(prev => ({ ...prev, [key]: !prev[key] }));

  const allExportMonthsSelected =
    availableMonths.length > 0 && availableMonths.every(m => exportMonths[m.key]);

  const handleSelectAllMonths = checked => {
    const next = {};
    availableMonths.forEach(m => { next[m.key] = checked; });
    setExportMonths(next);
  };

  const monthOrderCount = key =>
    orders.filter(
      o => monthKeyOf(o.created_at) === key && (exportPaidFilter === 'all' || statusFor(o) === exportPaidFilter)
    ).length;

  const selectedMonthCount = availableMonths.filter(m => exportMonths[m.key]).length;

  const exportOrdersToExcel = async () => {
    const selectedKeys = availableMonths.filter(m => exportMonths[m.key]).map(m => m.key);

    if (!selectedKeys.length) {
      toast('Please select at least one month to export', 'error');
      return;
    }

    setExporting(true);

    try {
      const monthlyData = selectedKeys
        .map(key => {
          const monthOrders = orders
            .filter(o => {
              if (monthKeyOf(o.created_at) !== key) return false;
              if (exportPaidFilter !== 'all' && statusFor(o) !== exportPaidFilter) return false;
              return true;
            })
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          return { key, monthOrders };
        })
        .filter(m => m.monthOrders.length > 0);

      if (!monthlyData.length) {
        toast('No orders match the selected filters', 'error');
        setExporting(false);
        return;
      }

      const wb = XLSX.utils.book_new();

      // ---- Summary sheet ----
      const summaryHeader = ['Month', 'Orders', 'Paid', 'Partially Paid', 'Not Paid', 'Total Sales', 'Total Collected', 'Outstanding'];
      const summaryAoa = [['POS Orders Export Summary'], [], summaryHeader];
      const summaryMeta = [{ type: 'title' }, { type: 'blank' }, { type: 'header' }];

      const grand = { orders: 0, paid: 0, partial: 0, unpaid: 0, sales: 0, collected: 0, balance: 0 };

      monthlyData.forEach(({ key, monthOrders }) => {
        const monthMeta = availableMonths.find(m => m.key === key);
        const paidCount = monthOrders.filter(o => statusFor(o) === 'paid').length;
        const partialCount = monthOrders.filter(o => statusFor(o) === 'partial').length;
        const unpaidCount = monthOrders.filter(o => statusFor(o) === 'unpaid').length;
        const sales = monthOrders.reduce((s, o) => s + Number(o.total_price || 0), 0);
        const collected = monthOrders.reduce((s, o) => s + Number(paidByOrder[o.id] || 0), 0);
        const balance = sales - collected;

        summaryAoa.push([monthMeta.label, monthOrders.length, paidCount, partialCount, unpaidCount, sales, collected, balance]);
        summaryMeta.push({ type: 'data' });

        grand.orders += monthOrders.length;
        grand.paid += paidCount;
        grand.partial += partialCount;
        grand.unpaid += unpaidCount;
        grand.sales += sales;
        grand.collected += collected;
        grand.balance += balance;
      });

      summaryAoa.push(['GRAND TOTAL', grand.orders, grand.paid, grand.partial, grand.unpaid, grand.sales, grand.collected, grand.balance]);
      summaryMeta.push({ type: 'grand' });

      const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
      summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
      summaryWs['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];

      summaryAoa.forEach((row, r) => {
        const meta = summaryMeta[r];
        row.forEach((val, c) => {
          const addr = XLSX.utils.encode_cell({ r, c });
          const isMoney = c >= 5;
          if (meta.type === 'title') {
            summaryWs[addr] = { v: val, t: 's', s: EXPORT_TITLE_STYLE };
          } else if (meta.type === 'header') {
            summaryWs[addr] = { v: val, t: 's', s: EXPORT_HEADER_STYLE };
          } else if (meta.type === 'grand') {
            summaryWs[addr] = {
              v: val,
              t: c === 0 ? 's' : 'n',
              s: {
                ...EXPORT_TOTAL_STYLE,
                alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center' },
                ...(isMoney ? { numFmt: '$#,##0.00' } : {}),
              },
            };
          } else if (meta.type === 'data') {
            summaryWs[addr] = {
              v: val,
              t: c === 0 ? 's' : 'n',
              s: {
                font: { sz: 11 },
                border: EXPORT_DATA_BORDER,
                alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center' },
                ...(isMoney ? { numFmt: '$#,##0.00' } : {}),
              },
            };
          }
        });
      });

      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      // ---- One sheet per month ----
      monthlyData.forEach(({ key, monthOrders }) => {
        const monthMeta = availableMonths.find(m => m.key === key);
        const headerRow = ['Order ID', 'Client', 'Date', 'Price', 'Paid', 'Balance', 'Discount', 'Status'];
        const aoa = [[`POS Orders — ${monthMeta.label}`], [], headerRow];
        const meta = [{ type: 'title' }, { type: 'blank' }, { type: 'header' }];

        let sumPrice = 0;
        let sumPaid = 0;
        let sumBalance = 0;

        monthOrders.forEach(o => {
          const status = statusFor(o);
          const paidAmt = Number(paidByOrder[o.id] || 0);
          const balance = balanceFor(o);
          sumPrice += Number(o.total_price || 0);
          sumPaid += paidAmt;
          sumBalance += balance;

          aoa.push([
            o.order_code,
            o.client_name || '-',
            formatDate(o.created_at),
            Number(o.total_price || 0),
            paidAmt,
            balance,
            discountLabel(o),
            status === 'paid' ? 'Paid' : status === 'partial' ? 'Partially Paid' : 'Not Paid',
          ]);
          meta.push({ type: 'data', status });
        });

        aoa.push(['TOTAL', '', '', sumPrice, sumPaid, sumBalance, '', `${monthOrders.length} order${monthOrders.length === 1 ? '' : 's'}`]);
        meta.push({ type: 'total' });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
        ws['!cols'] = [{ wch: 18 }, { wch: 20 }, { wch: 17 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];

        aoa.forEach((row, r) => {
          const m = meta[r];
          row.forEach((val, c) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            const isMoney = c === 3 || c === 4 || c === 5;

            if (m.type === 'title') {
              ws[addr] = { v: val, t: 's', s: EXPORT_TITLE_STYLE };
            } else if (m.type === 'header') {
              ws[addr] = { v: val, t: 's', s: EXPORT_HEADER_STYLE };
            } else if (m.type === 'data') {
              const rowColor = rowFillFor(m.status);
              ws[addr] = {
                v: val,
                t: isMoney ? 'n' : 's',
                s: {
                  font: { sz: 11, color: { rgb: rowColor.color } },
                  fill: rowColor.fill,
                  border: EXPORT_DATA_BORDER,
                  alignment: { horizontal: isMoney ? 'right' : c === 7 ? 'center' : 'left', vertical: 'center' },
                  ...(isMoney ? { numFmt: '$#,##0.00' } : {}),
                },
              };
            } else if (m.type === 'total') {
              ws[addr] = {
                v: val,
                t: isMoney ? 'n' : 's',
                s: {
                  ...EXPORT_TOTAL_STYLE,
                  alignment: { horizontal: isMoney ? 'right' : 'left', vertical: 'center' },
                  ...(isMoney ? { numFmt: '$#,##0.00' } : {}),
                },
              };
            }
          });
        });

        const sheetName = monthMeta.label.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const filename = `POS_Orders_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      const totalExported = monthlyData.reduce((s, m) => s + m.monthOrders.length, 0);
      setExportModal(false);
      toast(`Exported ${totalExported} order${totalExported === 1 ? '' : 's'} across ${monthlyData.length} month${monthlyData.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast(err.message || 'Could not export orders', 'error');
    } finally {
      setExporting(false);
    }
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

  const [savingPayment, guardSavePayment] = useBusyGuard();
  const savePayment = guardSavePayment(async e => {
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
  });

  const [deleting, guardDelete] = useBusyGuard();
  const confirmDelete = guardDelete(async () => {
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
  });

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>POS Orders</h1>
          <p>Review sales, unpaid orders, discounts, partial payments, and client names.</p>
        </div>
        <div className="actionGroup">
          <button className="secondary" onClick={openExportModal}>
            Export to Excel
          </button>
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
              {canDeleteOrders && <th>Delete</th>}
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
                  {canDeleteOrders && (
                    <td>
                      <button className="ghost dangerText" onClick={() => setDeleteOrder(o)}>
                        Delete
                      </button>
                    </td>
                  )}
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
                <td colSpan={canDeleteOrders ? 11 : 10} className="emptyCell">
                  {loading ? 'Loading orders...' : 'No POS orders match the selected filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title="POS Order Details" onClose={() => setDetail(null)} wide>
          <div className="orderDetailHeader">
            <div>
              <h3 className="orderDetailCode">{detail.order_code}</h3>
              {detail.client_name && <p className="orderDetailClient">{detail.client_name}</p>}
            </div>
            <span className={`pill ${balanceFor(detail) <= 0 ? 'good' : 'bad'}`}>
              {balanceFor(detail) <= 0 ? 'Paid' : 'Balance due'}
            </span>
          </div>

          <div className="orderStats">
            <div className="statCard">
              <span>Date</span>
              <b>{formatDate(detail.created_at)}</b>
            </div>
            <div className="statCard">
              <span>Discount</span>
              <b>{discountLabel(detail)}</b>
            </div>
            <div className="statCard">
              <span>Paid</span>
              <b>{money(paidByOrder[detail.id] || 0)}</b>
            </div>
            <div className="statCard">
              <span>Balance</span>
              <b>{money(balanceFor(detail))}</b>
            </div>
          </div>

          <div className="orderDetailSection">
            <h4>Items</h4>
            <div className="orderItemsList">
              {items
                .filter(i => i.pos_order_id === detail.id)
                .map(i => (
                  <div className="orderItemRow" key={i.id}>
                    <span className="orderItemName">{i.product_name}</span>
                    <span className="orderItemQty">
                      {i.quantity} × {money(i.unit_price)}
                    </span>
                    <b className="orderItemTotal">{money(i.total_price)}</b>
                  </div>
                ))}
            </div>
          </div>

          <div className="orderGrandTotal">
            <span>Total</span>
            <b>{money(detail.total_price)}</b>
          </div>

          <div className="orderDetailSection">
            <h4>Payments</h4>
            <div className="orderPaymentsList">
              {payments
                .filter(p => p.pos_order_id === detail.id)
                .map(p => (
                  <div className="orderPaymentRow" key={p.id}>
                    <div>
                      <b>{p.note || 'Payment'}</b>
                      <span>{formatDate(p.payment_date)}</span>
                    </div>
                    <b className="orderPaymentAmount">{money(p.amount)}</b>
                  </div>
                ))}
              {!payments.filter(p => p.pos_order_id === detail.id).length && detail.paid && (
                <div className="orderPaymentRow">
                  <div>
                    <b>Legacy full payment</b>
                    <span>{formatDate(detail.paid_at || detail.created_at)}</span>
                  </div>
                  <b className="orderPaymentAmount">{money(detail.total_price)}</b>
                </div>
              )}
            </div>
          </div>
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
            <button className="primary" disabled={savingPayment}>{savingPayment ? 'Saving...' : 'Save Payment'}</button>
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
              <button className="primary dangerButton" disabled={deleting} onClick={confirmDelete}>
                {deleting ? 'Deleting...' : 'Delete & Restore Stock'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {exportModal && (
        <Modal title="Export POS Orders to Excel" onClose={() => setExportModal(false)}>
          <div className="form">
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              The file will include a Summary sheet plus one sheet per selected month, with orders
              color-coded by payment status.
            </p>

            <label>
              Payment status
              <select value={exportPaidFilter} onChange={e => setExportPaidFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="partial">Partially Paid</option>
                <option value="unpaid">Not Paid</option>
              </select>
            </label>

            <label
              className="checkboxRow"
              style={{
                background: 'var(--soft)',
                border: '1px solid #b9ebc9',
                borderRadius: '14px',
                padding: '12px 14px',
                margin: 0,
              }}
            >
              <input
                type="checkbox"
                checked={allExportMonthsSelected}
                onChange={e => handleSelectAllMonths(e.target.checked)}
              />
              <span style={{ color: 'var(--greenDark)' }}>
                Select All Months {availableMonths.length > 0 && `(${availableMonths.length})`}
              </span>
            </label>

            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: '16px',
                padding: '8px',
                maxHeight: '320px',
                overflow: 'auto',
                display: 'grid',
                gap: '4px',
              }}
            >
              {loading && (
                <p style={{ margin: '12px', color: 'var(--muted)', textAlign: 'center' }}>Loading...</p>
              )}
              {!loading && availableMonths.length === 0 && (
                <p style={{ margin: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                  No POS orders available.
                </p>
              )}
              {availableMonths.map(m => (
                <label key={m.key} className="permissionCheck" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(exportMonths[m.key])}
                    onChange={() => toggleExportMonth(m.key)}
                  />
                  <span>
                    {m.label}
                    <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>
                      ({monthOrderCount(m.key)} order{monthOrderCount(m.key) === 1 ? '' : 's'})
                    </small>
                  </span>
                </label>
              ))}
            </div>

            <div className="modalActions">
              <button className="ghost" type="button" onClick={() => setExportModal(false)} disabled={exporting}>
                Cancel
              </button>
              <button
                className="primary"
                type="button"
                onClick={exportOrdersToExcel}
                disabled={exporting || selectedMonthCount === 0}
              >
                {exporting ? 'Exporting...' : `Export${selectedMonthCount > 0 ? ` (${selectedMonthCount})` : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}