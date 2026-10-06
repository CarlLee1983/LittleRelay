interface Env {
  DB: D1Database;
  EXPECTED_HOST: string;
  STORE_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      !env.EXPECTED_HOST ||
      new URL(request.url).hostname !== env.EXPECTED_HOST
    ) {
      return new Response("Unknown host", { status: 421 });
    }

    // Access and current D1 owner checks arrive with the owner activation slice.
    return new Response("Owner access is not active", { status: 403 });
  },
} satisfies ExportedHandler<Env>;
