import { NextResponse } from 'next/server';
import { HabitService } from '@/services/habit.service';
import { createHabitSchema, createSubvariableSchema } from '@/lib/validations';
import { getAuthenticatedUser } from '@/lib/ensure-user';
import { z } from 'zod';

const createHabitBodySchema = createHabitSchema.extend({
    subvariables: z.array(createSubvariableSchema.omit({ habitId: true })).optional(),
    templateId: z.string().optional(),
});

export async function GET() {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const habits = await HabitService.getUserHabits(user.id);
        return NextResponse.json(habits);
    } catch (error) {
        console.error('Error fetching habits:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}


export async function POST(request: Request) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const json = await request.json();
        const body = createHabitBodySchema.parse(json);

        const habit = await HabitService.createHabit(user.id, {
            ...body,
            subvariables: body.subvariables || []
        });

        return NextResponse.json(habit, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        console.error('Error creating habit:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

