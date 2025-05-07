import OpenAI from "openai";
import { pipeline, cos_sim } from "@xenova/transformers";
import * as unic from "unorm";

// Ensure OPENAI_API_KEY is set in your environment variables
// Consider adding error handling for missing API key
const openai = new OpenAI({});

export interface Pair {
 en: string;
 he: string;
}
export interface Scored extends Pair {
 mt: string; // Machine Translation (Hebrew)
 bleu: number; // BLEU-1 score
 cosine: number; // Cosine similarity score
 blended: number; // Weighted blend of BLEU and Cosine
}

async function translateToHebrew(text: string): Promise<string> {
 console.log(`[OpenAI] Preparing to translate text: "${text.substring(0, 50)}..."`); // Log before call
 try {
  const chat = await openai.chat.completions.create({
  model: "gpt-4.1-nano", // or gpt‑3.5‑turbo
  temperature: 0,
  messages: [
  {
  role: "system",
  content: "Translate from English to Hebrew. Return ONLY the translation."
  },
  { role: "user", content: text }
  ]
  });
  const translation = chat.choices[0].message.content!.trim();
  console.log(`[OpenAI] Successfully received translation: "${translation.substring(0, 50)}..."`); // Log success
  return translation;
 } catch (error) {
   console.error("[OpenAI] Error translating to Hebrew:", error); // Log error
   // Decide how to handle OpenAI errors, maybe return an empty string or throw
   return "[Translation Error]";
 }
}

// ---------- BLEU‑1 (quick, sufficient for paragraph matching) ---------
function bleu1(ref: string, hyp: string): number {
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
  "sentence-transformers/distiluse-base-multilingual-cased-v2",
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

// ---------- main scorer -----------------------------------------------
export async function scorePair(pair: Pair): Promise<Omit<Scored, 'en' | 'he'>> {
 const { en, he } = pair;
 console.log(`[ScorePair] Scoring pair: EN="${en.substring(0, 50)}...", HE="${he.substring(0, 50)}..."`);
 console.log(`[ScorePair] Calling OpenAI for translation...`);
 const mt = await translateToHebrew(en);

 if (mt === "[Translation Error]") {
    console.warn("[ScorePair] Skipping scoring due to translation error.");
    // Return default scores indicating failure
    return { mt, bleu: 0, cosine: 0, blended: 0 };
 }

 console.log(`[ScorePair] Normalizing texts for BLEU...`);
 const normalizedHe = normalise(he);
 const normalizedMt = normalise(mt);

 console.log(`[ScorePair] Calculating BLEU score...`);
 const bleu = bleu1(normalizedHe, normalizedMt);
 console.log(`[ScorePair] BLEU score: ${bleu}`);

 console.log(`[ScorePair] Calculating Cosine similarity...`);
 const cos = await cosine(he, mt); // Use original Hebrew and MT for cosine semantic comparison.
 console.log(`[ScorePair] Cosine score: ${cos}`);

 // Tune weights if you like, ensuring they sum to 1 if desired
 const blended = 0.6 * bleu + 0.4 * cos;
 console.log(`[ScorePair] Blended score: ${blended}`);

 return {
  mt,
  bleu: parseFloat(bleu.toFixed(3)), // Keep precision reasonable
  cosine: parseFloat(cos.toFixed(3)),
  blended: parseFloat(blended.toFixed(3))
 };
}

// --- helper -----------------------------------------------------------
// Basic normalization, align with the normalization used in page.tsx if needed
function normalise(t: string) {
  // @ts-ignore
 return unic.normalize(t, 'NFC') // Canonical composition
  .replace(/[\u0591-\u05C7]/g, '') // Remove Hebrew diacritics (nikkud, ta'amim) - adjust if needed
  .replace(/[.,;:!?()"'\-\u05BE]/g, '') // Remove common punctuation, including Hebrew maqaf (־)
  .replace(/\s+/g, ' ') // Collapse whitespace
  .toLowerCase() // Convert to lowercase
  .trim();
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

