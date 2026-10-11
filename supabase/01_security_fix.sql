-- STEP 1: security fix. Changes access rules only; no rows are modified or deleted.
-- Run it in one go in the Supabase SQL Editor, ideally while the shop is closed.
-- If anything fails, the whole script is cancelled (it runs in one transaction).
--
-- After this:
--   * Signed-out visitors can't read or write anything.
--   * A signed-in account only gets access if its email is listed in app_users
--     (so strangers who sign up with the public key get nothing).
--   * Only admins / users with the "users" permission can manage app_users
--     or change passwords.

begin;

-- Helper checks. SECURITY DEFINER lets them read app_users regardless of RLS.
create or replace function public.is_app_user()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(username) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.can_manage_users()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users
    where lower(username) = lower(auth.jwt() ->> 'email')
      and (is_admin or permissions::text like '%users%')
  );
$$;

revoke execute on function public.is_app_user() from public, anon;
revoke execute on function public.can_manage_users() from public, anon;
grant execute on function public.is_app_user() to authenticated;
grant execute on function public.can_manage_users() to authenticated;

-- Password changes: only callable by signed-in user managers.
create or replace function public.admin_update_user_password(new_password text, target_username text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $function$
begin
  if not public.can_manage_users() then
    raise exception 'Not allowed to change passwords.';
  end if;
  if length(coalesce(new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;

  update auth.users
  set encrypted_password = crypt(new_password, gen_salt('bf')),
      updated_at = now()
  where email = target_username;
end;
$function$;

revoke execute on function public.admin_update_user_password(text, text) from public, anon;
grant execute on function public.admin_update_user_password(text, text) to authenticated;

-- Shop data tables: replace every existing policy with "listed app users only".
do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'categories', 'products', 'suppliers', 'supplier_categories',
    'supplier_orders', 'supplier_order_items',
    'pos_orders', 'pos_order_items', 'pos_payments', 'expenses'
  ] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "app users full access" on public.%I for all to authenticated
         using ((select public.is_app_user())) with check ((select public.is_app_user()))', t);
  end loop;
end $$;

-- app_users: everyone can read their own row (needed to log in);
-- only user managers can see/add/edit/delete users.
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_users' loop
    execute format('drop policy %I on public.app_users', p.policyname);
  end loop;
end $$;

alter table public.app_users enable row level security;

create policy "read own row or manage users" on public.app_users
  for select to authenticated
  using (lower(username) = lower(auth.jwt() ->> 'email') or (select public.can_manage_users()));

create policy "user managers insert" on public.app_users
  for insert to authenticated with check ((select public.can_manage_users()));

create policy "user managers update" on public.app_users
  for update to authenticated
  using ((select public.can_manage_users())) with check ((select public.can_manage_users()));

create policy "user managers delete" on public.app_users
  for delete to authenticated using ((select public.can_manage_users()));

-- Indexes for lookups the app does (speed only, no data change).
create index if not exists pos_order_items_pos_order_id_idx on public.pos_order_items (pos_order_id);
create index if not exists pos_order_items_product_id_idx on public.pos_order_items (product_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists supplier_order_items_supplier_order_id_idx on public.supplier_order_items (supplier_order_id);
create index if not exists supplier_categories_category_id_idx on public.supplier_categories (category_id);
create index if not exists pos_orders_created_at_idx on public.pos_orders (created_at desc);

commit;
