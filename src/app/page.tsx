"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button'; // Import Button
 import { Loader2, DownloadCloud, Check, Eraser } from 'lucide-react'; // Added Check, Eraser
 import { useDebounce } from '@/hooks/use-debounce'; // Corrected import path
 import { fetchTexts } from '@/lib/api';
 import { SuggestedAlignment } from '@/types/alignment';
 import TextAreaPanel from '@/components/text-area-panel';
 import { useLocalStorage } from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast'; // Import useToast
import { saveAs } from 'file-saver'; // Import file-saver
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"; // Import AlertDialog components


// Throttling function
function throttle<T extends (...args: any[]) => any>(func: T, delay: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function (this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), delay);
        }
    };
 }

 // Function to normalize punctuation within a text string (for general cases, NOT used for English)
 function normalizePunctuation(text: string): string {
     // Replace various dash types with a standard hyphen-minus
     let normalized = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-');
     // Replace various quote types with standard single and double quotes
     normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A]/g, "'"); // Different single quotes/guillemets to apostrophe
     normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"'); // Different double quotes/guillemets to standard double quote
     // Replace ellipsis variants with standard three dots
     normalized = normalized.replace(/\u2026/g, '...');
     // Optionally: Remove extra whitespace around punctuation (e.g., space before comma/period)
     normalized = normalized.replace(/\s+([.,;!?:%])/g, '$1'); // Remove space before these punctuation marks
     // Optionally: Ensure space after punctuation where appropriate (e.g., after comma/period if not followed by another punctuation or end of string)
     normalized = normalized.replace(/([.,;!?:%])(?=[^\s.,;!?:%])/g, '$1 '); // Add space after if followed by non-space/non-punctuation
     // Normalize whitespace (multiple spaces/newlines to single space)
     // Keep double newlines for paragraph breaks distinct from single newlines within paragraphs
     normalized = normalized.replace(/([^\n])\n([^\n])/g, '$1 $2'); // Replace single newlines within text with spaces
     normalized = normalized.replace(/ +/g, ' '); // Collapse multiple spaces to one
     return normalized.trim(); // Trim leading/trailing whitespace
 }

// Hebrew-specific normalization based on user provided logic
const HEB_PUNCT: Record<string, string> = {
    "־": "-",      // maqaf  → hyphen‑minus
    "–": "-", "—": "-",  // EN & EM dashes (for completeness)
    "״": '"',      // gershayim  (U+05F4)  → double quote
    // "״": '"',   // Duplicate removed
    "׳": "'",      // geresh      (U+05F3)  → apostrophe
    "“": '"', "”": '"',  // curly quotes, just in case
    "‘": "'", "’": "'",
    "«": '"', "»": '"',
    "…": "...",
    "‎": "", "‏": "",    // LRM/RLM (bidi markers) → drop
    // "־": "-",    // Duplicate removed
    "׀": "|",      // Paseq → vertical bar (rare)
    "׃": ":",      // Sof Pasuq (Hebrew full stop) → colon
    "׆": ";",      // Nun Hafukha → semicolon (very rare)
};

// Create regex dynamically from the keys of HEB_PUNCT
const PUNCT_RE = new RegExp(Object.keys(HEB_PUNCT).map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join("|"), "g"); // Escape regex special chars
// Hebrew vowel / cantillation marks (Nikud + Te'amim)
const POINTS_RE = /[\u0591-\u05C7]/g;

