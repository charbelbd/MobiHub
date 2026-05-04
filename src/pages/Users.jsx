import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import Modal from '../components/Modal';
import { api } from '../lib/api';
import { ALL_PERMISSION_IDS, PAGE_PERMISSIONS, permissionLabel, normalizePermissions } from '../lib/permissions';
import { useToast } from '../components/ToastProvider';

const emptyForm = {
  name: '',
  last_name: '',
  username: '',
  password: '',
  is_admin: false,
  permissions: ['pos']
};

export default function Users({ refreshKey, refresh, currentUserAccess }) {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPassword, setShowPassword] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setUsers(await api.listAppUsers()); }
    catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const sortedUsers = useMemo(() => [...users].sort((a, b) => String(a.username).localeCompare(String(b.username))), [users]);

  const openCreate = () => {
    setForm(emptyForm);
    setShowPassword(false);
    setModal('form');
  };

  const openEdit = (user) => {
    setShowPassword(false);
    setForm({
      ...user,
      password: '',
      permissions: user.is_admin ? ALL_PERMISSION_IDS : normalizePermissions(user.permissions)
    });
    setModal('form');
  };

  const togglePermission = (id) => {
    setForm((prev) => {
      const permissions = normalizePermissions(prev.permissions);
      return permissions.includes(id)
        ? { ...prev, permissions: permissions.filter((p) => p !== id) }
        : { ...prev, permissions: [...permissions, id] };
    });
  };

  const saveUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name.trim(),
        last_name: form.last_name.trim(),
        username: form.username.trim().toLowerCase(),
        is_admin: Boolean(form.is_admin),
        permissions: form.is_admin ? ALL_PERMISSION_IDS : normalizePermissions(form.permissions)
      };

      if (!payload.name || !payload.username) throw new Error('Name and username are required.');
      if (!payload.is_admin && payload.permissions.length === 0) throw new Error('Select at least one permission.');

      if (form.id) {
        const editPayload = form.password ? { ...payload, password: form.password } : payload;
        await api.updateAppUser(form.id, editPayload);
        toast('User updated.');
      } else {
        await api.createAppUser({ ...payload, password: form.password });
        toast('User created.');
      }

      setModal(null);
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const deleteUser = async (user) => {
    if (currentUserAccess?.id === user.id) {
      toast('You cannot delete your own admin user while logged in.', 'error');
      return;
    }
    if (!window.confirm(`Delete ${user.username}?`)) return;
    try {
      await api.deleteAppUser(user.id);
      toast('User deleted.');
      refresh();
    } catch (err) { toast(err.message, 'error'); }
  };

  return <>
    <header className="pageHeader">
      <div>
        <h1>Users Page</h1>
        <p>Create users and control which pages they can access.</p>
      </div>
      <button className="primary" onClick={openCreate}><Plus size={18}/> Add User</button>
    </header>

    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Last Name</th>
            <th>Username (Gmail)</th>
            <th>Permissions</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan="6">Loading users...</td></tr>}
          {!loading && sortedUsers.length === 0 && <tr><td colSpan="6">No users yet.</td></tr>}
          {!loading && sortedUsers.map((user, index) => {
            const permissions = user.is_admin ? ['Admin - Full Access'] : normalizePermissions(user.permissions).map(permissionLabel);
            return <tr key={user.id}>
              <td>{index + 1}</td>
              <td>{user.name}</td>
              <td>{user.last_name}</td>
              <td>{user.username}</td>
              <td><div className="permissionPills">{permissions.map((p) => <span key={p}>{p}</span>)}</div></td>
              <td>
                <div className="rowActions">
                  <button className="ghost" onClick={() => openEdit(user)}><Pencil size={16}/> Edit</button>
                  <button className="ghost dangerText" onClick={() => deleteUser(user)}><Trash2 size={16}/> Delete</button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    {modal === 'form' && <Modal title={form.id ? 'Edit User' : 'Create User'} onClose={() => setModal(null)} wide>
      <form className="form" onSubmit={saveUser}>
        <div className="twoCols">
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John" /></label>
          <label>Last Name<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Doe" /></label>
        </div>
        <label>Username (Gmail)<input type="email" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="johndoe@gmail.com" /></label>
        <label>Password
          <div className="passwordInputWrap">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={form.id ? "New password (optional)" : "Temporary password"}
            />
            <button
              type="button"
              className="passwordToggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {form.id && <p className="formHint">Leave password empty to keep the current password.</p>}
        <label className="checkboxRow"><input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked, permissions: e.target.checked ? ALL_PERMISSION_IDS : normalizePermissions(form.permissions).length ? normalizePermissions(form.permissions) : ['pos'] })} /> Admin - full access to everything</label>

        <section className="permissionsBox">
          <b>Permissions</b>
          <p>{form.is_admin ? 'Admin users have full access to every page.' : 'Select the pages this user can open. You can edit these permissions anytime.'}</p>
          <div className="permissionGrid">
            {PAGE_PERMISSIONS.filter((p) => p.id !== 'users').map((permission) => (
              <label key={permission.id} className={`permissionCheck ${form.is_admin ? 'disabled' : ''}`}>
                <input
                  type="checkbox"
                  disabled={form.is_admin}
                  checked={form.is_admin || normalizePermissions(form.permissions).includes(permission.id)}
                  onChange={() => togglePermission(permission.id)}
                />
                <span>{permission.label}</span>
              </label>
            ))}
          </div>
        </section>

        <div className="modalActions">
          <button type="button" className="ghost" onClick={() => setModal(null)}>Cancel</button>
          <button className="primary">Save User</button>
        </div>
      </form>
    </Modal>}
  </>;
}
