import { type CustomerAuthEnv, handleCustomerRoute } from "./customer-auth";

interface Env extends CustomerAuthEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!env.EXPECTED_HOST || url.hostname !== env.EXPECTED_HOST) {
      return new Response("Unknown host", { status: 421 });
    }

    if (
      url.pathname === "/privacy" ||
      url.pathname === "/account" ||
      url.pathname.startsWith("/auth/line/")
    ) {
      return handleCustomerRoute(request, env, url);
    }

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      return new Response("Unavailable", {
        status: env.DEPLOYMENT_ENV === "production" ? 503 : 404,
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Unavailable", { status: 403 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
