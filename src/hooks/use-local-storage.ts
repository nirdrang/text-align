
import { useState, useEffect } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // Function to get initial state from localStorage or use the initialValue
  const getStoredValue = (): T => {
    // Ensure this code only runs on the client
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // If error also return initialValue
      console.error(`Error reading localStorage key “${key}”:`, error);
      return initialValue;
    }
  };

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(getStoredValue);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value: T | ((val: T) => T)) => {
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
      // Save to local storage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  };

  // Effect to update state if localStorage changes from another tab/window
  useEffect(() => {
     // Ensure this code only runs on the client
     if (typeof window === 'undefined') {
       return;
     }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.storageArea === window.localStorage) {
        try {
          setStoredValue(event.newValue ? JSON.parse(event.newValue) : initialValue);
        } catch (error) {
          console.error(`Error parsing localStorage change for key “${key}”:`, error);
          setStoredValue(initialValue);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  // We only want this effect to run on mount and unmount, hence the empty dependency array.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, initialValue]);


  // Update state if initialValue changes (though typically it shouldn't for localStorage)
  // This also helps ensure the state is correctly initialized on the client after server render
  useEffect(() => {
    setStoredValue(getStoredValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on client mount


  return [storedValue, setValue];
}

export { useLocalStorage };
