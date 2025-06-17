import { NextResponse } from 'next/server';
import { loadCacheForLecture, getCacheCount } from '@/lib/global_cache';

// This endpoint now populates the cache for a lecture
export async function POST(request: Request) {
  try {
    const { lectureIdx } = await request.json();
    if (lectureIdx === undefined || lectureIdx === null) {
      return NextResponse.json({ error: 'Missing lectureIdx parameter' }, { status: 400 });
    }
    await loadCacheForLecture(lectureIdx);
    const count = getCacheCount();
    return NextResponse.json({ ok: true, count, lectureIdx });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to populate cache', details: error.message }, { status: 500 });
  }
} 