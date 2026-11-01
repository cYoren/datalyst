import { NextResponse } from 'next/server';
import { TemplateService } from '@/services/template.service';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { z } from 'zod';

const updateTemplateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    defaultSchedule: z.any().optional(),
    subvariableTemplate: z.array(z.any()).optional(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const template = await TemplateService.getTemplateById(user.id, id);
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        return NextResponse.json(template);
    } catch (error) {
        console.error('Error fetching template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const json = await request.json();
        const body = updateTemplateSchema.parse(json);

        const template = await TemplateService.updateTemplate(user.id, id, body);
        return NextResponse.json(template);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('Error updating template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getAuthenticatedUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        await TemplateService.deleteTemplate(user.id, id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
