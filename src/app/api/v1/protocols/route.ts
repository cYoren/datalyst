/**
 * GET /api/v1/protocols
 * 
 * Lists all available standardized experiment protocols.
 * Agents use this to discover what experiments they can instantiate.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const protocols = await prisma.protocol.findMany({
            where: { isPublic: true },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                version: true,
                independentTemplate: true,
                dependentTemplate: true,
                recommendedDuration: true,
                recommendedWashout: true,
            },
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({
            success: true,
            protocols,
            count: protocols.length,
        });
    } catch (error) {
        console.error('[API] Failed to list protocols:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch protocols' },
            { status: 500 }
        );
    }
}
