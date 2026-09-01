REVOKE ALL ON FUNCTION public.notify_order_events() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_store_withdrawal() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_courier_approval() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_store_approval() FROM public, anon, authenticated;