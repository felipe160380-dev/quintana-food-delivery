CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_external_id_key
  ON public.payments (provider, external_id);