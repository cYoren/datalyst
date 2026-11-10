const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "datalyst-agent-api",
      type: "skill-md",
      description: "Connect to the Datalyst MCP server or Agent API to read trackers, log Check-ins, run N=1 experiments, and retrieve results.",
      url: "https://datalyst.one/.well-known/agent-skills/datalyst-agent-api/SKILL.md",
      digest: "sha256:0a54f977a38652304698973d13d27fc13d087bba960334c3bbc6b40b35f258e0",
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
