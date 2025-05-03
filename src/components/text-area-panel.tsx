
"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import { Loader2, Link as LinkIcon, Link2Off as LinkOffIcon } from 'lucide-react'; // Import Loader and specific icons
import { cn } from '@/lib/utils';
import type { SuggestedAlignment } from '@/types/alignment';
import InlineAlignmentControls from './inline-alignment-controls'; // Import the new controls
import ParagraphBox from './paragraph-box'; // Import the new component
import { Button } from '@/components/ui/button'; // Import Button
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; // Import Tooltip components


interface DisplayedParagraph {
    paragraph: string;
    originalIndex: number;
}

interface TextAreaPanelProps {
  title: string;
  // Use displayed paragraphs with original index mapping
  displayedParagraphs: DisplayedParagraph[];
  isLoading?: boolean;
  // Receive the ORIGINAL index of the selected paragraph
  selectedOriginalIndex: number | null;
  // Callback receives the DISPLAYED index and the language
  onParagraphSelect: (displayedIndex: number, language: 'english' | 'hebrew') => void;
  suggestedAlignments: SuggestedAlignment[] | null;
  suggestionKey: 'englishParagraphIndex' | 'hebrewParagraphIndex';
  // Highlight indices are ORIGINAL indices
  highlightedSuggestionIndex: number | null;
  linkedHighlightIndex: number | null;
  isSourceLanguage: boolean;
  loadedText: string | null;
  language: 'english' | 'hebrew'; // Explicitly pass language
  // Callback receives the ORIGINAL index and language
  onDropParagraph: (originalIndex: number, language: 'english' | 'hebrew') => void;
  hiddenIndices: Set<number>; // Set of ORIGINAL hidden indices
  panelRef: React.RefObject<HTMLDivElement>; // Add ref prop
  isScrollSyncEnabled: boolean; // Add scroll sync state
  onToggleScrollSync: () => void; // Add handler for toggling scroll sync

  // Optional props for controls (passed to Hebrew panel)
  showControls?: boolean;
  onConfirmPair?: () => void; // Renamed from onLink
  onUnlink?: () => void;
  onSuggest?: () => void;
  canConfirmPair?: boolean; // Renamed from canLink
  canUnlink?: boolean;
  isSuggesting?: boolean;
  hasSuggestions?: boolean;
  controlsDisabled?: boolean;

  // Optional props for merging (passed to Hebrew panel)
  onMergeUp?: (displayedIndex: number) => void;
  onMergeDown?: (displayedIndex: number) => void;
}

