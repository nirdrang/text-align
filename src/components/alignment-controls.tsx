"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Link2, Link2Off, BrainCircuit, Loader2 } from 'lucide-react'; // Using BrainCircuit for AI

interface AlignmentControlsProps {
  onLink: () => void;
  onUnlink: () => void;
  onSuggest: () => void;
  canLink: boolean;
  canUnlink: boolean;
  isSuggesting: boolean;
  hasSuggestions: boolean;
}

const AlignmentControls: React.FC<AlignmentControlsProps> = ({
  onLink,
  onUnlink,
  onSuggest,
  canLink,
  canUnlink,
  isSuggesting,
  hasSuggestions,
}) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-4 h-full">
       <h3 className="text-lg font-semibold mb-4 text-center">Alignment Tools</h3>
      <Button
        onClick={onLink}
        disabled={!canLink}
        variant="outline"
        className="w-full justify-start transition-colors duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed group hover:bg-accent hover:text-accent-foreground"
        aria-label="Link selected paragraphs"
      >
        <Link2 className="mr-2 group-hover:text-accent-foreground transition-colors duration-200 ease-in-out" />
        Link Selected
      </Button>
      <Button
        onClick={onUnlink}
        disabled={!canUnlink}
        variant="outline"
        className="w-full justify-start transition-colors duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed group hover:bg-destructive/10 hover:text-destructive"
        aria-label="Unlink selected paragraphs"
      >
        <Link2Off className="mr-2 group-hover:text-destructive transition-colors duration-200 ease-in-out" />
        Unlink Selected
      </Button>
      <Button
        onClick={onSuggest}
        disabled={isSuggesting}
        variant="outline"
        className="w-full justify-start transition-colors duration-200 ease-in-out group hover:bg-primary/10 hover:text-primary"
        aria-label={hasSuggestions ? "Suggest Alignments Again" : "Suggest Alignments"}
      >
        {isSuggesting ? (
          <Loader2 className="mr-2 animate-spin" />
        ) : (
          <BrainCircuit className="mr-2 group-hover:text-primary transition-colors duration-200 ease-in-out" />
        )}
        {isSuggesting ? 'Suggesting...' : (hasSuggestions ? 'Re-Suggest' : 'AI Suggest')}
      </Button>
    </div>
  );
};

export default AlignmentControls;
