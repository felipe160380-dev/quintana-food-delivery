ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS thread text NOT NULL DEFAULT 'store';
ALTER TABLE public.messages ADD CONSTRAINT messages_thread_check CHECK (thread IN ('store','courier'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

DROP POLICY IF EXISTS messages_select_participants ON public.messages;
CREATE POLICY messages_select_participants ON public.messages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        o.customer_id = auth.uid()
        OR (o.courier_id = auth.uid() AND messages.thread = 'courier')
        OR (messages.thread = 'store' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = o.store_id AND s.owner_id = auth.uid()))
        OR has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS messages_insert_participants ON public.messages;
CREATE POLICY messages_insert_participants ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = messages.order_id
      AND (
        (o.customer_id = auth.uid() AND (messages.thread = 'store' OR (messages.thread = 'courier' AND o.courier_id IS NOT NULL)))
        OR (o.courier_id = auth.uid() AND messages.thread = 'courier')
        OR (messages.thread = 'store' AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = o.store_id AND s.owner_id = auth.uid()))
      )
  )
);

DROP FUNCTION IF EXISTS public.mark_conversation_read(uuid);
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_order_id uuid, _thread text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = _order_id
       AND (o.customer_id = v_uid
            OR o.courier_id = v_uid
            OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = o.store_id AND s.owner_id = v_uid))
  ) INTO v_ok;

  IF NOT v_ok THEN RAISE EXCEPTION 'Sem permissão para este pedido'; END IF;

  UPDATE public.messages
     SET read_at = now()
   WHERE order_id = _order_id
     AND sender_id <> v_uid
     AND read_at IS NULL
     AND (_thread IS NULL OR thread = _thread);
END $function$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid, text) TO authenticated;