
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button'; // Import Button
 import { Loader2, DownloadCloud } from 'lucide-react';
 import { useDebounce } from '@/hooks/use-debounce'; // Corrected import path
 import { fetchTexts } from '@/lib/api';
 import { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
 import TextAreaPanel from '@/components/text-area-panel';
 import { useLocalStorage } from '@/hooks/use-local-storage';
import { useToast } from '@/hooks/use-toast'; // Import useToast

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

 function parseParagraphs(text: string | null): string[] {
     if (!text) return [];
     // Split by double newline to separate paragraphs. Corrected regex: Use double backslashes for \n and \s
     // Updated regex to split by two or more newline characters, optionally surrounded by whitespace.
     return text.split(/(?:\s*\n\s*){2,}/).filter(paragraph => paragraph.trim() !== '');
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
     const [manualAlignments, setManualAlignments] = useLocalStorage<ManualAlignment[]>('manualAlignments', []); // Persist manual alignments
     const [suggestedAlignments, setSuggestedAlignments] = useState<SuggestedAlignment[] | null>(null);
     const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number | null>(null);
     const [highlightedSuggestionTargetIndex, setHighlightedSuggestionTargetIndex] = useState<number | null>(null);
     const [isSuggesting, setIsSuggesting] = useState(false);
     const [canLink, setCanLink] = useState(false);
     const [canUnlink, setCanUnlink] = useState(false);
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
         // Rehydrate manual alignments
         const storedManualAlignments = localStorage.getItem('manualAlignments');
         if (storedManualAlignments) {
             try {
                 setManualAlignments(JSON.parse(storedManualAlignments));
             } catch (e) {
                 console.error("Failed to parse stored manual alignments:", e);
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
         setManualAlignments([]); // Reset alignments for new text
         setSuggestedAlignments(null);
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         // Don't reset hidden indices here, let them persist unless user explicitly resets


         try {
             const [english, hebrew] = await fetchTexts(urlToFetchEng, urlToFetchHeb);
             setEnglishText(english);
             setHebrewText(hebrew);

             // Parse paragraphs and assign original indices
             const englishParagraphs = parseParagraphs(english);
             const hebrewParagraphs = parseParagraphs(hebrew);
             const englishParagraphsWithIndices = assignOriginalIndices(englishParagraphs);
             const hebrewParagraphsWithIndices = assignOriginalIndices(hebrewParagraphs);

              // Automatically identify and hide metadata paragraphs *only if hiddenIndices is currently empty*
             const newHiddenIndices = {
                 english: new Set(hiddenIndices.english), // Start with persisted/current hidden indices
                 hebrew: new Set(hiddenIndices.hebrew),
             };

             // Only auto-hide if the sets were initially empty (i.e., first load or after reset)
             if (hiddenIndices.english.size === 0 && hiddenIndices.hebrew.size === 0) {
                 englishParagraphsWithIndices.forEach(item => {
                     const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                     if (wordCount <= 20) { // Identify metadata (short paragraphs)
                         newHiddenIndices.english.add(item.originalIndex);
                         console.log(`Auto-hiding English paragraph ${item.originalIndex} (short: ${wordCount} words)`);
                     }
                 });
                 hebrewParagraphsWithIndices.forEach(item => {
                     const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                     if (wordCount <= 20) { // Identify metadata (short paragraphs)
                          newHiddenIndices.hebrew.add(item.originalIndex);
                          console.log(`Auto-hiding Hebrew paragraph ${item.originalIndex} (short: ${wordCount} words)`);
                     }
                 });
                 setHiddenIndices(newHiddenIndices); // Update state and persist the auto-detected ones
             } else {
                  console.log("Skipping auto-hide for metadata as hidden indices already exist.");
             }


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
             setCanLink(false);
             setCanUnlink(false);
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
     }, [debouncedEnglishUrl, debouncedHebrewUrl, englishUrl, hebrewUrl, setManualAlignments, setHiddenIndices, hiddenIndices.english, hiddenIndices.hebrew, toast]); // Include persisted setters and current state in deps

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
            setCanLink(false);
            setCanUnlink(false);
            setControlsDisabled(true);
            return; // Exit early, no further logic needed
        } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
            console.log('Deselecting Hebrew paragraph');
            setSelectedHebrewIndex(null); // Deselect the Hebrew paragraph
            setCanLink(false);
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

         // Determine if the newly selected pair can be linked
         // Can link if one English and one Hebrew are selected, AND neither is already part of *another* link.
         const englishSelected = currentSelectedEnglish !== null;
         const hebrewSelected = currentSelectedHebrew !== null;

         // Check if the English paragraph is already linked (but not to the currently selected Hebrew one)
         const englishAlreadyLinkedToAnother = englishSelected && manualAlignments.some(
             link => link.englishIndex === currentSelectedEnglish && link.hebrewIndex !== currentSelectedHebrew
         );
         // Check if the Hebrew paragraph is already linked (but not to the currently selected English one)
         const hebrewAlreadyLinkedToAnother = hebrewSelected && manualAlignments.some(
             link => link.hebrewIndex === currentSelectedHebrew && link.englishIndex !== currentSelectedEnglish
         );
         // Check if this specific pair is already linked
         const isCurrentlyLinkedPair = manualAlignments.some(
             link => link.englishIndex === currentSelectedEnglish && link.hebrewIndex === currentSelectedHebrew
         );

         const newCanLink = englishSelected && hebrewSelected && !englishAlreadyLinkedToAnother && !hebrewAlreadyLinkedToAnother && !isCurrentlyLinkedPair;
         console.log(`Can Link Check: engSel=${englishSelected}, hebSel=${hebrewSelected}, engLinkedAnother=${englishAlreadyLinkedToAnother}, hebLinkedAnother=${hebrewAlreadyLinkedToAnother}, isCurrentPair=${isCurrentlyLinkedPair} -> Result=${newCanLink}`);


         // Determine if the newly selected paragraph can be unlinked
         // Can unlink if the selected paragraph (in either language) is part of an *existing* link.
         let newCanUnlink = false;
         if (language === 'english' && englishSelected) {
             newCanUnlink = manualAlignments.some(link => link.englishIndex === currentSelectedEnglish);
             console.log(`Can Unlink (English): Check if ${currentSelectedEnglish} is linked -> Result=${newCanUnlink}`);
         } else if (language === 'hebrew' && hebrewSelected) {
             newCanUnlink = manualAlignments.some(link => link.hebrewIndex === currentSelectedHebrew);
              console.log(`Can Unlink (Hebrew): Check if ${currentSelectedHebrew} is linked -> Result=${newCanUnlink}`);
         }
         // If the other language's selection forms the *other* part of the link, enable unlinking too.
         // This handles the case where you click the second item of an already linked pair.
         if (!newCanUnlink && isCurrentlyLinkedPair) {
             newCanUnlink = true;
             console.log(`Can Unlink: Enabling because selected pair (${currentSelectedEnglish}, ${currentSelectedHebrew}) is already linked.`);
         }

         // Update state
         setSelectedEnglishIndex(currentSelectedEnglish);
         setSelectedHebrewIndex(currentSelectedHebrew);
         setCanLink(newCanLink);
         setCanUnlink(newCanUnlink);
        setControlsDisabled(!(newCanLink || newCanUnlink)); // Controls enabled if link or unlink is possible
        console.log(`Controls state updated: canLink=${newCanLink}, canUnlink=${newCanUnlink}, disabled=${!(newCanLink || newCanUnlink)}`);
     };


     const handleLink = () => {
         if (selectedEnglishIndex !== null && selectedHebrewIndex !== null && canLink) {
            console.log(`Attempting to link: Eng=${selectedEnglishIndex}, Heb=${selectedHebrewIndex}`);
             // Prevent linking if either paragraph is already part of another link
             const alreadyLinked = manualAlignments.some(
                 link => link.englishIndex === selectedEnglishIndex || link.hebrewIndex === selectedHebrewIndex
             );

             if (!alreadyLinked) {
                 const newAlignment: ManualAlignment = {
                     englishIndex: selectedEnglishIndex,
                     hebrewIndex: selectedHebrewIndex,
                 };
                 setManualAlignments([...manualAlignments, newAlignment]);
                 console.log(`Link created: ${JSON.stringify(newAlignment)}`);
                 // Clear selections after linking
                 setSelectedEnglishIndex(null);
                 setSelectedHebrewIndex(null);
                 setCanLink(false);
                 setCanUnlink(false);
                 setControlsDisabled(true);
                 toast({ title: "Paragraphs Linked", description: `English paragraph ${selectedEnglishIndex + 1} linked to Hebrew paragraph ${selectedHebrewIndex + 1}.` });
             } else {
                 console.warn("Cannot link: One or both paragraphs are already linked.");
                 toast({ title: "Link Error", description: "One or both selected paragraphs are already linked to other paragraphs.", variant: "destructive" });
             }
         } else {
            console.warn(`Link conditions not met: Eng=${selectedEnglishIndex}, Heb=${selectedHebrewIndex}, canLink=${canLink}`);
         }
     };


      const handleUnlink = () => {
         // Determine which index to use for finding the link to remove.
         // If both are selected, it implies they form the pair to be unlinked.
         // If only one is selected, use that one to find the link.
         const engIdx = selectedEnglishIndex;
         const hebIdx = selectedHebrewIndex;
         let linkToRemove: ManualAlignment | undefined;

         console.log(`Attempting to unlink: Selected Eng=${engIdx}, Heb=${hebIdx}`);

         if (engIdx !== null && hebIdx !== null) {
             linkToRemove = manualAlignments.find(link => link.englishIndex === engIdx && link.hebrewIndex === hebIdx);
             console.log(`Unlinking based on selected pair: Found link?`, linkToRemove);
         } else if (engIdx !== null) {
             linkToRemove = manualAlignments.find(link => link.englishIndex === engIdx);
             console.log(`Unlinking based on selected English (${engIdx}): Found link?`, linkToRemove);
         } else if (hebIdx !== null) {
             linkToRemove = manualAlignments.find(link => link.hebrewIndex === hebIdx);
             console.log(`Unlinking based on selected Hebrew (${hebIdx}): Found link?`, linkToRemove);
         } else {
            console.warn('Unlink clicked but no paragraph selected.');
             toast({ title: "Unlink Error", description: "No paragraph selected to unlink.", variant: "destructive" });
         }

         if (linkToRemove) {
             // Filter out the alignment containing the selected index/pair
             const updatedAlignments = manualAlignments.filter(alignment => alignment !== linkToRemove);
             setManualAlignments(updatedAlignments);
             console.log(`Link removed: ${JSON.stringify(linkToRemove)}. New alignments count: ${updatedAlignments.length}`);
              toast({ title: "Paragraphs Unlinked", description: `Link between English ${linkToRemove.englishIndex + 1} and Hebrew ${linkToRemove.hebrewIndex + 1} removed.` });

             // Clear selections and reset button states after unlinking
             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true);
             console.log('Selections and button states reset after unlink.');
         } else if (canUnlink) {
             // This case might happen if canUnlink was true but the find logic failed,
             // potentially due to inconsistent state. Log a warning.
             console.warn(`Unlink clicked and 'canUnlink' was true, but no link found for selected indices (Eng=${engIdx}, Heb=${hebIdx}). Resetting state.`);
             toast({ title: "Unlink Error", description: "Could not find the link to remove.", variant: "destructive" });
             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true);
         }
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
             // Use ORIGINAL paragraphs for the AI
             const englishTextForAI = processedParagraphs.english.original.map(p => p.paragraph).join('\n\n');
             const hebrewTextForAI = processedParagraphs.hebrew.original.map(p => p.paragraph).join('\n\n');
             console.log(`Sending text to AI: Eng length=${englishTextForAI.length}, Heb length=${hebrewTextForAI.length}`);
             // console.log("English text for AI:\n", englishTextForAI.substring(0, 200) + "..."); // Log first 200 chars
             // console.log("Hebrew text for AI:\n", hebrewTextForAI.substring(0, 200) + "..."); // Log first 200 chars


             const suggestions = await suggestParagraphAlignment({
                 englishText: englishTextForAI,
                 hebrewText: hebrewTextForAI,
             });
             console.log(`Raw AI Suggestions received: ${suggestions.length} suggestions`);
             // console.log("Raw AI Suggestions:", JSON.stringify(suggestions));

             // Filter suggestions to only include those involving non-hidden paragraphs
             // Note: The AI returns ORIGINAL indices based on the full text it received
             const validSuggestions = suggestions.filter(s => {
                 const isEngHidden = hiddenIndices.english.has(s.englishParagraphIndex);
                 const isHebHidden = hiddenIndices.hebrew.has(s.hebrewParagraphIndex);
                 if (isEngHidden || isHebHidden) {
                      // console.log(`Filtering out suggestion: Eng(${s.englishParagraphIndex}, hidden=${isEngHidden}), Heb(${s.hebrewParagraphIndex}, hidden=${isHebHidden})`);
                 }
                 return !isEngHidden && !isHebHidden;
             });
             console.log(`Filtered AI Suggestions (visible paragraphs only): ${validSuggestions.length} suggestions`);

             setSuggestedAlignments(validSuggestions);
              toast({ title: "AI Suggestions Ready", description: `Received ${validSuggestions.length} alignment suggestions.` });

             // Clear specific highlights for single suggestion (might be redundant but safe)
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);


         } catch (error: any) {
             console.error("Failed to get AI suggestions:", error);
             toast({ title: "AI Suggestion Failed", description: error.message || "An error occurred while getting suggestions.", variant: "destructive" });
             setSuggestedAlignments([]); // Clear suggestions on error
         } finally {
             setIsSuggesting(false);
             // Reset controls state based on current selection (if any) - DRY this up later
            const engSelected = selectedEnglishIndex !== null;
            const hebSelected = selectedHebrewIndex !== null;
            const engAlreadyLinked = engSelected && manualAlignments.some(link => link.englishIndex === selectedEnglishIndex && link.hebrewIndex !== selectedHebrewIndex);
            const hebAlreadyLinked = hebSelected && manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex && link.englishIndex !== selectedEnglishIndex);
            const isCurrentlyLinkedPair = engSelected && hebSelected && manualAlignments.some(link => link.englishIndex === selectedEnglishIndex && link.hebrewIndex === selectedHebrewIndex);

            const currentCanLink = engSelected && hebSelected && !engAlreadyLinked && !hebAlreadyLinked && !isCurrentlyLinkedPair;
            // Can unlink if *either* selected paragraph is part of *any* existing link
            const currentCanUnlink = (engSelected && manualAlignments.some(link => link.englishIndex === selectedEnglishIndex)) ||
                                (hebSelected && manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex)); // Corrected: check hebSelected here

             console.log(`Resetting controls after suggest: engSel=${engSelected}, hebSel=${hebSelected}, currentCanLink=${currentCanLink}, currentCanUnlink=${currentCanUnlink}`);
             setCanLink(currentCanLink);
             setCanUnlink(currentCanUnlink);
             setControlsDisabled(!(currentCanLink || currentCanUnlink));
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

         // Filter out manual alignments involving this paragraph
         const updatedManualAlignments = manualAlignments.filter(alignment =>
             !(alignment.englishIndex === originalIndex || alignment.hebrewIndex === originalIndex)
         );
         if (updatedManualAlignments.length < manualAlignments.length) {
            console.log(`Removed ${manualAlignments.length - updatedManualAlignments.length} manual alignments involving hidden paragraph ${originalIndex}.`);
            setManualAlignments(updatedManualAlignments); // Update persisted state
         }


         // Filter out suggested alignments involving this paragraph
         const updatedSuggestedAlignments = suggestedAlignments?.filter(suggestion =>
            !(suggestion.englishParagraphIndex === originalIndex || suggestion.hebrewParagraphIndex === originalIndex)
         ) ?? null;
          if (suggestedAlignments && (!updatedSuggestedAlignments || updatedSuggestedAlignments.length < suggestedAlignments.length)) {
              console.log(`Removed suggested alignments involving hidden paragraph ${originalIndex}.`);
              setSuggestedAlignments(updatedSuggestedAlignments);
          }


         // Recalculate button states after dropping and clearing selection/links (DRY opportunity)
         const engSelectedAfterDrop = engStillSelected !== null;
         const hebSelectedAfterDrop = hebStillSelected !== null;

         const currentManualAlignments = updatedManualAlignments; // Use the just-updated alignments

         const engAlreadyLinked = engSelectedAfterDrop && currentManualAlignments.some(link => link.englishIndex === engStillSelected && link.hebrewIndex !== hebStillSelected);
         const hebAlreadyLinked = hebSelectedAfterDrop && currentManualAlignments.some(link => link.hebrewIndex === hebStillSelected && link.englishIndex !== engStillSelected);
         const isCurrentlyLinkedPair = engSelectedAfterDrop && hebSelectedAfterDrop && currentManualAlignments.some(link => link.englishIndex === engStillSelected && link.hebrewIndex === hebStillSelected);

         const currentCanLink = engSelectedAfterDrop && hebSelectedAfterDrop && !engAlreadyLinked && !hebAlreadyLinked && !isCurrentlyLinkedPair;
         const currentCanUnlink = (engSelectedAfterDrop && currentManualAlignments.some(link => link.englishIndex === engStillSelected)) ||
                             (hebSelectedAfterDrop && currentManualAlignments.some(link => link.hebrewIndex === hebStillSelected));

          console.log(`Resetting controls after drop: engSel=${engSelectedAfterDrop}, hebSel=${hebSelectedAfterDrop}, currentCanLink=${currentCanLink}, currentCanUnlink=${currentCanUnlink}`);
         setCanLink(currentCanLink);
         setCanUnlink(currentCanUnlink);
         setControlsDisabled(!(currentCanLink || currentCanUnlink));

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

            const targetParagraph = displayedHebrew[displayedIndex - 1];
            const sourceParagraph = displayedHebrew[displayedIndex];

            // Create the merged paragraph text
            const mergedText = `${targetParagraph.paragraph}\n\n${sourceParagraph.paragraph}`; // Add double newline between merged paragraphs

            // Create the new paragraph object, keeping the originalIndex of the *target* (upper) paragraph
            const mergedParagraph = { ...targetParagraph, paragraph: mergedText };

             // Update the original paragraph list (find by originalIndex and update)
             const originalIndexToUpdate = targetParagraph.originalIndex;
             const newOriginalHebrew = prev.hebrew.original.map(p =>
                 p.originalIndex === originalIndexToUpdate ? { ...p, paragraph: mergedText } : p
             );

            // Remove the source paragraph from the displayed list
            const newDisplayedHebrew = [
                ...displayedHebrew.slice(0, displayedIndex - 1), // Elements before target
                mergedParagraph,                             // The merged paragraph
                ...displayedHebrew.slice(displayedIndex + 1)   // Elements after source
            ];

            // --- Update Alignments ---
            // Remove any alignments involving the *source* paragraph's original index
            const sourceOriginalIndex = sourceParagraph.originalIndex;
            const newManualAlignments = manualAlignments.filter(a => a.hebrewIndex !== sourceOriginalIndex);
            const newSuggestedAlignments = suggestedAlignments?.filter(s => s.hebrewParagraphIndex !== sourceOriginalIndex) ?? null;

            // Update alignments pointing to paragraphs *after* the merged source
            // Note: We don't need to shift indices because we are removing an element,
            // the indices of subsequent elements in the *original* array remain the same.
            // The AI prompt uses original indices, so they should remain stable.

            // --- Update Hidden Indices ---
            // Remove the source paragraph's original index from hidden set if present
            const newHebrewHidden = new Set(hiddenIndices.hebrew);
            newHebrewHidden.delete(sourceOriginalIndex);


            // --- Update State ---
            setManualAlignments(newManualAlignments); // Persist alignment changes
            setSuggestedAlignments(newSuggestedAlignments);
            setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden })); // Persist hidden index change
            setSelectedHebrewIndex(null); // Deselect Hebrew after merge
            setSelectedEnglishIndex(null); // Deselect English too for consistency
            setCanLink(false);
            setCanUnlink(false);
            setControlsDisabled(true);

            toast({ title: "Paragraphs Merged", description: `Hebrew paragraph ${displayedIndex + 1} merged into paragraph ${displayedIndex}.` });
            console.log(`Merged up: Target originalIdx=${originalIndexToUpdate}, Source originalIdx=${sourceOriginalIndex}`);

            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew, // Update original text as well
                    displayed: newDisplayedHebrew,
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

            const sourceParagraph = displayedHebrew[displayedIndex];
            const targetParagraph = displayedHebrew[displayedIndex + 1];

            // Create the merged paragraph text
            const mergedText = `${sourceParagraph.paragraph}\n\n${targetParagraph.paragraph}`; // Add double newline

            // Create the new paragraph object, keeping the originalIndex of the *source* (upper) paragraph
            const mergedParagraph = { ...sourceParagraph, paragraph: mergedText };

            // Update the original paragraph list (find by originalIndex and update)
            const originalIndexToUpdate = sourceParagraph.originalIndex;
             const newOriginalHebrew = prev.hebrew.original.map(p =>
                 p.originalIndex === originalIndexToUpdate ? { ...p, paragraph: mergedText } : p
             );

            // Remove the target paragraph from the displayed list
            const newDisplayedHebrew = [
                ...displayedHebrew.slice(0, displayedIndex), // Elements before source
                mergedParagraph,                          // The merged paragraph
                ...displayedHebrew.slice(displayedIndex + 2) // Elements after target
            ];

            // --- Update Alignments ---
            const targetOriginalIndex = targetParagraph.originalIndex;
            const newManualAlignments = manualAlignments.filter(a => a.hebrewIndex !== targetOriginalIndex);
            const newSuggestedAlignments = suggestedAlignments?.filter(s => s.hebrewParagraphIndex !== targetOriginalIndex) ?? null;

             // --- Update Hidden Indices ---
             const newHebrewHidden = new Set(hiddenIndices.hebrew);
             newHebrewHidden.delete(targetOriginalIndex);

            // --- Update State ---
            setManualAlignments(newManualAlignments);
            setSuggestedAlignments(newSuggestedAlignments);
             setHiddenIndices(prevHidden => ({...prevHidden, hebrew: newHebrewHidden }));
            setSelectedHebrewIndex(null);
            setSelectedEnglishIndex(null);
            setCanLink(false);
            setCanUnlink(false);
            setControlsDisabled(true);

             toast({ title: "Paragraphs Merged", description: `Hebrew paragraph ${displayedIndex + 1} merged into paragraph ${displayedIndex + 2}.` });
             console.log(`Merged down: Source originalIdx=${originalIndexToUpdate}, Target originalIdx=${targetOriginalIndex}`);


            return {
                 ...prev,
                 hebrew: {
                    original: newOriginalHebrew, // Update original text as well
                    displayed: newDisplayedHebrew,
                 },
             };
        });
     };

     // --- END MERGE FUNCTIONALITY ---


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
                // Removed tolerance: if (pRect.top >= viewportRect.top - 5) {
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
                         disabled={isFetching || isSuggesting || !(englishUrl || '').trim() || !(hebrewUrl || '').trim()} // Handle null/undefined case for trim
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
                         displayedParagraphs={processedParagraphs.english.displayed}
                         isLoading={isFetching && englishText === null}
                         selectedOriginalIndex={selectedEnglishIndex}
                         onParagraphSelect={handleParagraphSelect} // Pass the updated handler
                         manualAlignments={manualAlignments}
                         alignmentKey="englishIndex"
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
                         manualAlignments={manualAlignments}
                         alignmentKey="hebrewIndex"
                         suggestedAlignments={suggestedAlignments}
                         suggestionKey="hebrewParagraphIndex"
                         highlightedSuggestionIndex={highlightedSuggestionTargetIndex} // Highlight based on target
                         linkedHighlightIndex={highlightedSuggestionIndex} // Link based on source
                         showControls={true}
                         onLink={handleLink}
                         onUnlink={handleUnlink}
                         onSuggest={handleSuggest}
                         canLink={canLink}
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

