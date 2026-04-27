import { createContext, useContext, useMemo, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2000);
  };
  const value = useMemo(() => showToast, []);
  return <ToastContext.Provider value={value}>{children}<div className="toastStack">{toasts.map((toast) => <div className={`toast ${toast.type}`} key={toast.id}>{toast.message}</div>)}</div></ToastContext.Provider>;
}

export const useToast = () => useContext(ToastContext);
