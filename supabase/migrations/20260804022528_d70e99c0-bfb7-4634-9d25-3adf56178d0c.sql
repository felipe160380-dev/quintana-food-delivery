ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_order_unread ON public.messages (order_id, read_at);

CREATE OR REPLACE FUNCTION public.list_customer_conversations()
RETURNS TABLE (
  order_id uuid,
  store_id uuid,
  store_name text,
  store_logo_url text,
  order_total numeric,
  order_created_at timestamptz,
  order_status order_status,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id,
         s.id,
         s.name,
         s.logo_url,
         o.total,
         o.created_at,
         o.status,
         lm.body,
         lm.created_at,
         lm.sender_id,
         (SELECT count(*) FROM public.messages m2
           WHERE m2.order_id = o.id
             AND m2.sender_id <> auth.uid()
             AND m2.read_at IS NULL)
  FROM public.orders o
  JOIN public.stores s ON s.id = o.store_id
  JOIN LATERAL (
    SELECT m.body, m.created_at, m.sender_id
      FROM public.messages m
     WHERE m.order_id = o.id
     ORDER BY m.created_at DESC
     LIMIT 1
  ) lm ON true
  WHERE o.customer_id = auth.uid()
  ORDER BY lm.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_customer_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_conversations() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     AND read_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;