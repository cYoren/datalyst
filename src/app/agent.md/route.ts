const body = `---
title: Datalyst
description: Symptom and habit tracking. See how what you do relates to how you feel, with real statistical correlations.
---

# Datalyst

Datalyst is a symptom and habit tracker. People log how they feel and what they do, then inspect how those records relate. It can also run personal experiments.

## Public resources

- API catalog: https://datalyst.one/.well-known/api-catalog
- OpenAPI specification: https://datalyst.one/api/openapi.json
- Agent API documentation: https://datalyst.one/docs/agent-api
- Agent skills: https://datalyst.one/.well-known/agent-skills/index.json
- Sitemap: https://datalyst.one/sitemap.xml

## MCP server

Datalyst runs a remote MCP server at https://www.datalyst.one/api/mcp (Streamable HTTP). Authenticate with "Authorization: Bearer <key>" using a key the user creates in Settings. Tools: list_trackers, get_today, log_checkin, get_entries, get_correlations, list_experiments, create_experiment, get_experiment_results, export_data. Setup for Claude, Cursor and the OpenAI API: https://www.datalyst.one/docs/agent-api#connect-an-agent

    claude mcp add --transport http datalyst https://www.datalyst.one/api/mcp --header "Authorization: Bearer <key>"

## Agent API

The REST agent API accepts the same key in an X-API-Key or Authorization: Bearer header. Users create keys in Settings (read, or read and write). Do not put keys in URLs, browser code, or logs.

## Data boundary

Datalyst handles personal symptom, habit, and health-related data. Use only data for which the user has authority and follow the API's ownership, retention, and consent rules. Statistical associations are not medical diagnoses or guarantees.
`;

export function GET() {
  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
      "x-markdown-tokens": String(Math.ceil(body.length / 4)),
    },
  });
}
