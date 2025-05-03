
"use client";

 import { useState, useEffect, useRef, useCallback } from 'react';
 import { Card, CardContent, CardHeader } from '@/components/ui/card';
 import { Label } from '@/components/ui/label';
 import { Input } from '@/components/ui/input';
 import { Button } from '@/components/ui/button';
 import { Loader2, DownloadCloud } from 'lucide-react';
 import { useDebounce } from '@/hooks/use-debounce'; // Corrected import path might still be needed if the file structure differs
 import { fetchTexts } from '@/lib/api';
 import { ManualAlignment, SuggestedAlignment } from '@/types/alignment';
 import TextAreaPanel from '@/components/text-area-panel';
 import { useLocalStorage } from '@/hooks/use-local-storage'; // Re-import useLocalStorage

 function parseParagraphs(text: string | null): string[] {
     if (!text) return [];
     // Split by double newline to separate paragraphs
     return text.split(/\n\s*\n/).filter(paragraph => paragraph.trim() !== '');
 }

 function assignOriginalIndices(paragraphs: string[]): { paragraph: string; originalIndex: number }[] {
     return paragraphs.map((paragraph, index) => ({ paragraph, originalIndex: index }));
 }

 function filterMetadata(paragraphsWithIndices: { paragraph: string; originalIndex: number }[], hiddenIndices: Set<number>): { paragraph: string; originalIndex: number }[] {
     return paragraphsWithIndices.filter(item => !hiddenIndices.has(item.originalIndex));
 }

 export default function Home() {
     const [englishUrl, setEnglishUrl] = useLocalStorage('englishUrl', ''); // Use useLocalStorage again
     const [hebrewUrl, setHebrewUrl] = useLocalStorage('hebrewUrl', ''); // Use useLocalStorage again
     const [englishText, setEnglishText] = useState<string | null>(null);
     const [hebrewText, setHebrewText] = useState<string | null>(null);
     const [isFetching, setIsFetching] = useState(false);
     const debouncedEnglishUrl = useDebounce(englishUrl, 500);
     const debouncedHebrewUrl = useDebounce(hebrewUrl, 500);
     const [processedParagraphs, setProcessedParagraphs] = useState({
         english: {
             original: [] as { paragraph: string; originalIndex: number }[],
             displayed: [] as { paragraph: string; originalIndex: number }[],
         },
         hebrew: {
             original: [] as { paragraph: string; originalIndex: number }[],
             displayed: [] as { paragraph: string; originalIndex: number }[],
         },
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
     const [hiddenIndices, setHiddenIndices] = useState({
         english: new Set<number>(),
         hebrew: new Set<number>(),
     });

     const englishPanelRef = useRef<HTMLDivElement>(null);
     const hebrewPanelRef = useRef<HTMLDivElement>(null);

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
                 }
             });
             hebrewParagraphsWithIndices.forEach(item => {
                 const wordCount = item.paragraph.split(/\s+/).filter(Boolean).length;
                 if (wordCount <= 20) { // Identify metadata (short paragraphs)
                      newHiddenIndices.hebrew.add(item.originalIndex);
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

             // Clear existing alignments and selections
             setManualAlignments([]);
             setSuggestedAlignments(null);
             setSelectedEnglishIndex(null);
             setSelectedHebrewIndex(null);
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true);
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

         let newSelectedEnglishIndex = selectedEnglishIndex;
         let newSelectedHebrewIndex = selectedHebrewIndex;
         let newCanLink = false;
         let newCanUnlink = false;

         if (language === 'english') {
            newSelectedEnglishIndex = originalIndex;
            // Only clear Hebrew selection if it wasn't already linked to this English selection
            const existingLink = manualAlignments.find(link => link.englishIndex === originalIndex);
            if (!existingLink || selectedHebrewIndex !== existingLink.hebrewIndex) {
                newSelectedHebrewIndex = null;
            }
            // Check if there's a selected Hebrew paragraph to potentially link with
            const hebIndexSelected = selectedHebrewIndex !== null;
            newCanLink = hebIndexSelected && !existingLink; // Can link if Hebrew is selected AND not already linked
            newCanUnlink = !!existingLink; // Can unlink if already linked
         } else { // language === 'hebrew'
            newSelectedHebrewIndex = originalIndex;
             // Only clear English selection if it wasn't already linked to this Hebrew selection
            const existingLink = manualAlignments.find(link => link.hebrewIndex === originalIndex);
            if (!existingLink || selectedEnglishIndex !== existingLink.englishIndex) {
                newSelectedEnglishIndex = null;
            }
             // Check if there's a selected English paragraph to potentially link with
            const engIndexSelected = selectedEnglishIndex !== null;
            newCanLink = engIndexSelected && !existingLink; // Can link if English is selected AND not already linked
            newCanUnlink = !!existingLink; // Can unlink if already linked
         }

         setSelectedEnglishIndex(newSelectedEnglishIndex);
         setSelectedHebrewIndex(newSelectedHebrewIndex);
         setCanLink(newCanLink);
         setCanUnlink(newCanUnlink);
         setControlsDisabled(!(newCanLink || newCanUnlink)); // Controls enabled if link or unlink is possible
     };


     const handleLink = () => {
         if (selectedEnglishIndex !== null && selectedHebrewIndex !== null) {
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
         }
     };


      const handleUnlink = () => {
         // Determine which index is currently selected (only one can be effectively selected for unlinking at a time)
         const indexToUnlink = selectedEnglishIndex !== null ? selectedEnglishIndex : selectedHebrewIndex;
         const keyToFilter = selectedEnglishIndex !== null ? 'englishIndex' : 'hebrewIndex';

         if (indexToUnlink !== null) {
             // Filter out the alignment containing the selected index
             const updatedAlignments = manualAlignments.filter(alignment => alignment[keyToFilter] !== indexToUnlink);
             setManualAlignments(updatedAlignments);

             // Clear selections and reset button states
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

         try {
             // Use the Genkit flow for suggestions
             const { suggestParagraphAlignment } = await import('@/ai/flows/suggest-paragraph-alignment');
             const suggestions = await suggestParagraphAlignment({
                 // Pass the *original* full text to the AI, including metadata
                 englishText: processedParagraphs.english.original.map(p => p.paragraph).join('\n\n'),
                 hebrewText: processedParagraphs.hebrew.original.map(p => p.paragraph).join('\n\n'),
             });

             // Filter suggestions to only include those involving non-hidden paragraphs
             // Note: The AI returns ORIGINAL indices based on the full text it received
             const validSuggestions = suggestions.filter(s =>
                 !hiddenIndices.english.has(s.englishParagraphIndex) &&
                 !hiddenIndices.hebrew.has(s.hebrewParagraphIndex)
             );

             setSuggestedAlignments(validSuggestions);

             // Clear specific highlights for single suggestion
             setHighlightedSuggestionIndex(null);
             setHighlightedSuggestionTargetIndex(null);

             console.log("AI Suggestions (filtered for visible paragraphs):", validSuggestions);

             // Optionally: Automatically apply high-confidence suggestions or highlight all
             // For now, just storing them. Highlighting happens on hover in TextAreaPanel

         } catch (error) {
             console.error("Failed to get AI suggestions:", error);
             // Handle error appropriately (e.g., display an error message)
             setSuggestedAlignments([]); // Clear suggestions on error
         } finally {
             setIsSuggesting(false);
             // Reset controls state based on current selection (if any)
             const engSelected = selectedEnglishIndex !== null;
             const hebSelected = selectedHebrewIndex !== null;
             // Can link if one of each selected and *neither* is already linked elsewhere
             const engAlreadyLinked = engSelected && manualAlignments.some(link => link.englishIndex === selectedEnglishIndex);
             const hebAlreadyLinked = hebSelected && manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex);
             setCanLink(engSelected && hebSelected && !engAlreadyLinked && !hebAlreadyLinked);
             // Can unlink if the selected one is linked
             const engCanUnlink = engSelected && manualAlignments.some(link => link.englishIndex === selectedEnglishIndex);
             const hebCanUnlink = hebSelected && manualAlignments.some(link => link.hebrewIndex === selectedHebrewIndex);
             setCanUnlink(engCanUnlink || hebCanUnlink);
             setControlsDisabled(!(canLink || canUnlink)); // Enable if link/unlink possible
         }
     };


     const handleDropParagraph = (originalIndex: number, language: 'english' | 'hebrew') => {
         console.log(`Hiding paragraph with original index: ${originalIndex} in ${language}`);

         // Update the hidden indices state immutably
         const updatedHidden = new Set(hiddenIndices[language]);
         updatedHidden.add(originalIndex);
         const newHiddenIndicesState = { ...hiddenIndices, [language]: updatedHidden };
         setHiddenIndices(newHiddenIndicesState);


         // Recalculate displayed paragraphs based on the *new* hidden indices state
          setProcessedParagraphs(prev => ({
             ...prev,
             english: {
                 ...prev.english,
                 // Use the new hidden indices for filtering
                 displayed: filterMetadata(prev.english.original, newHiddenIndicesState.english),
             },
             hebrew: {
                 ...prev.hebrew,
                  // Use the new hidden indices for filtering
                 displayed: filterMetadata(prev.hebrew.original, newHiddenIndicesState.hebrew),
             },
         }));


         // Clear selection if the dropped paragraph was selected
         if (language === 'english' && selectedEnglishIndex === originalIndex) {
             setSelectedEnglishIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true);
         } else if (language === 'hebrew' && selectedHebrewIndex === originalIndex) {
             setSelectedHebrewIndex(null);
             setCanLink(false);
             setCanUnlink(false);
             setControlsDisabled(true);
         }

         // Also clear any manual alignments involving this paragraph
         setManualAlignments(prevAlignments =>
             prevAlignments.filter(alignment =>
                 !(alignment.englishIndex === originalIndex || alignment.hebrewIndex === originalIndex)
             )
         );

         // Also clear suggested alignments involving this paragraph
         setSuggestedAlignments(prevSuggestions =>
            prevSuggestions?.filter(suggestion =>
                !(suggestion.englishParagraphIndex === originalIndex || suggestion.hebrewParagraphIndex === originalIndex)
            ) ?? null
        );
     };

      // Auto Scroll Logic - Adjusted for centering and correct observer target
      useEffect(() => {
         if (!textsAreLoaded || !hebrewPanelRef.current) return;

         let observer: IntersectionObserver | null = null;

         // Callback for the IntersectionObserver
         const intersectionCallback = (entries: IntersectionObserverEntry[]) => {
            // Find the entry that represents the "center-most" visible Hebrew paragraph
            let centerEntry: IntersectionObserverEntry | null = null;
            let minDistance = Infinity;

            entries.forEach(entry => {
                // Only consider entries that are currently intersecting
                if (entry.isIntersecting) {
                    const rect = entry.boundingClientRect;
                    // Ensure rootBounds is available before using it
                    const viewportTop = entry.rootBounds?.top ?? 0;
                    const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
                    const viewportCenter = viewportTop + viewportHeight / 2;

                    const elementCenter = rect.top + rect.height / 2;
                    const distance = Math.abs(viewportCenter - elementCenter);

                    if (distance < minDistance) {
                        minDistance = distance;
                        centerEntry = entry;
                    }
                }
            });


             if (centerEntry) {
                 const currentHebrewOriginalIndexStr = centerEntry.target.getAttribute('data-original-index');
                 if (!currentHebrewOriginalIndexStr) {
                     console.warn("[Scroll] Could not find data-original-index on centered Hebrew element.");
                     return;
                 }
                 const currentHebrewOriginalIndex = parseInt(currentHebrewOriginalIndexStr, 10);


                 console.log(`[Scroll] Hebrew paragraph with Original Index ${currentHebrewOriginalIndex} is centered.`);

                 // Check if the Hebrew paragraph is manually aligned
                 const alignment = manualAlignments.find(a => a.hebrewIndex === currentHebrewOriginalIndex);
                 if (alignment) {
                     const targetEnglishOriginalIndex = alignment.englishIndex;
                      console.log(`[Scroll] Hebrew paragraph ${currentHebrewOriginalIndex} is manually aligned to English paragraph ${targetEnglishOriginalIndex}.`);

                     // Find the corresponding English paragraph *element* using its original index
                     const englishParagraphElement = englishPanelRef.current?.querySelector(`.paragraph-box[data-original-index="${targetEnglishOriginalIndex}"]`);
                     if (englishParagraphElement) {
                         console.log(`[Scroll] Scrolling English paragraph ${targetEnglishOriginalIndex} into view (center).`);
                         // Scroll the English paragraph to the center
                         englishParagraphElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                     } else {
                          console.warn(`[Scroll] Could not find English paragraph element for Original Index ${targetEnglishOriginalIndex}. It might be hidden or not rendered.`);
                     }
                 } else {
                      console.log(`[Scroll] Hebrew paragraph ${currentHebrewOriginalIndex} is not manually aligned.`);
                      // Optional: Scroll English panel to top or maintain its position?
                      // For now, do nothing if not aligned.
                 }
             }
         };


         // Find the ScrollArea's viewport within the Hebrew panel ref
         // Ensure querySelector is called on the potentially available current ref
         const hebrewScrollableViewport = hebrewPanelRef.current?.querySelector('[data-radix-scroll-area-viewport]');
         if (hebrewScrollableViewport) {
             console.log("[Scroll] Found Hebrew scroll viewport. Attaching IntersectionObserver.");
             observer = new IntersectionObserver(intersectionCallback, {
                 root: hebrewScrollableViewport, // Observe within the Hebrew panel's scroll area viewport
                 rootMargin: '-50% 0px -50% 0px', // Aim for center visibility using margins
                 threshold: 0.01, // Trigger even if only a tiny part is visible (adjust as needed)
             });

             // Observe all paragraph boxes within the viewport
             // Ensure querySelectorAll is called on the potentially available viewport
             const paragraphElements = hebrewScrollableViewport.querySelectorAll('.paragraph-box');
             if (paragraphElements.length > 0) {
                 paragraphElements.forEach(el => observer?.observe(el));
                 console.log(`[Scroll] Observing ${paragraphElements.length} Hebrew paragraphs.`);
             } else {
                 console.warn("[Scroll] No paragraph boxes found in Hebrew panel to observe.");
             }
         } else {
             console.warn("[Scroll] Could not find Hebrew scroll viewport for IntersectionObserver.");
         }

         // Cleanup function
         return () => {
             if (observer) {
                 console.log("[Scroll] Cleaning up IntersectionObserver.");
                 observer.disconnect();
             }
         };
        // IMPORTANT: Re-run when manual alignments change, or when the list of *displayed* Hebrew paragraphs changes (due to filtering/dropping).
      }, [manualAlignments, processedParagraphs.hebrew.displayed, textsAreLoaded]);


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
                         controlsDisabled={controlsDisabled}
                         isSourceLanguage={false}
                         loadedText={hebrewText}
                         language="hebrew"
                         onDropParagraph={handleDropParagraph}
                         hiddenIndices={hiddenIndices.hebrew}
                         panelRef={hebrewPanelRef} // Pass ref
                     />
                 </div>
             </div>
         </div>
     );
 }

