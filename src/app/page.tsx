"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, DownloadCloud, Check, Eraser, Link as LinkIcon, Link2Off as LinkOffIcon } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { fetchTexts } from '@/lib/api';
import TextAreaPanel from '@/components/text-area-panel';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast';
import { saveAs } from 'file-saver';
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
} from "@/components/ui/alert-dialog";
import type { Scored } from '@/lib/translate_score'; // Import Scored interface type


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
    "׳": "'",      // geresh      (U+05F3)  → apostrophe
    "“": '"', "”": '"',  // curly quotes, just in case
    "‘": "'", "’": "'",
    "«": '"', "»": '"',
    "…": "...",
    "‎": "", "‏": "",    // LRM/RLM (bidi markers) → drop
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


 // Interface for displayed paragraphs - UPDATED to match score props
 interface DisplayedParagraphData {
    paragraph: string;
    originalIndex: number;
    score?: number;          // Blended score
    detailedScore?: {        // Optional: for tooltip
        bleu: number;
        cosine: number;
        mt?: string;
    };
    isScoring?: boolean;
    scoreError?: boolean;
 }

 function parseParagraphs(text: string | null, language: 'english' | 'hebrew'): string[] {
     if (!text) return [];
     return text.split(/(?:\s*\n\s*){2,}/)
         .map(paragraph => paragraph.trim())
         .filter(paragraph => paragraph !== '')
         .map((paragraph, index) => {
              const originalParagraph = paragraph;
              let normalizedParagraph: string;

              if (language === 'hebrew') {
                 normalizedParagraph = normalizeHebrewPunctuation(originalParagraph, true);
              } else {
                 // English text is not normalized
                 normalizedParagraph = originalParagraph;
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
            displayed: DisplayedParagraphData[];
        };
        hebrew: {
            original: { paragraph: string; originalIndex: number }[];
            displayed: DisplayedParagraphData[];
        };
    }>({ english: { original: [], displayed: [] },
         hebrew: { original: [], displayed: [] },
     });
     const [selectedEnglishIndex, setSelectedEnglishIndex] = useState<number | null>(null);
     const [selectedHebrewIndex, setSelectedHebrewIndex] = useState<number | null>(null);
     const [jsonlRecords, setJsonlRecords] = useLocalStorage<string[]>('jsonlRecords', []);
     const [canConfirmPair, setCanConfirmPair] = useState(false);
     const [canUnlink, setCanUnlink] = useState(false);
     const [controlsDisabled, setControlsDisabled] = useState(true);
     const [hiddenIndices, setHiddenIndices] = useLocalStorage<{ english: Set<number>; hebrew: Set<number>; }>('hiddenIndices', { english: new Set<number>(),
         hebrew: new Set<number>(),
     })
     const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useLocalStorage('isScrollSyncEnabled', true);
     const [isDownloading, setIsDownloading] = useState(false);
     // State for scoring - CORRECTED
     const [isCalculatingScores, setIsCalculatingScores] = useState(false);
     // State to explicitly track if texts are loaded and processed - ADDED
     const [textsLoadedAndProcessed, setTextsLoadedAndProcessed] = useState(false);
     //State for tracking if scoring was attempted
     const [scoringAttempted, setScoringAttempted] = useState(false);


     const englishPanelRef = useRef<HTMLDivElement>(null);
     const hebrewPanelRef = useRef<HTMLDivElement>(null);
     const lastScrollTimeRef = useRef(0);

    const { toast } = useToast();

     // Derived state - Use the new state variable
     const textsAreLoaded = textsLoadedAndProcessed;


     const handleEnglishUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setEnglishUrl(e.target.value);
     };

     const handleHebrewUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setHebrewUrl(e.target.value);
     };

     // --- START SCORING FUNCTIONS ---

     const fetchAndSetScore = useCallback(async (
         enParagraph: string | undefined,
         heParagraph: string,
         heOriginalIndex: number
     ) => {
         if (!enParagraph) {
             console.log(`[Score][${heOriginalIndex}] No EN paragraph, Skipping score`);
             console.warn(`[Score] Skipping score calculation for Hebrew paragraph ${heOriginalIndex}: No corresponding English paragraph found.`);
             setProcessedParagraphs(prev => ({
                 ...prev,
                 hebrew: {
                     ...prev.hebrew,
                     displayed: prev.hebrew.displayed.map(p =>
                         p.originalIndex === heOriginalIndex
                             ? { ...p, isScoring: false, scoreError: true, score: undefined, detailedScore: undefined }
                             : p
                     ),
                 },
             }));
             return;
         }

         // Set loading state for this specific paragraph
         console.log(`[Score][${heOriginalIndex}] Setting isScoring: true`);
         setProcessedParagraphs(prev => ({
             ...prev,
             hebrew: {
                 ...prev.hebrew,
                 displayed: prev.hebrew.displayed.map(p =>
                     p.originalIndex === heOriginalIndex
                         ? { ...p, isScoring: true, scoreError: false }
                         : p
                 ),
             },
         }));

         try {
             console.log(`[Score][${heOriginalIndex}] About to fetch /api/score`);
             console.log(`[Score] Requesting score for original index ${heOriginalIndex}: EN=\"${enParagraph.substring(0, 50)}...\", HE=\"${heParagraph.substring(0, 50)}...\"`);
             const response = await fetch('/api/score', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ en: enParagraph, he: heParagraph }),
             });

             console.log(`[Score][${heOriginalIndex}] Received response from /api/score`);
             if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error || `API request failed with status ${response.status}`);
             }

             // Type assertion to match the expected API response structure
             console.log(`[Score][${heOriginalIndex}] About to parse JSON response`);
             const scores = await response.json() as Omit<Scored, 'en' | 'he'>;

             console.log(`[Score] Received score for original index ${heOriginalIndex}: Blended=${scores.blended}`);


             // Update state with scores
             setProcessedParagraphs(prev => ({
                 ...prev,
                 hebrew: {
                     ...prev.hebrew,
                     displayed: prev.hebrew.displayed.map(p =>
                         p.originalIndex === heOriginalIndex
                             ? {
                                   ...p,
                                   isScoring: false,
                                   score: scores.blended,
                                   detailedScore: { bleu: scores.bleu, cosine: scores.cosine, mt: scores.mt },
                                   scoreError: false,
                               }
                             : p
                     ),
                 },
             }));
             console.log(`[Score][${heOriginalIndex}] State updated with score`);
         } catch (error: any) {
             console.error(`[Score] Error scoring original index ${heOriginalIndex}:`, error);
             // Update state with error
             setProcessedParagraphs(prev => ({
                 ...prev,
                 hebrew: {
                     ...prev.hebrew,
                     displayed: prev.hebrew.displayed.map(p =>
                         p.originalIndex === heOriginalIndex
                             ? { ...p, isScoring: false, scoreError: true, score: undefined, detailedScore: undefined }
                             : p
                     ),
                 },
             }));
         }
     }, []); // Dependency: toast

    // This function calculates score for ONE displayed Hebrew paragraph index
     const handleRecalculateScore = useCallback(async (heDisplayedIndex: number) => {
        console.log(`[Score] Recalculating score for Hebrew displayed index: ${heDisplayedIndex}`);

        const heParaDisplayed = processedParagraphs.hebrew.displayed[heDisplayedIndex];

        if (!heParaDisplayed) {
             toast({ title: "Recalculate Error", description: "Could not find the Hebrew paragraph data.", variant: "destructive", duration: 2000 });
             return;
        }

         // Find the corresponding *original* English paragraph by original index
         const enParaOriginal = processedParagraphs.english.original.find(p => p.originalIndex === heParaDisplayed.originalIndex);

         if (!enParaOriginal) {
             toast({ title: "Recalculate Error", description: "Could not find the corresponding original English paragraph.", variant: "destructive", duration: 2000 });
               // Still mark the Hebrew paragraph with an error
               setProcessedParagraphs(prev => ({
                    ...prev,
                    hebrew: {
                        ...prev.hebrew,
                        displayed: prev.hebrew.displayed.map(p =>
                            p.originalIndex === heParaDisplayed.originalIndex
                                ? { ...p, isScoring: false, scoreError: true, score: undefined, detailedScore: undefined }
                                : p
                        ),
                    },
                }));
             return;
         }

        // Use the *current* text of the displayed Hebrew paragraph and the *original* English text
        await fetchAndSetScore(enParaOriginal.paragraph, heParaDisplayed.paragraph, heParaDisplayed.originalIndex);

    }, [processedParagraphs.english.original, processedParagraphs.hebrew.displayed, fetchAndSetScore, toast]); // Dependencies

    // This function calculates scores for ALL currently displayed Hebrew paragraphs
     const handleCalculateAllScores = useCallback(async () => {
        console.log("[Score] Check before scoring:", { textsAreLoaded, isCalculatingScores }); // Use isCalculatingScores
         console.log("[Score] Starting handleCalculateAllScores");
        if (!textsAreLoaded || isCalculatingScores) {
             console.log("[Score] Skipping score calculation: Texts not loaded or already scoring.");
            return;
         }
         setScoringAttempted(true);
         setIsCalculatingScores(true); // Use isCalculatingScores

         // Set loading state for all Hebrew paragraphs
         setProcessedParagraphs(prev => ({
             ...prev,
             hebrew: {
                ...prev.hebrew,
                 displayed: prev.hebrew.displayed.map(p => ({ ...p, isScoring: true, score: undefined, scoreError: false })), // Use isScoring
             },
         }));

        const scorePromises = processedParagraphs.hebrew.displayed.slice(0, 2).map((heParaDisplayed, displayedIndex) => {
             // Find the matching *original* English paragraph by original index
             const enParaOriginal = processedParagraphs.english.original.find(en => en.originalIndex === heParaDisplayed.originalIndex);
             // Pass the displayed Hebrew text and the original English text, along with the original index
            return fetchAndSetScore(enParaOriginal?.paragraph, heParaDisplayed.paragraph, heParaDisplayed.originalIndex);
        });

        try {
           await Promise.all(scorePromises);
         } catch (error) {
            // Errors for individual paragraphs are handled within fetchAndSetScore
            console.error("[Score] Error during bulk score calculation:", error);
            console.log("[Score] Error during bulk score calculation:", error);
             // A generic toast might still be useful if Promise.all somehow rejects, though individual errors are shown per paragraph
             // toast({ title: "Scoring Failed", description: "Some scores could not be calculated.", variant: "destructive", duration: 2000 });
         } finally {
             setIsCalculatingScores(false); // Use isCalculatingScores
         }

     }, [textsAreLoaded, isCalculatingScores, processedParagraphs.english.original, processedParagraphs.hebrew.displayed, fetchAndSetScore, setScoringAttempted]);


     // --- END SCORING FUNCTIONS ---


     useEffect(() => {
         // Load from localStorage
         const storedJsonlRecords = localStorage.getItem('jsonlRecords');
         if (storedJsonlRecords) {
             try {
                 setJsonlRecords(JSON.parse(storedJsonlRecords));
             } catch (e) {
                 console.error("Failed to parse stored JSONL records:", e);
             }
         }
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
                 setHiddenIndices({ english: new Set(), hebrew: new Set() });
             }
         }
          const storedScrollSync = localStorage.getItem('isScrollSyncEnabled');
           if (storedScrollSync !== null) {
               try {
                   setIsScrollSyncEnabled(JSON.parse(storedScrollSync));
               } catch (e) {
                  console.error("Failed to parse stored scroll sync preference:", e);
               }
           }
         // Trigger fetch if URLs are present and texts are not loaded
         if (englishUrl && hebrewUrl && !textsLoadedAndProcessed) { // Use textsLoadedAndProcessed
             handleFetchTexts();
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []); // Empty dependency array to run only on mount


     const handleFetchTexts = useCallback(async () => {
        const urlToFetchEng = debouncedEnglishUrl || englishUrl;
        const urlToFetchHeb = debouncedHebrewUrl || hebrewUrl;

        if (!urlToFetchEng.trim() || !urlToFetchHeb.trim()) {
        }
         setIsFetching(true);
         setTextsLoadedAndProcessed(false); // Reset loaded state
         setIsCalculatingScores(false); // Reset scoring state
         setScoringAttempted(false);
         setEnglishText(null);
         setHebrewText(null);
         setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } });
         setHiddenIndices({ english: new Set(), hebrew: new Set() });
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setCanConfirmPair(false);
         setCanUnlink(false);
         setControlsDisabled(true);


         try {
             const [fetchedEnglish, fetchedHebrew] = await fetchTexts(urlToFetchEng, urlToFetchHeb);
             setEnglishText(fetchedEnglish);
             setHebrewText(fetchedHebrew);

             const englishParagraphs = parseParagraphs(fetchedEnglish, 'english');
             const hebrewParagraphs = parseParagraphs(fetchedHebrew, 'hebrew');
             const englishParagraphsWithIndices = assignOriginalIndices(englishParagraphs);
             const hebrewParagraphsWithIndices = assignOriginalIndices(hebrewParagraphs);

              const newHiddenIndices = {
                 english: new Set<number>(),
                 hebrew: new Set<number>(),
             };

             englishParagraphsWithIndices.forEach(item => {
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) {
                     newHiddenIndices.english.add(item.originalIndex);
                 }
             });
             hebrewParagraphsWithIndices.forEach(item => {
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) {
                      newHiddenIndices.hebrew.add(item.originalIndex);
                 }
             });
             setHiddenIndices(newHiddenIndices);

             // Convert to DisplayedParagraphData structure, initializing scoring states
             const mapToDisplayedData = (item: { paragraph: string; originalIndex: number }): DisplayedParagraphData => ({
                 paragraph: item.paragraph,
                 originalIndex: item.originalIndex,
                 score: undefined,
                 detailedScore: undefined,
                 isScoring: false,
                 scoreError: false,
             });

             const initialEnglishDisplayed = filterMetadata(englishParagraphsWithIndices, newHiddenIndices.english).map(mapToDisplayedData);
             const initialHebrewDisplayed = filterMetadata(hebrewParagraphsWithIndices, newHiddenIndices.hebrew).map(mapToDisplayedData);

             setProcessedParagraphs({
                 english: {
                     original: englishParagraphsWithIndices,
                     displayed: initialEnglishDisplayed,
                 },
                 hebrew: {
                     original: hebrewParagraphsWithIndices,
                     displayed: initialHebrewDisplayed,
                 },
             });

            // --- CORRECTED STATE UPDATE AND LOGGING ---
             setTextsLoadedAndProcessed(true); // Set loaded state AFTER processing paragraphs
             console.log("[Load Text] Initial displayed lengths:", { english: initialEnglishDisplayed.length, hebrew: initialHebrewDisplayed.length });
            // --- END CORRECTED ---


             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setCanConfirmPair(false);
             setCanUnlink(false);
             setControlsDisabled(true);
             // setIsScoring(false); // This is reset at the start and finally block


         } catch (error: any) {
             console.error("Failed to fetch texts:", error);
             toast({
                 title: "Fetch Error",
                 description: error.message || "Failed to fetch or process text from URLs.",
                 variant: "destructive",
                 duration: 2000,
             });
             setTextsLoadedAndProcessed(false); // Ensure loaded state is false on error
         } finally {
             setIsFetching(false);
         }
        
     // Added dependencies for useCallback
     }, [debouncedEnglishUrl, debouncedHebrewUrl, englishUrl, hebrewUrl, setHiddenIndices, toast]);


     // Use effect to trigger handleCalculateAllScores only when textsLoadedAndProcessed is true
     useEffect(() => {
        if (textsLoadedAndProcessed && !isCalculatingScores && !scoringAttempted) {
             console.log("[Score] textsLoadedAndProcessed is true, triggering handleCalculateAllScores");
            handleCalculateAllScores();
        }
     // Added dependencies for useCallback
     }, [debouncedEnglishUrl, debouncedHebrewUrl, englishUrl, hebrewUrl, setHiddenIndices, toast, handleCalculateAllScores]); // Added handleCalculateAllScores


     // This effect triggers fetch on URL changes after debounce
     useEffect(() => {
         if (debouncedEnglishUrl && debouncedHebrewUrl && (debouncedEnglishUrl !== englishUrl || debouncedHebrewUrl !== hebrewUrl)) {
             handleFetchTexts();
         }
     }, [debouncedEnglishUrl, debouncedHebrewUrl, handleFetchTexts, englishUrl, hebrewUrl]);


      const handleParagraphSelect = (displayedIndex: number, language: 'english' | 'hebrew') => {
        if (!processedParagraphs[language].displayed[displayedIndex]) {
            console.warn(`Selected invalid displayed index ${displayedIndex} for ${language}`);
            return;
        }
         const originalIndex = processedParagraphs[language].displayed[displayedIndex].originalIndex;

        if (language === 'english' && selectedOriginalIndex === originalIndex) {
            setSelectedEnglishIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            return;
        } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
            setSelectedHebrewIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            return;
        }
         let currentSelectedEnglish = selectedEnglishIndex;
         let currentSelectedHebrew = selectedHebrewIndex;

         if (language === 'english') {
             currentSelectedEnglish = originalIndex;
         } else {
             currentSelectedHebrew = originalIndex;
         }

         const englishSelected = currentSelectedEnglish !== null;
         const hebrewSelected = currentSelectedHebrew !== null;
         const newCanConfirmPair = englishSelected && hebrewSelected;
         const newCanUnlink = false;

         setSelectedEnglishIndex(currentSelectedEnglish);
         setSelectedHebrewIndex(currentSelectedHebrew);
         setCanConfirmPair(newCanConfirmPair);
         setCanUnlink(newCanUnlink);
         // Enable controls only if a pair is selected AND texts are loaded
        setControlsDisabled(!(newCanConfirmPair && textsAreLoaded)); // Check textsAreLoaded
     };

     const handleConfirmPair = () => {
         if (selectedEnglishIndex !== null && selectedHebrewIndex !== null && canConfirmPair) {
             const englishParaData = processedParagraphs.english.original.find(p => p.originalIndex === selectedEnglishIndex);
             const hebrewParaData = processedParagraphs.hebrew.original.find(p => p.originalIndex === selectedHebrewIndex);

             if (englishParaData && hebrewParaData) {
                const enText = englishParaData.paragraph;
                const heText = hebrewParaData.paragraph; // Use original text for saving
                 const record = {
                     messages: [
                         { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                         { role: 'user', content: enText },
                         { role: 'assistant', content: heText }
                     ]
                 };
                 const jsonlString = JSON.stringify(record);
                 setJsonlRecords(prevRecords => [...prevRecords, jsonlString]);
                 toast({
                    title: "Pair Confirmed",
                    description: `Paragraph pair added to export list.`,
                    duration: 2000,
                 });

                 const newHidden = {
                     english: new Set(hiddenIndices.english).add(selectedEnglishIndex),
                     hebrew: new Set(hiddenIndices.hebrew).add(selectedHebrewIndex)
                 };
                 setHiddenIndices(newHidden);

                 // Re-filter displayed paragraphs after hiding, preserving existing scoring data structure
                 setProcessedParagraphs(prev => ({
                     english: {
                         original: prev.english.original,
                         // Re-map after hiding, keeping existing display data (including score props)
                         displayed: filterMetadata(prev.english.original, newHidden.english).map(item => {
                            const existingDisplayed = prev.english.displayed.find(d => d.originalIndex === item.originalIndex);
                            return { ...item, ...existingDisplayed }; // Keep existing display data
                         }),
                     },
                     hebrew: {
                         original: prev.hebrew.original,
                         // Re-map after hiding, keeping existing display data (including score props)
                         displayed: filterMetadata(prev.hebrew.original, newHidden.hebrew).map(item => {
                             const existingDisplayed = prev.hebrew.displayed.find(d => d.originalIndex === item.originalIndex);
                             return { ...item, ...existingDisplayed }; // Keep existing display data
                         }),
                     },
                 }));

                 setSelectedEnglishIndex(null);
                 setSelectedHebrewIndex(null);
                 setCanConfirmPair(false);
                 setCanUnlink(false);
                 setControlsDisabled(true);

             } else {
                 toast({
                    title: "Confirmation Error",
                    description: "Could not retrieve paragraph text.",
                    variant: "destructive",
                    duration: 2000,
                 });
             }
         }
     };

      const handleUnlink = () => {
         console.warn("Unlink functionality is currently disabled.");
         toast({
            title: "Action Disabled",
            description: "Unlinking is not supported.",
            variant: "destructive",
            duration: 2000,
         });
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setCanConfirmPair(false);
         setCanUnlink(false);
         setControlsDisabled(true);
     };


     const handleDropParagraph = (originalIndex: number, language: 'english' | 'hebrew') => {
          toast({
            title: "Paragraph Hidden",
            description: `${language.charAt(0).toUpperCase() + language.slice(1)} paragraph hidden.`,
            duration: 2000,
        });

         const currentHiddenLang = hiddenIndices[language] || new Set();
         const updatedHidden = new Set(currentHiddenLang);
         updatedHidden.add(originalIndex);
         const newHiddenIndicesState = { ...hiddenIndices, [language]: updatedHidden };
         setHiddenIndices(newHiddenIndicesState);


           // Re-filter displayed paragraphs, preserving existing scoring data
           setProcessedParagraphs(prev => {
              const mapAndPreserveData = (
                  original: { paragraph: string; originalIndex: number }[],
                  displayed: DisplayedParagraphData[],
                  newHidden: Set<number>
              ): DisplayedParagraphData[] => {
                  const filteredOriginal = filterMetadata(original, newHidden);
                  return filteredOriginal.map(item => {
                      const existingData = displayed.find(d => d.originalIndex === item.originalIndex);
                      return {
                          paragraph: item.paragraph,
                          originalIndex: item.originalIndex,
                          score: existingData?.score,
                          detailedScore: existingData?.detailedScore,
                          isScoring: existingData?.isScoring,
                          scoreError: existingData?.scoreError,
                      };
                  });
              }; // Closing brace for mapAndPreserveData
              return { // Returning object for the setProcessedParagraphs
                ...prev,
                english: {
                    original: prev.english.original,
                    displayed: mapAndPreserveData(prev.english.original, prev.english.displayed, newHiddenIndicesState.english)
                },
                hebrew: {
                    original: prev.hebrew.original,
                    displayed: mapAndPreserveData(prev.hebrew.original, prev.hebrew.displayed, newHiddenIndicesState.hebrew)
                }
            }
           });
     };

     const handleDownloadJsonl = () => {
        if (jsonlRecords.length === 0) {
            toast({
                title: "Nothing to Export",
                description: "No confirmed paragraph pairs to export.",
                variant: "destructive",
                duration: 2000,
            });
            return;
        }
        setIsDownloading(true);
        const jsonlContent = jsonlRecords.join("\n");
        const blob = new Blob([jsonlContent], { type: "application/jsonl;charset=utf-8" });
        saveAs(blob, "translation_pairs.jsonl");
        setIsDownloading(false);
    };

    const handleClearPairs = () => {
        setJsonlRecords([]);
        localStorage.removeItem('jsonlRecords');
        toast({
            title: "Export Cleared",
            description: "The export list has been cleared.",
            duration: 2000,
        });
    };

    const handleClearHidden = () => {
         setHiddenIndices({ english: new Set(), hebrew: new Set() });
        localStorage.removeItem('hiddenIndices');
         setProcessedParagraphs(prev => ({
            ...prev,
            english: {
                ...prev.english,
                displayed: filterMetadata(prev.english.original, new Set()).map(item => ({
                    ...item,
                    score: undefined,
                    detailedScore: undefined,
                    isScoring: false,
                    scoreError: false,
                 }))
            },
            hebrew: {
                ...prev.hebrew,
                displayed: filterMetadata(prev.hebrew.original, new Set()).map(item => ({
                     ...item,
                    score: undefined,
                    detailedScore: undefined,
                    isScoring: false,
                    scoreError: false,
                }))
            }
         }));
        toast({
            title: "Hidden Cleared",
            description: "All hidden paragraphs are now visible.",
            duration: 2000,
        });
    };

    const handleClearAll = () => {
        setEnglishUrl('');
        setHebrewUrl('');
        setEnglishText(null);
        setHebrewText(null);
        setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } });
        setHiddenIndices({ english: new Set(), hebrew: new Set() });
        setSelectedEnglishIndex(null);
        setSelectedHebrewIndex(null);
        setJsonlRecords([]);
        setCanConfirmPair(false);
        setCanUnlink(false);
        setControlsDisabled(true);
        setTextsLoadedAndProcessed(false);
         setIsCalculatingScores(false);
         setScoringAttempted(false);
         localStorage.clear();
         toast({
            title: "App Reset",
            description: "The app has been reset to its initial state.",
            duration: 2000,
        });
    };


     const handleScroll = throttle((language: 'english' | 'hebrew', event: React.UIEvent<HTMLDivElement>) => {
        const currentTime = Date.now();
        if (currentTime - lastScrollTimeRef.current < 50) {
            return; // Debounce within 50ms
        }
        lastScrollTimeRef.current = currentTime;
        if (!isScrollSyncEnabled) return;
        const sourcePanel = event.currentTarget;
        const targetPanel = language === 'english' ? hebrewPanelRef.current : englishPanelRef.current;
        if (targetPanel) {
            targetPanel.scrollTop = sourcePanel.scrollTop;
        }
    }, 50);

    const toggleScrollSync = () => {
        setIsScrollSyncEnabled(prev => !prev);
    };
