const fs = require('fs');

if (process.argv.length < 3) {
  console.error('Usage: node count_content_chars.js <file.jsonl>');
  process.exit(1);
}

const filename = process.argv[2];
let total = 0;
let userTotal = 0;
let assistantTotal = 0;

const lines = fs.readFileSync(filename, 'utf8').split(/\r?\n/).filter(Boolean);
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    if (obj.messages && Array.isArray(obj.messages)) {
      for (const msg of obj.messages) {
        if (typeof msg.content === 'string') {
          total += msg.content.length;
          if (msg.role === 'user') userTotal += msg.content.length;
          if (msg.role === 'assistant') assistantTotal += msg.content.length;
        }
      }
    }
  } catch (e) {
    console.error('Error parsing line:', line.slice(0, 80), e.message);
  }
}

console.log(`Total characters in all content fields: ${total}`);
console.log(`Total characters in 'user' (English) content: ${userTotal}`);
console.log(`Total characters in 'assistant' (Hebrew) content: ${assistantTotal}`); 