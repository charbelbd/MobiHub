import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx-js-style';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { money } from '../lib/utils';
import { basePrice, discountedTotals, lineProfitTotal, lineTotal, profitPrice } from '../lib/pricing';
import { useToast } from '../components/ToastProvider';
import { useBusyGuard } from '../lib/useBusyGuard';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const startOfWeek = (d) => {
  const x = startOfDay(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  return x;
};

const endOfWeek = (d) => {
  const x = startOfWeek(d);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
};

const toInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rangeFor(filter, custom) {
  const n = new Date();

  if (filter === 'day') return [startOfDay(n), endOfDay(n)];
  if (filter === 'week') return [startOfWeek(n), endOfWeek(n)];
  if (filter === 'month') {
    return [
      new Date(n.getFullYear(), n.getMonth(), 1),
      new Date(n.getFullYear(), n.getMonth() + 1, 0, 23, 59, 59, 999),
    ];
  }
  if (filter === 'year') {
    return [
      new Date(n.getFullYear(), 0, 1),
      new Date(n.getFullYear(), 11, 31, 23, 59, 59, 999),
    ];
  }

  const s = custom?.from ? new Date(custom.from + 'T00:00:00') : startOfDay(n);
  const e = custom?.to ? new Date(custom.to + 'T23:59:59.999') : endOfDay(n);
  return [s, e];
}

function inRange(dateValue, filter, custom) {
  const d = new Date(dateValue);
  const [s, e] = rangeFor(filter, custom);
  return d >= s && d <= e;
}

function chartSkeleton(filter, custom) {
  const now = new Date();

  if (filter === 'day') {
    return Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: h === 0 ? '12 AM' : h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`,
      amount: 0,
      events: [],
    }));
  }

  if (filter === 'week') {
    const s = startOfWeek(now);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return {
        key: toInput(d),
        label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        amount: 0,
        events: [],
      };
    });
  }

  if (filter === 'month') {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => ({
      key: String(i + 1),
      label: String(i + 1),
      amount: 0,
      events: [],
    }));
  }

  if (filter === 'year') {
    return monthNames.map((m, i) => ({
      key: String(i),
      label: m,
      amount: 0,
      events: [],
    }));
  }

  const [s, e] = rangeFor(filter, custom);
  const days = Math.max(1, Math.ceil((endOfDay(e) - startOfDay(s)) / 864e5) + 1);

  return Array.from({ length: days }, (_, i) => {
    const d = new Date(s);
    d.setDate(s.getDate() + i);
    return {
      key: toInput(d),
      label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      amount: 0,
      events: [],
    };
  });
}

function chartBucket(dateValue, filter) {
  const d = new Date(dateValue);

  if (filter === 'day') return String(d.getHours());
  if (filter === 'week' || filter === 'custom') return toInput(d);
  if (filter === 'month') return String(d.getDate());
  if (filter === 'year') return String(d.getMonth());

  return toInput(d);
}

function FilterControls({ filter, setFilter, custom, setCustom, allowYear = false }) {
  return (
    <div className="miniFilters">
      <select value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="day">Day</option>
        <option value="week">Week</option>
        <option value="month">Month</option>
        {allowYear && <option value="year">Year</option>}
        <option value="custom">Custom date range</option>
      </select>

      {filter === 'custom' && (
        <>
          <input
            type="date"
            value={custom.from}
            onChange={(e) => setCustom({ ...custom, from: e.target.value })}
          />
          <input
            type="date"
            value={custom.to}
            onChange={(e) => setCustom({ ...custom, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 12 },
  fill: { fgColor: { rgb: '16A34A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top: { style: 'thin', color: { rgb: '15803D' } },
    bottom: { style: 'thin', color: { rgb: '15803D' } },
    left: { style: 'thin', color: { rgb: '15803D' } },
    right: { style: 'thin', color: { rgb: '15803D' } },
  },
};

const CATEGORY_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: '15803D' } },
  fill: { fgColor: { rgb: 'DCFCE7' } },
  border: {
    top: { style: 'medium', color: { rgb: '86EFAC' } },
    bottom: { style: 'medium', color: { rgb: '86EFAC' } },
    left: { style: 'thin', color: { rgb: '86EFAC' } },
    right: { style: 'thin', color: { rgb: '86EFAC' } },
  },
};

const CATEGORY_QTY_STYLE = {
  ...CATEGORY_STYLE,
  alignment: { horizontal: 'center', vertical: 'center' },
};

const CATEGORY_VALUE_STYLE = {
  ...CATEGORY_STYLE,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: '$#,##0.00',
};

const PRODUCT_STYLE = {
  font: { sz: 11 },
  border: {
    top: { style: 'thin', color: { rgb: 'DCE7DF' } },
    bottom: { style: 'thin', color: { rgb: 'DCE7DF' } },
    left: { style: 'thin', color: { rgb: 'DCE7DF' } },
    right: { style: 'thin', color: { rgb: 'DCE7DF' } },
  },
};

const PRODUCT_QTY_STYLE = {
  ...PRODUCT_STYLE,
  alignment: { horizontal: 'center', vertical: 'center' },
};

const PRODUCT_VALUE_STYLE = {
  ...PRODUCT_STYLE,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: '$#,##0.00',
};

const GRAND_TOTAL_STYLE = {
  font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '0F2518' } },
  border: {
    top: { style: 'medium', color: { rgb: '0F2518' } },
    bottom: { style: 'medium', color: { rgb: '0F2518' } },
    left: { style: 'medium', color: { rgb: '0F2518' } },
    right: { style: 'medium', color: { rgb: '0F2518' } },
  },
};

const GRAND_TOTAL_QTY_STYLE = {
  ...GRAND_TOTAL_STYLE,
  alignment: { horizontal: 'center', vertical: 'center' },
};

const GRAND_TOTAL_VALUE_STYLE = {
  ...GRAND_TOTAL_STYLE,
  alignment: { horizontal: 'right', vertical: 'center' },
  numFmt: '$#,##0.00',
};

export default function Finance({ refreshKey, refresh }) {
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [payments, setPayments] = useState([]);
  const [supplierOrders, setSupplierOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricFilter, setMetricFilter] = useState('day');
  const [expenseFilter, setExpenseFilter] = useState('day');
  const [chartFilter, setChartFilter] = useState('day');
  const [modal, setModal] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState({});
  const [exporting, setExporting] = useState(false);

  const today = toInput(new Date());

  const [metricCustom, setMetricCustom] = useState({ from: today, to: today });
  const [expenseCustom, setExpenseCustom] = useState({ from: today, to: today });
  const [chartCustom, setChartCustom] = useState({ from: today, to: today });

  const load = () => {
    setLoading(true);
    return Promise.all([
      api.listPosOrders(),
      api.listPosOrderItems(),
      api.listPosPayments(),
      api.listSupplierOrders(),
      api.listExpenses(),
      api.listCategories(),
      api.listProducts(),
    ]).then(([o, i, p, so, e, c, pr]) => {
      setOrders(o);
      setItems(i);
      setPayments(p);
      setSupplierOrders(so);
      setExpenses(e);
      setCategories(c);
      setProducts(pr);
    }).catch(err => {
      toast(err.message || 'Could not load finance data', 'error');
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const paymentsByOrder = useMemo(() => {
    const map = {};
    payments.forEach((p) => {
      (map[p.pos_order_id] ||= []).push(p);
    });
    return map;
  }, [payments]);

  const orderProfit = (o) => {
    const stored = Number(o.total_profit);

    if (o.total_profit !== undefined && o.total_profit !== null && Number.isFinite(stored)) {
      return stored;
    }

    const orderItems = items.filter((i) => i.pos_order_id === o.id);

    const profitSubtotal = orderItems.reduce((s, i) => {
      const product = products.find((p) => p.id === i.product_id);
      return s + lineProfitTotal(i.profit_price ?? profitPrice(product), i.quantity);
    }, 0);

    return discountedTotals(
      Number(o.subtotal || 0),
      profitSubtotal,
      o.discount_type,
      o.discount_value
    ).profit;
  };

  const paymentEvents = useMemo(() => {
    const events = [];

    orders.forEach((o) => {
      const orderPayments = paymentsByOrder[o.id] || [];

      if (orderPayments.length) {
        orderPayments.forEach((p) =>
          events.push({
            order: o,
            amount: Number(p.amount || 0),
            date: p.payment_date || p.created_at,
            label: p.note || 'Payment',
          })
        );
      } else if (o.paid) {
        events.push({
          order: o,
          amount: Number(o.total_price || 0),
          date: o.paid_at || o.created_at,
          label: 'Legacy full payment',
        });
      }
    });

    return events;
  }, [orders, paymentsByOrder]);

  const metricPayments = paymentEvents.filter((e) =>
    inRange(e.date, metricFilter, metricCustom)
  );

  const revenue = metricPayments.reduce((s, e) => s + Number(e.amount || 0), 0);

  const totalProfit = metricPayments.reduce((s, e) => {
    const total = Number(e.order.total_price || 0);
    return s + (total ? orderProfit(e.order) * (Number(e.amount || 0) / total) : 0);
  }, 0);

  const totalStockPrice = products.reduce(
    (s, p) => s + lineTotal(basePrice(p), p.quantity),
    0
  );

  const metricSupplierExpenses = supplierOrders
    .filter((o) => o.status === 'arrived' && inRange(o.created_at, metricFilter, metricCustom))
    .reduce((s, o) => s + Number(o.total_price || 0), 0);

  const metricManualExpenses = expenses
    .filter((e) => inRange(e.created_at, metricFilter, metricCustom))
    .reduce((s, e) => s + Number(e.price || 0), 0);

  const totalExpenses = metricSupplierExpenses + metricManualExpenses;

  const paidAmountForOrder = (order) => {
    const paidFromPayments = Number(
      (paymentsByOrder[order.id] || []).reduce((s, p) => s + Number(p.amount || 0), 0)
    );

    if (paidFromPayments <= 0 && order.paid) {
      return Number(order.total_price || 0);
    }

    return paidFromPayments;
  };

  const totalNotPaid = orders
    .filter((o) => inRange(o.created_at, metricFilter, metricCustom))
    .reduce((s, o) => {
      const total = Number(o.total_price || 0);
      const paid = paidAmountForOrder(o);
      const balance = Math.max(0, total - paid);

      return s + balance;
    }, 0);

  const reportTotal = revenue - totalExpenses + totalStockPrice + totalNotPaid;

  const phoneRevenue = (categoryName) => {
    const cat = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase()
    );

    const productIds = products
      .filter((p) => p.category_id === cat?.id)
      .map((p) => p.id);

    return items
      .filter((i) => productIds.includes(i.product_id))
      .reduce((s, i) => {
        const order = orders.find((o) => o.id === i.pos_order_id);
        if (!order) return s;

        const paidForOrder = metricPayments
          .filter((e) => e.order.id === order.id)
          .reduce((x, e) => x + Number(e.amount || 0), 0);

        const ratio = Number(order.total_price || 0)
          ? paidForOrder / Number(order.total_price || 0)
          : 0;

        return s + Number(i.total_price || 0) * ratio;
      }, 0);
  };

  const expenseSupplierRows = supplierOrders.filter(
    (o) => o.status === 'arrived' && inRange(o.created_at, expenseFilter, expenseCustom)
  );

  const expenseManualRows = expenses.filter((e) =>
    inRange(e.created_at, expenseFilter, expenseCustom)
  );

  const chart = useMemo(() => {
    const rows = chartSkeleton(chartFilter, chartCustom);

    paymentEvents
      .filter((e) => inRange(e.date, chartFilter, chartCustom))
      .forEach((e) => {
        const key = chartBucket(e.date, chartFilter);
        const row = rows.find((r) => r.key === key);

        if (row) {
          row.amount += Number(e.amount || 0);
          row.events.push(
            `${e.order.order_code || 'POS order'} • ${new Date(e.date).toLocaleString('en-GB')} • ${money(e.amount)}`
          );
        }
      });

    return rows;
  }, [paymentEvents, chartFilter, chartCustom]);

  const [savingExpense, guardSaveExpense] = useBusyGuard();
  const saveExpense = guardSaveExpense(async (e) => {
    e.preventDefault();

    const f = new FormData(e.currentTarget);

    try {
      await api.createExpense({
        description: f.get('description'),
        price: Number(f.get('price')),
      });

      setModal(false);
      await load();
      refresh();
      toast('Expense added successfully');
    } catch (err) {
      toast(err.message || 'Could not add expense', 'error');
    }
  });

  const allCategoriesSelected = useMemo(
    () => categories.length > 0 && categories.every((c) => selectedCategories[c.id]),
    [categories, selectedCategories]
  );

  const openExportModal = () => {
    const initial = {};
    categories.forEach((c) => {
      initial[c.id] = true;
    });
    setSelectedCategories(initial);
    setExportModal(true);
  };

  const handleSelectAll = (checked) => {
    const next = {};
    categories.forEach((c) => {
      next[c.id] = checked;
    });
    setSelectedCategories(next);
  };

  const handleToggleCategory = (catId) => {
    setSelectedCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const selectedCount = useMemo(
    () => categories.filter((c) => selectedCategories[c.id]).length,
    [categories, selectedCategories]
  );

  const exportStockToExcel = async () => {
    const selectedCatIds = categories
      .filter((c) => selectedCategories[c.id])
      .map((c) => c.id);

    if (selectedCatIds.length === 0) {
      toast('Please select at least one category to export', 'error');
      return;
    }

    setExporting(true);

    try {
      const selectedCategoriesData = categories.filter((c) => selectedCategories[c.id]);

      // Build the worksheet rows: header, then for each category: a category row + product rows.
      const aoa = [['Category / Product', 'Quantity', 'Stock Value']];
      const rowMeta = [{ type: 'header' }];

      let grandTotalQty = 0;
      let grandTotalProductCount = 0;
      let grandTotalValue = 0;

      selectedCategoriesData.forEach((category) => {
        const catProducts = products.filter((p) => p.category_id === category.id);
        const catTotalQty = catProducts.reduce(
          (s, p) => s + Number(p.quantity || 0),
          0
        );
        const catTotalValue = catProducts.reduce(
          (s, p) => s + lineTotal(basePrice(p), p.quantity),
          0
        );

        // Category row
        aoa.push([category.name, catTotalQty, catTotalValue]);
        rowMeta.push({ type: 'category', productCount: catProducts.length });

        // Product rows
        catProducts.forEach((p) => {
          const qty = Number(p.quantity || 0);
          const value = lineTotal(basePrice(p), p.quantity);
          aoa.push([`    ${p.name}`, qty, value]);
          rowMeta.push({ type: 'product' });
        });

        grandTotalQty += catTotalQty;
        grandTotalProductCount += catProducts.length;
        grandTotalValue += catTotalValue;
      });

      // Grand total row
      aoa.push(['GRAND TOTAL', grandTotalProductCount, grandTotalValue]);
      rowMeta.push({ type: 'grand' });

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // Apply styles row by row.
      const totalRows = aoa.length;
      for (let r = 0; r < totalRows; r++) {
        const meta = rowMeta[r];
        const aAddr = XLSX.utils.encode_cell({ r, c: 0 });
        const bAddr = XLSX.utils.encode_cell({ r, c: 1 });
        const cAddr = XLSX.utils.encode_cell({ r, c: 2 });

        if (meta.type === 'header') {
          ws[aAddr] = { v: aoa[r][0], t: 's', s: HEADER_STYLE };
          ws[bAddr] = { v: aoa[r][1], t: 's', s: HEADER_STYLE };
          ws[cAddr] = { v: aoa[r][2], t: 's', s: HEADER_STYLE };
        } else if (meta.type === 'category') {
          ws[aAddr] = {
            v: aoa[r][0],
            t: 's',
            s: { ...CATEGORY_STYLE, alignment: { horizontal: 'left', vertical: 'center' } },
          };
          ws[bAddr] = { v: aoa[r][1], t: 'n', s: CATEGORY_QTY_STYLE };
          ws[cAddr] = { v: aoa[r][2], t: 'n', s: CATEGORY_VALUE_STYLE };
        } else if (meta.type === 'product') {
          ws[aAddr] = {
            v: aoa[r][0],
            t: 's',
            s: { ...PRODUCT_STYLE, alignment: { horizontal: 'left', vertical: 'center' } },
          };
          ws[bAddr] = { v: aoa[r][1], t: 'n', s: PRODUCT_QTY_STYLE };
          ws[cAddr] = { v: aoa[r][2], t: 'n', s: PRODUCT_VALUE_STYLE };
        } else if (meta.type === 'grand') {
          ws[aAddr] = {
            v: aoa[r][0],
            t: 's',
            s: { ...GRAND_TOTAL_STYLE, alignment: { horizontal: 'left', vertical: 'center' } },
          };
          ws[bAddr] = { v: aoa[r][1], t: 'n', s: GRAND_TOTAL_QTY_STYLE };
          ws[cAddr] = { v: aoa[r][2], t: 'n', s: GRAND_TOTAL_VALUE_STYLE };
        }
      }

      // Column widths and row heights
      ws['!cols'] = [{ wch: 42 }, { wch: 14 }, { wch: 18 }];
      ws['!rows'] = aoa.map((_, idx) => {
        const meta = rowMeta[idx];
        if (meta.type === 'header') return { hpt: 24 };
        if (meta.type === 'category') return { hpt: 22 };
        if (meta.type === 'grand') return { hpt: 28 };
        return { hpt: 18 };
      });

      // Freeze the header row so it stays visible when scrolling.
      ws['!freeze'] = { xSplit: '0', ySplit: '1', topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Export');

      const filename = `Stock_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);

      setExportModal(false);
      toast(`Stock exported: ${selectedCatIds.length} categor${selectedCatIds.length === 1 ? 'y' : 'ies'}`);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Could not export stock', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Financial Dashboard</h1>
          <p>Revenue and profit are based on actual POS payment dates, including partial payments.</p>
        </div>
        <div className="actionGroup">
          <button className="secondary" onClick={openExportModal}>
            Export Stock
          </button>
          <button className="primary" onClick={() => setModal(true)}>
            Add Expense
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)' }}>
          Loading financial data...
        </div>
      )}

      {!loading && <>

      <div className="dashboardFilter">
        <div>
          <b>Revenue & Profit Filter</b>
          <p>Total revenue, total profit, net profit, used phones, and new phones use this shared filter.</p>
        </div>
        <FilterControls
          filter={metricFilter}
          setFilter={setMetricFilter}
          custom={metricCustom}
          setCustom={setMetricCustom}
        />
      </div>

      <div className="metrics">
        <div>
          <span>Total revenue</span>
          <b>{money(revenue)}</b>
        </div>
        <div>
          <span>Total Profit</span>
          <b>{money(totalProfit)}</b>
        </div>
        <div>
          <span>Total Stock Price</span>
          <b>{money(totalStockPrice)}</b>
        </div>
        <div>
          <span>Expenses</span>
          <b>{money(totalExpenses)}</b>
        </div>
        <div>
          <span>Total Not Paid</span>
          <b>{money(totalNotPaid)}</b>
        </div>
        <div>
          <span>Report</span>
          <b>{money(reportTotal)}</b>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div>
            <h2>Financial Line Chart</h2>
            <p>POS payments are plotted by their actual payment date, including partial payments.</p>
          </div>
          <FilterControls
            filter={chartFilter}
            setFilter={setChartFilter}
            custom={chartCustom}
            setCustom={setChartCustom}
            allowYear
          />
        </div>

        <ResponsiveContainer width="100%" height={330}>
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={(v) => `$${v}`} />
            <Tooltip
              formatter={(v, _, p) => [
                money(v),
                p.payload.events?.join('\n') || 'No POS payments',
              ]}
              labelFormatter={(label) => `Period: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="var(--green)"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="dashboardFilter">
        <div>
          <b>Expenses Table Filter</b>
          <p>Filters supplier order expenses and manual expenses separately from dashboard cards.</p>
        </div>
        <FilterControls
          filter={expenseFilter}
          setFilter={setExpenseFilter}
          custom={expenseCustom}
          setCustom={setExpenseCustom}
        />
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>ID</th>
              <th>Description / Supplier</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {expenseSupplierRows.map((o) => (
              <tr key={o.id}>
                <td>Supplier order</td>
                <td>{o.order_code}</td>
                <td>{o.supplier_name}</td>
                <td>{money(o.total_price)}</td>
              </tr>
            ))}

            {expenseManualRows.map((e) => (
              <tr key={e.id}>
                <td>Manual expense</td>
                <td>{e.expense_code}</td>
                <td>{e.description}</td>
                <td>{money(e.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Add Expense" onClose={() => setModal(false)}>
          <form className="form" onSubmit={saveExpense}>
            <label>
              Description
              <input
                name="description"
                required
                placeholder="Example: Rent, delivery, utilities"
              />
            </label>

            <label>
              Price
              <input
                name="price"
                required
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </label>

            <button className="primary" disabled={savingExpense}>{savingExpense ? 'Saving...' : 'Save Expense'}</button>
          </form>
        </Modal>
      )}

      {exportModal && (
        <Modal title="Export Stock to Excel" onClose={() => setExportModal(false)}>
          <div className="form">
            <p style={{ margin: 0, color: 'var(--muted)' }}>
              Select the categories you want to include in the Excel export. The file will group products by category, show category totals, and end with a grand total row.
            </p>

            <label className="checkboxRow" style={{
              background: 'var(--soft)',
              border: '1px solid #b9ebc9',
              borderRadius: '14px',
              padding: '12px 14px',
              margin: 0,
            }}>
              <input
                type="checkbox"
                checked={allCategoriesSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
              <span style={{ color: 'var(--greenDark)' }}>
                Select All Categories {categories.length > 0 && `(${categories.length})`}
              </span>
            </label>

            <div style={{
              border: '1px solid var(--line)',
              borderRadius: '16px',
              padding: '8px',
              maxHeight: '320px',
              overflow: 'auto',
              display: 'grid',
              gap: '4px',
            }}>
              {loading && (
                <p style={{ margin: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                  Loading...
                </p>
              )}
              {!loading && categories.length === 0 && (
                <p style={{ margin: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                  No categories available.
                </p>
              )}
              {categories.map((c) => {
                const catProducts = products.filter((p) => p.category_id === c.id);
                return (
                  <label
                    key={c.id}
                    className="permissionCheck"
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selectedCategories[c.id])}
                      onChange={() => handleToggleCategory(c.id)}
                    />
                    <span>
                      {c.name}
                      <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>
                        ({catProducts.length} product{catProducts.length === 1 ? '' : 's'})
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="modalActions">
              <button
                className="ghost"
                type="button"
                onClick={() => setExportModal(false)}
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                className="primary"
                type="button"
                onClick={exportStockToExcel}
                disabled={exporting || selectedCount === 0}
              >
                {exporting ? 'Exporting...' : `Export${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
      </>}
    </div>
  );
}