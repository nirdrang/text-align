"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Link2, Link2Off, BrainCircuit, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InlineAlignmentControlsProps {
  onLink: () => void;
  onUnlink: () => void;
  onSuggest: () => void;
  canLink: boolean;
  canUnlink: boolean;
  isSuggesting: boolean;
  hasSuggestions: boolean;
  disabled?: boolean;
}

const InlineAlignmentControls: React.FC<InlineAlignmentControlsProps> = ({
  onLink,
  onUnlink,
  onSuggest,
  canLink,
  canUnlink,
  isSuggesting,
  hasSuggestions,
  disabled = false,
}) => {
  return (
    <TooltipProvider delayDuration={100}>
        <div className={cn("flex items-center space-x-2", disabled && "opacity-50 cursor-not-allowed")}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onLink}
                        disabled={!canLink || disabled}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-accent-foreground hover:bg-accent"
                        aria-label="Link selected paragraphs"
                    >
                        <Link2 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Link Selected Paragraphs</p>
                </TooltipContent>
            </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onUnlink}
                        disabled={!canUnlink || disabled}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label="Unlink selected paragraphs"
                    >
                        <Link2Off className="h-4 w-4" />
                    </Button>
                 </TooltipTrigger>
                <TooltipContent>
                    <p>Unlink Selected Paragraph</p>
                </TooltipContent>
             </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onSuggest}
                        disabled={isSuggesting || disabled}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        aria-label={hasSuggestions ? "Suggest Alignments Again" : "Suggest Alignments"}
                    >
                        {isSuggesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                        <BrainCircuit className="h-4 w-4" />
                        )}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{isSuggesting ? 'Suggesting...' : (hasSuggestions ? 'Re-Suggest Alignments' : 'Suggest Alignments with AI')}</p>
                </TooltipContent>
             </Tooltip>
        </div>
    </TooltipProvider>
  );
};

export default InlineAlignmentControls;
