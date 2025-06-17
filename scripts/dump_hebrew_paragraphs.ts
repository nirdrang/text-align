import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import fetch from 'node-fetch';
import { parseParagraphs } from '../src/lib/paragraph_utils';

// Helper to fetch text from a URL (simplified, no cheerio for now)
async function fetchTextFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
    },
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
  return await res.text();
}

async function main() {
  const csvPath = path.join(__dirname, '../public/hebrew_list_eng_ordered.csv');
  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (!Array.isArray(data) || data.length === 0) throw new Error('No rows in CSV');
  const row = data[0] as Record<string, string>;
  const url = row['URL'];
  if (!url) throw new Error('No URL in first row');
  console.log('Fetching:', url);
  const text = await fetchTextFromUrl(url);
  const paragraphs = parseParagraphs(text, 'hebrew');
  const records = paragraphs.map((paragraph, i) => ({ originalIndex: i, paragraph }));
  const jsonl = records.map(r => JSON.stringify(r)).join('\n') + '\n';
  const outFile = path.join(__dirname, `hebrew_paragraphs_first.jsonl`);
  fs.writeFileSync(outFile, jsonl, 'utf-8');
  console.log(`Wrote ${records.length} paragraphs to ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); }); 