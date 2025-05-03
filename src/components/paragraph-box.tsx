
"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Trash2, Merge } from 'lucide-react'; // Removed RefreshCw
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

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
    // Removed scoring related props
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
    // Removed scoring related props
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

    // Removed handleScoreClick

    const titleText = `Paragraph ${displayedIndex + 1}`; // Simplified title

    const paragraphContent = (
        <div
            onClick={() => onSelect(displayedIndex)}
            className={cn(
                'relative group p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border',
                'text-xs leading-relaxed',
                isSelected
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner'
                    : 'bg-card hover:bg-secondary/60',
                 'border-border', // Simplified border
                 isHebrew ? 'rtl text-right' : 'ltr text-left',
                 className
            )}
            data-original-index={originalIndex}
            data-displayed-index={displayedIndex}
            title={titleText}
        >
            {/* Controls Container (top-right or top-left) */}
             <div className={cn(
                 "absolute top-1 flex items-center space-x-1",
                 isHebrew ? "left-1" : "right-1"
             )}>
                {/* Removed Score Display/Button */}

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
                <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
            ) : (
                <span className="text-muted-foreground italic">Empty paragraph</span>
            )}
        </div>
    );

     if (isHebrew && (onMergeUp || onMergeDown)) {
         return (
             <TooltipProvider delayDuration={100}>
                 <ContextMenu>
                     <ContextMenuTrigger>{paragraphContent}</ContextMenuTrigger>
                     <ContextMenuContent>
                         {onMergeUp && (
                             <ContextMenuItem onClick={handleMergeUpClick} > {/* Removed scoring disable */}
                                 <Merge className="mr-2 h-4 w-4 transform rotate-180" />
                                 Merge Up
                             </ContextMenuItem>
                         )}
                         {onMergeDown && (
                             <ContextMenuItem onClick={handleMergeDownClick} > {/* Removed scoring disable */}
                                 <Merge className="mr-2 h-4 w-4" />
                                 Merge Down
                             </ContextMenuItem>
                         )}
                     </ContextMenuContent>
                 </ContextMenu>
             </TooltipProvider>
         );
     }

     return (
         <TooltipProvider delayDuration={100}>
             {paragraphContent}
         </TooltipProvider>
     );
};

export default ParagraphBox;
