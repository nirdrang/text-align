
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button';
 import { Loader2, DownloadCloud } from 'lucide-react';
 import { useDebounce } from '@/hooks/use-debounce';
 import { fetchTexts } from '@/lib/api';
 import { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
 import TextAreaPanel from '@/components/text-area-panel';
 import { useLocalStorage } from '@/hooks/use-local-storage';

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
     const [manualAlignments, setManualAlignments] = useState<ManualAlignment[]>([]);
     const [suggestedAlignments, setSuggestedAlignments] = useState<SuggestedAlignment[] | null>(null);
     const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number | null>(null);
     const [highlightedSuggestionTargetIndex, setHighlightedSuggestionTargetIndex] = useState<number | null>(null);
     const [isSuggesting, setIsSuggesting] = useState(false);
     const [canLink, setCanLink] = useState(false);
     const [canUnlink, setCanUnlink] = useState(false);
     const [controlsDisabled, setControlsDisabled] = useState(true);
     const [hiddenIndices, setHiddenIndices] = useState<{
         english: Set<number>;
         hebrew: Set<number>;
     }>({
         english: new Set<number>(),
         hebrew: new Set<number>(),
     });
     // Add state for scroll sync preference, persisted in localStorage
     const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useLocalStorage('isScrollSyncEnabled', true);

     const englishPanelRef = useRef<HTMLDivElement>(null);
     const hebrewPanelRef = useRef<HTMLDivElement>(null);

    const [isUserScrolling, setIsUserScrolling] = useState(true); // Initialize to true
    const lastScrollTimeRef = useRef(0); // Ref to store the last scroll event time

     const textsAreLoaded = englishText !== null && hebrewText !== null;

     const handleEnglishUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setEnglishUrl(e.target.value);
     };

     const handleHebrewUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         setHebrewUrl(e.target.value);
     };

     const handleFetchTexts = useCallback(async () => {
        if (!debouncedEnglishUrl.trim() || !debouncedHebrewUrl.trim()) {
            console.log("URLs not ready for fetching.");
            return;
        }
         setIsFetching(true);
         setEnglishText(null); // Reset text state
         setHebrewText(null); // Reset text state
         setProcessedParagraphs({ english: { original: [], displayed: [] }, hebrew: { original: [], displayed: [] } }); // Reset paragraphs
         setManualAlignments([]); // Reset alignments
         setSuggestedAlignments(null);
         setSelectedEnglishIndex(null);
         setSelectedHebrewIndex(null);
         setHiddenIndices({ english: new Set(), hebrew: new Set() }); // Reset hidden indices


         try {
             const [english, hebrew] = await fetchTexts(debouncedEnglishUrl, debouncedHebrewUrl);
             setEnglishText(english);
             setHebrewText(hebrew);

             // Parse paragraphs and assign original indices
             const englishParagraphs = parseParagraphs(english);
             const hebrewParagraphs = parseParagraphs(hebrew);
             const englishParagraphsWithIndices = assignOriginalIndices(englishParagraphs);
             const hebrewParagraphsWithIndices = assignOriginalIndices(hebrewParagraphs);

              // Automatically identify and hide metadata paragraphs
             const newHiddenIndices = {
                 english: new Set<number>(),
                 hebrew: new Set<number>(),
             };
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
             setHiddenIndices(newHiddenIndices);

             // Initialize with filtered paragraphs
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

             // Clear existing alignments and selections (redundant, but safe)
             setManualAlignments([]);
             setSuggestedAlignments(null);
             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true); // Start with controls disabled
         } catch (error) {
             console.error("Failed to fetch texts:", error);
             // Consider setting an error state to display to the user
         } finally {
             setIsFetching(false);
         }
     }, [debouncedEnglishUrl, debouncedHebrewUrl]); // Removed hiddenIndices from deps as they are set within this function

     // This useEffect runs when the debounced URLs change or when component mounts with persisted URLs
     useEffect(() => {
         if (debouncedEnglishUrl && debouncedHebrewUrl && (!englishText || !hebrewText)) {
             // Fetch texts if URLs are present and texts are not already loaded (e.g., from initial load with localStorage)
             handleFetchTexts();
         }
         // This effect should only run when URLs change or initially if texts aren't loaded
     }, [debouncedEnglishUrl, debouncedHebrewUrl, handleFetchTexts, englishText, hebrewText]);

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
             } else {
                 console.warn("Cannot link: One or both paragraphs are already linked.");
                 // Optionally show a toast message to the user
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
         }

         if (linkToRemove) {
             // Filter out the alignment containing the selected index/pair
             const updatedAlignments = manualAlignments.filter(alignment => alignment !== linkToRemove);
             setManualAlignments(updatedAlignments);
             console.log(`Link removed: ${JSON.stringify(linkToRemove)}. New alignments count: ${updatedAlignments.length}`);

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
             return;
         }

         setIsSuggesting(true);
         setControlsDisabled(true); // Disable controls during suggestion
         setSuggestedAlignments(null); // Clear previous suggestions
         console.log("Starting AI suggestion...");

         try {
             // Use the Genkit flow for suggestions
             const { suggestParagraphAlignment } = await import('@/ai/flows/suggest-paragraph-alignment');

             // Create the texts with double newlines as expected by the AI prompt
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

             // Clear specific highlights for single suggestion (might be redundant but safe)
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);


         } catch (error) {
             console.error("Failed to get AI suggestions:", error);
             // Handle error appropriately (e.g., display an error message using a toast)
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

         // Update the hidden indices state immutably
         const updatedHidden = new Set(hiddenIndices[language]);
         updatedHidden.add(originalIndex);
         const newHiddenIndicesState = { ...hiddenIndices, [language]: updatedHidden };
         setHiddenIndices(newHiddenIndicesState);


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
            setManualAlignments(updatedManualAlignments);
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
                // Find the first paragraph whose top is at or below the viewport top
                if (pRect.top >= viewportRect.top - 5) { // Allow small tolerance
                    // console.log(`Top visible element found at index ${i}:`, pElement);
                    return i;
                }
            }
            // If no paragraph is below the top, maybe the last one is partially visible
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
                const targetTop = targetElement.offsetTop - targetViewport.offsetTop; // Position relative to viewport scroll container
                console.log(`Sync Scroll: Scrolling target viewport to displayed index ${currentDisplayedIndex} at offsetTop ${targetTop}`);
                targetViewport.scrollTo({ top: targetTop, behavior: 'auto' }); // Use 'auto' for instant programmatic scroll
            } else {
                 // Fallback: If exact index match fails, scroll to the top/bottom or nearest available
                const fallbackIndex = Math.min(currentDisplayedIndex, targetParagraphElements.length - 1);
                 if (fallbackIndex >= 0) {
                     const fallbackElement = targetParagraphElements[fallbackIndex];
                     const fallbackTop = fallbackElement.offsetTop - targetViewport.offsetTop;
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
                 setTimeout(() => isProgrammaticScroll = false, 150); // Reset flag after a delay
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
                 setTimeout(() => isProgrammaticScroll = false, 150); // Reset flag after a delay
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
                     />
                 </div>
             </div>
         </div>
     );
 }


