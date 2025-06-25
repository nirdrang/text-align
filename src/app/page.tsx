"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import InlineAlignmentControls from '@/components/inline-alignment-controls';
import { parseCsvFile } from '@/lib/utils';
import { splitSentences, bleu1 } from '@/lib/sentence_utils';
import { translateHebrewToEnglish } from '@/lib/client-translate';
import { parseParagraphs } from '@/lib/paragraph_utils';
import { fetchTextFromUrl } from '@/actions/fetch-text';


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
    "\u05F4": '"',      // gershayim  (U+05F4)  → double quote
    "\u05F3": "'",      // geresh      (U+05F3)  → apostrophe
    "\u201C": '"', "\u201D": '"',  // curly double quotes
    "\u2018": "'", "\u2019": "'", // curly single quotes
    "\u00AB": '"', "\u00BB": '"',  // angle quotes
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

    // Remove footnote markers like [1], [23], etc.
    t = t.replace(/\[\d+\]/g, '');

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
    anchorIndex?: number;
    score?: number | null; // Optional score
    scoreLoading?: boolean;
    len_ratio?: number;
 }

 function assignOriginalIndices(paragraphs: string[]): { paragraph: string; originalIndex: number; anchorIndex: number }[] {
     return paragraphs.map((paragraph, index) => ({ paragraph, originalIndex: index, anchorIndex: index }));
 }

 function filterMetadata(paragraphsWithIndices: { paragraph: string; originalIndex: number }[], hiddenIndices: Set<number>): { paragraph: string; originalIndex: number }[] {
     return paragraphsWithIndices.filter(item => !hiddenIndices.has(item.originalIndex));
 }

// Add this utility function near the top-level of the file (outside the component):
function adjustHighlightMapAfterRemoval(map: Record<number, any>, removedIdx: number): Record<number, any> {
  const newMap: Record<number, any> = {};
  Object.entries(map).forEach(([key, value]) => {
    const idx = Number(key);
    if (idx < removedIdx) {
      newMap[idx] = value;
    } else if (idx > removedIdx) {
      newMap[idx - 1] = value;
    }
    // else: skip the removed index
  });
  return newMap;
}

