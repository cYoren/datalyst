# Datalyst Agent API

Use the public discovery resources first:

- API catalog: https://datalyst.one/.well-known/api-catalog
- OpenAPI: https://datalyst.one/api/openapi.json
- Authentication: https://datalyst.one/auth.md
- Human-readable docs: https://datalyst.one/docs/agent-api

## MCP server (preferred)

If your client speaks MCP, connect to `https://www.datalyst.one/api/mcp` (Streamable HTTP) with the header `Authorization: Bearer <key>`. Tools: list_trackers, get_today, log_checkin, get_entries, get_correlations, list_experiments, create_experiment, get_experiment_results, export_data. Setup guide: https://datalyst.one/docs/agent-api#connect-an-agent

## REST workflow

1. Ask the user to create an API key in Datalyst Settings (read, or read and write).
2. List available protocols with `GET /api/v1/protocols`.
3. Start a trial with `POST /api/v1/agent/trial`.
4. Log daily data with `POST /api/v1/agent/log`.
5. Retrieve analysis with `GET /api/v1/agent/results/{trialId}`.

Send the key only in the `X-API-Key` or `Authorization: Bearer` header. Never expose it in a URL, client bundle, prompt, log, or repository. Obtain user authority before sending personal habit or health-related data. Results describe statistical associations and are not medical diagnoses.
