import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT = "Translate the following Hebrew paragraph to English. Preserve sentence boundaries: for each Hebrew sentence, output the corresponding English sentence on a new line, in the same order. Do not merge or split sentences. Return ONLY the translation, one English sentence per line.";
const MODEL = "gpt-4o-mini";
const URL = "/v1/chat/completions";
const METHOD = "POST";
const TEMPERATURE = 0;

if (process.argv.length < 3) {
  console.error('Usage: tsx scripts/convert_jsonl_to_openai_batch.ts <input.jsonl> [output.jsonl]');
  process.exit(1);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.jsonl$/, '_openai_batch.jsonl');

const lines = fs.readFileSync(inputPath, 'utf-8').split(/\r?\n/).filter(Boolean);

const outLines = lines.map((line, idx) => {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    console.error(`Skipping invalid JSON on line ${idx + 1}`);
    return null;
  }
  const paragraph = obj.paragraph;
  const custom_id = obj.request_id || `req_${idx + 1}`;
  return JSON.stringify({
    custom_id,
    method: METHOD,
    url: URL,
    body: {
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: paragraph }
      ],
      temperature: TEMPERATURE
    }
  });
}).filter(Boolean);

fs.writeFileSync(outputPath, outLines.join('\n') + '\n', 'utf-8');
console.log(`Wrote ${outLines.length} requests to ${outputPath}`); 