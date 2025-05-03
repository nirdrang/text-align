"use client";

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Link as LinkIcon, Link2Off as LinkOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import InlineAlignmentControls from './inline-alignment-controls';
import ParagraphBox from './paragraph-box';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Interface for displayed paragraphs - Adjusted to match page.tsx
interface DisplayedParagraphData {
    paragraph: string;
    originalIndex: number;
}

interface TextAreaPanelProps {
  title: string;
  displayedParagraphs: DisplayedParagraphData[]; // Updated type
  isLoading?: boolean;
  selectedOriginalIndex: number | null;
  onParagraphSelect: (displayedIndex: number, language: 'english' | 'hebrew') => void;
  isSourceLanguage: boolean;
  loadedText: string | null;
  language: 'english' | 'hebrew';
  onDropParagraph: (originalIndex: number, language: 'english' | 'hebrew') => void;
  hiddenIndices: Set<number>;
  panelRef: React.RefObject<HTMLDivElement>;
  isScrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;

  // Controls specific to Hebrew panel
  showControls?: boolean;
  onConfirmPair?: () => void;
  onUnlink?: () => void;
  canConfirmPair?: boolean;
  canUnlink?: boolean;
  controlsDisabled?: boolean;
  onMergeUp?: (displayedIndex: number) => void;
  onMergeDown?: (displayedIndex: number) => void;
}

const TextAreaPanel: React.FC<TextAreaPanelProps> = ({
  title,
  displayedParagraphs,
  isLoading = false,
  selectedOriginalIndex,
  onParagraphSelect,
  isSourceLanguage,
  loadedText,
  language,
  onDropParagraph,
  hiddenIndices,
  panelRef,
  isScrollSyncEnabled,
  onToggleScrollSync,
  showControls = false,
  onConfirmPair,
  onUnlink,
  canConfirmPair = false,
  canUnlink = false,
  controlsDisabled = false,
  onMergeUp,
  onMergeDown,
}) => {

    const hasAttemptedLoad = loadedText !== null;
    const hasContent = hasAttemptedLoad && displayedParagraphs.length > 0;
    const isEmptyAfterLoad = hasAttemptedLoad && displayedParagraphs.length === 0 && !isLoading;

    return (
        <TooltipProvider delayDuration={100}>
            <Card className="flex flex-col h-full shadow-md">
            <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
                 <div className="flex items-center space-x-2">
                    <CardTitle className="text-lg">{title}</CardTitle>
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
                {showControls && onConfirmPair && onUnlink && (
                <InlineAlignmentControls
                    onConfirmPair={onConfirmPair}
                    onUnlink={onUnlink}
                    canConfirmPair={canConfirmPair}
                    canUnlink={canUnlink}
                    disabled={controlsDisabled}
                />
                )}
            </CardHeader>
            <CardContent className="flex flex-col flex-grow p-0 overflow-hidden">
                <ScrollArea className="flex-grow px-4 pb-4" ref={panelRef as React.RefObject<any>}>
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
                        {`No paragraphs detected or all paragraphs were filtered out as metadata in the ${title} text.`}
                    </p>
                    ) : hasContent ? (
                    displayedParagraphs.map((item, displayedIndex) => {
                        const { paragraph, originalIndex } = item;
                        const isSelected = selectedOriginalIndex === originalIndex;

                        return (
                            <ParagraphBox
                                key={`${language}-${originalIndex}-${paragraph.length}`} // More specific key
                                displayedIndex={displayedIndex}
                                originalIndex={originalIndex}
                                paragraph={paragraph}
                                isSelected={isSelected}
                                isHebrew={language === 'hebrew'}
                                onSelect={() => onParagraphSelect(displayedIndex, language)}
                                onDrop={() => onDropParagraph(originalIndex, language)}
                                className="paragraph-box"
                                onMergeUp={language === 'hebrew' ? onMergeUp : undefined}
                                onMergeDown={language === 'hebrew' ? onMergeDown : undefined}
                            />
                        );
                    })
                    ) : (
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
