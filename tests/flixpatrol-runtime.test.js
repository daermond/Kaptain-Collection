const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const regions = require('../catalog-regions');
const availability = require('../collections/flixpatrol-availability');
const { appContext, loadWizard, generatedChartPaths } = require('../scripts/lib/wizard-validation');
const { validateCatalog, checkPaths } = require('../scripts/validate_flixpatrol');
const fixture = require('./fixtures/flixpatrol-hungary.json');

for (const [id, slug] of [
  ['flixpatrol.netflix.hu.movie', 'hungary'],
  ['flixpatrol.hbo-max.hu.series', 'hungary'],
  ['flixpatrol.skyshowtime.hu.movie', 'hungary'],
  ['flixpatrol.hbo-max.nl.series', 'netherlands'],
  ['flixpatrol.netflix.world.all', 'world'],
  ['flixpatrol.netflix.in.all.hi', 'india']
]) {
  test(`${id} has a canonical descriptor in every builder`, () => {
    const wizard = loadWizard(appContext());
    const parsed = regions.parseFlixPatrol(id);
    const entries = [regions.chartCatalog({ catalogId: id }), wizard.synthesizeFriendCatalog(id),
      wizard.aioCatalogConfigEntry({ id, name: 'Top 10', type: parsed.type })];
    for (const entry of entries) {
      assert.equal(entry.metadata.countrySlug, slug);
      assert.equal(entry.type, parsed.type);
      assert.equal(entry.displayType, parsed.type === 'all' ? 'movie' : parsed.type);
      assert.equal(entry.source, 'flixpatrol');
      assert.equal(entry.enableRatingPosters, true);
      assert.equal(entry.showInHome, false); // Collection rows own home placement.
    }
    // ID is authoritative even if the friend pack's type hint is stale/missing.
    assert.equal(wizard.synthesizeFriendCatalog(id, 'tv').type, parsed.type);
  });
}

test('friend templates gain canonical metadata without changing the shared pack or other catalogs', () => {
  const wizard = loadWizard(appContext());
  const templates = [
    { id: 'flixpatrol.netflix.hu.movie', name: 'Custom name', metadata: { countrySlug: 'united-states', other: 'keep' }, displayType: 'series' },
    { id: 'flixpatrol.hbo-max.hu.series', name: 'Shows' },
    { id: 'mdblist.123', name: 'Other', metadata: { other: 'keep' } }
  ];
  const before = JSON.stringify(templates);
  const output = wizard.filterFriendCatalogs(templates, templates.map(c => c.id), {});
  for (const entry of output.slice(0, 2)) {
    assert.equal(entry.metadata.countrySlug, 'hungary');
    assert.equal(entry.source, 'flixpatrol');
    assert.equal(entry.enableRatingPosters, true);
  }
  assert.equal(output[0].metadata.other, 'keep');
  assert.equal(output[0].name, 'Custom name');
  assert.equal(output[0].displayType, 'series');
  assert.deepEqual(JSON.parse(JSON.stringify(output[2])), templates[2]);
  assert.equal(JSON.stringify(templates), before);
  assert.equal(wizard.synthesizeFriendCatalog('mdblist.123', 'tv').source, 'mdblist');
});

test('locked/global/unknown/unsupported region policy still controls the final descriptor', () => {
  const source = { catalogId: 'flixpatrol.netflix.us.movie', countryLocked: true };
  assert.equal(regions.chartCatalog(regions.regionalize(source, 'HU', availability).source).metadata.countrySlug, 'united-states');
  const global = { catalogId: 'flixpatrol.netflix.world.all' };
  assert.equal(regions.chartCatalog(regions.regionalize(global, 'HU', availability).source).metadata.countrySlug, 'world');
  assert.equal(regions.chartCatalog(regions.regionalize({ ...source, countryLocked: false }, 'ZZ', availability).source).metadata.countrySlug, 'united-states');
  assert.equal(regions.regionalize({ catalogId: 'flixpatrol.skyshowtime.hu.movie' }, 'US', availability).source, null);
  assert.deepEqual(regions.chartCatalog({ catalogId: 'flixpatrol.netflix.zz.movie' }).metadata, {});
  assert.equal(regions.chartCatalog({ catalogId: 'unrelated.catalog' }), null);
});

test('real native, friend, Self-Host and AIO converter outputs resolve against pinned crawler data', async () => {
  const paths = await generatedChartPaths('HU');
  const results = await checkPaths(paths, async () => fixture);
  assert.equal(results.length, 36);
  for (const result of results) assert.equal(result.entries, 10, `${result.path}/${result.id}`);
  for (const id of ['flixpatrol.netflix.hu.movie', 'flixpatrol.hbo-max.hu.series', 'flixpatrol.skyshowtime.hu.movie']) {
    assert.ok(results.some(r => r.id === id));
  }
});

