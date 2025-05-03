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
import InlineAlignmentControls from './inline-alignment-controls'; // Import the new controls

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
  // Optional props for controls (passed to Hebrew panel)
  showControls?: boolean;
  onLink?: () => void;
  onUnlink?: () => void;
  onSuggest?: () => void;
  canLink?: boolean;
  canUnlink?: boolean;
  isSuggesting?: boolean;
  hasSuggestions?: boolean;
  controlsDisabled?: boolean;
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
  showControls = false, // Default to false
  onLink,
  onUnlink,
  onSuggest,
  canLink = false,
  canUnlink = false,
  isSuggesting = false,
  hasSuggestions = false,
  controlsDisabled = false,
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
    // Use a subtle green/blue tint for confidence, avoiding red for better accessibility
    // Example: Lerp between a light blue (low confidence) and a light teal (high confidence)
    const hue = 180 + 40 * confidence; // 180 (cyan/blue) to 220 (blue/purple-ish)
    const saturation = 50 + 20 * confidence; // 50% to 70%
    const lightness = 90; // Keep it light
    const alpha = 0.1 + 0.15 * confidence; // 0.1 to 0.25 alpha
    return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
  };

  return (
    <Card className="flex flex-col h-full shadow-md">
      <CardHeader className="flex flex-row items-center justify-between py-4 px-4"> {/* Adjust padding */}
        <CardTitle>{title}</CardTitle>
         {showControls && onLink && onUnlink && onSuggest && (
           <InlineAlignmentControls
             onLink={onLink}
             onUnlink={onUnlink}
             onSuggest={onSuggest}
             canLink={canLink}
             canUnlink={canUnlink}
             isSuggesting={isSuggesting}
             hasSuggestions={hasSuggestions}
             disabled={controlsDisabled}
           />
         )}
      </CardHeader>
      {/* Make CardContent grow and contain the ScrollArea */}
      <CardContent className="flex flex-col flex-grow p-0 overflow-hidden">
        {showTextarea && (
          <div className="px-4 pt-0 pb-2"> {/* Adjust padding */}
            {/* Textarea is hidden and shown based on prop, kept for potential future use */}
             <Textarea
               value={text}
               onChange={onTextChange}
               placeholder={isLoading ? `Loading ${title} text...` : `Paste ${title} text here or load from URL...`}
               className="h-24 resize-none bg-card text-card-foreground" // Reduced height
               readOnly={readOnly || isLoading} // Make read-only if fetching or explicitly set
               disabled={isLoading} // Disable while loading
             />
          </div>
        )}
        <ScrollArea className="flex-grow px-4 pb-4">
          {/* Added tabindex to make the container focusable for potential keyboard nav */}
          <div className="space-y-2 outline-none" tabIndex={0}>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 <p className="text-muted-foreground">Loading {title} paragraphs...</p>
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
                 if ((isHighlightedSuggestion || isLinkedHighlight) && suggestedAlignments) {
                      const confidence = isHighlightedSuggestion
                          ? suggestionConfidence
                          : suggestedAlignments.find(s => {
                                const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
                                return s[partnerKey] === index && s[suggestionKey] === highlightedSuggestionIndex;
                            })?.confidence ?? null;

                      if (confidence !== null) {
                          highlightStyle.backgroundColor = getHighlightColor(confidence);
                          // Use a consistent subtle border for both highlighted and linked-highlight
                          highlightStyle.boxShadow = '0 0 0 1px hsl(var(--primary) / 0.6)';
                      }
                 }


                return (
                  <div
                    key={index}
                    onClick={() => onParagraphSelect(index)}
                    className={cn(
                      'p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border', // Faster transition
                      'text-sm leading-relaxed',
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner' // Keep selection style prominent
                        : 'bg-card hover:bg-secondary/60', // Slightly less intense hover
                      manuallyAligned
                        ? 'border-accent border-dashed' // Dashed for manual
                        : isSuggested ? 'border-primary/30 border-dotted' // Dotted for suggested
                        : 'border-border', // Default border
                      // Removed animation class - rely on background/box-shadow directly
                    )}
                     style={highlightStyle}
                    data-paragraph-index={index}
                    {...(manuallyAligned && { 'data-linked-to': linkedPartnerIndex })}
                    {...(isSuggested && {'data-suggested-link': suggestionPartnerIndex, 'data-confidence': suggestionConfidence })}
                  >
                    <p className={title === 'Hebrew' ? 'rtl text-right' : 'ltr text-left'}>
                      {/* Using dangerouslySetInnerHTML to render potential <br> tags */}
                      {paragraph ? (
                           <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
                       ) : (
                           <span className="text-muted-foreground italic">Empty paragraph</span>
                       )}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground p-3 text-center italic">
                {text === null ? `Load text to see paragraphs.` : `No paragraphs detected in the fetched text. Ensure the source content has paragraphs separated by double line breaks.`}
              </p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
       {/* Remove the separate style tag as animation is removed */}
    </Card>
  );
};

export default TextAreaPanel;
