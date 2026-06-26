import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/utils';
import { allocateDiscountedProfit, discountedTotals, finalPrice, lineProfitTotal, profitPrice } from '../lib/pricing';
import { useToast } from '../components/ToastProvider';

export default function POS({ refresh }) {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''), [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]), [discountType, setDiscountType] = useState('%'), [discount, setDiscount] = useState(0), [clientName, setClientName] = useState('');
  const scannerBufferRef = useRef('');
  const scannerStartedAtRef = useRef(0);
  const lastScannerKeyAtRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    api.listProducts().then(setProducts).finally(() => setLoading(false));
  }, []);

  const availableStock = (productId) => Number(products.find(p => p.id === productId)?.quantity || 0);

  const updateCartQuantity = (productId, change) => {
    const stock = availableStock(productId);
    setCart(prev => prev.flatMap(item => {
      if (item.product_id !== productId) return [item];
      const nextQuantity = item.quantity + change;
      if (nextQuantity < 1) return [];
      if (nextQuantity > stock) {
        toast('Quantity cannot exceed available stock', 'error');
        return [item];
      }
      return [{ ...item, quantity: nextQuantity }];
    }));
  };

  const addProduct = (product) => {
    const q = Math.max(1, Number(qty || 1));
    const existingQuantity = cart.find(i => i.product_id === product.id)?.quantity || 0;
    if (existingQuantity + q > Number(product.quantity || 0)) return toast('Not enough stock for this product', 'error');
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
    <div className="cards productCards">{loading ? <p className="emptyCell">Loading products...</p> : filteredProducts.map(p => <button className="productCard" key={p.id} onClick={()=>addProduct(p)}><b>{p.name}</b><span>{p.description}</span><strong>{money(finalPrice(p))}</strong><small>Stock: {p.quantity} | Barcode: {p.barcode || '-'}</small></button>)}</div>
  </section><aside className="orderBox"><div className="orderBoxHeader"><h2>POS Order</h2><label>Client name (optional)<input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Client name" /></label><label>Quantity before selecting<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} /></label></div><div className="cartList">{cart.map(i => <div className="cartItem" key={i.product_id}><div><b>{i.name}</b><span>{i.quantity} × {money(i.price)} profit {money(i.profit_price)} each</span><small>Available stock: {availableStock(i.product_id)}</small></div><div className="quantityControls"><button type="button" onClick={()=>updateCartQuantity(i.product_id,-1)}><Minus size={15}/></button><b>{i.quantity}</b><button type="button" disabled={i.quantity >= availableStock(i.product_id)} onClick={()=>updateCartQuantity(i.product_id,1)}><Plus size={15}/></button></div><strong>{money(i.quantity*i.price)}</strong><button type="button" className="removeCartItem" onClick={()=>setCart(cart.filter(x=>x.product_id!==i.product_id))}><Trash2 size={16}/></button></div>)}</div><div className="orderBoxFooter"><div className="discountRow"><select value={discountType} onChange={e=>setDiscountType(e.target.value)}><option>%</option><option>$</option></select><input type="number" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="Discount"/></div><div className="totals"><span>Subtotal {money(subtotal)}</span><span>Discount {discountType === '%' ? `${discount || 0}%` : money(discount || 0)} ({money(discountValue)} applied)</span><b>Total {money(total)}</b></div><button className="secondary" onClick={()=>submit(false)}>Pay Later</button><button className="primary" onClick={()=>submit(true)}>Submit Order</button></div></aside></div>;
}