-- 1) Idempotência de crédito por pedido (uma movimentação por pedido/tipo)
CREATE UNIQUE INDEX IF NOT EXISTS store_wallet_entries_order_kind_uniq
  ON public.store_wallet_entries (order_id, kind) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS courier_wallet_entries_order_kind_uniq
  ON public.courier_wallet_entries (order_id, kind) WHERE order_id IS NOT NULL;

-- 2) Créditos: só na transição real para delivered e nunca duas vezes
CREATE OR REPLACE FUNCTION public.credit_store_on_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE fee_pct numeric; gross numeric; fee numeric; net numeric;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    IF NOT EXISTS (SELECT 1 FROM public.store_wallet_entries w
                    WHERE w.order_id = NEW.id AND w.kind = 'order_credit') THEN
      SELECT platform_fee_pct INTO fee_pct FROM public.stores WHERE id = NEW.store_id;
      fee_pct := COALESCE(fee_pct, 10);
      gross := NEW.subtotal;
      fee := ROUND((gross * fee_pct / 100.0)::numeric, 2);
      net := gross - fee;
      INSERT INTO public.store_wallet_entries (store_id, order_id, kind, gross, fee, net, description)
      VALUES (NEW.store_id, NEW.id, 'order_credit', gross, fee, net, 'Pedido #' || substr(NEW.id::text,1,8))
      ON CONFLICT DO NOTHING;
      INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
      VALUES (NEW.store_id, 'order_delivered', 'Pedido entregue',
              'Você recebeu R$ ' || to_char(net, 'FM999999990.00'), NEW.id);
    END IF;
  END IF;
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
    VALUES (NEW.store_id, 'order_cancelled', 'Pedido cancelado', 'Um pedido foi cancelado', NEW.id);
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.credit_courier_on_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.courier_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.courier_wallet_entries w
                    WHERE w.order_id = NEW.id AND w.kind = 'order_credit') THEN
      INSERT INTO public.courier_wallet_entries (courier_id, order_id, kind, gross, fee, net, description)
      VALUES (NEW.courier_id, NEW.id, 'order_credit', COALESCE(NEW.delivery_fee, 0), 0, COALESCE(NEW.delivery_fee, 0),
              'Entrega #' || substr(NEW.id::text, 1, 8))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 3) Saque da loja: status inicial correto, campos administrativos forçados e lock anti-concorrência
CREATE OR REPLACE FUNCTION public.store_withdrawal_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_balance numeric; v_week_start timestamptz; v_count int; v_fee numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido para o saque';
  END IF;

  -- Nada administrativo pode chegar do cliente.
  NEW.status := 'requested';
  NEW.note := NULL;
  NEW.approved_at := NULL; NEW.approved_by := NULL;
  NEW.paid_at := NULL; NEW.paid_by := NULL;
  NEW.rejected_by := NULL; NEW.processed_at := NULL;
  NEW.requested_at := now();

  -- Serializa solicitações da mesma loja (evita dois saques usando o mesmo saldo).
  PERFORM pg_advisory_xact_lock(hashtext('store_withdrawal:' || NEW.store_id::text));

  v_balance := public.store_wallet_balance(NEW.store_id);
  IF NEW.amount > v_balance THEN
    RAISE EXCEPTION 'Valor acima do saldo disponível';
  END IF;

  v_week_start := date_trunc('week', now());
  SELECT count(*) INTO v_count FROM public.store_withdrawals
   WHERE store_id = NEW.store_id AND requested_at >= v_week_start AND status <> 'rejected';

  v_fee := CASE WHEN v_count >= 1 THEN round(NEW.amount * 0.06, 2) ELSE 0 END;
  NEW.fee := v_fee;
  NEW.net := NEW.amount - v_fee;

  INSERT INTO public.store_wallet_entries (store_id, kind, gross, fee, net, description)
  VALUES (NEW.store_id, 'withdrawal', -NEW.amount, v_fee, -NEW.amount,
          'Solicitação de saque #' || substr(NEW.id::text, 1, 8));

  IF v_fee > 0 THEN
    INSERT INTO public.store_wallet_entries (store_id, kind, gross, fee, net, description)
    VALUES (NEW.store_id, 'withdrawal_fee', 0, v_fee, -v_fee,
            'Taxa administrativa (2º+ saque na semana)');
  END IF;

  RETURN NEW;
