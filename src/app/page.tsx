'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import TextAreaPanel from '@/components/text-area-panel';
import AlignmentControls from '@/components/alignment-controls';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, DownloadCloud } from 'lucide-react';
import { suggestParagraphAlignment } from '@/ai/flows/suggest-paragraph-alignment';
import { fetchTextFromUrl } from '@/actions/fetch-text'; // Import the server action
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
  const [englishUrl, setEnglishUrl] = useState('');
  const [hebrewUrl, setHebrewUrl] = useState('');
  const [englishText, setEnglishText] = useState<string | null>(null);
  const [hebrewText, setHebrewText] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const [selectedEnglishIndex, setSelectedEnglishIndex] = useState<number | null>(null);
  const [selectedHebrewIndex, setSelectedHebrewIndex] = useState<number | null>(null);
  const [manualAlignments, setManualAlignments] = useState<ManualAlignment[]>([]);
  const [suggestedAlignments, setSuggestedAlignments] = useState<SuggestedAlignment[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number | null>(null);
  const [highlightedSuggestionTargetIndex, setHighlightedSuggestionTargetIndex] = useState<number | null>(null);

  const { toast } = useToast();

  // Split text into paragraphs based on double line breaks
  const englishParagraphs = useMemo(() => englishText?.split(/\n\s*\n/).filter(p => p.trim().length > 0) ?? [], [englishText]);
  const hebrewParagraphs = useMemo(() => hebrewText?.split(/\n\s*\n/).filter(p => p.trim().length > 0) ?? [], [hebrewText]);

  const textsAreLoaded = englishText !== null && hebrewText !== null;

  // --- Text Fetching Logic ---
  const handleFetchTexts = useCallback(async () => {
    if (!englishUrl.trim() || !hebrewUrl.trim()) {
      toast({ title: "Missing URLs", description: "Please provide both English and Hebrew URLs.", variant: "destructive" });
      return;
    }
    setIsFetching(true);
    setEnglishText(null);
    setHebrewText(null);
    setManualAlignments([]);
    setSuggestedAlignments(null);
    setSelectedEnglishIndex(null);
    setSelectedHebrewIndex(null);
    setHighlightedSuggestionIndex(null);
    setHighlightedSuggestionTargetIndex(null);

    try {
      const [englishResult, hebrewResult] = await Promise.all([
        fetchTextFromUrl(englishUrl),
        fetchTextFromUrl(hebrewUrl),
      ]);

      let hasError = false;
      if (englishResult.error || !englishResult.text) {
        toast({ title: "Fetch Error (English)", description: englishResult.error || "Could not fetch or parse English text.", variant: "destructive" });
        hasError = true;
      } else {
        setEnglishText(englishResult.text);
      }

      if (hebrewResult.error || !hebrewResult.text) {
        toast({ title: "Fetch Error (Hebrew)", description: hebrewResult.error || "Could not fetch or parse Hebrew text.", variant: "destructive" });
        hasError = true;
      } else {
        setHebrewText(hebrewResult.text);
      }

      if (!hasError) {
          toast({ title: "Texts Fetched", description: "English and Hebrew texts loaded successfully." });
      }

    } catch (error) {
      console.error("Error fetching texts:", error);
      toast({ title: "Fetch Error", description: "An unexpected error occurred while fetching texts.", variant: "destructive" });
      setEnglishText(null); // Ensure text state is reset on error
      setHebrewText(null);
    } finally {
      setIsFetching(false);
    }
  }, [englishUrl, hebrewUrl, toast]);


  // --- Manual Linking Logic ---

  const canLink = useMemo(() => {
    if (selectedEnglishIndex === null || selectedHebrewIndex === null) return false;
    // Cannot link if either paragraph is already linked
    const isEnglishLinked = manualAlignments.some(link => link.englishIndex === selectedEnglishIndex);
    const isHebrewLinked = manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex);
    return !isEnglishLinked && !isHebrewLinked;
  }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments]);

  const handleLink = useCallback(() => {
    if (canLink && selectedEnglishIndex !== null && selectedHebrewIndex !== null) {
      setManualAlignments(prev => [...prev, { englishIndex: selectedEnglishIndex, hebrewIndex: selectedHebrewIndex }]);
      // Deselect after linking
      setSelectedEnglishIndex(null);
      setSelectedHebrewIndex(null);
       toast({ title: "Paragraphs Linked", description: `English paragraph ${selectedEnglishIndex + 1} linked to Hebrew paragraph ${selectedHebrewIndex + 1}.` });
    }
  }, [canLink, selectedEnglishIndex, selectedHebrewIndex, toast]);

  const canUnlink = useMemo(() => {
    if (selectedEnglishIndex !== null) {
       return manualAlignments.some(link => link.englishIndex === selectedEnglishIndex);
    }
     if (selectedHebrewIndex !== null) {
         return manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex);
     }
    return false;
  }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments]);


  const handleUnlink = useCallback(() => {
    let unlinked = false;
     let engIdx = -1;
     let hebIdx = -1;

     if (selectedEnglishIndex !== null) {
        const link = manualAlignments.find(l => l.englishIndex === selectedEnglishIndex);
        if (link) {
            engIdx = link.englishIndex;
            hebIdx = link.hebrewIndex;
            setManualAlignments(prev => prev.filter(l => l.englishIndex !== selectedEnglishIndex));
            unlinked = true;
        }
     } else if (selectedHebrewIndex !== null) {
        const link = manualAlignments.find(l => l.hebrewIndex === selectedHebrewIndex);
        if (link) {
            engIdx = link.englishIndex;
            hebIdx = link.hebrewIndex;
            setManualAlignments(prev => prev.filter(l => l.hebrewIndex !== selectedHebrewIndex));
            unlinked = true;
        }
     }

    if (unlinked) {
        // Deselect after unlinking
        setSelectedEnglishIndex(null);
        setSelectedHebrewIndex(null);
        toast({ title: "Link Removed", description: `Link between English paragraph ${engIdx + 1} and Hebrew paragraph ${hebIdx + 1} removed.`, variant: "destructive" });
    }

  }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments, toast]);


  // --- AI Suggestion Logic ---

  const handleSuggest = useCallback(async () => {
    if (!englishText || !hebrewText) {
        toast({ title: "Missing Text", description: "Fetch English and Hebrew text first.", variant: "destructive" });
        return;
    }
    setIsSuggesting(true);
    setSuggestedAlignments(null); // Clear previous suggestions
    setHighlightedSuggestionIndex(null);
    setHighlightedSuggestionTargetIndex(null);

    try {
      const suggestions = await suggestParagraphAlignment({ englishText, hebrewText });
      // Filter suggestions to only include valid paragraph indices
       const validSuggestions = suggestions.filter(s =>
            s.englishParagraphIndex >= 0 && s.englishParagraphIndex < englishParagraphs.length &&
            s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < hebrewParagraphs.length
       );
      setSuggestedAlignments(validSuggestions);
      toast({ title: "Suggestions Ready", description: `${validSuggestions.length} alignment suggestions generated.` });
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      toast({ title: "Suggestion Error", description: "Could not generate suggestions. Please try again.", variant: "destructive" });
       setSuggestedAlignments([]); // Set empty array on error
    } finally {
      setIsSuggesting(false);
    }
  }, [englishText, hebrewText, toast, englishParagraphs.length, hebrewParagraphs.length]);

  // --- Paragraph Selection and Highlighting ---

   const handleParagraphSelect = useCallback((index: number, language: 'english' | 'hebrew') => {
        if (language === 'english') {
            setSelectedEnglishIndex(prev => prev === index ? null : index);
            setSelectedHebrewIndex(null); // Deselect other language
             setHighlightedSuggestionIndex(null); // Clear suggestion highlight on manual selection
             setHighlightedSuggestionTargetIndex(null);
        } else {
            setSelectedHebrewIndex(prev => prev === index ? null : index);
            setSelectedEnglishIndex(null); // Deselect other language
             setHighlightedSuggestionIndex(null); // Clear suggestion highlight on manual selection
             setHighlightedSuggestionTargetIndex(null);
        }
    }, []);


    // Highlight suggested pairs on hover (using useEffect for event listeners)
    useEffect(() => {
        const handleMouseEnter = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const paragraphDiv = target.closest('[data-paragraph-index]') as HTMLElement | null;

            if (paragraphDiv && suggestedAlignments) {
                const index = parseInt(paragraphDiv.dataset.paragraphIndex || '-1', 10);
                const isEnglish = paragraphDiv.closest('.english-panel') !== null; // Check panel context

                if (index !== -1) {
                    const suggestion = suggestedAlignments.find(s =>
                        isEnglish ? s.englishParagraphIndex === index : s.hebrewParagraphIndex === index
                    );

                    if (suggestion) {
                        setHighlightedSuggestionIndex(suggestion.englishParagraphIndex);
                        setHighlightedSuggestionTargetIndex(suggestion.hebrewParagraphIndex);
                    } else {
                        // If hovering over a non-suggested paragraph, clear highlights
                        setHighlightedSuggestionIndex(null);
                        setHighlightedSuggestionTargetIndex(null);
                    }
                }
            }
        };

        const handleMouseLeave = (event: MouseEvent) => {
             const target = event.target as HTMLElement;
             const paragraphDiv = target.closest('[data-paragraph-index]') as HTMLElement | null;
             // Only clear if leaving a paragraph element, prevents clearing when moving mouse within the paragraph
             if(paragraphDiv){
                setHighlightedSuggestionIndex(null);
                setHighlightedSuggestionTargetIndex(null);
             }
        };

        // Only attach listeners if texts are loaded
        if (textsAreLoaded) {
          const panels = document.querySelectorAll('.english-panel, .hebrew-panel');
          panels.forEach(panel => {
              panel.addEventListener('mouseover', handleMouseEnter);
              panel.addEventListener('mouseout', handleMouseLeave);
          });

          return () => {
              panels.forEach(panel => {
                  panel.removeEventListener('mouseover', handleMouseEnter);
                  panel.removeEventListener('mouseout', handleMouseLeave);
              });
          };
        }
    }, [suggestedAlignments, textsAreLoaded]); // Re-run effect if suggestions or texts change

  return (
    <div className="flex flex-col h-screen p-4 bg-background">
       <header className="mb-4">
            <h1 className="text-2xl font-bold text-center text-foreground">Text Aligner</h1>
            <p className="text-center text-muted-foreground">Align English and Hebrew paragraphs from URLs or pasted text.</p>
       </header>

       {/* URL Input Section */}
       <Card className="mb-4 shadow-md">
        <CardHeader>
          <CardTitle>Load Texts from URLs</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <Label htmlFor="english-url">English URL</Label>
            <Input
              id="english-url"
              type="url"
              placeholder="https://example.com/english-text"
              value={englishUrl}
              onChange={(e) => setEnglishUrl(e.target.value)}
              disabled={isFetching}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hebrew-url">Hebrew URL</Label>
            <Input
              id="hebrew-url"
              type="url"
              placeholder="https://example.com/hebrew-text"
              value={hebrewUrl}
              onChange={(e) => setHebrewUrl(e.target.value)}
              disabled={isFetching}
              dir="rtl" // Set direction for Hebrew input
            />
          </div>
          <Button
            onClick={handleFetchTexts}
            disabled={isFetching || !englishUrl.trim() || !hebrewUrl.trim()}
            className="w-full md:w-auto"
          >
            {isFetching ? (
              <Loader2 className="mr-2 animate-spin" />
            ) : (
              <DownloadCloud className="mr-2" />
            )}
            {isFetching ? 'Fetching...' : 'Fetch Texts'}
          </Button>
        </CardContent>
       </Card>

      {/* Alignment Section */}
      <div className="flex flex-grow gap-4 min-h-0">
        {/* English Panel */}
        <div className="w-5/12 english-panel">
          <TextAreaPanel
            title="English"
            text={englishText ?? ''} // Provide empty string if null
            paragraphs={englishParagraphs}
            onTextChange={() => {}} // Textarea is now read-only effectively
            readOnly={true} // Make textarea read-only
            showTextarea={textsAreLoaded} // Only show textarea if text is loaded
            isLoading={isFetching}
            selectedIndex={selectedEnglishIndex}
            onParagraphSelect={(index) => handleParagraphSelect(index, 'english')}
            manualAlignments={manualAlignments}
            alignmentKey="englishIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="englishParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionIndex}
            linkedHighlightIndex={highlightedSuggestionTargetIndex}
          />
        </div>

        {/* Controls Panel */}
        <div className="w-2/12 flex items-center justify-center">
          <Card className="h-fit shadow-md">
              <AlignmentControls
                onLink={handleLink}
                onUnlink={handleUnlink}
                onSuggest={handleSuggest}
                canLink={canLink}
                canUnlink={canUnlink}
                isSuggesting={isSuggesting}
                hasSuggestions={suggestedAlignments !== null}
                disabled={!textsAreLoaded || isFetching} // Disable controls if not loaded or fetching
              />
          </Card>
        </div>

        {/* Hebrew Panel */}
         <div className="w-5/12 hebrew-panel">
          <TextAreaPanel
            title="Hebrew"
            text={hebrewText ?? ''} // Provide empty string if null
            paragraphs={hebrewParagraphs}
            onTextChange={() => {}} // Textarea is now read-only effectively
            readOnly={true} // Make textarea read-only
            showTextarea={textsAreLoaded} // Only show textarea if text is loaded
            isLoading={isFetching}
            selectedIndex={selectedHebrewIndex}
            onParagraphSelect={(index) => handleParagraphSelect(index, 'hebrew')}
            manualAlignments={manualAlignments}
            alignmentKey="hebrewIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="hebrewParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionTargetIndex}
            linkedHighlightIndex={highlightedSuggestionIndex}
          />
        </div>
      </div>
    </div>
  );
}
