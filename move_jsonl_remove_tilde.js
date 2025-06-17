const fs = require('fs');
const path = require('path');

fs.readdirSync('.').forEach(file => {
  if (/^~.*\.jsonl$/.test(file)) {
    const newName = file.slice(1);
    fs.renameSync(file, newName);
    console.log(`Renamed ${file} -> ${newName}`);
  }
}); 