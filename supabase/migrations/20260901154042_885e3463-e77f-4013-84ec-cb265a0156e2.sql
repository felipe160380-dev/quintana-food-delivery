-- 1) Notificações pessoais (cliente, entregador, admin)
CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_notifications_select" ON public.user_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_notifications_update" ON public.user_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE UNIQUE INDEX user_notifications_dedupe
  ON public.user_notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_user_notifications_user ON public.user_notifications (user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _kind text, _title text, _body text,
  _link text DEFAULT NULL, _order_id uuid DEFAULT NULL, _dedupe text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_notifications (user_id, kind, title, body, link, order_id, dedupe_key)
  SELECT _user_id, _kind, _title, _body, _link, _order_id, _dedupe
  WHERE _user_id IS NOT NULL
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins(
  _kind text, _title text, _body text, _link text DEFAULT NULL,
  _order_id uuid DEFAULT NULL, _dedupe text DEFAULT NULL
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.user_notifications (user_id, kind, title, body, link, order_id, dedupe_key)
  SELECT r.user_id, _kind, _title, _body, _link, _order_id, _dedupe
    FROM public.user_roles r
   WHERE r.role = 'admin'
  ON CONFLICT DO NOTHING;
$$;

REVOKE ALL ON FUNCTION public.notify_user(uuid, text, text, text, text, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(text, text, text, text, uuid, text) FROM public, anon, authenticated;

-- 3) Pedidos -> cliente e entregador
CREATE OR REPLACE FUNCTION public.notify_order_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE link text := '/pedidos/' || NEW.id::text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.customer_id, 'order_created', 'Pedido recebido',
      'Acompanhe o andamento do seu pedido.', link, NEW.id, 'order:' || NEW.id || ':created');
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF NEW.payment_status = 'paid' THEN
      PERFORM public.notify_user(NEW.customer_id, 'payment_paid', 'Pagamento aprovado',
        'Seu pedido foi enviado para a loja.', link, NEW.id, 'order:' || NEW.id || ':pay:paid');
    ELSIF NEW.payment_status = 'failed' THEN
      PERFORM public.notify_user(NEW.customer_id, 'payment_failed', 'Pagamento não aprovado',
        'Tente novamente ou escolha outra forma de pagamento.', link, NEW.id, 'order:' || NEW.id || ':pay:failed');
    ELSIF NEW.payment_status = 'refunded' THEN
      PERFORM public.notify_user(NEW.customer_id, 'payment_refunded', 'Estorno realizado',
        'O valor do pedido foi estornado.', link, NEW.id, 'order:' || NEW.id || ':pay:refunded');
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(NEW.customer_id, 'order_' || NEW.status::text,
      CASE NEW.status
        WHEN 'accepted' THEN 'Pedido confirmado pela loja'
        WHEN 'preparing' THEN 'Seu pedido está em preparo'
        WHEN 'ready' THEN 'Pedido pronto'
        WHEN 'out_for_delivery' THEN 'Saiu para entrega'
        WHEN 'delivered' THEN 'Pedido entregue'
        WHEN 'cancelled' THEN 'Pedido cancelado'
        ELSE 'Pedido atualizado'
      END,
      CASE NEW.status
        WHEN 'ready' THEN 'Aguardando o entregador retirar.'
        WHEN 'out_for_delivery' THEN 'Acompanhe a entrega em tempo real.'
        WHEN 'delivered' THEN 'Bom apetite!'
        WHEN 'cancelled' THEN 'Abra o pedido para ver os detalhes.'
        ELSE NULL
      END,
      link, NEW.id, 'order:' || NEW.id || ':status:' || NEW.status::text);

    IF NEW.courier_id IS NOT NULL AND NEW.status IN ('delivered', 'cancelled') THEN
      PERFORM public.notify_user(NEW.courier_id, 'delivery_' || NEW.status::text,
        CASE WHEN NEW.status = 'delivered' THEN 'Entrega concluída' ELSE 'Entrega cancelada' END,
        CASE WHEN NEW.status = 'delivered' THEN 'O valor da entrega foi creditado na sua carteira.'
             ELSE 'O pedido foi cancelado.' END,
        '/entregador', NEW.id, 'delivery:' || NEW.id || ':' || NEW.status::text);
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_order_events_ins AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();
CREATE TRIGGER trg_notify_order_events_upd AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_events();

-- 4) Saques -> admin e lojista
CREATE OR REPLACE FUNCTION public.notify_store_withdrawal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s_name text;
BEGIN
  SELECT name INTO s_name FROM public.stores WHERE id = NEW.store_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_admins('withdrawal_requested', 'Novo saque aguardando análise',
      COALESCE(s_name, 'Loja') || ' solicitou R$ ' || to_char(NEW.amount, 'FM999999990.00') || '.',
      '/adm?tab=withdrawals', NULL, 'withdrawal:' || NEW.id || ':requested');

    INSERT INTO public.store_notifications (store_id, kind, title, body)
    VALUES (NEW.store_id, 'withdrawal', 'Saque solicitado',
      'R$ ' || to_char(NEW.amount, 'FM999999990.00') || ' — aguardando análise do administrador.');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.store_notifications (store_id, kind, title, body)
    VALUES (NEW.store_id, 'withdrawal',
      CASE NEW.status
        WHEN 'approved' THEN 'Saque autorizado'
        WHEN 'paid' THEN 'Saque pago'
        WHEN 'rejected' THEN 'Saque recusado'
        ELSE 'Saque atualizado'
      END,
      CASE NEW.status
        WHEN 'approved' THEN 'R$ ' || to_char(NEW.net, 'FM999999990.00') || ' autorizado. O repasse ainda será realizado.'
        WHEN 'paid' THEN 'R$ ' || to_char(NEW.net, 'FM999999990.00') || ' transferido para a sua chave PIX.'
        WHEN 'rejected' THEN 'Motivo: ' || COALESCE(NEW.note, 'não informado') || '. O valor voltou para a sua carteira.'
        ELSE NULL
      END);
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_withdrawal_ins AFTER INSERT ON public.store_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_withdrawal();
CREATE TRIGGER trg_notify_withdrawal_upd AFTER UPDATE ON public.store_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_withdrawal();

