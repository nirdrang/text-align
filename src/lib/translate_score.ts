import OpenAI from "openai";
import { pipeline, cos_sim } from "@xenova/transformers";
import unorm from "unorm";

// Ensure OPENAI_API_KEY is set in your environment variables
// Consider adding error handling for missing API key
const openai = new OpenAI({});

export interface Pair {
 en: string;
 he: string;
}
export interface Scored extends Pair {
 bleu: number; // BLEU-1 score
 cosine: number; // Cosine similarity score
 blended: number; // Weighted blend of BLEU and Cosine
 len_ratio: number; // Length ratio between EN and MT-EN
}

export function hashParagraph(text: string): string {
  // Simple hash: base64 of UTF-8 bytes
  return Buffer.from(text, 'utf-8').toString('base64');
}

export async function translateToEnglish(text: string): Promise<string> {
 console.log(`[OpenAI] Preparing to translate text: "${text.substring(0, 50)}..."`);
 try {
  const chat = await openai.chat.completions.create({
   model: "gpt-4o-mini",
   temperature: 0,
   messages: [
    {
     role: "system",
     content: "Translate the following Hebrew paragraph to English. Preserve sentence boundaries: for each Hebrew sentence, output the corresponding English sentence on a new line, in the same order. Do not merge or split sentences. Return ONLY the translation, one English sentence per line."
    },
    { role: "user", content: text }
   ]
  });
  const translation = chat.choices[0].message.content!.trim();
  console.log(`[OpenAI] Successfully received translation: "${translation.substring(0, 50)}..."`);
  return translation;
 } catch (error) {
   console.error("[OpenAI] Error translating to English:", error);
   return "[Translation Error]";
 }
}

export async function translateToEnglishWithCache(text: string, cache: LectureJsonlCache): Promise<string> {
  console.log("[DEBUG] translateToEnglishWithCache called");
  const key = hashParagraph(text);
  const shortKey = key.substring(0, 8);
  console.log(`[CACHE CHECK] Checking cache for hash ${shortKey}... (text: "${text.substring(0, 50)}")`);
  if (cache.has(key)) {
    console.log(`[CACHE HIT] Translation for hash ${shortKey} served from cache.`);
    return cache.get(key)!.en;
  }
  const translation = await translateToEnglish(text);
  if (translation !== "[Translation Error]") {
    await cache.append({ key, he: text, en: translation });
  }
  return translation;
}

// ---------- BLEU‑1 (quick, sufficient for paragraph matching) ---------
export function bleu1(ref: string, hyp: string): number {
 // Simple BLEU-1 implementation
 const refTokens = new Set(ref.split(/\s+/));
 const hypTokens = hyp.split(/\s+/);
 if (hypTokens.length === 0) {
  return 0; // Avoid division by zero if hypothesis is empty
 }
 const overlap = hypTokens.filter(t => refTokens.has(t)).length;
 return overlap / hypTokens.length; // 0..1 (based on hypothesis length)
}

// ---------- neural cosine ---------------------------------------------
let embedder: any = null;
async function getEmb() {
 if (!embedder) {
  console.log("Loading sentence transformer model...");
  try {
  // Using quantized model for potentially faster loading/inference
  embedder = await pipeline(
  "feature-extraction",
  "Xenova/distiluse-base-multilingual-cased-v2",
  { quantized: true }
  );
  console.log("Sentence transformer model loaded.");
  } catch (error) {
   console.error("Failed to load sentence transformer model:", error);
   throw error; // Re-throw to indicate failure in score calculation
  }
 }
 return embedder;
}

async function cosine(a: string, b: string): Promise<number> {
 try {
  const emb = await getEmb();
  // Normalize inputs for embedding
  const normalizedA = normalise(a);
  const normalizedB = normalise(b);
  console.log(`[Cosine] Calculating similarity between: "${normalizedA.substring(0,50)}..." and "${normalizedB.substring(0,50)}..."`)
  const [v1, v2] = await emb([normalizedA, normalizedB], { pooling: 'mean', normalize: true });
  // Using node's cos_sim which expects specific data structure from the model output
  const similarity = cos_sim(v1.data, v2.data);
  console.log(`[Cosine] Calculated similarity: ${similarity}`);
  return Math.max(0, Math.min(1, similarity)); // Clamp between 0 and 1
 } catch (error) {
   console.error("[Cosine] Error calculating cosine similarity:", error);
   // Decide how to handle embedding/cosine errors
   return 0; // Return 0 or another indicator of failure
 }
}

/**
 * Tiny, language-agnostic tokenizer for length-ratio.
 * Splits on whitespace _and_ separates leading / trailing punctuation
 * so "word." ➜ ["word", "."]
 */
