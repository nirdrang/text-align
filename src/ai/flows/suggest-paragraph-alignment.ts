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
      .describe('The index of the English paragraph.'),
    hebrewParagraphIndex: z
      .number()
      .describe('The index of the Hebrew paragraph.'),
    confidence: z.number().describe('The confidence level of the alignment.'),
  })
);
export type SuggestParagraphAlignmentOutput = z.infer<
  typeof SuggestParagraphAlignmentOutputSchema
>;

export async function suggestParagraphAlignment(
  input: SuggestParagraphAlignmentInput
): Promise<SuggestParagraphAlignmentOutput> {
  return suggestParagraphAlignmentFlow(input);
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
          .describe('The index of the English paragraph.'),
        hebrewParagraphIndex: z
          .number()
          .describe('The index of the Hebrew paragraph.'),
        confidence: z.number().describe('The confidence level of the alignment.'),
      })
    ),
  },
  prompt: `You are an AI expert in aligning paragraphs between two texts, an original English text, and its Hebrew translation.\n\nGiven the following English text and its Hebrew translation, suggest the best paragraph alignments between the two.\nReturn an array of objects, where each object contains the englishParagraphIndex, hebrewParagraphIndex and a confidence level between 0 and 1 of the alignment.\n\nEnglish Text: {{{englishText}}}\nHebrew Text: {{{hebrewText}}}`,
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
  const {output} = await prompt(input);
  return output!;
});
