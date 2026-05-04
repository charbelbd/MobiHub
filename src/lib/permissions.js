export const PAGE_PERMISSIONS = [
  { id: 'pos', label: 'POS Page' },
  { id: 'stock', label: 'Stock Management Page' },
  { id: 'suppliers', label: 'Suppliers & Orders Page' },
  { id: 'orders', label: 'POS Orders Page' },
  { id: 'finance', label: 'Financial Dashboard Page' },
  { id: 'users', label: 'Users Page' }
];

export const ALL_PERMISSION_IDS = PAGE_PERMISSIONS.map((p) => p.id);

export function permissionLabel(id) {
  return PAGE_PERMISSIONS.find((p) => p.id === id)?.label || id;
}

export function normalizePermissions(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

export function canAccess(access, pageId) {
  if (!access) return false;
  if (access.is_admin) return true;
  return normalizePermissions(access.permissions).includes(pageId);
}
