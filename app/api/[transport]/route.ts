import { createMcpHandler } from "@vercel/mcp-adapter";
import { registerTools } from "@/lib/tools";
import { checkAuth } from "@/lib/auth";

const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  undefined,
  { basePath: "/api" }
);

export async function GET(req: Request): Promise<Response> {
  const authResult = checkAuth(req.headers.get("authorization"));
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.message }), {
      status: authResult.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return mcpHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  const authResult = checkAuth(req.headers.get("authorization"));
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.message }), {
      status: authResult.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return mcpHandler(req);
}