const TextAreaPanel: React.FC<TextAreaPanelProps> = ({
  title,
  displayedParagraphs, // Use this prop
  isLoading = false,
  selectedOriginalIndex, // Use this prop for selection check
  onParagraphSelect,
  suggestedAlignments,
  suggestionKey,
  highlightedSuggestionIndex,
  linkedHighlightIndex,
  isSourceLanguage,
  loadedText,
  language, // Use this prop
  onDropParagraph, // Use this prop
  hiddenIndices, // Use this prop
  panelRef, // Use this ref
  isScrollSyncEnabled, // Use scroll sync state
  onToggleScrollSync, // Use scroll sync handler
  showControls = false,
  onConfirmPair, // Renamed prop
  onUnlink,
  onSuggest,
  canConfirmPair = false, // Renamed prop
  canUnlink = false,
  isSuggesting = false,
  hasSuggestions = false,
  controlsDisabled = false,
  onMergeUp, // Add merge handler
  onMergeDown, // Add merge handler
}) => {

    // Determine display state based on loading and loadedText/displayedParagraphs
    const hasAttemptedLoad = loadedText !== null;
    const hasContent = hasAttemptedLoad && displayedParagraphs.length > 0;
    const isEmptyAfterLoad = hasAttemptedLoad && displayedParagraphs.length === 0 && !isLoading;

    // Check suggestion and get confidence using ORIGINAL indices
    const getSuggestionConfidence = (originalIndex: number): number | null => {
        const suggestion = suggestedAlignments?.find(s => s[suggestionKey] === originalIndex);
        return suggestion ? suggestion.confidence : null;
    };

    // Get suggestion partner's ORIGINAL index
    const getSuggestionPartnerIndex = (originalIndex: number): number | null => {
        if (!suggestedAlignments) return null;
        const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
        const suggestion = suggestedAlignments.find(s => s[suggestionKey] === originalIndex);
        return suggestion ? suggestion[partnerKey] : null;
    }

    const getHighlightColor = (confidence: number): string => {
        const hue = 180 + 40 * confidence;
        const saturation = 50 + 20 * confidence;
        const lightness = 90;
        const alpha = 0.1 + 0.15 * confidence;
        return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
    };

    // Helper to get displayed index from original index (for titles/tooltips)
     const getDisplayedIndex = (originalIndex: number): number | null => {
         const index = displayedParagraphs.findIndex(item => item.originalIndex === originalIndex);
         return index !== -1 ? index : null;
     };


    return (
        <TooltipProvider delayDuration={100}> {/* Ensure TooltipProvider wraps the Card */}
            <Card className="flex flex-col h-full shadow-md">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                 <div className="flex items-center space-x-2"> {/* Container for title and sync button */}
                    <CardTitle className="text-lg">{title}</CardTitle>
                     {/* Scroll Sync Toggle Button - positioned next to the title */}
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                onClick={onToggleScrollSync}
                                className={cn(
                                    "h-7 w-7 text-muted-foreground",
                                    isScrollSyncEnabled ? "text-primary" : ""
                                )}
                                aria-label={isScrollSyncEnabled ? "Disable Scroll Sync" : "Enable Scroll Sync"}
                            >
                                {isScrollSyncEnabled ? <LinkIcon className="h-4 w-4" /> : <LinkOffIcon className="h-4 w-4" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isScrollSyncEnabled ? "Disable Scroll Sync" : "Enable Scroll Sync"}</p>
                        </TooltipContent>
                     </Tooltip>
                 </div>
                {showControls && onConfirmPair && onUnlink && onSuggest && ( // Check for onConfirmPair
                <InlineAlignmentControls
                    onConfirmPair={onConfirmPair} // Pass renamed prop
                    onUnlink={onUnlink}
                    onSuggest={onSuggest}
                    canConfirmPair={canConfirmPair} // Pass renamed prop
                    canUnlink={canUnlink}
                    isSuggesting={isSuggesting}
                    hasSuggestions={hasSuggestions}
                    disabled={controlsDisabled}
                />
                )}
            </CardHeader>
            <CardContent className="flex flex-col flex-grow p-0 overflow-hidden">
                {/* The ref is passed to the ScrollArea, which is the container for scrolling */}
                <ScrollArea className="flex-grow px-4 pb-4" ref={panelRef as React.RefObject<any> /* Type assertion needed as ScrollArea ref type might be complex */}>
                    <div className="space-y-2 outline-none" tabIndex={0}>
                    {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-full space-y-4 p-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-muted-foreground">Loading {title} paragraphs...</p>
                    </div>
                    ) : !hasAttemptedLoad ? (
                    <div className="flex flex-col items-center justify-center h-full p-10 text-center">
                        <p className="text-muted-foreground">
                            {`Enter URLs above and click 'Fetch' to load the ${title} content.`}
                        </p>
                    </div>
                    ) : isEmptyAfterLoad ? (
                    <p className="text-muted-foreground p-3 text-center italic">
                        {`No paragraphs detected or all paragraphs were filtered out as metadata in the ${title} text. Check URL, content structure, or metadata filtering settings.`}
                    </p>
                    ) : hasContent ? (
                    // Iterate over DISPLAYED paragraphs
                    displayedParagraphs.map((item, displayedIndex) => {
                        const { paragraph, originalIndex } = item; // Get original index

                        // Checks use ORIGINAL indices
                        const isSelected = selectedOriginalIndex === originalIndex;
                        const manuallyAligned = false; // Link status is not tracked this way anymore
                        const linkedPartnerOriginalIndex = null; // Link status is not tracked this way anymore
                        const suggestionConfidence = getSuggestionConfidence(originalIndex);
                        const isSuggested = suggestionConfidence !== null;
                        const suggestionPartnerOriginalIndex = getSuggestionPartnerIndex(originalIndex);
                        const isHighlightedSuggestion = highlightedSuggestionIndex === originalIndex;
                        const isLinkedHighlight = linkedHighlightIndex === originalIndex;

                        const highlightStyle: React.CSSProperties = {};
                        if ((isHighlightedSuggestion || isLinkedHighlight) && suggestedAlignments) {
                            // Find confidence based on ORIGINAL indices
                            const confidence = isHighlightedSuggestion
                                ? suggestionConfidence
                                : suggestedAlignments.find(s => {
                                        const partnerKey = suggestionKey === 'englishParagraphIndex' ? 'hebrewParagraphIndex' : 'englishParagraphIndex';
                                        // Check against the correct partner index (which is the highlightedSuggestionIndex)
                                        return s[partnerKey] === originalIndex && s[suggestionKey] === highlightedSuggestionIndex;
                                    })?.confidence ?? null;

                            if (confidence !== null) {
                                highlightStyle.backgroundColor = getHighlightColor(confidence);
                                highlightStyle.boxShadow = '0 0 0 1px hsl(var(--primary) / 0.6)';
                            }
                        }

                        // Get displayed indices for tooltips
                        const linkedPartnerDisplayedIndex = null; // Link status not tracked
                        const suggestionPartnerDisplayedIndex = suggestionPartnerOriginalIndex !== null ? getDisplayedIndex(suggestionPartnerOriginalIndex) : null;

                        return (
                            <ParagraphBox
                                key={`${language}-${originalIndex}`} // Use a unique key combining language and original index
                                displayedIndex={displayedIndex} // Pass displayed index for selection callback
                                originalIndex={originalIndex} // Pass original index for data attributes and drop callback
                                paragraph={paragraph}
                                isSelected={isSelected}
                                isManuallyAligned={manuallyAligned} // Always false now
                                isSuggested={isSuggested}
                                isHighlightedSuggestion={isHighlightedSuggestion || isLinkedHighlight}
                                highlightStyle={highlightStyle}
                                isHebrew={language === 'hebrew'} // Correctly check if it's Hebrew
                                // Pass DISPLAYED index to selection handler
                                onSelect={() => onParagraphSelect(displayedIndex, language)}
                                // Pass DISPLAYED indices for tooltips
                                linkedPartnerIndex={linkedPartnerDisplayedIndex}
                                suggestionPartnerIndex={suggestionPartnerDisplayedIndex}
                                suggestionConfidence={suggestionConfidence}
                                // Pass ORIGINAL index to drop handler
                                onDrop={() => onDropParagraph(originalIndex, language)}
                                // Add a class for easier selection in IntersectionObserver
                                className="paragraph-box"
                                // Pass merge handlers only if it's Hebrew and they exist
                                onMergeUp={language === 'hebrew' ? onMergeUp : undefined}
                                onMergeDown={language === 'hebrew' ? onMergeDown : undefined}
                            />
                        );
                    })
                    ) : ( // Should not be reached if isEmptyAfterLoad is correct, but kept as fallback
                    <p className="text-muted-foreground p-3 text-center italic">
                        An unexpected error occurred displaying paragraphs.
                    </p>
                    )}
                </div>
                </ScrollArea>
            </CardContent>
            </Card>
        </TooltipProvider>
    );
};

export default TextAreaPanel;
