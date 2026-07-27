-- 1) Notificação de novo pedido: só quando não depende de pagamento online
CREATE OR REPLACE FUNCTION public.notify_store_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_method IN ('pix','card_online') AND NEW.payment_status <> 'paid' THEN
    RETURN NEW; -- aguarda confirmação do pagamento
  END IF;
  INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
  VALUES (NEW.store_id, 'new_order', 'Novo pedido recebido',
          'Total: R$ ' || to_char(NEW.total, 'FM999999990.00'), NEW.id);
  RETURN NEW;
END; $function$;

-- 2) Notifica a loja quando o pagamento online é confirmado (ou estornado)
CREATE OR REPLACE FUNCTION public.notify_store_on_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
    VALUES (NEW.store_id, 'new_order', 'Novo pedido pago',
            'Pagamento confirmado — Total: R$ ' || to_char(NEW.total, 'FM999999990.00'), NEW.id);
  ELSIF NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded' THEN
    INSERT INTO public.store_notifications (store_id, kind, title, body, order_id)
    VALUES (NEW.store_id, 'order_cancelled', 'Pagamento estornado',
            'O pagamento do pedido foi estornado', NEW.id);
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_notify_payment_confirmed ON public.orders;
CREATE TRIGGER trg_notify_payment_confirmed
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_store_on_payment();

REVOKE ALL ON FUNCTION public.notify_store_on_payment() FROM PUBLIC, anon;