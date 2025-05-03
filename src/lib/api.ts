
import { fetchTextFromUrl } from '@/actions/fetch-text';

/**
 * Fetches text content from both English and Hebrew URLs concurrently.
 * Throws an error if either fetch fails.
 *
 * @param englishUrl The URL for the English text.
 * @param hebrewUrl The URL for the Hebrew text.
 * @returns A promise that resolves to an array containing the [englishText, hebrewText].
 */
export async function fetchTexts(englishUrl: string, hebrewUrl: string): Promise<[string, string]> {
  console.log(`[API] Fetching texts: Eng='${englishUrl}', Heb='${hebrewUrl}'`);

  try {
    // Fetch both URLs concurrently
    const [englishResult, hebrewResult] = await Promise.all([
      fetchTextFromUrl(englishUrl),
      fetchTextFromUrl(hebrewUrl),
    ]);

    // Check for errors in English fetch
    if (englishResult.error || typeof englishResult.text !== 'string') {
      const errorMsg = `Failed to fetch English text from ${englishUrl}: ${englishResult.error || 'No text returned'}`;
      console.error(`[API] Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Check for errors in Hebrew fetch
    if (hebrewResult.error || typeof hebrewResult.text !== 'string') {
      const errorMsg = `Failed to fetch Hebrew text from ${hebrewUrl}: ${hebrewResult.error || 'No text returned'}`;
      console.error(`[API] Error: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    console.log(`[API] Successfully fetched texts. Eng length=${englishResult.text.length}, Heb length=${hebrewResult.text.length}`);
    return [englishResult.text, hebrewResult.text];

  } catch (error: any) {
    console.error(`[API] Overall fetch error:`, error);
    // Re-throw a generic error or the specific error if needed
    throw new Error(`Failed to fetch one or both texts: ${error.message}`);
  }
}
