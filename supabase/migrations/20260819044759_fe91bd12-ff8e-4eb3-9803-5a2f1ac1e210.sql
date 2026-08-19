ALTER FUNCTION public.geo_distance_m(double precision, double precision, double precision, double precision) SET search_path TO 'public';

REVOKE EXECUTE ON FUNCTION public.courier_available_orders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.courier_accept_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.courier_decline_order(uuid) FROM anon;