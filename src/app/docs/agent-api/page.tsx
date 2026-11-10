/**
 * Agent API Documentation Page
 * 
 * Human-readable docs for developers and AI agents
 */

import { Metadata } from 'next';
import { siteOrigin, withCanonical } from '@/lib/brand';

export const metadata: Metadata = withCanonical('/docs/agent-api', {
    title: 'Agent API Documentation | Datalyst',
    description: 'API documentation for reading symptoms and habits, logging check-ins, and running personal experiments.',
});

export default function AgentApiDocsPage() {
    const baseUrl = siteOrigin();

    return (
        <div className="min-h-screen bg-[var(--color-bg-subtle)] ">
            <div className="max-w-4xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="mb-12">
                    <h1 className="text-4xl font-bold text-[var(--color-text-primary)] mb-4">
                        Datalyst Agent API
                    </h1>
                    <p className="text-xl text-[var(--color-text-secondary)] ">
                        Run scientifically rigorous N=1 experiments for your users
                    </p>
                </div>

                <ConnectAnAgent />

                {/* Quick Start */}
                <section className="mb-12 bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        Quick start
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">1. Get an API Key</h3>
                            <p className="text-[var(--color-text-secondary)] ">
                                Create one in <a href="/settings" className="text-[var(--color-violet)] hover:underline">Settings</a> under API keys and agents. Choose read only, or read and write. The key is shown once; Datalyst stores only a hash.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">2. List Available Protocols</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -H "X-API-Key: sk_your_key" \\
  ${baseUrl}/api/v1/protocols`}
                            </pre>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">3. Start a Trial</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -X POST -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"protocolId": "magnesium-sleep-v1"}' \\
  ${baseUrl}/api/v1/agent/trial`}
                            </pre>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">4. Log Daily Data</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -X POST -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "trialId": "cmlb87yie00073j9ok1fmjw8u",
    "date": "2025-01-15",
    "entries": [
      {"subvariableId": "cmlb87xic00043j9o9u7u6ij4", "value": true},
      {"subvariableId": "cmlb87xic00053j9okcpua2af", "value": 7.5}
    ]
  }' \\
  ${baseUrl}/api/v1/agent/log`}
                            </pre>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">5. Get Results</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -H "X-API-Key: sk_your_key" \\
  ${baseUrl}/api/v1/agent/results/trial_abc123`}
                            </pre>
                        </div>
                    </div>
                </section>

                {/* cURL Examples */}
                <section className="mb-12 bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        Example cURL commands
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">Invalid API key (401)</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -i -X POST ${baseUrl}/api/v1/agent/trial \\
  -H "X-API-Key: sk_invalid" \\
  -H "Content-Type: application/json" \\
  -d '{"protocolId":"magnesium-sleep-v1"}'`}
                            </pre>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">Validation error (400)</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -i -X POST ${baseUrl}/api/v1/agent/log \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"trialId":"trial_abc123","date":"2026/02/06","entries":[]}'`}
                            </pre>
                        </div>

                        <div>
                            <h3 className="font-medium text-[var(--color-text-primary)] mb-2">Rate limit headers</h3>
                            <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                                {`curl -i -X POST ${baseUrl}/api/v1/agent/log \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"trialId":"trial_abc123","date":"2026-02-06","entries":[{"subvariableId":"sv_x","value":1}]}'`}
                            </pre>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2">
                                Check <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, and <code>X-RateLimit-Reset</code> in the response headers.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Authentication */}
                <section className="mb-12 bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        Authentication
                    </h2>
                    <p className="text-[var(--color-text-secondary)] mb-4">
                        All API requests require your key in an <code className="bg-[var(--color-bg-subtle)] px-2 py-1 rounded">X-API-Key</code> header (or <code className="bg-[var(--color-bg-subtle)] px-2 py-1 rounded">Authorization: Bearer</code>). Write endpoints need a key with the write scope. Revoked keys stop working immediately.
                    </p>
                    <pre className="bg-[var(--color-bg-subtle)] text-[var(--color-teal)] p-4 rounded-[var(--radius-card)] overflow-x-auto text-sm">
                        {`X-API-Key: sk_your_api_key_here`}
                    </pre>
                </section>

                {/* Endpoints */}
                <section className="mb-12">
                    <h2 className="text-2xl font-semibold mb-6 text-[var(--color-text-primary)] ">
                        Endpoints
                    </h2>

                    <div className="space-y-6">
                        {/* GET /protocols */}
                        <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-[var(--color-teal)]/15 text-[var(--color-teal)] px-2 py-1 rounded text-sm font-mono">GET</span>
                                <code className="text-[var(--color-text-primary)] font-mono">/api/v1/protocols</code>
                            </div>
                            <p className="text-[var(--color-text-secondary)] ">
                                List all available experiment protocols. Use these to start trials.
                            </p>
                        </div>

                        {/* POST /agent/trial */}
                        <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-[var(--color-violet)]/15 text-[var(--color-violet)] px-2 py-1 rounded text-sm font-mono">POST</span>
                                <code className="text-[var(--color-text-primary)] font-mono">/api/v1/agent/trial</code>
                            </div>
                            <p className="text-[var(--color-text-secondary)] mb-3">
                                Start a new trial from a protocol. Returns the trial ID and logging schema.
                            </p>
                            <div className="text-sm">
                                <span className="font-medium text-[var(--color-text-primary)] ">Body:</span>
                                <pre className="bg-[var(--color-bg-subtle)] p-2 rounded mt-1 text-xs">
                                    {`{ "protocolId": "magnesium-sleep-v1", "duration": 14 }`}
                                </pre>
                            </div>
                        </div>

                        {/* POST /agent/log */}
                        <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-[var(--color-violet)]/15 text-[var(--color-violet)] px-2 py-1 rounded text-sm font-mono">POST</span>
                                <code className="text-[var(--color-text-primary)] font-mono">/api/v1/agent/log</code>
                            </div>
                            <p className="text-[var(--color-text-secondary)] mb-3">
                                Log data entries for a trial. Validates against the protocol schema.
                            </p>
                            <div className="text-sm">
                                <span className="font-medium text-[var(--color-text-primary)] ">Body:</span>
                                <pre className="bg-[var(--color-bg-subtle)] p-2 rounded mt-1 text-xs">
                                    {`{
  "trialId": "trial_abc123",
  "date": "2025-01-15",
  "entries": [
    { "subvariableId": "sv_xxx", "value": 7.5 }
  ]
}`}
                                </pre>
                            </div>
                        </div>

                        {/* GET /agent/results */}
                        <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                            <div className="flex items-center gap-3 mb-3">
                                <span className="bg-[var(--color-teal)]/15 text-[var(--color-teal)] px-2 py-1 rounded text-sm font-mono">GET</span>
                                <code className="text-[var(--color-text-primary)] font-mono">/api/v1/agent/results/{'{trialId}'}</code>
                            </div>
                            <p className="text-[var(--color-text-secondary)] ">
                                Get statistical results, rigor score, and blockchain verification for a trial.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Blockchain Verification */}
                <section className="mb-12 bg-[var(--color-violet)]/10 rounded-[var(--radius-card)] p-6">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        Proof verification
                    </h2>
                    <p className="text-[var(--color-text-secondary)] mb-4">
                        All experiment results are attested on <strong>Base L2</strong> using the
                        <a href="https://attest.sh" className="text-[var(--color-violet)] hover:underline ml-1" target="_blank" rel="noopener">
                            Ethereum Attestation Service (EAS)
                        </a>.
                        Users don&apos;t need wallets; the platform signs on their behalf.
                    </p>
                    <div className="bg-[var(--color-bg-card)] rounded p-4">
                        <div className="text-sm text-[var(--color-text-secondary)] ">
                            <strong>Schema UID:</strong><br />
                            <code className="text-xs break-all">0x121062e4b9590b821fddeec7affc8d5ed417c04ef7bc9f58e05be185f6e3b071</code>
                        </div>
                    </div>
                </section>

                {/* OpenAPI */}
                <section className="mb-12 bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        OpenAPI specification
                    </h2>
                    <p className="text-[var(--color-text-secondary)] mb-4">
                        For AI agents and tooling, the full OpenAPI 3.0 spec is available at:
                    </p>
                    <a
                        href="/api/openapi.json"
                        className="inline-flex items-center gap-2 bg-[var(--color-bg-subtle)] text-white px-4 py-2 rounded-[var(--radius-card)] hover:bg-[var(--color-bg-subtle)] transition"
                    >
                        <code>/api/openapi.json</code>
                    </a>
                </section>

                {/* Rate Limits */}
                <section className="bg-[var(--color-bg-card)] rounded-[var(--radius-card)] p-6 ">
                    <h2 className="text-2xl font-semibold mb-4 text-[var(--color-text-primary)] ">
                        Rate Limits
                    </h2>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b ">
                                <th className="py-2 text-[var(--color-text-primary)] ">Endpoint</th>
                                <th className="py-2 text-[var(--color-text-primary)] ">Limit</th>
                            </tr>
                        </thead>
                        <tbody className="text-[var(--color-text-secondary)] ">
                            <tr className="border-b ">
                                <td className="py-2">All endpoints</td>
                                <td className="py-2">60 requests/minute</td>
                            </tr>
                            <tr>
                                <td className="py-2">POST /agent/log</td>
                                <td className="py-2">30 requests/minute</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="mt-3 text-sm text-[var(--color-text-secondary)] ">
                        Some API keys may be provisioned with lower limits. Use response headers to monitor remaining quota.
                    </p>
                </section>

                {/* Footer */}
                <footer className="mt-12 text-center text-[var(--color-text-secondary)] text-sm">
                    <p>
                        Questions? Contact <a href="mailto:support@datalyst.one" className="text-[var(--color-violet)] hover:underline">support@datalyst.one</a>
                    </p>
                </footer>
            </div>
        </div>
    );
}

