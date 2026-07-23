import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type City = {
  id: string;
  name: string;
  state: string;
  slug: string;
};

const LS_KEY = "qf_city_id";
const EVT = "qf-city-changed";

export function getStoredCityId(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

export function setStoredCityId(id: string) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LS_KEY, id); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: id }));
}

/**
 * Lê a cidade selecionada + lista de cidades ativas.
 * Se houver apenas 1 cidade ativa, seleciona automaticamente.
 * Se houver ≥2 e nenhuma escolhida, `needsPick` = true (Home abre o gate).
 */
export function useCurrentCity() {
  const [cityId, setCityId] = useState<string | null>(getStoredCityId());
  const [cities, setCities] = useState<City[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase
      .from("cities")
      .select("id,name,state,slug")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (!alive) return;
        const list = (data ?? []) as City[];
        setCities(list);
        // Auto-selecionar se houver só 1 ativa
        if (list.length === 1 && getStoredCityId() !== list[0].id) {
          setStoredCityId(list[0].id);
          setCityId(list[0].id);
        }
        // Se cityId salvo não é mais ativo, limpa
        const current = getStoredCityId();
        if (current && !list.some((c) => c.id === current)) {
          try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
          setCityId(null);
        }
        setLoading(false);
      });
    const onChange = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      setCityId(id);
    };
    window.addEventListener(EVT, onChange);
    return () => { alive = false; window.removeEventListener(EVT, onChange); };
  }, []);

  const pick = useCallback((id: string) => {
    setStoredCityId(id);
    setCityId(id);
  }, []);

  const needsPick =
    !loading && cities !== null && cities.length >= 2 && !cityId;

  return { cityId, cities, loading, needsPick, pick };
}
