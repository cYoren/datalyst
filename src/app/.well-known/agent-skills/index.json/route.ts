const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "datalyst-agent-api",
      type: "skill-md",
      description: "Connect to the Datalyst MCP server or Agent API to read trackers, log Check-ins, run N=1 experiments, and retrieve results.",
      url: "https://datalyst.one/.well-known/agent-skills/datalyst-agent-api/SKILL.md",
      digest: "sha256:ae00bf901645cebc07822c01633f114bf7c9c14e4fac40b0e5c2d1cf3ad7dcd1",
    },
  ],
};

export function GET() {
  return new Response(JSON.stringify(index), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
