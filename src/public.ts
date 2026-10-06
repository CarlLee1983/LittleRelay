interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  DEPLOYMENT_ENV: "test" | "production";
  EXPECTED_HOST: string;
  STORE_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!env.EXPECTED_HOST || url.hostname !== env.EXPECTED_HOST) {
      return new Response("Unknown host", { status: 421 });
    }

    // No dynamic endpoint is enabled until its identity and write guards exist.
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
