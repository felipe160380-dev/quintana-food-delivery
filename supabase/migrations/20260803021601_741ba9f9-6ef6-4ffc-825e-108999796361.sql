-- ============ SEÇÃO 0: saque da loja debitado pelo servidor ============
CREATE OR REPLACE FUNCTION public.store_withdrawal_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_week_start timestamptz;
  v_count int;
  v_fee numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido para o saque';
  END IF;

  v_balance := public.store_wallet_balance(NEW.store_id);
  IF NEW.amount > v_balance THEN
    RAISE EXCEPTION 'Valor acima do saldo disponível';
  END IF;

  v_week_start := date_trunc('week', now());
  SELECT count(*) INTO v_count
    FROM public.store_withdrawals
   WHERE store_id = NEW.store_id
     AND requested_at >= v_week_start
     AND status <> 'rejected';

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
END $$;

REVOKE ALL ON FUNCTION public.store_withdrawal_before_insert() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_store_withdrawal_before_insert ON public.store_withdrawals;
CREATE TRIGGER trg_store_withdrawal_before_insert
BEFORE INSERT ON public.store_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.store_withdrawal_before_insert();

-- ============ SEÇÃO 1: carteira do entregador ============
ALTER TABLE public.couriers ADD COLUMN IF NOT EXISTS payout_pix_key text;

CREATE TABLE public.courier_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind text NOT NULL,
  gross numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_courier_wallet_courier ON public.courier_wallet_entries (courier_id, created_at DESC);

GRANT SELECT ON public.courier_wallet_entries TO authenticated;
GRANT ALL ON public.courier_wallet_entries TO service_role;
ALTER TABLE public.courier_wallet_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_reads_wallet" ON public.courier_wallet_entries
  FOR SELECT TO authenticated USING (courier_id = auth.uid());
CREATE POLICY "courier_wallet_admin_all" ON public.courier_wallet_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.courier_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL DEFAULT 0,
  pix_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_courier_withdrawals_courier ON public.courier_withdrawals (courier_id, requested_at DESC);

GRANT SELECT, INSERT ON public.courier_withdrawals TO authenticated;
GRANT ALL ON public.courier_withdrawals TO service_role;
ALTER TABLE public.courier_withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "courier_reads_withdrawals" ON public.courier_withdrawals
  FOR SELECT TO authenticated USING (courier_id = auth.uid());
CREATE POLICY "courier_creates_withdrawals" ON public.courier_withdrawals
  FOR INSERT TO authenticated WITH CHECK (courier_id = auth.uid());
CREATE POLICY "courier_withdrawals_admin_all" ON public.courier_withdrawals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.courier_wallet_balance(_courier_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(net), 0) FROM public.courier_wallet_entries WHERE courier_id = _courier_id;
$$;
REVOKE ALL ON FUNCTION public.courier_wallet_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_wallet_balance(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.credit_courier_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.courier_id IS NOT NULL THEN
    INSERT INTO public.courier_wallet_entries (courier_id, order_id, kind, gross, fee, net, description)
    VALUES (NEW.courier_id, NEW.id, 'order_credit', COALESCE(NEW.delivery_fee, 0), 0, COALESCE(NEW.delivery_fee, 0),
            'Entrega #' || substr(NEW.id::text, 1, 8));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.credit_courier_on_delivery() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_credit_courier_on_delivery ON public.orders;
CREATE TRIGGER trg_credit_courier_on_delivery
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.credit_courier_on_delivery();

CREATE OR REPLACE FUNCTION public.courier_withdrawal_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_week_start timestamptz;
  v_count int;
  v_fee numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor válido para o saque';
  END IF;

  v_balance := public.courier_wallet_balance(NEW.courier_id);
  IF NEW.amount > v_balance THEN
    RAISE EXCEPTION 'Valor acima do saldo disponível';
  END IF;

  v_week_start := date_trunc('week', now());
  SELECT count(*) INTO v_count
    FROM public.courier_withdrawals
   WHERE courier_id = NEW.courier_id
     AND requested_at >= v_week_start
     AND status <> 'rejected';

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
END $$;
REVOKE ALL ON FUNCTION public.courier_withdrawal_before_insert() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_courier_withdrawal_before_insert ON public.courier_withdrawals;
CREATE TRIGGER trg_courier_withdrawal_before_insert
BEFORE INSERT ON public.courier_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.courier_withdrawal_before_insert();

ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_wallet_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_withdrawals;