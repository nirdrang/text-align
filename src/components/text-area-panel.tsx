"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Loader2 } from 'lucide-react'; // Import Loader
import { cn } from '@/lib/utils';
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
import InlineAlignmentControls from './inline-alignment-controls'; // Import the new controls
import ParagraphBox from './paragraph-box'; // Import the new component

interface TextAreaPanelProps {
  title: string;
  paragraphs: string[];
  isLoading?: boolean; // Prop to indicate loading state
  selectedIndex: number | null;
  onParagraphSelect: (index: number) => void;
  manualAlignments: ManualAlignment[];
  alignmentKey: 'englishIndex' | 'hebrewIndex';
  suggestedAlignments: SuggestedAlignment[] | null;
  suggestionKey: 'englishParagraphIndex' | 'hebrewParagraphIndex';
  highlightedSuggestionIndex: number | null;
  linkedHighlightIndex: number | null;
  isSourceLanguage: boolean; // New prop to identify the source language panel
  loadedText: string | null; // Pass the loaded text state to check if loading was attempted

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
  paragraphs,
  isLoading = false,
  selectedIndex,
  onParagraphSelect,
  manualAlignments,
  alignmentKey,
  suggestedAlignments,
  suggestionKey,
  highlightedSuggestionIndex,
  linkedHighlightIndex,
  isSourceLanguage,
  loadedText, // Use this to determine initial/empty/error state
  showControls = false,
  onLink,
  onUnlink,
  onSuggest,
  canLink = false,
  canUnlink = false,
  isSuggesting = false,
  hasSuggestions = false,
  controlsDisabled = false,
}) => {

    // Determine display state based on loading and loadedText
    const hasAttemptedLoad = loadedText !== null;
    const hasContent = hasAttemptedLoad && paragraphs.length > 0;
    const isEmptyAfterLoad = hasAttemptedLoad && paragraphs.length === 0;

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
        // Use a subtle green/blue tint for confidence
        const hue = 180 + 40 * confidence;
        const saturation = 50 + 20 * confidence;
        const lightness = 90;
        const alpha = 0.1 + 0.15 * confidence;
        return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    };

    return (
        <Card className="flex flex-col h-full shadow-md">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4"> {/* Reduced padding */}
            <CardTitle className="text-lg">{title}</CardTitle> {/* Slightly smaller title */}
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
            <ScrollArea className="flex-grow px-4 pb-4">
            {/* Added tabindex to make the container focusable */}
            <div className="space-y-2 outline-none" tabIndex={0}>
                {isLoading ? ( // Primary loading state: spinner
                <div className="flex flex-col items-center justify-center h-full space-y-4 p-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground">Loading {title} paragraphs...</p>
                </div>
                ) : !hasAttemptedLoad ? ( // Initial state: Before any fetch attempt
                <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                    <p className="text-muted-foreground">
                        {`Enter URLs above and click 'Fetch' to load the ${title} content.`}
                    </p>
                </div>
                ) : hasContent ? ( // Success state: paragraphs rendered
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
                            highlightStyle.boxShadow = '0 0 0 1px hsl(var(--primary) / 0.6)';
                        }
                    }

                    return (
                    <ParagraphBox
                        key={index}
                        index={index}
                        paragraph={paragraph}
                        isSelected={isSelected}
                        isManuallyAligned={manuallyAligned}
                        isSuggested={isSuggested}
                        isHighlightedSuggestion={isHighlightedSuggestion || isLinkedHighlight} // Combine highlight flags
                        highlightStyle={highlightStyle}
                        isHebrew={title === 'Hebrew'}
                        onSelect={() => onParagraphSelect(index)}
                        linkedPartnerIndex={linkedPartnerIndex}
                        suggestionPartnerIndex={suggestionPartnerIndex}
                        suggestionConfidence={suggestionConfidence}
                    />
                    );
                })
                ) : ( // Empty/Error state: After fetch attempt, no paragraphs found
                <p className="text-muted-foreground p-3 text-center italic">
                    {`No paragraphs detected in the ${title} text. Fetch might have failed, the source might be empty, or the content structure is unexpected. Check URL and try again.`}
                </p>
                )}
            </div>
            </ScrollArea>
        </CardContent>
        </Card>
    );
};

export default TextAreaPanel;
