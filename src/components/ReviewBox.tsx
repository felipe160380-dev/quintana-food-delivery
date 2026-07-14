import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { toast } from "sonner";

type Props = { orderId: string; storeId: string; customerId: string };

export function ReviewBox({ orderId, storeId, customerId }: Props) {
  const [existing, setExisting] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("store_reviews").select("*").eq("order_id", orderId).eq("customer_id", customerId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExisting(data);
          setRating(data.rating);
          setComment(data.comment ?? "");
        }
      });
  }, [orderId, customerId]);

  const submit = async () => {
    setSaving(true);
    const payload = { store_id: storeId, order_id: orderId, customer_id: customerId, rating, comment: comment.trim() || null };
    const { error, data } = existing
      ? await supabase.from("store_reviews").update({ rating, comment: comment.trim() || null }).eq("id", existing.id).select().maybeSingle()
      : await supabase.from("store_reviews").insert(payload).select().maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    setExisting(data);
    toast.success(existing ? "Avaliação atualizada!" : "Obrigado pela sua avaliação!");
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{existing ? "Sua avaliação" : "Avalie o pedido"}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
                className="p-1 transition hover:scale-110"
                aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              >
                <Star className={`size-7 ${filled ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
            );
          })}
        </div>
        <Textarea
          rows={3}
          placeholder="Conte como foi sua experiência (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <Button onClick={submit} disabled={saving} className="w-full">
          {saving ? "Salvando..." : existing ? "Atualizar avaliação" : "Enviar avaliação"}
        </Button>
      </CardContent>
    </Card>
  );
}
