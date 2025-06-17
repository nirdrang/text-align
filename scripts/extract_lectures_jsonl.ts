import fs from 'fs';

if (process.argv.length < 4) {
  console.error('Usage: tsx scripts/extract_lectures_jsonl.ts <input.jsonl> <output.jsonl>');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];

const lines = fs.readFileSync(inputPath, 'utf-8').split(/\r?\n/).filter(Boolean);

// Extract for lectures 2, 3, 4
const allowedLectures = new Set(['2', '3', '4']);

const outLines = lines.filter(line => {
  try {
    const obj = JSON.parse(line);
    const reqId = obj.request_id;
    if (!reqId) return false;
    const parts = reqId.split('_');
    if (parts.length !== 2) return false;
    const lectureNum = parts[1];
    return allowedLectures.has(lectureNum);
  } catch {
    return false;
  }
});

fs.writeFileSync(outputPath, outLines.join('\n') + '\n', 'utf-8');
console.log(`Wrote ${outLines.length} paragraphs to ${outputPath}`); 