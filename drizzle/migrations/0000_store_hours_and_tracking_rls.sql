CREATE OR REPLACE FUNCTION public.store_is_open_now(_hours jsonb, _at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_local timestamp := _at AT TIME ZONE 'America/Sao_Paulo';
  v_t time := v_local::time;
  v_keys text[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
  v_dow int := extract(dow FROM v_local)::int;
  v_today jsonb; v_prev jsonb; v_o time; v_c time;
BEGIN
  IF _hours IS NULL OR _hours = '{}'::jsonb THEN RETURN true; END IF;
  v_today := _hours -> v_keys[v_dow + 1];
  v_prev  := _hours -> v_keys[((v_dow + 6) % 7) + 1];
  IF v_today IS NOT NULL AND COALESCE((v_today->>'closed')::boolean, false) IS FALSE
     AND NULLIF(v_today->>'open','') IS NOT NULL AND NULLIF(v_today->>'close','') IS NOT NULL THEN
    v_o := (v_today->>'open')::time; v_c := (v_today->>'close')::time;
    IF v_c > v_o AND v_t >= v_o AND v_t < v_c THEN RETURN true; END IF;
    IF v_c <= v_o AND v_t >= v_o THEN RETURN true; END IF;
  END IF;
  IF v_prev IS NOT NULL AND COALESCE((v_prev->>'closed')::boolean, false) IS FALSE
     AND NULLIF(v_prev->>'open','') IS NOT NULL AND NULLIF(v_prev->>'close','') IS NOT NULL THEN
    v_o := (v_prev->>'open')::time; v_c := (v_prev->>'close')::time;
    IF v_c <= v_o AND v_t < v_c THEN RETURN true; END IF;
  END IF;
  RETURN false;
END $$;
GRANT EXECUTE ON FUNCTION public.store_is_open_now(jsonb, timestamptz) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_order(_store_id uuid, _address jsonb, _payment_method payment_method, _change_for numeric, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT * INTO v_store FROM public.stores WHERE id = _store_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loja não encontrada'; END IF;
  IF v_store.approval_status <> 'approved' OR v_store.is_online IS NOT TRUE THEN
    RAISE EXCEPTION 'A loja está fechada no momento. Tente novamente mais tarde.';
  END IF;
  IF v_store.archived_at IS NOT NULL OR NOT public.store_is_open_now(v_store.hours) THEN
    RAISE EXCEPTION 'A loja está fechada no momento. Tente novamente mais tarde.';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  IF (_payment_method = 'pix' AND v_store.accepts_pix IS NOT TRUE)
     OR (_payment_method = 'card_online' AND v_store.accepts_card_online IS NOT TRUE)
     OR (_payment_method = 'cash_on_delivery' AND v_store.accepts_cash IS NOT TRUE)
     OR (_payment_method = 'card_on_delivery' AND v_store.accepts_card_on_delivery IS NOT TRUE) THEN
    RAISE EXCEPTION 'Forma de pagamento indisponível nesta loja';
  END IF;

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

  PERFORM set_config('app.creating_order', 'on', true);

  UPDATE public.orders
     SET subtotal = v_subtotal, total = v_total
   WHERE id = v_order_id;

  PERFORM set_config('app.creating_order', 'off', true);

  RETURN v_order_id;
END $function$;

DROP POLICY IF EXISTS ocl_courier_insert ON public.order_courier_locations;
DROP POLICY IF EXISTS ocl_courier_update ON public.order_courier_locations;
DROP POLICY IF EXISTS ocl_select_involved ON public.order_courier_locations;

CREATE POLICY ocl_courier_insert ON public.order_courier_locations FOR INSERT TO authenticated
WITH CHECK (courier_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o
  WHERE o.id = order_courier_locations.order_id AND o.courier_id = auth.uid() AND o.status = 'out_for_delivery'));

CREATE POLICY ocl_courier_update ON public.order_courier_locations FOR UPDATE TO authenticated
USING (courier_id = auth.uid())
WITH CHECK (courier_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o
  WHERE o.id = order_courier_locations.order_id AND o.courier_id = auth.uid() AND o.status = 'out_for_delivery'));

CREATE POLICY ocl_select_involved ON public.order_courier_locations FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o LEFT JOIN public.stores s ON s.id = o.store_id
  WHERE o.id = order_courier_locations.order_id AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (o.status = 'out_for_delivery' AND (o.customer_id = auth.uid() OR o.courier_id = auth.uid() OR s.owner_id = auth.uid()))
  )));