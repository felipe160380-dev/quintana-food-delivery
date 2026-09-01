-- 1) Aceite de entrega somente via RPC segura (courier_accept_order).
DROP POLICY IF EXISTS orders_update_participants ON public.orders;
CREATE POLICY orders_update_participants ON public.orders
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    OR courier_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
  );

-- 2) Etapas da entrega: apenas avanço sequencial de uma etapa.
CREATE OR REPLACE FUNCTION public.courier_set_stage(_order_id uuid, _stage text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  stages text[] := ARRAY['accepted','to_store','at_store','picked_up','to_customer','at_customer'];
  cur_idx int;
  new_idx int;
BEGIN
  new_idx := array_position(stages, _stage);
  IF new_idx IS NULL THEN
    RAISE EXCEPTION 'Etapa inválida';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.courier_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Apenas o entregador do pedido pode avançar a entrega'; END IF;
  IF o.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'Pedido finalizado'; END IF;

  cur_idx := COALESCE(array_position(stages, o.courier_stage), 0);

  IF new_idx = cur_idx THEN
    RETURN; -- idempotente: duplo clique não faz nada
  END IF;
  IF new_idx <> cur_idx + 1 THEN
    RAISE EXCEPTION 'Conclua a etapa anterior antes de avançar';
  END IF;

  IF _stage IN ('picked_up','to_customer','at_customer') AND o.status = 'ready' THEN
    UPDATE public.orders SET courier_stage = _stage, status = 'out_for_delivery' WHERE id = _order_id;
  ELSE
    UPDATE public.orders SET courier_stage = _stage WHERE id = _order_id;
  END IF;
END $function$;