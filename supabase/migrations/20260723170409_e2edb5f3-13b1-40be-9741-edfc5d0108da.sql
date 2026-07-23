
-- 1) Nova tabela: cities
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cities TO authenticated;
GRANT ALL ON public.cities TO service_role;

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

-- Leitura pública apenas de cidades ativas
CREATE POLICY "cities_public_active_read" ON public.cities
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Admin lê tudo (inclusive inativas)
CREATE POLICY "cities_admin_read_all" ON public.cities
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin escreve
CREATE POLICY "cities_admin_insert" ON public.cities
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cities_admin_update" ON public.cities
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cities_admin_delete" ON public.cities
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_cities_updated_at
  BEFORE UPDATE ON public.cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_cities_active ON public.cities (is_active) WHERE is_active = true;

-- 2) Cidade padrão para backfill
INSERT INTO public.cities (name, state, slug)
VALUES ('Quintana', 'SP', 'quintana')
ON CONFLICT (slug) DO NOTHING;

-- 3) Adiciona city_id (nullable inicialmente)
ALTER TABLE public.stores   ADD COLUMN city_id uuid REFERENCES public.cities(id) ON DELETE RESTRICT;
ALTER TABLE public.couriers ADD COLUMN city_id uuid REFERENCES public.cities(id) ON DELETE RESTRICT;
ALTER TABLE public.orders   ADD COLUMN city_id uuid REFERENCES public.cities(id) ON DELETE RESTRICT;

-- 4) Backfill: todos os registros existentes vão para a cidade padrão
UPDATE public.stores   SET city_id = (SELECT id FROM public.cities WHERE slug = 'quintana') WHERE city_id IS NULL;
UPDATE public.couriers SET city_id = (SELECT id FROM public.cities WHERE slug = 'quintana') WHERE city_id IS NULL;
UPDATE public.orders   SET city_id = (SELECT id FROM public.cities WHERE slug = 'quintana') WHERE city_id IS NULL;

-- 5) NOT NULL após backfill
ALTER TABLE public.stores   ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE public.couriers ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE public.orders   ALTER COLUMN city_id SET NOT NULL;

-- 6) Índices de performance
CREATE INDEX idx_stores_city_id   ON public.stores   (city_id);
CREATE INDEX idx_couriers_city_id ON public.couriers (city_id);
CREATE INDEX idx_orders_city_id   ON public.orders   (city_id);

-- 7) Trigger: pedido herda a cidade da loja se vier em branco
CREATE OR REPLACE FUNCTION public.orders_set_city_from_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.city_id IS NULL THEN
    SELECT city_id INTO NEW.city_id FROM public.stores WHERE id = NEW.store_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.orders_set_city_from_store() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_orders_set_city
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_city_from_store();

-- 8) Marca colunas de cidade texto como legado (mantidas por compatibilidade)
COMMENT ON COLUMN public.stores.city IS 'Legado — usar city_id (referência a cities).';
