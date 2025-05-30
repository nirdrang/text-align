"use client";

import React from 'react';
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
    score?: number;
    len_ratio: number;
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
  onConfirmAllPairsUpwards?: () => void;
  onUnlink?: () => void;
  canConfirmPair?: boolean;
  canUnlink?: boolean;
  controlsDisabled?: boolean;
  onMergeUp?: (displayedIndex: number) => void;
  onMergeDown?: (displayedIndex: number) => void;
  onSplitParagraph?: (displayedIndex: number, paragraph: string) => void;
  onEditParagraph?: (displayedIndex: number, paragraph: string) => void;
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
  onConfirmAllPairsUpwards,
  onUnlink,
  canConfirmPair = false,
  canUnlink = false,
  controlsDisabled = false,
  onMergeUp,
  onMergeDown,
  onSplitParagraph,
  onEditParagraph,
}) => {

    const hasAttemptedLoad = loadedText !== null;
    const hasContent = hasAttemptedLoad && displayedParagraphs.length > 0;
    const isEmptyAfterLoad = hasAttemptedLoad && displayedParagraphs.length === 0 && !isLoading;

    // Split dialog state
    const [splitDialogOpen, setSplitDialogOpen] = React.useState(false);
    const [splitParagraphIndex, setSplitParagraphIndex] = React.useState<number | null>(null);
    const [splitParagraphText, setSplitParagraphText] = React.useState('');

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = React.useState(false);
    const [editParagraphIndex, setEditParagraphIndex] = React.useState<number | null>(null);
    const [editParagraphText, setEditParagraphText] = React.useState('');

    const handleSplit = (displayedIndex: number) => {
      setSplitParagraphIndex(displayedIndex);
      setSplitParagraphText(displayedParagraphs[displayedIndex]?.paragraph || '');
      setSplitDialogOpen(true);
    };

    const handleSplitConfirm = () => {
      if (splitParagraphIndex !== null && onSplitParagraph) {
        onSplitParagraph(splitParagraphIndex, splitParagraphText);
      }
      setSplitDialogOpen(false);
      setSplitParagraphIndex(null);
      setSplitParagraphText('');
    };

    const handleSplitCancel = () => {
      setSplitDialogOpen(false);
      setSplitParagraphIndex(null);
      setSplitParagraphText('');
    };

    const handleEdit = (displayedIndex: number) => {
      setEditParagraphIndex(displayedIndex);
      setEditParagraphText(displayedParagraphs[displayedIndex]?.paragraph || '');
      setEditDialogOpen(true);
    };

    const handleEditConfirm = () => {
      if (editParagraphIndex !== null && onEditParagraph) {
        onEditParagraph(editParagraphIndex, editParagraphText);
      }
      setEditDialogOpen(false);
      setEditParagraphIndex(null);
      setEditParagraphText('');
    };

    const handleEditCancel = () => {
      setEditDialogOpen(false);
      setEditParagraphIndex(null);
      setEditParagraphText('');
    };

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
                    onConfirmAllPairsUpwards={onConfirmAllPairsUpwards}
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
                        const { paragraph, originalIndex, score, len_ratio } = item;
                        const isSelected = selectedOriginalIndex === originalIndex;

                        return (
                            <ParagraphBox
                                key={`${language}-${originalIndex}-${paragraph.length}`}
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
                                score={typeof score === 'number' ? score : undefined}
                                lenRatio={typeof len_ratio === 'number' ? len_ratio : undefined}
                                onSplit={language === 'hebrew' && onSplitParagraph ? handleSplit : undefined}
                                onEdit={handleEdit}
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
            {/* Split Dialog */}
            {splitDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 w-full max-w-lg">
                  <h2 className="text-lg font-semibold mb-2">Split Paragraph</h2>
                  <p className="text-sm text-muted-foreground mb-2">Insert a line break (Enter) where you want to split. The text above will become the first paragraph, the text below will become the second.</p>
                  <textarea
                    className="w-full min-h-[120px] border rounded p-2 mb-4 text-sm bg-background"
                    value={splitParagraphText}
                    onChange={e => setSplitParagraphText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleSplitCancel}>Cancel</Button>
                    <Button size="sm" onClick={handleSplitConfirm} disabled={!splitParagraphText.includes('\n')}>Split</Button>
                  </div>
                </div>
              </div>
            )}
            {/* Edit Dialog */}
            {editDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 w-full max-w-lg">
                  <h2 className="text-lg font-semibold mb-2">Edit Paragraph</h2>
                  <textarea
                    className="w-full min-h-[120px] border rounded p-2 mb-4 text-sm bg-background"
                    value={editParagraphText}
                    onChange={e => setEditParagraphText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={handleEditCancel}>Cancel</Button>
                    <Button size="sm" onClick={handleEditConfirm} disabled={!editParagraphText.trim()}>Save</Button>
                  </div>
                </div>
              </div>
            )}
        </TooltipProvider>
    );
};

export default TextAreaPanel;
