// src/lib/sentence_utils.ts

// BLEU-1 implementation
export function bleu1(ref: string, hyp: string): number {
  const refTokens = new Set(ref.split(/\s+/));
  const hypTokens = hyp.split(/\s+/);
  if (hypTokens.length === 0) return 0;
  const overlap = hypTokens.filter(t => refTokens.has(t)).length;
  return overlap / hypTokens.length;
}

// Sentence splitter
export function splitSentences(text: string, language: 'english' | 'hebrew'): string[] {
  if (!text) return [];
  if (language === 'hebrew') {
    const quoteChars = ['"', '“', '״', '׳', '‘', '‹', '«', '”', '’', '›', '»'];
    let sentences: string[] = [];
    let current = '';
    let quoteStack: string[] = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoteChars.includes(char)) {
        // Push or pop from stack
        if (quoteStack.length && quoteStack[quoteStack.length - 1] === char) {
          quoteStack.pop();
        } else {
          quoteStack.push(char);
        }
        current += char;
        continue;
      }
      // Only split if not inside any quote
      if ((char === '.' || char === '!' || char === '?') && quoteStack.length === 0) {
        current += char;
        // Look ahead for closing quote(s)
        let j = i + 1;
        while (j < text.length && quoteChars.includes(text[j])) {
          current += text[j];
          i = j;
          j++;
        }
        sentences.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) sentences.push(current.trim());
    // Attach trailing quote-only sentence to previous sentence
    if (sentences.length > 1 && sentences[sentences.length - 1].match(/^['"״׳’”›»]+$/)) {
      sentences[sentences.length - 2] += sentences[sentences.length - 1];
      sentences.pop();
    }
    return sentences.filter(Boolean);
  } else {
    // English: keep the old logic
    return text
      .replace(/([.?!])(?=\s|$)/g, '$1|')
      .split('|')
      .map(s => s.trim())
      .filter(Boolean);
  }
} 