END $function$;

-- 4) Saque do entregador: mesmas proteções
CREATE OR REPLACE FUNCTION public.courier_withdrawal_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_balance numeric; v_week_start timestamptz; v_count int; v_fee numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido para o saque';
  END IF;

  NEW.status := 'requested';
  NEW.note := NULL;
  NEW.processed_at := NULL;
  NEW.requested_at := now();

  PERFORM pg_advisory_xact_lock(hashtext('courier_withdrawal:' || NEW.courier_id::text));

  v_balance := public.courier_wallet_balance(NEW.courier_id);
  IF NEW.amount > v_balance THEN
    RAISE EXCEPTION 'Valor acima do saldo disponível';
  END IF;

  v_week_start := date_trunc('week', now());
  SELECT count(*) INTO v_count FROM public.courier_withdrawals
   WHERE courier_id = NEW.courier_id AND requested_at >= v_week_start AND status <> 'rejected';

  v_fee := CASE WHEN v_count >= 1 THEN round(NEW.amount * 0.06, 2) ELSE 0 END;
  NEW.fee := v_fee;
  NEW.net := NEW.amount - v_fee;

  INSERT INTO public.courier_wallet_entries (courier_id, kind, gross, fee, net, description)
  VALUES (NEW.courier_id, 'withdrawal', -NEW.amount, v_fee, -NEW.amount,
          'Solicitação de saque #' || substr(NEW.id::text, 1, 8));

  IF v_fee > 0 THEN
    INSERT INTO public.courier_wallet_entries (courier_id, kind, gross, fee, net, description)
    VALUES (NEW.courier_id, 'withdrawal_fee', 0, v_fee, -v_fee,
            'Taxa administrativa (2º+ saque na semana)');
  END IF;

  RETURN NEW;
END $function$;

-- 5) Devolução do valor reservado quando o saque do entregador é recusado (uma única vez)
CREATE OR REPLACE FUNCTION public.courier_withdrawal_on_reject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    IF NOT EXISTS (SELECT 1 FROM public.courier_wallet_entries e
                    WHERE e.courier_id = NEW.courier_id
                      AND e.kind = 'withdrawal_reversal'
                      AND e.description LIKE '%' || substr(NEW.id::text, 1, 8) || '%') THEN
      INSERT INTO public.courier_wallet_entries (courier_id, kind, gross, fee, net, description)
      VALUES (NEW.courier_id, 'withdrawal_reversal', NEW.amount, 0, NEW.amount,
              'Estorno da solicitação de saque #' || substr(NEW.id::text, 1, 8) || ' (recusada)');
      IF COALESCE(NEW.fee, 0) > 0 THEN
        INSERT INTO public.courier_wallet_entries (courier_id, kind, gross, fee, net, description)
        VALUES (NEW.courier_id, 'withdrawal_fee_reversal', 0, 0, NEW.fee,
                'Estorno da taxa administrativa do saque #' || substr(NEW.id::text, 1, 8));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_courier_withdrawal_on_reject ON public.courier_withdrawals;
CREATE TRIGGER trg_courier_withdrawal_on_reject
AFTER UPDATE ON public.courier_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.courier_withdrawal_on_reject();

-- 6) Normaliza solicitações antigas travadas no status incompatível
UPDATE public.store_withdrawals SET status = 'requested' WHERE status = 'pending';
UPDATE public.courier_withdrawals SET status = 'requested' WHERE status = 'pending';
ALTER TABLE public.store_withdrawals ALTER COLUMN status SET DEFAULT 'requested';
ALTER TABLE public.courier_withdrawals ALTER COLUMN status SET DEFAULT 'requested';