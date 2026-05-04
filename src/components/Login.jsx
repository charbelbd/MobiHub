import { useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';
import logo from "../assets/logo.jpeg";

export default function Login({ onLogin, authError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (!supabaseConfigured) { onLogin({ email: email || 'demo@admin.local' }); return; }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin(data.user);
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  };
  return <main className="loginPage">
    <form className="loginCard" onSubmit={login}>
      <div className="login-logo">
  <img src={logo} alt="Logo" />
</div>
      {!supabaseConfigured && <div className="notice">Demo mode: add Supabase keys in .env to enable real authentication.</div>}
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com" /></label>
      <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" /></label>
      {(error || authError) && <div className="error">{error || authError}</div>}
      <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
    </form>
  </main>;
}
