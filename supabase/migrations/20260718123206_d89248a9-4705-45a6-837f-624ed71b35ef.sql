
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_code text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_lat double precision,
  ADD COLUMN IF NOT EXISTS delivered_lng double precision,
  ADD COLUMN IF NOT EXISTS courier_rating smallint CHECK (courier_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS courier_comment text;

CREATE OR REPLACE FUNCTION public.generate_delivery_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ph text; digits text;
BEGIN
  IF NEW.status = 'out_for_delivery' AND (OLD.status IS DISTINCT FROM 'out_for_delivery') AND NEW.delivery_code IS NULL THEN
    SELECT phone INTO ph FROM public.profiles WHERE id = NEW.customer_id;
    digits := regexp_replace(COALESCE(ph, ''), '\D', '', 'g');
    IF length(digits) >= 4 THEN
      NEW.delivery_code := right(digits, 4);
    ELSE
      NEW.delivery_code := lpad((floor(random()*10000))::int::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_gen_delivery_code ON public.orders;
CREATE TRIGGER orders_gen_delivery_code
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_code();

CREATE OR REPLACE FUNCTION public.confirm_delivery(_order_id uuid, _code text, _lat double precision, _lng double precision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.courier_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Apenas o entregador do pedido pode confirmar'; END IF;
  IF o.status <> 'out_for_delivery' THEN RAISE EXCEPTION 'Pedido não está em rota'; END IF;
  IF o.delivery_code IS NULL OR o.delivery_code <> _code THEN RAISE EXCEPTION 'Código inválido'; END IF;
  UPDATE public.orders
    SET status = 'delivered', delivered_at = now(), delivered_lat = _lat, delivered_lng = _lng
    WHERE id = _order_id;
END $$;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(uuid, text, double precision, double precision) TO authenticated;

CREATE OR REPLACE FUNCTION public.courier_resubmit()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.couriers
    SET approval_status = 'pending', approval_note = NULL, approved_at = NULL
    WHERE id = auth.uid() AND approval_status = 'rejected';
END $$;
GRANT EXECUTE ON FUNCTION public.courier_resubmit() TO authenticated;

CREATE OR REPLACE FUNCTION public.rate_courier(_order_id uuid, _rating smallint, _comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Nota inválida'; END IF;
  UPDATE public.orders
    SET courier_rating = _rating, courier_comment = _comment
    WHERE id = _order_id AND customer_id = auth.uid() AND status = 'delivered';
END $$;
GRANT EXECUTE ON FUNCTION public.rate_courier(uuid, smallint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
