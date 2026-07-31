-- =====================================================================
-- 1.6 + 1.1 + 1.4 : criação de pedido transacional com preços do servidor
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_order(
  _store_id uuid,
  _address jsonb,
  _payment_method payment_method,
  _change_for numeric,
  _notes text,
  _items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_store public.stores;
  v_item jsonb;
  v_addon jsonb;
  v_product public.products;
  v_qty int;
  v_unit numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_order_id uuid;
  v_order_item_id uuid;
  v_pa public.product_addons;
  v_aqty int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_store FROM public.stores WHERE id = _store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF v_store.approval_status <> 'approved' OR v_store.is_online IS NOT TRUE THEN
    RAISE EXCEPTION 'A loja está fechada no momento. Tente novamente mais tarde.';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  -- Método de pagamento aceito pela loja
  IF (_payment_method = 'pix' AND v_store.accepts_pix IS NOT TRUE)
     OR (_payment_method = 'card_online' AND v_store.accepts_card_online IS NOT TRUE)
     OR (_payment_method = 'cash_on_delivery' AND v_store.accepts_cash IS NOT TRUE)
     OR (_payment_method = 'card_on_delivery' AND v_store.accepts_card_on_delivery IS NOT TRUE) THEN
    RAISE EXCEPTION 'Forma de pagamento indisponível nesta loja';
  END IF;

  -- Cria o pedido com valores zerados; serão recalculados abaixo.
  INSERT INTO public.orders (
    customer_id, store_id, city_id, address_snapshot,
    subtotal, delivery_fee, total, payment_method, change_for, notes
  ) VALUES (
    v_uid, v_store.id, v_store.city_id, _address,
    0, COALESCE(v_store.delivery_fee, 0), 0, _payment_method,
    CASE WHEN _payment_method = 'cash_on_delivery' THEN _change_for ELSE NULL END,
    NULLIF(btrim(COALESCE(_notes, '')), '')
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));

    SELECT * INTO v_product FROM public.products
      WHERE id = (v_item->>'product_id')::uuid AND store_id = v_store.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível no cardápio desta loja'; END IF;
    IF v_product.is_available IS NOT TRUE OR v_product.is_paused IS TRUE THEN
      RAISE EXCEPTION 'O produto "%" não está disponível no momento', v_product.name;
    END IF;
    IF v_product.stock IS NOT NULL AND v_product.stock < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%"', v_product.name;
    END IF;

    -- Preço vem sempre do banco (nunca do cliente).
    v_unit := COALESCE(NULLIF(v_product.promo_price, 0), v_product.price);
    v_line := v_unit;

    INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, quantity, notes)
    VALUES (v_order_id, v_product.id, v_product.name, v_unit, v_qty,
            NULLIF(btrim(COALESCE(v_item->>'notes', '')), ''))
    RETURNING id INTO v_order_item_id;

    IF jsonb_typeof(v_item->'addons') = 'array' THEN
      FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'addons') LOOP
        v_aqty := GREATEST(1, COALESCE((v_addon->>'quantity')::int, 1));
        SELECT * INTO v_pa FROM public.product_addons
          WHERE id = (v_addon->>'addon_id')::uuid AND product_id = v_product.id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Adicional indisponível para "%"', v_product.name; END IF;
        IF v_pa.max_qty IS NOT NULL AND v_aqty > v_pa.max_qty THEN
          RAISE EXCEPTION 'Quantidade máxima excedida no adicional "%"', v_pa.name;
        END IF;
        INSERT INTO public.order_item_addons (order_item_id, name, price, quantity)
        VALUES (v_order_item_id, v_pa.name, v_pa.price, v_aqty);
        v_line := v_line + (v_pa.price * v_aqty);
      END LOOP;
    END IF;

    v_subtotal := v_subtotal + (v_line * v_qty);
  END LOOP;

  IF v_store.min_order IS NOT NULL AND v_subtotal < v_store.min_order THEN
    RAISE EXCEPTION 'Pedido mínimo desta loja: R$ %', to_char(v_store.min_order, 'FM999999990.00');
  END IF;

  v_total := v_subtotal + COALESCE(v_store.delivery_fee, 0);

  UPDATE public.orders
     SET subtotal = v_subtotal, total = v_total
   WHERE id = v_order_id;

  RETURN v_order_id;
END $$;

REVOKE ALL ON FUNCTION public.create_order(uuid, jsonb, payment_method, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, payment_method, numeric, text, jsonb) TO authenticated, service_role;

-- =====================================================================
-- 1.1 : o cliente não pode mais inserir pedidos/itens diretamente
-- =====================================================================
DROP POLICY IF EXISTS orders_insert_customer ON public.orders;
DROP POLICY IF EXISTS order_items_insert_customer ON public.order_items;
DROP POLICY IF EXISTS oia_insert_own_order ON public.order_item_addons;
REVOKE INSERT ON public.orders, public.order_items, public.order_item_addons FROM authenticated;

-- =====================================================================
-- 1.2 : cliente não pode alterar status/pagamento/valores do pedido
-- =====================================================================
CREATE OR REPLACE FUNCTION public.orders_guard_customer_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_privileged boolean;
BEGIN
  IF v_uid IS NULL OR v_uid IS DISTINCT FROM OLD.customer_id THEN
    RETURN NEW; -- lojista/entregador/admin seguem as políticas existentes
  END IF;

  SELECT (OLD.courier_id = v_uid)
      OR public.has_role(v_uid, 'admin')
      OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = v_uid)
    INTO v_privileged;
  IF COALESCE(v_privileged, false) THEN RETURN NEW; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.change_for IS DISTINCT FROM OLD.change_for
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.city_id IS DISTINCT FROM OLD.city_id
     OR NEW.courier_id IS DISTINCT FROM OLD.courier_id
     OR NEW.delivery_code IS DISTINCT FROM OLD.delivery_code
     OR NEW.delivered_at IS DISTINCT FROM OLD.delivered_at
     OR NEW.delivered_lat IS DISTINCT FROM OLD.delivered_lat
     OR NEW.delivered_lng IS DISTINCT FROM OLD.delivered_lng
     OR NEW.address_snapshot IS DISTINCT FROM OLD.address_snapshot THEN
    RAISE EXCEPTION 'Você não pode alterar dados do pedido';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_guard_customer_update ON public.orders;
CREATE TRIGGER trg_orders_guard_customer_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_customer_update();

REVOKE ALL ON FUNCTION public.orders_guard_customer_update() FROM PUBLIC, anon;