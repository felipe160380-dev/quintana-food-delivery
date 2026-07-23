-- Etapa 1: Hardening de permissões de funções SECURITY DEFINER
-- Rollback: /mnt/documents/quintanafood-etapa1/rollback.sql

REVOKE EXECUTE ON FUNCTION public.confirm_delivery(uuid, text, double precision, double precision) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.courier_resubmit()                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_account()                                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rate_courier(uuid, smallint, text)                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.store_wallet_balance(uuid)                                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)                                 FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.generate_delivery_code()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_store_on_delivery()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_store_new_order()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_store_new_review()                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_admin_if_owner()                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_rejection_note()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_store_online_requires_approval()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.messages_block_closed()                     FROM PUBLIC, anon, authenticated;