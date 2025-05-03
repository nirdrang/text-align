"use client";

import type React from 'react';
import { type ChangeEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';

interface TextAreaPanelProps {
  title: string;
  text: string;
  paragraphs: string[];
  onTextChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  selectedIndex: number | null;
  onParagraphSelect: (index: number) => void;
  manualAlignments: ManualAlignment[];
  alignmentKey: 'englishIndex' | 'hebrewIndex'; // Which index to check in manualAlignments
  suggestedAlignments: SuggestedAlignment[] | null;
  suggestionKey: 'englishParagraphIndex' | 'hebrewParagraphIndex'; // Which index to check in suggestedAlignments
  highlightedSuggestionIndex: number | null;
  linkedHighlightIndex: number | null; // Index of the paragraph linked to the highlighted suggestion in the *other* panel
}

const TextAreaPanel: React.FC<TextAreaPanelProps> = ({
  title,
  text,
  paragraphs,
  onTextChange,
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
    const greenIntensity = Math.floor(200 * confidence); // Max green ~200 to avoid pure yellow
    const redIntensity = Math.floor(150 * (1 - confidence)); // Max red ~150
    return `rgba(${redIntensity}, ${greenIntensity}, 0, 0.2)`; // Low opacity highlight
  };


  return (
    <Card className="flex flex-col h-full shadow-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow p-0">
        <div className="p-4 pb-0">
          <Textarea
            value={text}
            onChange={onTextChange}
            placeholder={`Paste ${title} text here...`}
            className="h-32 mb-4 resize-none bg-card text-card-foreground" // Ensure contrast
          />
        </div>
        <ScrollArea className="flex-grow px-4 pb-4">
          <div className="space-y-2">
            {paragraphs.map((paragraph, index) => {
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
                highlightStyle.boxShadow = '0 0 0 2px hsl(var(--primary))'; // Teal outline for suggested
              } else if (isLinkedHighlight) {
                 // Find the suggestion that links *to* this paragraph
                const linkingSuggestion = suggestedAlignments?.find(s => {
                    const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
                    return s[partnerKey] === index && s[suggestionKey] === highlightedSuggestionIndex;
                });
                if(linkingSuggestion){
                   highlightStyle.backgroundColor = getHighlightColor(linkingSuggestion.confidence);
                   highlightStyle.boxShadow = '0 0 0 1px hsl(var(--primary) / 0.5)'; // Fainter teal outline
                }
              }

              return (
                <div
                  key={index}
                  onClick={() => onParagraphSelect(index)}
                  className={cn(
                    'p-3 rounded-md cursor-pointer transition-all duration-200 ease-in-out border',
                    'text-sm leading-relaxed', // Consistent text styling
                    isSelected
                      ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner' // Selected style with Teal ring
                      : 'bg-card hover:bg-secondary/80', // Default and hover state
                    manuallyAligned
                      ? 'border-accent border-dashed' // Dashed teal border for manually linked
                      : 'border-border', // Default border
                    isSuggested && !manuallyAligned && 'border-primary/30 border-dotted', // Subtle dotted border for AI suggestions unless manually aligned
                    { 'animate-pulse-border': isHighlightedSuggestion || isLinkedHighlight} // Apply subtle pulse animation
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
            })}
             {paragraphs.length === 0 && text.length > 0 && (
                <p className="text-muted-foreground p-3 text-center italic">No paragraphs detected. Ensure paragraphs are separated by double line breaks.</p>
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
