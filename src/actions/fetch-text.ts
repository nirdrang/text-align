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
  console.log(`[fetchTextFromUrl] Starting fetch for URL: ${url}`);
  try {
    // Validate URL format (basic check)
    try {
      new URL(url);
    } catch (_) {
      console.error(`[fetchTextFromUrl] Invalid URL format: ${url}`);
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
        // Add a timeout to prevent hanging requests (e.g., 15 seconds)
         signal: AbortSignal.timeout(15000) // 15 seconds timeout
    });

    console.log(`[fetchTextFromUrl] Response status for ${url}: ${response.status}`);

    if (!response.ok) {
        // Provide more specific error based on status code
        let errorMessage = `Failed to fetch URL. Status: ${response.status}`;
        if (response.status === 404) {
            errorMessage = `URL not found (404).`;
        } else if (response.status >= 400 && response.status < 500) {
             errorMessage = `Client error fetching URL (status: ${response.status}). Check the URL or permissions.`;
        } else if (response.status >= 500) {
            errorMessage = `Server error fetching URL (status: ${response.status}). The website might be down or blocking requests.`;
        }
        console.error(`[fetchTextFromUrl] Fetch failed for ${url}: ${errorMessage}`);
        return { error: errorMessage };
    }

    const contentType = response.headers.get('content-type');
    console.log(`[fetchTextFromUrl] Content-Type for ${url}: ${contentType}`);

    if (!contentType || (!contentType.includes('text/html') && !contentType.includes('text/plain'))) {
        console.warn(`[fetchTextFromUrl] URL did not return HTML or plain text content: ${url}. Content-Type: ${contentType}`);
         // Allow processing if it's potentially text-like, otherwise error
         if (!contentType?.startsWith('text/')) {
            return { error: 'URL did not return text-based content (HTML or plain text).' };
         }
    }

     // Handle plain text directly
     if (contentType?.includes('text/plain')) {
          const text = await response.text();
          console.log(`[fetchTextFromUrl] Extracted plain text from ${url}. Length: ${text.length}`);
          if (!text.trim()) {
            console.warn(`[fetchTextFromUrl] Plain text content is empty for ${url}.`);
            return { error: 'Could not extract significant text content (plain text was empty).' };
          }
          return { text };
     }


    // Process HTML
    const html = await response.text();
    const $ = cheerio.load(html);
    console.log(`[fetchTextFromUrl] Loaded HTML for ${url}. Length: ${html.length}`);

    // Attempt to find the main content area (common selectors)
    let mainContent = $('main, article, .main-content, #main, #content').first();
    if (mainContent.length === 0) {
      console.log(`[fetchTextFromUrl] No main content selector found for ${url}. Falling back to body.`);
      mainContent = $('body');
    } else {
       console.log(`[fetchTextFromUrl] Found main content area using selectors for ${url}.`);
    }

    // Remove elements that often contain noise (scripts, styles, nav, footers, ads)
    mainContent.find('script, style, nav, footer, header, aside, form, noscript, [aria-hidden="true"], .advertisement, .ad, .sidebar').remove();
    console.log(`[fetchTextFromUrl] Removed script, style, nav, etc. elements for ${url}.`);

    // Extract text from paragraph (<p>) tags and relevant <div>s within the main content
    const paragraphs: string[] = [];
    mainContent.find('p, div').each((i, el) => {
      const element = $(el);

      // Basic heuristic for paragraph-like divs: contains significant text, few block children
      const isParagraphLikeDiv = el.name === 'div' &&
          element.children('p, div, ul, ol, h1, h2, h3, h4, h5, h6, table, blockquote').length < 2 && // Few block children
          element.text().trim().length > 50; // Adjust length threshold as needed

      if (el.name === 'p' || isParagraphLikeDiv) {
        // Get text, clean up whitespace, try to preserve intended line breaks within the paragraph block
        let paragraphText = '';
         element.contents().each((_, node) => {
           if (node.type === 'text') {
             paragraphText += $(node).text();
           } else if (node.type === 'tag' && (node.name === 'br' || node.name === 'p')) { // Treat nested <p> like <br> for line breaks
             paragraphText += '\n';
           } else if (node.type === 'tag') {
               // Add space around most inline elements to prevent words sticking together
               const tagName = node.name.toLowerCase();
               const innerText = $(node).text().trim();
                if (innerText.length > 0 && !['sup', 'sub'].includes(tagName)) { // Avoid extra spaces for sup/sub
                    paragraphText += ' ' + innerText + ' ';
                } else if (innerText.length > 0) {
                    paragraphText += innerText;
                }
           }
         });

        // Normalize whitespace: replace multiple spaces/newlines with single space, then trim.
        paragraphText = paragraphText
                .replace(/(\s*\n\s*)+/g, '\n') // Normalize line breaks
                .replace(/[ \t\r\f\v]+/g, ' ') // Replace other whitespace chars with single space
                .replace(/ \n/g, '\n') // Clean up space before newline
                .replace(/\n /g, '\n') // Clean up space after newline
                .trim();

        // Add paragraph only if it contains meaningful content
        if (paragraphText.length > 10) { // Stricter threshold to avoid tiny fragments
          paragraphs.push(paragraphText);
        }
      }
    });

    console.log(`[fetchTextFromUrl] Found ${paragraphs.length} potential paragraphs in main content for ${url}.`);

    // If paragraph extraction yielded little, try a simpler approach: text of main content, split by lines.
    if (paragraphs.length < 3) { // Adjust this threshold if needed
        console.warn(`[fetchTextFromUrl] Low paragraph count (${paragraphs.length}) for ${url}. Trying fallback text extraction.`);
        const fallbackText = mainContent.text();
        const fallbackParagraphs = fallbackText
            .split(/[\r\n]+/) // Split by any newline sequence
            .map(line => line.replace(/\s+/g, ' ').trim()) // Clean each line
            .filter(line => line.length > 10); // Filter short/empty lines

        if (fallbackParagraphs.length > paragraphs.length) {
             console.log(`[fetchTextFromUrl] Fallback extraction yielded ${fallbackParagraphs.length} paragraphs for ${url}. Using fallback.`);
             paragraphs.splice(0, paragraphs.length, ...fallbackParagraphs); // Replace original paragraphs
        } else {
             console.log(`[fetchTextFromUrl] Fallback extraction did not yield more paragraphs for ${url}. Keeping original ${paragraphs.length}.`);
        }
    }


    // Join paragraphs with double line breaks
    const extractedText = paragraphs.join('\n\n');
    console.log(`[fetchTextFromUrl] Final extracted text length for ${url}: ${extractedText.length}`);
    // console.log(`[fetchTextFromUrl] Extracted Text (first 500 chars) for ${url}:\n`, extractedText.substring(0, 500));


    if (!extractedText.trim()) {
      console.error(`[fetchTextFromUrl] Could not extract significant text content from the URL: ${url}`);
      return { error: 'Could not extract significant text content from the URL.' };
    }

    console.log(`[fetchTextFromUrl] Successfully fetched and parsed text from ${url}.`);
    return { text: extractedText };
  } catch (error: any) {
    console.error(`[fetchTextFromUrl] Error during fetch/parse for ${url}:`, error);
    let errorMessage = `An unexpected error occurred: ${error.message}`;
    if (error.name === 'AbortError') {
         errorMessage = 'Request timed out while fetching the URL (15 seconds).';
    } else if (error.code === 'ENOTFOUND' || error.message.includes('ECONNREFUSED')) {
         errorMessage = 'Could not resolve or connect to the URL. Check the address or network.';
    } else if (error.message.includes('certificate')) {
         errorMessage = 'Certificate error. The website might have security issues.';
    }
    // Add more specific error handling based on observed errors
    console.error(`[fetchTextFromUrl] Returning error for ${url}: ${errorMessage}`);
    return { error: errorMessage };
  }
}
