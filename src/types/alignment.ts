

// ManualAlignment is no longer used for the primary linking/confirmation mechanism
// export interface ManualAlignment {
//   englishIndex: number;
//   hebrewIndex: number;
// }

export interface SuggestedAlignment {
  englishParagraphIndex: number; // This refers to the ORIGINAL index
  hebrewParagraphIndex: number; // This refers to the ORIGINAL index
  confidence: number;
}