const MCP_URL = 'https://www.datalyst.one/api/mcp';

const MCP_TOOLS: [string, string][] = [
    ['list_trackers', 'Your trackers and the variables each one records'],
    ['get_today', 'Check-in status for a given local date'],
    ['log_checkin', 'Record one value for one day (write scope)'],
    ['get_entries', 'Logged entries for a date range'],
    ['get_correlations', 'Significant correlations from the Datalyst stats engine'],
    ['list_experiments', 'Your Lab experiments'],
    ['create_experiment', 'Start a Lab experiment with a randomized schedule (write scope)'],
    ['get_experiment_results', 'Results and interpretation for one experiment'],
    ['export_data', 'Full JSON export of your account'],
];

function Code({ children }: { children: string }) {
    return (
        <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">{children}</pre>
    );
}

function ConnectAnAgent() {
    return (
        <section id="connect-an-agent" className="mb-12 bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm space-y-6">
            <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Connect an agent (MCP)</h2>
                <p className="text-gray-600 dark:text-gray-300">
                    Datalyst runs a remote MCP server, so Claude, Cursor and other agents can read your trackers, check today&apos;s Check-in, log values and run Lab experiments for you. Every call only sees the data of the account that owns the key.
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                    Server URL: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded break-all">{MCP_URL}</code> (Streamable HTTP). Create a key in <a href="/settings" className="text-blue-600 hover:underline">Settings</a>, then replace <code>&lt;key&gt;</code> below.
                </p>
            </div>

            <div className="space-y-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Claude Code</h3>
                <Code>{`claude mcp add --transport http datalyst ${MCP_URL} --header "Authorization: Bearer <key>"`}</Code>
            </div>

            <div className="space-y-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Claude Desktop</h3>
                <p className="text-gray-600 dark:text-gray-300">
                    Add this to <code>claude_desktop_config.json</code> (Settings, Developer, Edit Config) and restart Claude. It uses the mcp-remote bridge, which needs Node.js.
                </p>
                <Code>{`{
  "mcpServers": {
    "datalyst": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}", "--header", "Authorization:\${DATALYST_AUTH}"],
      "env": { "DATALYST_AUTH": "Bearer <key>" }
    }
  }
}`}</Code>
            </div>

            <div className="space-y-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Cursor</h3>
                <p className="text-gray-600 dark:text-gray-300">Add this to <code>~/.cursor/mcp.json</code> (or <code>.cursor/mcp.json</code> in a project you do not commit secrets from).</p>
                <Code>{`{
  "mcpServers": {
    "datalyst": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer <key>" }
    }
  }
}`}</Code>
            </div>

            <div className="space-y-2">
                <h3 className="font-medium text-gray-900 dark:text-white">ChatGPT and the OpenAI API</h3>
                <p className="text-gray-600 dark:text-gray-300">
                    ChatGPT&apos;s in-app connectors currently accept only OAuth or no authentication, so they cannot send a Datalyst key yet. With the OpenAI Responses API you can pass the key as a header:
                </p>
                <Code>{`{
  "model": "gpt-5",
  "tools": [{
    "type": "mcp",
    "server_label": "datalyst",
    "server_url": "${MCP_URL}",
    "headers": { "Authorization": "Bearer <key>" },
    "require_approval": "never"
  }],
  "input": "What did I log today? My local date is 2026-10-06."
}`}</Code>
            </div>

            <div className="space-y-2">
                <h3 className="font-medium text-gray-900 dark:text-white">Tools</h3>
                <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    {MCP_TOOLS.map(([name, text]) => (
                        <li key={name}><code className="text-gray-900 dark:text-white">{name}</code>: {text}</li>
                    ))}
                </ul>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    Keep keys out of URLs, shared repos and screenshots. If a key leaks, revoke it in Settings; it stops working on the next request.
                </p>
            </div>
        </section>
    );
}
