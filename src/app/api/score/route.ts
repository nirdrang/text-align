import { NextRequest, NextResponse } from 'next/server';
import { scorePair } from '@/lib/translate_score'; // Adjust path as necessary

export const runtime = 'nodejs'; // Use Node.js runtime for transformers.js

export async function POST(req: NextRequest) {
  try {
    const { en, he } = await req.json();

    if (typeof en !== 'string' || typeof he !== 'string') {
      return NextResponse.json({ error: 'Both en (English) and he (Hebrew) parameters are required and must be strings.' }, { status: 400 });
    }

    console.log(`API received request to score: EN="${en.substring(0, 50)}...", HE="${he.substring(0, 50)}..."`);

    // Call the scoring function
    // Make sure OPENAI_API_KEY is available in the environment where this serverless function runs
    const scores = await scorePair({ en, he });

    console.log(`API successfully scored pair. Blended score: ${scores.blended}`);

    // Return the scores
    return NextResponse.json(scores);

  } catch (error: any) {
    console.error('API Error scoring paragraph pair:', error);
    // Provide a generic error message to the client
    return NextResponse.json({ error: 'Failed to calculate similarity score.', details: error.message || 'Unknown error' }, { status: 500 });
  }
}
