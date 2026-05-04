import { ShoppingCart, Boxes, Truck, ReceiptText, ChartNoAxesCombined, LogOut, Users } from 'lucide-react';
import logo from '../assets/logo.jpeg';
import { canAccess } from '../lib/permissions';

const items = [
  ['pos', 'POS', ShoppingCart],
  ['stock', 'Stock Management', Boxes],
  ['suppliers', 'Suppliers & Orders', Truck],
  ['orders', 'POS Orders', ReceiptText],
  ['finance', 'Financial Dashboard', ChartNoAxesCombined],
  ['users', 'Users Page', Users]
];

export default function Sidebar({ page, setPage, onLogout, access }) {
  const visibleItems = items.filter(([id]) => canAccess(access, id));

  return <aside className="sidebar">
    <div className="sidebar-logo"><img src={logo} alt="Logo" /></div>
    <nav>{visibleItems.map(([id, label, Icon]) => (
      <button key={id} onClick={() => setPage(id)} className={page === id ? 'active' : ''}>
        <Icon size={20}/><span>{label}</span>
      </button>
    ))}</nav>
    <button className="logout" onClick={onLogout}><LogOut size={20}/><span>Logout</span></button>
  </aside>;
}
