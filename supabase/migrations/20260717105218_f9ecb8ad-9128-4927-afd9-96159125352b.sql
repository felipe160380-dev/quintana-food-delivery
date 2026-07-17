
-- Admin policies for global access + seed admin user
-- Couriers
CREATE POLICY "couriers_admin_all" ON public.couriers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Stores
CREATE POLICY "stores_admin_all" ON public.stores FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Orders
CREATE POLICY "orders_admin_all" ON public.orders FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Profiles
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User roles (admin can grant/revoke any role)
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Withdrawals
CREATE POLICY "withdrawals_admin_all" ON public.store_withdrawals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Wallet entries admin read
CREATE POLICY "wallet_admin_read" ON public.store_wallet_entries FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Store reviews admin all
CREATE POLICY "reviews_admin_all" ON public.store_reviews FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed admin role for platform owner (felipe160380@gmail.com), if signed up
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'felipe160380@gmail.com'
ON CONFLICT DO NOTHING;

-- Trigger to auto-grant admin on signup for that email
CREATE OR REPLACE FUNCTION public.grant_admin_if_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'felipe160380@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS grant_admin_owner ON auth.users;
CREATE TRIGGER grant_admin_owner AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_if_owner();
