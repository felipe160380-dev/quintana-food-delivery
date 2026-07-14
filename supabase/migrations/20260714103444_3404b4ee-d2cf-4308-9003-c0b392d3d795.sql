CREATE TABLE public.store_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  rating smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, customer_id)
);

CREATE INDEX store_reviews_store_idx ON public.store_reviews(store_id);

GRANT SELECT ON public.store_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_reviews TO authenticated;
GRANT ALL ON public.store_reviews TO service_role;

ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_select_all" ON public.store_reviews FOR SELECT USING (true);

CREATE POLICY "reviews_insert_own_delivered" ON public.store_reviews
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = customer_id
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.customer_id = auth.uid() AND o.status = 'delivered' AND o.store_id = store_reviews.store_id
  )
);

CREATE POLICY "reviews_update_own" ON public.store_reviews
FOR UPDATE TO authenticated
USING (auth.uid() = customer_id)
WITH CHECK (auth.uid() = customer_id AND rating BETWEEN 1 AND 5);

CREATE POLICY "reviews_delete_own" ON public.store_reviews
FOR DELETE TO authenticated USING (auth.uid() = customer_id);

ALTER TABLE public.store_reviews ADD CONSTRAINT store_reviews_rating_range CHECK (rating BETWEEN 1 AND 5);

CREATE TRIGGER store_reviews_set_updated_at BEFORE UPDATE ON public.store_reviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.store_reviews;