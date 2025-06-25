"use client";

import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Link as LinkIcon, Link2Off as LinkOffIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import InlineAlignmentControls from './inline-alignment-controls';
import ParagraphBox from './paragraph-box';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { splitSentences } from '@/lib/sentence_utils';

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
  onRevertLastPair?: () => void;
  canRevertLastPair?: boolean;
  highlightMap?: { [paragraphIdx: number]: { green?: number; red?: number; greenOnly?: boolean } };
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
  onRevertLastPair,
  canRevertLastPair = false,
  highlightMap,
}) => {

    const hasAttemptedLoad = loadedText !== null;
    const hasContent = hasAttemptedLoad && displayedParagraphs.length > 0;
    const isEmptyAfterLoad = hasAttemptedLoad && displayedParagraphs.length === 0 && !isLoading;

    // Split dialog state
    const [splitDialogOpen, setSplitDialogOpen] = React.useState(false);
    const [splitParagraphIndex, setSplitParagraphIndex] = React.useState<number | null>(null);
    const [splitParagraphText, setSplitParagraphText] = React.useState('');
    const [splitHighlightInfo, setSplitHighlightInfo] = React.useState<{ green?: number; red?: number; greenOnly?: boolean }>();

    // Edit dialog state
    const [editDialogOpen, setEditDialogOpen] = React.useState(false);
    const [editParagraphIndex, setEditParagraphIndex] = React.useState<number | null>(null);
    const [editParagraphText, setEditParagraphText] = React.useState('');
    const [editHighlightInfo, setEditHighlightInfo] = React.useState<{ green?: number; red?: number; greenOnly?: boolean }>();

    const splitEditRef = useRef<HTMLDivElement>(null);
    const editEditRef = useRef<HTMLDivElement>(null);

    // Helper: escape HTML to avoid XSS when inserting user text
    const escapeHtml = (unsafe: string) => unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

    // Build highlighted HTML for a paragraph
    const buildHighlightedHTML = (
      paragraph: string,
      isHebrew: boolean,
      highlightInfo?: { green?: number; red?: number; greenOnly?: boolean }
    ) => {
      if (!highlightInfo) return escapeHtml(paragraph);
      if (highlightInfo.greenOnly) {
        return `<span style=\"background-color:rgba(0,255,0,0.15);\">${escapeHtml(paragraph)}</span>`;
      }
      const sentences = splitSentences(paragraph, isHebrew ? 'hebrew' : 'english');
      const htmlContent = sentences
        .map((s, idx) => {
          const safe = escapeHtml(s);
          if (highlightInfo.green === idx) return `<span style=\"color:green;font-weight:bold;\">${safe}</span>`;
          if (highlightInfo.red === idx) return `<span style=\"color:red;font-weight:bold;\">${safe}</span>`;
          return safe;
        })
        .join(' ');

      return htmlContent;
    };

    // Whenever the dialog opens, inject initial HTML with highlights
    useEffect(() => {
      if (splitDialogOpen && splitEditRef.current) {
        splitEditRef.current.innerHTML = buildHighlightedHTML(splitParagraphText, language === 'hebrew', splitHighlightInfo);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [splitDialogOpen, splitHighlightInfo, language]);

    useEffect(() => {
      if (editDialogOpen && editEditRef.current) {
        editEditRef.current.innerHTML = buildHighlightedHTML(editParagraphText, language === 'hebrew', editHighlightInfo);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editDialogOpen, editHighlightInfo, language]);

    const handleSplit = (displayedIndex: number) => {
      setSplitParagraphIndex(displayedIndex);
      setSplitParagraphText(displayedParagraphs[displayedIndex]?.paragraph || '');
      setSplitHighlightInfo(highlightMap ? highlightMap[displayedIndex] : undefined);
      setSplitDialogOpen(true);
    };

    const handleSplitConfirm = () => {
      if (splitParagraphIndex !== null && onSplitParagraph) {
        onSplitParagraph(splitParagraphIndex, splitParagraphText);
      }
      setSplitDialogOpen(false);
      setSplitParagraphIndex(null);
      setSplitParagraphText('');
      setSplitHighlightInfo(undefined);
    };

    const handleSplitCancel = () => {
      setSplitDialogOpen(false);
      setSplitParagraphIndex(null);
      setSplitParagraphText('');
      setSplitHighlightInfo(undefined);
    };

    const handleEdit = (displayedIndex: number) => {
      setEditParagraphIndex(displayedIndex);
      setEditParagraphText(displayedParagraphs[displayedIndex]?.paragraph || '');
      setEditHighlightInfo(highlightMap ? highlightMap[displayedIndex] : undefined);
      setEditDialogOpen(true);
    };

    const handleEditConfirm = () => {
      if (editParagraphIndex !== null && onEditParagraph) {
        onEditParagraph(editParagraphIndex, editParagraphText);
      }
      setEditDialogOpen(false);
      setEditParagraphIndex(null);
      setEditParagraphText('');
      setEditHighlightInfo(undefined);
    };

    const handleEditCancel = () => {
      setEditDialogOpen(false);
      setEditParagraphIndex(null);
      setEditParagraphText('');
      setEditHighlightInfo(undefined);
    };

    useEffect(() => {
      if (highlightMap) {
        // Removed debug log
      }
    }, [highlightMap]);

    // Use browser's innerText which preserves \n for block-level breaks
    const extractText = (el: HTMLElement) => el.innerText.replace(/\r/g, '')

    return (
        <TooltipProvider delayDuration={100}>
            <Card className="flex flex-col shadow-md" style={{ height: "calc(100vh - 200px)" }}>
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
                    onRevertLastPair={onRevertLastPair}
                    canRevertLastPair={canRevertLastPair}
                />
                )}
            </CardHeader>
            <CardContent className="flex flex-col flex-grow p-0">
                <div 
                    ref={panelRef}
                    className="px-4 pb-4 overflow-y-scroll"
                    style={{ 
                        height: "calc(100vh - 280px)",
                        scrollbarWidth: "auto",
                        scrollbarColor: "#666 #ccc"
                    }}
                >
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
                    ) : displayedParagraphs.length > 0 ? (
                    displayedParagraphs.map((item, displayedIndex) => {
                        const { paragraph, originalIndex, score, len_ratio } = item;
                        const isSelected = selectedOriginalIndex === originalIndex;
                        let highlightInfo: { green?: number; red?: number; greenOnly?: boolean } | undefined = undefined;
                        if (highlightMap) {
                            highlightInfo = highlightMap[displayedIndex];
                        }
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
                                onMergeUp={onMergeUp}
                                onMergeDown={onMergeDown}
                                score={typeof score === 'number' ? score : undefined}
                                lenRatio={typeof len_ratio === 'number' ? len_ratio : undefined}
                                onSplit={language === 'hebrew' && onSplitParagraph ? handleSplit : undefined}
                                onEdit={handleEdit}
                                highlightInfo={highlightInfo}
                            />
                        );
                    })
                    ) : (
                    <p className="text-muted-foreground p-3 text-center italic">
                        An unexpected error occurred displaying paragraphs.
                    </p>
                    )}
                </div>
                </div>
            </CardContent>
            </Card>
            {/* Split Dialog */}
            {splitDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg p-6 w-full max-w-lg">
                  <h2 className="text-lg font-semibold mb-2">Split Paragraph</h2>
                  {/* Replace preview + textarea with one editable div */}
                  <div
                    ref={splitEditRef}
                    contentEditable
                    suppressContentEditableWarning
                    dir={language === 'hebrew' ? 'rtl' : 'ltr'}
                    style={language === 'hebrew' ? { textAlign: 'right' } : { textAlign: 'left' }}
                    className="w-full min-h-[120px] border rounded p-2 mb-4 text-sm bg-background whitespace-pre-wrap focus:outline-none"
                    onInput={e => setSplitParagraphText(extractText(e.currentTarget as HTMLElement))}
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
                  {/* For Edit Dialog */}
                  <div
                    ref={editEditRef}
                    contentEditable
                    suppressContentEditableWarning
                    dir={language === 'hebrew' ? 'rtl' : 'ltr'}
                    style={language === 'hebrew' ? { textAlign: 'right' } : { textAlign: 'left' }}
                    className="w-full min-h-[120px] border rounded p-2 mb-4 text-sm bg-background whitespace-pre-wrap focus:outline-none"
                    onInput={e => setEditParagraphText(extractText(e.currentTarget as HTMLElement))}
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
