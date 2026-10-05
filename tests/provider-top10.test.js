const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const regions = require('../catalog-regions');
const availability = require('../collections/flixpatrol-availability');
const { appContext, loadWizard, generatedChartPaths } = require('../scripts/lib/wizard-validation');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('all 18 provider Top 10 folders use verified FlixPatrol charts with consistent labels', () => {
  const ctx = appContext();
  const collection = ctx.window.NUVIO_DATABASE.find(c => c.title === 'Streaming Services');
  const split = JSON.parse(read('collections/streaming_services.json'))[0];
  assert.deepEqual(JSON.parse(JSON.stringify(collection)), split);
  let providers = 0;
  for (const folder of collection.folders) {
    const charts = folder.sources.filter(s => s.title.startsWith('Top 10'));
    if (!charts.length) continue;
    providers++;
    for (const source of charts) {
      const parsed = regions.parseFlixPatrol(source.catalogId);
      assert.ok(parsed, folder.title);
      assert.equal(source.provider, 'addon');
      assert.equal(source.addonId, 'aio-metadata');
      assert.equal(source.title, regions.chartName(source.catalogId));
      assert.equal(source.name, source.title);
      assert.equal(source.genre, 'None');
      assert.ok(!source.tmdbId && !source.traktListId && !source.mediaType);
      const section = parsed.type === 'movie' ? 'movies' : parsed.type === 'series' ? 'series' : 'overall';
      assert.ok(Object.hasOwn(availability.regions[regions.REGION_SLUGS[parsed.country.toUpperCase()]][parsed.service], section));
      assert.ok(folder.catalogSources.some(r => r.catalogId === source.catalogId && r.type === source.type && r.title === source.title));
    }
  }
  assert.equal(providers, 18);
  for (const name of ['AMC+', 'Crunchyroll', 'Discovery+', 'MGM+', 'Mubi', 'Shudder', 'Tubi TV']) {
    const charts = collection.folders.find(f => f.title === name).sources.filter(s => s.title.startsWith('Top 10'));
    assert.equal(charts.length, 1, name);
    assert.equal(charts[0].type, 'all');
    assert.equal(charts[0].title, 'Top 10');
  }
  assert.equal(collection.folders.find(f => f.title === 'Pluto TV').sources.filter(s => s.title.startsWith('Top 10')).length, 1);
});

test('HU exports six supported providers, omits unsupported charts and keeps their other lists', () => {
  const ctx = appContext();
  ctx.window.kaptainCustomize = { country: 'HU', locale: 'en' };
  const before = JSON.stringify(ctx.window.NUVIO_DATABASE);
  const folders = vm.runInContext('assembleFilteredDatabase()', ctx).find(c => c.title === 'Streaming Services').folders;
  for (const name of ['SkyShowtime', 'Netflix', 'Apple TV+', 'Prime Video', 'Disney+', 'HBO Max']) {
    const folder = folders.find(f => f.title === name);
    const charts = folder.sources.filter(s => regions.parseFlixPatrol(s.catalogId));
    assert.equal(charts.length, 2, name);
    assert.deepEqual([...charts.map(s => s.title)], ['Top 10 Movies', 'Top 10 Series']);
    for (const source of charts) assert.match(source.catalogId, /\.hu\.(movie|series)$/);
    assert.equal(folder.catalogSources.length, 2);
  }
  for (const name of ['Hulu', 'AMC+', 'Mubi', 'Discovery+']) {
    const folder = folders.find(f => f.title === name);
    assert.ok(folder.sources.length > 0, name);
    assert.ok(!folder.sources.some(s => s.title.startsWith('Top 10')), name);
    assert.equal(folder.catalogSources.length, 0);
  }
  assert.equal(JSON.stringify(ctx.window.NUVIO_DATABASE), before);
});

test('friend setup uses the same names for existing templates and synthesized regional catalogs', () => {
  const ctx = appContext('collections/database.kaoxt.js');
  const wizard = loadWizard(ctx);
  const templates = JSON.parse(read('collections/kaoxt-aio-catalogs.json'));
  for (const country of ['US', 'HU']) {
    ctx.window.kaptainCustomize = { country, locale: 'en' };
    const collections = vm.runInContext('assembleFilteredDatabase()', ctx);
    const { ids, typeById, nameById } = wizard.collectSelectedAioCatalogIds(collections);
    const output = wizard.filterFriendCatalogs(Array.isArray(templates) ? templates : templates.catalogs, ids, typeById, nameById);
    for (const catalog of output.filter(c => regions.parseFlixPatrol(c.id))) {
      assert.equal(catalog.name, regions.chartName(catalog.id));
      assert.equal(catalog.metadata.countrySlug, regions.REGION_SLUGS[country]);
    }
    for (const source of collections.flatMap(c => c.folders).flatMap(f => f.sources).filter(s => regions.parseFlixPatrol(s.catalogId))) {
      assert.equal(source.title, regions.chartName(source.catalogId));
      assert.equal(source.name, source.title);
    }
  }
});

test('native and friend Self-Host/AIO descriptors retain readable labels instead of catalog IDs', async () => {
  const paths = await generatedChartPaths('HU');
  for (const catalogs of Object.values(paths)) for (const catalog of catalogs) {
    assert.equal(catalog.name, regions.chartName(catalog.id));
    assert.equal(catalog.metadata.countrySlug, 'hungary');
  }
});
