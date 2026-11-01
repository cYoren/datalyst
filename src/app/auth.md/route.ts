const body = `# Datalyst auth.md

## Agent audience

Datalyst provides a public website and a separate authenticated Agent API for applications that run N=1 experiments for users.

## Agent registration

A signed-in user creates a personal API key in Settings (https://www.datalyst.one/settings, "API keys and agents"). Keys are scoped to read, or read and write, are shown once, are stored only as a hash, and can be revoked at any time with immediate effect. There is no public registration endpoint.

## Supported method

Send the key as "Authorization: Bearer <key>" or in the X-API-Key header. Never put the key in a URL, client-side bundle, prompt, log, or public repository.

## MCP server

Remote MCP server (Streamable HTTP): https://www.datalyst.one/api/mcp, authenticated with the same key. Each key only reaches the data of the user who created it.

## API resources

- OpenAPI: https://datalyst.one/api/openapi.json
- Human-readable docs: https://datalyst.one/docs/agent-api
- Public protocol list: GET https://datalyst.one/api/v1/protocols
- Trial, logging, and result endpoints require the X-API-Key header.

## Data and safety

The API can process personal habit and health-related data. Obtain user authority and consent before sending data. Statistical results are not medical diagnoses and do not guarantee outcomes.
`;

export function GET() {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
