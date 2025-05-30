import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { paragraphs, index, language } = await req.json();
    if (!Array.isArray(paragraphs) || typeof index !== 'number' || (language !== 'english' && language !== 'hebrew')) {
      return NextResponse.json({ error: 'Invalid request parameters.' }, { status: 400 });
    }
    if (index < 0 || index >= paragraphs.length) {
      return NextResponse.json({ error: 'Index out of bounds.' }, { status: 400 });
    }
    const updatedParagraphs = [...paragraphs];
    updatedParagraphs.splice(index, 1);
    return NextResponse.json({ updatedParagraphs });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to remove paragraph.', details: error.message || 'Unknown error' }, { status: 500 });
  }
} 