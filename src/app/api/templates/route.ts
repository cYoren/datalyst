import { NextResponse } from 'next/server';
import { TemplateService } from '@/services/template.service';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const createTemplateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    defaultSchedule: z.any().optional(),
    subvariableTemplate: z.array(z.any()).optional(),
});

export async function GET(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        let templates;
        if (query) {
            // Search templates
            templates = await TemplateService.searchTemplates(user.id, query);
        } else {
            // Get all templates
            templates = await TemplateService.getUserTemplates(user.id);
        }

        return NextResponse.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const json = await request.json();
        const body = createTemplateSchema.parse(json);

        const template = await TemplateService.createTemplate(user.id, body);
        return NextResponse.json(template, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('Error creating template:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

