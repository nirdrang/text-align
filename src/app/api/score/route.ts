import { NextRequest, NextResponse } from 'next/server';
import { scorePair, hashParagraph, translateToEnglish } from '@/lib/translate_score';
import { getFromCache, addToCache } from '@/lib/global_cache';

export const runtime = 'nodejs'; // Use Node.js runtime for transformers.js

export async function POST(req: NextRequest) {
  try {
    const { en, he, enIndex, heIndex } = await req.json();

    if (typeof en !== 'string' || typeof he !== 'string') {
      return NextResponse.json({ error: 'Both en (English) and he (Hebrew) parameters are required and must be strings.' }, { status: 400 });
    }

    console.log(`API received request to score: EN="${en.substring(0, 50)}...", HE="${he.substring(0, 50)}...", EN idx=${enIndex}, HE idx=${heIndex}`);

    // Use cache for translation
    const key = hashParagraph(he);
    let mt_en = getFromCache(key)?.en;
    if (mt_en) {
      console.log(`[CACHE HIT] Translation for hash ${key.substring(0, 8)} served from cache.`);
    } else {
      console.log(`[CACHE MISS] No cache for hash ${key.substring(0, 8)}. Will translate.`);
      mt_en = await translateToEnglish(he);
      if (mt_en !== '[Translation Error]') {
        addToCache({ key, he, en: mt_en });
      }
    }

    if (mt_en === '[Translation Error]') {
      return NextResponse.json({ error: 'Translation failed.' }, { status: 500 });
    }

    const scores = await scorePair({ en, he }, mt_en, heIndex, enIndex);

    console.log(`API successfully scored pair. Blended score: ${scores.blended}`);

    return NextResponse.json(scores);

  } catch (error: any) {
    console.error('API Error scoring paragraph pair:', error);
    // Provide a generic error message to the client
    return NextResponse.json({ error: 'Failed to calculate similarity score.', details: error.message || 'Unknown error' }, { status: 500 });
  }
}
