
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
// Removed scoreAlignment import


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


 // Interface for displayed paragraphs
 interface DisplayedParagraphData {
    paragraph: string;
    originalIndex: number;
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
                 if (originalParagraph !== normalizedParagraph) {
                    console.log(`[Normalization] Hebrew Paragraph ${index + 1} Normalized:`);
                    console.log("  Before:", originalParagraph.substring(0, 100) + (originalParagraph.length > 100 ? "..." : ""));
                    console.log("  After: ", normalizedParagraph.substring(0, 100) + (normalizedParagraph.length > 100 ? "..." : ""));
                 }
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
    }>({
         english: { original: [], displayed: [] },
         hebrew: { original: [], displayed: [] },
     });
     const [selectedEnglishIndex, setSelectedEnglishIndex] = useState<number | null>(null);
     const [selectedHebrewIndex, setSelectedHebrewIndex] = useState<number | null>(null);
     const [jsonlRecords, setJsonlRecords] = useLocalStorage<string[]>('jsonlRecords', []);
     const [canConfirmPair, setCanConfirmPair] = useState(false);
     const [canUnlink, setCanUnlink] = useState(false);
     const [controlsDisabled, setControlsDisabled] = useState(true);
     const [hiddenIndices, setHiddenIndices] = useLocalStorage<{
         english: Set<number>;
         hebrew: Set<number>;
     }>('hiddenIndices', {
         english: new Set<number>(),
         hebrew: new Set<number>(),
     });
     const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useLocalStorage('isScrollSyncEnabled', true);
     const [isDownloading, setIsDownloading] = useState(false);
     // Removed isScoring state

     const englishPanelRef = useRef<HTMLDivElement>(null);
     const hebrewPanelRef = useRef<HTMLDivElement>(null);
     const lastScrollTimeRef = useRef(0);

    const { toast } = useToast();

     const textsAreLoaded = englishText !== null && hebrewText !== null;

     const handleEnglishUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setEnglishUrl(e.target.value);
     };

     const handleHebrewUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setHebrewUrl(e.target.value);
     };

     useEffect(() => {
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
         if (englishUrl && hebrewUrl && !textsAreLoaded) {
             handleFetchTexts();
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);


     const handleFetchTexts = useCallback(async () => {
        const urlToFetchEng = debouncedEnglishUrl || englishUrl;
        const urlToFetchHeb = debouncedHebrewUrl || hebrewUrl;

        if (!urlToFetchEng.trim() || !urlToFetchHeb.trim()) {
             toast({
                 title: "Missing URLs",
                 description: "Please enter both English and Hebrew URLs.",
                 variant: "destructive",
                 duration: 2000, // Consistent duration
             });
            return;
        }
         setIsFetching(true);
         setEnglishText(null);
         setHebrewText(null);
         setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } });
         // Reset hidden indices for new text (unless "Start Fresh" is clicked, which handles JSONL separately)
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

             // Convert to DisplayedParagraphData structure
             const mapToDisplayedData = (item: { paragraph: string; originalIndex: number }): DisplayedParagraphData => ({
                 paragraph: item.paragraph,
                 originalIndex: item.originalIndex,
             });

             setProcessedParagraphs({
                 english: {
                     original: englishParagraphsWithIndices,
                     displayed: filterMetadata(englishParagraphsWithIndices, newHiddenIndices.english).map(mapToDisplayedData),
                 },
                 hebrew: {
                     original: hebrewParagraphsWithIndices,
                     displayed: filterMetadata(hebrewParagraphsWithIndices, newHiddenIndices.hebrew).map(mapToDisplayedData),
                 },
             });

             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setCanConfirmPair(false);
             setCanUnlink(false);
             setControlsDisabled(true);
         } catch (error: any) {
             console.error("Failed to fetch texts:", error);
             toast({
                 title: "Fetch Error",
                 description: error.message || "Failed to fetch or process text from URLs.",
                 variant: "destructive",
                 duration: 2000,
             });
         } finally {
             setIsFetching(false);
         }
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [debouncedEnglishUrl, debouncedHebrewUrl, englishUrl, hebrewUrl, setHiddenIndices, toast]);

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

        if (language === 'english' && selectedEnglishIndex === originalIndex) {
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
        setControlsDisabled(!newCanConfirmPair);
     };

     const handleConfirmPair = () => {
         if (selectedEnglishIndex !== null && selectedHebrewIndex !== null && canConfirmPair) {
             const englishParaData = processedParagraphs.english.original.find(p => p.originalIndex === selectedEnglishIndex);
             const hebrewParaData = processedParagraphs.hebrew.original.find(p => p.originalIndex === selectedHebrewIndex);

             if (englishParaData && hebrewParaData) {
                const enText = englishParaData.paragraph;
                const heText = hebrewParaData.paragraph;
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

                 setProcessedParagraphs(prev => ({
                     english: {
                         original: prev.english.original,
                         displayed: filterMetadata(prev.english.original, newHidden.english).map(item => ({...item})), // No scoring props
                     },
                     hebrew: {
                         original: prev.hebrew.original,
                         displayed: filterMetadata(prev.hebrew.original, newHidden.hebrew).map(item => ({...item})), // No scoring props
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


          setProcessedParagraphs(prev => {
             const newEnglishDisplayed = filterMetadata(prev.english.original, newHiddenIndicesState.english).map(item => ({...item})); // No scoring props
             const newHebrewDisplayed = filterMetadata(prev.hebrew.original, newHiddenIndicesState.hebrew).map(item => ({...item})); // No scoring props
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

         let engStillSelected = selectedEnglishIndex;
         let hebStillSelected = selectedHebrewIndex;
         if (language === 'english' && selectedEnglishIndex === originalIndex) {
            setSelectedEnglishIndex(null);
            engStillSelected = null;
         } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
             setSelectedHebrewIndex(null);
             hebStillSelected = null;
         }

         const engSelectedAfterDrop = engStillSelected !== null;
         const hebSelectedAfterDrop = hebStillSelected !== null;
         const currentCanConfirm = engSelectedAfterDrop && hebSelectedAfterDrop;
         const currentCanUnlink = false;

         setCanConfirmPair(currentCanConfirm);
         setCanUnlink(currentCanUnlink);
         setControlsDisabled(!currentCanConfirm);
     };

     const handleMergeUp = (displayedIndex: number) => {
        if (displayedIndex <= 0) {
             toast({ title: "Merge Error", description: "Cannot merge the first paragraph up.", variant: "destructive", duration: 2000 });
             return;
        }

        setProcessedParagraphs(prev => {
            const displayedHebrew = [...prev.hebrew.displayed];
            const targetParagraphData = displayedHebrew[displayedIndex - 1];
            const sourceParagraphData = displayedHebrew[displayedIndex];
            const mergedText = `${targetParagraphData.paragraph} ${sourceParagraphData.paragraph}`; // Single space merge
            const targetOriginalIndex = targetParagraphData.originalIndex;
            const sourceOriginalIndex = sourceParagraphData.originalIndex;

            const newOriginalHebrew = prev.hebrew.original.map(p =>
                p.originalIndex === targetOriginalIndex ? { ...p, paragraph: mergedText } : p
            ).filter(p => p.originalIndex !== sourceOriginalIndex);

             const newDisplayedHebrew = displayedHebrew
                .map((p, idx) => idx === displayedIndex - 1 ? { ...p, paragraph: mergedText } : p) // No scoring props
                .filter((_, idx) => idx !== displayedIndex);

             const newHebrewHidden = new Set(hiddenIndices.hebrew);
             newHebrewHidden.delete(sourceOriginalIndex);

            setSelectedHebrewIndex(null);
            setSelectedEnglishIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));

            toast({ title: "Paragraphs Merged", description: `Hebrew paragraphs merged.`, duration: 2000 });

            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew,
                    displayed: newDisplayedHebrew,
                 },
            };
        });
     };

      const handleMergeDown = (displayedIndex: number) => {
        setProcessedParagraphs(prev => {
             const displayedHebrew = [...prev.hebrew.displayed];
             if (displayedIndex >= displayedHebrew.length - 1) {
                  toast({ title: "Merge Error", description: "Cannot merge the last paragraph down.", variant: "destructive", duration: 2000 });
                  return prev;
             }

            const sourceParagraphData = displayedHebrew[displayedIndex];
            const targetParagraphData = displayedHebrew[displayedIndex + 1];
            const mergedText = `${sourceParagraphData.paragraph} ${targetParagraphData.paragraph}`; // Single space merge
            const sourceOriginalIndex = sourceParagraphData.originalIndex;
            const targetOriginalIndex = targetParagraphData.originalIndex;

             const newOriginalHebrew = prev.hebrew.original.map(p =>
                 p.originalIndex === sourceOriginalIndex ? { ...p, paragraph: mergedText } : p
             ).filter(p => p.originalIndex !== targetOriginalIndex);

             const newDisplayedHebrew = displayedHebrew
                .map((p, idx) => idx === displayedIndex ? { ...p, paragraph: mergedText } : p) // No scoring props
                .filter((_, idx) => idx !== displayedIndex + 1);

             const newHebrewHidden = new Set(hiddenIndices.hebrew);
             newHebrewHidden.delete(targetOriginalIndex);

            setSelectedHebrewIndex(null);
            setSelectedEnglishIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
             setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));

             toast({ title: "Paragraphs Merged", description: `Hebrew paragraphs merged.`, duration: 2000 });

            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew,
                    displayed: newDisplayedHebrew,
                 },
             };
        });
     };

      const handleDownloadJsonl = () => {
         if (jsonlRecords.length === 0) {
             toast({ title: "Download Error", description: "No confirmed pairs to download.", variant: "destructive", duration: 2000 });
             return;
         }
         setIsDownloading(true);
         try {
             const jsonlContent = jsonlRecords.join('\n') + '\n';
             const blob = new Blob([jsonlContent], { type: "application/jsonl;charset=utf-8" });
             saveAs(blob, "fine_tune.jsonl");
             toast({ title: "Download Started", description: "Downloading fine_tune.jsonl file.", duration: 2000 });
         } catch (error: any) {
             toast({ title: "Download Failed", description: error.message || "Error generating download.", variant: "destructive", duration: 2000 });
         } finally {
             setIsDownloading(false);
         }
     };

     const handleStartFresh = () => {
         localStorage.removeItem('jsonlRecords');
         setJsonlRecords([]);
         // Reset selection and controls, but keep loaded texts and their hidden indices
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setCanConfirmPair(false);
         setCanUnlink(false);
         setControlsDisabled(true);

          // Re-apply initial metadata filtering if texts are loaded
         if (textsAreLoaded) {
             const initialHidden = { english: new Set<number>(), hebrew: new Set<number>() };
             processedParagraphs.english.original.forEach(item => {
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) initialHidden.english.add(item.originalIndex);
             });
             processedParagraphs.hebrew.original.forEach(item => {
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) initialHidden.hebrew.add(item.originalIndex);
             });
              setHiddenIndices(initialHidden); // Keep existing hidden unless starting fresh
             setProcessedParagraphs(prev => ({
                 english: {
                     original: prev.english.original,
                      displayed: filterMetadata(prev.english.original, initialHidden.english).map(item => ({...item})), // No scoring props
                 },
                 hebrew: {
                     original: prev.hebrew.original,
                      displayed: filterMetadata(prev.hebrew.original, initialHidden.hebrew).map(item => ({...item})), // No scoring props
                 },
             }));
         }
         // If texts aren't loaded yet, startFresh just clears JSONL records. Hidden indices will be set on fetch.


         toast({ title: "Started Pairing Fresh", description: "Cleared confirmed pairs.", duration: 2000 });
     };


     // --- END SCORING FUNCTIONALITY ---


     // Scroll synchronization logic (remains largely the same)
     useEffect(() => {
        if (!isScrollSyncEnabled) {
            console.log('Scroll Sync: Disabled.');
            return;
        }

        const englishViewport = englishPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const hebrewViewport = hebrewPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;

        if (!englishViewport || !hebrewViewport) {
            return;
        }
        console.log('Scroll Sync: Viewports found, adding listeners.');


        const getTopVisibleDisplayedIndex = (viewport: HTMLElement, panelRef: React.RefObject<HTMLDivElement>): number => {
             if (!viewport || !panelRef.current) return -1;
             const viewportRect = viewport.getBoundingClientRect();
             const paragraphElements = Array.from(panelRef.current.querySelectorAll('.paragraph-box')) as HTMLElement[];

             for (let i = 0; i < paragraphElements.length; i++) {
                 const pElement = paragraphElements[i];
                 const pRect = pElement.getBoundingClientRect();
                  if (pRect.top >= viewportRect.top) {
                     return i;
                 }
             }
             return paragraphElements.length > 0 ? paragraphElements.length - 1 : -1;
        };


        const syncScroll = (sourceViewport: HTMLElement, targetViewport: HTMLElement, sourcePanelRef: React.RefObject<HTMLDivElement>, targetPanelRef: React.RefObject<HTMLDivElement>) => {
            const currentDisplayedIndex = getTopVisibleDisplayedIndex(sourceViewport, sourcePanelRef);
             if (currentDisplayedIndex === -1 || !targetViewport || !targetPanelRef.current) {
                console.log(`Sync Scroll: Cannot sync - Invalid source index or target missing.`);
                return;
            }

            const targetParagraphElements = Array.from(targetPanelRef.current.querySelectorAll('.paragraph-box')) as HTMLElement[];
            const targetElement = targetParagraphElements[currentDisplayedIndex];

            if (targetElement) {
                const scrollToPosition = targetElement.offsetTop;
                console.log(`Sync Scroll: Scrolling target to displayed index ${currentDisplayedIndex} (offsetTop ${scrollToPosition}).`);
                targetViewport.scrollTo({ top: scrollToPosition, behavior: 'auto' });
            } else {
                const fallbackIndex = Math.min(currentDisplayedIndex, targetParagraphElements.length - 1);
                 if (fallbackIndex >= 0) {
                     const fallbackElement = targetParagraphElements[fallbackIndex];
                     const fallbackTop = fallbackElement.offsetTop;
                     console.log(`Sync Scroll: Target element at index ${currentDisplayedIndex} not found. Falling back to index ${fallbackIndex} at offsetTop ${fallbackTop}.`);
                     targetViewport.scrollTo({ top: fallbackTop, behavior: 'auto' });
                 } else {
                     console.log(`Sync Scroll: Target index ${currentDisplayedIndex} (and fallback) out of bounds.`);
                 }
            }
        };

        let englishScrollTimeout: NodeJS.Timeout | null = null;
        let hebrewScrollTimeout: NodeJS.Timeout | null = null;
        let isProgrammaticScroll = false;

        const handleEnglishScroll = () => {
            if (isProgrammaticScroll) return;
            if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
            englishScrollTimeout = setTimeout(() => {
                 isProgrammaticScroll = true;
                 syncScroll(englishViewport, hebrewViewport, englishPanelRef, hebrewPanelRef);
                 setTimeout(() => isProgrammaticScroll = false, 150);
            }, 100);
        };

        const handleHebrewScroll = () => {
            if (isProgrammaticScroll) return;
             if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
             hebrewScrollTimeout = setTimeout(() => {
                 isProgrammaticScroll = true;
                 syncScroll(hebrewViewport, englishViewport, hebrewPanelRef, englishPanelRef);
                 setTimeout(() => isProgrammaticScroll = false, 150);
             }, 100);
        };


        englishViewport.addEventListener('scroll', handleEnglishScroll);
        hebrewViewport.addEventListener('scroll', handleHebrewScroll);
         console.log('Scroll Sync: Event listeners added.');

         return () => {
            englishViewport?.removeEventListener('scroll', handleEnglishScroll);
            hebrewViewport?.removeEventListener('scroll', handleHebrewScroll);
            if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
            if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
             console.log('Scroll Sync: Event listeners removed.');
         };
    }, [englishPanelRef, hebrewPanelRef, processedParagraphs.english.displayed, processedParagraphs.hebrew.displayed, isScrollSyncEnabled]);


     return (
         <div className="flex flex-col h-screen p-4 bg-background">
             {/* URL Input Section */}
             <Card className="mb-4 shadow-sm">
                 <CardHeader className="py-2 px-3 border-b" />
                 <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 items-end">
                     <div className="space-y-1">
                         <Label htmlFor="english-url" className="text-xs">English URL</Label>
                         <Input
                             id="english-url"
                             type="url"
                             placeholder="English URL"
                             value={englishUrl}
                             onChange={handleEnglishUrlChange}
                             disabled={isFetching || isDownloading} // Removed scoring check
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
                             disabled={isFetching || isDownloading} // Removed scoring check
                             dir="rtl"
                             className="h-8 text-sm"
                         />
                     </div>
                     <Button
                         onClick={handleFetchTexts}
                         disabled={isFetching || isDownloading || !(englishUrl || '').trim() || !(hebrewUrl || '').trim()} // Removed scoring check
                         className="w-full sm:w-auto h-8 text-xs"
                         size="sm"
                     >
                         {isFetching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DownloadCloud className="mr-1 h-3 w-3" />}
                         {isFetching ? 'Fetching...' : 'Fetch'}
                     </Button>
                      <Button
                         onClick={handleDownloadJsonl}
                         disabled={isDownloading || jsonlRecords.length === 0 || isFetching} // Removed scoring check
                         className="w-full sm:w-auto h-8 text-xs"
                         size="sm"
                         variant="outline"
                     >
                         {isDownloading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DownloadCloud className="mr-1 h-3 w-3" />}
                         {isDownloading ? 'Preparing...' : `Download Pairs (${jsonlRecords.length})`}
                     </Button>
                     <AlertDialog>
                         <AlertDialogTrigger asChild>
                             <Button
                                 variant="destructive"
                                 disabled={isFetching || isDownloading || !textsAreLoaded} // Removed scoring check
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
                                     This will clear all confirmed pairs from this session. Original texts and hidden paragraphs remain.
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
                         onParagraphSelect={handleParagraphSelect}
                         isSourceLanguage={true}
                         loadedText={englishText}
                         language="english"
                         onDropParagraph={handleDropParagraph}
                         hiddenIndices={hiddenIndices.english}
                         panelRef={englishPanelRef}
                         isScrollSyncEnabled={isScrollSyncEnabled}
                         onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                     />
                 </div>

                 {/* Hebrew Panel */}
                 <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col">
                     <TextAreaPanel
                         title="Hebrew"
                         displayedParagraphs={processedParagraphs.hebrew.displayed}
                         isLoading={isFetching && hebrewText === null}
                         selectedOriginalIndex={selectedHebrewIndex}
                         onParagraphSelect={handleParagraphSelect}
                         showControls={true}
                         onConfirmPair={handleConfirmPair}
                         onUnlink={handleUnlink}
                         canConfirmPair={canConfirmPair}
                         canUnlink={canUnlink}
                         controlsDisabled={controlsDisabled || !textsAreLoaded} // Removed scoring check
                         isSourceLanguage={false}
                         loadedText={hebrewText}
                         language="hebrew"
                         onDropParagraph={handleDropParagraph}
                         hiddenIndices={hiddenIndices.hebrew}
                         panelRef={hebrewPanelRef}
                         isScrollSyncEnabled={isScrollSyncEnabled}
                         onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                         onMergeUp={handleMergeUp}
                         onMergeDown={handleMergeDown}
                         // Removed scoring related props
                     />
                 </div>
             </div>
         </div>
     );
 }
