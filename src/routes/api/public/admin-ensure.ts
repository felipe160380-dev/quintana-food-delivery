import { createFileRoute } from "@tanstack/react-router";

// Hidden admin bootstrap endpoint: ensures the fixed admin user exists.
// Credentials are enforced here so anonymous callers can only ever create
// exactly this pre-defined admin account (idempotent).
const ADMIN_USERNAME = "felipe2002";
const ADMIN_PASSWORD = "Walker2027@@";
const ADMIN_EMAIL = "felipe2002@quintanafood.internal";

export const Route = createFileRoute("/api/public/admin-ensure")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any = {};
        try { body = await request.json(); } catch {}
        if (body?.username !== ADMIN_USERNAME || body?.password !== ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Try to create; if already exists it's fine.
        const created = await supabaseAdmin.auth.admin.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: "Administrador" },
        });
        let userId = created.data.user?.id;
        if (!userId) {
          // fetch existing
          const list = await supabaseAdmin.auth.admin.listUsers();
          userId = list.data.users.find((u) => u.email === ADMIN_EMAIL)?.id;
        }
        if (!userId) return new Response(JSON.stringify({ ok: false }), { status: 500 });
        // Grant admin role
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" }).select().maybeSingle();
        return new Response(JSON.stringify({ ok: true, email: ADMIN_EMAIL }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
