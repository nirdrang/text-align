const fs = require('fs');
const path = require('path');

// List of fully covered files from previous check
const fullyCovered = [
  '19050926p01.jsonl',
  '19050927p01.jsonl',
  '19050929p01.jsonl',
  '19050930p01.jsonl',
  '19051001p01.jsonl',
  '19051002p01.jsonl',
  '19051003p01.jsonl',
  '19051005p01.jsonl',
  '19051006p01.jsonl',
  '19051008p01.jsonl',
  '19051010p01.jsonl',
  '19051011p01.jsonl',
  '19051012p01.jsonl',
  '19051017p01.jsonl',
];

function hasAnchorId(obj) {
  return Object.prototype.hasOwnProperty.call(obj, 'anchor_id');
}

function processFile(filename) {
  const lines = fs.readFileSync(filename, 'utf-8').split('\n').filter(Boolean);
  let anyAnchor = false;
  const newLines = lines.map((line, idx) => {
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      return line; // skip malformed
    }
    if (hasAnchorId(obj)) {
      anyAnchor = true;
      return line;
    }
    // Add anchor_id at top level
    return JSON.stringify({ anchor_id: idx + 1, ...obj });
  });
  if (anyAnchor) {
    console.log(`${filename}: already has anchor_id, skipped.`);
    return;
  }
  const newFilename = '~' + filename;
  fs.writeFileSync(newFilename, newLines.join('\n') + '\n', 'utf-8');
  console.log(`${newFilename}: created with anchor_id fields.`);
}

function main() {
  fullyCovered.forEach(processFile);
}

main(); 