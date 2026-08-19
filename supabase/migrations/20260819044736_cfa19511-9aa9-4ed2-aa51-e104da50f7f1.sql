-- Distância em metros (Haversine)
CREATE OR REPLACE FUNCTION public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE 2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    ))
  END;
$$;

-- Recusas de oferta (para repassar ao próximo entregador)
CREATE TABLE IF NOT EXISTS public.order_offer_declines (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, courier_id)
);

GRANT SELECT, INSERT ON public.order_offer_declines TO authenticated;
GRANT ALL ON public.order_offer_declines TO service_role;

ALTER TABLE public.order_offer_declines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ood_select_own ON public.order_offer_declines;
CREATE POLICY ood_select_own ON public.order_offer_declines FOR SELECT TO authenticated
  USING (courier_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ood_insert_own ON public.order_offer_declines;
CREATE POLICY ood_insert_own ON public.order_offer_declines FOR INSERT TO authenticated
  WITH CHECK (courier_id = auth.uid() AND public.has_role(auth.uid(), 'courier'));

-- Pedidos disponíveis para o entregador logado, com distância e prioridade do mais próximo
CREATE OR REPLACE FUNCTION public.courier_available_orders()
RETURNS TABLE(
  order_id uuid, store_id uuid, store_name text, store_logo_url text, store_address text,
  store_lat double precision, store_lng double precision,
  customer_address jsonb, delivery_fee numeric, total numeric,
  distance_m double precision, ready_at timestamptz, is_priority boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me public.couriers;
BEGIN
  SELECT * INTO me FROM public.couriers WHERE id = auth.uid();
  IF NOT FOUND OR me.approval_status <> 'approved' OR me.is_suspended OR NOT me.is_available THEN
    RETURN;
  END IF;
  -- entregador com entrega ativa não recebe novas ofertas
  IF EXISTS (SELECT 1 FROM public.orders o
              WHERE o.courier_id = me.id AND o.status IN ('ready','out_for_delivery')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH elig_orders AS (
    SELECT o.*, s.name AS s_name, s.logo_url AS s_logo, s.address_line AS s_addr,
           s.latitude AS s_lat, s.longitude AS s_lng
      FROM public.orders o
      JOIN public.stores s ON s.id = o.store_id
     WHERE o.status = 'ready'
       AND o.courier_id IS NULL
       AND o.city_id = me.city_id
       AND (o.payment_status = 'paid' OR o.payment_method IN ('cash_on_delivery','card_on_delivery'))
       AND NOT EXISTS (SELECT 1 FROM public.order_offer_declines d
                        WHERE d.order_id = o.id AND d.courier_id = me.id)
  ),
  elig_couriers AS (
    SELECT c.id, c.current_lat, c.current_lng
      FROM public.couriers c
     WHERE c.approval_status = 'approved'
       AND NOT c.is_suspended
       AND c.is_available
       AND c.city_id = me.city_id
       AND c.current_lat IS NOT NULL AND c.current_lng IS NOT NULL
       AND c.last_seen_at IS NOT NULL AND c.last_seen_at > now() - interval '5 minutes'
       AND NOT EXISTS (SELECT 1 FROM public.orders ao
                        WHERE ao.courier_id = c.id AND ao.status IN ('ready','out_for_delivery'))
  ),
  ranked AS (
    SELECT e.id AS oid, c.id AS cid,
           public.geo_distance_m(c.current_lat, c.current_lng, e.s_lat, e.s_lng) AS dist,
           row_number() OVER (
             PARTITION BY e.id
             ORDER BY public.geo_distance_m(c.current_lat, c.current_lng, e.s_lat, e.s_lng) NULLS LAST
           ) AS rn
      FROM elig_orders e
      JOIN elig_couriers c ON true
     WHERE NOT EXISTS (SELECT 1 FROM public.order_offer_declines d
                        WHERE d.order_id = e.id AND d.courier_id = c.id)
  )
  SELECT e.id, e.store_id, e.s_name, e.s_logo, e.s_addr, e.s_lat, e.s_lng,
         e.address_snapshot, e.delivery_fee, e.total,
         (SELECT r.dist FROM ranked r WHERE r.oid = e.id AND r.cid = me.id),
         e.updated_at,
         COALESCE((SELECT r.rn = 1 FROM ranked r WHERE r.oid = e.id AND r.cid = me.id), false)
    FROM elig_orders e
   WHERE
     -- sou o mais próximo com localização recente
     EXISTS (SELECT 1 FROM ranked r WHERE r.oid = e.id AND r.cid = me.id AND r.rn = 1)
     -- ou ninguém tem localização válida para este pedido (fallback: lista aberta)
     OR NOT EXISTS (SELECT 1 FROM ranked r WHERE r.oid = e.id)
     -- ou a janela de exclusividade do mais próximo expirou (45s)
     OR e.updated_at < now() - interval '45 seconds'
   ORDER BY 11 NULLS LAST, e.updated_at;
END $$;

-- Aceite atômico da entrega
CREATE OR REPLACE FUNCTION public.courier_accept_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me public.couriers; o public.orders;
BEGIN
  SELECT * INTO me FROM public.couriers WHERE id = auth.uid();
  IF NOT FOUND OR me.approval_status <> 'approved' OR me.is_suspended THEN
    RAISE EXCEPTION 'Sua conta de entregador não está liberada para aceitar entregas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders ao
              WHERE ao.courier_id = me.id AND ao.status IN ('ready','out_for_delivery')) THEN
    RAISE EXCEPTION 'Você já possui uma entrega em andamento';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.courier_id IS NOT NULL THEN
    RAISE EXCEPTION 'Esta entrega já foi aceita por outro entregador.';
  END IF;
  IF o.status <> 'ready' THEN RAISE EXCEPTION 'Pedido não está disponível para retirada'; END IF;
  IF o.city_id <> me.city_id THEN RAISE EXCEPTION 'Pedido de outra cidade'; END IF;
  IF o.payment_method IN ('pix','card_online') AND o.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Pedido sem pagamento aprovado';
  END IF;

  UPDATE public.orders
     SET courier_id = me.id, courier_stage = 'accepted'
   WHERE id = _order_id AND courier_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta entrega já foi aceita por outro entregador.';
  END IF;
END $$;

-- Recusar oferta (libera para o próximo elegível)
CREATE OR REPLACE FUNCTION public.courier_decline_order(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'courier') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  INSERT INTO public.order_offer_declines (order_id, courier_id)
  VALUES (_order_id, auth.uid()) ON CONFLICT DO NOTHING;
END $$;