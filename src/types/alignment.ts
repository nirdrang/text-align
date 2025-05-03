export interface ManualAlignment {
  englishIndex: number;
  hebrewIndex: number;
}

export interface SuggestedAlignment {
  englishParagraphIndex: number;
  hebrewParagraphIndex: number;
  confidence: number;
}
