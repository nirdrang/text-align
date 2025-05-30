"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Check, Link2Off } from 'lucide-react'; // Removed BrainCircuit, Loader2
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InlineAlignmentControlsProps {
  onConfirmPair: () => void;
  onConfirmAllPairsUpwards?: () => void;
  onUnlink: () => void;
  // Removed onSuggest prop
  canConfirmPair: boolean;
  canUnlink: boolean;
  // Removed isSuggesting and hasSuggestions props
  disabled?: boolean;
}

const InlineAlignmentControls: React.FC<InlineAlignmentControlsProps> = ({
  onConfirmPair,
  onConfirmAllPairsUpwards,
  onUnlink,
  canConfirmPair,
  canUnlink,
  // Removed isSuggesting, hasSuggestions
  disabled = false,
}) => {
  return (
    <TooltipProvider delayDuration={100}>
        <div className={cn("flex items-center space-x-2", disabled && "opacity-50 cursor-not-allowed")}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onConfirmAllPairsUpwards}
                        disabled={!canConfirmPair || disabled || !onConfirmAllPairsUpwards}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 relative"
                        aria-label="Confirm all pairs upwards"
                    >
                        <Check className="h-4 w-4" />
                        <span
                            style={{ position: 'absolute', top: '2px', right: '2px', fontSize: '0.7em', color: '#fbbf24', pointerEvents: 'none' }}
                            aria-hidden="true"
                        >
                            *
                        </span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Confirm All Pairs Upwards</p>
                </TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        onClick={onConfirmPair}
                        disabled={!canConfirmPair || disabled}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                        aria-label="Confirm selected pair"
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Confirm Selected Pair</p>
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
                        aria-label="Unlink selected paragraphs (Disabled)"
                    >
                        <Link2Off className="h-4 w-4" />
                    </Button>
                 </TooltipTrigger>
                <TooltipContent>
                    <p>Unlink Selected Paragraph (May be disabled)</p>
                </TooltipContent>
             </Tooltip>

             {/* Removed Suggest Button */}
        </div>
    </TooltipProvider>
  );
};

export default InlineAlignmentControls;
