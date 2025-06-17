"use client";

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Trash2, Merge, Scissors, Pencil } from 'lucide-react'; // Removed RefreshCw, AlertTriangle, Loader2
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { splitSentences } from '@/lib/sentence_utils';

interface ParagraphBoxProps {
    displayedIndex: number;
    originalIndex: number;
    paragraph: string;
    isSelected: boolean;
    isHebrew: boolean;
    onSelect: (displayedIndex: number) => void;
    onDrop: (originalIndex: number) => void;
    onMergeUp?: (displayedIndex: number) => void;
    onMergeDown?: (displayedIndex: number) => void;
    className?: string;
    score?: number | null;
    lenRatio?: number | null;
    onSplit?: (displayedIndex: number) => void;
    onEdit?: (displayedIndex: number) => void;
    highlightInfo?: { green?: number; red?: number; greenOnly?: boolean };
}

const ParagraphBox: React.FC<ParagraphBoxProps> = ({
    displayedIndex,
    originalIndex,
    paragraph,
    isSelected,
    isHebrew,
    onSelect,
    onDrop,
    onMergeUp,
    onMergeDown,
    className,
    score,
    lenRatio,
    onSplit,
    onEdit,
    highlightInfo,
}) => {
    const handleDropClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDrop(originalIndex);
    };

     const handleMergeUpClick = () => {
         if (onMergeUp) {
             onMergeUp(displayedIndex);
         }
     };

     const handleMergeDownClick = () => {
         if (onMergeDown) {
             onMergeDown(displayedIndex);
         }
     };

    // Compute badge color based on score using linear RGB interpolation
    let scoreColor = 'rgb(220,38,38)'; // Default to red
    if (typeof score === 'number') {
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const t = clamp(score, 0, 1); // t=0 for score=0, t=1 for score=1
        const r = Math.round(220 * (1 - t) + 22 * t);
        const g = Math.round(38 * (1 - t) + 163 * t);
        const b = Math.round(38 * (1 - t) + 74 * t);
        scoreColor = `rgb(${r},${g},${b})`;
    }

    // Debug log only when highlightInfo changes
    useEffect(() => {
        if (highlightInfo && (highlightInfo.green !== undefined || highlightInfo.red !== undefined)) {
            // Split paragraph into sentences using shared logic
            const sentences = splitSentences(paragraph, isHebrew ? 'hebrew' : 'english');
            if (highlightInfo.green !== undefined && sentences[highlightInfo.green]) {
                console.log('DEBUG: Highlighting green sentence', highlightInfo.green, sentences[highlightInfo.green]);
            }
            if (highlightInfo.red !== undefined && sentences[highlightInfo.red]) {
                console.log('DEBUG: Highlighting red sentence', highlightInfo.red, sentences[highlightInfo.red]);
            }
        }
    }, [highlightInfo, paragraph, displayedIndex, isHebrew]);

    // Paragraph Content with sentence highlighting for Hebrew or English
    let paragraphContent: React.ReactNode;
    if (highlightInfo && highlightInfo.greenOnly) {
        // Render the whole box in green for single-sentence paragraphs
        paragraphContent = (
            <div
                onClick={() => onSelect(displayedIndex)}
                dir={isHebrew ? 'rtl' : 'ltr'}
                style={isHebrew ? { textAlign: 'right' } : { textAlign: 'left' }}
                className={cn(
                    'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border',
                    'text-sm leading-relaxed',
                    'bg-green-200 border-green-500', // Distinct green background and border
                    isSelected
                        ? 'ring-2 ring-green-600 ring-offset-2 shadow-inner'
                        : '',
                    isHebrew ? 'rtl text-right' : 'ltr text-left',
                    'min-h-[40px]',
                    className
                )}
                data-original-index={originalIndex}
                data-displayed-index={displayedIndex}
            >
                {/* Controls Container (top-right or top-left) */}
                <div className={cn(
                    "absolute top-1 flex flex-row items-center space-x-1 space-y-0",
                    isHebrew ? "left-1 flex-row-reverse" : "right-1"
                )}>
                    {/* Displayed Index Badge */}
                    <span className="px-2 py-0.5 min-w-[32px] text-center rounded bg-muted text-xs text-muted-foreground border border-border mr-1">
                      {displayedIndex + 1}
                    </span>
                    {/* Drop Button */}
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-1 text-muted-foreground"
                                onClick={handleDropClick}
                                aria-label="Drop paragraph"
                             >
                                <Trash2 className="h-3.5 w-3.5" />
                             </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p>Hide this paragraph</p>
                        </TooltipContent>
                     </Tooltip>
                     {/* Split Button (Hebrew only) */}
                     {isHebrew && onSplit && (
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-6 w-6 p-1 text-muted-foreground"
                             onClick={e => { e.stopPropagation(); onSplit(displayedIndex); }}
                             aria-label="Split paragraph"
                           >
                             <Scissors className="h-3.5 w-3.5" />
                           </Button>
                         </TooltipTrigger>
                         <TooltipContent side="top">
                           <p>Split this paragraph</p>
                         </TooltipContent>
                       </Tooltip>
                     )}
                     {/* Edit Button (all languages) */}
                     {onEdit && (
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-6 w-6 p-1 text-muted-foreground"
                             onClick={e => { e.stopPropagation(); onEdit(displayedIndex); }}
                             aria-label="Edit paragraph"
                           >
                             <Pencil className="h-3.5 w-3.5" />
                           </Button>
                         </TooltipTrigger>
                         <TooltipContent side="top">
                           <p>Edit this paragraph</p>
                         </TooltipContent>
                       </Tooltip>
                     )}
                     {/* Score Badge Only */}
                     {typeof score === 'number' && (
                         <span
                             className="px-2 py-0.5 min-w-[48px] text-center rounded text-white text-xs shadow ml-1"
                             style={{ backgroundColor: scoreColor }}
                         >
                             {score.toFixed(2)}
                         </span>
                     )}
                </div>
                {/* Render the whole paragraph as a single block */}
                <span>{paragraph}</span>
            </div>
        );
    } else if (highlightInfo && (highlightInfo.green !== undefined || highlightInfo.red !== undefined)) {
        // Split paragraph into sentences using shared logic
        const sentences = splitSentences(paragraph, isHebrew ? 'hebrew' : 'english');
        paragraphContent = (
            <div
                onClick={() => onSelect(displayedIndex)}
                dir={isHebrew ? 'rtl' : 'ltr'}
                style={isHebrew ? { textAlign: 'right' } : { textAlign: 'left' }}
                className={cn(
                    'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border',
                    'text-sm leading-relaxed',
                    isSelected
                        ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                        : 'bg-card hover:bg-secondary/60',
                    'border-border',
                    isHebrew ? 'rtl text-right' : 'ltr text-left',
                    'min-h-[40px]',
                    className
                )}
                data-original-index={originalIndex}
                data-displayed-index={displayedIndex}
            >
                {/* Controls Container (top-right or top-left) */}
                <div className={cn(
                    "absolute top-1 flex flex-row items-center space-x-1 space-y-0",
                    isHebrew ? "left-1 flex-row-reverse" : "right-1"
                )}>
                    {/* Displayed Index Badge */}
                    <span className="px-2 py-0.5 min-w-[32px] text-center rounded bg-muted text-xs text-muted-foreground border border-border mr-1">
                      {displayedIndex + 1}
                    </span>
                    {/* Drop Button */}
                     <Tooltip>
                        <TooltipTrigger asChild>
                             <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 p-1 text-muted-foreground"
                                onClick={handleDropClick}
                                aria-label="Drop paragraph"
                             >
                                <Trash2 className="h-3.5 w-3.5" />
                             </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p>Hide this paragraph</p>
                        </TooltipContent>
                     </Tooltip>
                     {/* Split Button (Hebrew only) */}
                     {isHebrew && onSplit && (
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-6 w-6 p-1 text-muted-foreground"
                             onClick={e => { e.stopPropagation(); onSplit(displayedIndex); }}
                             aria-label="Split paragraph"
                           >
                             <Scissors className="h-3.5 w-3.5" />
                           </Button>
                         </TooltipTrigger>
                         <TooltipContent side="top">
                           <p>Split this paragraph</p>
                         </TooltipContent>
                       </Tooltip>
                     )}
                     {/* Edit Button (all languages) */}
                     {onEdit && (
                       <Tooltip>
                         <TooltipTrigger asChild>
                           <Button
                             variant="ghost"
                             size="icon"
                             className="h-6 w-6 p-1 text-muted-foreground"
                             onClick={e => { e.stopPropagation(); onEdit(displayedIndex); }}
                             aria-label="Edit paragraph"
                           >
                             <Pencil className="h-3.5 w-3.5" />
                           </Button>
                         </TooltipTrigger>
                         <TooltipContent side="top">
                           <p>Edit this paragraph</p>
                         </TooltipContent>
                       </Tooltip>
                     )}
                     {/* Score Badge Only */}
                     {typeof score === 'number' && (
                         <span
                             className="px-2 py-0.5 min-w-[48px] text-center rounded text-white text-xs shadow ml-1"
                             style={{ backgroundColor: scoreColor }}
                         >
                             {score.toFixed(2)}
                         </span>
                     )}
                </div>
                {/* Sentence-level rendering with index */}
                {sentences.map((sentence, idx) => {
                    let style: React.CSSProperties = {};
                    if (highlightInfo.green === idx) {
                        style = { color: 'green', fontWeight: 'bold' };
                    } else if (highlightInfo.red === idx) {
                        style = { color: 'red', fontWeight: 'bold' };
                    }
                    return (
                        <span key={idx} style={style}>
                            <span style={{ color: '#888', fontSize: '0.85em', marginRight: 4 }}>[{idx}]</span>{sentence}{' '}
                        </span>
                    );
                })}
            </div>
        );
    } else {
        paragraphContent = (
        <div
            onClick={() => onSelect(displayedIndex)}
            dir={isHebrew ? 'rtl' : 'ltr'}
            style={isHebrew ? { textAlign: 'right' } : { textAlign: 'left' }}
            className={cn(
                'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border',
                    'text-sm leading-relaxed',
                isSelected
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                    : 'bg-card hover:bg-secondary/60',
                 'border-border',
                 isHebrew ? 'rtl text-right' : 'ltr text-left',
                    'min-h-[40px]',
                 className
            )}
            data-original-index={originalIndex}
            data-displayed-index={displayedIndex}
        >
            {/* Controls Container (top-right or top-left) */}
             <div className={cn(
                 "absolute top-1 flex flex-row items-center space-x-1 space-y-0",
                 isHebrew ? "left-1 flex-row-reverse" : "right-1"
             )}>
                {/* Displayed Index Badge */}
                <span className="px-2 py-0.5 min-w-[32px] text-center rounded bg-muted text-xs text-muted-foreground border border-border mr-1">
                  {displayedIndex + 1}
                </span>
                {/* Drop Button */}
                 <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-1 text-muted-foreground"
                            onClick={handleDropClick}
                            aria-label="Drop paragraph"
                         >
                            <Trash2 className="h-3.5 w-3.5" />
                         </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                        <p>Hide this paragraph</p>
                    </TooltipContent>
                 </Tooltip>
                 {/* Split Button (Hebrew only) */}
                 {isHebrew && onSplit && (
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-6 w-6 p-1 text-muted-foreground"
                         onClick={e => { e.stopPropagation(); onSplit(displayedIndex); }}
                         aria-label="Split paragraph"
                       >
                         <Scissors className="h-3.5 w-3.5" />
                       </Button>
                     </TooltipTrigger>
                     <TooltipContent side="top">
                       <p>Split this paragraph</p>
                     </TooltipContent>
                   </Tooltip>
                 )}
                 {/* Edit Button (all languages) */}
                 {onEdit && (
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-6 w-6 p-1 text-muted-foreground"
                         onClick={e => { e.stopPropagation(); onEdit(displayedIndex); }}
                         aria-label="Edit paragraph"
                       >
                         <Pencil className="h-3.5 w-3.5" />
                       </Button>
                     </TooltipTrigger>
                     <TooltipContent side="top">
                       <p>Edit this paragraph</p>
                     </TooltipContent>
                   </Tooltip>
                 )}
                 {/* Score Badge Only */}
                 {typeof score === 'number' && (
                     <span
                         className="px-2 py-0.5 min-w-[48px] text-center rounded text-white text-xs shadow ml-1"
                         style={{ backgroundColor: scoreColor }}
                     >
                         {score.toFixed(2)}
                     </span>
                 )}
             </div>
            {/* Paragraph Content */}
            {paragraph ? (
                <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
            ) : (
                <span className="text-muted-foreground italic">Empty paragraph</span>
            )}
        </div>
    );
    }

    // Merge context menu for any language if merge handlers are provided
    if (onMergeUp || onMergeDown) {
        return (
            <TooltipProvider delayDuration={100}>
                <ContextMenu>
                    <ContextMenuTrigger>{paragraphContent}</ContextMenuTrigger>
                    <ContextMenuContent>
                        {onMergeUp && (
                            <ContextMenuItem onClick={handleMergeUpClick}>
                                <Merge className="mr-2 h-4 w-4 transform rotate-180" />
                                Merge Up
                            </ContextMenuItem>
                        )}
                        {onMergeDown && (
                            <ContextMenuItem onClick={handleMergeDownClick}>
                                <Merge className="mr-2 h-4 w-4" />
                                Merge Down
                            </ContextMenuItem>
                        )}
                    </ContextMenuContent>
                </ContextMenu>
            </TooltipProvider>
        );
    }

    // Standard TooltipProvider for non-Hebrew or if no merge needed
     return (
         <TooltipProvider delayDuration={100}>
             {paragraphContent}
         </TooltipProvider>
     );
};

export default ParagraphBox;
