"use client";

import React from 'react';
import { cn } from '@/lib/utils';

interface ParagraphBoxProps {
    index: number;
    paragraph: string;
    isSelected: boolean;
    isManuallyAligned: boolean;
    isSuggested: boolean;
    isHighlightedSuggestion: boolean;
    highlightStyle: React.CSSProperties;
    isHebrew: boolean;
    onSelect: (index: number) => void;
    linkedPartnerIndex: number | null;
    suggestionPartnerIndex: number | null;
    suggestionConfidence: number | null;
}

const ParagraphBox: React.FC<ParagraphBoxProps> = ({
    index,
    paragraph,
    isSelected,
    isManuallyAligned,
    isSuggested,
    isHighlightedSuggestion,
    highlightStyle,
    isHebrew,
    onSelect,
    linkedPartnerIndex,
    suggestionPartnerIndex,
    suggestionConfidence,
}) => {
    return (
        <div
            onClick={() => onSelect(index)}
            className={cn(
                'p-3 rounded-md cursor-pointer transition-all duration-150 ease-in-out border', // Base styles
                'text-xs leading-relaxed', // Reduced font size to text-xs
                isSelected
                    ? 'ring-2 ring-primary ring-offset-2 bg-primary/10 shadow-inner' // Selected style
                    : 'bg-card hover:bg-secondary/60', // Default and hover style
                isManuallyAligned
                    ? 'border-accent border-dashed' // Manual alignment border
                    : isSuggested
                    ? 'border-primary/30 border-dotted' // Suggested alignment border
                    : 'border-border', // Default border
                 isHighlightedSuggestion && 'shadow-md', // Add subtle shadow on hover highlight
                isHebrew ? 'rtl text-right' : 'ltr text-left' // Directionality
            )}
            style={isHighlightedSuggestion ? highlightStyle : {}} // Apply background highlight on hover
            data-paragraph-index={index}
            {...(isManuallyAligned && { 'data-linked-to': linkedPartnerIndex })}
            {...(isSuggested && {
                'data-suggested-link': suggestionPartnerIndex,
                'data-confidence': suggestionConfidence,
            })}
            title={isManuallyAligned ? `Linked to paragraph ${linkedPartnerIndex! + 1}` : isSuggested ? `Suggested link to paragraph ${suggestionPartnerIndex! + 1} (Confidence: ${suggestionConfidence?.toFixed(2)})` : `Paragraph ${index + 1}`}
        >
            {/* Render potential <br> tags from single newlines */}
            {paragraph ? (
                <span dangerouslySetInnerHTML={{ __html: paragraph.replace(/\n/g, '<br />') }} />
            ) : (
                <span className="text-muted-foreground italic">Empty paragraph</span>
            )}
        </div>
    );
};

export default ParagraphBox;
