
import { useState, useEffect, useCallback } from 'react';

// Helper function to serialize Set to Array for storage
const serializeSet = (set: Set<any>): any[] => Array.from(set);

// Helper function to deserialize Array back to Set
const deserializeSet = (arr: any[]): Set<any> => new Set(arr);

// Type guard to check if a value is a Set
const isSet = (value: any): value is Set<any> => value instanceof Set;

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
    // Function to get initial state from localStorage or use the initialValue
    const getStoredValue = useCallback((): T => {
        // Ensure this code only runs on the client
        if (typeof window === 'undefined') {
            return initialValue;
        }
        try {
            const item = window.localStorage.getItem(key);
            if (item === null) {
                return initialValue;
            }
            const parsed = JSON.parse(item);

            // Handle deserialization for specific types like Set
            if (initialValue instanceof Set) {
                 // If the stored item is an array, convert it back to a Set
                 if (Array.isArray(parsed)) {
                     return deserializeSet(parsed) as T;
                 }
                 // If it's somehow not an array but initial was Set, reset
                  console.warn(`localStorage key "${key}" was expected to be Set (stored as array), but found non-array. Resetting.`);
                 return initialValue;
            }
             // Handle object containing Sets (like hiddenIndices)
             if (typeof initialValue === 'object' && initialValue !== null && !Array.isArray(initialValue)) {
                 const result: any = {};
                 let changed = false;
                 for (const prop in initialValue) {
                     if (Object.prototype.hasOwnProperty.call(initialValue, prop)) {
                         const initialPropValue = (initialValue as any)[prop];
                         const storedPropValue = parsed[prop];
                         if (initialPropValue instanceof Set) {
                              if (Array.isArray(storedPropValue)) {
                                 result[prop] = deserializeSet(storedPropValue);
                                 changed = true; // Indicate structure was adjusted
                             } else {
                                 console.warn(`localStorage key "${key}", property "${prop}" was expected to be Set (stored as array), but found non-array. Resetting property.`);
                                 result[prop] = initialPropValue; // Reset this property
                                 changed = true;
                             }
                         } else {
                            result[prop] = storedPropValue !== undefined ? storedPropValue : initialPropValue; // Use stored or default
                         }
                     }
                 }
                 // If we performed deserialization, return the constructed object
                 if (changed) return result as T;
             }


            return parsed;
        } catch (error) {
            // If error also return initialValue
            console.error(`Error reading localStorage key “${key}”:`, error);
            return initialValue;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]); // Depend only on key, initialValue is fallback

    // State to store our value
    // Pass initial state function to useState so logic is only executed once on mount
    const [storedValue, setStoredValue] = useState<T>(() => getStoredValue());

    // Return a wrapped version of useState's setter function that ...
    // ... persists the new value to localStorage.
    const setValue = useCallback((value: T | ((val: T) => T)) => {
        // Ensure this code only runs on the client
        if (typeof window === 'undefined') {
            console.warn(
                `Tried setting localStorage key “${key}” even though environment is not a client`
            );
            return;
        }
        try {
            // Allow value to be a function so we have same API as useState
            const valueToStore = value instanceof Function ? value(storedValue) : value;

            // Save state
            setStoredValue(valueToStore);

            // Prepare value for storage (handle Sets)
             let storableValue: any;
             if (isSet(valueToStore)) {
                 storableValue = serializeSet(valueToStore);
             } else if (typeof valueToStore === 'object' && valueToStore !== null && !Array.isArray(valueToStore)) {
                 // Handle objects possibly containing Sets
                 storableValue = {};
                 let hasSets = false;
                 for (const prop in valueToStore) {
                     if (Object.prototype.hasOwnProperty.call(valueToStore, prop)) {
                         const propValue = (valueToStore as any)[prop];
                         if (isSet(propValue)) {
                             storableValue[prop] = serializeSet(propValue);
                             hasSets = true;
                         } else {
                             storableValue[prop] = propValue;
                         }
                     }
                 }
                 if (!hasSets) {
                     storableValue = valueToStore; // Store original object if no sets found
                 }
             } else {
                 storableValue = valueToStore;
             }


            // Save to local storage
            window.localStorage.setItem(key, JSON.stringify(storableValue));
        } catch (error) {
            // A more advanced implementation would handle the error case
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, storedValue]);

    // Effect to update state if localStorage changes from another tab/window
    useEffect(() => {
        // Ensure this code only runs on the client
        if (typeof window === 'undefined') {
            return;
        }

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === key && event.storageArea === window.localStorage) {
                 console.log(`Storage change detected for key: ${key}`);
                 setStoredValue(getStoredValue()); // Re-read and parse from storage
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [key, getStoredValue]); // Depend on getStoredValue to re-run if key changes

    // Effect to initialize/rehydrate state on client mount,
    // especially important after SSR or if initialValue changes.
    useEffect(() => {
         // Only run on the client
         if (typeof window !== 'undefined') {
             setStoredValue(getStoredValue());
         }
     }, [getStoredValue]);


    return [storedValue, setValue];
}

export { useLocalStorage };
