import { NextResponse } from 'next/server';
import { translateToEnglish, hashParagraph } from '@/lib/translate_score';
import { getFromCache, addToCache } from '@/lib/global_cache';

export async function POST(request: Request) {
  try {
    const { text } = await request.json();
    if (!text) {
      return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
    }
    const key = hashParagraph(text);
    const cached = getFromCache(key);
    if (cached) {
      console.log(`[CACHE HIT] Translation for hash ${key.substring(0, 8)} served from cache.`);
      return NextResponse.json({ translation: cached.en });
    } else {
      console.log(`[CACHE MISS] No cache for hash ${key.substring(0, 8)}. Will translate.`);
    }
    const translation = await translateToEnglish(text);
    if (translation !== '[Translation Error]') {
      addToCache({ key, he: text, en: translation });
    }
    return NextResponse.json({ translation });
  } catch (error) {
    console.error('Translation API error:', error);
    return NextResponse.json(
      { error: 'Failed to translate text' },
      { status: 500 }
    );
  }
} 