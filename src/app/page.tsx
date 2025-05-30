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
    score?: number | null; // Optional score
    scoreLoading?: boolean;
    len_ratio?: number;
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
                 // Removed console logs related to normalization
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
            const mapToDisplayedData = (item: { paragraph: string; originalIndex: number }): DisplayedParagraphData => ({
                paragraph: item.paragraph,
                originalIndex: item.originalIndex,
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
    }, [computedEnglishUrl, computedHebrewUrl, setHiddenIndices, toast]);

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
                   messages: [
                       { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                       { role: 'user', content: enText },
                       { role: 'assistant', content: heText }
                   ]
               };
               setJsonlRecords(prevRecords => [...prevRecords, JSON.stringify(record)]);
               // Remove the confirmed pair from displayed arrays and reset indices
               setProcessedParagraphs(prev => ({
                   english: {
                       original: prev.english.original,
                       displayed: prev.english.displayed.filter((_, idx) => idx !== displayedIndex).map((p, i) => ({ ...p, originalIndex: i })),
                   },
                   hebrew: {
                       original: prev.hebrew.original,
                       displayed: prev.hebrew.displayed.filter((_, idx) => idx !== displayedIndex).map((p, i) => ({ ...p, originalIndex: i })),
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

   const handleStartFresh = async () => {
       localStorage.removeItem('jsonlRecords');
       setJsonlRecords([]);
       // Remove the JSONL file deletion logic here. Do not delete the file automatically.
       // Reset selection and controls, but keep loaded texts and their hidden indices
       setSelectedEnglishIndex(null);
       setSelectedHebrewIndex(null);
       setCanConfirmPair(false);
       setCanUnlink(false);
       setControlsDisabled(true);

       // Re-apply initial metadata filtering if texts are loaded
       if (textsAreLoaded) {
           // Remove short paragraph hiding logic
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

       toast({ title: "Started Pairing Fresh", description: "Cleared confirmed pairs.", duration: 2000 });
   };


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
          console.log(`[Score,${logIndex}] Requesting score: EN="${englishParaData.paragraph.substring(0, 50)}...", HE="${hebrewParaData.paragraph.substring(0, 50)}..."`);
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
          console.log(`[Score,${logIndex}] Received score:`, scoreResult);

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
           console.error(`[Score] Error scoring index ${displayedIndex}:`, error);
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
                       idx === displayedIndex ? { ...p, scoreLoading: false, score: null } : p // Reset loading, keep score null
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
      toast({ title: "Calculating Scores...", description: "Please wait.", duration: 5000 }); // Longer duration while scoring

      // Set loading state for all Hebrew paragraphs
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
         // Errors are handled within handleCalculateSingleScore, but we catch here just in case
         console.error("[Score] Error during bulk score calculation:", error);
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


  // Scroll synchronization logic (remains largely the same)
  useEffect(() => {
     if (!isScrollSyncEnabled) {
         return;
     }

     const englishViewport = englishPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
     const hebrewViewport = hebrewPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;

     if (!englishViewport || !hebrewViewport) {
         return;
     }

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
             return;
         }

         const targetParagraphElements = Array.from(targetPanelRef.current.querySelectorAll('.paragraph-box')) as HTMLElement[];
         const targetElement = targetParagraphElements[currentDisplayedIndex];

         if (targetElement) {
             const scrollToPosition = targetElement.offsetTop;
             targetViewport.scrollTo({ top: scrollToPosition, behavior: 'auto' });
         } else {
             const fallbackIndex = Math.min(currentDisplayedIndex, targetParagraphElements.length - 1);
              if (fallbackIndex >= 0) {
                  const fallbackElement = targetParagraphElements[fallbackIndex];
                  const fallbackTop = fallbackElement.offsetTop;
                  targetViewport.scrollTo({ top: fallbackTop, behavior: 'auto' });
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

      return () => {
         englishViewport?.removeEventListener('scroll', handleEnglishScroll);
         hebrewViewport?.removeEventListener('scroll', handleHebrewScroll);
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
            messages: [
                { role: 'system', content: 'Translate Rudolf Steiner lecture paragraphs from English to Hebrew.' },
                { role: 'user', content: enPara.paragraph },
                { role: 'assistant', content: hePara.paragraph }
            ]
        };
        newJsonlRecords.push(JSON.stringify(record));
    }
    setJsonlRecords(newJsonlRecords);
    // Remove confirmed pairs from displayed arrays and reset indices
    setProcessedParagraphs(prev => ({
        english: {
            original: prev.english.original,
            displayed: prev.english.displayed.slice(selectedHebrewDisplayedIndex + 1).map((p, i) => ({ ...p, originalIndex: i })),
        },
        hebrew: {
            original: prev.hebrew.original,
            displayed: prev.hebrew.displayed.slice(selectedHebrewDisplayedIndex + 1).map((p, i) => ({ ...p, originalIndex: i })),
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
    const candidates = englishLectures.filter(e => e['Date'] === date);
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

// Only block rendering, not hook calls
if (!isClient) return null;

return (
    <div className="flex flex-col h-screen p-4 bg-background">
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
        {/* URL Input Section */}
        <Card className="mb-4 shadow-sm">
            <CardHeader className="py-2 px-3 border-b" />
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
                />
            </div>
        </div>
        <div className="flex items-center gap-2 mb-4">
            <Input
                type="number"
                min={1}
                max={processedParagraphs.hebrew.displayed.length}
                value={scoreStart}
                onChange={e => setScoreStart(e.target.value)}
                placeholder="Start"
                className="w-20"
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
            />
            <Button
                onClick={handleScoreRange}
                disabled={!textsAreLoaded || isScoring || !scoreStart}
                size="sm"
                variant="secondary"
            >
                {isScoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                {isScoring ? 'Scoring...' : 'Score Selected'}
            </Button>
        </div>
        <Button
            onClick={handleCalculateAllScores}
            disabled={!textsAreLoaded || isScoring}
            className="mb-4 w-full sm:w-auto h-8 text-xs"
            size="sm"
            variant="secondary"
        >
            {isScoring ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
            {isScoring ? 'Scoring...' : 'Score All Paragraphs'}
        </Button>
    </div>
);
}
