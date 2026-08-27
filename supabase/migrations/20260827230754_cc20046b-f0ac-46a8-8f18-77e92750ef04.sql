CREATE OR REPLACE FUNCTION public.orders_guard_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_store boolean;
  v_is_courier boolean;
  v_is_customer boolean;
  v_confirm boolean := current_setting('app.confirm_delivery', true) = 'on';
  v_courier public.couriers;
  v_code_ok boolean;
BEGIN
  IF current_setting('app.creating_order', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(v_uid, 'admin') THEN RETURN NEW; END IF;

  v_is_store := EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = v_uid);
  v_is_courier := OLD.courier_id = v_uid;
  v_is_customer := OLD.customer_id = v_uid;

  -- Geração automática do código de entrega (trigger orders_gen_delivery_code)
  -- é legítima: só quando não havia código e o pedido saiu para entrega.
  v_code_ok := NEW.delivery_code IS NOT DISTINCT FROM OLD.delivery_code
    OR (OLD.delivery_code IS NULL AND NEW.delivery_code IS NOT NULL AND NEW.status = 'out_for_delivery');

  IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.change_for IS DISTINCT FROM OLD.change_for
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.city_id IS DISTINCT FROM OLD.city_id
     OR NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot
     OR NOT v_code_ok THEN
    RAISE EXCEPTION 'Alteração não permitida neste pedido';
  END IF;

  IF NOT v_confirm AND (
       NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
    OR NEW.delivered_lat IS DISTINCT FROM OLD.delivered_lat
    OR NEW.delivered_lng IS DISTINCT FROM OLD.delivered_lng) THEN
    RAISE EXCEPTION 'Alteração não permitida neste pedido';
  END IF;

  -- ===== Cliente =====
  IF v_is_customer AND NOT v_is_store AND NOT v_is_courier THEN
    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR NEW.courier_stage IS DISTINCT FROM OLD.courier_stage THEN
      RAISE EXCEPTION 'Alteração não permitida neste pedido';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'Você não pode alterar o andamento do pedido';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ===== Loja =====
  IF v_is_store THEN
    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR NEW.courier_stage IS DISTINCT FROM OLD.courier_stage THEN
      RAISE EXCEPTION 'A loja não pode alterar dados da entrega';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('accepted','preparing','ready')
         AND OLD.payment_method IN ('pix','card_online')
         AND OLD.payment_status <> 'paid' THEN
        RAISE EXCEPTION 'Aguardando confirmação do pagamento para liberar este pedido';
      END IF;
      IF NOT (
           (OLD.status = 'pending'    AND NEW.status IN ('accepted','cancelled'))
        OR (OLD.status = 'accepted'   AND NEW.status IN ('preparing','cancelled'))
        OR (OLD.status = 'preparing'  AND NEW.status IN ('ready','cancelled'))
      ) THEN
        RAISE EXCEPTION 'Transição de status não permitida para a loja';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ===== Entregador já vinculado =====
  IF v_is_courier THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'delivered' AND NOT v_confirm THEN
        RAISE EXCEPTION 'A entrega só pode ser concluída com o código do cliente';
      END IF;
      IF NOT v_confirm AND NOT (OLD.status = 'ready' AND NEW.status = 'out_for_delivery') THEN
        RAISE EXCEPTION 'Transição de status não permitida para o entregador';
      END IF;
    END IF;
    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id THEN
      RAISE EXCEPTION 'Alteração não permitida neste pedido';
    END IF;
    RETURN NEW;
  END IF;

  -- ===== Entregador aceitando um pedido pronto e sem entregador =====
  IF OLD.courier_id IS NULL AND NEW.courier_id = v_uid AND OLD.status = 'ready' THEN
    SELECT * INTO v_courier FROM public.couriers WHERE id = v_uid;
    IF NOT FOUND OR v_courier.approval_status <> 'approved' OR v_courier.is_suspended THEN
      RAISE EXCEPTION 'Sua conta de entregador não está liberada para aceitar entregas';
    END IF;
    IF OLD.payment_method IN ('pix','card_online') AND OLD.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'Pedido sem pagamento aprovado';
    END IF;
    IF NEW.status NOT IN ('ready','out_for_delivery') THEN
      RAISE EXCEPTION 'Transição de status não permitida para o entregador';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Alteração não permitida neste pedido';
END $function$;