function lengthRatio(en: string, mt_en: string): number {
  const toTokens = (s: string) =>
    s
      // normalise whitespace
      .replace(/\s+/g, " ")
      // isolate most ASCII punctuation
      .replace(/([.!?;,:'"()\[\]{}<>«»„"”])/g, " $1 ")
      .trim()
      .split(/\s+/)                               // final split
      .filter(Boolean);

  const t1 = toTokens(en);
  const t2 = toTokens(mt_en);

  if (t1.length === 0 || t2.length === 0) return 0.0;
  return Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
}

// ---------- main scorer -----------------------------------------------
export async function scorePair(pair: Pair, mt_en: string, heIndex?: number, enIndex?: number): Promise<Omit<Scored, 'en' | 'he'>> {
 const { en, he } = pair;
 console.log(`[ScorePair] Scoring pair: HE idx=${heIndex ?? 'N/A'}, EN idx=${enIndex ?? 'N/A'}`);

 if (mt_en === "[Translation Error]") {
   console.warn("[ScorePair] Skipping scoring due to translation error.");
   return { bleu: 0, cosine: 0, blended: 0, len_ratio: 0 };
 }

 const bleu = bleu1(en, mt_en);
 const cos = await cosine(en, mt_en);
 const lr = lengthRatio(en, mt_en);
 const base = 0.6 * bleu + 0.4 * cos;
 const final = base * Math.pow(lr, 2);

 // Verbose debug logs
 console.log(`[ScorePair] EN: "${en.substring(0, 120)}..."`);
 console.log(`[ScorePair] HE: "${he.substring(0, 120)}..."`);
 console.log(`[ScorePair] MT: "${mt_en.substring(0, 120)}..."`);
 console.log(`[ScorePair] BLEU: ${bleu}`);
 console.log(`[ScorePair] Cosine: ${cos}`);
 console.log(`[ScorePair] LenRatio: ${lr}`);
 console.log(`[ScorePair] Base: ${base}`);
 console.log(`[ScorePair] Final: ${final}`);

 return {
   bleu: round4(bleu),
   cosine: round4(cos),
   len_ratio: round4(lr),
   blended: round4(final),
 };
}

// --- helper -----------------------------------------------------------
// Basic normalization, align with the normalization used in page.tsx if needed
function normalise(t: string) {
  // @ts-ignore
 return unorm.nfc(t)
  .replace(/[\u0591-\u05C7]/g, '') // Remove Hebrew diacritics (nikkud, ta'amim) - adjust if needed
  .replace(/[.,;:!?()"'\-\u05BE]/g, '') // Remove common punctuation, including Hebrew maqaf (־)
  .replace(/\s+/g, ' ') // Collapse whitespace
  .toLowerCase() // Convert to lowercase
  .trim();
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

// Example of scoring multiple pairs if needed later
// export async function scorePairs(pairs: Pair[]): Promise<Scored[]> {
//  const scored: Scored[] = [];
//  for (const p of pairs) {
//      const scores = await scorePair(p);
//      scored.push({ ...p, ...scores });
//  }
//  // Consider potential parallelization here if scoring many pairs
//  // const results = await Promise.all(pairs.map(p => scorePair(p)));
//  // return pairs.map((p, i) => ({ ...p, ...results[i] }));
//  return scored;
// }

/* ------------------- demo (for testing in isolation) --------------------
async function runDemo() {
 const demoPair = {
  en: "Where is a person's higher self to be found?",
  he: "היכן היא עצמיותו הגבוהה של האדם?"
 };
 console.log("Running scoring demo...");
 try {
  const result = await scorePair(demoPair);
  console.log("Scoring result:", JSON.stringify({ ...demoPair, ...result }, null, 2));
 } catch (error) {
  console.error("Demo failed:", error);
 }
}

// Uncomment and run with `node --env-file=.env.local src/lib/translate_score.js` (after tsc)
// Make sure .env.local has OPENAI_API_KEY
// runDemo();
----------------------------------------------------------------------- */

/**
 * Splits a paragraph into sentences. Handles both English and Hebrew.
 * For Hebrew, splits on period/question/exclamation marks followed by space or end of string.
 * For English, splits on period/question/exclamation marks followed by space or end of string.
 */
export function splitSentences(text: string, language: 'english' | 'hebrew'): string[] {
  if (!text) return [];
  if (language === 'hebrew') {
    // Hebrew: split on . ? ! followed by space or end of string
    return text
      .replace(/([.?!])(?=\s|$)/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
  } else {
    // English: split on . ? ! followed by space or end of string
    return text
      .replace(/([.?!])(?=\s|$)/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
  }
}

export { cosine };

