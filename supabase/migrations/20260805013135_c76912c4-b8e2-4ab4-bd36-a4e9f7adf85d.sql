ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT SELECT ON public.product_categories TO anon;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_categories_public_read_online_stores ON public.product_categories
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_categories.store_id AND s.is_online = true AND s.approval_status = 'approved'));

CREATE POLICY product_categories_select_public ON public.product_categories
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_categories.store_id AND (s.is_online = true OR s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE POLICY product_categories_write_owner ON public.product_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_categories.store_id AND s.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = product_categories.store_id AND s.owner_id = auth.uid()));

CREATE TRIGGER product_categories_updated_at BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();