import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/tornar-se-lojista")({
  beforeLoad: () => { throw redirect({ to: "/auth" }); },
  component: () => null,
});
