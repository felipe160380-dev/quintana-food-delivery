ALTER TABLE public.store_withdrawals
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_by uuid;

CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.store_withdrawals%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem autorizar saques';
  END IF;

  SELECT * INTO w FROM public.store_withdrawals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF w.status <> 'requested' THEN RAISE EXCEPTION 'Esta solicitação não está pendente'; END IF;

  UPDATE public.store_withdrawals
     SET status = 'approved', approved_at = now(), approved_by = auth.uid()
   WHERE id = _id;

  INSERT INTO public.admin_audit_log (admin_id, action, amount, result, details)
  VALUES (auth.uid(), 'WITHDRAWAL_APPROVED', w.amount, 'success',
          jsonb_build_object('withdrawal_id', w.id, 'store_id', w.store_id, 'net', w.net, 'fee', w.fee));
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_withdrawal_paid(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.store_withdrawals%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem marcar saques como pagos';
  END IF;

  SELECT * INTO w FROM public.store_withdrawals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF w.status = 'paid' THEN RAISE EXCEPTION 'Esta solicitação já foi paga'; END IF;
  IF w.status <> 'approved' THEN RAISE EXCEPTION 'Autorize o saque antes de marcar como pago'; END IF;

  UPDATE public.store_withdrawals
     SET status = 'paid', paid_at = now(), paid_by = auth.uid(), processed_at = now()
   WHERE id = _id;

  INSERT INTO public.admin_audit_log (admin_id, action, amount, result, details)
  VALUES (auth.uid(), 'WITHDRAWAL_MARKED_PAID', w.amount, 'success',
          jsonb_build_object('withdrawal_id', w.id, 'store_id', w.store_id, 'net', w.net, 'fee', w.fee));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE w public.store_withdrawals%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Somente administradores podem recusar saques';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Informe o motivo da recusa';
  END IF;

  SELECT * INTO w FROM public.store_withdrawals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF w.status = 'rejected' THEN RAISE EXCEPTION 'Esta solicitação já foi recusada'; END IF;
  IF w.status = 'paid' THEN RAISE EXCEPTION 'Saque já pago não pode ser recusado'; END IF;

  UPDATE public.store_withdrawals
     SET status = 'rejected', note = btrim(_reason), rejected_by = auth.uid(), processed_at = now()
   WHERE id = _id;

  -- Devolve o valor reservado no momento da solicitação (e a taxa, se houve).
  INSERT INTO public.store_wallet_entries (store_id, kind, gross, fee, net, description)
  VALUES (w.store_id, 'withdrawal_reversal', w.amount, 0, w.amount,
          'Estorno da solicitação de saque #' || substr(w.id::text, 1, 8) || ' (recusada)');

  IF COALESCE(w.fee, 0) > 0 THEN
    INSERT INTO public.store_wallet_entries (store_id, kind, gross, fee, net, description)
    VALUES (w.store_id, 'withdrawal_fee_reversal', 0, 0, w.fee,
            'Estorno da taxa administrativa do saque #' || substr(w.id::text, 1, 8));
  END IF;

  INSERT INTO public.admin_audit_log (admin_id, action, amount, result, details)
  VALUES (auth.uid(), 'WITHDRAWAL_REJECTED', w.amount, 'success',
          jsonb_build_object('withdrawal_id', w.id, 'store_id', w.store_id, 'reason', btrim(_reason)));
END $$;

REVOKE ALL ON FUNCTION public.admin_approve_withdrawal(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_mark_withdrawal_paid(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_reject_withdrawal(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_withdrawal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_withdrawal_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(uuid, text) TO authenticated;