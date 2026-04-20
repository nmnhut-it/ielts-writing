import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { validateChart } = require('../scripts/utils/chartSchema.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(__dirname, '../data/task1-charts.json'), 'utf8');
const data = JSON.parse(raw);
let failed = 0;
data.forEach(c => {
    const r = validateChart(c);
    if (!r.valid) { console.error(c.id || '(no id)', r.errors); failed++; }
});
console.log(failed === 0 ? 'OK: all ' + data.length + ' charts valid' : failed + ' FAILED');
process.exit(failed === 0 ? 0 : 1);
