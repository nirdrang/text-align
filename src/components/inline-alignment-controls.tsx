
"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, Link2Off, BrainCircuit, Loader2 } from 'lucide-react'; // Changed Link2 to Check
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InlineAlignmentControlsProps {
  onConfirmPair: () => void; // Renamed from onLink
  onUnlink: () => void;
  onSuggest: () => void;
  canConfirmPair: boolean; // Renamed from canLink
  canUnlink: boolean;
  isSuggesting: boolean;
  hasSuggestions: boolean;
  disabled?: boolean;
}

const InlineAlignmentControls: React.FC<InlineAlignmentControlsProps> = ({
  onConfirmPair, // Renamed prop
  onUnlink,
  onSuggest,
  canConfirmPair, // Renamed prop
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
                        onClick={onConfirmPair} // Use renamed handler
                        disabled={!canConfirmPair || disabled} // Use renamed state variable
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" // Changed hover color to primary
                        aria-label="Confirm selected pair" // Updated label
                    >
                        <Check className="h-4 w-4" /> {/* Changed icon */}
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Confirm Selected Pair</p> {/* Updated tooltip */}
                </TooltipContent>
            </Tooltip>

             <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onUnlink}
                        disabled={!canUnlink || disabled} // Keep unlink logic for now, might be removed
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        aria-label="Unlink selected paragraphs (Disabled)" // Indicate it might be disabled/removed
                    >
                        <Link2Off className="h-4 w-4" />
                    </Button>
                 </TooltipTrigger>
                <TooltipContent>
                    {/* Updated tooltip to reflect potential disabling */}
                    <p>Unlink Selected Paragraph (May be disabled)</p>
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