-- 5) Cadastros aguardando aprovação
CREATE OR REPLACE FUNCTION public.notify_courier_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('pending', 'in_review') THEN
      PERFORM public.notify_admins('courier_pending', 'Novo entregador aguardando aprovação',
        'Analise a documentação no painel administrativo.', '/adm?tab=couriers', NULL,
        'courier:' || NEW.id || ':pending');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status IN ('pending', 'in_review') THEN
      PERFORM public.notify_admins('courier_pending', 'Entregador aguardando aprovação',
        'Um cadastro de entregador voltou para análise.', '/adm?tab=couriers', NULL,
        'courier:' || NEW.id || ':pending:' || NEW.updated_at::text);
    ELSIF NEW.approval_status = 'approved' THEN
      PERFORM public.notify_user(NEW.id, 'courier_approved', 'Cadastro aprovado',
        'Você já pode ficar disponível e receber entregas.', '/entregador', NULL,
        'courier:' || NEW.id || ':approved:' || NEW.updated_at::text);
    ELSIF NEW.approval_status = 'rejected' THEN
      PERFORM public.notify_user(NEW.id, 'courier_rejected', 'Cadastro recusado',
        'Motivo: ' || COALESCE(NEW.approval_note, 'não informado'), '/entregador', NULL,
        'courier:' || NEW.id || ':rejected:' || NEW.updated_at::text);
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_courier_approval_ins AFTER INSERT ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.notify_courier_approval();
CREATE TRIGGER trg_notify_courier_approval_upd AFTER UPDATE ON public.couriers
  FOR EACH ROW EXECUTE FUNCTION public.notify_courier_approval();

CREATE OR REPLACE FUNCTION public.notify_store_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IN ('pending', 'in_review') THEN
      PERFORM public.notify_admins('store_pending', 'Nova loja aguardando aprovação',
        NEW.name || ' enviou o cadastro para análise.', '/adm?tab=stores', NULL,
        'store:' || NEW.id || ':pending');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
    IF NEW.approval_status IN ('pending', 'in_review') THEN
      PERFORM public.notify_admins('store_pending', 'Loja aguardando aprovação',
        NEW.name || ' voltou para análise.', '/adm?tab=stores', NULL,
        'store:' || NEW.id || ':pending:' || NEW.updated_at::text);
    ELSE
      INSERT INTO public.store_notifications (store_id, kind, title, body)
      VALUES (NEW.id, 'approval',
        CASE WHEN NEW.approval_status = 'approved' THEN 'Loja aprovada' ELSE 'Cadastro da loja recusado' END,
        CASE WHEN NEW.approval_status = 'approved'
             THEN 'Você já pode colocar a loja online.'
             ELSE 'Motivo: ' || COALESCE(NEW.approval_note, 'não informado') END);
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_store_approval_ins AFTER INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_approval();
CREATE TRIGGER trg_notify_store_approval_upd AFTER UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.notify_store_approval();

-- 6) Privacidade: entregador não lê mais pedidos disponíveis direto da tabela.
DROP POLICY IF EXISTS "orders_select_participants" ON public.orders;
CREATE POLICY "orders_select_participants" ON public.orders
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR courier_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = orders.store_id AND s.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
