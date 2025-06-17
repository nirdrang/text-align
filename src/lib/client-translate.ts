/**
 * Client-safe function to fetch translations from the API.
 * Use this in any client component instead of importing from translate_score.ts directly.
 */
export async function translateHebrewToEnglish(text: string): Promise<string> {
  try {
    console.log('[Client] Requesting translation from API');
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[Client] Received translation from API');
    return data.translation;
  } catch (error) {
    console.error('[Client] Translation request failed:', error);
    return '[Translation Error]';
  }
} 