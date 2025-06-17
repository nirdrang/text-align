'use server';

import * as cheerio from 'cheerio';

interface FetchResult {
  text?: string;
  error?: string;
}

/**
 * Fetches HTML from a URL and extracts text content, attempting to preserve
 * paragraph structure including internal line breaks (e.g., from <br> tags).
 * Paragraphs in the output text are separated by double newlines (\n\n).
 * @param url The URL to fetch text from.
 * @returns An object containing the extracted text or an error message.
 */
export async function fetchTextFromUrl(url: string): Promise<FetchResult> {
  const urlObj = new URL(url); // Create URL object once
  const logPrefix = `[fetchTextFromUrl(${urlObj.hostname})]`; // Use hostname for easier debugging
  console.log(`${logPrefix} Starting fetch for URL: ${url}`);
  try {
    // Validate URL format (basic check - already done by new URL())
    // try { new URL(url); } catch (_) { ... } // Redundant

    const response = await fetch(url, {
        headers: {
            // Set a common User-Agent to mimic a browser request
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            // Request common content types
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,he;q=0.8', // Added Hebrew
            'Accept-Charset': 'utf-8, iso-8859-1;q=0.5', // Ensure UTF-8 is preferred
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

    // Determine character encoding - prioritize BOM/meta tag, then header, fallback to UTF-8
    let encoding = 'utf-8'; // Default
    const contentTypeLower = contentType?.toLowerCase() ?? '';
    const charsetMatch = contentTypeLower.match(/charset=([^;]+)/);
    if (charsetMatch?.[1]) {
        encoding = charsetMatch[1].trim();
        console.log(`${logPrefix} Detected encoding from header: ${encoding}`);
    }

    // Read buffer first to detect BOM or meta tags if header is unreliable
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder(encoding, { fatal: false }); // Use detected/default encoding, don't throw on errors initially
    let html = decoder.decode(buffer);

    // Attempt to detect encoding from <meta> tag if header was missing or ambiguous
    const metaCharsetMatch = html.match(/<meta.*?charset=["']?([^"'>\s]+)/i);
    if (metaCharsetMatch?.[1] && metaCharsetMatch[1].toLowerCase() !== encoding) {
        const metaEncoding = metaCharsetMatch[1].trim().toLowerCase();
         console.log(`${logPrefix} Detected different encoding from meta tag: ${metaEncoding}. Re-decoding.`);
         try {
            html = new TextDecoder(metaEncoding).decode(buffer);
            encoding = metaEncoding; // Update the encoding used
         } catch (decodeError) {
             console.warn(`${logPrefix} Failed to re-decode with meta tag encoding ${metaEncoding}. Sticking with ${encoding}.`, decodeError);
         }
    }


    if (!contentTypeLower || (!contentTypeLower.includes('text/html') && !contentTypeLower.includes('text/plain'))) {
        console.warn(`${logPrefix} URL did not return HTML or plain text content. Content-Type: ${contentType}`);
         if (!contentTypeLower?.startsWith('text/')) {
            return { error: 'URL did not return text-based content (HTML or plain text).' };
         }
    }

     // Handle plain text directly
     if (contentTypeLower?.includes('text/plain')) {
          console.log(`${logPrefix} Extracted plain text. Length: ${html.length}`);
          if (!html.trim()) {
            console.warn(`${logPrefix} Plain text content is empty.`);
            return { error: 'Could not extract significant text content (plain text was empty).' };
          }
          // Split plain text by double newlines to simulate paragraphs
          const plainParagraphs = html.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
          return { text: plainParagraphs.join('\n\n') };
     }


    // Process HTML
    const $ = cheerio.load(html);
    console.log(`${logPrefix} Loaded HTML. Length: ${html.length}. Encoding used: ${encoding}`);

    // Attempt to find the main content area (common selectors)
    let mainContent = $('main, article, .main-content, #main, #content, [role="main"]').first();
    if (mainContent.length === 0) {
      console.log(`${logPrefix} No main content selector found. Falling back to body.`);
      mainContent = $('body');
    } else {
       console.log(`${logPrefix} Found main content area using selectors.`);
    }

    // Remove elements that often contain noise
    mainContent.find('script, style, nav, footer, header, aside, form, noscript, [aria-hidden="true"], .advertisement, .ad, .sidebar, iframe, figure:not(:has(figcaption)), button, input, select, textarea, label, .menu, .footer, .header, #nav, #footer, #header, link[rel="stylesheet"]').remove();
    console.log(`${logPrefix} Removed script, style, nav, etc. elements.`);

    // --- Enhanced Paragraph Extraction ---
    const paragraphs: string[] = [];
    const blockLevelTags = 'p, div, blockquote, li, h1, h2, h3, h4, h5, h6, article, section, td, pre, center'; // Common block-level tags

    // Iterate through potential block-level elements within the main content
    mainContent.find(blockLevelTags).each((i, el) => {
        const $el = $(el);
        const elementType = el.tagName?.toLowerCase();

        // Basic check: Skip if the element itself is hidden via CSS (approximated)
        if ($el.css('display') === 'none' || $el.css('visibility') === 'hidden') {
             console.log(`${logPrefix} Skipping hidden element ${i} (${elementType})`);
             return;
        }

        // Heuristic: Skip elements that mainly contain other block elements (unless it's article/section)
        // This helps avoid grabbing wrapper divs that don't have direct text content.
        if (!['article', 'section'].includes(elementType ?? '') && $el.children(blockLevelTags).length > 0 && $el.contents().filter((_, node) => node.type === 'text' && $(node).text().trim().length > 0).length === 0) {
            // console.log(`${logPrefix} Skipping element ${i} (${elementType}) as it primarily contains other blocks.`);
            return;
        }

        // Extract text content, trying to preserve line breaks from <br> tags
        let blockText = '';
        $el.contents().each((_, node) => {
            if (node.type === 'text') {
                // Normalize whitespace within text nodes
                blockText += $(node).text().replace(/\s+/g, ' ').trim() + ' ';
            } else if (node.type === 'tag' && node.name.toLowerCase() === 'br') {
                // Preserve <br> as a newline, but only if not already preceded/followed by significant space/newline
                 if (!blockText.match(/(\s*\n\s*|\s{2,})$/)) { // Avoid double newlines or excess space around <br>
                    blockText += '\n';
                 }
            } else if (node.type === 'tag') {
                // Recursively get text from known inline elements, add space around them
                 const inlineTag = node.name.toLowerCase();
                 if (['a', 'span', 'strong', 'em', 'b', 'i', 'u', 'code', 'mark'].includes(inlineTag)) {
                    const innerText = $(node).text().replace(/\s+/g, ' ').trim();
                     if (innerText) {
                        blockText += innerText + ' ';
                     }
                 }
                // We generally ignore unknown/block tags here as we process them individually in the outer loop
            }
        });

        // Clean up the extracted text for the block
        blockText = blockText
            .replace(/ +\n/g, '\n') // Space before newline
            .replace(/\n +/g, '\n') // Space after newline
            .replace(/ {2,}/g, ' ') // Multiple spaces to one
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines (from BRs)
            .trim(); // Trim leading/trailing whitespace

        // Add to paragraphs list: include ALL paragraphs, regardless of length or tag
        if (blockText.length > 0) {
            // Avoid adding exact duplicates
            if (!paragraphs.includes(blockText)) {
                paragraphs.push(blockText);
            } else {
                console.log(`${logPrefix} Skipping duplicate paragraph from block ${i} (${elementType}).`);
            }
        }
    });


    console.log(`${logPrefix} Found ${paragraphs.length} distinct paragraph blocks after processing.`);

    // Fallback: If very few blocks were found, try a simpler text extraction from mainContent
    if (paragraphs.length <= 1 && mainContent.text().trim().length > 50) {
        console.warn(`${logPrefix} Low paragraph count (${paragraphs.length}). Trying simple text extraction with newline splitting as fallback.`);
        // Get text, replace <br> with newline, then split by multiple newlines
         mainContent.find('br').replaceWith('\n');
         const fallbackText = mainContent.text();
         const fallbackParagraphs = fallbackText
             .split(/\n{2,}/) // Split by double (or more) newlines
             .map(line => line.replace(/\s+/g, ' ').trim()) // Clean each line
             .filter(line => line.length > 10); // Filter short/empty lines

        if (fallbackParagraphs.length > paragraphs.length) {
             console.log(`${logPrefix} Fallback extraction yielded ${fallbackParagraphs.length} lines. Using fallback.`);
             paragraphs.splice(0, paragraphs.length, ...fallbackParagraphs); // Replace original paragraphs
        } else {
             console.log(`${logPrefix} Fallback extraction did not yield more paragraphs.`);
        }
    }


    // Join the extracted blocks with double line breaks to signify paragraph separation for the AI
    const extractedText = paragraphs.join('\n\n');
    console.log(`${logPrefix} Final joined text length: ${extractedText.length}`);
    // console.log(`${logPrefix} Final Text (first 500 chars):\n`, extractedText.substring(0, 500)); // Keep commented out unless debugging specific output


    if (!extractedText.trim()) {
      console.error(`${logPrefix} Could not extract significant text content from the URL.`);
      // Check if the body *did* have text, which implies parsing failed badly
      if ($('body').text().trim().length > 0) {
           console.error(`${logPrefix} Body contained text, but extraction logic failed.`);
           return { error: 'Extraction logic failed to find text content, though the page was not empty.' };
      }
      return { error: 'Could not extract significant text content (source might be empty or heavily script-based).' };
    }

    console.log(`${logPrefix} Successfully fetched and parsed text.`);
    return { text: extractedText };
  } catch (error: any) {
    // Use existing urlObj if available, otherwise skip hostname
    const logPrefixError = urlObj ? `[fetchTextFromUrl(${urlObj.hostname})]` : '[fetchTextFromUrl]';
    console.error(`${logPrefixError} Error during fetch/parse for ${url}:`, error);
    let errorMessage = `An unexpected error occurred: ${error.message || 'Unknown error'}`;
    if (error.name === 'AbortError') {
         errorMessage = 'Request timed out while fetching the URL (15 seconds).';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') { // Added ECONNREFUSED
         errorMessage = 'Could not resolve or connect to the URL. Check the address or network.';
    } else if (error.message?.includes('certificate')) {
         errorMessage = 'Certificate error. The website might have security issues (HTTPS).';
    } else if (error instanceof TypeError && error.message.includes('Invalid URL')) {
        // This case should be less likely now with `new URL` at the start
        errorMessage = 'Invalid URL format provided.';
    }
    // Add more specific error handling based on observed errors
    console.error(`${logPrefixError} Returning error: ${errorMessage}`);
    return { error: errorMessage };
  }
}