export default function Home() {
    // Always call all hooks first!
    const [isClient, setIsClient] = useState(false);
    useEffect(() => { setIsClient(true); }, []);

    const [englishUrl, setEnglishUrl] = useLocalStorage('englishUrl', '');
    const [hebrewUrl, setHebrewUrl] = useLocalStorage('hebrewUrl', '');
    const [englishText, setEnglishText] = useState<string | null>(null);
    const [hebrewText, setHebrewText] = useState<string | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const debouncedEnglishUrl = useDebounce(englishUrl, 500);
    const debouncedHebrewUrl = useDebounce(hebrewUrl, 500);
    const [processedParagraphs, setProcessedParagraphs] = useState<{
       english: {
           original: { paragraph: string; originalIndex: number; anchorIndex: number }[];
           displayed: DisplayedParagraphData[];
       };
       hebrew: {
           original: { paragraph: string; originalIndex: number; anchorIndex: number }[];
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
    // Add state for scoring
    const [isScoring, setIsScoring] = useState(false);
    const [scoreStart, setScoreStart] = useState('');
    const [scoreEnd, setScoreEnd] = useState('');
    // Add state for persistent folder handle
    const [folderHandle, setFolderHandle] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    const englishPanelRef = useRef<HTMLDivElement>(null);
    const hebrewPanelRef = useRef<HTMLDivElement>(null);
    const lastScrollTimeRef = useRef(0);

    const { toast } = useToast();

    const textsAreLoaded = englishText !== null && hebrewText !== null;

    // State for lectures and indices (must be declared before useMemo that uses them)
    const [hebrewLectures, setHebrewLectures] = useState<any[]>([]);
    const [englishLectures, setEnglishLectures] = useState<any[]>([]);
    const [hebrewLectureIdx, setHebrewLectureIdx] = useState(0);
    const [englishCandidates, setEnglishCandidates] = useState<any[]>([]);
    const [englishCandidateIdx, setEnglishCandidateIdx] = useState(0);
    // Remove useLocalStorage for englishUrl/hebrewUrl, use plain useState for manual input
    const [manualEnglishUrl, setManualEnglishUrl] = useState('');
    const [manualHebrewUrl, setManualHebrewUrl] = useState('');
    // Compute URLs from current lecture/candidate unless manually overridden
    const computedHebrewUrl = useMemo(() => {
        if (manualHebrewUrl) return manualHebrewUrl;
        if (hebrewLectures[hebrewLectureIdx]) return hebrewLectures[hebrewLectureIdx]['URL'] || '';
        return '';
    }, [manualHebrewUrl, hebrewLectures, hebrewLectureIdx]);
    const computedEnglishUrl = useMemo(() => {
        if (manualEnglishUrl) return manualEnglishUrl;
        if (englishCandidates.length > 0) return englishCandidates[englishCandidateIdx]['URL'] || '';
        return 'None';
    }, [manualEnglishUrl, englishCandidates, englishCandidateIdx]);

    // Add state for toggling the top UI section
    const [showLectureNav, setShowLectureNav] = useState(true);

    // Add state to track if JSONL file exists in folder
    const [jsonlFileExists, setJsonlFileExists] = useState(false);

    // Add state for skip-to-lecture input
    const [skipHebrewLecture, setSkipHebrewLecture] = useState('');

    // Add state for toggling the secondary (non-scoring) controls pane
    const [showControlsPane, setShowControlsPane] = useState(true);

    // Add state for dump range selection
    const [dumpStartIdx, setDumpStartIdx] = useState(hebrewLectureIdx + 1); // 1-based
    const [dumpEndIdx, setDumpEndIdx] = useState(hebrewLectureIdx + 1); // 1-based

    // Add state for Hebrew search window
    const [hebrewSearchBefore, setHebrewSearchBefore] = useState(2);
    const [hebrewSearchAfter, setHebrewSearchAfter] = useState(3);

    // Utility to check if JSONL file exists in folder
    async function checkJsonlFileExists(folderHandle: any, url: string) {
        if (!folderHandle || !url) {
            setJsonlFileExists(false);
            return;
        }
        const filename = getJsonlFilenameFromUrl(url);
        try {
            // Try to get the file handle without creating it
            await folderHandle.getFileHandle(filename, { create: false });
            setJsonlFileExists(true);
        } catch (err: any) {
            setJsonlFileExists(false);
        }
    }

    // Check for file existence when folder or English candidate changes
    useEffect(() => {
        checkJsonlFileExists(folderHandle, computedEnglishUrl);
    }, [folderHandle, computedEnglishUrl]);

    const handleFetchTexts = useCallback(async () => {
       // Always start fresh when fetching new texts
       await handleStartFresh();

       // Use the current input values, not debounced or stored values
       const urlToFetchEng = computedEnglishUrl;
       const urlToFetchHeb = computedHebrewUrl;

       if (!urlToFetchEng.trim() || !urlToFetchHeb.trim()) {
            toast({
                title: "Missing URLs",
                description: "Please enter both English and Hebrew URLs.",
                variant: "destructive",
                duration: 2000,
            });
           return;
       }
        // Populate cache on the server before fetching texts
        const populateCacheParams = { lectureIdx: hebrewLectureIdx };
        console.log('[Client] Calling /api/populate_cache with:', populateCacheParams);
        try {
            const res = await fetch('/api/populate_cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(populateCacheParams),
            });
            const data = await res.json();
            if (res.ok) {
                toast({ title: 'Cache Populated', description: `Lecture ${hebrewLectureIdx + 1} cache: ${data.count} records.`, duration: 2000 });
            } else {
                toast({ title: 'Cache Error', description: data.error || 'Failed to populate cache.', variant: 'destructive', duration: 2000 });
            }
        } catch (error: any) {
            toast({ title: 'Cache Error', description: error.message || 'Failed to populate cache.', variant: 'destructive', duration: 2000 });
        }

        setIsFetching(true);
        setEnglishText(null);
        setHebrewText(null);
        // The following resets are now handled by handleStartFresh:
        // setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } });
        // setHiddenIndices({ english: new Set(), hebrew: new Set() });
        // setSelectedEnglishIndex(null);
        // setSelectedHebrewIndex(null);
        // setCanConfirmPair(false);
        // setCanUnlink(false);
        // setControlsDisabled(true);
        // setIsScoring(false);

        try {
            const [fetchedEnglish, fetchedHebrew] = await fetchTexts(urlToFetchEng, urlToFetchHeb);
            setEnglishText(fetchedEnglish);
            setHebrewText(fetchedHebrew);

            const englishParagraphs = parseParagraphs(fetchedEnglish, 'english');
            const hebrewParagraphs = parseParagraphs(fetchedHebrew, 'hebrew');
            const englishParagraphsWithIndices = assignOriginalIndices(englishParagraphs);
            const hebrewParagraphsWithIndices = assignOriginalIndices(hebrewParagraphs);

            // No filtering of short paragraphs or metadata
            const mapToDisplayedData = (item: { paragraph: string; originalIndex: number; anchorIndex: number }): DisplayedParagraphData & { anchorIndex: number } => ({
                paragraph: item.paragraph,
                originalIndex: item.originalIndex,
                anchorIndex: item.anchorIndex,
                score: null, // Initialize score to null
                scoreLoading: false, // Initialize loading state
            });

            const initialEnglishDisplayed = englishParagraphsWithIndices.map(mapToDisplayedData);
            const initialHebrewDisplayed = hebrewParagraphsWithIndices.map(mapToDisplayedData);

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

            setSelectedEnglishIndex(null);
            setSelectedHebrewIndex(null);
            setCanConfirmPair(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            setIsScoring(false);

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
    }, [computedEnglishUrl, computedHebrewUrl, setHiddenIndices, toast, hebrewLectureIdx]);

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
            // Also select the English paragraph at the same displayed index
            if (processedParagraphs.english.displayed[displayedIndex]) {
                currentSelectedEnglish = processedParagraphs.english.displayed[displayedIndex].originalIndex;
            }
        }

        const englishSelected = currentSelectedEnglish !== null;
        const hebrewSelected = currentSelectedHebrew !== null;
        const newCanConfirmPair = englishSelected && hebrewSelected;
        const newCanUnlink = false;

        setSelectedEnglishIndex(currentSelectedEnglish);
        setSelectedHebrewIndex(currentSelectedHebrew);
        setCanConfirmPair(newCanConfirmPair);
        setCanUnlink(newCanUnlink);
      setControlsDisabled(!(newCanConfirmPair && textsAreLoaded));
   };

   const handleConfirmPair = () => {
       if (selectedEnglishIndex !== null && selectedHebrewIndex !== null && canConfirmPair) {
           // Find the displayed index of the selected pair
           const displayedIndex = processedParagraphs.hebrew.displayed.findIndex(p => p.originalIndex === selectedHebrewIndex);
           if (displayedIndex === -1) return;
           const englishParaData = processedParagraphs.english.displayed[displayedIndex];
           const hebrewParaData = processedParagraphs.hebrew.displayed[displayedIndex];
           if (englishParaData && hebrewParaData) {
               const enText = englishParaData.paragraph;
               const heText = hebrewParaData.paragraph;
               const record = {
                   anchor_id: englishParaData.anchorIndex,
                   messages: [
                       { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                       { role: 'user', content: enText },
                       { role: 'assistant', content: heText }
                   ]
               };
               setJsonlRecords(prevRecords => [...prevRecords, JSON.stringify(record)]);
               // Remove the confirmed pair from displayed arrays, preserve anchorIndex
               setProcessedParagraphs(prev => ({
                   english: {
                       original: prev.english.original,
                       displayed: prev.english.displayed.filter((_, idx) => idx !== displayedIndex),
                   },
                   hebrew: {
                       original: prev.hebrew.original,
                       displayed: prev.hebrew.displayed.filter((_, idx) => idx !== displayedIndex),
                   },
               }));
               setSelectedEnglishIndex(null);
               setSelectedHebrewIndex(null);
               setCanConfirmPair(false);
               setCanUnlink(false);
               setControlsDisabled(true);
               toast({
                   title: "Pair Confirmed",
                   description: `Paragraph pair removed from display and added to export list.`,
                   duration: 2000,
               });
               setHighlightMap(prev => adjustHighlightMapAfterRemoval(prev, displayedIndex));
               setEnglishHighlightMap(prev => adjustHighlightMapAfterRemoval(prev, displayedIndex));
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
           const newEnglishDisplayed = prev.english.original.map(item => ({...item, score: null, scoreLoading: false }));
           const newHebrewDisplayed = prev.hebrew.original.map(item => ({...item, score: null, scoreLoading: false }));
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
              .map((p, idx) => idx === displayedIndex - 1 ? { ...p, paragraph: mergedText, score: null, scoreLoading: false } : p)
              .filter((_, idx) => idx !== displayedIndex);

           const newHebrewHidden = new Set(hiddenIndices.hebrew);
           newHebrewHidden.delete(sourceOriginalIndex);

          setSelectedHebrewIndex(null);
          setSelectedEnglishIndex(null);
          setCanConfirmPair(false);
          setCanUnlink(false);
          setControlsDisabled(true);
          setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));

          toast({ title: "Paragraphs Merged", description: `Hebrew paragraphs merged. Re-score needed.`, duration: 2000 });

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
              .map((p, idx) => idx === displayedIndex ? { ...p, paragraph: mergedText, score: null, scoreLoading: false } : p)
              .filter((_, idx) => idx !== displayedIndex + 1);

           const newHebrewHidden = new Set(hiddenIndices.hebrew);
           newHebrewHidden.delete(targetOriginalIndex);

          setSelectedHebrewIndex(null);
          setSelectedEnglishIndex(null);
          setCanConfirmPair(false);
          setCanUnlink(false);
          setControlsDisabled(true);
           setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));

           toast({ title: "Paragraphs Merged", description: `Hebrew paragraphs merged. Re-score needed.`, duration: 2000 });

          return {
               ...prev,
               hebrew: {
                  original: newOriginalHebrew,
                  displayed: newDisplayedHebrew,
               },
           };
      });
   };

   // Utility to get JSONL filename from English URL
   function getJsonlFilenameFromUrl(url: string): string {
       try {
           const parsed = new URL(url);
           const path = parsed.pathname;
           let file = path.split('/').pop() || '';
           file = file.split('?')[0].split('#')[0];
           if (file.match(/\.html?$/i)) {
               return file.replace(/\.html?$/i, '.jsonl');
           }
           if (file.includes('.')) {
               return file.replace(/\.[^.]+$/, '.jsonl');
           }
           if (file.length > 0) {
               return file + '.jsonl';
           }
           return (parsed.hostname || 'fine_tune') + '.jsonl';
       } catch {
           return 'fine_tune.jsonl';
       }
   }

   const handleDownloadJsonl = () => {
       if (jsonlRecords.length === 0) {
           toast({ title: "Download Error", description: "No confirmed pairs to download.", variant: "destructive", duration: 2000 });
           return;
       }
       setIsDownloading(true);
       try {
           const jsonlContent = jsonlRecords.join('\n') + '\n';
           const filename = getJsonlFilenameFromUrl(englishUrl);
           const blob = new Blob([jsonlContent], { type: "application/jsonl;charset=utf-8" });
           saveAs(blob, filename);
           toast({ title: "Download Started", description: `Downloading ${filename} file.`, duration: 2000 });
       } catch (error: any) {
           toast({ title: "Download Failed", description: error.message || "Error generating download.", variant: "destructive", duration: 2000 });
       } finally {
           setIsDownloading(false);
       }
   };

   // --- Sentence Matching and Highlighting State ---
   const [highlightMap, setHighlightMap] = useState<{
     [hebrewParagraphIdx: number]: { green?: number; red?: number }
   }>({});
   const [englishHighlightMap, setEnglishHighlightMap] = useState<{
     [englishParagraphIdx: number]: { green?: number; red?: number; greenOnly?: boolean }
   }>({});
   const [isMatchingSentences, setIsMatchingSentences] = useState(false);

   const handleFindSentenceMatches = async () => {
     setIsMatchingSentences(true);
     setHighlightMap({});
     setEnglishHighlightMap({});
     const SEARCH_WINDOW = { before: hebrewSearchBefore, after: hebrewSearchAfter };
     const englishDisplayed = processedParagraphs.english.displayed;
     const hebrewDisplayed = processedParagraphs.hebrew.displayed;
     const englishSentencesByParagraph = englishDisplayed.map(p => splitSentences(p.paragraph, 'english'));

     // Use the same range as scoring
     let matchStart = 0;
     let matchEnd = Math.min(englishDisplayed.length - 1, processedParagraphs.english.displayed.length - 1);
     if (scoreStart) {
       matchStart = Math.max(0, parseInt(scoreStart, 10) - 1);
     }
     if (scoreEnd) {
       matchEnd = Math.min(englishDisplayed.length - 1, parseInt(scoreEnd, 10) - 1);
     }

     for (let engIdx = matchStart; engIdx <= matchEnd; engIdx++) {
       if (!englishDisplayed[engIdx]) continue;
       const sentences = englishSentencesByParagraph[engIdx];
       console.log(`[DEBUG] English paragraph ${engIdx} sentences:`, sentences);
       // Progressive update for English highlight map
       if (sentences.length === 1) {
         setEnglishHighlightMap(prev => ({ ...prev, [engIdx]: { greenOnly: true } }));
         continue;
       } else if (sentences.length >= 2) {
         setEnglishHighlightMap(prev => ({ ...prev, [engIdx]: { green: 0, red: sentences.length - 1 } }));
       }
       if (sentences.length < 2) continue;
       const firstSentence = sentences[0];
       const lastSentence = sentences[sentences.length - 1];
       const engEndSentIdx = sentences.length - 1;
       let bestGreen = { paraIdx: -1, sentIdx: -1, score: 0 };
       let bestRed = { paraIdx: -1, sentIdx: -1, score: 0 };
       const startHebIdx = Math.max(0, engIdx - SEARCH_WINDOW.before);
       const endHebIdx = Math.min(hebrewDisplayed.length - 1, engIdx + SEARCH_WINDOW.after);
       for (let hebIdx = startHebIdx; hebIdx <= endHebIdx; hebIdx++) {
         if (!hebrewDisplayed[hebIdx]) continue;
         const hebPara = hebrewDisplayed[hebIdx].paragraph;
         let hebParaEnglish = '';
         try {
           hebParaEnglish = await translateHebrewToEnglish(hebPara);
           console.log(`[DEBUG] [engIdx ${engIdx}] Translated Hebrew paragraph at hebIdx ${hebIdx}:`, hebParaEnglish);
         } catch (err) {
           hebParaEnglish = '';
           console.log(`[DEBUG] [engIdx ${engIdx}] Error translating Hebrew paragraph at hebIdx ${hebIdx}`);
         }
         const hebSentencesEnglish = splitSentences(hebParaEnglish, 'english');
         const hebSentencesHebrew = splitSentences(hebPara, 'hebrew');
         console.log(`[DEBUG] [engIdx ${engIdx}] Hebrew paragraph ${hebIdx} split into sentences (EN):`, hebSentencesEnglish);
         console.log(`[DEBUG] [engIdx ${engIdx}] Hebrew paragraph ${hebIdx} split into sentences (HE):`, hebSentencesHebrew);
         for (let sIdx = 0; sIdx < hebSentencesEnglish.length; sIdx++) {
           const heSent = hebSentencesEnglish[sIdx];
           const greenScore = await advancedSentenceScore(firstSentence, heSent);
           const redScore = await advancedSentenceScore(lastSentence, heSent);
           // Separate logs for start (green) and end (red) matching
           // For start match, English sentence index is 0
           console.log(`[DEBUG][START MATCH][engIdx ${engIdx}][hebIdx ${hebIdx}][engSentIdx 0][hebSentIdx ${sIdx}] greenScore =`, greenScore, '| current max =', bestGreen.score, '\n  firstSentence:', firstSentence, '\n  heSent:', heSent);
           if (greenScore > bestGreen.score) {
             bestGreen = { paraIdx: hebIdx, sentIdx: sIdx, score: greenScore };
             console.log(`[DEBUG][START MATCH][engIdx ${engIdx}][hebIdx ${hebIdx}][engSentIdx 0][hebSentIdx ${sIdx}] New best green: score ${greenScore}`);
           }
           // For end match, English sentence index is engEndSentIdx
           console.log(`[DEBUG][END MATCH][engIdx ${engIdx}][hebIdx ${hebIdx}][engSentIdx ${engEndSentIdx}][hebSentIdx ${sIdx}] redScore =`, redScore, '| current max =', bestRed.score, '\n  lastSentence:', lastSentence, '\n  heSent:', heSent);
           if (redScore > bestRed.score) {
             bestRed = { paraIdx: hebIdx, sentIdx: sIdx, score: redScore };
             console.log(`[DEBUG][END MATCH][engIdx ${engIdx}][hebIdx ${hebIdx}][engSentIdx ${engEndSentIdx}][hebSentIdx ${sIdx}] New best red: score ${redScore}`);
           }
         }
       }
       
       // Handle conflicts: if green and red point to the same sentence, resolve the conflict
       if (bestGreen.paraIdx !== -1 && bestRed.paraIdx !== -1 && 
           bestGreen.paraIdx === bestRed.paraIdx && bestGreen.sentIdx === bestRed.sentIdx) {
         console.log(`[engIdx ${engIdx}] Conflict detected: both green and red want hebIdx ${bestGreen.paraIdx}, sentIdx ${bestGreen.sentIdx}`);
         console.log(`[engIdx ${engIdx}] Green score: ${bestGreen.score}, Red score: ${bestRed.score}`);
         
         // Keep the one with higher score, clear the other
         if (bestGreen.score >= bestRed.score) {
           console.log(`[engIdx ${engIdx}] Keeping green (higher score), clearing red`);
           bestRed = { paraIdx: -1, sentIdx: -1, score: 0 };
         } else {
           console.log(`[engIdx ${engIdx}] Keeping red (higher score), clearing green`);
           bestGreen = { paraIdx: -1, sentIdx: -1, score: 0 };
         }
       }
       
       if (bestGreen.paraIdx !== -1) {
         setHighlightMap(prev => ({
           ...prev,
           [bestGreen.paraIdx]: {
             ...(prev[bestGreen.paraIdx] || {}),
             green: bestGreen.sentIdx
           }
         }));
         console.log(`[engIdx ${engIdx}] Highlight green: hebIdx ${bestGreen.paraIdx}, sentIdx ${bestGreen.sentIdx}`);
       }
       if (bestRed.paraIdx !== -1) {
         setHighlightMap(prev => ({
           ...prev,
           [bestRed.paraIdx]: {
             ...(prev[bestRed.paraIdx] || {}),
             red: bestRed.sentIdx
           }
         }));
         console.log(`[engIdx ${engIdx}] Highlight red: hebIdx ${bestRed.paraIdx}, sentIdx ${bestRed.sentIdx}`);
       }
       // Yield to browser for progressive rendering
       await new Promise(res => setTimeout(res, 0));
     }
     setIsMatchingSentences(false);
     console.log(`[Sentence Matching Complete] Highlights for English paragraphs in selected range.`);
     toast({ title: "Sentence Matching Complete", description: `Highlights for English paragraphs in selected range.`, duration: 2000 });
   };

   const handleStartFresh = async () => {
       localStorage.removeItem('jsonlRecords');
       setJsonlRecords([]);
       setSelectedEnglishIndex(null);
       setSelectedHebrewIndex(null);
       setCanConfirmPair(false);
       setCanUnlink(false);
       setControlsDisabled(true);

       // Re-apply initial metadata filtering if texts are loaded
       if (textsAreLoaded) {
           setHiddenIndices({ english: new Set<number>(), hebrew: new Set<number>() });
           setProcessedParagraphs(prev => ({
               english: {
                   original: prev.english.original,
                   displayed: prev.english.original.map(item => ({...item, score: null, scoreLoading: false })),
               },
               hebrew: {
                   original: prev.hebrew.original,
                   displayed: prev.hebrew.original.map(item => ({...item, score: null, scoreLoading: false })),
               },
           }));
       }
       // Do NOT run sentence matching here
       toast({ title: "Started Pairing Fresh", description: "Cleared confirmed pairs.", duration: 2000 });
   };

  // Scroll synchronization: keeps corresponding paragraph display numbers aligned between panels
  useEffect(() => {
     // Find the scrollable div within each panel
     const englishPanel = englishPanelRef.current;
     const hebrewPanel = hebrewPanelRef.current;
     
     const englishScrollArea = englishPanel?.querySelector('.overflow-y-scroll') as HTMLElement;
     const hebrewScrollArea = hebrewPanel?.querySelector('.overflow-y-scroll') as HTMLElement;

     if (!englishScrollArea || !hebrewScrollArea) {
         return;
     }

     let englishScrollTimeout: NodeJS.Timeout | null = null;
     let hebrewScrollTimeout: NodeJS.Timeout | null = null;
     let isProgrammaticScroll = false;

     const getTopVisibleDisplayedIndex = (scrollArea: HTMLElement): number => {
          if (!scrollArea) return -1;
          const scrollAreaRect = scrollArea.getBoundingClientRect();
          const paragraphElements = Array.from(scrollArea.querySelectorAll('.paragraph-box')) as HTMLElement[];

          // Find the paragraph that's most prominently visible at the top
          for (let i = 0; i < paragraphElements.length; i++) {
              const pElement = paragraphElements[i];
              const pRect = pElement.getBoundingClientRect();
              
              // Check if this paragraph is meaningfully visible (more than just bottom edge)
              const visibleHeight = Math.min(pRect.bottom, scrollAreaRect.bottom) - Math.max(pRect.top, scrollAreaRect.top);
              if (visibleHeight > 20) { // At least 20px visible
                  return i;
              }
          }
          return 0; // Default to first paragraph
     };

     const syncScroll = (sourceScrollArea: HTMLElement, targetScrollArea: HTMLElement) => {
         const sourceTopIndex = getTopVisibleDisplayedIndex(sourceScrollArea);
         
         // Get the display number of the currently visible source paragraph
         const sourceParagraphs = Array.from(sourceScrollArea.querySelectorAll('.paragraph-box')) as HTMLElement[];
         const sourceParagraph = sourceParagraphs[sourceTopIndex];
         if (!sourceParagraph) return;
         
         const sourceNumberSpan = sourceParagraph.querySelector('span');
         const sourceDisplayNumber = sourceNumberSpan ? parseInt(sourceNumberSpan.textContent || '1') : sourceTopIndex + 1;
         
         // Find the target paragraph with the same display number
         const targetParagraphs = Array.from(targetScrollArea.querySelectorAll('.paragraph-box')) as HTMLElement[];
         let targetParagraph = null;
         
         for (let i = 0; i < targetParagraphs.length; i++) {
             const paragraph = targetParagraphs[i];
             const numberSpan = paragraph.querySelector('span');
             const displayNumber = numberSpan ? parseInt(numberSpan.textContent || '1') : i + 1;
             
             if (displayNumber === sourceDisplayNumber) {
                 targetParagraph = paragraph;
                 break;
             }
         }

         if (targetParagraph) {
             // Calculate precise scroll position to align the target paragraph at the top
             const containerRect = targetScrollArea.getBoundingClientRect();
             const paragraphRect = targetParagraph.getBoundingClientRect();
             
             const currentScrollTop = targetScrollArea.scrollTop;
             const paragraphOffsetFromTop = paragraphRect.top - containerRect.top;
             const newScrollTop = currentScrollTop + paragraphOffsetFromTop;
             
             targetScrollArea.scrollTop = newScrollTop;
         }
     };

     const handleEnglishScroll = () => {
         if (!isScrollSyncEnabled || isProgrammaticScroll) return;
         if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
         englishScrollTimeout = setTimeout(() => {
              isProgrammaticScroll = true;
              syncScroll(englishScrollArea, hebrewScrollArea);
              setTimeout(() => isProgrammaticScroll = false, 150);
         }, 100);
     };

     const handleHebrewScroll = () => {
         if (!isScrollSyncEnabled || isProgrammaticScroll) return;
          if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
          hebrewScrollTimeout = setTimeout(() => {
              isProgrammaticScroll = true;
              syncScroll(hebrewScrollArea, englishScrollArea);
              setTimeout(() => isProgrammaticScroll = false, 150);
          }, 100);
      };

     // Always add event listeners, but check isScrollSyncEnabled inside the handlers
     englishScrollArea.addEventListener('scroll', handleEnglishScroll);
     hebrewScrollArea.addEventListener('scroll', handleHebrewScroll);

      // Always return cleanup function to ensure event listeners are removed
      return () => {
         englishScrollArea?.removeEventListener('scroll', handleEnglishScroll);
         hebrewScrollArea?.removeEventListener('scroll', handleHebrewScroll);
         if (englishScrollTimeout) clearTimeout(englishScrollTimeout);
         if (hebrewScrollTimeout) clearTimeout(hebrewScrollTimeout);
      };
}, [englishPanelRef, hebrewPanelRef, processedParagraphs.english.displayed, processedParagraphs.hebrew.displayed, isScrollSyncEnabled]);

