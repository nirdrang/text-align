const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const CSV_PATH = path.join(__dirname, 'public', 'lectures_ordered_new.csv');

function getJsonlFiles(specificFile) {
  if (specificFile) return [specificFile];
  return fs.readdirSync(__dirname).filter(f => f.endsWith('.jsonl'));
}

function getBaseName(jsonlFile) {
  return jsonlFile.replace(/\.jsonl$/, '');
}

function getMatchingLectureUrlByGA(csvRows, baseName, hebrewGA, date) {
  // Find a row whose URL ends with `${baseName}.html` (case-insensitive), GA matches, and date matches
  for (const row of csvRows) {
    if (
      row.URL &&
      row.URL.toLowerCase().endsWith(baseName.toLowerCase() + '.html') &&
      row.GA &&
      hebrewGA &&
      row.GA.replace(/^GA\s*/, '').toLowerCase() === hebrewGA.replace(/^GA\s*/, '').toLowerCase() &&
      row.Date === date
    ) {
      return row.URL;
    }
  }
  return null;
}

function getMatchingLectureUrlByDate(csvRows, baseName, date) {
  // Find a row whose URL ends with `${baseName}.html` (case-insensitive) and date matches
  for (const row of csvRows) {
    if (
      row.URL &&
      row.URL.toLowerCase().endsWith(baseName.toLowerCase() + '.html') &&
      row.Date === date
    ) {
      return row.URL;
    }
  }
  return null;
}

function splitParagraphs(text) {
  // Split by double newlines, trim, filter empty, skip one-line paragraphs
  return text
    .split(/(?:\s*\n\s*){2,}/)
    .map(p => p.trim())
    .filter(p => p && p.split('\n').length > 1);
}

function normalizeWhitespace(str) {
  return str.replace(/\s+/g, ' ').trim();
}

function extractEnglishParagraphsFromJsonl(jsonlPath) {
  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
  const paragraphs = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (Array.isArray(obj.messages) && obj.messages[1] && obj.messages[1].role === 'user') {
        paragraphs.push(obj.messages[1].content.trim());
      }
    } catch (e) {
      // skip malformed lines
    }
  }
  return paragraphs;
}

async function fetchAndExtractParagraphs(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html',
      },
      timeout: 15000,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);
    let main = $('main, article, .main-content, #main, #content, [role="main"]').first();
    if (!main.length) main = $('body');
    // Remove noise
    main.find('script, style, nav, footer, header, aside, form, noscript, [aria-hidden="true"], .advertisement, .ad, .sidebar, iframe, figure:not(:has(figcaption)), button, input, select, textarea, label, .menu, .footer, .header, #nav, #footer, #header, link[rel="stylesheet"]').remove();
    // Get text, replace <br> with newline
    main.find('br').replaceWith('\n');
    const text = main.text();
    return splitParagraphs(text);
  } catch (e) {
    return { error: e.message };
  }
}

function isNavigationOrHeader(paragraph) {
  const navPatterns = [
    /Table of Contents/i,
    /Previous/i,
    /Next/i,
    /Copyright/i,
    /All rights reserved/i,
    /^\s*$/, // empty
    /^The Foundations of Esotericism\s*GA 93a$/i, // specific header seen in your missing paragraphs
  ];
  return navPatterns.some(re => re.test(paragraph));
}

function printDatesWithMultipleEnglishUrls(csvRows) {
  const byDate = {};
  for (const row of csvRows) {
    if (!row.Date || !row.URL) continue;
    if (!byDate[row.Date]) byDate[row.Date] = [];
    byDate[row.Date].push(row.URL);
  }
  const multi = Object.entries(byDate).filter(([date, urls]) => urls.length > 1);
  if (multi.length) {
    console.log('--- Dates with Multiple English URLs ---');
    multi.forEach(([date, urls]) => {
      console.log(`Date: ${date}`);
      urls.forEach(url => {
        const base = url.match(/(\d{8}p\d{2})\.html/i);
        console.log(`  URL: ${url}` + (base ? ` | Base filename: ${base[1]}.jsonl` : ''));
      });
      console.log('');
    });
  } else {
    console.log('No dates with multiple English URLs found.');
  }
}

