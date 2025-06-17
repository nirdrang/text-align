// Shared paragraph splitting and normalization logic

/**
 * Normalizes Hebrew punctuation and whitespace for paragraph processing.
 * @param text The input text
 * @param isHebrew Whether the text is Hebrew (true) or not
 */
export function normalizeHebrewPunctuation(text: string, isHebrew: boolean = true): string {
    // Replace various dash types with a standard hyphen-minus
    let normalized = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-');
    // Replace various quote types with standard single and double quotes
    normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'");
    normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
    // Replace ellipsis variants with standard three dots
    normalized = normalized.replace(/\u2026/g, '...');
    // Remove extra whitespace around punctuation
    normalized = normalized.replace(/\s+([.,;!?:%])/g, '$1');
    normalized = normalized.replace(/([.,;!?:%])(?=[^\s.,;!?:%])/g, '$1 ');
    // Normalize whitespace (multiple spaces/newlines to single space)
    normalized = normalized.replace(/([^\n])\n([^\n])/g, '$1 $2');
    normalized = normalized.replace(/ +/g, ' ');
    return normalized.trim();
}

/**
 * Splits text into paragraphs and normalizes them, matching the UI logic.
 * @param text The input text
 * @param language 'english' | 'hebrew'
 */
export function parseParagraphs(text: string | null, language: 'english' | 'hebrew'): string[] {
    if (!text) return [];
    let paragraphs = text.split(/(?:\s*\n\s*){2,}/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph !== '');
    if (language === 'english') {
        // Remove paragraphs that are entirely in German (simple heuristic)
        // This checks for the presence of German-specific characters and lack of common English words.
        const germanRegex = /[äöüßÄÖÜ]/;
        const englishWordRegex = /\b(the|and|is|are|to|of|in|that|it|for|on|with|as|was|at|by|an|be|this|have|from|or|one|had|not|but|all|were|they|you|her|his|can|my|their|so|me|if|we|do|no|will|just|has|him|out|up|about|who|get|which|go|when|make|like|time|could|into|then|than|now|only|its|over|also|back|after|use|two|how|our|work|first|well|way|even|new|want|because|any|these|give|day|most|us)\b/i;
        paragraphs = paragraphs.filter(paragraph => {
            // If it contains German chars and does NOT contain any common English word, remove it
            if (germanRegex.test(paragraph) && !englishWordRegex.test(paragraph)) {
                return false;
            }
            return true;
        });
    }
    return paragraphs
        .map((paragraph) => {
            if (language === 'hebrew') {
                return normalizeHebrewPunctuation(paragraph, true);
            } else {
                return paragraph;
            }
        });
} 