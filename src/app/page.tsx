'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import TextAreaPanel from '@/components/text-area-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, DownloadCloud } from 'lucide-react';
import { suggestParagraphAlignment } from '@/ai/flows/suggest-paragraph-alignment';
import { fetchTextFromUrl } from '@/actions/fetch-text'; // Import the server action
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
import { useToast } from '@/hooks/use-toast';

const ENGLISH_URL_STORAGE_KEY = 'text-aligner-english-url';
const HEBREW_URL_STORAGE_KEY = 'text-aligner-hebrew-url';

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

  // Refs for panel containers to attach listeners
  const englishPanelRef = useRef<HTMLDivElement>(null);
  const hebrewPanelRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  // --- Load URLs from localStorage on mount ---
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedEnglishUrl = localStorage.getItem(ENGLISH_URL_STORAGE_KEY);
      const savedHebrewUrl = localStorage.getItem(HEBREW_URL_STORAGE_KEY);
      if (savedEnglishUrl) {
        console.log('[Page] Loaded English URL from localStorage:', savedEnglishUrl);
        setEnglishUrl(savedEnglishUrl);
      }
      if (savedHebrewUrl) {
        console.log('[Page] Loaded Hebrew URL from localStorage:', savedHebrewUrl);
        setHebrewUrl(savedHebrewUrl);
      }
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Handlers to update state and save to localStorage
  const handleEnglishUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setEnglishUrl(newUrl);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(ENGLISH_URL_STORAGE_KEY, newUrl);
      console.log('[Page] Saved English URL to localStorage:', newUrl);
    }
  };

  const handleHebrewUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setHebrewUrl(newUrl);
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(HEBREW_URL_STORAGE_KEY, newUrl);
      console.log('[Page] Saved Hebrew URL to localStorage:', newUrl);
    }
  };


  // Split text into paragraphs based on double line breaks
  const englishParagraphs = useMemo(() => {
      const paragraphs = englishText?.split(/\n\s*\n/).filter(p => p.trim().length > 0) ?? [];
      console.log(`[Page] Generated ${paragraphs.length} English paragraphs.`);
      return paragraphs;
  }, [englishText]);
  const hebrewParagraphs = useMemo(() => {
       const paragraphs = hebrewText?.split(/\n\s*\n/).filter(p => p.trim().length > 0) ?? [];
       console.log(`[Page] Generated ${paragraphs.length} Hebrew paragraphs.`);
       return paragraphs;
  }, [hebrewText]);

  const textsAreLoaded = englishText !== null && hebrewText !== null;
  const controlsDisabled = !textsAreLoaded || isFetching || isSuggesting;

  // --- Text Fetching Logic ---
  const handleFetchTexts = useCallback(async () => {
    console.log('[Page] handleFetchTexts triggered.');
    if (!englishUrl.trim() || !hebrewUrl.trim()) {
      console.log('[Page] Missing URLs.');
      toast({ title: "Missing URLs", description: "Please provide both English and Hebrew URLs.", variant: "destructive" });
      return;
    }
    console.log('[Page] Starting text fetch...');
    setIsFetching(true);
    setEnglishText(null); // Reset state immediately
    setHebrewText(null);
    setManualAlignments([]);
    setSuggestedAlignments(null);
    setSelectedEnglishIndex(null);
    setSelectedHebrewIndex(null);
    setHighlightedSuggestionIndex(null);
    setHighlightedSuggestionTargetIndex(null);

    try {
      console.log(`[Page] Fetching English URL: ${englishUrl}`);
      console.log(`[Page] Fetching Hebrew URL: ${hebrewUrl}`);
      const [englishResult, hebrewResult] = await Promise.all([
        fetchTextFromUrl(englishUrl),
        fetchTextFromUrl(hebrewUrl),
      ]);
      console.log('[Page] Fetches completed.');
      console.log('[Page] English Result:', englishResult);
      console.log('[Page] Hebrew Result:', hebrewResult);


      let hasError = false;
      if (englishResult.error || !englishResult.text) {
        const errorMsg = englishResult.error || "Could not fetch or parse English text.";
        console.error(`[Page] Fetch Error (English): ${errorMsg}`);
        toast({ title: "Fetch Error (English)", description: errorMsg, variant: "destructive" });
        setEnglishText(''); // Set to empty string on error to indicate load attempt failed but allow UI to render
        hasError = true;
      } else {
        console.log(`[Page] Setting English text (length: ${englishResult.text.length})`);
        setEnglishText(englishResult.text);
      }

      if (hebrewResult.error || !hebrewResult.text) {
         const errorMsg = hebrewResult.error || "Could not fetch or parse Hebrew text.";
        console.error(`[Page] Fetch Error (Hebrew): ${errorMsg}`);
        toast({ title: "Fetch Error (Hebrew)", description: errorMsg, variant: "destructive" });
         setHebrewText(''); // Set to empty string on error
        hasError = true;
      } else {
         console.log(`[Page] Setting Hebrew text (length: ${hebrewResult.text.length})`);
        setHebrewText(hebrewResult.text);
      }

      if (!hasError) {
          console.log('[Page] Texts fetched successfully.');
          toast({ title: "Texts Fetched", description: "English and Hebrew texts loaded successfully." });
      } else {
          console.warn('[Page] One or both text fetches failed.');
      }

    } catch (error: any) {
      console.error("[Page] Unexpected error in handleFetchTexts:", error);
      toast({ title: "Fetch Error", description: `An unexpected error occurred: ${error.message || 'Unknown error'}`, variant: "destructive" });
      setEnglishText(''); // Ensure text state is reset on unexpected error
      setHebrewText('');
    } finally {
      console.log('[Page] Fetching process finished.');
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
      const newAlignment: ManualAlignment = { englishIndex: selectedEnglishIndex, hebrewIndex: selectedHebrewIndex };
       console.log('[Page] Linking paragraphs:', newAlignment);
      setManualAlignments(prev => [...prev, newAlignment]);
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
     let alignmentToRemove: ManualAlignment | undefined;

     if (selectedEnglishIndex !== null) {
        alignmentToRemove = manualAlignments.find(l => l.englishIndex === selectedEnglishIndex);
        if (alignmentToRemove) {
            engIdx = alignmentToRemove.englishIndex;
            hebIdx = alignmentToRemove.hebrewIndex;
            setManualAlignments(prev => prev.filter(l => l.englishIndex !== selectedEnglishIndex));
            unlinked = true;
        }
     } else if (selectedHebrewIndex !== null) {
         alignmentToRemove = manualAlignments.find(l => l.hebrewIndex === selectedHebrewIndex);
        if (alignmentToRemove) {
            engIdx = alignmentToRemove.englishIndex;
            hebIdx = alignmentToRemove.hebrewIndex;
            setManualAlignments(prev => prev.filter(l => l.hebrewIndex !== selectedHebrewIndex));
            unlinked = true;
        }
     }

    if (unlinked && alignmentToRemove) {
        console.log('[Page] Unlinking paragraphs:', alignmentToRemove);
        // Deselect after unlinking
        setSelectedEnglishIndex(null);
        setSelectedHebrewIndex(null);
        toast({ title: "Link Removed", description: `Link between English paragraph ${engIdx + 1} and Hebrew paragraph ${hebIdx + 1} removed.`, variant: "destructive" });
    }

  }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments, toast]);


  // --- AI Suggestion Logic ---

  const handleSuggest = useCallback(async () => {
    console.log('[Page] handleSuggest triggered.');
    if (!englishText || !hebrewText) {
        console.log('[Page] Suggestion attempted without text loaded.');
        toast({ title: "Missing Text", description: "Fetch English and Hebrew text first.", variant: "destructive" });
        return;
    }
     console.log('[Page] Starting AI suggestion...');
    setIsSuggesting(true);
    setSuggestedAlignments(null); // Clear previous suggestions
    setHighlightedSuggestionIndex(null);
    setHighlightedSuggestionTargetIndex(null);

    try {
       console.log('[Page] Calling suggestParagraphAlignment flow...');
      const suggestions = await suggestParagraphAlignment({ englishText, hebrewText });
       console.log('[Page] Received suggestions from AI:', suggestions);
      // Filter suggestions to only include valid paragraph indices
       const validSuggestions = suggestions.filter(s =>
            s.englishParagraphIndex >= 0 && s.englishParagraphIndex < englishParagraphs.length &&
            s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < hebrewParagraphs.length
       );
        if (validSuggestions.length !== suggestions.length) {
            console.warn(`[Page] Filtered out ${suggestions.length - validSuggestions.length} invalid suggestions (out of bounds indices).`);
        }
      console.log(`[Page] Setting ${validSuggestions.length} valid suggestions.`);
      setSuggestedAlignments(validSuggestions);
      toast({ title: "Suggestions Ready", description: `${validSuggestions.length} alignment suggestions generated.` });
    } catch (error) {
      console.error("[Page] Error fetching suggestions:", error);
      toast({ title: "Suggestion Error", description: "Could not generate suggestions. Please try again.", variant: "destructive" });
       setSuggestedAlignments([]); // Set empty array on error
    } finally {
       console.log('[Page] Suggestion process finished.');
      setIsSuggesting(false);
    }
  }, [englishText, hebrewText, toast, englishParagraphs.length, hebrewParagraphs.length]);

  // --- Paragraph Selection and Highlighting ---

   const handleParagraphSelect = useCallback((index: number, language: 'english' | 'hebrew') => {
        console.log(`[Page] Paragraph selected - Index: ${index}, Language: ${language}`);
        if (language === 'english') {
            setSelectedEnglishIndex(prev => (prev === index ? null : index));
            setSelectedHebrewIndex(null); // Deselect other language
        } else {
            setSelectedHebrewIndex(prev => (prev === index ? null : index));
            setSelectedEnglishIndex(null); // Deselect other language
        }
         // Reset highlights on manual selection to avoid sticky highlights
         setHighlightedSuggestionIndex(null);
         setHighlightedSuggestionTargetIndex(null);
    }, []);


    // Highlight suggested pairs on hover (using useEffect for event listeners on refs)
    useEffect(() => {
        const englishPanel = englishPanelRef.current;
        const hebrewPanel = hebrewPanelRef.current;
        let currentHighlightEng: number | null = null;
        let currentHighlightHeb: number | null = null;

        const handlePointerMove = (event: PointerEvent) => { // Use PointerEvent for better touch/mouse handling
            if (!suggestedAlignments || isFetching || isSuggesting) return;

            const target = event.target as HTMLElement;
            const paragraphDiv = target.closest('[data-paragraph-index]') as HTMLElement | null;

            let newHighlightEng: number | null = null;
            let newHighlightHeb: number | null = null;

            if (paragraphDiv) {
                const index = parseInt(paragraphDiv.dataset.paragraphIndex || '-1', 10);
                const isEnglish = englishPanel?.contains(paragraphDiv); // Check if the paragraph is within the English panel

                if (index !== -1) {
                    const suggestion = suggestedAlignments.find(s =>
                        isEnglish ? s.englishParagraphIndex === index : s.hebrewParagraphIndex === index
                    );

                    if (suggestion) {
                        newHighlightEng = suggestion.englishParagraphIndex;
                        newHighlightHeb = suggestion.hebrewParagraphIndex;
                    }
                }
            }

            // Update state only if the highlight changes to avoid unnecessary re-renders
            if (newHighlightEng !== currentHighlightEng || newHighlightHeb !== currentHighlightHeb) {
                 // console.log(`[Page] Highlighting pair: Eng ${newHighlightEng}, Heb ${newHighlightHeb}`);
                 setHighlightedSuggestionIndex(newHighlightEng);
                 setHighlightedSuggestionTargetIndex(newHighlightHeb);
                 currentHighlightEng = newHighlightEng;
                 currentHighlightHeb = newHighlightHeb;
            }
        };

        const handlePointerLeave = () => {
            // Clear highlights only if they are currently set
            if (currentHighlightEng !== null || currentHighlightHeb !== null) {
                 // console.log('[Page] Clearing highlights on pointer leave.');
                 setHighlightedSuggestionIndex(null);
                 setHighlightedSuggestionTargetIndex(null);
                 currentHighlightEng = null;
                 currentHighlightHeb = null;
             }
        };

        if (textsAreLoaded && englishPanel && hebrewPanel) {
          // Use pointermove for smoother updates and pointerleave for leaving the panel area
          englishPanel.addEventListener('pointermove', handlePointerMove);
          hebrewPanel.addEventListener('pointermove', handlePointerMove);
          englishPanel.addEventListener('pointerleave', handlePointerLeave);
          hebrewPanel.addEventListener('pointerleave', handlePointerLeave);
           console.log('[Page] Attached pointer event listeners for highlighting.');

          return () => {
              englishPanel.removeEventListener('pointermove', handlePointerMove);
              hebrewPanel.removeEventListener('pointermove', handlePointerMove);
              englishPanel.removeEventListener('pointerleave', handlePointerLeave);
              hebrewPanel.removeEventListener('pointerleave', handlePointerLeave);
               console.log('[Page] Removed pointer event listeners.');
          };
        }
    }, [suggestedAlignments, textsAreLoaded, isFetching, isSuggesting]);

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
              onChange={handleEnglishUrlChange} // Use the new handler
              disabled={isFetching || isSuggesting}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hebrew-url">Hebrew URL</Label>
            <Input
              id="hebrew-url"
              type="url"
              placeholder="https://example.com/hebrew-text"
              value={hebrewUrl}
              onChange={handleHebrewUrlChange} // Use the new handler
              disabled={isFetching || isSuggesting}
              dir="rtl" // Set direction for Hebrew input
            />
          </div>
          <Button
            onClick={handleFetchTexts}
            disabled={isFetching || isSuggesting || !englishUrl.trim() || !hebrewUrl.trim()}
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
        <div ref={englishPanelRef} className="w-1/2 english-panel flex flex-col"> {/* Added flex flex-col */}
          <TextAreaPanel
            title="English"
            text={englishText} // Pass null or string
            paragraphs={englishParagraphs}
            onTextChange={() => {}} // Textarea is read-only
            readOnly={true}
            showTextarea={englishText !== null} // Show if attempted load (null means not attempted, '' means error/empty)
            isLoading={isFetching && englishText === null} // Loading only if fetching AND text is still null
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

        {/* Hebrew Panel */}
         <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col"> {/* Added flex flex-col */}
          <TextAreaPanel
            title="Hebrew"
            text={hebrewText} // Pass null or string
            paragraphs={hebrewParagraphs}
            onTextChange={() => {}} // Textarea is read-only
            readOnly={true}
            showTextarea={hebrewText !== null} // Show if attempted load
            isLoading={isFetching && hebrewText === null} // Loading only if fetching AND text is still null
            selectedIndex={selectedHebrewIndex}
            onParagraphSelect={(index) => handleParagraphSelect(index, 'hebrew')}
            manualAlignments={manualAlignments}
            alignmentKey="hebrewIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="hebrewParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionTargetIndex}
            linkedHighlightIndex={highlightedSuggestionIndex}
            showControls={true} // Pass flag to show controls
            onLink={handleLink}
            onUnlink={handleUnlink}
            onSuggest={handleSuggest}
            canLink={canLink}
            canUnlink={canUnlink}
            isSuggesting={isSuggesting}
            hasSuggestions={suggestedAlignments !== null}
            controlsDisabled={controlsDisabled}
          />
        </div>
      </div>
    </div>
  );
}
