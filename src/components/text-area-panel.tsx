"use client";

import type React from 'react';
import { type ChangeEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Loader2 } from 'lucide-react'; // Import Loader
import { cn } from '@/lib/utils';
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';

interface TextAreaPanelProps {
  title: string;
  text: string;
  paragraphs: string[];
  onTextChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  readOnly?: boolean; // Added prop
  showTextarea?: boolean; // Added prop
  isLoading?: boolean; // Added prop
  selectedIndex: number | null;
  onParagraphSelect: (index: number) => void;
  manualAlignments: ManualAlignment[];
  alignmentKey: 'englishIndex' | 'hebrewIndex';
  suggestedAlignments: SuggestedAlignment[] | null;
  suggestionKey: 'englishParagraphIndex' | 'hebrewParagraphIndex';
  highlightedSuggestionIndex: number | null;
  linkedHighlightIndex: number | null;
}

const TextAreaPanel: React.FC<TextAreaPanelProps> = ({
  title,
  text,
  paragraphs,
  onTextChange,
  readOnly = false,
  showTextarea = true,
  isLoading = false,
  selectedIndex,
  onParagraphSelect,
  manualAlignments,
  alignmentKey,
  suggestedAlignments,
  suggestionKey,
  highlightedSuggestionIndex,
  linkedHighlightIndex,
}) => {
  const isManuallyAligned = (index: number): boolean => {
    return manualAlignments.some((link) => link[alignmentKey] === index);
  };

  const getLinkedPartnerIndex = (index: number): number | null => {
    const partnerKey = alignmentKey === 'englishIndex' ? 'hebrewIndex' : 'englishIndex';
    const alignment = manualAlignments.find(link => link[alignmentKey] === index);
    return alignment ? alignment[partnerKey] : null;
  };

   const getSuggestionConfidence = (index: number): number | null => {
    const suggestion = suggestedAlignments?.find(s => s[suggestionKey] === index);
    return suggestion ? suggestion.confidence : null;
  };

  const getSuggestionPartnerIndex = (index: number): number | null => {
    if (!suggestedAlignments) return null;
    const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
    const suggestion = suggestedAlignments.find(s => s[suggestionKey] === index);
    return suggestion ? suggestion[partnerKey] : null;
  }

  const getHighlightColor = (confidence: number): string => {
    const greenIntensity = Math.floor(200 * confidence);
    const redIntensity = Math.floor(150 * (1 - confidence));
    return `rgba(${redIntensity}, ${greenIntensity}, 0, 0.2)`;
  };

  return (
    <Card className="flex flex-col h-full shadow-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow p-0">
        {showTextarea && (
          <div className="p-4 pb-0">
            {/* Textarea is hidden and shown based on prop, kept for potential future use */}
             <Textarea
               value={text}
               onChange={onTextChange}
               placeholder={isLoading ? `Loading ${title} text...` : `Paste ${title} text here...`}
               className="h-32 mb-4 resize-none bg-card text-card-foreground"
               readOnly={readOnly || isLoading} // Make read-only if fetching or explicitly set
               disabled={isLoading} // Disable while loading
             />
          </div>
        )}
        <ScrollArea className="flex-grow px-4 pb-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 <p className="text-muted-foreground">Loading {title} paragraphs...</p>
                {/* Optional: Show skeletons while loading */}
                {/* <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" /> */}
              </div>
            ) : !showTextarea ? (
               <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                 <p className="text-muted-foreground">
                    {`Enter URLs above and click 'Fetch Texts' to load the ${title} content.`}
                </p>
               </div>
            ) : paragraphs.length > 0 ? (
              paragraphs.map((paragraph, index) => {
                const isSelected = selectedIndex === index;
                const manuallyAligned = isManuallyAligned(index);
                const linkedPartnerIndex = getLinkedPartnerIndex(index);
                const suggestionConfidence = getSuggestionConfidence(index);
                const isSuggested = suggestionConfidence !== null;
                const suggestionPartnerIndex = getSuggestionPartnerIndex(index);
                const isHighlightedSuggestion = highlightedSuggestionIndex === index;
                const isLinkedHighlight = linkedHighlightIndex === index;

                const highlightStyle: React.CSSProperties = {};
                 if (isHighlightedSuggestion && suggestionConfidence !== null) {
                  highlightStyle.backgroundColor = getHighlightColor(suggestionConfidence);
                  highlightStyle.boxShadow = '0 0 0 2px hsl(var(--primary))';
                } else if (isLinkedHighlight) {
                  const linkingSuggestion = suggestedAlignments?.find(s => {
                      const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
                      return s[partnerKey] === index && s[suggestionKey] === highlightedSuggestionIndex;
                  });
                  if(linkingSuggestion){
                     highlightStyle.backgroundColor = getHighlightColor(linkingSuggestion.confidence);
                     highlightStyle.boxShadow = '0 0 0 1px hsl(var(--primary) / 0.5)';
                  }
                }

                return (
                  <div
                    key={index}
                    onClick={() => onParagraphSelect(index)}
                    className={cn(
                      'p-3 rounded-md cursor-pointer transition-all duration-200 ease-in-out border',
                      'text-sm leading-relaxed',
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                        : 'bg-card hover:bg-secondary/80',
                      manuallyAligned
                        ? 'border-accent border-dashed'
                        : 'border-border',
                      isSuggested && !manuallyAligned && 'border-primary/30 border-dotted',
                      { 'animate-pulse-border': isHighlightedSuggestion || isLinkedHighlight}
                    )}
                     style={highlightStyle}
                    data-paragraph-index={index}
                    {...(manuallyAligned && { 'data-linked-to': linkedPartnerIndex })}
                    {...(isSuggested && {'data-suggested-link': suggestionPartnerIndex, 'data-confidence': suggestionConfidence })}
                  >
                    <p className={title === 'Hebrew' ? 'rtl text-right' : 'ltr text-left'}>
                      {paragraph || <span className="text-muted-foreground italic">Empty paragraph</span>}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground p-3 text-center italic">
                No paragraphs detected in the fetched text. Ensure the source content has paragraphs separated by double line breaks.
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <style jsx>{`
          @keyframes pulse-border {
            0%, 100% { box-shadow: 0 0 0 1px hsl(var(--primary) / 0.5); }
            50% { box-shadow: 0 0 0 3px hsl(var(--primary) / 0.8); }
          }
          .animate-pulse-border {
            animation: pulse-border 1.5s infinite ease-in-out;
          }
        `}</style>
    </Card>
  );
};

export default TextAreaPanel;
