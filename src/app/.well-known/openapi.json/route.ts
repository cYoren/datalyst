const document = {
  openapi: "3.0.3",
  info: {
    title: "Datalyst public agent discovery surface",
    version: "1.0.0",
    description: "Discovery resources and the authenticated Agent API for Datalyst.",
  },
  servers: [{ url: "https://datalyst.one" }],
  paths: {
    "/.well-known/api-catalog": { get: { summary: "Get the API catalog" } },
    "/.well-known/agent-skills/index.json": { get: { summary: "Get the agent skills index" } },
    "/agent.md": { get: { summary: "Get the agent-oriented Markdown homepage" } },
    "/auth.md": { get: { summary: "Get authentication guidance" } },
    "/api/mcp": { post: { summary: "Remote MCP server (Streamable HTTP), Authorization: Bearer <key>" } },
  },
};

export function GET() {
  return new Response(JSON.stringify(document), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/vnd.oai.openapi+json;version=3.0",
    },
  });
}
