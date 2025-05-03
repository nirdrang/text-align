
"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Trash2, Merge, SplitSquareHorizontal } from 'lucide-react'; // Import merge/split icons
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu" // Import ContextMenu components

interface ParagraphBoxProps {
    displayedIndex: number; // Index within the displayed list
    originalIndex: number; // Original index from the full list
    paragraph: string;
    isSelected: boolean;
    isManuallyAligned: boolean;
    isSuggested: boolean;
    isHighlightedSuggestion: boolean;
    highlightStyle: React.CSSProperties;
    isHebrew: boolean;
    onSelect: (displayedIndex: number) => void; // Callback uses displayed index
    onDrop: (originalIndex: number) => void; // Callback uses original index
    onMergeUp?: (displayedIndex: number) => void; // Optional merge handler
    onMergeDown?: (displayedIndex: number) => void; // Optional merge handler
    linkedPartnerIndex: number | null; // Displayed index of partner
    suggestionPartnerIndex: number | null; // Displayed index of partner
    suggestionConfidence: number | null;
    className?: string; // Optional className prop
}

const ParagraphBox: React.FC<ParagraphBoxProps> = ({
    displayedIndex,
    originalIndex,
    paragraph,
    isSelected,
    isManuallyAligned,
    isSuggested,
    isHighlightedSuggestion,
    highlightStyle,
    isHebrew,
    onSelect,
    onDrop,
    onMergeUp,
    onMergeDown,
    linkedPartnerIndex,
    suggestionPartnerIndex,
    suggestionConfidence,
    className, // Destructure className
}) => {

    const handleDropClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent selection when clicking the drop button
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

    const titleText = isManuallyAligned && linkedPartnerIndex !== null
        ? `Linked to paragraph ${linkedPartnerIndex + 1}`
        : isSuggested && suggestionPartnerIndex !== null
        ? `Suggested link to paragraph ${suggestionPartnerIndex + 1} (Confidence: ${suggestionConfidence?.toFixed(2)})`
        : `Paragraph ${displayedIndex + 1}`;

    const paragraphContent = (
        <div
            onClick={() => onSelect(displayedIndex)}
            className={cn(
                'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border', // Added relative and group
                'text-xs leading-relaxed',
                isSelected
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                    : 'bg-card hover:bg-secondary/60',
                isManuallyAligned
                    ? 'border-accent border-dashed'
                    : isSuggested
                    ? 'border-primary/30 border-dotted'
                    : 'border-border',
                isHighlightedSuggestion && 'shadow-md',
                isHebrew ? 'rtl text-right' : 'ltr text-left',
                className // Apply the passed className
            )}
            style={isHighlightedSuggestion ? highlightStyle : {}}
            data-original-index={originalIndex} // Use original index for potential external interactions
            data-displayed-index={displayedIndex} // Keep displayed index if needed
            {...(isManuallyAligned && linkedPartnerIndex !== null && { 'data-linked-to': linkedPartnerIndex })}
            {...(isSuggested && suggestionPartnerIndex !== null && {
                'data-suggested-link': suggestionPartnerIndex,
                'data-confidence': suggestionConfidence,
            })}
            title={titleText} // Use constructed title
        >
            {/* Drop Button */}
             <Tooltip>
                <TooltipTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "absolute top-1 right-1 h-6 w-6 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity", // Position top-right, hide initially
                            isHebrew && "right-auto left-1" // Adjust position for Hebrew
                        )}
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


            {/* Paragraph Content */}
            {paragraph ? (
                <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
            ) : (
                <span className="text-muted-foreground italic">Empty paragraph</span>
            )}
        </div>
    );

     // Wrap with ContextMenu only for Hebrew side and if merge handlers are provided
     if (isHebrew && (onMergeUp || onMergeDown)) {
         return (
             <TooltipProvider delayDuration={100}>
                 <ContextMenu>
                     <ContextMenuTrigger>{paragraphContent}</ContextMenuTrigger>
                     <ContextMenuContent>
                         {onMergeUp && (
                             <ContextMenuItem onClick={handleMergeUpClick}>
                                 <Merge className="mr-2 h-4 w-4 transform rotate-180" /> {/* Icon for Merge Up */}
                                 Merge Up
                             </ContextMenuItem>
                         )}
                         {onMergeDown && (
                             <ContextMenuItem onClick={handleMergeDownClick}>
                                 <Merge className="mr-2 h-4 w-4" /> {/* Icon for Merge Down */}
                                 Merge Down
                             </ContextMenuItem>
                         )}
                     </ContextMenuContent>
                 </ContextMenu>
             </TooltipProvider>
         );
     }

     // Otherwise, return the standard content wrapped in TooltipProvider
     return (
         <TooltipProvider delayDuration={100}>
             {paragraphContent}
         </TooltipProvider>
     );
};

export default ParagraphBox;
