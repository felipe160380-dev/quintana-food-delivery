import { createFileRoute } from "@tanstack/react-router";

// Public route (bypasses auth on published sites) that records a courier
// application notification. Attempts to email the platform admin.
// Email delivery requires an email provider configured (Lovable Emails,
// Resend, etc.). While that isn't configured the endpoint at minimum logs
// the application for future manual approval.
export const Route = createFileRoute("/api/public/courier-application")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const admin = "felipe160380@gmail.com";
          console.log("[courier-application]", { to: admin, ...body });

          // Best-effort: try Lovable AI Gateway email (if configured)
          const apiKey = process.env.LOVABLE_API_KEY;
          if (apiKey) {
            try {
              await fetch("https://api.lovable.dev/v1/emails/send", {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                  to: admin,
                  subject: "Novo cadastro de entregador — QuintanaFood",
                  html: `
                    <h2>Novo entregador aguardando aprovação</h2>
                    <ul>
                      <li><b>Nome:</b> ${escapeHtml(body.full_name ?? "")}</li>
                      <li><b>E-mail:</b> ${escapeHtml(body.email ?? "")}</li>
                      <li><b>Telefone:</b> ${escapeHtml(body.phone ?? "")}</li>
                      <li><b>CPF:</b> ${escapeHtml(body.document ?? "")}</li>
                      <li><b>Veículo:</b> ${escapeHtml(body.vehicle ?? "")}</li>
                      <li><b>Placa:</b> ${escapeHtml(body.plate ?? "")}</li>
                      <li><b>ID:</b> ${escapeHtml(body.user_id ?? "")}</li>
                    </ul>
                    <p>Acesse o painel administrativo para aprovar.</p>
                  `,
                }),
              });
            } catch (err) {
              console.error("email send failed", err);
            }
          }

          return Response.json({ ok: true });
        } catch (err) {
          console.error(err);
          return new Response("bad request", { status: 400 });
        }
      },
    },
  },
});

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