const handleRemoveParagraph = (displayedIndex: number, language: 'english' | 'hebrew') => {
    setProcessedParagraphs(prev => {
        const updated = [...prev[language].displayed];
        updated.splice(displayedIndex, 1);
        return {
            ...prev,
            [language]: {
                original: updated.map((p, i) => ({ ...p, originalIndex: i })),
                displayed: updated.map((p, i) => ({ ...p, originalIndex: i, score: null, scoreLoading: false })),
            }
        };
    });
    setSelectedEnglishIndex(null);
    setSelectedHebrewIndex(null);
    setCanConfirmPair(false);
    setCanUnlink(false);
    setControlsDisabled(true);
    toast({ title: 'Paragraph Removed', description: `Removed paragraph ${displayedIndex + 1} from ${language}.`, duration: 2000 });
};

const onDropParagraph = (originalIndex: number, language: 'english' | 'hebrew') => {
    // Find the displayedIndex for the paragraph to remove
    const displayedIndex = processedParagraphs[language].displayed.findIndex(p => p.originalIndex === originalIndex);
    if (displayedIndex !== -1) {
        handleRemoveParagraph(displayedIndex, language);
    }
};

// Add handler for confirming all pairs upwards
const handleConfirmAllPairsUpwards = () => {
    if (selectedHebrewIndex === null || selectedEnglishIndex === null) return;
    // Find the displayed index of the selected pair
    const selectedHebrewDisplayedIndex = processedParagraphs.hebrew.displayed.findIndex(p => p.originalIndex === selectedHebrewIndex);
    const selectedEnglishDisplayedIndex = processedParagraphs.english.displayed.findIndex(p => p.originalIndex === selectedEnglishIndex);
    if (selectedHebrewDisplayedIndex === -1 || selectedEnglishDisplayedIndex === -1) return;
    // Confirm all pairs from 0 to selected index (inclusive)
    const newJsonlRecords = [...jsonlRecords];
    for (let i = 0; i <= selectedHebrewDisplayedIndex; i++) {
        const hePara = processedParagraphs.hebrew.displayed[i];
        const enPara = processedParagraphs.english.displayed[i];
        if (!hePara || !enPara) continue;
        const record = {
            anchor_id: enPara.anchorIndex,
            messages: [
                { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                { role: 'user', content: enPara.paragraph },
                { role: 'assistant', content: hePara.paragraph }
            ]
        };
        newJsonlRecords.push(JSON.stringify(record));
    }
    setJsonlRecords(newJsonlRecords);
    // Remove confirmed pairs from displayed arrays, preserve anchorIndex
    setProcessedParagraphs(prev => ({
        english: {
            original: prev.english.original,
            displayed: prev.english.displayed.slice(selectedHebrewDisplayedIndex + 1),
        },
        hebrew: {
            original: prev.hebrew.original,
            displayed: prev.hebrew.displayed.slice(selectedHebrewDisplayedIndex + 1),
        },
    }));
    setSelectedEnglishIndex(null);
    setSelectedHebrewIndex(null);
    setCanConfirmPair(false);
    setCanUnlink(false);
    setControlsDisabled(true);
    toast({ title: 'Pairs Confirmed', description: `Confirmed all pairs up to ${selectedHebrewDisplayedIndex + 1}.`, duration: 2000 });
};

// IndexedDB key for folder handle
const FOLDER_HANDLE_KEY = 'pairs_folder_handle';

// Save folder handle to IndexedDB
async function saveFolderHandle(handle: any) {
    if ('storage' in navigator && 'persist' in navigator.storage) {
        await navigator.storage.persist();
    }
    if ('showDirectoryPicker' in window && 'indexedDB' in window) {
        const db = await window.indexedDB.open('pairs-db', 1);
        db.onupgradeneeded = () => db.result.createObjectStore('handles');
        await new Promise(resolve => (db.onsuccess = resolve));
        const tx = db.result.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, FOLDER_HANDLE_KEY);
        await new Promise(resolve => (tx.oncomplete = resolve));
        db.result.close();
    }
}
// Restore folder handle from IndexedDB
async function restoreFolderHandle() {
    if ('showDirectoryPicker' in window && 'indexedDB' in window) {
        const db = await window.indexedDB.open('pairs-db', 1);
        db.onupgradeneeded = () => db.result.createObjectStore('handles');
        await new Promise(resolve => (db.onsuccess = resolve));
        const tx = db.result.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get(FOLDER_HANDLE_KEY);
        const handle = await new Promise(resolve => (req.onsuccess = () => resolve(req.result)));
        db.result.close();
        return handle;
    }
    return null;
}
// Pick a folder and persist the handle
async function pickFolder() {
    try {
        // @ts-ignore
        const handle = await window.showDirectoryPicker();
        setFolderHandle(handle);
        await saveFolderHandle(handle);
        toast({ title: 'Folder Chosen', description: 'Pairs will be saved to this folder.', duration: 2000 });
    } catch (err: any) {
        toast({ title: 'Folder Not Chosen', description: err.message || 'No folder selected.', variant: 'destructive', duration: 2000 });
    }
}
// Save JSONL to the chosen folder
async function saveJsonlToFolder(jsonlContent: string, filename: string) {
    if (!folderHandle) {
        toast({ title: 'No Folder', description: 'Please choose a folder first.', variant: 'destructive', duration: 2000 });
        return;
    }
    try {
        // Request permission if needed
        const perm = await folderHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') throw new Error('Permission denied');
        const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonlContent);
        await writable.close();
        toast({ title: 'Saved', description: `Pairs saved to folder as ${filename}.`, duration: 2000 });
    } catch (err: any) {
        toast({ title: 'Save Failed', description: err.message || 'Failed to save to folder.', variant: 'destructive', duration: 2000 });
    }
}
// Restore folder handle on mount
useEffect(() => {
    restoreFolderHandle().then(handle => {
        if (handle) setFolderHandle(handle);
    });
}, []);

