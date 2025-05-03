
'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import TextAreaPanel from '@/components/text-area-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, DownloadCloud } from 'lucide-react';
import { suggestParagraphAlignment } from '@/ai/flows/suggest-paragraph-alignment';
import { fetchTextFromUrl } from '@/actions/fetch-text';
import type { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
import { useToast } from '@/hooks/use-toast';

const ENGLISH_URL_STORAGE_KEY = 'text-aligner-english-url';
const HEBREW_URL_STORAGE_KEY = 'text-aligner-hebrew-url';
const MAX_METADATA_PARAGRAPHS_TO_CHECK = 5; // Check the first 5 paragraphs
const MAX_METADATA_WORDS = 20; // Max words for a paragraph to be considered metadata

// Function to split text into paragraphs based on double newlines
const splitTextIntoParagraphs = (text: string | null): string[] => {
    if (!text) return [];
    return text.split(/\s*\n{2,}\s*/)
               .map(p => p.trim())
               .filter(p => p.length > 0);
};

// Helper function to count words
const countWords = (text: string): number => {
    return text.split(/\s+/).filter(Boolean).length;
};


export default function Home() {
  const [englishUrl, setEnglishUrl] = useState('');
  const [hebrewUrl, setHebrewUrl] = useState('');
  const [englishText, setEnglishText] = useState<string | null>(null);
  const [hebrewText, setHebrewText] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Store ORIGINAL indices of selected paragraphs
  const [selectedEnglishIndex, setSelectedEnglishIndex] = useState<number | null>(null);
  const [selectedHebrewIndex, setSelectedHebrewIndex] = useState<number | null>(null);

  // Store ORIGINAL indices of hidden/dropped paragraphs
  const [hiddenIndices, setHiddenIndices] = useState<{ english: Set<number>; hebrew: Set<number> }>({ english: new Set(), hebrew: new Set() });

  // Store alignments using ORIGINAL indices
  const [manualAlignments, setManualAlignments] = useState<ManualAlignment[]>([]);
  const [suggestedAlignments, setSuggestedAlignments] = useState<SuggestedAlignment[] | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Highlighting uses ORIGINAL indices
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number | null>(null);
  const [highlightedSuggestionTargetIndex, setHighlightedSuggestionTargetIndex] = useState<number | null>(null);

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
  }, []);

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

  // --- Processed Paragraphs for Display (Filtering Included) ---
  const processedParagraphs = useMemo(() => {
      const processLang = (text: string | null, lang: 'english' | 'hebrew') => {
          const allParagraphs = splitTextIntoParagraphs(text);
          const metadataIndices = new Set<number>();
          const userHidden = hiddenIndices[lang];

          // Identify metadata paragraphs
          for (let i = 0; i < Math.min(allParagraphs.length, MAX_METADATA_PARAGRAPHS_TO_CHECK); i++) {
              if (countWords(allParagraphs[i]) <= MAX_METADATA_WORDS) {
                  metadataIndices.add(i);
                  console.log(`[Page] Marked ${lang} paragraph ${i} as metadata (short).`);
              }
          }

          const combinedHiddenIndices = new Set([...userHidden, ...metadataIndices]);

          const displayed = allParagraphs
              .map((p, i) => ({ paragraph: p, originalIndex: i }))
              .filter(item => !combinedHiddenIndices.has(item.originalIndex));

          console.log(`[Page] Processed ${lang}: ${allParagraphs.length} total, ${metadataIndices.size} metadata, ${userHidden.size} user hidden, ${displayed.length} displayed.`);
          return { all: allParagraphs, displayed: displayed, hiddenSet: combinedHiddenIndices };
      };

      const englishResult = processLang(englishText, 'english');
      const hebrewResult = processLang(hebrewText, 'hebrew');

      return {
          english: englishResult,
          hebrew: hebrewResult,
      };
  }, [englishText, hebrewText, hiddenIndices]);


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
    // Reset EVERYTHING on new fetch
    setEnglishText(null);
    setHebrewText(null);
    setManualAlignments([]);
    setSuggestedAlignments(null);
    setSelectedEnglishIndex(null);
    setSelectedHebrewIndex(null);
    setHighlightedSuggestionIndex(null);
    setHighlightedSuggestionTargetIndex(null);
    setHiddenIndices({ english: new Set(), hebrew: new Set() }); // Reset hidden paragraphs

    try {
      console.log(`[Page] Fetching English URL: ${englishUrl}`);
      console.log(`[Page] Fetching Hebrew URL: ${hebrewUrl}`);
      const [englishResult, hebrewResult] = await Promise.all([
        fetchTextFromUrl(englishUrl),
        fetchTextFromUrl(hebrewUrl),
      ]);
      console.log('[Page] Fetches completed.');

      let hasError = false;
      if (englishResult.error || !englishResult.text) {
        const errorMsg = englishResult.error || "Could not fetch or parse English text.";
        console.error(`[Page] Fetch Error (English): ${errorMsg}`);
        toast({ title: "Fetch Error (English)", description: errorMsg, variant: "destructive" });
        setEnglishText('');
        hasError = true;
      } else {
        console.log(`[Page] Setting English text (raw length: ${englishResult.text.length})`);
        setEnglishText(englishResult.text);
      }

      if (hebrewResult.error || !hebrewResult.text) {
         const errorMsg = hebrewResult.error || "Could not fetch or parse Hebrew text.";
        console.error(`[Page] Fetch Error (Hebrew): ${errorMsg}`);
        toast({ title: "Fetch Error (Hebrew)", description: errorMsg, variant: "destructive" });
         setHebrewText('');
        hasError = true;
      } else {
         console.log(`[Page] Setting Hebrew text (raw length: ${hebrewResult.text.length})`);
        setHebrewText(hebrewResult.text);
      }

      if (!hasError) {
          console.log('[Page] Texts fetched successfully.');
          toast({ title: "Texts Fetched", description: "English and Hebrew texts loaded successfully." });
          // Trigger metadata detection after successful fetch (handled by useMemo)
      } else {
          console.warn('[Page] One or both text fetches failed.');
      }

    } catch (error: any) {
      console.error("[Page] Unexpected error in handleFetchTexts:", error);
      toast({ title: "Fetch Error", description: `An unexpected error occurred: ${error.message || 'Unknown error'}`, variant: "destructive" });
      setEnglishText('');
      setHebrewText('');
    } finally {
      console.log('[Page] Fetching process finished.');
      setIsFetching(false);
    }
  }, [englishUrl, hebrewUrl, toast]);


    // --- Mapping between displayed and original indices ---
    const getOriginalIndex = useCallback((displayedIndex: number, language: 'english' | 'hebrew'): number | null => {
        const item = processedParagraphs[language].displayed[displayedIndex];
        return item ? item.originalIndex : null;
    }, [processedParagraphs]);

    const getDisplayedIndex = useCallback((originalIndex: number, language: 'english' | 'hebrew'): number | null => {
        const index = processedParagraphs[language].displayed.findIndex(item => item.originalIndex === originalIndex);
        return index !== -1 ? index : null;
    }, [processedParagraphs]);

    // --- Paragraph Selection ---
    // Uses ORIGINAL indices internally, but receives DISPLAYED index from component
    const handleParagraphSelect = useCallback((displayedIndex: number, language: 'english' | 'hebrew') => {
        const originalIndex = getOriginalIndex(displayedIndex, language);
        console.log(`[Page] Paragraph selected - Displayed Index: ${displayedIndex}, Original Index: ${originalIndex}, Language: ${language}`);

        if (originalIndex === null) {
            console.warn('[Page] Could not find original index for selected displayed index:', displayedIndex);
            return;
        }

        if (language === 'english') {
            setSelectedEnglishIndex(prev => (prev === originalIndex ? null : originalIndex));
            setSelectedHebrewIndex(null); // Deselect other language
        } else {
            setSelectedHebrewIndex(prev => (prev === originalIndex ? null : originalIndex));
            setSelectedEnglishIndex(null); // Deselect other language
        }
        setHighlightedSuggestionIndex(null);
        setHighlightedSuggestionTargetIndex(null);
    }, [getOriginalIndex]);

    // --- Manual Linking Logic (Uses Original Indices) ---
    const canLink = useMemo(() => {
        if (selectedEnglishIndex === null || selectedHebrewIndex === null) return false;
        const isEnglishLinked = manualAlignments.some(link => link.englishIndex === selectedEnglishIndex);
        const isHebrewLinked = manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex);
        return !isEnglishLinked && !isHebrewLinked;
    }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments]);

    const handleLink = useCallback(() => {
        if (canLink && selectedEnglishIndex !== null && selectedHebrewIndex !== null) {
        const newAlignment: ManualAlignment = { englishIndex: selectedEnglishIndex, hebrewIndex: selectedHebrewIndex };
        console.log('[Page] Linking paragraphs (original indices):', newAlignment);
        setManualAlignments(prev => [...prev, newAlignment]);
        setSelectedEnglishIndex(null);
        setSelectedHebrewIndex(null);
        toast({ title: "Paragraphs Linked", description: `English paragraph ${getDisplayedIndex(selectedEnglishIndex, 'english')! + 1} linked to Hebrew paragraph ${getDisplayedIndex(selectedHebrewIndex, 'hebrew')! + 1}.` });
        }
    }, [canLink, selectedEnglishIndex, selectedHebrewIndex, toast, getDisplayedIndex]);

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
            console.log('[Page] Unlinking paragraphs (original indices):', alignmentToRemove);
            setSelectedEnglishIndex(null);
            setSelectedHebrewIndex(null);
             const displayEngIdx = getDisplayedIndex(engIdx, 'english');
             const displayHebIdx = getDisplayedIndex(hebIdx, 'hebrew');
             // Only show toast if indices were found (they might have been hidden)
             if (displayEngIdx !== null && displayHebIdx !== null) {
                toast({ title: "Link Removed", description: `Link between English paragraph ${displayEngIdx + 1} and Hebrew paragraph ${displayHebIdx + 1} removed.`, variant: "destructive" });
             } else {
                 toast({ title: "Link Removed", description: `Link removed (one or both paragraphs may be hidden).`, variant: "destructive" });
             }
        }
    }, [selectedEnglishIndex, selectedHebrewIndex, manualAlignments, toast, getDisplayedIndex]);

  // --- AI Suggestion Logic ---
  const handleSuggest = useCallback(async () => {
    console.log('[Page] handleSuggest triggered.');
     // Use the *original unfiltered* texts for the AI
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
        // Send the ORIGINAL texts to the AI
       const inputPayload = {
         englishText: englishText || '',
         hebrewText: hebrewText || ''
       };
       console.log(`[Page] Payload for AI: Eng raw length ${inputPayload.englishText.length}, Heb raw length ${inputPayload.hebrewText.length}`);

      const suggestions = await suggestParagraphAlignment(inputPayload);
       console.log('[Page] Received suggestions from AI:', suggestions);

        // Suggestions have ORIGINAL indices. Validate against the total number of ORIGINAL paragraphs.
        const totalEnglishParagraphs = processedParagraphs.english.all.length;
        const totalHebrewParagraphs = processedParagraphs.hebrew.all.length;
        console.log(`[Page] Total paragraph counts for validation: Eng=${totalEnglishParagraphs}, Heb=${totalHebrewParagraphs}`);

        // Filter suggestions:
        // 1. Indices must be valid within the ORIGINAL total counts.
        // 2. NEITHER paragraph in the suggestion should be in the HIDDEN sets.
        const validSuggestions = suggestions.filter(s =>
            s.englishParagraphIndex >= 0 && s.englishParagraphIndex < totalEnglishParagraphs &&
            s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < totalHebrewParagraphs &&
            !processedParagraphs.english.hiddenSet.has(s.englishParagraphIndex) && // Check if English paragraph is hidden
            !processedParagraphs.hebrew.hiddenSet.has(s.hebrewParagraphIndex)    // Check if Hebrew paragraph is hidden
        );

        if (validSuggestions.length !== suggestions.length) {
            console.warn(`[Page] Filtered out ${suggestions.length - validSuggestions.length} suggestions due to out-of-bounds indices or hidden paragraphs.`);
             suggestions.forEach((s, idx) => {
                 const isEngValidIdx = s.englishParagraphIndex >= 0 && s.englishParagraphIndex < totalEnglishParagraphs;
                 const isHebValidIdx = s.hebrewParagraphIndex >= 0 && s.hebrewParagraphIndex < totalHebrewParagraphs;
                 const isEngHidden = processedParagraphs.english.hiddenSet.has(s.englishParagraphIndex);
                 const isHebHidden = processedParagraphs.hebrew.hiddenSet.has(s.hebrewParagraphIndex);
                 if (!isEngValidIdx || !isHebValidIdx || isEngHidden || isHebHidden) {
                    console.warn(`  Suggestion ${idx} Filtered: EngIdx=${s.englishParagraphIndex} (Valid: ${isEngValidIdx}, Hidden: ${isEngHidden}), HebIdx=${s.hebrewParagraphIndex} (Valid: ${isHebValidIdx}, Hidden: ${isHebHidden})`);
                 }
            });
        }

        console.log(`[Page] Setting ${validSuggestions.length} valid suggestions.`);
        // Store suggestions with ORIGINAL indices
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
  }, [englishText, hebrewText, toast, processedParagraphs]);


   // --- Highlighting Logic (Uses Original Indices) ---
    useEffect(() => {
        const englishPanel = englishPanelRef.current;
        const hebrewPanel = hebrewPanelRef.current;
        let currentHighlightEng: number | null = null; // Store original indices
        let currentHighlightHeb: number | null = null; // Store original indices

        const handlePointerMove = (event: PointerEvent) => {
            if (!suggestedAlignments || isFetching || isSuggesting) return;

            const target = event.target as HTMLElement;
            const paragraphDiv = target.closest('[data-original-index]') as HTMLElement | null; // Look for original index

            let newHighlightEng: number | null = null;
            let newHighlightHeb: number | null = null;

            if (paragraphDiv) {
                const originalIndex = parseInt(paragraphDiv.dataset.originalIndex || '-1', 10); // Get original index
                const isEnglish = englishPanel?.contains(paragraphDiv);

                if (originalIndex !== -1) {
                    // Find suggestion based on the ORIGINAL index
                    const suggestion = suggestedAlignments.find(s =>
                        isEnglish ? s.englishParagraphIndex === originalIndex : s.hebrewParagraphIndex === originalIndex
                    );

                    if (suggestion) {
                        newHighlightEng = suggestion.englishParagraphIndex; // Store original index
                        newHighlightHeb = suggestion.hebrewParagraphIndex; // Store original index
                    }
                }
            }

            if (newHighlightEng !== currentHighlightEng || newHighlightHeb !== currentHighlightHeb) {
                 setHighlightedSuggestionIndex(newHighlightEng); // Update state with original indices
                 setHighlightedSuggestionTargetIndex(newHighlightHeb);
                 currentHighlightEng = newHighlightEng;
                 currentHighlightHeb = newHighlightHeb;
            }
        };

        const handlePointerLeave = () => {
            if (currentHighlightEng !== null || currentHighlightHeb !== null) {
                 setHighlightedSuggestionIndex(null);
                 setHighlightedSuggestionTargetIndex(null);
                 currentHighlightEng = null;
                 currentHighlightHeb = null;
             }
        };

        if (textsAreLoaded && englishPanel && hebrewPanel) {
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

    // --- Drop/Hide Paragraph Logic ---
    const handleDropParagraph = useCallback((originalIndex: number, language: 'english' | 'hebrew') => {
        console.log(`[Page] Dropping ${language} paragraph with original index: ${originalIndex}`);
        setHiddenIndices(prev => {
            const newSet = new Set(prev[language]);
            newSet.add(originalIndex);
            return { ...prev, [language]: newSet };
        });

        // Deselect if the dropped paragraph was selected
        if (language === 'english' && selectedEnglishIndex === originalIndex) {
            setSelectedEnglishIndex(null);
        }
        if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
            setSelectedHebrewIndex(null);
        }

        // Remove any manual alignments involving this paragraph
        setManualAlignments(prev => prev.filter(link =>
            !(link.englishIndex === originalIndex && language === 'english') &&
            !(link.hebrewIndex === originalIndex && language === 'hebrew')
        ));

         // Filter out suggestions involving this paragraph (optional, but good for consistency)
         setSuggestedAlignments(prev => prev?.filter(s =>
             !(s.englishParagraphIndex === originalIndex && language === 'english') &&
             !(s.hebrewParagraphIndex === originalIndex && language === 'hebrew')
         ) ?? null);


         const displayedIndex = getDisplayedIndex(originalIndex, language);
         toast({ title: "Paragraph Hidden", description: `${language.charAt(0).toUpperCase() + language.slice(1)} paragraph ${displayedIndex !== null ? displayedIndex + 1 : '(original index '+ (originalIndex + 1) +')'} hidden.` });

    }, [selectedEnglishIndex, selectedHebrewIndex, getDisplayedIndex, toast]);


  return (
    <div className="flex flex-col h-screen p-4 bg-background">
       {/* URL Input Section - Reduced Size */}
       <Card className="mb-4 shadow-sm">
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="english-url" className="text-xs">English URL</Label>
            <Input
              id="english-url"
              type="url"
              placeholder="English URL"
              value={englishUrl}
              onChange={handleEnglishUrlChange}
              disabled={isFetching || isSuggesting}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hebrew-url" className="text-xs">Hebrew URL</Label>
            <Input
              id="hebrew-url"
              type="url"
              placeholder="Hebrew URL"
              value={hebrewUrl}
              onChange={handleHebrewUrlChange}
              disabled={isFetching || isSuggesting}
              dir="rtl"
              className="h-8 text-sm"
            />
          </div>
          <Button
            onClick={handleFetchTexts}
            disabled={isFetching || isSuggesting || !englishUrl.trim() || !hebrewUrl.trim()}
            className="w-full sm:w-auto h-8 text-xs"
            size="sm"
          >
            {isFetching ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <DownloadCloud className="mr-1 h-3 w-3" />
            )}
            {isFetching ? 'Fetching...' : 'Fetch'}
          </Button>
        </CardContent>
       </Card>

      {/* Alignment Section */}
      <div className="flex flex-grow gap-4 min-h-0">
        {/* English Panel */}
        <div ref={englishPanelRef} className="w-1/2 english-panel flex flex-col">
          <TextAreaPanel
            title="English"
             // Pass displayed paragraphs with original indices
            displayedParagraphs={processedParagraphs.english.displayed}
            isLoading={isFetching && englishText === null}
             // Pass original index of selected paragraph
            selectedOriginalIndex={selectedEnglishIndex}
            onParagraphSelect={handleParagraphSelect}
            manualAlignments={manualAlignments}
            alignmentKey="englishIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="englishParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionIndex}
            linkedHighlightIndex={highlightedSuggestionTargetIndex}
            isSourceLanguage={true}
            loadedText={englishText}
            language="english"
            onDropParagraph={handleDropParagraph} // Pass drop handler
            hiddenIndices={hiddenIndices.english} // Pass hidden indices
          />
        </div>

        {/* Hebrew Panel */}
         <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col">
          <TextAreaPanel
            title="Hebrew"
             // Pass displayed paragraphs with original indices
            displayedParagraphs={processedParagraphs.hebrew.displayed}
            isLoading={isFetching && hebrewText === null}
            // Pass original index of selected paragraph
            selectedOriginalIndex={selectedHebrewIndex}
            onParagraphSelect={handleParagraphSelect}
            manualAlignments={manualAlignments}
            alignmentKey="hebrewIndex"
            suggestedAlignments={suggestedAlignments}
            suggestionKey="hebrewParagraphIndex"
            highlightedSuggestionIndex={highlightedSuggestionTargetIndex}
            linkedHighlightIndex={highlightedSuggestionIndex}
            showControls={true}
            onLink={handleLink}
            onUnlink={handleUnlink}
            onSuggest={handleSuggest}
            canLink={canLink}
            canUnlink={canUnlink}
            isSuggesting={isSuggesting}
            hasSuggestions={suggestedAlignments !== null}
            controlsDisabled={controlsDisabled}
            isSourceLanguage={false}
            loadedText={hebrewText}
            language="hebrew"
            onDropParagraph={handleDropParagraph} // Pass drop handler
             hiddenIndices={hiddenIndices.hebrew} // Pass hidden indices
          />
        </div>
      </div>
    </div>
  );
}

    