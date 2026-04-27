import { useEffect, useState } from 'react';
import { ArrowLeft, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { money } from '../lib/utils';
import { useToast } from '../components/ToastProvider';

export default function POS({ refresh }) {
  const toast = useToast();
  const [categories, setCategories] = useState([]), [products, setProducts] = useState([]);
  const [selectedCat, setSelectedCat] = useState(null), [search, setSearch] = useState(''), [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]), [discountType, setDiscountType] = useState('%'), [discount, setDiscount] = useState(0), [clientName, setClientName] = useState('');
  useEffect(() => { Promise.all([api.listCategories(), api.listProducts()]).then(([c,p]) => { setCategories(c); setProducts(p); }); }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
      if (e.key === 'Enter') {
        const product = products.find(p => p.barcode === search.trim());
        if (product) addProduct(product);
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [search, products, qty]);
  const filteredCategories = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  const filteredProducts = products.filter(p => p.category_id === selectedCat?.id).filter(p => `${p.name} ${p.barcode}`.toLowerCase().includes(search.toLowerCase()));
  const addProduct = (product) => {
    const q = Math.max(1, Number(qty || 1));
    if (Number(product.quantity || 0) < q) return toast('Not enough stock for this product', 'error');
    setCart(prev => prev.some(i => i.product_id === product.id) ? prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + q } : i) : [...prev, { product_id: product.id, name: product.name, price: Number(product.price), quantity: q }]);
    setQty(1); setSearch('');
  };
  const subtotal = cart.reduce((s,i)=>s+i.price*i.quantity,0);
  const discountValue = discountType === '%' ? subtotal * Number(discount || 0) / 100 : Number(discount || 0);
  const total = Math.max(0, subtotal - discountValue);
  const submit = async (paid) => {
    if (!cart.length) return toast('Add products before submitting an order', 'error');
    await api.createPosOrder({ client_name: clientName || null, subtotal, discount_type: discountType, discount_value: Number(discount || 0), total_price: total, paid }, cart.map(i => ({ product_id: i.product_id, product_name: i.name, unit_price: i.price, quantity: i.quantity, total_price: i.price * i.quantity })));
    setCart([]); setDiscount(0); setClientName(''); refresh(); toast(paid ? 'Order submitted successfully' : 'Order saved as Not Paid');
  };
  return <div className="pageGrid posGrid"><section><div className="pageHeader"><div><h1>POS</h1><p>Scan barcodes, search products, and create orders.</p></div></div>
    <div className="toolbar"><Search size={18}/><input autoFocus placeholder={selectedCat ? 'Search products by name or barcode / scan barcode' : 'Search categories'} value={search} onChange={e=>setSearch(e.target.value)} /></div>
    {selectedCat ? <><button className="ghost" onClick={() => {setSelectedCat(null); setSearch('');}}><ArrowLeft size={18}/> Back to categories</button><div className="cards productCards">{filteredProducts.map(p => <button className="productCard" key={p.id} onClick={()=>addProduct(p)}><b>{p.name}</b><span>{p.description}</span><strong>{money(p.price)}</strong><small>Stock: {p.quantity} | Barcode: {p.barcode || '-'}</small></button>)}</div></> :
    <div className="cards categoryCards">{filteredCategories.map(c => <button className="categoryCard" key={c.id} onClick={()=>{setSelectedCat(c); setSearch('');}}><b>{c.name}</b><span>{c.description}</span></button>)}</div>}
  </section><aside className="orderBox"><h2>POS Order</h2><label>Client name (optional)<input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Client name" /></label><label>Quantity before selecting<input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} /></label><div className="cartList">{cart.map(i => <div className="cartItem" key={i.product_id}><div><b>{i.name}</b><span>{i.quantity} × {money(i.price)}</span></div><strong>{money(i.quantity*i.price)}</strong><button onClick={()=>setCart(cart.filter(x=>x.product_id!==i.product_id))}><Trash2 size={16}/></button></div>)}</div><div className="discountRow"><select value={discountType} onChange={e=>setDiscountType(e.target.value)}><option>%</option><option>$</option></select><input type="number" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="Discount"/></div><div className="totals"><span>Subtotal {money(subtotal)}</span><span>Discount {discountType === '%' ? `${discount || 0}%` : money(discount || 0)}</span><b>Total {money(total)}</b></div><button className="secondary" onClick={()=>submit(false)}>Pay Later</button><button className="primary" onClick={()=>submit(true)}>Submit Order</button></aside></div>;
}
