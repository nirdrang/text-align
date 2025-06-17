import fs from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';

// Types
interface HebrewParagraph {
  custom_id: string;
  body: {
    messages: { role: string; content: string }[];
  };
}

interface OpenAIResponse {
  custom_id: string;
  response: {
    status_code: number;
    body: {
      choices: { message: { content: string } }[];
    };
  };
}

interface CacheRecord {
  key: string;
  he: string;
  en: string;
  [extra: string]: any;
}

async function readJsonlFile<T>(filePath: string): Promise<T[]> {
  const lines = (await fs.readFile(filePath, 'utf-8')).split(/\r?\n/).filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

function getLectureNumber(custom_id: string): string {
  const parts = custom_id.split('_');
  return parts[1];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: tsx scripts/generate_cache_from_batches.ts <hebrew_jsonl> <openai_jsonl>');
    process.exit(1);
  }
  const hebrewFile = path.resolve(args[0]);
  const openaiFile = path.resolve(args[1]);
  const cacheDir = path.resolve('cache');

  // Ensure cache directory exists
  await fs.mkdir(cacheDir, { recursive: true });

  // Read input files
  const hebrewParagraphs: HebrewParagraph[] = await readJsonlFile(hebrewFile);
  const openaiResponses: OpenAIResponse[] = await readJsonlFile(openaiFile);

  // Build lookup maps
  const heByCustomId = new Map<string, string>();
  for (const h of hebrewParagraphs) {
    const he = h.body.messages.find(m => m.role === 'user')?.content || '';
    heByCustomId.set(h.custom_id, he);
  }

  const enByCustomId = new Map<string, string>();
  for (const r of openaiResponses) {
    if (r.response && r.response.status_code === 200) {
      const en = r.response.body.choices[0]?.message?.content || '';
      enByCustomId.set(r.custom_id, en);
    }
  }

  // Group custom_ids by lecture number
  const lectureGroups = new Map<string, string[]>();
  for (const custom_id of heByCustomId.keys()) {
    const lecture = getLectureNumber(custom_id);
    if (!lectureGroups.has(lecture)) lectureGroups.set(lecture, []);
    lectureGroups.get(lecture)!.push(custom_id);
  }
  console.log('Lectures found:', Array.from(lectureGroups.keys()));
  for (const [lecture, custom_ids] of lectureGroups.entries()) {
    console.log(`Lecture ${lecture}: ${custom_ids.length} paragraphs`);
  }

  // For each lecture, write cache/{lecture}.jsonl
  for (const [lecture, custom_ids] of lectureGroups.entries()) {
    const records: CacheRecord[] = [];
    for (const custom_id of custom_ids) {
      const he = heByCustomId.get(custom_id) || '';
      const en = enByCustomId.get(custom_id) || '';
      if (!he) {
        console.warn(`Missing Hebrew for custom_id: ${custom_id}`);
      }
      if (!enByCustomId.has(custom_id)) {
        console.warn(`Missing English for custom_id: ${custom_id}`);
      }
      const key = Buffer.from(he, 'utf-8').toString('base64');
      records.push({ key, he, en });
    }
    const outPath = path.join(cacheDir, `${lecture}.jsonl`);
    const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
    await fs.writeFile(outPath, content, 'utf-8');
    console.log(`Wrote ${records.length} records to ${outPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 