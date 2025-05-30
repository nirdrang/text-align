import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import Papa from "papaparse";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// CSV parsing helper for use in React
export function parseCsvFile(filePath: string): Promise<any[]> {
  return fetch(filePath)
    .then((response) => response.text())
    .then((csvText) => {
      const { data, errors } = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });
      if (errors.length > 0) {
        throw new Error("CSV parse error: " + errors.map((e: Papa.ParseError) => e.message).join(", "));
      }
      return data as any[];
    });
}
