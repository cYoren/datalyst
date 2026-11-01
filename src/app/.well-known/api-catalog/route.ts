const site = "https://datalyst.one";

const catalog = {
  linkset: [
    {
      anchor: site,
      "service-desc": [
        {
          href: `${site}/api/openapi.json`,
          type: "application/vnd.oai.openapi+json;version=3.0",
        },
      ],
      "service-doc": [{ href: `${site}/docs/agent-api`, type: "text/html" }],
      status: [{ href: `${site}/api/v1/protocols`, type: "application/json" }],
    },
    {
      // Remote MCP server (Streamable HTTP), authenticated with a user API key.
      anchor: "https://www.datalyst.one/api/mcp",
      "service-doc": [{ href: `${site}/docs/agent-api#connect-an-agent`, type: "text/html" }],
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(catalog), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/linkset+json; charset=utf-8",
    },
  });
}