// --- Hebrew/English lecture traversal state ---
const [hebrewCsvLoaded, setHebrewCsvLoaded] = useState(false);
const [englishCsvLoaded, setEnglishCsvLoaded] = useState(false);

// Load CSVs on mount
useEffect(() => {
    parseCsvFile('/hebrew_list_eng_ordered.csv').then(setHebrewLectures).then(() => setHebrewCsvLoaded(true));
    parseCsvFile('/lectures_ordered_new.csv').then(setEnglishLectures).then(() => setEnglishCsvLoaded(true));
}, []);

// When Hebrew lecture changes, update English candidates
useEffect(() => {
    if (!hebrewCsvLoaded || !englishCsvLoaded || hebrewLectures.length === 0) return;
    const hebrew = hebrewLectures[hebrewLectureIdx];
    if (!hebrew) return;
    const date = hebrew['Date'];
    let candidates = englishLectures.filter(e => e['Date'] === date);
    // If multiple English lectures for the same date, prefer GA match but do NOT discard additional GA matches
    const hebrewGA = hebrew['GA'];
    if (candidates.length > 1 && hebrewGA) {
      const gaMatches = candidates.filter(e => e['GA'] === hebrewGA);
      if (gaMatches.length > 0) candidates = gaMatches; // keep all matches with same GA
    }
    setEnglishCandidates(candidates);
    setEnglishCandidateIdx(0);
    // Set URLs in input boxes
    setManualHebrewUrl(hebrew['URL'] || '');
    setManualEnglishUrl(candidates.length > 0 ? candidates[0]['URL'] : 'None');
}, [hebrewLectureIdx, hebrewLectures, englishLectures, hebrewCsvLoaded, englishCsvLoaded]);

