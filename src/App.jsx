import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar';
import Login from './components/Login';
import POS from './pages/POS';
import Stock from './pages/Stock';
import Suppliers from './pages/Suppliers';
import PosOrders from './pages/PosOrders';
import Finance from './pages/Finance';
import Users from './pages/Users';
import { supabase, supabaseConfigured } from './lib/supabase';
import { ToastProvider } from './components/ToastProvider';
import { api } from './lib/api';
import { ALL_PERMISSION_IDS, canAccess, normalizePermissions } from './lib/permissions';

export default function App() {
  const [user, setUser] = useState(null);
  const [access, setAccess] = useState(null);
  const [authError, setAuthError] = useState('');
  const [page, setPage] = useState('pos');
  const [refresh, setRefresh] = useState(0);

  const allowedPages = useMemo(() => {
    if (!access) return [];
    return access.is_admin ? ALL_PERMISSION_IDS : normalizePermissions(access.permissions);
  }, [access]);

  const loadAccess = async (authUser) => {
    if (!authUser) return;
    setAuthError('');
    try {
      const currentAccess = await api.getUserAccess(authUser);
      setAccess(currentAccess);
      const nextAllowed = currentAccess.is_admin ? ALL_PERMISSION_IDS : normalizePermissions(currentAccess.permissions);
      if (!nextAllowed.includes(page)) setPage(nextAllowed[0] || 'pos');
    } catch (err) {
      setAccess(null);
      setAuthError(err.message);
      if (supabaseConfigured) await supabase.auth.signOut();
      setUser(null);
    }
  };

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadAccess(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAccess(null);
      if (session?.user) loadAccess(session.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogin = async (authUser) => {
    setUser(authUser);
    await loadAccess(authUser);
  };

  const logout = async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
    setUser(null);
    setAccess(null);
  };

  if (!user) return <Login onLogin={handleLogin} authError={authError} />;
  if (!access) return <main className="loginPage"><div className="loginCard"><p>Loading permissions...</p></div></main>;

  const guardedSetPage = (nextPage) => {
    if (canAccess(access, nextPage)) setPage(nextPage);
  };

  const props = { refreshKey: refresh, refresh: () => setRefresh(x => x + 1) };

  return <ToastProvider>
    <div className="appShell">
      <Sidebar page={page} setPage={guardedSetPage} onLogout={logout} access={access}/>
      <section className="content">
        {!allowedPages.length && <div className="panel">No page permissions assigned. Ask an Admin to update your user.</div>}
        {page === 'pos' && canAccess(access, 'pos') && <POS {...props}/>} 
        {page === 'stock' && canAccess(access, 'stock') && <Stock {...props}/>} 
        {page === 'suppliers' && canAccess(access, 'suppliers') && <Suppliers {...props}/>} 
        {page === 'orders' && canAccess(access, 'orders') && <PosOrders {...props}/>} 
        {page === 'finance' && canAccess(access, 'finance') && <Finance {...props}/>} 
        {page === 'users' && canAccess(access, 'users') && <Users {...props} currentUserAccess={access}/>} 
      </section>
    </div>
  </ToastProvider>;
}
