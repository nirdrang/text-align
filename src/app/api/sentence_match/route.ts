import { NextRequest, NextResponse } from 'next/server';
import { splitSentences } from '@/lib/sentence_utils';
import { bleu1, scorePair as paragraphScorePair, cosine } from '@/lib/translate_score';

export const runtime = 'nodejs';

// Helper to compute blended score for two sentences (using the same logic as scorePair)
async function blendedScore(en: string, mt_en: string): Promise<number> {
  // Use the same logic as in scorePair, but for single sentences
  // scorePair expects a Pair and a translated string, but we can call its internal logic
  // We'll use bleu1, cosine, and length ratio, then blend
  // (We can't call scorePair directly because it expects a paragraph pair)
  const bleu = bleu1(en, mt_en);
  const cos = await cosine(en, mt_en);
  const len_ratio = (() => {
    const toTokens = (s: string) =>
      s
        .replace(/\s+/g, ' ')
        .replace(/([.!?;,:'"()\[\]{}<>«»„"”])/g, ' $1 ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const t1 = toTokens(en);
    const t2 = toTokens(mt_en);
    if (t1.length === 0 || t2.length === 0) return 0.0;
    return Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
  })();
  const base = 0.6 * bleu + 0.4 * cos;
  const final = base * Math.pow(len_ratio, 2);
  return Math.round(final * 10000) / 10000;
}

/**
 * POST body: {
 *   englishSentences: string[],
 *   hebrewParagraphEnglish: string
 * }
 * Returns: {
 *   matches: Array<{ englishSentenceIdx: number, hebrewSentenceIdx: number, score: number }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { englishSentences, hebrewParagraphEnglish } = await req.json();
    if (!Array.isArray(englishSentences) || typeof hebrewParagraphEnglish !== 'string') {
      return NextResponse.json({ error: 'englishSentences must be an array and hebrewParagraphEnglish must be a string.' }, { status: 400 });
    }
    const hebSentences = splitSentences(hebrewParagraphEnglish, 'english');
    const matches = [];
    for (let i = 0; i < englishSentences.length; i++) {
      const enSent = englishSentences[i];
      let bestIdx = -1;
      let bestScore = -1;
      for (let j = 0; j < hebSentences.length; j++) {
        const score = await blendedScore(enSent, hebSentences[j]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = j;
        }
      }
      matches.push({ englishSentenceIdx: i, hebrewSentenceIdx: bestIdx, score: bestScore });
    }
    return NextResponse.json({ matches });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to match sentences', details: error.message || String(error) }, { status: 500 });
  }
} 