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
  const logPrefix = `[fetchTextFromUrl(${new URL(url).hostname})]`; // Add hostname for easier debugging
  console.log(`${logPrefix} Starting fetch for URL: ${url}`);
  try {
    // Validate URL format (basic check)
    try {
      new URL(url);
    } catch (_) {
      console.error(`${logPrefix} Invalid URL format: ${url}`);
      return { error: 'Invalid URL format.' };
    }

    const response = await fetch(url, {
        headers: {
            // Set a common User-Agent to mimic a browser request
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            // Request common content types
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,he;q=0.8', // Added Hebrew to accept language
        },
        // Add a timeout to prevent hanging requests (e.g., 15 seconds)
         signal: AbortSignal.timeout(15000) // 15 seconds timeout
    });

    console.log(`${logPrefix} Response status: ${response.status}`);

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
        console.error(`${logPrefix} Fetch failed: ${errorMessage}`);
        return { error: errorMessage };
    }

    const contentType = response.headers.get('content-type');
    console.log(`${logPrefix} Content-Type: ${contentType}`);

    if (!contentType || (!contentType.includes('text/html') && !contentType.includes('text/plain'))) {
        console.warn(`${logPrefix} URL did not return HTML or plain text content. Content-Type: ${contentType}`);
         // Allow processing if it's potentially text-like, otherwise error
         if (!contentType?.startsWith('text/')) {
            return { error: 'URL did not return text-based content (HTML or plain text).' };
         }
    }

     // Handle plain text directly
     if (contentType?.includes('text/plain')) {
          const text = await response.text();
          console.log(`${logPrefix} Extracted plain text. Length: ${text.length}`);
          if (!text.trim()) {
            console.warn(`${logPrefix} Plain text content is empty.`);
            return { error: 'Could not extract significant text content (plain text was empty).' };
          }
          // Preserve line breaks in plain text
          return { text: text.replace(/\r\n/g, '\n') };
     }


    // Process HTML
    const html = await response.text();
    const $ = cheerio.load(html);
    console.log(`${logPrefix} Loaded HTML. Length: ${html.length}`);

    // Attempt to find the main content area (common selectors)
    let mainContent = $('main, article, .main-content, #main, #content').first();
    if (mainContent.length === 0) {
      console.log(`${logPrefix} No main content selector found. Falling back to body.`);
      mainContent = $('body');
    } else {
       console.log(`${logPrefix} Found main content area using selectors.`);
    }

    // Remove elements that often contain noise (scripts, styles, nav, footers, ads)
    mainContent.find('script, style, nav, footer, header, aside, form, noscript, [aria-hidden="true"], .advertisement, .ad, .sidebar, iframe, figure, figcaption, button, input, select, textarea').remove();
    console.log(`${logPrefix} Removed script, style, nav, etc. elements.`);

    // Extract text from paragraph (<p>) tags and relevant <div>s within the main content, preserving <br>
    const paragraphs: string[] = [];
    const processedElements = new Set<cheerio.Element>(); // Keep track of processed elements to avoid duplicates

    // Select common block-level text containers. Added more specific selectors if needed.
    // Order matters: process larger containers first if nesting is complex.
    mainContent.find('article, section, p, div:not(:has(p, div, blockquote, li)) , blockquote, li, h1, h2, h3, h4, h5, h6').each((i, el) => {
        // Check if element or its relevant parent has already been processed
        let currentEl: cheerio.Element | null = el;
        while (currentEl) {
            if (processedElements.has(currentEl)) {
                 // console.log(`${logPrefix} Skipping element ${i} as it or parent already processed.`);
                 return; // Skip this element
            }
            // Stop checking if we hit the mainContent boundary or body directly
            if (currentEl === mainContent.get(0) || currentEl.tagName?.toLowerCase() === 'body') {
                break;
            }
            currentEl = $(currentEl).parent().get(0);
        }

        const element = $(el);
        const elementType = el.tagName?.toLowerCase();

        // Basic heuristic for meaningful blocks: contains significant text, not just whitespace or single short words
        // Consider adjusting minimum length if needed, especially for titles (h tags)
        const blockTextTrimmed = element.text().trim();
         const minLength = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(elementType || '') ? 5 : 10; // Allow shorter headings
        if (blockTextTrimmed.length < minLength && element.find('br').length === 0) {
            // console.log(`${logPrefix} Skipping element ${i} (${elementType}) due to short content: "${blockTextTrimmed}"`);
            return; // Continue to next element
        }

        let paragraphText = '';
        element.contents().each((_, node) => {
            if (node.type === 'text') {
                 paragraphText += $(node).text().replace(/[ \t\r\f\v]+/g, ' ');
            } else if (node.type === 'tag') {
                const tagName = node.name.toLowerCase();
                if (tagName === 'br') {
                    paragraphText += '\n'; // Preserve line break
                } else if (['p', 'div', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article'].includes(tagName)) {
                    // If we encounter a nested block *within* our current block, and haven't processed it,
                    // add its text and mark it as processed. Add separation.
                    if (!processedElements.has(node)) {
                         const nestedText = $(node).text().trim();
                         if (nestedText.length > 0) {
                             if (paragraphText.length > 0 && !paragraphText.endsWith('\n\n')) {
                                 paragraphText += '\n\n'; // Separate nested blocks
                             }
                             paragraphText += nestedText.replace(/[ \t\r\f\v]+/g, ' ');
                             processedElements.add(node); // Mark nested element as processed
                              // console.log(`${logPrefix} Processed nested block ${tagName}: "${nestedText.substring(0,50)}..."`);
                         }
                    }
                } else {
                   // For other inline elements, add their text with surrounding spaces (if needed) to prevent words sticking together.
                   const innerText = $(node).text().trim();
                   if (innerText.length > 0) {
                       if (!/\s$/.test(paragraphText)) {
                           paragraphText += ' ';
                       }
                       paragraphText += innerText;
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

        // Log the raw text extracted for this block *before* adding to array
        console.log(`${logPrefix} Raw Extracted Block ${i} (${elementType}, length ${paragraphText.length}): "${paragraphText.substring(0, 100)}${paragraphText.length > 100 ? '...' : ''}"`);

        // Add paragraph only if it contains meaningful content after cleaning
        if (paragraphText.length > 0) {
             // Avoid adding duplicates if the exact same text block was already added
             if (!paragraphs.includes(paragraphText)) {
                 console.log(`${logPrefix} Adding paragraph ${paragraphs.length} (from block ${i}, ${elementType}). Length: ${paragraphText.length}`);
                 paragraphs.push(paragraphText);
                 processedElements.add(el); // Mark this element as processed
             } else {
                 console.log(`${logPrefix} Skipping duplicate paragraph from block ${i} (${elementType}).`);
             }
        } else {
             console.log(`${logPrefix} Skipping empty paragraph from block ${i} (${elementType}).`);
        }
    });

    console.log(`${logPrefix} Found ${paragraphs.length} distinct paragraphs/blocks after processing.`);

    // Fallback (less likely needed with the broader selector and duplicate check)
    if (paragraphs.length < 1 && mainContent.text().trim().length > 0) {
        console.warn(`${logPrefix} Low paragraph count (${paragraphs.length}). Trying simple text extraction as fallback.`);
        const fallbackText = mainContent.text();
        const fallbackParagraphs = fallbackText
            .split(/[\r\n]{2,}/) // Split by double (or more) newlines for basic paragraph separation
            .map(line => line.replace(/\s+/g, ' ').trim()) // Clean each line
            .filter(line => line.length > 10); // Filter short/empty lines

        if (fallbackParagraphs.length > 0) {
             console.log(`${logPrefix} Fallback extraction yielded ${fallbackParagraphs.length} lines. Using fallback.`);
             paragraphs.splice(0, paragraphs.length, ...fallbackParagraphs); // Replace original paragraphs
        } else {
             console.log(`${logPrefix} Fallback extraction did not yield significant content.`);
        }
    }


    // Join the extracted blocks with double line breaks to signify paragraph separation
    const extractedText = paragraphs.join('\n\n');
    console.log(`${logPrefix} Final joined text length: ${extractedText.length}`);
    // console.log(`${logPrefix} Final Text (first 500 chars):\n`, extractedText.substring(0, 500));


    if (!extractedText.trim()) {
      console.error(`${logPrefix} Could not extract significant text content from the URL.`);
      return { error: 'Could not extract significant text content from the URL.' };
    }

    console.log(`${logPrefix} Successfully fetched and parsed text.`);
    return { text: extractedText };
  } catch (error: any) {
    const logPrefix = url ? `[fetchTextFromUrl(${new URL(url).hostname})]` : '[fetchTextFromUrl]';
    console.error(`${logPrefix} Error during fetch/parse for ${url}:`, error);
    let errorMessage = `An unexpected error occurred: ${error.message}`;
    if (error.name === 'AbortError') {
         errorMessage = 'Request timed out while fetching the URL (15 seconds).';
    } else if (error.code === 'ENOTFOUND' || error.message.includes('ECONNREFUSED')) {
         errorMessage = 'Could not resolve or connect to the URL. Check the address or network.';
    } else if (error.message.includes('certificate')) {
         errorMessage = 'Certificate error. The website might have security issues.';
    }
    // Add more specific error handling based on observed errors
    console.error(`${logPrefix} Returning error: ${errorMessage}`);
    return { error: errorMessage };
  }
}
