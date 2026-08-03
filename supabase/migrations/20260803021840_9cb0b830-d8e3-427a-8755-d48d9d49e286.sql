REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_wallet_entries FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.courier_wallet_entries FROM authenticated, anon;
REVOKE ALL ON public.courier_wallet_entries FROM anon;
REVOKE ALL ON public.courier_withdrawals FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.courier_withdrawals FROM authenticated;