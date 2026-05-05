import { useEffect, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/utils';
import { allocateDiscountedProfit, discountedTotals, finalPrice, lineProfitTotal, profitPrice } from '../lib/pricing';
import { useToast } from '../components/ToastProvider';

export default function POS({ refresh }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState(''), [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]), [discountType, setDiscountType] = useState('%'), [discount, setDiscount] = useState(0), [clientName, setClientName] = useState('');
  const scannerBufferRef = useRef('');
  const scannerStartedAtRef = useRef(0);
  const lastScannerKeyAtRef = useRef(0);

  useEffect(() => { api.listProducts().then(setProducts); }, []);

  const addProduct = (product) => {
    const q = Math.max(1, Number(qty || 1));
    if (Number(product.quantity || 0) < q) return toast('Not enough stock for this product', 'error');
    const unitPrice = finalPrice(product);
    const unitProfit = profitPrice(product);
    setCart(prev => prev.some(i => i.product_id === product.id)
      ? prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + q } : i)
      : [...prev, { product_id: product.id, name: product.name, price: unitPrice, profit_price: unitProfit, quantity: q }]);
    setQty(1); setSearch('');
  };

  useEffect(() => {
    const scannerMaxGapMs = 50;
    const scannerMinLength = 3;
    const printableKey = (key) => key.length === 1;

    const resetScannerBuffer = () => {
      scannerBufferRef.current = '';
      scannerStartedAtRef.current = 0;
      lastScannerKeyAtRef.current = 0;
    };

    const onKeyDown = (e) => {
      const now = Date.now();
      const gap = now - lastScannerKeyAtRef.current;

      if (e.key === 'Enter') {
        const barcode = scannerBufferRef.current.trim();
        const duration = now - scannerStartedAtRef.current;
        const isScannerInput = barcode.length >= scannerMinLength && duration <= barcode.length * scannerMaxGapMs + scannerMaxGapMs;

        if (isScannerInput) {
          const product = products.find(p => String(p.barcode || '').trim() === barcode);
          e.preventDefault();
          e.stopPropagation();
          if (product) addProduct(product);
          else toast(`No product found for barcode ${barcode}`, 'error');
        }

        resetScannerBuffer();
        return;
      }

      if (!printableKey(e.key)) return;

      if (!lastScannerKeyAtRef.current || gap > scannerMaxGapMs) {
        scannerBufferRef.current = e.key;
        scannerStartedAtRef.current = now;
      } else {
        scannerBufferRef.current += e.key;
      }

      lastScannerKeyAtRef.current = now;

      if (scannerBufferRef.current.length >= scannerMinLength) {
        const duration = now - scannerStartedAtRef.current;
        const looksLikeScanner = duration <= scannerBufferRef.current.length * scannerMaxGapMs;
        if (looksLikeScanner) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [products, qty]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = products.filter(p => {
    if (!normalizedSearch) return true;
    return `${p.name || ''} ${p.barcode || ''}`.toLowerCase().includes(normalizedSearch);
  });

  const subtotal = cart.reduce((s,i)=>s+i.price*i.quantity,0);
  const profitSubtotal = cart.reduce((s,i)=>s+lineProfitTotal(i.profit_price, i.quantity),0);
  const totals = discountedTotals(subtotal, profitSubtotal, discountType, discount);
  const total = totals.total;
  const discountedProfit = totals.profit;
  const discountValue = totals.discountAmount;
  const submit = async (paid) => {
    if (!cart.length) return toast('Add products before submitting an order', 'error');
    const orderItems = allocateDiscountedProfit(cart, discountValue).map(i => ({ product_id: i.product_id, product_name: i.name, unit_price: i.price, profit_price: i.profit_price, quantity: i.quantity, total_price: i.price * i.quantity, total_profit: i.total_profit }));
    await api.createPosOrder({ client_name: clientName || null, subtotal, discount_type: discountType, discount_value: Number(discount || 0), total_price: total, total_profit: discountedProfit, paid }, orderItems);
    setCart([]); setDiscount(0); setClientName(''); refresh(); toast(paid ? 'Order submitted successfully' : 'Order saved as Not Paid');
  };

  return <div className="pageGrid posGrid"><section><div className="pageHeader"><div><h1>POS</h1><p>Scan barcodes, search products, and create orders. POS prices include product profit.</p></div></div>
    <div className="toolbar"><Search size={18}/><input autoFocus placeholder="Search products by name or barcode" value={search} onChange={e=>setSearch(e.target.value)} /></div>
    <div className="cards productCards">{filteredProducts.map(p => <button className="productCard" key={p.id} onClick={()=>addProduct(p)}><b>{p.name}</b><span>{p.description}</span><strong>{money(finalPrice(p))}</strong><small>Stock: {p.quantity} | Barcode: {p.barcode || '-'}</small></button>)}</div>
  </section><aside className="orderBox"><h2>POS Order</h2><label>Client name (optional)<input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Client name" /></label><label>Quantity before selecting<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} /></label><div className="cartList">{cart.map(i => <div className="cartItem" key={i.product_id}><div><b>{i.name}</b><span>{i.quantity} × {money(i.price)} profit {money(i.profit_price)} each</span></div><strong>{money(i.quantity*i.price)}</strong><button onClick={()=>setCart(cart.filter(x=>x.product_id!==i.product_id))}><Trash2 size={16}/></button></div>)}</div><div className="discountRow"><select value={discountType} onChange={e=>setDiscountType(e.target.value)}><option>%</option><option>$</option></select><input type="number" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="Discount"/></div><div className="totals"><span>Subtotal {money(subtotal)}</span><span>Discount {discountType === '%' ? `${discount || 0}%` : money(discount || 0)} ({money(discountValue)} applied)</span><b>Total {money(total)}</b></div><button className="secondary" onClick={()=>submit(false)}>Pay Later</button><button className="primary" onClick={()=>submit(true)}>Submit Order</button></aside></div>;
}
