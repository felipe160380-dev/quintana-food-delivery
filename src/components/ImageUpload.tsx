import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ImageUpload({
  bucket,
  value,
  onChange,
  label = "Imagem",
  aspect = "aspect-video",
}: {
  bucket: "store-assets" | "product-assets" | "avatars";
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  aspect?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    setUploading(false);
    if (signed?.signedUrl) onChange(signed.signedUrl);
  };

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {value ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-lg border bg-muted`}>
          <img src={value} alt="" className="h-full w-full object-cover" />
          <Button type="button" variant="secondary" size="icon" className="absolute right-2 top-2" onClick={() => onChange(null)}>
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={`flex ${aspect} w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-accent/30`}
        >
          <Upload className="size-4" />
          {uploading ? "Enviando..." : "Enviar imagem"}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
      />
    </div>
  );
}
