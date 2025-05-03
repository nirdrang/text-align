'use server';

import * as cheerio from 'cheerio';

interface FetchResult {
  text?: string;
  error?: string;
}

/**
 * Fetches HTML from a URL and extracts text content, trying to maintain paragraph structure.
 * @param url The URL to fetch text from.
 * @returns An object containing the extracted text or an error message.
 */
export async function fetchTextFromUrl(url: string): Promise<FetchResult> {
  try {
    // Validate URL format (basic check)
    try {
      new URL(url);
    } catch (_) {
      return { error: 'Invalid URL format.' };
    }

    const response = await fetch(url, {
        headers: {
            // Set a common User-Agent to mimic a browser request
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            // Request common content types
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        // Add a timeout to prevent hanging requests (e.g., 10 seconds)
        // Note: Native fetch doesn't support timeout directly like this.
        // AbortController is the standard way.
         signal: AbortSignal.timeout(15000) // 15 seconds timeout
    });

    if (!response.ok) {
        // Provide more specific error based on status code
        if (response.status === 404) {
            return { error: `URL not found (404).` };
        }
        if (response.status >= 400 && response.status < 500) {
             return { error: `Client error fetching URL (status: ${response.status}). Check the URL.` };
        }
        if (response.status >= 500) {
            return { error: `Server error fetching URL (status: ${response.status}). Try again later.` };
        }
      return { error: `Failed to fetch URL. Status: ${response.status}` };
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) {
        // Handle non-HTML content gracefully - maybe try plain text extraction
        if (contentType?.includes('text/plain')) {
             const text = await response.text();
             return { text };
        }
        return { error: 'URL did not return HTML content.' };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Attempt to find the main content area (common selectors)
    let mainContent = $('main, article, .main-content, #main, #content').first();
    if (mainContent.length === 0) {
      // Fallback to body if no main content area is found
      mainContent = $('body');
    }

    // Extract text from paragraph (<p>) tags within the main content
    // and join them with double line breaks to simulate paragraphs.
    // Also consider <div>s that might act as paragraphs in some structures.
    const paragraphs: string[] = [];
    mainContent.find('p, div').each((i, el) => {
      const element = $(el);
      // Basic heuristic: Consider divs with significant text content and no block children as paragraphs
      const isParagraphLikeDiv = el.name === 'div' && element.children(':not(br, span, i, b, strong, em, a, code, sub, sup)').length === 0 && element.text().trim().length > 50; // Adjust length threshold as needed

      if (el.name === 'p' || isParagraphLikeDiv) {
        // Get text, clean up whitespace, and preserve line breaks within the paragraph
        let paragraphText = '';
         element.contents().each((_, node) => {
           if (node.type === 'text') {
             paragraphText += $(node).text();
           } else if (node.type === 'tag' && node.name === 'br') {
             paragraphText += '\n'; // Keep explicit line breaks
           } else if (node.type === 'tag') {
               // Add space around inline elements to prevent words sticking together
               const innerText = $(node).text();
                if (innerText.length > 0) {
                    paragraphText += ' ' + innerText + ' ';
                }
           }
         });

        // Trim whitespace and normalize multiple spaces/newlines
        paragraphText = paragraphText
                .replace(/[\s\n\r]+/g, ' ') // Replace multiple whitespace/newlines with single space
                .trim();

        if (paragraphText.length > 0) {
          paragraphs.push(paragraphText);
        }
      }
    });

    // Join paragraphs with double line breaks
    const extractedText = paragraphs.join('\n\n');

    if (!extractedText.trim()) {
      return { error: 'Could not extract significant text content from the URL.' };
    }

    return { text: extractedText };
  } catch (error: any) {
    console.error(`Error fetching or parsing URL ${url}:`, error);
    if (error.name === 'AbortError') {
         return { error: 'Request timed out while fetching the URL.' };
    }
    if (error.message.includes('ECONNREFUSED')) {
         return { error: 'Connection refused. Check the URL or network.' };
    }
    // Generic error for other issues
    return { error: `An error occurred: ${error.message}` };
  }
}
