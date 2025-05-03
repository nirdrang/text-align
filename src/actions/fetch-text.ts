'use server';

import * as cheerio from 'cheerio';

interface FetchResult {
  text?: string;
  error?: string;
}

/**
 * Fetches HTML from a URL and extracts text content, attempting to preserve
 * paragraph structure including internal line breaks (e.g., from <br> tags).
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
          // Preserve line breaks in plain text
          return { text: text.replace(/\r\n/g, '\n') };
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

    // Extract text from paragraph (<p>) tags and relevant <div>s within the main content, preserving <br>
    const paragraphs: string[] = [];
    // Select common block-level text containers
    mainContent.find('p, div, blockquote, li, h1, h2, h3, h4, h5, h6').each((i, el) => {
        const element = $(el);

        // Basic heuristic for meaningful blocks: contains significant text, not just whitespace
        const blockText = element.text().trim();
        if (blockText.length < 10 && element.find('br').length === 0) { // Ignore very short blocks unless they contain line breaks
            return; // Continue to next element
        }

        // Check if this element is nested inside another element already processed as a paragraph.
        // This helps avoid adding both a parent div and its child p tags separately.
        let alreadyProcessed = false;
        element.parents().each((_, parentEl) => {
            if ($(parentEl).data('processed-paragraph')) {
                alreadyProcessed = true;
                return false; // Break the .each loop
            }
        });
        if (alreadyProcessed) {
            return; // Skip this element as its content is part of a processed parent
        }
        element.data('processed-paragraph', true); // Mark this element as processed


        let paragraphText = '';
        element.contents().each((_, node) => {
            if (node.type === 'text') {
                // Append text content, replacing multiple whitespace chars with a single space, but keeping \n if any exist implicitly
                 paragraphText += $(node).text().replace(/[ \t\r\f\v]+/g, ' ');
            } else if (node.type === 'tag') {
                const tagName = node.name.toLowerCase();
                if (tagName === 'br') {
                    paragraphText += '\n'; // Preserve line break
                } else if ($(node).is('p, div, blockquote, li, h1, h2, h3, h4, h5, h6')) {
                    // For nested block elements, recursively get text and add double newline (unless it's the first node)
                    if (paragraphText.length > 0 && !paragraphText.endsWith('\n\n')) {
                       paragraphText += '\n\n';
                    }
                    // We avoid double-counting by marking elements, so we just get the text here.
                    paragraphText += $(node).text().replace(/[ \t\r\f\v]+/g, ' ');

                } else {
                   // For inline elements, add their text with surrounding spaces (if needed) to prevent words sticking together.
                   const innerText = $(node).text().trim();
                   if (innerText.length > 0) {
                       // Add space only if the paragraph text doesn't already end with whitespace or newline
                       if (!/\s$/.test(paragraphText)) {
                           paragraphText += ' ';
                       }
                       paragraphText += innerText;
                       // Add space only if the inner text doesn't end with whitespace
                        if (!/\s$/.test(innerText)) {
                           paragraphText += ' ';
                        }
                   }
                }
            }
        });

        // Final cleanup for the block: trim leading/trailing whitespace and normalize multiple newlines/spaces
        paragraphText = paragraphText
            .replace(/ +\n/g, '\n') // Remove space before newline
            .replace(/\n +/g, '\n') // Remove space after newline
            .replace(/\n{3,}/g, '\n\n') // Collapse 3+ newlines to 2 (paragraph break)
            .replace(/ {2,}/g, ' ') // Collapse multiple spaces to one
            .trim();


        // Add paragraph only if it contains meaningful content after cleaning
        if (paragraphText.length > 0) {
             // Avoid adding duplicates if the exact same text block was already added
             if (!paragraphs.includes(paragraphText)) {
                paragraphs.push(paragraphText);
             }
        }
    });

    console.log(`[fetchTextFromUrl] Found ${paragraphs.length} potential paragraphs/blocks for ${url}.`);

    // Fallback (less likely needed with the broader selector)
    if (paragraphs.length < 1) {
        console.warn(`[fetchTextFromUrl] Low block count (${paragraphs.length}) for ${url}. Trying simple text extraction.`);
        const fallbackText = mainContent.text();
        const fallbackParagraphs = fallbackText
            .split(/[\r\n]+/) // Split by any newline sequence
            .map(line => line.replace(/\s+/g, ' ').trim()) // Clean each line
            .filter(line => line.length > 10); // Filter short/empty lines

        if (fallbackParagraphs.length > paragraphs.length) {
             console.log(`[fetchTextFromUrl] Fallback extraction yielded ${fallbackParagraphs.length} lines for ${url}. Using fallback.`);
             paragraphs.splice(0, paragraphs.length, ...fallbackParagraphs); // Replace original paragraphs
        } else {
             console.log(`[fetchTextFromUrl] Fallback extraction did not yield more content for ${url}. Keeping original ${paragraphs.length}.`);
        }
    }


    // Join the extracted blocks with double line breaks to signify paragraph separation
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
