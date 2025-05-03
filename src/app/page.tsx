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


  // Split text into paragraphs based on double line breaks. Internal single newlines are preserved.
  const englishParagraphs = useMemo(() => {
      if (!englishText) return [];
      // Split by two or more newline characters (\n\n, \n\n\n, etc.), potentially surrounded by whitespace.
      const paragraphs = englishText.split(/\s*\n{2,}\s*/).filter(p => p.trim().length > 0);
      console.log(`[Page] Generated ${paragraphs.length} English paragraphs from text length ${englishText.length}.`);
      // Log first few chars of each paragraph for debugging
      // paragraphs.forEach((p, i) => console.log(`  Eng Para ${i}: "${p.substring(0, 50)}..."`));
      return paragraphs;
  }, [englishText]);

  const hebrewParagraphs = useMemo(() => {
      if (!hebrewText) return [];
       // Same splitting logic for Hebrew text.
       const paragraphs = hebrewText.split(/\s*\n{2,}\s*/).filter(p => p.trim().length > 0);
       console.log(`[Page] Generated ${paragraphs.length} Hebrew paragraphs from text length ${hebrewText.length}.`);
       // Log first few chars of each paragraph for debugging
       // paragraphs.forEach((p, i) => console.log(`  Heb Para ${i}: "${p.substring(0, 50)}..."`));
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
      // console.log('[Page] English Result:', englishResult); // Less verbose log
      // console.log('[Page] Hebrew Result:', hebrewResult);


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
       // Pass the *original* fetched texts to the AI, not the split paragraphs
       // The AI flow should ideally handle its own paragraph splitting based on the prompt
       const inputPayload = {
         englishText: englishText || '',
         hebrewText: hebrewText || ''
       };
       console.log(`[Page] Payload for AI: Eng length ${inputPayload.englishText.length}, Heb length ${inputPayload.hebrewText.length}`);

      const suggestions = await suggestParagraphAlignment(inputPayload);
       console.log('[Page] Received suggestions from AI:', suggestions);

       // Get current paragraph counts for validation
       const currentEnglishParagraphCount = englishParagraphs.length;
       const currentHebrewParagraphCount = hebrewParagraphs.length;
       console.log(`[Page] Current paragraph counts for validation: Eng=${currentEnglishParagraphCount}, Heb=${currentHebrewParagraphCount}`);

      // Filter suggestions to only include valid paragraph indices based on the *current* split
       const validSuggestions = suggestions.filter(s =>
            s.englishParagraphIndex >= 0 && s.englishParagraphIndex < currentEnglishParagraphCount &&
            s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < currentHebrewParagraphCount
       );
        if (validSuggestions.length !== suggestions.length) {
            console.warn(`[Page] Filtered out ${suggestions.length - validSuggestions.length} invalid suggestions (out of bounds indices).`);
            suggestions.forEach(s => {
                 if (!(s.englishParagraphIndex >= 0 && s.englishParagraphIndex < currentEnglishParagraphCount)) {
                    console.warn(`  Invalid English index: ${s.englishParagraphIndex} (max: ${currentEnglishParagraphCount - 1})`);
                 }
                 if (!(s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < currentHebrewParagraphCount)) {
                     console.warn(`  Invalid Hebrew index: ${s.hebrewParagraphIndex} (max: ${currentHebrewParagraphCount - 1})`);
                 }
            });
        }
      console.log(`[Page] Setting ${validSuggestions.length} valid suggestions.`);
      setSuggestedAlignments(validSuggestions);
      toast({ title: "Suggestions Ready", description: `${validSuggestions.length} alignment suggestions generated.` });
    } catch (error: any) {
      console.error("[Page] Error fetching suggestions:", error);
      toast({ title: "Suggestion Error", description: `Could not generate suggestions. Error: ${error.message || 'Unknown error'}. Please try again.`, variant: "destructive" });
       setSuggestedAlignments([]); // Set empty array on error
    } finally {
       console.log('[Page] Suggestion process finished.');
      setIsSuggesting(false);
    }
  }, [englishText, hebrewText, toast, englishParagraphs.length, hebrewParagraphs.length]); // Re-run if paragraph counts change


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
       {/* URL Input Section - Reduced Size */}
       <Card className="mb-4 shadow-sm"> {/* Reduced shadow */}
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 items-end"> {/* Reduced padding/gap */}
          <div className="space-y-1">
            <Label htmlFor="english-url" className="text-xs">English URL</Label> {/* Smaller label */}
            <Input
              id="english-url"
              type="url"
              placeholder="English URL" /* Shorter placeholder */
              value={englishUrl}
              onChange={handleEnglishUrlChange}
              disabled={isFetching || isSuggesting}
              className="h-8 text-sm" /* Smaller input */
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hebrew-url" className="text-xs">Hebrew URL</Label> {/* Smaller label */}
            <Input
              id="hebrew-url"
              type="url"
              placeholder="Hebrew URL" /* Shorter placeholder */
              value={hebrewUrl}
              onChange={handleHebrewUrlChange}
              disabled={isFetching || isSuggesting}
              dir="rtl"
              className="h-8 text-sm" /* Smaller input */
            />
          </div>
          <Button
            onClick={handleFetchTexts}
            disabled={isFetching || isSuggesting || !englishUrl.trim() || !hebrewUrl.trim()}
            className="w-full sm:w-auto h-8 text-xs" /* Smaller button */
            size="sm" /* Use smaller size */
          >
            {isFetching ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> /* Smaller icon */
            ) : (
              <DownloadCloud className="mr-1 h-3 w-3" /> /* Smaller icon */
            )}
            {isFetching ? 'Fetching...' : 'Fetch'} {/* Shorter text */}
          </Button>
        </CardContent>
       </Card>

      {/* Alignment Section */}
      <div className="flex flex-grow gap-4 min-h-0">
        {/* English Panel */}
        <div ref={englishPanelRef} className="w-1/2 english-panel flex flex-col">
          <TextAreaPanel
            title="English"
            paragraphs={englishParagraphs}
            isLoading={isFetching && englishText === null} // Loading only if fetching AND text is still null
            selectedIndex={selectedEnglishIndex}
            onParagraphSelect={(index) => handleParagraphSelect(index, 'english')}
            manualAlignments={manualAlignments}
            alignmentKey="englishIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="englishParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionIndex}
            linkedHighlightIndex={highlightedSuggestionTargetIndex}
            isSourceLanguage={true} // Indicate this is the source for structure
            loadedText={englishText} // Pass loaded text state
          />
        </div>

        {/* Hebrew Panel */}
         <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col">
          <TextAreaPanel
            title="Hebrew"
            paragraphs={hebrewParagraphs}
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
            isSourceLanguage={false} // Indicate this is NOT the source
            loadedText={hebrewText} // Pass loaded text state
          />
        </div>
      </div>
    </div>
  );
}
