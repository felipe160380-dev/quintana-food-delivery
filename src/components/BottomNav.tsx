import { Link, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MapPin, ShoppingBag, Bike, LayoutDashboard, Store, Shield, Users, Wallet } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/use-auth";
import { primaryRole } from "@/lib/profile";
import { Badge } from "@/components/ui/badge";

type Item = { to: string; label: string; icon: typeof Home; badge?: boolean };

const CUSTOMER: Item[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/enderecos", label: "Endereços", icon: MapPin },
  { to: "/checkout", label: "Carrinho", icon: ShoppingBag, badge: true },
];

const MERCHANT: Item[] = [
  { to: "/lojista", label: "Painel", icon: LayoutDashboard },
  { to: "/lojista", label: "Loja", icon: Store },
];

const COURIER: Item[] = [
  { to: "/entregador", label: "Entregas", icon: Bike },
  { to: "/entregador", label: "Ganhos", icon: Wallet },
];

const ADMIN: Item[] = [
  { to: "/adm", label: "Painel", icon: Shield },
  { to: "/adm", label: "Usuários", icon: Users },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const { roles } = useAuth();
  const role = primaryRole(roles);

  if (pathname.startsWith("/auth") || pathname.startsWith("/adm-login")) return null;

  // Perfis operacionais usam a navegação do próprio painel (evita duplicidade).
  if (role !== "customer") return null;

  const items = role === "customer" ? CUSTOMER : role === "merchant" ? MERCHANT : role === "courier" ? COURIER : ADMIN;

  return (
    <nav className="sticky bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <ul className="mx-auto grid max-w-6xl grid-cols-4">
        {items.map((it) => {
          const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
          const Icon = it.icon;
          return (
            <li key={it.label}>
              <Link
                to={it.to}
                className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`size-5 transition-transform ${active ? "scale-110" : ""}`} />
                <span>{it.label}</span>
                {it.badge && count > 0 && (
                  <Badge className="absolute right-5 top-1 size-4 rounded-full p-0 text-[9px] tabular-nums">{count}</Badge>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
