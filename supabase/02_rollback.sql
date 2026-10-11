-- EMERGENCY ROLLBACK for 01_security_fix.sql.
-- Use only if staff are locked out after the fix. It goes back to
-- "any signed-in account can access everything" (the old rules on most tables),
-- but keeps signed-out visitors blocked and keeps the password function locked.
-- No rows are modified or deleted.

begin;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'categories', 'products', 'suppliers', 'supplier_categories',
    'supplier_orders', 'supplier_order_items',
    'pos_orders', 'pos_order_items', 'pos_payments', 'expenses', 'app_users'
  ] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated
         using (true) with check (true)', t);
  end loop;
end $$;

commit;
