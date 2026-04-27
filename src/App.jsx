import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import POS from './pages/POS';
import Stock from './pages/Stock';
import Suppliers from './pages/Suppliers';
import PosOrders from './pages/PosOrders';
import Finance from './pages/Finance';
import { supabase, supabaseConfigured } from './lib/supabase';
import { ToastProvider } from './components/ToastProvider';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('pos');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const logout = async () => { if (supabaseConfigured) await supabase.auth.signOut(); setUser(null); };
  if (!user) return <Login onLogin={setUser} />;
  const props = { refreshKey: refresh, refresh: () => setRefresh(x => x + 1) };
  return <ToastProvider><div className="appShell"><Sidebar page={page} setPage={setPage} onLogout={logout}/><section className="content">
    {page === 'pos' && <POS {...props}/>} {page === 'stock' && <Stock {...props}/>} {page === 'suppliers' && <Suppliers {...props}/>} {page === 'orders' && <PosOrders {...props}/>} {page === 'finance' && <Finance {...props}/>} 
  </section></div></ToastProvider>;
}