test('actual AIO Streams build saves canonical charts and repoints both media types', async () => {
  const ctx = appContext();
  ctx.window.kaptainCustomize = { country: 'HU', locale: 'en' };
  vm.runInContext(`database = database.filter(c => c.title === 'Streaming Services').map(c => ({ ...c,
    folders: c.folders.filter(f => f.title === 'SkyShowtime').map(f => ({ ...f, sources: f.sources.filter(s => s.provider === 'addon') })) }));`, ctx);
  const saves = [], pushes = [], installs = [];
  const template = JSON.parse(fs.readFileSync(path.join(__dirname, '../Kaptain_Catalog_Template.json'), 'utf8'));
  ctx.fetch = async (url, options) => {
    if (String(url).includes('Kaptain_Catalog_Template')) return { ok: true, json: async () => template };
    if (String(url).endsWith('/api/config/save')) {
      saves.push(JSON.parse(options.body).config);
      return { ok: true, json: async () => ({ success: true, installUrl: 'https://example.test/stremio/charts/manifest.json' }) };
    }
    if (String(url).endsWith('/api/v1/user')) return { ok: true, json: async () => ({ success: true, uuid: 'test', encryptedPassword: 'test' }) };
    if (String(url).endsWith('manifest.json')) return { ok: true, json: async () => ({ id: 'test.aio.streams', catalogs: [] }) };
    throw new Error(`Unexpected request: ${url}`);
  };
  ctx.window.NuvioPush = {
    installAddons: async (...args) => installs.push(args),
    removeAddonsByName: async () => {},
    pushCollections: async (...args) => pushes.push(args[2])
  };
  const wizard = loadWizard(ctx);
  wizard.state.forYouProviders = { trakt: false, mdblist: false, bingecat: false };
  const output = await wizard.generateAIOStreamsBuild('', '', '', '', 'none', ['torrentio']);
  assert.equal(output.warningMsg, null);
  const charts = saves.flatMap(c => c.catalogs).filter(c => regions.parseFlixPatrol(c.id));
  assert.equal(charts.length, 2);
  for (const chart of charts) {
    assert.equal(chart.metadata.countrySlug, 'hungary');
    assert.equal(chart.enableRatingPosters, true);
    assert.equal(validateCatalog(chart, fixture).entries, 10);
  }
  assert.equal(installs.length, 1);
  assert.equal(pushes.length, 1);
  const folder = pushes[0][0].folders[0];
  assert.deepEqual([...folder.sources.map(s => s.type)], ['movie', 'series']);
  for (const source of folder.sources) {
    assert.equal(source.addonId, 'test.aio.streams');
    assert.match(source.catalogId, /^aiometa-\d+e3b0\.flixpatrol\.skyshowtime\.hu\.(movie|series)$/);
  }
  assert.equal(folder.catalogSources.length, 2);
});

test('runtime validation rejects the original bug, stale slugs and empty/unresolved charts', async () => {
  const good = regions.chartCatalog({ catalogId: 'flixpatrol.netflix.hu.movie' });
  assert.throws(() => validateCatalog({ ...good, metadata: {} }, fixture), /countrySlug/);
  assert.throws(() => validateCatalog({ ...good, metadata: { countrySlug: 'united-states' } }, fixture), /countrySlug/);
  assert.throws(() => validateCatalog(good, { ...fixture, region: 'netherlands' }), /region file/);
  assert.throws(() => validateCatalog(good, { ...fixture, charts: [] }), /no usable TMDB/);
  assert.throws(() => validateCatalog(good, { ...fixture, charts: [{ catalog_id: 'netflix.movies', entries: [{ tmdb: null }] }] }), /no usable TMDB/);
  await assert.rejects(checkPaths({}, async () => fixture), /No generated/);
});

test('runtime lookup honors overall fallback and explicit variants', () => {
  const data = { region: 'india', charts: [
    { catalog_id: 'example.overall', entries: [{ tmdb: { id: 1, media_type: 'movie' } }] },
    { catalog_id: 'example.overall-hi', entries: [{ tmdb: { id: 2, media_type: 'tv' } }] }
  ] };
  assert.equal(validateCatalog(regions.chartCatalog({ catalogId: 'flixpatrol.example.in.series' }), data).chart, 'example.overall');
  assert.equal(validateCatalog(regions.chartCatalog({ catalogId: 'flixpatrol.example.in.all.hi' }), data).chart, 'example.overall-hi');
  assert.throws(() => validateCatalog(regions.chartCatalog({ catalogId: 'flixpatrol.example.in.all.absent' }), data), /no usable TMDB/);
});
