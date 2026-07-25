
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Idempotência: um mesmo (provider, external_id) só pode existir uma vez
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_external_id_uniq
  ON public.payments (provider, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments (order_id);
