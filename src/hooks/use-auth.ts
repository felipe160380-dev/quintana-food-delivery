import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "customer" | "merchant" | "courier" | "admin";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  // Enquanto os papéis do usuário atual não forem carregados, seguimos em loading.
  // Isso evita que guards (ex.: /adm) leiam roles=[] e bloqueiem indevidamente.
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setRolesFor(null);
      return;
    }
    let active = true;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!active) return;
        setRoles(((data ?? []) as { role: Role }[]).map((r) => r.role));
        setRolesFor(user.id);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const loading = !authReady || (!!user && rolesFor !== user.id);


  return {
    user,
    roles,
    loading,
    hasRole: (r: Role) => roles.includes(r),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
}