// When English candidate changes, update English URL
useEffect(() => {
    if (englishCandidates.length === 0) {
        setManualEnglishUrl('None');
    } else {
        setManualEnglishUrl(englishCandidates[englishCandidateIdx]['URL'] || 'None');
    }
}, [englishCandidateIdx, englishCandidates]);

// --- Navigation handlers ---
const handleNextHebrewLecture = () => {
    setHebrewLectureIdx(idx => Math.min(idx + 1, hebrewLectures.length - 1));
    setManualHebrewUrl('');
    setManualEnglishUrl('');
};
const handlePrevHebrewLecture = () => {
    setHebrewLectureIdx(idx => Math.max(idx - 1, 0));
    setManualHebrewUrl('');
    setManualEnglishUrl('');
};
const handleNextEnglishCandidate = () => {
    setEnglishCandidateIdx(idx => Math.min(idx + 1, englishCandidates.length - 1));
    setManualEnglishUrl('');
};
const handlePrevEnglishCandidate = () => {
    setEnglishCandidateIdx(idx => Math.max(idx - 1, 0));
    setManualEnglishUrl('');
};

// Add a handler to delete the JSONL file
async function handleDeleteJsonlFile() {
    if (!folderHandle || !computedEnglishUrl) return;
    const filename = getJsonlFilenameFromUrl(computedEnglishUrl);
    try {
        await folderHandle.removeEntry(filename);
        toast({ title: 'File Deleted', description: `Deleted ${filename} from folder.`, duration: 2000 });
        setJsonlFileExists(false);
    } catch (err: any) {
        toast({ title: 'Delete Failed', description: err?.message || 'Could not delete JSONL file from folder.', variant: 'destructive', duration: 2000 });
    }
}

// Handler to update a paragraph after editing
const handleEditParagraph = (language: 'english' | 'hebrew') => (displayedIndex: number, newText: string) => {
  setProcessedParagraphs(prev => {
    const updated = { ...prev };
    updated[language] = {
      ...prev[language],
      displayed: prev[language].displayed.map((p, i) =>
        i === displayedIndex ? { ...p, paragraph: newText, score: null, scoreLoading: false } : p
      ),
    };
    return updated;
  });
};

// Add this function to revert the last confirmed pair
function handleRevertLastPair() {
  setJsonlRecords(prevRecords => {
    if (prevRecords.length === 0) return prevRecords;
    let enText = '', heText = '', anchor_id = null;
    const removed = prevRecords[prevRecords.length - 1];
    try {
      const obj = JSON.parse(removed);
      anchor_id = obj.anchor_id;
      if (obj.messages && obj.messages.length === 3) {
        enText = obj.messages[1].content;
        heText = obj.messages[2].content;
      }
    } catch {}
    setProcessedParagraphs(prev => {
      let englishDisplayed = prev.english.displayed;
      let hebrewDisplayed = prev.hebrew.displayed;
      const enExists = englishDisplayed.some(p => p.paragraph === enText);
      const heExists = hebrewDisplayed.some(p => p.paragraph === heText);
      if (!enExists && enText) {
        englishDisplayed = [
          { paragraph: enText, originalIndex: 0, anchorIndex: anchor_id },
          ...englishDisplayed
        ];
        englishDisplayed = englishDisplayed.map((p, i) => ({ ...p, originalIndex: i }));
      }
      if (!heExists && heText) {
        hebrewDisplayed = [
          { paragraph: heText, originalIndex: 0, anchorIndex: anchor_id },
          ...hebrewDisplayed
        ];
        hebrewDisplayed = hebrewDisplayed.map((p, i) => ({ ...p, originalIndex: i }));
      }
      return {
        english: {
          original: prev.english.original,
          displayed: englishDisplayed,
        },
        hebrew: {
          original: prev.hebrew.original,
          displayed: hebrewDisplayed,
        },
      };
    });
    return prevRecords.slice(0, -1);
  });
}

// Add merge up/down for English panel
function handleMergeUpEnglish(displayedIndex: number) {
  setProcessedParagraphs(prev => {
    const displayedEnglish = [...prev.english.displayed];
    if (displayedIndex <= 0) return prev;
    const targetParagraphData = displayedEnglish[displayedIndex - 1];
    const sourceParagraphData = displayedEnglish[displayedIndex];
    const mergedText = `${targetParagraphData.paragraph} ${sourceParagraphData.paragraph}`;
    const targetOriginalIndex = targetParagraphData.originalIndex;
    const sourceOriginalIndex = sourceParagraphData.originalIndex;
    let newDisplayedEnglish = displayedEnglish
      .map((p, idx) => idx === displayedIndex - 1 ? { ...p, paragraph: mergedText } : p)
      .filter((_, idx) => idx !== displayedIndex);
    newDisplayedEnglish = newDisplayedEnglish.map((p, i) => ({ ...p, originalIndex: i }));
    return {
      ...prev,
      english: {
        ...prev.english,
        displayed: newDisplayedEnglish,
      },
    };
  });
}

