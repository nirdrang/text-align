"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Trash2, Merge } from 'lucide-react'; // Removed RefreshCw, AlertTriangle, Loader2
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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


    const paragraphContent = (
        <div
            onClick={() => onSelect(displayedIndex)}
            className={cn(
                'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border',
                'text-sm leading-relaxed', // Slightly larger text
                isSelected
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                    : 'bg-card hover:bg-secondary/60',
                 'border-border',
                 isHebrew ? 'rtl text-right' : 'ltr text-left',
                 'min-h-[40px]', // Ensure minimum height
                 className
            )}
            data-original-index={originalIndex}
            data-displayed-index={displayedIndex}
            // Tooltip title is less necessary with visible controls/score
            // title={`Paragraph ${displayedIndex + 1} (Original Index: ${originalIndex})`}
        >
            {/* Controls Container (top-right or top-left) */}
             <div className={cn(
                 "absolute top-1 flex items-center space-x-1",
                 isHebrew ? "left-1" : "right-1"
             )}>

                {/* Drop Button */}
                 <Tooltip>
                    <TooltipTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
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
             </div>


            {/* Paragraph Content */}
            {paragraph ? (
                 // Replace single space merge delimiter with nothing for display
                <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
            ) : (
                <span className="text-muted-foreground italic">Empty paragraph</span>
            )}
        </div>
    );

     // Merge context menu only for Hebrew paragraphs
     if (isHebrew && (onMergeUp || onMergeDown)) {
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
