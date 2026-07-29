
-- Leitura pública (visitante não logado) de lojas aprovadas e online
CREATE POLICY "stores_public_read_online_approved"
ON public.stores FOR SELECT TO anon
USING (is_online = true AND approval_status = 'approved');

CREATE POLICY "products_public_read_online_stores"
ON public.products FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.stores s
  WHERE s.id = products.store_id
    AND s.is_online = true
    AND s.approval_status = 'approved'
));

CREATE POLICY "addons_public_read_online_stores"
ON public.product_addons FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.id = product_addons.product_id
    AND s.is_online = true
    AND s.approval_status = 'approved'
));

GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_addons TO anon;
