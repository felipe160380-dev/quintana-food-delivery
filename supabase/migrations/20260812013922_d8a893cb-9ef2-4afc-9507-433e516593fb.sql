-- ============ 1. Novas colunas ============
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_stage text;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_courier_stage_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_courier_stage_check
  CHECK (courier_stage IS NULL OR courier_stage IN ('accepted','to_store','at_store','picked_up','to_customer','at_customer'));

ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS cnh_url text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS crlv_url text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS vehicle_brand text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS vehicle_model text;
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS vehicle_year text;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- ============ 2. Guarda unificada de transições do pedido ============
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
BEGIN
  -- UPDATE interno da criação do pedido (create_order) e chamadas de servidor
  -- (webhook Mercado Pago com service_role) são confiáveis.
  IF current_setting('app.creating_order', true) = 'on' THEN RETURN NEW; END IF;
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(v_uid, 'admin') THEN RETURN NEW; END IF;

  v_is_store := EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = v_uid);
  v_is_courier := OLD.courier_id = v_uid;
  v_is_customer := OLD.customer_id = v_uid;

  -- Campos financeiros e de identidade do pedido são imutáveis para todos.
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
     OR NEW.delivery_code IS DISTINCT FROM OLD.delivery_code THEN
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
      -- Pagamento online precisa estar aprovado antes de a loja confirmar.
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

DROP TRIGGER IF EXISTS trg_orders_guard_customer_update ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_guard_transitions ON public.orders;
CREATE TRIGGER trg_orders_guard_transitions
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_transitions();

-- ============ 3. confirm_delivery marca o contexto confiável ============
CREATE OR REPLACE FUNCTION public.confirm_delivery(_order_id uuid, _code text, _lat double precision, _lng double precision)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.courier_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Apenas o entregador do pedido pode confirmar'; END IF;
  IF o.status <> 'out_for_delivery' THEN RAISE EXCEPTION 'Pedido não está em rota'; END IF;
  IF o.delivery_code IS NULL OR o.delivery_code <> _code THEN RAISE EXCEPTION 'Código inválido'; END IF;

  PERFORM set_config('app.confirm_delivery', 'on', true);
  UPDATE public.orders
    SET status = 'delivered', delivered_at = now(), delivered_lat = _lat, delivered_lng = _lng,
        courier_stage = NULL
    WHERE id = _order_id;
  PERFORM set_config('app.confirm_delivery', 'off', true);
END $function$;

-- ============ 4. Etapas da entrega ============
CREATE OR REPLACE FUNCTION public.courier_set_stage(_order_id uuid, _stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF _stage NOT IN ('accepted','to_store','at_store','picked_up','to_customer','at_customer') THEN
    RAISE EXCEPTION 'Etapa inválida';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF o.courier_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Apenas o entregador do pedido pode avançar a entrega'; END IF;
  IF o.status IN ('delivered','cancelled') THEN RAISE EXCEPTION 'Pedido finalizado'; END IF;

  IF _stage IN ('picked_up','to_customer','at_customer') AND o.status = 'ready' THEN
    UPDATE public.orders SET courier_stage = _stage, status = 'out_for_delivery' WHERE id = _order_id;
  ELSE
    UPDATE public.orders SET courier_stage = _stage WHERE id = _order_id;
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.courier_set_stage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_set_stage(uuid, text) TO authenticated;

-- ============ 5. Histórico do cliente na loja ============
CREATE OR REPLACE FUNCTION public.customer_orders_count(_customer_id uuid, _store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.orders o
   WHERE o.customer_id = _customer_id
     AND o.store_id = _store_id
     AND o.status = 'delivered'
     AND (
       EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = auth.uid())
       OR public.has_role(auth.uid(), 'admin')
     );
$function$;

REVOKE ALL ON FUNCTION public.customer_orders_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_orders_count(uuid, uuid) TO authenticated;

-- ============ 6. Arquivar loja (soft delete) ============
CREATE OR REPLACE FUNCTION public.archive_store(_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE s public.stores;
BEGIN
  SELECT * INTO s FROM public.stores WHERE id = _store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF s.owner_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = _store_id
              AND o.status NOT IN ('delivered','cancelled')) THEN
    RAISE EXCEPTION 'Existem pedidos em andamento nesta loja. Finalize-os antes de excluir.';
  END IF;
  UPDATE public.stores
     SET archived_at = now(), is_online = false, approval_status = 'rejected',
         approval_note = COALESCE(NULLIF(approval_note,''), 'Loja excluída pelo responsável')
   WHERE id = _store_id;
  UPDATE public.products SET is_available = false WHERE store_id = _store_id;
END $function$;

REVOKE ALL ON FUNCTION public.archive_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_store(uuid) TO authenticated;

-- ============ 7. Desativar usuário (admin) ============
CREATE OR REPLACE FUNCTION public.admin_set_user_active(_user_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Você não pode desativar a própria conta por aqui'; END IF;

  UPDATE public.profiles SET deactivated_at = CASE WHEN _active THEN NULL ELSE now() END WHERE id = _user_id;
  UPDATE public.couriers SET is_suspended = NOT _active, is_available = false WHERE id = _user_id;
  IF NOT _active THEN
    UPDATE public.stores SET is_online = false WHERE owner_id = _user_id;
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.admin_set_user_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(uuid, boolean) TO authenticated;

-- ============ 8. Listagem administrativa de usuários (com e-mail) ============
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, full_name text, email text, phone text, city text,
  roles text[], created_at timestamptz, deactivated_at timestamptz,
  courier_status text, store_count int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id,
         p.full_name,
         u.email::text,
         p.phone,
         COALESCE(
           (SELECT c.name FROM public.cities c
             JOIN public.couriers co ON co.city_id = c.id WHERE co.id = p.id LIMIT 1),
           (SELECT c2.name FROM public.cities c2
             JOIN public.stores s2 ON s2.city_id = c2.id WHERE s2.owner_id = p.id LIMIT 1),
           (SELECT a.city FROM public.addresses a WHERE a.user_id = p.id ORDER BY a.is_default DESC LIMIT 1)
         ) AS city,
         COALESCE((SELECT array_agg(r.role::text) FROM public.user_roles r WHERE r.user_id = p.id), '{}') AS roles,
         p.created_at,
         p.deactivated_at,
         (SELECT co2.approval_status::text FROM public.couriers co2 WHERE co2.id = p.id) AS courier_status,
         (SELECT count(*)::int FROM public.stores s3 WHERE s3.owner_id = p.id) AS store_count
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
   WHERE public.has_role(auth.uid(), 'admin')
   ORDER BY p.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

-- ============ 9. Documentos privados do entregador ============
DROP POLICY IF EXISTS "courier docs own read" ON storage.objects;
CREATE POLICY "courier docs own read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'courier-docs' AND (
  (storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')
));

DROP POLICY IF EXISTS "courier docs own write" ON storage.objects;
CREATE POLICY "courier docs own write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'courier-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "courier docs own update" ON storage.objects;
CREATE POLICY "courier docs own update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'courier-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ 10. Lojas arquivadas somem do catálogo público ============
DROP POLICY IF EXISTS stores_public_read ON public.stores;
CREATE POLICY stores_public_read ON public.stores FOR SELECT
USING (approval_status = 'approved' AND archived_at IS NULL);