function handleMergeDownEnglish(displayedIndex: number) {
  setProcessedParagraphs(prev => {
    const displayedEnglish = [...prev.english.displayed];
    if (displayedIndex >= displayedEnglish.length - 1) return prev;
    const sourceParagraphData = displayedEnglish[displayedIndex];
    const targetParagraphData = displayedEnglish[displayedIndex + 1];
    const mergedText = `${sourceParagraphData.paragraph} ${targetParagraphData.paragraph}`;
    const sourceOriginalIndex = sourceParagraphData.originalIndex;
    const targetOriginalIndex = targetParagraphData.originalIndex;
    let newDisplayedEnglish = displayedEnglish
      .map((p, idx) => idx === displayedIndex ? { ...p, paragraph: mergedText } : p)
      .filter((_, idx) => idx !== displayedIndex + 1);
    newDisplayedEnglish = newDisplayedEnglish.map((p, i) => ({ ...p, originalIndex: i }));
    return {
      ...prev,
      english: {
        ...prev.english,
        displayed: newDisplayedEnglish,
      },
    };
  });
}

 // --- SCORING FUNCTIONALITY ---
 const handleCalculateSingleScore = useCallback(async (displayedIndex: number) => {
   const hebrewParaData = processedParagraphs.hebrew.displayed[displayedIndex];
   const englishParaData = processedParagraphs.english.displayed[displayedIndex]; // Assuming 1-to-1 index correspondence after filtering

   if (!hebrewParaData || !englishParaData) {
     console.warn(`[Score] Cannot score index ${displayedIndex}: Paragraph data missing.`);
     return;
   }

   setProcessedParagraphs(prev => ({
     ...prev,
     hebrew: {
       ...prev.hebrew,
       displayed: prev.hebrew.displayed.map((p, idx) =>
         idx === displayedIndex ? { ...p, scoreLoading: true, score: null } : p
       ),
     },
   }));

   try {
     const logIndex = displayedIndex + 1;
     const response = await fetch('/api/score', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ en: englishParaData.paragraph, he: hebrewParaData.paragraph }),
     });

     if (!response.ok) {
       const errorData = await response.json();
       throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
     }

     const scoreResult = await response.json();

     setProcessedParagraphs(prev => ({
       ...prev,
       hebrew: {
         ...prev.hebrew,
         displayed: prev.hebrew.displayed.map((p, idx) =>
           idx === displayedIndex ? { ...p, score: scoreResult.blended, len_ratio: scoreResult.len_ratio, scoreLoading: false } : p
         ),
       },
     }));
   } catch (error: any) {
     toast({
       title: `Score Error (Para ${displayedIndex + 1})`,
       description: error.message || "Failed to calculate score.",
       variant: "destructive",
       duration: 2000,
     });
     setProcessedParagraphs(prev => ({
       ...prev,
       hebrew: {
         ...prev.hebrew,
         displayed: prev.hebrew.displayed.map((p, idx) =>
           idx === displayedIndex ? { ...p, scoreLoading: false, score: null } : p
         ),
       },
     }));
   }
 }, [processedParagraphs.english.displayed, processedParagraphs.hebrew.displayed, toast]);

 const handleCalculateAllScores = useCallback(async () => {
   if (!textsAreLoaded || isScoring) {
     return;
   }
   setIsScoring(true);
   toast({ title: "Calculating Scores...", description: "Please wait.", duration: 5000 });

   setProcessedParagraphs(prev => ({
     ...prev,
     hebrew: {
       ...prev.hebrew,
       displayed: prev.hebrew.displayed.map(p => ({ ...p, scoreLoading: true, score: null })),
     },
   }));

   const scorePromises = processedParagraphs.hebrew.displayed.map((_, index) =>
     handleCalculateSingleScore(index)
   );

   try {
     await Promise.all(scorePromises);
     toast({ title: "Scoring Complete", description: "Scores have been updated.", duration: 2000 });
   } catch (error) {
     toast({ title: "Scoring Failed", description: "Some scores could not be calculated.", variant: "destructive", duration: 2000 });
   } finally {
     setIsScoring(false);
   }
 }, [textsAreLoaded, isScoring, processedParagraphs.hebrew.displayed, handleCalculateSingleScore, toast]);

 const handleScoreRange = async () => {
   if (!scoreStart) return;
   const start = Math.max(0, parseInt(scoreStart, 10) - 1);
   const end = scoreEnd ? Math.min(processedParagraphs.hebrew.displayed.length - 1, parseInt(scoreEnd, 10) - 1) : processedParagraphs.hebrew.displayed.length - 1;
   setIsScoring(true);
   for (let i = start; i <= end; i++) {
     await handleCalculateSingleScore(i);
   }
   setIsScoring(false);
   toast({ title: "Scoring Complete", description: `Scored paragraphs ${start + 1}${end > start ? `-${end + 1}` : ''}.`, duration: 2000 });
 };
 // --- END SCORING FUNCTIONALITY ---

  // Advanced sentence scoring function using API call instead of direct import
  const advancedSentenceScore = async (en: string, mt_en: string): Promise<number> => {
    try {
      const response = await fetch('/api/sentence_match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          englishSentences: [en],
          hebrewParagraphEnglish: mt_en
        }),
      });

      if (!response.ok) {
        console.warn('Advanced scoring API failed, falling back to BLEU-1');
        return bleu1(en, mt_en);
      }

      const result = await response.json();
      if (result.matches && result.matches.length > 0) {
        return result.matches[0].score;
      } else {
        return bleu1(en, mt_en);
      }
    } catch (error) {
      console.warn('Advanced scoring failed, falling back to BLEU-1:', error);
      return bleu1(en, mt_en);
    }
  };

  // Only block rendering, not hook calls
  if (!isClient) return null;

