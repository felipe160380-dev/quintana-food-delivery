-- ========== order_events (timeline) ==========
CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_events_order ON public.order_events(order_id, created_at);

GRANT SELECT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_events_select_involved" ON public.order_events
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  LEFT JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = order_events.order_id
    AND (o.customer_id = auth.uid() OR o.courier_id = auth.uid() OR s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
));

-- ========== order_courier_locations (live tracking) ==========
CREATE TABLE public.order_courier_locations (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_courier_locations TO authenticated;
GRANT ALL ON public.order_courier_locations TO service_role;
ALTER TABLE public.order_courier_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocl_select_involved" ON public.order_courier_locations
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders o
  LEFT JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = order_courier_locations.order_id
    AND (o.customer_id = auth.uid() OR o.courier_id = auth.uid() OR s.owner_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
));

CREATE POLICY "ocl_courier_insert" ON public.order_courier_locations
FOR INSERT TO authenticated
WITH CHECK (courier_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.orders o WHERE o.id = order_courier_locations.order_id AND o.courier_id = auth.uid()
));

CREATE POLICY "ocl_courier_update" ON public.order_courier_locations
FOR UPDATE TO authenticated
USING (courier_id = auth.uid())
WITH CHECK (courier_id = auth.uid());

CREATE POLICY "ocl_courier_delete" ON public.order_courier_locations
FOR DELETE TO authenticated
USING (courier_id = auth.uid());

CREATE TRIGGER trg_ocl_updated_at BEFORE UPDATE ON public.order_courier_locations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== triggers: timeline + limpeza de localização ==========
CREATE OR REPLACE FUNCTION public.log_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events (order_id, kind) VALUES (NEW.id, 'created');
    IF NEW.payment_status = 'paid' THEN
      INSERT INTO public.order_events (order_id, kind) VALUES (NEW.id, 'payment_confirmed');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.order_events (order_id, kind) VALUES (NEW.id, 'payment_confirmed');
  END IF;

  IF NEW.courier_id IS NOT NULL AND OLD.courier_id IS DISTINCT FROM NEW.courier_id THEN
    INSERT INTO public.order_events (order_id, kind) VALUES (NEW.id, 'courier_assigned');
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_events (order_id, kind) VALUES (NEW.id, 'status_' || NEW.status::text);
    IF NEW.status IN ('delivered','cancelled') THEN
      DELETE FROM public.order_courier_locations WHERE order_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.log_order_event() FROM PUBLIC;

CREATE TRIGGER trg_log_order_event_ins AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_event();

CREATE TRIGGER trg_log_order_event_upd AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_event();

-- ========== realtime ==========
ALTER TABLE public.order_courier_locations REPLICA IDENTITY FULL;
ALTER TABLE public.order_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_courier_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;

-- backfill mínimo: cria evento inicial para pedidos existentes
INSERT INTO public.order_events (order_id, kind, created_at)
SELECT id, 'created', created_at FROM public.orders;