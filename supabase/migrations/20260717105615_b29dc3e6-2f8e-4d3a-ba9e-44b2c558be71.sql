
CREATE OR REPLACE FUNCTION public.enforce_rejection_note()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.approval_status = 'rejected' AND (NEW.approval_note IS NULL OR length(trim(NEW.approval_note)) < 3) THEN
    RAISE EXCEPTION 'É necessário informar o motivo da recusa (mínimo 3 caracteres).';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_store_online_requires_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_online = true AND NEW.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Loja precisa estar aprovada para ficar online.';
  END IF;
  RETURN NEW;
END; $$;