return (
    <div className="flex flex-col h-screen bg-background">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
            <h1 className="text-xl font-semibold">Text Aligner</h1>
            <div className="flex gap-2">
                <Button variant="default" size="sm">
                    Text Alignment
                </Button>
                <Button variant="outline" size="sm" asChild>
                    <a href="/nikud">Nikud Processor</a>
                </Button>
            </div>
        </div>
        
        <div className="flex flex-col flex-grow p-4">
             {/* --- Scoring & Matching Controls Pane (always visible) --- */}
             <Card className="mb-2 shadow-sm">
               <CardContent className="flex flex-wrap gap-2 items-center p-3">
                 <Input
                type="number"
                min={1}
                   max={processedParagraphs.hebrew.displayed.length}
                   value={scoreStart}
                   onChange={e => setScoreStart(e.target.value)}
                   placeholder="Start"
                   className="w-20"
                   disabled={!textsAreLoaded || isScoring}
                 />
                 <span>-</span>
                 <Input
                   type="number"
                   min={1}
                   max={processedParagraphs.hebrew.displayed.length}
                   value={scoreEnd}
                   onChange={e => setScoreEnd(e.target.value)}
                   placeholder="End (leave blank for all)"
                   className="w-20"
                   disabled={!textsAreLoaded || isScoring}
              />
              <Button
                   onClick={handleScoreRange}
                   disabled={!textsAreLoaded || isScoring || !scoreStart}
                size="sm"
                   variant="secondary"
                   className="h-8 px-3"
                 >
                   {isScoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                   {isScoring ? 'Scoring...' : 'Score Selected'}
              </Button>
                 <Button
                   onClick={handleCalculateAllScores}
                   disabled={!textsAreLoaded || isScoring}
                   className="h-8 px-3 text-xs"
                   size="sm"
                   variant="secondary"
                 >
                   {isScoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                   {isScoring ? 'Scoring...' : 'Score All Paragraphs'}
                 </Button>
                 <div className="flex items-center gap-1">
                   <label htmlFor="hebrew-search-before" className="text-xs">Hebrew Window</label>
                   <Input
                     id="hebrew-search-before"
                     type="number"
                     min={0}
                     max={10}
                     value={hebrewSearchBefore}
                     onChange={e => setHebrewSearchBefore(Number(e.target.value))}
                     className="w-14"
                     disabled={!textsAreLoaded || isMatchingSentences}
                     style={{ fontSize: '0.9em' }}
                   />
                   <span className="text-xs">before</span>
                   <Input
                     id="hebrew-search-after"
                     type="number"
                     min={0}
                     max={10}
                     value={hebrewSearchAfter}
                     onChange={e => setHebrewSearchAfter(Number(e.target.value))}
                     className="w-14"
                     disabled={!textsAreLoaded || isMatchingSentences}
                     style={{ fontSize: '0.9em' }}
                   />
                   <span className="text-xs">after</span>
                 </div>
                 <Button
                   onClick={handleFindSentenceMatches}
                   disabled={!textsAreLoaded || isMatchingSentences}
                   className="h-8 px-3 text-xs"
                   size="sm"
                   variant="secondary"
                 >
                   {isMatchingSentences ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                   {isMatchingSentences ? 'Matching...' : 'Match Sentences'}
                 </Button>
                 <Button
                   onClick={() => { setHighlightMap({}); setEnglishHighlightMap({}); }}
                   disabled={isMatchingSentences}
                   className="h-8 px-3 text-xs"
                   size="sm"
                   variant="outline"
                 >
                   Clear Highlights
                 </Button>
               </CardContent>
             </Card>
             {/* --- Secondary Controls Pane (toggleable) --- */}
             {showControlsPane && (
        <Card className="mb-4 shadow-sm">
                 <CardHeader className="py-2 px-3 border-b flex flex-row justify-between items-center">
                   <span className="font-semibold text-sm">Lecture, URL, and File Controls</span>
                   <Button size="sm" variant="ghost" className="text-xs px-2 py-1" onClick={() => setShowControlsPane(false)}>Hide ▲</Button>
                 </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 items-end">
                {/* Warning if JSONL file exists */}
                {jsonlFileExists && (
                  <div className="col-span-5 mb-2">
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded text-sm font-semibold flex items-center gap-2">
                      <span>⚠️</span>
                      <span>A JSONL file for this lecture already exists in the selected folder.</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="ml-2 h-6 px-2 text-xs"
                        onClick={handleDeleteJsonlFile}
                        disabled={!folderHandle}
                      >
                        Delete File
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                    <Label htmlFor="english-url" className="text-xs">English URL</Label>
                    <Input
                        id="english-url"
                        type="url"
                        placeholder="English URL"
                        value={computedEnglishUrl}
                        onChange={e => setManualEnglishUrl(e.target.value)}
                        disabled={isFetching || isDownloading || isScoring}
                        className="h-8 text-sm"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="hebrew-url" className="text-xs">Hebrew URL</Label>
                    <Input
                        id="hebrew-url"
                        type="url"
                        placeholder="Hebrew URL"
                        value={computedHebrewUrl}
                        onChange={e => setManualHebrewUrl(e.target.value)}
                        disabled={isFetching || isDownloading || isScoring}
                        dir="rtl"
                        className="h-8 text-sm"
                    />
                </div>
                <Button
                    onClick={handleFetchTexts}
                    disabled={isFetching || isDownloading || isScoring || !(computedEnglishUrl || '').trim() || !(computedHebrewUrl || '').trim()}
                    className="w-full sm:w-auto h-8 text-xs"
                    size="sm"
                >
                    {isFetching ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DownloadCloud className="mr-1 h-3 w-3" />}
                    {isFetching ? 'Fetching...' : 'Fetch'}
                </Button>
                <Button
                    onClick={handleDownloadJsonl}
                    disabled={isDownloading || jsonlRecords.length === 0 || isFetching || isScoring}
                    className="w-full sm:w-auto h-8 text-xs"
                    size="sm"
                    variant="outline"
                >
                    {isDownloading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <DownloadCloud className="mr-1 h-3 w-3" />}
                    {isDownloading ? 'Preparing...' : `Download Pairs (${jsonlRecords.length})`}
                </Button>
                <Button
                    onClick={pickFolder}
                    disabled={isSaving || isDownloading || isFetching || isScoring}
                    className="w-full sm:w-auto h-8 text-xs"
                    size="sm"
                    variant="outline"
                >
                    Choose Folder
                </Button>
                <Button
                    onClick={async () => {
                        setIsSaving(true);
                        try {
                            const jsonlContent = jsonlRecords.join('\n') + '\n';
                            const filename = getJsonlFilenameFromUrl(computedEnglishUrl);
                            await saveJsonlToFolder(jsonlContent, filename);
                        } finally {
                            setIsSaving(false);
                        }
                    }}
                    disabled={isSaving || !folderHandle || jsonlRecords.length === 0 || isFetching || isScoring}
                    className="w-full sm:w-auto h-8 text-xs"
                    size="sm"
                    variant="outline"
                >
                    {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                    {isSaving ? 'Saving...' : 'Save Pairs to Folder'}
                </Button>
                    {/* Dump range controls */}
                    <div className="space-y-1">
                        <Label htmlFor="dump-start" className="text-xs">Dump Start (1-based)</Label>
                        <Input
                            id="dump-start"
                            type="number"
                            min={1}
                            max={hebrewLectures.length}
                            value={dumpStartIdx}
                            onChange={e => setDumpStartIdx(Math.max(1, Math.min(hebrewLectures.length, Number(e.target.value))))}
                            className="h-8 text-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="dump-end" className="text-xs">Dump End (1-based)</Label>
                        <Input
                            id="dump-end"
                            type="number"
                            min={dumpStartIdx}
                            max={hebrewLectures.length}
                            value={dumpEndIdx}
                            onChange={e => setDumpEndIdx(Math.max(dumpStartIdx, Math.min(hebrewLectures.length, Number(e.target.value))))}
                            className="h-8 text-sm"
                        />
                    </div>
                    <Button
                        onClick={async () => {
                            const allRecords: { request_id: string; paragraph: string }[] = [];
                            for (let idx = dumpStartIdx - 1; idx <= dumpEndIdx - 1; idx++) {
                                const lecture = hebrewLectures[idx];
                                const hebrewUrl = lecture?.URL;
                                const lectureTitle = lecture?.['Lecture Title'] || '';
                                if (!hebrewUrl) continue;
                                // Log to console for each lecture
                                console.log(`Dumping lecture ${idx + 1} (CSV row ${idx + 2}): ${lectureTitle}`);
                                try {
                                    const { text: fetchedHebrew, error } = await fetchTextFromUrl(hebrewUrl);
                                    if (error || !fetchedHebrew) continue;
                                    const paragraphs = parseParagraphs(fetchedHebrew, 'hebrew');
                                    paragraphs.forEach((paragraph, i) => {
                                        allRecords.push({
                                            request_id: `${i}_${idx + 2}`,
                                            paragraph,
                                        });
                                    });
                                } catch (e) {
                                    continue;
                                }
                            }
                            if (allRecords.length === 0) return;
                            const jsonlContent = allRecords.map(r => JSON.stringify(r)).join('\n') + '\n';
                            const filename = `hebrew_paragraphs_${dumpStartIdx}_to_${dumpEndIdx}.jsonl`;
                            const blob = new Blob([jsonlContent], { type: "application/jsonl;charset=utf-8" });
                            saveAs(blob, filename);
                        }}
                        disabled={hebrewLectures.length === 0 || dumpStartIdx > dumpEndIdx}
                        className="w-full sm:w-auto h-8 text-xs"
                        size="sm"
                        variant="outline"
                    >
                        Dump Hebrew Paragraphs (Range)
                    </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            disabled={isFetching || isDownloading || isScoring || !textsAreLoaded}
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
             )}
             {!showControlsPane && (
               <div className="mb-2 flex justify-end">
                 <Button size="sm" variant="ghost" className="text-xs px-2 py-1" onClick={() => setShowControlsPane(true)}>Show ▼</Button>
               </div>
             )}
             {/* --- Hebrew/English Lecture Traversal Controls --- */}
             {showLectureNav ? (
               <div className="mb-4 flex flex-col gap-2 relative">
                 <button
                   className="absolute top-0 right-0 mt-1 mr-1 px-2 py-1 text-xs bg-muted border rounded hover:bg-muted/70"
                   onClick={() => setShowLectureNav(false)}
                   aria-label="Hide lecture navigation"
                 >
                   Hide ▲
                 </button>
                 <div className="flex items-center gap-2">
                   <Button onClick={handlePrevHebrewLecture} disabled={hebrewLectureIdx === 0}>Prev Hebrew</Button>
                   <span>Hebrew Lecture {hebrewLectureIdx + 1} / {hebrewLectures.length}</span>
                   <Button onClick={handleNextHebrewLecture} disabled={hebrewLectureIdx >= hebrewLectures.length - 1}>Next Hebrew</Button>
                   {/* Skip to specific lecture */}
                   <input
                     type="number"
                     min={1}
                     max={hebrewLectures.length}
                     value={skipHebrewLecture}
                     onChange={e => setSkipHebrewLecture(e.target.value.replace(/[^0-9]/g, ''))}
                     placeholder="Go to..."
                     className="w-20 px-2 py-1 border rounded text-xs ml-2"
                     style={{ minWidth: 0 }}
                   />
                   <Button
                     size="sm"
                     className="h-7 px-2 text-xs"
                     variant="outline"
                     onClick={() => {
                       const idx = parseInt(skipHebrewLecture, 10) - 1;
                       if (!isNaN(idx) && idx >= 0 && idx < hebrewLectures.length) {
                         setHebrewLectureIdx(idx);
                         setManualHebrewUrl('');
                         setManualEnglishUrl('');
                       }
                     }}
                     disabled={
                       !skipHebrewLecture ||
                       isNaN(Number(skipHebrewLecture)) ||
                       Number(skipHebrewLecture) < 1 ||
                       Number(skipHebrewLecture) > hebrewLectures.length
                     }
                   >
                     Go
                   </Button>
                   {hebrewLectures[hebrewLectureIdx] && (
                     <span className="ml-4 text-xs">Date: {hebrewLectures[hebrewLectureIdx]['Date']} | Title: {hebrewLectures[hebrewLectureIdx]['Lecture Title']}</span>
                   )}
                 </div>
                 {/* Display Hebrew and English lecture metadata side by side */}
                 <div className="flex flex-row gap-8 mt-1">
                   {/* Hebrew lecture metadata */}
                   {hebrewLectures[hebrewLectureIdx] && (
                     <div className="text-xs border rounded p-2 bg-muted/30 max-w-2xl">
                       <div><b>GA:</b> {hebrewLectures[hebrewLectureIdx]['GA']}</div>
                       <div><b>Date:</b> {hebrewLectures[hebrewLectureIdx]['Date']}</div>
                       <div><b>URL:</b> <a href={hebrewLectures[hebrewLectureIdx]['URL']} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">{hebrewLectures[hebrewLectureIdx]['URL']}</a></div>
                       <div><b>Volume Title:</b> {hebrewLectures[hebrewLectureIdx]['Volume Title']}</div>
                       <div><b>Lecture Title:</b> {hebrewLectures[hebrewLectureIdx]['Lecture Title']}</div>
                       <div><b>Translator Name:</b> {hebrewLectures[hebrewLectureIdx]['Translator Name']}</div>
                       <div><b>Original Language:</b> {hebrewLectures[hebrewLectureIdx]['Original Language']}</div>
                     </div>
                   )}
                   {/* English lecture metadata */}
                   {englishCandidates[englishCandidateIdx] && (
                     <div className="text-xs border rounded p-2 bg-muted/30 max-w-2xl">
                       <div><b>GA:</b> {englishCandidates[englishCandidateIdx]['GA']}</div>
                       <div><b>GA Title:</b> {englishCandidates[englishCandidateIdx]['GA Title']}</div>
                       <div><b>Date:</b> {englishCandidates[englishCandidateIdx]['Date']}</div>
                       <div><b>URL:</b> <a href={englishCandidates[englishCandidateIdx]['URL']} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">{englishCandidates[englishCandidateIdx]['URL']}</a></div>
                       <div><b>Lecture Title:</b> {englishCandidates[englishCandidateIdx]['Lecture Title']}</div>
                       <div><b>Original Language:</b> {englishCandidates[englishCandidateIdx]['Original Language']}</div>
                     </div>
                   )}
                 </div>
                 <div className="flex items-center gap-2">
                   <Button onClick={handlePrevEnglishCandidate} disabled={englishCandidateIdx === 0 || englishCandidates.length === 0}>Prev English</Button>
                   <span>English Candidate {englishCandidates.length === 0 ? 0 : englishCandidateIdx + 1} / {englishCandidates.length}</span>
                   <Button onClick={handleNextEnglishCandidate} disabled={englishCandidateIdx >= englishCandidates.length - 1 || englishCandidates.length === 0}>Next English</Button>
                   {englishCandidates[englishCandidateIdx] && (
                     <span className="ml-4 text-xs">Title: {englishCandidates[englishCandidateIdx]['Lecture Title']}</span>
                   )}
                 </div>
               </div>
             ) : (
               <div className="mb-2 flex justify-end">
                 <button
                   className="px-2 py-1 text-xs bg-muted border rounded hover:bg-muted/70"
                   onClick={() => setShowLectureNav(true)}
                   aria-label="Show lecture navigation"
                 >
                   Show ▼
                 </button>
               </div>
             )}
        {/* Alignment Section */}
        <div className="flex flex-grow gap-4 min-h-0">
            {/* English Panel */}
            <div ref={englishPanelRef} className="w-1/2 english-panel flex flex-col">
                <TextAreaPanel
                    title="English"
                    displayedParagraphs={processedParagraphs.english.displayed.map(p => ({ ...p, score: typeof p.score === 'number' ? p.score : undefined, len_ratio: typeof p.len_ratio === 'number' ? p.len_ratio : 0 }))}
                    isLoading={isFetching && englishText === null}
                    selectedOriginalIndex={selectedEnglishIndex}
                    onParagraphSelect={handleParagraphSelect}
                    isSourceLanguage={true}
                    loadedText={englishText}
                    language="english"
                    onDropParagraph={onDropParagraph}
                    hiddenIndices={hiddenIndices.english}
                    panelRef={englishPanelRef}
                    isScrollSyncEnabled={isScrollSyncEnabled}
                    onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                    onEditParagraph={handleEditParagraph('english')}
                    onMergeUp={handleMergeUpEnglish}
                    onMergeDown={handleMergeDownEnglish}
                        highlightMap={englishHighlightMap}
                />
            </div>

            {/* Hebrew Panel */}
            <div ref={hebrewPanelRef} className="w-1/2 hebrew-panel flex flex-col">
                <TextAreaPanel
                    title="Hebrew"
                    displayedParagraphs={processedParagraphs.hebrew.displayed.map(p => ({ ...p, score: typeof p.score === 'number' ? p.score : undefined, len_ratio: typeof p.len_ratio === 'number' ? p.len_ratio : 0 }))}
                    isLoading={isFetching && hebrewText === null}
                    selectedOriginalIndex={selectedHebrewIndex}
                    onParagraphSelect={handleParagraphSelect}
                    showControls={true}
                    onConfirmPair={handleConfirmPair}
                    onConfirmAllPairsUpwards={handleConfirmAllPairsUpwards}
                    onUnlink={handleUnlink}
                    canConfirmPair={canConfirmPair}
                    canUnlink={canUnlink}
                    controlsDisabled={controlsDisabled || !textsAreLoaded}
                    isSourceLanguage={false}
                    loadedText={hebrewText}
                    language="hebrew"
                    onDropParagraph={onDropParagraph}
                    hiddenIndices={hiddenIndices.hebrew}
                    panelRef={hebrewPanelRef}
                    isScrollSyncEnabled={isScrollSyncEnabled}
                    onToggleScrollSync={() => setIsScrollSyncEnabled(!isScrollSyncEnabled)}
                    onMergeUp={handleMergeUp}
                    onMergeDown={handleMergeDown}
                    onSplitParagraph={(displayedIndex, newText) => {
                      // Split at first line break
                      const splitIdx = newText.indexOf('\n');
                      if (splitIdx === -1) return;
                      const first = newText.slice(0, splitIdx).trim();
                      const second = newText.slice(splitIdx + 1).trim();
                      if (!first || !second) {
                        toast({ title: 'Split Error', description: 'Both parts must be non-empty.', variant: 'destructive', duration: 2000 });
                        return;
                      }
                      setProcessedParagraphs(prev => {
                        const oldDisplayed = prev.hebrew.displayed;
                        const newDisplayed = [
                          ...oldDisplayed.slice(0, displayedIndex),
                          { ...oldDisplayed[displayedIndex], paragraph: first, score: null, scoreLoading: false },
                          { ...oldDisplayed[displayedIndex], paragraph: second, score: null, scoreLoading: false },
                          ...oldDisplayed.slice(displayedIndex + 1),
                        ].map((p, i) => ({ ...p, originalIndex: i }));
                        return {
                          ...prev,
                          hebrew: {
                            ...prev.hebrew,
                            displayed: newDisplayed,
                          },
                        };
                      });
                      toast({ title: 'Paragraph Split', description: 'Paragraph was split into two.', duration: 2000 });
                    }}
                    onEditParagraph={handleEditParagraph('hebrew')}
                    onRevertLastPair={handleRevertLastPair}
                    canRevertLastPair={jsonlRecords.length > 0}
                         highlightMap={highlightMap}
                />
            </div>
        </div>
        </div>
    </div>
);
}
