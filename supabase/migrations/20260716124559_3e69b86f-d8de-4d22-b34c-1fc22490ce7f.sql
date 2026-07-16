
-- === Loja: novos campos ===
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS payout_pix_key text,
  ADD COLUMN IF NOT EXISTS hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS platform_fee_pct numeric NOT NULL DEFAULT 10;

-- === Produto: promo, estoque, pausa ===
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS promo_price numeric,
  ADD COLUMN IF NOT EXISTS stock integer,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- === Avaliações: resposta do lojista ===
ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

-- === Carteira: movimentações ===
CREATE TABLE IF NOT EXISTS public.store_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  kind text NOT NULL,  -- 'order_credit' | 'withdrawal' | 'withdrawal_fee' | 'adjustment'
  gross numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL,       -- + credit / - debit
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_wallet_entries TO authenticated;
GRANT ALL ON public.store_wallet_entries TO service_role;
ALTER TABLE public.store_wallet_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reads_wallet" ON public.store_wallet_entries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS idx_wallet_store ON public.store_wallet_entries(store_id, created_at DESC);

-- === Saques ===
CREATE TABLE IF NOT EXISTS public.store_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  fee numeric NOT NULL DEFAULT 0,
  net numeric NOT NULL,
  pix_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | paid | rejected
  note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT, INSERT ON public.store_withdrawals TO authenticated;
GRANT ALL ON public.store_withdrawals TO service_role;
ALTER TABLE public.store_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reads_withdrawals" ON public.store_withdrawals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
CREATE POLICY "owner_creates_withdrawals" ON public.store_withdrawals
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS idx_withdrawals_store ON public.store_withdrawals(store_id, requested_at DESC);

-- === Notificações da loja ===
CREATE TABLE IF NOT EXISTS public.store_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL,      -- new_order | order_cancelled | order_delivered | new_review | low_stock | platform_update
  title text NOT NULL,
  body text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.store_notifications TO authenticated;
GRANT ALL ON public.store_notifications TO service_role;
ALTER TABLE public.store_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reads_notifications" ON public.store_notifications
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
CREATE POLICY "owner_updates_notifications" ON public.store_notifications
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
CREATE INDEX IF NOT EXISTS idx_notif_store ON public.store_notifications(store_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.store_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.store_wallet_entries;

-- === Trigger: credita carteira quando pedido entregue ===
CREATE OR REPLACE FUNCTION public.credit_store_on_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fee_pct numeric; gross numeric; fee numeric; net numeric;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    SELECT platform_fee_pct INTO fee_pct FROM public.stores WHERE id = NEW.store_id;
    fee_pct := COALESCE(fee_pct, 10);
    gross := NEW.subtotal;  -- taxa de entrega vai para o entregador
    fee := ROUND((gross * fee_pct / 100.0)::numeric, 2);
    net := gross - fee;
    INSERT INTO public.store_wallet_entries (store_id, order_id, kind, gross, fee, net, description)
    VALUES (NEW.store_id, NEW.id, 'order_credit', gross, fee, net, 'Pedido #' || substr(NEW.id::text,1,8));
    INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
    VALUES (NEW.store_id, 'order_delivered', 'Pedido entregue',
            'Você recebeu R$ ' || to_char(net, 'FM999999990.00'), NEW.id);
  END IF;
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
    VALUES (NEW.store_id, 'order_cancelled', 'Pedido cancelado', 'Um pedido foi cancelado', NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_credit_on_delivery ON public.orders;
CREATE TRIGGER trg_credit_on_delivery AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.credit_store_on_delivery();

-- === Trigger: notifica novo pedido ===
CREATE OR REPLACE FUNCTION public.notify_store_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
  VALUES (NEW.store_id, 'new_order', 'Novo pedido recebido',
          'Total: R$ ' || to_char(NEW.total, 'FM999999990.00'), NEW.id);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_new_order ON public.orders;
CREATE TRIGGER trg_notify_new_order AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_new_order();

-- === Trigger: notifica nova avaliação ===
CREATE OR REPLACE FUNCTION public.notify_store_new_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.store_notifications (store_id, kind, title, body)
  VALUES (NEW.store_id, 'new_review', 'Nova avaliação',
          'Nota: ' || NEW.rating || '★');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_new_review ON public.store_reviews;
CREATE TRIGGER trg_notify_new_review AFTER INSERT ON public.store_reviews
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_new_review();

-- === Função: saldo da loja ===
CREATE OR REPLACE FUNCTION public.store_wallet_balance(_store_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(net), 0) FROM public.store_wallet_entries WHERE store_id = _store_id;
$$;

-- === Política: dono da loja pode responder avaliação (UPDATE apenas reply) ===
DROP POLICY IF EXISTS "store_owner_replies_review" ON public.store_reviews;
CREATE POLICY "store_owner_replies_review" ON public.store_reviews
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
  );
