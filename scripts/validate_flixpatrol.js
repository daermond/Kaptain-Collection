// Optional network check; npm test uses a pinned crawler fixture instead.
const fs = require('node:fs');
const regions = require('../catalog-regions');
const { generatedChartPaths } = require('./lib/wizard-validation');
const CRAWLER_URL = 'https://raw.githubusercontent.com/0xConstant1/fp-crawler/main/catalogs';

function validateCatalog(catalog, data) {
  const parsed = regions.parseFlixPatrol(catalog.id);
  if (!parsed) throw new Error(`Invalid FlixPatrol ID: ${catalog.id}`);
  // Deliberately no ISO-to-slug fallback: models deployments requiring metadata.
  const slug = catalog.metadata?.countrySlug;
  const expected = parsed.country === 'world' ? 'world' : regions.REGION_SLUGS[parsed.country.toUpperCase()];
  if (!slug || (expected && slug !== expected)) throw new Error(`${catalog.id}: missing/wrong countrySlug`);
  if (data.region !== slug && !(slug === 'world' && data.region === 'global')) {
    throw new Error(`${catalog.id}: region file ${data.region} does not match ${slug}`);
  }
  if (catalog.source !== 'flixpatrol' || catalog.type !== parsed.type || !catalog.enabled) {
    throw new Error(`${catalog.id}: invalid catalog routing`);
  }
  // Match AIOMetadata flixpatrolChart.findChart, including variants/overall fallback.
  const category = parsed.type === 'series' ? 'series' : parsed.type === 'all' ? 'overall' : 'movies';
  const key = `${parsed.service}.${category}${parsed.variant ? '-' + parsed.variant : ''}`;
  const charts = data.charts || [];
  const chart = charts.find(c => c.catalog_id === key)
    || (!parsed.variant && parsed.type !== 'all' ? charts.find(c => c.catalog_id === `${parsed.service}.overall`) : null);
  const entries = (chart?.entries || []).filter(e => Number.isInteger(e.tmdb?.id) && e.tmdb.id > 0
    && ['movie', 'tv'].includes(e.tmdb.media_type));
  if (!entries.length) throw new Error(`${catalog.id}: no usable TMDB entries in ${key}`);
  return { id: catalog.id, chart: chart.catalog_id, entries: entries.length };
}

async function checkPaths(paths, loadRegion) {
  const cache = new Map();
  const results = [];
  for (const [path, catalogs] of Object.entries(paths)) {
    for (const catalog of catalogs) {
      const slug = catalog.metadata?.countrySlug;
      if (!slug) throw new Error(`${path}/${catalog.id}: missing countrySlug`);
      if (!cache.has(slug)) cache.set(slug, await loadRegion(slug));
      results.push({ path, ...validateCatalog(catalog, cache.get(slug)) });
    }
  }
  if (!results.length) throw new Error('No generated FlixPatrol catalogs to validate');
  return results;
}

async function main(args = process.argv.slice(2)) {
  let country = 'HU', fixture;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) country = args[++i].toUpperCase();
    else if (args[i] === '--fixture' && args[i + 1]) fixture = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
    else throw new Error('Usage: npm run validate:flixpatrol -- [--region HU] [--fixture file.json]');
  }
  if (!regions.REGION_SLUGS[country]) throw new Error(`Unknown region: ${country}`);
  const paths = await generatedChartPaths(country);
  const results = await checkPaths(paths, async slug => {
    if (fixture) return fixture;
    const fileSlug = slug === 'world' ? 'global' : slug;
    const response = await fetch(`${CRAWLER_URL}/${fileSlug}.json`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${fileSlug}: HTTP ${response.status}`);
    const data = await response.json();
    console.log(`Crawler ${fileSlug}: ${data.scraped_at_utc || data.date}`);
    return data;
  });
  for (const result of results) console.log(`${result.path}: ${result.id} -> ${result.chart}: ${result.entries} usable entries`);
  console.log(`Validated ${results.length} generated descriptors. Metadata hydration and Nuvio device behavior require separate checks.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateCatalog, checkPaths, main };