async function main() {
  const specificFile = process.argv[2];
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const { data: csvRows } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  printDatesWithMultipleEnglishUrls(csvRows);
  const hebrewCsvText = fs.readFileSync(path.join(__dirname, 'public', 'hebrew_list_eng_ordered.csv'), 'utf-8');
  const { data: hebrewRows } = Papa.parse(hebrewCsvText, { header: true, skipEmptyLines: true });
  const jsonlFiles = getJsonlFiles(specificFile);
  const notCovered = [];
  for (const jsonlFile of jsonlFiles) {
    const baseName = getBaseName(jsonlFile);
    // Find the Hebrew row for this file (by date and baseName)
    const engCsvRow = csvRows.find(row => row.URL && row.URL.toLowerCase().endsWith(baseName.toLowerCase() + '.html'));
    const engDate = engCsvRow ? engCsvRow.Date : null;
    // Find the Hebrew row by date
    const hebrewRow = hebrewRows.find(row => row.Date === engDate);
    const hebrewGA = hebrewRow ? (rowGA => rowGA && rowGA.replace(/^GA\s*/, ''))(hebrewRow.GA) : null;
    // Try GA match first
    let url = getMatchingLectureUrlByGA(csvRows, baseName, hebrewGA, engDate);
    if (!url) {
      // Fallback: try date-only match
      url = getMatchingLectureUrlByDate(csvRows, baseName, engDate);
      if (url) {
        console.log(`${jsonlFile}: No matching GA (${hebrewGA || 'N/A'}) for date ${engDate || 'N/A'}; falling back to date-only match.`);
      } else {
        console.log(`${jsonlFile}: No matching URL for date ${engDate || 'N/A'} in English CSV. Skipping.`);
        continue;
      }
    }
    const jsonlParagraphs = extractEnglishParagraphsFromJsonl(jsonlFile).map(normalizeWhitespace);
    const fetched = await fetchAndExtractParagraphs(url);
    if (jsonlFiles.length === 1) {
      if (fetched.error) {
        console.log(`${jsonlFile}: Error fetching lecture: ${fetched.error}`);
        return;
      }
      // Filter out navigation/header/footer paragraphs
      const lectureParagraphs = fetched.filter(p => !isNavigationOrHeader(p));
      // Print first 3 paragraphs for context
      console.log('--- First 3 paragraphs fetched from lecture ---');
      lectureParagraphs.slice(0, 3).forEach((p, i) => {
        console.log(`[${i + 1}]:\n${p}\n`);
      });
      const normalizedLectureParagraphs = lectureParagraphs.map(normalizeWhitespace);
      const missing = normalizedLectureParagraphs.filter(p => !jsonlParagraphs.includes(p));
      if (missing.length === 0) {
        console.log(`${jsonlFile}: covers all paragraphs.`);
      } else {
        console.log(`${jsonlFile}: missing ${missing.length} paragraphs.\n`);
        missing.forEach((p, i) => {
          // Find index in normalizedLectureParagraphs
          const idx = normalizedLectureParagraphs.findIndex(lp => lp === p);
          console.log(`--- Context for missing paragraph ${i + 1} ---`);
          if (idx > 0) {
            console.log(`[Before]:\n${lectureParagraphs[idx - 1]}\n`);
          }
          console.log(`[Missing]:\n${lectureParagraphs[idx]}\n`);
          if (idx < lectureParagraphs.length - 1) {
            console.log(`[After]:\n${lectureParagraphs[idx + 1]}\n`);
          }
          console.log('');
        });
      }
    } else {
      if (fetched.error) {
        console.log(`${jsonlFile}: Error fetching lecture: ${fetched.error}`);
        continue;
      }
      // Filter out navigation/header/footer paragraphs
      const lectureParagraphs = fetched.filter(p => !isNavigationOrHeader(p));
      const normalizedLectureParagraphs = lectureParagraphs.map(normalizeWhitespace);
      const missing = normalizedLectureParagraphs.filter(p => !jsonlParagraphs.includes(p));
      if (missing.length > 0) {
        // Find all row numbers and lecture order numbers in hebrewRows with matching date
        let hebrewOrder = [];
        let lectureOrderNumbers = [];
        if (engDate) {
          hebrewOrder = hebrewRows
            .map((row, idx) => ({ date: row.Date, idx: idx + 2, order: row['Lecture Order'] })) // +2: 1 for 0-based, 1 for header
            .filter(r => r.date === engDate);
          lectureOrderNumbers = hebrewOrder.map(r => r.order).filter(Boolean);
        }
        notCovered.push({ file: jsonlFile, missing: missing.length, date: engDate, hebrewOrder: hebrewOrder.map(r => r.idx), lectureOrderNumbers });
      }
      if (missing.length === 0) {
        console.log(`${jsonlFile}: covers all paragraphs.`);
      } else {
        console.log(`${jsonlFile}: missing ${missing.length} paragraphs.`);
      }
    }
  }
  // Print summary
  if (!specificFile) {
    console.log('\n--- Not Fully Covered Files: Hebrew Order Summary ---');
    console.log('File\tDate\tHebrew lecture order row(s)\tLecture Order Number(s)\tMissing Paragraphs');
    notCovered.forEach(({ file, date, hebrewOrder, lectureOrderNumbers, missing }) => {
      console.log(`${file}\t${date || 'N/A'}\t${hebrewOrder.length ? hebrewOrder.join(', ') : 'N/A'}\t${lectureOrderNumbers.length ? lectureOrderNumbers.join(', ') : 'N/A'}\t${missing}`);
    });
  }
}

main(); 