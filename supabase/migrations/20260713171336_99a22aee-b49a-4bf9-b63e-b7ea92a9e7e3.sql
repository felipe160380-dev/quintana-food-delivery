
CREATE TYPE public.app_role AS ENUM ('customer','merchant','courier','admin');
CREATE TYPE public.order_status AS ENUM ('pending','accepted','preparing','ready','out_for_delivery','delivered','cancelled');
CREATE TYPE public.payment_method AS ENUM ('pix','card_online','cash_on_delivery','card_on_delivery');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded');
CREATE TYPE public.vehicle_type AS ENUM ('bike','motorcycle','car','foot');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, phone text, avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, avatar_url) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL, slug text UNIQUE NOT NULL,
  description text, category text, logo_url text, cover_url text, phone text,
  address_line text, city text, state text, postal_code text,
  latitude double precision, longitude double precision,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  min_order numeric(10,2) NOT NULL DEFAULT 0,
  delivery_radius_km numeric(5,2) NOT NULL DEFAULT 5,
  prep_time_min int NOT NULL DEFAULT 30,
  is_online boolean NOT NULL DEFAULT false,
  accepts_pix boolean NOT NULL DEFAULT true,
  accepts_card_online boolean NOT NULL DEFAULT true,
  accepts_cash boolean NOT NULL DEFAULT true,
  accepts_card_on_delivery boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stores_select_online_or_owner" ON public.stores FOR SELECT TO authenticated USING (is_online = true OR owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "stores_insert_owner_merchant" ON public.stores FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.has_role(auth.uid(),'merchant'));
CREATE POLICY "stores_update_owner" ON public.stores FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "stores_delete_owner" ON public.stores FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE TRIGGER stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX stores_online_idx ON public.stores(is_online) WHERE is_online = true;
CREATE INDEX stores_owner_idx ON public.stores(owner_id);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL, description text, price numeric(10,2) NOT NULL,
  image_url text, category text,
  is_available boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select_public" ON public.products FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.stores s WHERE s.id=store_id AND (s.is_online=true OR s.owner_id=auth.uid() OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "products_write_owner" ON public.products FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.owner_id=auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.owner_id=auth.uid()));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX products_store_idx ON public.products(store_id);

CREATE TABLE public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Casa',
  street text NOT NULL, number text, complement text, neighborhood text,
  city text, state text, postal_code text,
  latitude double precision, longitude double precision,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addresses_own" ON public.addresses FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE TABLE public.couriers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  document text,
  vehicle public.vehicle_type NOT NULL DEFAULT 'motorcycle',
  vehicle_plate text,
  is_available boolean NOT NULL DEFAULT false,
  current_lat double precision, current_lng double precision,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.couriers TO authenticated;
GRANT ALL ON public.couriers TO service_role;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "couriers_select_own_or_admin" ON public.couriers FOR SELECT TO authenticated USING (id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "couriers_insert_self" ON public.couriers FOR INSERT TO authenticated WITH CHECK (id=auth.uid() AND public.has_role(auth.uid(),'courier'));
CREATE POLICY "couriers_update_self" ON public.couriers FOR UPDATE TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
CREATE TRIGGER couriers_updated_at BEFORE UPDATE ON public.couriers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  courier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  address_snapshot jsonb NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  subtotal numeric(10,2) NOT NULL,
  delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL,
  payment_method public.payment_method NOT NULL,
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  change_for numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_select_participants" ON public.orders FOR SELECT TO authenticated USING (
  customer_id=auth.uid() OR courier_id=auth.uid()
  OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.owner_id=auth.uid())
  OR (public.has_role(auth.uid(),'courier') AND status='ready' AND courier_id IS NULL)
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "orders_insert_customer" ON public.orders FOR INSERT TO authenticated WITH CHECK (customer_id=auth.uid());
CREATE POLICY "orders_update_participants" ON public.orders FOR UPDATE TO authenticated USING (
  customer_id=auth.uid() OR courier_id=auth.uid()
  OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=store_id AND s.owner_id=auth.uid())
  OR (public.has_role(auth.uid(),'courier') AND status='ready' AND courier_id IS NULL)
);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX orders_customer_idx ON public.orders(customer_id);
CREATE INDEX orders_store_idx ON public.orders(store_id);
CREATE INDEX orders_courier_idx ON public.orders(courier_id);
CREATE INDEX orders_status_idx ON public.orders(status);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items_select_by_order" ON public.order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (
    o.customer_id=auth.uid() OR o.courier_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.owner_id=auth.uid())
    OR public.has_role(auth.uid(),'admin')
  ))
);
CREATE POLICY "order_items_insert_customer" ON public.order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.customer_id=auth.uid())
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider text NOT NULL, external_id text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  amount numeric(10,2) NOT NULL, raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select_by_order" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (
    o.customer_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.owner_id=auth.uid())
    OR public.has_role(auth.uid(),'admin')
  ))
);
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select_participants" ON public.messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (
    o.customer_id=auth.uid() OR o.courier_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.owner_id=auth.uid())
    OR public.has_role(auth.uid(),'admin')
  ))
);
CREATE POLICY "messages_insert_participants" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id=auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND (
    o.customer_id=auth.uid() OR o.courier_id=auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.owner_id=auth.uid())
  ))
);
CREATE INDEX messages_order_idx ON public.messages(order_id, created_at);

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER TABLE public.couriers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;
