// Run manually to update the offline service/country/section index.
const fs = require('node:fs');
const path = require('node:path');
const SOURCE_URL = 'https://raw.githubusercontent.com/0xConstant1/fp-crawler/main/catalogs/availability.json';

function serialize(index) {
  if (index.schema_version !== 1 || !index.regions || typeof index.regions !== 'object'
      || !index.regions.hungary?.skyshowtime || !index.regions['united-states']?.netflix) {
    throw new Error('Unexpected availability format; previous snapshot preserved.');
  }
  for (const services of Object.values(index.regions)) {
    for (const sections of Object.values(services)) {
      for (const variants of Object.values(sections)) {
        if (!Array.isArray(variants) || variants.some(v => typeof v !== 'string')) throw new Error('Invalid chart variants');
      }
    }
  }
  const snapshot = { schema_version: 1, generated_at: index.generated_at, source_url: SOURCE_URL, regions: index.regions };
  return '// Chart availability snapshot; refresh with npm run refresh:charts.\n'
    + '(function(root) { const data = ' + JSON.stringify(snapshot) + ';\n'
    + 'if (typeof module === "object" && module.exports) module.exports = data;\n'
    + 'else root.KAPTAIN_FLIXPATROL_AVAILABILITY = data;\n'
    + '})(typeof window === "object" ? window : globalThis);\n';
}

async function refresh() {
  const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Availability fetch failed: HTTP ${response.status}`);
  const index = await response.json();
  const output = serialize(index);
  fs.writeFileSync(path.join(__dirname, '../collections/flixpatrol-availability.js'), output);
  console.log(`Updated ${Object.keys(index.regions).length} regions (${index.generated_at}).`);
}
if (require.main === module) refresh().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { serialize };
