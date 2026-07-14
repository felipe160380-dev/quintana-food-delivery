import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";

export function StoreRating({ storeId, compact = false }: { storeId: string; compact?: boolean }) {
  const [avg, setAvg] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    supabase.from("store_reviews").select("rating").eq("store_id", storeId).then(({ data }) => {
      if (!data || data.length === 0) return;
      const s = data.reduce((a, r: any) => a + Number(r.rating), 0);
      setAvg(s / data.length);
      setCount(data.length);
    });
  }, [storeId]);

  if (avg == null) return compact ? null : <span className="text-xs text-muted-foreground">Sem avaliações</span>;

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className="size-3 fill-primary text-primary" />
      <span className="font-semibold">{avg.toFixed(1)}</span>
      {!compact && <span className="text-muted-foreground">({count})</span>}
    </span>
  );
}
