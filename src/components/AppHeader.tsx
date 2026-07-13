import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShoppingBag, LogOut, Store, MapPin, ClipboardList, Bike, LogIn, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/lib/cart";
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

export function AppHeader() {
  const { user, roles, signOut } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/auth")) return null;

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="size-4" />
          </span>
          <span className="text-lg tracking-tight">quintana<span className="text-primary">food</span></span>
        </Link>
        <div className="flex-1" />

        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
          <Link to="/enderecos"><MapPin className="mr-1 size-4" /> Endereços</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild className="relative">
          <Link to="/checkout">
            <ShoppingBag className="size-4" />
            {count > 0 && (
              <Badge className="absolute -right-1 -top-1 size-5 rounded-full p-0 text-[10px]">{count}</Badge>
            )}
          </Link>
        </Button>

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
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav({ to: "/pedidos" })}>
                <ClipboardList className="mr-2 size-4" /> Meus pedidos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => nav({ to: "/enderecos" })}>
                <MapPin className="mr-2 size-4" /> Endereços
              </DropdownMenuItem>
              {roles.includes("merchant") ? (
                <DropdownMenuItem onClick={() => nav({ to: "/lojista" })}>
                  <Store className="mr-2 size-4" /> Painel do lojista
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => nav({ to: "/tornar-se-lojista" })}>
                  <Store className="mr-2 size-4" /> Cadastrar minha loja
                </DropdownMenuItem>
              )}
              {roles.includes("courier") ? (
                <DropdownMenuItem onClick={() => nav({ to: "/entregador" })}>
                  <Bike className="mr-2 size-4" /> Painel do entregador
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => nav({ to: "/tornar-se-entregador" })}>
                  <Bike className="mr-2 size-4" /> Ser entregador
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                <LogOut className="mr-2 size-4" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
