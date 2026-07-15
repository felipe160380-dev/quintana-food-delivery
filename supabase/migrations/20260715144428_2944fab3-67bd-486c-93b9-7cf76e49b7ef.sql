
-- Courier approval workflow
CREATE TYPE public.courier_approval_status AS ENUM ('pending','approved','rejected');
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS approval_status public.courier_approval_status NOT NULL DEFAULT 'pending';
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS approval_note text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Product addons
CREATE TABLE public.product_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  max_qty integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_addons TO authenticated;
GRANT SELECT ON public.product_addons TO anon;
GRANT ALL ON public.product_addons TO service_role;
ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons_read_all" ON public.product_addons FOR SELECT USING (true);
CREATE POLICY "addons_owner_write" ON public.product_addons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.products p JOIN public.stores s ON s.id=p.store_id WHERE p.id=product_id AND s.owner_id=auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.products p JOIN public.stores s ON s.id=p.store_id WHERE p.id=product_id AND s.owner_id=auth.uid()));

-- Order item addons snapshot
CREATE TABLE public.order_item_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_item_addons TO authenticated;
GRANT ALL ON public.order_item_addons TO service_role;
ALTER TABLE public.order_item_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oia_read_participants" ON public.order_item_addons FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.id=order_item_id AND (o.customer_id=auth.uid() OR o.courier_id=auth.uid() OR EXISTS(SELECT 1 FROM public.stores s WHERE s.id=o.store_id AND s.owner_id=auth.uid()))));
CREATE POLICY "oia_insert_own_order" ON public.order_item_addons FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.id=order_item_id AND o.customer_id=auth.uid()));

-- Saved payment methods
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pix','card')),
  label text NOT NULL,
  last4 text,
  brand text,
  pix_key text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pm_owner_all" ON public.payment_methods FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Block chat messages on closed orders
CREATE OR REPLACE FUNCTION public.messages_block_closed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.orders WHERE id = NEW.order_id;
  IF st IN ('delivered','cancelled') THEN
    RAISE EXCEPTION 'Chat encerrado: pedido já finalizado';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_messages_block_closed ON public.messages;
CREATE TRIGGER trg_messages_block_closed BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_block_closed();
