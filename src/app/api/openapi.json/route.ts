/**
 * OpenAPI 3.0 Specification for Datalyst Agent API
 */

import { NextResponse } from 'next/server';

const openApiSpec = {
    openapi: '3.0.3',
    info: {
        title: 'Datalyst Agent API',
        version: '1.1.0',
        description: 'Run scientifically rigorous N=1 experiments for your users.',
        contact: {
            email: 'support@datalyst.one',
        },
    },
    servers: [
        {
            url: 'https://datalyst.one',
            description: 'Production',
        },
        {
            url: 'http://localhost:3005',
            description: 'Development',
        },
    ],
    tags: [
        { name: 'Protocols' },
        { name: 'Trials' },
        { name: 'Results' },
        { name: 'MCP' },
    ],
    paths: {
        '/api/mcp': {
            post: {
                operationId: 'mcp',
                summary: 'Remote MCP server (Streamable HTTP, JSON-RPC 2.0)',
                description: 'Model Context Protocol endpoint. Send JSON-RPC messages (initialize, tools/list, tools/call, ping). Tools: list_trackers, get_today, log_checkin, get_entries, get_correlations, list_experiments, create_experiment, get_experiment_results, export_data. Setup: /docs/agent-api#connect-an-agent',
                tags: ['MCP'],
                security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { type: 'object' } } },
                },
                responses: {
                    '200': { description: 'JSON-RPC response', content: { 'application/json': { schema: { type: 'object' } } } },
                    '202': { description: 'Notification accepted' },
                    '401': { description: 'Missing, invalid, or revoked API key' },
                    '429': { description: 'Rate limit exceeded' },
                },
            },
        },
        '/api/v1/protocols': {
            get: {
                operationId: 'listProtocols',
                summary: 'List available experiment protocols',
                tags: ['Protocols'],
                responses: {
                    '200': {
                        description: 'List of protocols',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        success: { type: 'boolean', example: true },
                                        protocols: {
                                            type: 'array',
                                            items: { $ref: '#/components/schemas/Protocol' },
                                        },
                                        count: { type: 'integer', example: 3 },
                                    },
                                },
                            },
                        },
                    },
                    '500': {
                        description: 'Server error',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/agent/trial': {
            post: {
                operationId: 'startTrial',
                summary: 'Start a new trial from a protocol',
                tags: ['Trials'],
                security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['protocolId'],
                                properties: {
                                    protocolId: {
                                        type: 'string',
                                        description: 'Protocol id or slug',
                                        example: 'magnesium-sleep-v1',
                                    },
                                    duration: {
                                        type: 'integer',
                                        minimum: 7,
                                        maximum: 90,
                                        example: 14,
                                    },
                                    externalUserId: {
                                        type: 'string',
                                        description: 'Optional agent-side user identifier',
                                    },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Trial created successfully',
                        headers: {
                            'X-RateLimit-Limit': { schema: { type: 'string' } },
                            'X-RateLimit-Remaining': { schema: { type: 'string' } },
                            'X-RateLimit-Reset': { schema: { type: 'string' } },
                        },
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TrialCreatedResponse' },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid request',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '401': {
                        description: 'Unauthorized',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '404': {
                        description: 'Protocol not found',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '429': {
                        description: 'Rate limit exceeded',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '500': {
                        description: 'Server error',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/agent/log': {
            post: {
                operationId: 'logData',
                summary: 'Log data for an active trial',
                tags: ['Trials'],
                security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['trialId', 'date', 'entries'],
                                properties: {
                                    trialId: { type: 'string' },
                                    date: {
                                        type: 'string',
                                        format: 'date',
                                        example: '2026-02-06',
                                    },
                                    entries: {
                                        type: 'array',
                                        minItems: 1,
                                        items: {
                                            type: 'object',
                                            required: ['subvariableId', 'value'],
                                            properties: {
                                                subvariableId: { type: 'string' },
                                                value: {
                                                    oneOf: [
                                                        { type: 'number' },
                                                        { type: 'boolean' },
                                                        { type: 'string' },
                                                    ],
                                                },
                                            },
                                        },
                                    },
                                    note: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Data logged successfully',
                        headers: {
                            'X-RateLimit-Limit': { schema: { type: 'string' } },
                            'X-RateLimit-Remaining': { schema: { type: 'string' } },
                            'X-RateLimit-Reset': { schema: { type: 'string' } },
                        },
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/LogResponse' },
                            },
                        },
                    },
                    '400': {
                        description: 'Validation or state error',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '401': {
                        description: 'Unauthorized',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '404': {
                        description: 'Trial not found',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '429': {
                        description: 'Rate limit exceeded',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '500': {
                        description: 'Server error',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                },
            },
        },
        '/api/v1/agent/results/{trialId}': {
            get: {
                operationId: 'getResults',
                summary: 'Get trial analysis',
                tags: ['Results'],
                security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
                parameters: [
                    {
                        name: 'trialId',
                        in: 'path',
                        required: true,
                        schema: { type: 'string' },
                    },
                ],
                responses: {
                    '200': {
                        description: 'Trial results',
                        headers: {
                            'X-RateLimit-Limit': { schema: { type: 'string' } },
                            'X-RateLimit-Remaining': { schema: { type: 'string' } },
                            'X-RateLimit-Reset': { schema: { type: 'string' } },
                        },
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/TrialResultsResponse' },
                            },
                        },
                    },
                    '400': {
                        description: 'Invalid trial shape',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '401': {
                        description: 'Unauthorized',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '404': {
                        description: 'Trial not found',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '429': {
                        description: 'Rate limit exceeded',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                    '500': {
                        description: 'Server error',
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/Error' },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {
        securitySchemes: {
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key',
            },
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                description: 'Personal API key created in Settings, sent as Authorization: Bearer <key>.',
            },
        },
        schemas: {
            Protocol: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    slug: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    version: { type: 'string' },
                    recommendedDuration: { type: 'integer' },
                    recommendedWashout: { type: 'integer' },
                    independentTemplate: { type: 'object' },
                    dependentTemplate: { type: 'object' },
                },
            },
            TrialCreatedResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    trial: {
                        type: 'object',
                        properties: {
                            id: { type: 'string' },
                            slug: { type: 'string' },
                            protocolId: { type: 'string' },
                            protocolSlug: { type: 'string' },
                            startDate: { type: 'string', format: 'date' },
                            endDate: { type: 'string', format: 'date' },
                            status: { type: 'string' },
                        },
                    },
                    loggingSchema: {
                        type: 'object',
                        properties: {
                            independent: { type: 'object' },
                            dependent: { type: 'object' },
                        },
                    },
                    endpoints: {
                        type: 'object',
                        properties: {
                            log: { type: 'string' },
                            results: { type: 'string' },
                        },
                    },
                },
            },
            LogResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    logged: {
                        type: 'object',
                        properties: {
                            trialId: { type: 'string' },
                            date: { type: 'string', format: 'date' },
                            entriesCount: { type: 'integer' },
                            results: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        habitId: { type: 'string' },
                                        entryId: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            TrialResultsResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    trial: { type: 'object' },
                    results: {
                        type: 'object',
                        properties: {
                            conditionA: { type: 'object' },
                            conditionB: { type: 'object' },
                            effectSize: { type: 'number' },
                            effectLabel: { type: 'string' },
                            pValue: { type: 'number', nullable: true },
                            significant: { type: 'boolean' },
                        },
                    },
                    rigor: {
                        type: 'object',
                        properties: {
                            score: { type: 'integer' },
                            grade: { type: 'string' },
                            breakdown: { type: 'array', items: { type: 'object' } },
                            tips: { type: 'array', items: { type: 'string' } },
                        },
                    },
                    attestation: { type: 'object' },
                    shareUrl: { type: 'string', nullable: true },
                },
            },
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string' },
                    details: { type: 'object' },
                    retryAfterSeconds: { type: 'integer' },
                },
            },
        },
    },
};

export async function GET() {
    return NextResponse.json(openApiSpec, {
        headers: {
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
        },
    });
}
