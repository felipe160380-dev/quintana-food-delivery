import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShoppingBag, LogOut, Store, MapPin, ClipboardList, Bike, LogIn, UtensilsCrossed, CreditCard, Shield, LayoutDashboard, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { primaryRole } from "@/lib/profile";
import { NotificationsBell } from "@/components/NotificationsBell";
import logo from "@/assets/mipede-logo.png.asset.json";

export function AppHeader() {
  const { user, roles, signOut } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const role = primaryRole(roles);
  const shopper = role === "customer";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user || !shopper) { setUnread(0); return; }
    let active = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("list_customer_conversations");
      if (error) { console.error(error); return; }
      if (!active) return;
      setUnread((data ?? []).reduce((s: number, c: any) => s + Number(c.unread_count ?? 0), 0));
    };
    load();
    const ch = supabase
      .channel(`header-unread:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [user?.id, shopper]);

  if (pathname.startsWith("/auth") || pathname.startsWith("/adm-login")) return null;

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const roleLabel =
    role === "merchant" ? "Lojista" : role === "courier" ? "Entregador" : role === "admin" ? "Admin" : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={role === "merchant" ? "/lojista" : role === "courier" ? "/entregador" : role === "admin" ? "/adm" : "/"}
            className="flex min-w-0 items-center gap-2 font-bold"
          >
            <img src={logo.url} alt="MiPede" className="h-7 w-auto shrink-0" />
          </Link>
          {roleLabel && (
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">{roleLabel}</Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {shopper && (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/pedidos"><ClipboardList className="mr-1 size-4" /> Pedidos</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/enderecos"><MapPin className="mr-1 size-4" /> Endereços</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="relative">
                <Link to="/checkout" aria-label="Carrinho">
                  <ShoppingBag className="size-4" />
                  {count > 0 && (
                    <Badge className="absolute -right-1 -top-1 size-5 rounded-full p-0 text-[10px] tabular-nums">{count}</Badge>
                  )}
                </Link>
              </Button>
            </>
          )}

          {role === "merchant" && (
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/lojista"><LayoutDashboard className="mr-1 size-4" /> Painel</Link>
            </Button>
          )}
          {role === "courier" && (
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/entregador"><Bike className="mr-1 size-4" /> Entregas</Link>
            </Button>
          )}
          {role === "admin" && (
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/adm"><Shield className="mr-1 size-4" /> Administração</Link>
            </Button>
          )}

          {user && <NotificationsBell />}

          {!user ? (
            <Button size="sm" onClick={() => nav({ to: "/auth" })}>

              <LogIn className="mr-1 size-4" /> Entrar
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 px-2">
                  <Avatar className="size-7"><AvatarFallback className="text-xs">{initials}</AvatarFallback></Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-0.5">
                  <div className="truncate text-sm font-medium">{user.email}</div>
                  {roleLabel && <div className="text-xs font-normal text-muted-foreground">Perfil: {roleLabel}</div>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {shopper && (
                  <>
                    <DropdownMenuItem onClick={() => nav({ to: "/pedidos" })}>
                      <ClipboardList className="mr-2 size-4" /> Meus pedidos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav({ to: "/conversas" })}>
                      <MessageCircle className="mr-2 size-4" /> Conversas
                      {unread > 0 && (
                        <Badge variant="destructive" className="ml-auto size-5 justify-center rounded-full p-0 text-[10px] tabular-nums">
                          {unread}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav({ to: "/enderecos" })}>
                      <MapPin className="mr-2 size-4" /> Endereços
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => nav({ to: "/pagamentos" })}>
                      <CreditCard className="mr-2 size-4" /> Formas de pagamento
                    </DropdownMenuItem>
                  </>
                )}
                {role === "merchant" && (
                  <DropdownMenuItem onClick={() => nav({ to: "/lojista" })}>
                    <Store className="mr-2 size-4" /> Painel do lojista
                  </DropdownMenuItem>
                )}
                {role === "courier" && (
                  <DropdownMenuItem onClick={() => nav({ to: "/entregador" })}>
                    <Bike className="mr-2 size-4" /> Painel do entregador
                  </DropdownMenuItem>
                )}
                {role === "admin" && (
                  <DropdownMenuItem onClick={() => nav({ to: "/adm" })}>
                    <Shield className="mr-2 size-4" /> Painel administrativo
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                  <LogOut className="mr-2 size-4" /> Sair
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    if (!confirm("Excluir sua conta permanentemente? Esta ação não pode ser desfeita.")) return;
                    const { supabase } = await import("@/integrations/supabase/client");
                    const { error } = await supabase.rpc("delete_my_account");
                    if (error) { console.error(error); alert("Não foi possível excluir a conta. Tente novamente."); return; }
                    await signOut();
                    nav({ to: "/" });
                  }}
                >
                  Excluir minha conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
