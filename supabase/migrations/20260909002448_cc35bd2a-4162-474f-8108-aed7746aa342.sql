-- 1) Campos mínimos de auditoria de cancelamento
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_pending boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_cancelled_by_check
    CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer','store','admin','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS orders_refund_pending_idx
  ON public.orders (refund_pending) WHERE refund_pending;

-- 2) Fonte única e segura de cancelamento
CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  o public.orders;
  v_is_admin boolean;
  v_is_store boolean;
  v_is_customer boolean;
  v_actor text;
  v_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  v_refund boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 200 THEN
    v_reason := left(v_reason, 200);
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  v_is_admin := public.has_role(v_uid, 'admin');
  v_is_store := EXISTS (SELECT 1 FROM public.stores s WHERE s.id = o.store_id AND s.owner_id = v_uid);
  v_is_customer := o.customer_id = v_uid;

  IF o.status = 'cancelled' THEN
    RETURN; -- idempotente: duplo clique / corrida não duplica efeito
  END IF;
  IF o.status = 'delivered' THEN
    RAISE EXCEPTION 'Pedido entregue não pode ser cancelado. Use o estorno.';
  END IF;

  IF v_is_admin THEN
    v_actor := 'admin';
  ELSIF v_is_store THEN
    IF o.status NOT IN ('pending','accepted','preparing') THEN
      RAISE EXCEPTION 'A loja não pode mais cancelar este pedido nesta etapa';
    END IF;
    v_actor := 'store';
  ELSIF v_is_customer THEN
    IF o.status <> 'pending' OR o.courier_id IS NOT NULL THEN
      RAISE EXCEPTION 'O pedido já está em andamento. Fale com a loja pelo chat do pedido.';
    END IF;
    v_actor := 'customer';
  ELSE
    RAISE EXCEPTION 'Você não pode cancelar este pedido';
  END IF;

  -- Cancelamento é apenas operacional. Dinheiro já cobrado exige ação de
  -- estorno pelo admin: sinalizamos de forma persistente.
  v_refund := (o.payment_method IN ('pix','card_online') AND o.payment_status = 'paid');

  PERFORM set_config('app.cancel_order', 'on', true);
  UPDATE public.orders
     SET status = 'cancelled',
         cancel_reason = v_reason,
         cancelled_by = v_actor,
         cancelled_at = now(),
         courier_stage = NULL,
         refund_pending = (refund_pending OR v_refund)
   WHERE id = _order_id AND status <> 'cancelled';
  PERFORM set_config('app.cancel_order', 'off', true);

  IF v_refund THEN
    PERFORM public.notify_admins(
      'refund_pending', 'Reembolso pendente',
      'Pedido cancelado com pagamento aprovado — verifique o estorno.',
      '/adm-pedido/' || _order_id::text, _order_id,
      'order:' || _order_id::text || ':refund_pending');
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

-- 3) Pagamento tardio em pedido cancelado / limpeza do flag no estorno
CREATE OR REPLACE FUNCTION public.orders_refund_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'refunded' THEN
    NEW.refund_pending := false;
  ELSIF NEW.payment_status = 'paid'
        AND OLD.payment_status IS DISTINCT FROM 'paid'
        AND NEW.status = 'cancelled' THEN
    NEW.refund_pending := true;
    PERFORM public.notify_admins(
      'refund_pending', 'Pagamento após cancelamento',
      'Um pedido cancelado recebeu pagamento aprovado — verifique o estorno.',
      '/adm-pedido/' || NEW.id::text, NEW.id,
      'order:' || NEW.id::text || ':late_payment');
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_orders_refund_flag ON public.orders;
CREATE TRIGGER trg_orders_refund_flag
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_refund_flag();

-- 4) Guard: cancelamento só pela função segura
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
  v_cancel boolean := current_setting('app.cancel_order', true) = 'on';
  v_courier public.couriers;
  v_code_ok boolean;
BEGIN
  IF current_setting('app.creating_order', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  IF public.has_role(v_uid, 'admin') THEN
    -- Admin também não pode "cancelar" pedido entregue por UPDATE genérico:
    -- reversão de pedido entregue passa somente pelo estorno no servidor.
    IF NOT v_cancel AND OLD.status = 'delivered' AND NEW.status = 'cancelled' THEN
      RAISE EXCEPTION 'Pedido entregue só pode ser revertido pelo estorno';
    END IF;
    IF NOT v_cancel AND NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'Use o cancelamento seguro (cancel_order)';
    END IF;
    RETURN NEW;
  END IF;

  v_is_store := EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = v_uid);
  v_is_courier := OLD.courier_id = v_uid;
  v_is_customer := OLD.customer_id = v_uid;

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

  IF NOT v_cancel AND (
       NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
    OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
    OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
    OR NEW.refund_pending IS DISTINCT FROM OLD.refund_pending) THEN
    RAISE EXCEPTION 'Alteração não permitida neste pedido';
  END IF;

  IF NOT v_confirm AND (
       NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
    OR NEW.delivered_lat IS DISTINCT FROM OLD.delivered_lat
    OR NEW.delivered_lng IS DISTINCT FROM OLD.delivered_lng) THEN
    RAISE EXCEPTION 'Alteração não permitida neste pedido';
  END IF;

  -- Nenhum papel pode mexer em pedido já cancelado ou entregue.
  IF NOT v_cancel AND OLD.status IN ('cancelled','delivered')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Pedido finalizado';
  END IF;

  -- ===== Cliente =====
  IF v_is_customer AND NOT v_is_store AND NOT v_is_courier THEN
    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR (NOT v_cancel AND NEW.courier_stage IS DISTINCT FROM OLD.courier_stage) THEN
      RAISE EXCEPTION 'Alteração não permitida neste pedido';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (v_cancel AND OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'Você não pode alterar o andamento do pedido';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ===== Loja =====
  IF v_is_store THEN
    IF NEW.courier_id IS DISTINCT FROM OLD.courier_id
       OR (NOT v_cancel AND NEW.courier_stage IS DISTINCT FROM OLD.courier_stage) THEN
      RAISE EXCEPTION 'A loja não pode alterar dados da entrega';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'cancelled' AND NOT v_cancel THEN
        RAISE EXCEPTION 'Use o cancelamento seguro (cancel_order)';
      END IF;
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
      IF NEW.status = 'cancelled' THEN
        RAISE EXCEPTION 'O entregador não pode cancelar pedidos';
      END IF;
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