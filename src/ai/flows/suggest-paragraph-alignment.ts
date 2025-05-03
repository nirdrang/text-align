'use server';

/**
 * @fileOverview An AI agent for suggesting paragraph alignments between English and Hebrew texts.
 *
 * - suggestParagraphAlignment - A function that suggests paragraph alignments.
 * - SuggestParagraphAlignmentInput - The input type for the suggestParagraphAlignment function.
 * - SuggestParagraphAlignmentOutput - The return type for the suggestParagraphAlignment function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SuggestParagraphAlignmentInputSchema = z.object({
  englishText: z.string().describe('The original English text.'),
  hebrewText: z.string().describe('The Hebrew translation.'),
});
export type SuggestParagraphAlignmentInput = z.infer<
  typeof SuggestParagraphAlignmentInputSchema
>;

const SuggestParagraphAlignmentOutputSchema = z.array(
  z.object({
    englishParagraphIndex: z
      .number()
      .describe('The 0-based index of the aligned English paragraph.'), // Clarified 0-based indexing
    hebrewParagraphIndex: z
      .number()
      .describe('The 0-based index of the aligned Hebrew paragraph.'), // Clarified 0-based indexing
    confidence: z.number().min(0).max(1).describe('The confidence level (0.0 to 1.0) of the alignment.'), // Added range
  })
);
export type SuggestParagraphAlignmentOutput = z.infer<
  typeof SuggestParagraphAlignmentOutputSchema
>;

export async function suggestParagraphAlignment(
  input: SuggestParagraphAlignmentInput
): Promise<SuggestParagraphAlignmentOutput> {
  console.log('[AI Flow] suggestParagraphAlignment called.');
  // Basic input validation (optional, Zod does this in the flow)
  if (!input.englishText?.trim() || !input.hebrewText?.trim()) {
      console.error('[AI Flow] Error: English or Hebrew text is empty.');
      throw new Error("English and Hebrew text must be provided.");
  }
  console.log(`[AI Flow] Input lengths: Eng=${input.englishText.length}, Heb=${input.hebrewText.length}`);
  const result = await suggestParagraphAlignmentFlow(input);
  console.log(`[AI Flow] suggestParagraphAlignmentFlow returned ${result.length} suggestions.`);
  return result;
}

const prompt = ai.definePrompt({
  name: 'suggestParagraphAlignmentPrompt',
  input: {
    schema: z.object({
      englishText: z.string().describe('The original English text.'),
      hebrewText: z.string().describe('The Hebrew translation.'),
    }),
  },
  output: {
    schema: z.array(
      z.object({
        englishParagraphIndex: z
          .number()
          .int() // Ensure integer index
          .nonnegative() // Ensure non-negative index
          .describe('The 0-based index of the aligned English paragraph.'),
        hebrewParagraphIndex: z
          .number()
          .int() // Ensure integer index
          .nonnegative() // Ensure non-negative index
          .describe('The 0-based index of the aligned Hebrew paragraph.'),
        confidence: z.number().min(0).max(1).describe('The confidence level (0.0 to 1.0) of the alignment.'),
      })
    ).describe("An array of suggested paragraph alignments. Each element links one English paragraph to one Hebrew paragraph."), // Describe the overall output array
  },
  prompt: `You are an AI expert in aligning corresponding paragraphs between two texts: an original English text and its Hebrew translation.

Your task is to:
1.  **Split** both the provided English text and the Hebrew text into paragraphs. Paragraphs are separated by **two or more newline characters** (e.g., "\\n\\n"). Ignore leading/trailing whitespace around paragraphs. Single newlines within a block of text do NOT indicate a paragraph break.
2.  **Identify** which English paragraph corresponds to which Hebrew paragraph based on semantic meaning and translation equivalence.
3.  **Output** an array of alignment objects. Each object must contain:
    *   \`englishParagraphIndex\`: The 0-based index of the English paragraph from the list you created in step 1.
    *   \`hebrewParagraphIndex\`: The 0-based index of the corresponding Hebrew paragraph from the list you created in step 1.
    *   \`confidence\`: A numerical confidence score between 0.0 and 1.0 (inclusive) indicating how certain you are about this specific alignment. 1.0 means high certainty, 0.0 means low certainty.

**Important Rules:**
*   A single English paragraph should ideally map to a single Hebrew paragraph, and vice-versa, but it's possible for a paragraph in one language not to have a direct match in the other (in which case, don't include it in the output). It's also possible, though less common, for one paragraph to map to multiple, or multiple to one, if the translation structure dictates it; only create such mappings if strongly justified by content.
*   Make sure the indices you return are valid 0-based indices corresponding *exactly* to the paragraphs you derived after splitting the input texts according to the double newline rule.
*   Return ONLY the JSON array of alignment objects as specified in the output schema. Do not include any explanatory text before or after the JSON.

**Input Texts:**

**English Text:**
\`\`\`
{{{englishText}}}
\`\`\`

**Hebrew Text:**
\`\`\`
{{{hebrewText}}}
\`\`\`

**Output Format (JSON Array):**
[
  { "englishParagraphIndex": 0, "hebrewParagraphIndex": 1, "confidence": 0.95 },
  { "englishParagraphIndex": 1, "hebrewParagraphIndex": 0, "confidence": 0.88 },
  // ... more alignment objects
]`,
});

const suggestParagraphAlignmentFlow = ai.defineFlow<
  typeof SuggestParagraphAlignmentInputSchema,
  typeof SuggestParagraphAlignmentOutputSchema
>({
  name: 'suggestParagraphAlignmentFlow',
  inputSchema: SuggestParagraphAlignmentInputSchema,
  outputSchema: SuggestParagraphAlignmentOutputSchema,
},
async input => {
   console.log('[AI Flow Step] Calling defined prompt...');
  const {output, finishReason, usage} = await prompt(input);
   console.log(`[AI Flow Step] Prompt finished. Reason: ${finishReason}. Usage:`, usage);

  if (!output) {
    console.error('[AI Flow Step] Prompt returned no output.');
    // Consider returning an empty array or throwing a more specific error
    throw new Error("AI failed to generate alignment suggestions.");
  }
  console.log(`[AI Flow Step] Prompt returned ${output.length} suggestions.`);
  // Optional: Add validation here if needed, although Zod handles schema validation
  // For example, check for duplicate index mappings if that's disallowed.
  return output;
});