function normalizeHebrewPunctuation(text: string, keep_nikud: boolean = true): string {
    /**
     * • Replace Hebrew punctuation with ASCII equivalents
     * • Optionally strip vowel‑points & cantillation
     * • Collapse whitespace
     */
    let t = text;
    // JS strings are generally NFC, explicit normalization often not needed unless source is suspect.
    // t = t.normalize("NFC");

    // drop Nikud / Ta'amim if caller requests
    if (!keep_nikud) {
        t = t.replace(POINTS_RE, "");
    }

    // map punctuation using the regex and lookup table
    t = t.replace(PUNCT_RE, (match) => HEB_PUNCT[match] || match); // Use lookup, default to original char if somehow not found

    // Apply general normalization rules as well (like whitespace collapse, standard quotes if missed)
    // Re-apply the general rules AFTER Hebrew-specific rules
    // Re-collapse whitespace potentially introduced by normalizePunctuation
    t = t.replace(/\s+/g, " "); // Collapse multiple spaces/tabs/newlines to one space


    return t.trim();
}


 function parseParagraphs(text: string | null, language: 'english' | 'hebrew'): string[] {
     if (!text) return [];
     // Split by double newline to separate paragraphs. Corrected regex: Use double backslashes for \n and \s
     // Updated regex to split by two or more newline characters, optionally surrounded by whitespace.
     return text.split(/(?:\s*\n\s*){2,}/)
         .map(paragraph => paragraph.trim()) // Trim whitespace first
         .filter(paragraph => paragraph !== '') // Filter empty paragraphs
         .map((paragraph, index) => { // Apply normalization based on language
              const originalParagraph = paragraph; // Keep original for comparison
              let normalizedParagraph: string;

              if (language === 'hebrew') {
                 normalizedParagraph = normalizeHebrewPunctuation(originalParagraph, true); // Keep Nikud by default
                 // Log if normalization changed the text
                 if (originalParagraph !== normalizedParagraph) {
                    console.log(`[Normalization] Hebrew Paragraph ${index + 1} Normalized:`);
                    console.log("  Before:", originalParagraph.substring(0, 100) + (originalParagraph.length > 100 ? "..." : "")); // Log first 100 chars
                    console.log("  After: ", normalizedParagraph.substring(0, 100) + (normalizedParagraph.length > 100 ? "..." : "")); // Log first 100 chars
                 }
              } else {
                 // English text is treated as ground truth, no normalization applied
                 normalizedParagraph = originalParagraph;
                  // Log if normalization changed the text (shouldn't happen now)
                 if (originalParagraph !== normalizedParagraph) {
                    console.log(`[Normalization] English Paragraph ${index + 1} WAS Normalized (This should not happen):`);
                    console.log("  Before:", originalParagraph);
                    console.log("  After: ", normalizedParagraph);
                 }
              }
              return normalizedParagraph;
         });
 }


 function assignOriginalIndices(paragraphs: string[]): { paragraph: string; originalIndex: number }[] {
     return paragraphs.map((paragraph, index) => ({ paragraph, originalIndex: index }));

 }

 function filterMetadata(paragraphsWithIndices: { paragraph: string; originalIndex: number }[], hiddenIndices: Set<number>): { paragraph: string; originalIndex: number }[] {
     return paragraphsWithIndices.filter(item => !hiddenIndices.has(item.originalIndex));
 }


 export default function Home() {
     const [englishUrl, setEnglishUrl] = useLocalStorage('englishUrl', '');
     const [hebrewUrl, setHebrewUrl] = useLocalStorage('hebrewUrl', '');
     const [englishText, setEnglishText] = useState<string | null>(null);
     const [hebrewText, setHebrewText] = useState<string | null>(null);
     const [isFetching, setIsFetching] = useState(false);
     const debouncedEnglishUrl = useDebounce(englishUrl, 500);
     const debouncedHebrewUrl = useDebounce(hebrewUrl, 500);
     const [processedParagraphs, setProcessedParagraphs] = useState<{
        english: {
            original: { paragraph: string; originalIndex: number }[];
            displayed: { paragraph: string; originalIndex: number }[];
        };
        hebrew: {
            original: { paragraph: string; originalIndex: number }[];
            displayed: { paragraph: string; originalIndex: number }[];
        };
    }>({
         english: { original: [], displayed: [] },
         hebrew: { original: [], displayed: [] },
     });
     const [selectedEnglishIndex, setSelectedEnglishIndex] = useState<number | null>(null);
     const [selectedHebrewIndex, setSelectedHebrewIndex] = useState<number | null>(null);
     // State for storing confirmed JSONL records
     const [jsonlRecords, setJsonlRecords] = useLocalStorage<string[]>('jsonlRecords', []);
     const [suggestedAlignments, setSuggestedAlignments] = useState<SuggestedAlignment[] | null>(null);
     const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number | null>(null);
     const [highlightedSuggestionTargetIndex, setHighlightedSuggestionTargetIndex] = useState<number | null>(null);
     const [isSuggesting, setIsSuggesting] = useState(false);
     const [canConfirmPair, setCanConfirmPair] = useState(false); // Renamed from canLink
     const [canUnlink, setCanUnlink] = useState(false); // Unlinking might be removed or repurposed
     const [controlsDisabled, setControlsDisabled] = useState(true);
     const [hiddenIndices, setHiddenIndices] = useLocalStorage<{ // Persist hidden indices
         english: Set<number>;
         hebrew: Set<number>;
     }>('hiddenIndices', {
         english: new Set<number>(),
         hebrew: new Set<number>(),
     });
     // Add state for scroll sync preference, persisted in localStorage
     const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useLocalStorage('isScrollSyncEnabled', true);
     const [isDownloading, setIsDownloading] = useState(false); // State for download button


     const englishPanelRef = useRef<HTMLDivElement>(null);
     const hebrewPanelRef = useRef<HTMLDivElement>(null);

    const [isUserScrolling, setIsUserScrolling] = useState(true); // Initialize to true
    const lastScrollTimeRef = useRef(0); // Ref to store the last scroll event time

    const { toast } = useToast(); // Initialize toast

     const textsAreLoaded = englishText !== null && hebrewText !== null;

     const handleEnglishUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setEnglishUrl(e.target.value);
     };

     const handleHebrewUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setHebrewUrl(e.target.value);
     };

     // Effect to rehydrate persisted state on client mount
     useEffect(() => {
         // Rehydrate JSONL records
         const storedJsonlRecords = localStorage.getItem('jsonlRecords');
         if (storedJsonlRecords) {
             try {
                 setJsonlRecords(JSON.parse(storedJsonlRecords));
             } catch (e) {
                 console.error("Failed to parse stored JSONL records:", e);
             }
         }

         // Rehydrate hidden indices (Set needs special handling)
         const storedHiddenIndices = localStorage.getItem('hiddenIndices');
         if (storedHiddenIndices) {
             try {
                 const parsed = JSON.parse(storedHiddenIndices);
                 setHiddenIndices({
                     english: new Set(parsed.english || []),
                     hebrew: new Set(parsed.hebrew || []),
                 });
             } catch (e) {
                 console.error("Failed to parse stored hidden indices:", e);
                 setHiddenIndices({ english: new Set(), hebrew: new Set() }); // Reset on error
             }
         }

          // Rehydrate scroll sync preference
          const storedScrollSync = localStorage.getItem('isScrollSyncEnabled');
           if (storedScrollSync !== null) { // Check if item exists
               try {
                   setIsScrollSyncEnabled(JSON.parse(storedScrollSync));
               } catch (e) {
                  console.error("Failed to parse stored scroll sync preference:", e);
               }
           }

         // Initial check for fetch based on persisted URLs
         if (englishUrl && hebrewUrl && !textsAreLoaded) {
             handleFetchTexts();
         }
        // Only run once on mount to rehydrate
        // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);


     const handleFetchTexts = useCallback(async () => {
        const urlToFetchEng = debouncedEnglishUrl || englishUrl; // Use debounced first, fallback to current state
        const urlToFetchHeb = debouncedHebrewUrl || hebrewUrl;

        if (!urlToFetchEng.trim() || !urlToFetchHeb.trim()) {
            console.log("URLs not ready for fetching.");
             toast({
                 title: "Missing URLs",
                 description: "Please enter both English and Hebrew URLs.",
                 variant: "destructive",
             });
            return;
        }
         setIsFetching(true);
         setEnglishText(null); // Reset text state
         setHebrewText(null); // Reset text state
         setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } }); // Reset paragraphs
         // Clear JSONL records when fetching new text
         setJsonlRecords([]);
         setSuggestedAlignments(null);
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         // Reset hidden indices for new text fetch
         setHiddenIndices({ english: new Set(), hebrew: new Set() });


         try {
             const [fetchedEnglish, fetchedHebrew] = await fetchTexts(urlToFetchEng, urlToFetchHeb);
             setEnglishText(fetchedEnglish); // Store raw fetched text
             setHebrewText(fetchedHebrew);   // Store raw fetched text

             // Parse paragraphs and assign original indices - applying language-specific normalization
             const englishParagraphs = parseParagraphs(fetchedEnglish, 'english');
             const hebrewParagraphs = parseParagraphs(fetchedHebrew, 'hebrew');
             const englishParagraphsWithIndices = assignOriginalIndices(englishParagraphs);
             const hebrewParagraphsWithIndices = assignOriginalIndices(hebrewParagraphs);
             console.log(`[Post-Normalization] Parsed English Paragraphs Count: ${englishParagraphsWithIndices.length}`);
             console.log(`[Post-Normalization] Parsed Hebrew Paragraphs Count: ${hebrewParagraphsWithIndices.length}`);

              // Automatically identify and hide metadata paragraphs
             const newHiddenIndices = {
                 english: new Set<number>(),
                 hebrew: new Set<number>(),
             };

             englishParagraphsWithIndices.forEach(item => {
                 // Use the *original* (non-normalized) paragraph for word count on English side
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) { // Identify metadata (short paragraphs)
                     newHiddenIndices.english.add(item.originalIndex);
                     console.log(`Auto-hiding English paragraph ${item.originalIndex} (short: ${wordCount} words)`);
                 }
             });
             hebrewParagraphsWithIndices.forEach(item => {
                  // Use the normalized paragraph for word count on Hebrew side
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) { // Identify metadata (short paragraphs)
                      newHiddenIndices.hebrew.add(item.originalIndex);
                      console.log(`Auto-hiding Hebrew paragraph ${item.originalIndex} (short: ${wordCount} words)`);
                 }
             });
             setHiddenIndices(newHiddenIndices); // Update state and persist the auto-detected ones


             // Initialize with filtered paragraphs using the potentially updated hiddenIndices
             setProcessedParagraphs({
                 english: {
                     original: englishParagraphsWithIndices,
                     displayed: filterMetadata(englishParagraphsWithIndices, newHiddenIndices.english),
                 },
                 hebrew: {
                     original: hebrewParagraphsWithIndices,
                     displayed: filterMetadata(hebrewParagraphsWithIndices, newHiddenIndices.hebrew),
                 },
             });

             // Clear selections and button states
             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);
             setCanConfirmPair(false); // Renamed from canLink
             setCanUnlink(false); // Unlink might be repurposed or removed
             setControlsDisabled(true); // Start with controls disabled
         } catch (error: any) {
             console.error("Failed to fetch texts:", error);
             toast({
                 title: "Fetch Error",
                 description: error.message || "Failed to fetch or process text from URLs.",
                 variant: "destructive",
             });
         } finally {
             setIsFetching(false);
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [debouncedEnglishUrl, debouncedHebrewUrl, englishUrl, hebrewUrl, setHiddenIndices, setJsonlRecords, toast]); // Add setJsonlRecords

     // This useEffect runs when the debounced URLs change
     useEffect(() => {
         // Fetch only if URLs have changed and are valid
         if (debouncedEnglishUrl && debouncedHebrewUrl && (debouncedEnglishUrl !== englishUrl || debouncedHebrewUrl !== hebrewUrl)) {
             handleFetchTexts();
         }
     }, [debouncedEnglishUrl, debouncedHebrewUrl, handleFetchTexts, englishUrl, hebrewUrl]);

      const handleParagraphSelect = (displayedIndex: number, language: 'english' | 'hebrew') => {
        if (!processedParagraphs[language].displayed[displayedIndex]) {
            console.warn(`Selected invalid displayed index ${displayedIndex} for ${language}`);
            return; // Avoid error if index is out of bounds
        }
         const originalIndex = processedParagraphs[language].displayed[displayedIndex].originalIndex;
         console.log(`Paragraph selected: Lang=${language}, DisplayedIdx=${displayedIndex}, OriginalIdx=${originalIndex}`);

        // Check if the clicked paragraph is already selected
        if (language === 'english' && selectedEnglishIndex === originalIndex) {
            console.log('Deselecting English paragraph');
            setSelectedEnglishIndex(null); // Deselect the English paragraph
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            return; // Exit early, no further logic needed
        } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
            console.log('Deselecting Hebrew paragraph');
            setSelectedHebrewIndex(null); // Deselect the Hebrew paragraph
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            return; // Exit early, no further logic needed
        }
         let currentSelectedEnglish = selectedEnglishIndex;
         let currentSelectedHebrew = selectedHebrewIndex;

         // Update the selection for the clicked language
         if (language === 'english') {
             currentSelectedEnglish = originalIndex;
             console.log(`English paragraph ${originalIndex} selected`);
         } else { // language === 'hebrew'
             currentSelectedHebrew = originalIndex;
              console.log(`Hebrew paragraph ${originalIndex} selected`);
         }

         // Determine if the newly selected pair can be confirmed
         // Can confirm if one English and one Hebrew are selected.
         const englishSelected = currentSelectedEnglish !== null;
         const hebrewSelected = currentSelectedHebrew !== null;
         const newCanConfirmPair = englishSelected && hebrewSelected;
         console.log(`Can Confirm Pair Check: engSel=${englishSelected}, hebSel=${hebrewSelected} -> Result=${newCanConfirmPair}`);

         // Unlink logic might need re-evaluation based on how JSONL works.
         // For now, let's keep it simple: can only confirm, not unlink confirmed pairs easily.
         const newCanUnlink = false; // Disable unlinking for now

         // Update state
         setSelectedEnglishIndex(currentSelectedEnglish);
         setSelectedHebrewIndex(currentSelectedHebrew);
         setCanConfirmPair(newCanConfirmPair);
         setCanUnlink(newCanUnlink);
        setControlsDisabled(!newCanConfirmPair); // Controls enabled only if pair can be confirmed
        console.log(`Controls state updated: canConfirmPair=${newCanConfirmPair}, canUnlink=${newCanUnlink}, disabled=${!newCanConfirmPair}`);
     };

     // Replaces handleLink
     const handleConfirmPair = () => {
         if (selectedEnglishIndex !== null && selectedHebrewIndex !== null && canConfirmPair) {
             console.log(`Attempting to confirm pair: Eng=${selectedEnglishIndex}, Heb=${selectedHebrewIndex}`);

             // Find the actual paragraph text using the original indices
             const englishParaData = processedParagraphs.english.original.find(p => p.originalIndex === selectedEnglishIndex);
             const hebrewParaData = processedParagraphs.hebrew.original.find(p => p.originalIndex === selectedHebrewIndex);

             if (englishParaData && hebrewParaData) {
                const enText = englishParaData.paragraph; // Use the original, non-normalized English
                const heText = hebrewParaData.paragraph; // Use the original, normalized Hebrew

                 // Create the JSONL record string
                 const record = {
                     messages: [
                         { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                         { role: 'user', content: enText }, // English paragraph
                         { role: 'assistant', content: heText } // Hebrew paragraph
                     ]
                 };
                 const jsonlString = JSON.stringify(record);

                 // Add the record to the state
                 setJsonlRecords(prevRecords => [...prevRecords, jsonlString]);
                 console.log(`Pair confirmed and added to JSONL records: ${jsonlString}`);
                 toast({ title: "Pair Confirmed", description: `English paragraph ${selectedEnglishIndex + 1} and Hebrew paragraph ${selectedHebrewIndex + 1} added to export list.` });


                 // --- Remove the confirmed paragraphs from display ---
                 // Add their original indices to the hidden set
                 const newHidden = {
                     english: new Set(hiddenIndices.english).add(selectedEnglishIndex),
                     hebrew: new Set(hiddenIndices.hebrew).add(selectedHebrewIndex)
                 };
                 setHiddenIndices(newHidden);

                 // Recalculate displayed paragraphs
                 setProcessedParagraphs(prev => ({
                     english: {
                         original: prev.english.original,
                         displayed: filterMetadata(prev.english.original, newHidden.english),
                     },
                     hebrew: {
                         original: prev.hebrew.original,
                         displayed: filterMetadata(prev.hebrew.original, newHidden.hebrew),
                     },
                 }));
                 console.log(`Removed confirmed paragraphs (Eng: ${selectedEnglishIndex}, Heb: ${selectedHebrewIndex}) from display.`);


                 // Clear selections and button states after confirming
                 setSelectedEnglishIndex(null);
                 setSelectedHebrewIndex(null);
                 setCanConfirmPair(false);
                 setCanUnlink(false);
                 setControlsDisabled(true);

             } else {
                 console.error("Could not find paragraph data for selected indices.");
                 toast({ title: "Confirmation Error", description: "Could not retrieve paragraph text for confirmation.", variant: "destructive" });
             }
         } else {
            console.warn(`Confirmation conditions not met: Eng=${selectedEnglishIndex}, Heb=${selectedHebrewIndex}, canConfirm=${canConfirmPair}`);
         }
     };


      // handleUnlink might be removed or repurposed depending on workflow
      const handleUnlink = () => {
         console.warn("Unlink functionality is currently disabled or under review for JSONL workflow.");
         toast({ title: "Action Disabled", description: "Unlinking confirmed pairs is not directly supported in this workflow.", variant: "destructive" });
         // If needed, implement logic to remove a specific record from jsonlRecords based on selection,
         // and potentially unhide the corresponding paragraphs. This would be complex.
         // For now, clear selections.
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setCanConfirmPair(false);
         setCanUnlink(false);
         setControlsDisabled(true);
     };


     const handleSuggest = async () => {
         if (!englishText || !hebrewText) {
             console.warn("Cannot suggest alignment: Texts not loaded.");
              toast({ title: "Suggestion Error", description: "Please load both texts before suggesting alignments.", variant: "destructive" });
             return;
         }

         setIsSuggesting(true);
         setControlsDisabled(true); // Disable controls during suggestion
         setSuggestedAlignments(null); // Clear previous suggestions
         console.log("Starting AI suggestion...");
          toast({ title: "AI Suggestion Started", description: "Asking the AI to suggest paragraph alignments..." });


         try {
             // Use the Genkit flow for suggestions
             const { suggestParagraphAlignment } = await import('@/ai/flows/suggest-paragraph-alignment');

             // Create the texts with double newlines as expected by the AI prompt
             // Use ORIGINAL paragraphs (non-normalized English, normalized Hebrew) for the AI
             const englishTextForAI = processedParagraphs.english.original
                                         .filter(p => !hiddenIndices.english.has(p.originalIndex)) // Filter out already hidden/confirmed
                                         .map(p => p.paragraph).join('\n\n');
             const hebrewTextForAI = processedParagraphs.hebrew.original
                                         .filter(p => !hiddenIndices.hebrew.has(p.originalIndex)) // Filter out already hidden/confirmed
                                         .map(p => p.paragraph).join('\n\n');

             console.log(`Sending text to AI (excluding hidden/confirmed): Eng length=${englishTextForAI.length}, Heb length=${hebrewTextForAI.length}`);

             const suggestions = await suggestParagraphAlignment({
                 englishText: englishTextForAI,
                 hebrewText: hebrewTextForAI,
             });
             console.log(`Raw AI Suggestions received: ${suggestions.length} suggestions`);

             // Filter suggestions to only include those involving non-hidden paragraphs
             // The AI returns indices based on the *filtered* text it received.
             // We need to map these back to the *original* indices.
              const mapFilteredIndexToOriginal = (filteredIndex: number, language: 'english' | 'hebrew'): number | null => {
                  const displayed = language === 'english' ? processedParagraphs.english.displayed : processedParagraphs.hebrew.displayed;
                  if (filteredIndex >= 0 && filteredIndex < displayed.length) {
                      return displayed[filteredIndex].originalIndex;
                  }
                  return null;
              };

              const validSuggestions = suggestions.map(s => {
                   const originalEngIndex = mapFilteredIndexToOriginal(s.englishParagraphIndex, 'english');
                   const originalHebIndex = mapFilteredIndexToOriginal(s.hebrewParagraphIndex, 'hebrew');

                   if (originalEngIndex !== null && originalHebIndex !== null) {
                       return {
                           ...s,
                           englishParagraphIndex: originalEngIndex,
                           hebrewParagraphIndex: originalHebIndex,
                       };
                   }
                   return null; // Invalid mapping, filter out
               }).filter(s => s !== null) as SuggestedAlignment[]; // Type assertion after filtering nulls

             console.log(`Valid AI Suggestions (mapped to original indices): ${validSuggestions.length} suggestions`);

             setSuggestedAlignments(validSuggestions);
              toast({ title: "AI Suggestions Ready", description: `Received ${validSuggestions.length} alignment suggestions.` });

             // Clear specific highlights for single suggestion
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);


         } catch (error: any) {
             console.error("Failed to get AI suggestions:", error);
             toast({ title: "AI Suggestion Failed", description: error.message || "An error occurred while getting suggestions.", variant: "destructive" });
             setSuggestedAlignments([]); // Clear suggestions on error
         } finally {
             setIsSuggesting(false);
             // Reset controls state based on current selection (if any)
            const engSelected = selectedEnglishIndex !== null;
            const hebSelected = selectedHebrewIndex !== null;
            const currentCanConfirm = engSelected && hebSelected;
            const currentCanUnlink = false; // Keep unlink disabled

             console.log(`Resetting controls after suggest: engSel=${engSelected}, hebSel=${hebSelected}, currentCanConfirm=${currentCanConfirm}, currentCanUnlink=${currentCanUnlink}`);
             setCanConfirmPair(currentCanConfirm);
             setCanUnlink(currentCanUnlink);
             setControlsDisabled(!currentCanConfirm); // Enable only if confirm is possible
         }
     };


     const handleDropParagraph = (originalIndex: number, language: 'english' | 'hebrew') => {
         console.log(`Hiding paragraph: Lang=${language}, OriginalIdx=${originalIndex}`);
          toast({ title: "Paragraph Hidden", description: `${language.charAt(0).toUpperCase() + language.slice(1)} paragraph ${originalIndex + 1} hidden.` });


         // Update the hidden indices state immutably
         const currentHiddenLang = hiddenIndices[language] || new Set(); // Ensure it's a Set
         const updatedHidden = new Set(currentHiddenLang);
         updatedHidden.add(originalIndex);
         const newHiddenIndicesState = { ...hiddenIndices, [language]: updatedHidden };
         setHiddenIndices(newHiddenIndicesState); // This will trigger the useLocalStorage update


         // Recalculate displayed paragraphs based on the *new* hidden indices state
          setProcessedParagraphs(prev => {
             console.log(`Updating displayed paragraphs after hiding ${language} ${originalIndex}`);
             const newEnglishDisplayed = filterMetadata(prev.english.original, newHiddenIndicesState.english);
             const newHebrewDisplayed = filterMetadata(prev.hebrew.original, newHiddenIndicesState.hebrew);
             console.log(`New counts: Eng=${newEnglishDisplayed.length}, Heb=${newHebrewDisplayed.length}`);
             return {
                 english: {
                     original: prev.english.original,
                     displayed: newEnglishDisplayed,
                 },
                 hebrew: {
                     original: prev.hebrew.original,
                     displayed: newHebrewDisplayed,
                 },
             };
         });


         // Clear selection if the dropped paragraph was selected
         let engStillSelected = selectedEnglishIndex;
         let hebStillSelected = selectedHebrewIndex;
         if (language === 'english' && selectedEnglishIndex === originalIndex) {
            console.log(`Deselecting English ${originalIndex} because it was hidden.`);
            setSelectedEnglishIndex(null);
            engStillSelected = null;
         } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
             console.log(`Deselecting Hebrew ${originalIndex} because it was hidden.`);
             setSelectedHebrewIndex(null);
             hebStillSelected = null;
         }

         // Filter out suggested alignments involving this paragraph
         const updatedSuggestedAlignments = suggestedAlignments?.filter(suggestion =>
            !(suggestion.englishParagraphIndex === originalIndex || suggestion.hebrewParagraphIndex === originalIndex)
         ) ?? null;
          if (suggestedAlignments && (!updatedSuggestedAlignments || updatedSuggestedAlignments.length < suggestedAlignments.length)) {
              console.log(`Removed suggested alignments involving hidden paragraph ${originalIndex}.`);
              setSuggestedAlignments(updatedSuggestedAlignments);
          }


         // Recalculate button states after dropping and clearing selection
         const engSelectedAfterDrop = engStillSelected !== null;
         const hebSelectedAfterDrop = hebStillSelected !== null;
         const currentCanConfirm = engSelectedAfterDrop && hebSelectedAfterDrop;
         const currentCanUnlink = false; // Keep unlink disabled

          console.log(`Resetting controls after drop: engSel=${engSelectedAfterDrop}, hebSel=${hebSelectedAfterDrop}, currentCanConfirm=${currentCanConfirm}, currentCanUnlink=${currentCanUnlink}`);
         setCanConfirmPair(currentCanConfirm);
         setCanUnlink(currentCanUnlink);
         setControlsDisabled(!currentCanConfirm);

     };

     // --- MERGE FUNCTIONALITY ---
     const handleMergeUp = (displayedIndex: number) => {
        console.log(`Attempting to merge Hebrew paragraph ${displayedIndex} UP`);
        if (displayedIndex <= 0) {
             toast({ title: "Merge Error", description: "Cannot merge the first paragraph up.", variant: "destructive" });
             return; // Cannot merge up the first paragraph
        }

        setProcessedParagraphs(prev => {
            const displayedHebrew = [...prev.hebrew.displayed]; // Work with a copy
             if (displayedIndex >= displayedHebrew.length) return prev; // Index out of bounds check

            const targetParagraphData = displayedHebrew[displayedIndex - 1];
            const sourceParagraphData = displayedHebrew[displayedIndex];

            // Create the merged paragraph text using normalized text
            const mergedText = `${targetParagraphData.paragraph}\n\n${sourceParagraphData.paragraph}`; // Add double newline between merged paragraphs

             // Update the original paragraph list (find by originalIndex and update text)
             const targetOriginalIndex = targetParagraphData.originalIndex;
             const sourceOriginalIndex = sourceParagraphData.originalIndex;
             const newOriginalHebrew = prev.hebrew.original.map(p =>
                 p.originalIndex === targetOriginalIndex ? { ...p, paragraph: mergedText } : p
             ).filter(p => p.originalIndex !== sourceOriginalIndex); // Remove the original source paragraph

            // Remove the source paragraph from the displayed list and update the target
             const newDisplayedHebrew = displayedHebrew
                .map((p, idx) => idx === displayedIndex - 1 ? { ...p, paragraph: mergedText } : p) // Update target in displayed list
                .filter((_, idx) => idx !== displayedIndex); // Remove source from displayed list


            // --- Update Alignments ---
            // Remove any suggested alignments involving the *source* paragraph's original index
            const newSuggestedAlignments = suggestedAlignments?.filter(s => s.hebrewParagraphIndex !== sourceOriginalIndex) ?? null;

            // --- Update Hidden Indices ---
            // Remove the source paragraph's original index from hidden set if present
            const newHebrewHidden = new Set(hiddenIndices.hebrew);
            newHebrewHidden.delete(sourceOriginalIndex);


            // --- Update State ---
            setSuggestedAlignments(newSuggestedAlignments);
            setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden })); // Persist hidden index change
            setSelectedHebrewIndex(null); // Deselect Hebrew after merge
            setSelectedEnglishIndex(null); // Deselect English too for consistency
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);

            toast({ title: "Paragraphs Merged", description: `Hebrew paragraph ${displayedIndex + 1} merged into paragraph ${displayedIndex}.` });
            console.log(`Merged up: Target originalIdx=${targetOriginalIndex}, Source originalIdx=${sourceOriginalIndex}`);

            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew, // Use updated original list
                    displayed: newDisplayedHebrew, // Use updated displayed list
                 },
            };
        });
     };

      const handleMergeDown = (displayedIndex: number) => {
        console.log(`Attempting to merge Hebrew paragraph ${displayedIndex} DOWN`);
        setProcessedParagraphs(prev => {
             const displayedHebrew = [...prev.hebrew.displayed]; // Work with a copy
             if (displayedIndex >= displayedHebrew.length - 1) {
                  toast({ title: "Merge Error", description: "Cannot merge the last paragraph down.", variant: "destructive" });
                  return prev; // Cannot merge down the last paragraph
             }

            const sourceParagraphData = displayedHebrew[displayedIndex];
            const targetParagraphData = displayedHebrew[displayedIndex + 1];

            // Concatenate the already normalized paragraphs
            const mergedText = `${sourceParagraphData.paragraph}\n\n${targetParagraphData.paragraph}`; // Add double newline

            // Update the original paragraph list (find source by originalIndex, update text, remove target)
            const sourceOriginalIndex = sourceParagraphData.originalIndex;
            const targetOriginalIndex = targetParagraphData.originalIndex;
             const newOriginalHebrew = prev.hebrew.original.map(p =>
                 p.originalIndex === sourceOriginalIndex ? { ...p, paragraph: mergedText } : p
             ).filter(p => p.originalIndex !== targetOriginalIndex); // Remove the original target paragraph

            // Remove the target paragraph from the displayed list and update the source
             const newDisplayedHebrew = displayedHebrew
                .map((p, idx) => idx === displayedIndex ? { ...p, paragraph: mergedText } : p) // Update source in displayed list
                .filter((_, idx) => idx !== displayedIndex + 1); // Remove target from displayed list

            // --- Update Alignments ---
            const newSuggestedAlignments = suggestedAlignments?.filter(s => s.hebrewParagraphIndex !== targetOriginalIndex) ?? null;

             // --- Update Hidden Indices ---
             const newHebrewHidden = new Set(hiddenIndices.hebrew);
             newHebrewHidden.delete(targetOriginalIndex);

            // --- Update State ---
            setSuggestedAlignments(newSuggestedAlignments);
             setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));
            setSelectedHebrewIndex(null);
            setSelectedEnglishIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);

             toast({ title: "Paragraphs Merged", description: `Hebrew paragraph ${displayedIndex + 1} merged into paragraph ${displayedIndex + 2}.` });
             console.log(`Merged down: Source originalIdx=${sourceOriginalIndex}, Target originalIdx=${targetOriginalIndex}`);


            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew, // Use updated original list
                    displayed: newDisplayedHebrew, // Use updated displayed list
                 },
             };
        });
     };

     // --- END MERGE FUNCTIONALITY ---

     // --- DOWNLOAD JSONL FUNCTIONALITY ---
      const handleDownloadJsonl = () => {
         if (jsonlRecords.length === 0) {
             toast({ title: "Download Error", description: "No confirmed pairs to download.", variant: "destructive" });
             return;
         }

         setIsDownloading(true);
         try {
             // Join the stored JSONL strings with newlines
             const jsonlContent = jsonlRecords.join('\n') + '\n'; // Ensure trailing newline

             const blob = new Blob([jsonlContent], { type: "application/jsonl;charset=utf-8" });
             saveAs(blob, "fine_tune.jsonl"); // Use the filename from the example
             toast({ title: "Download Started", description: "Downloading fine_tune.jsonl file." });

         } catch (error: any) {
             console.error("Failed to generate JSONL download:", error);
             toast({ title: "Download Failed", description: error.message || "An error occurred while generating the download file.", variant: "destructive" });
         } finally {
             setIsDownloading(false);
         }
     };
     // --- END DOWNLOAD JSONL FUNCTIONALITY ---

     // --- START FRESH FUNCTIONALITY ---
     const handleStartFresh = () => {
         console.log("Clearing JSONL records from localStorage and resetting state...");
         // Clear specific localStorage key for JSONL records
         localStorage.removeItem('jsonlRecords');

         // Reset component state related to pairing and suggestions
         setJsonlRecords([]);
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setSuggestedAlignments(null); // Clear suggestions as well
         setHighlightedSuggestionIndex(null);
         setHighlightedSuggestionTargetIndex(null);
         setCanConfirmPair(false);
         setCanUnlink(false);
         setControlsDisabled(true);

         // Reset hidden indices to only include automatically detected metadata
         // Re-run the metadata detection logic based on current paragraphs
         const initialHidden = { english: new Set<number>(), hebrew: new Set<number>() };
         processedParagraphs.english.original.forEach(item => {
             const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
             if (wordCount <= 20) {
                 initialHidden.english.add(item.originalIndex);
             }
         });
         processedParagraphs.hebrew.original.forEach(item => {
             const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
             if (wordCount <= 20) {
                 initialHidden.hebrew.add(item.originalIndex);
             }
         });
         setHiddenIndices(initialHidden);

         // Update displayed paragraphs based on reset hidden indices
         setProcessedParagraphs(prev => ({
             english: {
                 original: prev.english.original,
                 displayed: filterMetadata(prev.english.original, initialHidden.english),
             },
             hebrew: {
                 original: prev.hebrew.original,
                 displayed: filterMetadata(prev.hebrew.original, initialHidden.hebrew),
             },
         }));


         toast({ title: "Started Pairing Fresh", description: "Cleared confirmed pairs. You can start pairing again." });
     };
     // --- END START FRESH FUNCTIONALITY ---


     // New useEffect for scroll synchronization
     useEffect(() => {
        if (!isScrollSyncEnabled) {
            console.log('Scroll Sync: Disabled by user preference.');
            return; // Skip setting up listeners if disabled
        }

        const englishScrollViewport = englishPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const hebrewScrollViewport = hebrewPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;

        if (!englishScrollViewport || !hebrewScrollViewport) {
            // console.log('Scroll Sync: Viewports not ready yet.');
            return; // Exit if viewports aren't found
        }
        console.log('Scroll Sync: Viewports found, adding listeners.');


        // Logic for finding the top-most *visible* paragraph index in the viewport
        const getTopVisibleDisplayedIndex = (viewport: HTMLElement, panelRef: React.RefObject<HTMLDivElement>): number => {
            if (!viewport || !panelRef.current) return -1;
            const viewportRect = viewport.getBoundingClientRect();
            const paragraphElements = Array.from(panelRef.current.querySelectorAll('.paragraph-box')) as HTMLElement[];

            for (let i = 0; i < paragraphElements.length; i++) {
                const pElement = paragraphElements[i];
                const pRect = pElement.getBoundingClientRect();
                // Find the first paragraph whose top is AT OR JUST ABOVE the viewport top
                 if (pRect.top >= viewportRect.top) {
                    // console.log(`Top visible element found at index ${i}:`, pElement);
                    return i;
                }
            }
             // If loop completes, it means all paragraphs are above the viewport top.
             // Return the index of the last paragraph if any exist.
            return paragraphElements.length > 0 ? paragraphElements.length - 1 : -1;
        };


        const syncScroll = (sourceViewport: HTMLElement, targetViewport: HTMLElement, sourcePanelRef: React.RefObject<HTMLDivElement>, targetPanelRef: React.RefObject<HTMLDivElement>, targetParagraphsData: { paragraph: string; originalIndex: number }[]) => {
            const currentDisplayedIndex = getTopVisibleDisplayedIndex(sourceViewport, sourcePanelRef);
            console.log(`Sync Scroll: Source top displayed index: ${currentDisplayedIndex}`);
             if (currentDisplayedIndex === -1 || !targetViewport || !targetPanelRef.current || targetParagraphsData.length === 0) {
                console.log(`Sync Scroll: Cannot sync - Invalid source index (${currentDisplayedIndex}), target viewport missing, or no target paragraphs.`);
                return;
            }

            const targetParagraphElements = Array.from(targetPanelRef.current.querySelectorAll('.paragraph-box')) as HTMLElement[];
            // Find the paragraph in the target panel with the *same displayed index*
            const targetElement = targetParagraphElements[currentDisplayedIndex]; // Direct mapping by displayed index

            if (targetElement) {
                // Calculate scroll position to bring the target element's top exactly to the viewport's top
                const targetTopRelativeToScrollContainer = targetElement.offsetTop;
                // We want targetElement.offsetTop to be equal to targetViewport.scrollTop
                const scrollToPosition = targetTopRelativeToScrollContainer;

                console.log(`Sync Scroll: Scrolling target viewport to bring displayed index ${currentDisplayedIndex} (offsetTop ${targetTopRelativeToScrollContainer}) to the top.`);
                targetViewport.scrollTo({ top: scrollToPosition, behavior: 'auto' }); // Use 'auto' for instant programmatic scroll
            } else {
                 // Fallback: If exact index match fails, scroll to the top/bottom or nearest available
                const fallbackIndex = Math.min(currentDisplayedIndex, targetParagraphElements.length - 1);
                 if (fallbackIndex >= 0) {
                     const fallbackElement = targetParagraphElements[fallbackIndex];
                     const fallbackTop = fallbackElement.offsetTop; // Fallback element's top relative to scroll container
                     console.log(`Sync Scroll: Target element at index ${currentDisplayedIndex} not found. Falling back to index ${fallbackIndex} at offsetTop ${fallbackTop}.`);
                     targetViewport.scrollTo({ top: fallbackTop, behavior: 'auto' });
                 } else {
                     console.log(`Sync Scroll: Target index ${currentDisplayedIndex} (and fallback) out of bounds or element not found.`);
                 }
            }
        };

        let englishScrollTimeout: NodeJS.Timeout | null = null;
        let hebrewScrollTimeout: NodeJS.Timeout | null = null;
        let isProgrammaticScroll = false; // Flag to prevent feedback loops

        const handleEnglishScroll = () => {
            if (isProgrammaticScroll) return; // Ignore programmatic scrolls
            // console.log('User scroll: English');
            if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
            englishScrollTimeout = setTimeout(() => {
                console.log('Scroll Sync: Triggered by English scroll.');
                 isProgrammaticScroll = true; // Set flag before syncing
                 syncScroll(englishScrollViewport, hebrewScrollViewport, englishPanelRef, hebrewPanelRef, processedParagraphs.hebrew.displayed);
                 setTimeout(() => isProgrammaticScroll = false, 150); // Reset flag after a delay, slightly longer to let scroll settle
            }, 100); // Debounce/throttle time
        };

        const handleHebrewScroll = () => {
            if (isProgrammaticScroll) return; // Ignore programmatic scrolls
            // console.log('User scroll: Hebrew');
             if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
             hebrewScrollTimeout = setTimeout(() => {
                 console.log('Scroll Sync: Triggered by Hebrew scroll.');
                 isProgrammaticScroll = true; // Set flag before syncing
                 syncScroll(hebrewScrollViewport, englishScrollViewport, hebrewPanelRef, englishPanelRef, processedParagraphs.english.displayed);
                 setTimeout(() => isProgrammaticScroll = false, 150); // Reset flag after a delay, slightly longer to let scroll settle
             }, 100); // Debounce/throttle time
        };


        englishScrollViewport.addEventListener('scroll', handleEnglishScroll);
        hebrewScrollViewport.addEventListener('scroll', handleHebrewScroll);
         console.log('Scroll Sync: Event listeners added.');

         return () => {
            englishScrollViewport?.removeEventListener('scroll', handleEnglishScroll);
            hebrewScrollViewport?.removeEventListener('scroll', handleHebrewScroll);
            if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
            if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
             console.log('Scroll Sync: Event listeners removed.');
         };
    // Rerun effect if paragraphs change, viewports become available, OR scroll sync is toggled
    }, [englishPanelRef, hebrewPanelRef, processedParagraphs.english.displayed, processedParagraphs.hebrew.displayed, isScrollSyncEnabled]);


     return (
         <div className="flex flex-col h-screen p-4 bg-background">
             {/* URL Input Section - Reduced Size */}
             <Card className="mb-4 shadow-sm">
                 <CardHeader className="py-2 px-3 border-b"> {/* Optional: Add header for visual separation */}
                     {/* Optionally add a title like <CardTitle className="text-sm">Load Texts</CardTitle> */}
                 </CardHeader>
                 <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 items-end"> {/* Changed to 5 cols */}
                     <div className="space-y-1">
                         <Label htmlFor="english-url" className="text-xs">English URL</Label>
                         <Input
                             id="english-url"
                             type="url"
                             placeholder="English URL"
                             value={englishUrl}
                             onChange={handleEnglishUrlChange}
                             disabled={isFetching || isSuggesting || isDownloading}
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
                             disabled={isFetching || isSuggesting || isDownloading}
                             dir="rtl"
                             className="h-8 text-sm"
                         />
                     </div>
                     <Button
                         onClick={handleFetchTexts}
                         disabled={isFetching || isSuggesting || isDownloading || !(englishUrl || '').trim() || !(hebrewUrl || '').trim()} // Handle null/undefined case for trim
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
                      {/* Download JSONL Button */}
                      <Button
                         onClick={handleDownloadJsonl}
                         disabled={isDownloading || jsonlRecords.length === 0 || isFetching || isSuggesting}
                         className="w-full sm:w-auto h-8 text-xs"
                         size="sm"
                         variant="outline" // Use outline variant for download
                     >
                         {isDownloading ? (
                             <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                         ) : (
                             <DownloadCloud className="mr-1 h-3 w-3" />
                         )}
                         {isDownloading ? 'Preparing...' : `Download Pairs (${jsonlRecords.length})`}
                     </Button>
                     {/* Start Fresh Button */}
                     <AlertDialog>
                         <AlertDialogTrigger asChild>
                             <Button
                                 variant="destructive"
                                 disabled={isFetching || isSuggesting || isDownloading || !textsAreLoaded} // Also disable if texts not loaded
                                 className="w-full sm:w-auto h-8 text-xs"
                                 size="sm"
                             >
                                 <Eraser className="mr-1 h-3 w-3" />
                                 Start Pairing Fresh
                             </Button>
                         </AlertDialogTrigger>
                         <AlertDialogContent>
                             <AlertDialogHeader>
                                 <AlertDialogTitle>Clear Confirmed Pairs?</AlertDialogTitle>
                                 <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete all confirmed pairs from this session stored in your browser's local storage and reset the pairing process. The original fetched texts will remain.
                                 </AlertDialogDescription>
                             </AlertDialogHeader>
                             <AlertDialogFooter>
                                 <AlertDialogCancel>Cancel</AlertDialogCancel>
                                 <AlertDialogAction onClick={handleStartFresh}>Continue</AlertDialogAction>
                             </AlertDialogFooter>
                         </AlertDialogContent>
                     </AlertDialog>
                 </CardContent>
             </Card>

             {/* Alignment Section */}
             <div className="flex flex-grow gap-4 min-h-0">
                 {/* English Panel */}
                 <div ref={englishPanelRef} className="w-1/2 english-panel flex flex-col">
                     <TextAreaPanel
                         title="English"
                         displayedParagraphs={processedParagraphs.english.displayed}
                         isLoading={isFetching && englishText === null}
                         selectedOriginalIndex={selectedEnglishIndex}
                         onParagraphSelect={handleParagraphSelect} // Pass the updated handler
                         suggestedAlignments={suggestedAlignments}
                         suggestionKey="englishParagraphIndex"
                         highlightedSuggestionIndex={highlightedSuggestionIndex}
                         linkedHighlightIndex={highlightedSuggestionTargetIndex}
                         isSourceLanguage={true}
                         loadedText={englishText}
                         language="english"
                         onDropParagraph={handleDropParagraph}
                         hiddenIndices={hiddenIndices.english}
                         panelRef={englishPanelRef} // Pass ref
                         isScrollSyncEnabled={isScrollSyncEnabled} // Pass down
                         onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)} // Pass down toggle handler
                     />
                 </div>

                 {/* Hebrew Panel */}
                 <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col">
                     <TextAreaPanel
                         title="Hebrew"
                         displayedParagraphs={processedParagraphs.hebrew.displayed}
                         isLoading={isFetching && hebrewText === null}
                         selectedOriginalIndex={selectedHebrewIndex}
                         onParagraphSelect={handleParagraphSelect} // Pass the updated handler
                         suggestedAlignments={suggestedAlignments}
                         suggestionKey="hebrewParagraphIndex"
                         highlightedSuggestionIndex={highlightedSuggestionTargetIndex} // Highlight based on target
                         linkedHighlightIndex={highlightedSuggestionIndex} // Link based on source
                         showControls={true}
                         onConfirmPair={handleConfirmPair} // Pass confirm handler instead of link
                         onUnlink={handleUnlink} // Still passing, might be removed later
                         onSuggest={handleSuggest}
                         canConfirmPair={canConfirmPair} // Use confirm state
                         canUnlink={canUnlink}
                         isSuggesting={isSuggesting}
                         hasSuggestions={suggestedAlignments !== null}
                         controlsDisabled={controlsDisabled || !textsAreLoaded} // Also disable if texts aren't loaded
                         isSourceLanguage={false}
                         loadedText={hebrewText}
                         language="hebrew"
                         onDropParagraph={handleDropParagraph}
                         hiddenIndices={hiddenIndices.hebrew}
                         panelRef={hebrewPanelRef} // Pass ref
                         isScrollSyncEnabled={isScrollSyncEnabled} // Pass down
                         onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)} // Pass down toggle handler
                         // Pass merge handlers only to Hebrew panel
                         onMergeUp={handleMergeUp}
                         onMergeDown={handleMergeDown}
                     />
                 </div>
             </div>
         </div>
     );
 }
