/**
 * Test Containers API - Templates Route
 *
 * GET /api/testcontainers/templates - List all templates
 * POST /api/testcontainers/templates - Create custom template
 */

import { NextResponse } from 'next/server';
import {
  listTemplates,
  createTemplate,
  getTemplatesByCategory,
} from '@/plugins/testcontainers/api/templates';
import type { TemplateCategory } from '@/plugins/testcontainers/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as TemplateCategory | null;
    const grouped = searchParams.get('grouped') === 'true';

    if (grouped) {
      const templatesByCategory = getTemplatesByCategory();
      return NextResponse.json(templatesByCategory);
    }

    const templates = listTemplates(category || undefined);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[Test Containers] Templates list error:', error);
    return NextResponse.json(
      { error: 'Failed to list templates', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name || !body.image || !body.category) {
      return NextResponse.json(
        { error: 'name, image, and category are required' },
        { status: 400 }
      );
    }

    const template = createTemplate(body);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('[Test Containers] Template create error:', error);
    return NextResponse.json(
      { error: 'Failed to create template', details: String(error) },
      { status: 500 }
    );
  }
}
