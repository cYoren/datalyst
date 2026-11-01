"use client";

import { useEffect } from "react";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type ModelContext = {
  registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => void;
};

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

export function WebMcpTools() {
  useEffect(() => {
    const modelContext = navigator.modelContext;
    if (!modelContext) return;

    const controller = new AbortController();
    const tools: Tool[] = [
      {
        name: "get_page_content",
        description: "Return the readable text from the current Datalyst page.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({
          content: [{ type: "text", text: document.querySelector("main")?.textContent?.trim().slice(0, 12000) ?? "" }],
        }),
      },
      {
        name: "list_public_protocols",
        description: "List Datalyst experiment protocols that are available without an API key.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => {
          const response = await fetch("/api/v1/protocols");
          if (!response.ok) throw new Error(`Protocol request failed: ${response.status}`);
          return { content: [{ type: "text", text: JSON.stringify(await response.json()) }] };
        },
      },
      {
        name: "get_mcp_server_info",
        description:
          "How to connect an agent to the Datalyst remote MCP server, which reads trackers, logs Check-ins and runs Lab experiments with the user's own API key.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => ({
          content: [{
            type: "text",
            text: JSON.stringify({
              url: "https://www.datalyst.one/api/mcp",
              transport: "streamable-http",
              auth: "Authorization: Bearer <key>. The user creates the key in Settings, API keys and agents.",
              claudeCode: 'claude mcp add --transport http datalyst https://www.datalyst.one/api/mcp --header "Authorization: Bearer <key>"',
              docs: "https://www.datalyst.one/docs/agent-api#connect-an-agent",
            }),
          }],
        }),
      },
    ];

    for (const tool of tools) modelContext.registerTool(tool, { signal: controller.signal });
    return () => controller.abort();
  }, []);

  return null;
}
