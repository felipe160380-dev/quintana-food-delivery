
-- Add 'in_review' to courier enum
ALTER TYPE public.courier_approval_status ADD VALUE IF NOT EXISTS 'in_review' BEFORE 'approved';

-- Create matching enum for stores
DO $$ BEGIN
  CREATE TYPE public.store_approval_status AS ENUM ('pending','in_review','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS approval_status public.store_approval_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Existing stores considered approved (backfill)
UPDATE public.stores SET approval_status='approved', approved_at=COALESCE(approved_at, created_at) WHERE approval_status='pending';

-- Enforce: rejection requires a note
CREATE OR REPLACE FUNCTION public.enforce_rejection_note()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status = 'rejected' AND (NEW.approval_note IS NULL OR length(trim(NEW.approval_note)) < 3) THEN
    RAISE EXCEPTION 'É necessário informar o motivo da recusa (mínimo 3 caracteres).';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stores_rejection_note ON public.stores;
CREATE TRIGGER stores_rejection_note BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_rejection_note();

DROP TRIGGER IF EXISTS couriers_rejection_note ON public.couriers;
CREATE TRIGGER couriers_rejection_note BEFORE INSERT OR UPDATE ON public.couriers
FOR EACH ROW EXECUTE FUNCTION public.enforce_rejection_note();

-- Only allow store to go online when approved
CREATE OR REPLACE FUNCTION public.enforce_store_online_requires_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_online = true AND NEW.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Loja precisa estar aprovada para ficar online.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stores_online_gate ON public.stores;
CREATE TRIGGER stores_online_gate BEFORE INSERT OR UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_store_online_requires_approval();
