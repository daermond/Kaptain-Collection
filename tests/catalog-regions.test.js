const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const regions = require('../catalog-regions');
const availability = require('../collections/flixpatrol-availability');
const { serialize } = require('../scripts/refresh_flixpatrol_availability');
const { appContext } = require('../scripts/lib/wizard-validation');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const addon = (service, type = 'movie', country = 'us') => ({
  provider: 'addon', addonId: 'aio-metadata', type,
  catalogId: `flixpatrol.${service}.${country}.${type}`
});

for (const country of ['HU', 'NL']) {
  for (const service of ['netflix', 'hbo-max', 'skyshowtime']) {
    for (const type of ['movie', 'series']) {
      test(`${service} ${type} regionalizes to ${country}`, () => {
        const original = addon(service, type);
        const result = regions.regionalize(original, country, availability);
        assert.equal(result.source.catalogId, `flixpatrol.${service}.${country.toLowerCase()}.${type}`);
        assert.equal(original.catalogId, `flixpatrol.${service}.us.${type}`);
        assert.equal(result.source.addonId, 'aio-metadata');
      });
    }
  }
}

test('unsupported country/service and section are omitted safely', () => {
  assert.equal(regions.regionalize(addon('skyshowtime'), 'US', availability).source, null);
  assert.equal(regions.regionalize(addon('hulu'), 'HU', availability).source, null);
  assert.equal(regions.regionalize(addon('skyshowtime', 'all'), 'HU', availability).source, null);
  assert.equal(regions.regionalize(addon('skyshowtime'), 'GB', availability).source, null);
});

test('global, locked, malformed and unrelated catalogs stay untouched', () => {
  for (const source of [addon('netflix', 'movie', 'world'), { ...addon('netflix'), countryLocked: true },
    { catalogId: 'mdblist.190242' }, { catalogId: 'flixpatrol.netflix.movie' }]) {
    assert.deepEqual(regions.regionalize(source, 'HU', availability).source, source);
  }
});

test('missing data and unknown region preserve original charts with an explicit hint', () => {
  assert.equal(regions.regionalize(addon('netflix'), 'ZZ', availability).status, 'unverified');
  assert.equal(regions.regionalize(addon('netflix'), 'HU', null).source.catalogId, 'flixpatrol.netflix.us.movie');
  assert.match(regions.chartHint({ sources: [addon('netflix')] }, 'ZZ', availability), /original US charts are kept/);
});

test('availability distinguishes variants and overall fallbacks', () => {
  const data = { regions: { hungary: { example: { movies: ['premium'], overall: [] } } } };
  assert.equal(regions.regionalize({ catalogId: 'flixpatrol.example.us.movie.premium' }, 'HU', data).source.catalogId,
    'flixpatrol.example.hu.movie.premium');
  assert.equal(regions.regionalize({ catalogId: 'flixpatrol.example.us.movie.absent' }, 'HU', data).source, null);
  assert.equal(regions.regionalize(addon('example', 'series'), 'HU', data).status, 'supported');
});

test('live and split catalogs have matching complete SkyShowtime sources', () => {
  const ctx = { window: {} };
  vm.runInNewContext(read('collections/database.js'), ctx);
  const streaming = ctx.window.NUVIO_DATABASE.find(c => c.title === 'Streaming Services');
  const sky = streaming.folders.find(f => f.title === 'SkyShowtime');
  const netflix = streaming.folders.find(f => f.title === 'Netflix');
  const split = JSON.parse(read('collections/streaming_services.json'))[0].folders.find(f => f.title === 'SkyShowtime');
  assert.deepEqual(JSON.parse(JSON.stringify(sky.sources)), split.sources);
  assert.deepEqual(sky.sources.map(s => s.title), netflix.sources.map(s => s.title));
  assert.equal(sky.sources.length, 51);
  for (const s of sky.sources.slice(2)) {
    assert.equal(s.provider, 'tmdb');
    assert.equal(s.filters.with_watch_providers, '1773');
    assert.equal(s.filters.withWatchProviders, '1773');
  }
});

for (const country of ['HU', 'NL', 'US']) {
  test(`real native export applies ${country} and keeps database immutable`, () => {
    const ctx = appContext();
    ctx.window.kaptainCustomize = { country, locale: 'en' };
    const before = JSON.stringify(ctx.window.NUVIO_DATABASE);
    const exported = vm.runInContext('assembleFilteredDatabase()', ctx);
    const streaming = exported.find(c => c.title === 'Streaming Services');
    for (const service of ['Netflix', 'HBO Max', 'SkyShowtime']) {
      const folder = streaming.folders.find(f => f.title === service);
      for (const source of folder.sources.filter(s => s.tmdbSourceType === 'DISCOVER')) {
        assert.equal(source.filters.watch_region, country);
        assert.equal(source.filters.watchRegion, country);
      }
    }
    const sky = streaming.folders.find(f => f.title === 'SkyShowtime');
    const charts = sky.sources.filter(s => s.provider === 'addon');
    assert.equal(charts.length, country === 'US' ? 0 : 2);
    assert.deepEqual(sky.catalogSources.map(s => s.catalogId), charts.map(s => s.catalogId));
    if (country !== 'US') assert.equal(charts[0].catalogId, `flixpatrol.skyshowtime.${country.toLowerCase()}.movie`);
    assert.equal(JSON.stringify(ctx.window.NUVIO_DATABASE), before);
    // Existing country locks must still hold.
    const crave = streaming.folders.find(f => f.title === 'Crave');
    if (crave) assert.equal(crave.sources.find(s => s.tmdbSourceType === 'DISCOVER').filters.watch_region, 'CA');
  });
}

test('native regional chart provisioning includes selected catalogs and waits for install', async () => {
  const ctx = appContext();
  ctx.window.kaptainCustomize = { country: 'HU', locale: 'en' };
  const saves = [], installs = [];
  ctx.fetch = async (url, options) => {
    if (String(url).endsWith('api/config/save')) {
      saves.push(JSON.parse(options.body).config);
      return { ok: true, json: async () => ({ success: true, installUrl: 'https://example.test/stremio/test/manifest.json' }) };
    }
    return { ok: true };
  };
  ctx.window.NuvioPush = { installAddons: async (...args) => { installs.push(args); } };
  vm.runInContext(read('wizard.js').replace('  // Expose shared bits',
    '  window.__testRegions = { ensureRegionalChartAddon, state };\n  // Expose shared bits'), ctx);
  const collections = vm.runInContext('assembleFilteredDatabase()', ctx);
  await ctx.window.__testRegions.ensureRegionalChartAddon(collections, 3);
  assert.equal(saves.length, 1);
  const huServices = ['skyshowtime', 'netflix', 'apple-tv', 'amazon-prime', 'disney', 'hbo-max'];
  assert.deepEqual(saves[0].catalogs.map(c => c.id), huServices.flatMap(service =>
    ['movie', 'series'].map(type => `flixpatrol.${service}.hu.${type}`)));
  for (const catalog of saves[0].catalogs) {
    assert.equal(catalog.metadata.countrySlug, 'hungary');
    assert.equal(catalog.enableRatingPosters, true);
  }
  assert.equal(installs[0][1], 3);
  assert.equal(installs[0][2][0].name, 'AIO Metadata (Regional Top 10)');
  ctx.window.kaptainCustomize.country = 'US';
  await ctx.window.__testRegions.ensureRegionalChartAddon(vm.runInContext('assembleFilteredDatabase()', ctx), 3);
  assert.equal(saves.length, 2);
  assert.equal(ctx.window.__testRegions.state.regionalChartCatalogs.length, 25);
  assert.ok(!saves[1].catalogs.some(c => c.id.includes('.skyshowtime.')));
  assert.ok(!saves[1].catalogs.some(c => c.id.includes('.mubi.')));
});

test('friend collection export regionalizes and removes deselected catalog references', () => {
  const ctx = appContext('collections/database.kaoxt.js');
  ctx.window.kaptainCustomize = { country: 'HU', locale: 'en' };
  const exported = vm.runInContext('assembleFilteredDatabase()', ctx);
  const all = exported.flatMap(c => c.folders).flatMap(f => f.sources);
  assert.ok(all.some(s => s.catalogId === 'flixpatrol.netflix.hu.movie'));
  assert.ok(all.some(s => s.catalogId === 'flixpatrol.hbo-max.hu.series'));
  assert.ok(!all.some(s => s.catalogId?.startsWith('flixpatrol.hulu.')));
  vm.runInContext(`database.forEach(c => c.folders.forEach(f => f.sources.forEach(s => {
    if (s.catalogId === 'flixpatrol.netflix.us.movie') selectedMap[getFolderKey(f)][getSourceKey(s)] = false;
  })));`, ctx);
  const second = vm.runInContext('assembleFilteredDatabase()', ctx);
  assert.ok(!second.flatMap(c => c.folders).flatMap(f => f.catalogSources || []).some(s => s.catalogId === 'flixpatrol.netflix.hu.movie'));
});

test('AIO conversion uses chosen region and full SkyShowtime genre filters', () => {
  const ctx = appContext();
  const template = JSON.parse(read('Kaptain_Catalog_Template.json'));
  const streaming = ctx.window.NUVIO_DATABASE.find(c => c.title === 'Streaming Services');
  for (const country of ['HU', 'NL']) {
    ctx.window.kaptainCustomize = { country, locale: 'en' };
    const output = vm.runInContext('assembleFilteredDatabase()', ctx).find(c => c.title === 'Streaming Services');
    for (const name of ['Netflix', 'HBO Max', 'SkyShowtime']) {
      const folder = output.folders.find(f => f.title === name);
      for (const source of folder.sources) {
        const original = template.find(t => t.folderTitle === (name === 'SkyShowtime' ? 'Netflix' : name) && t.sourceTitle === source.title);
        const entry = regions.catalogEntry(original, source, 'Streaming Services', name);
        assert.ok(entry, source.title);
        if (source.tmdbSourceType === 'DISCOVER') {
          assert.equal(entry.metadata.discover.params.watch_region, country);
          if (name === 'SkyShowtime') {
            assert.equal(entry.metadata.discover.params.with_watch_providers, '1773');
            assert.ok(entry.id.startsWith('tmdb.discover.skyshowtime_'));
            assert.equal(entry.metadata.discover.params.with_genres, original.metadata.discover.params.with_genres);
          }
        } else if (source.provider === 'addon') assert.equal(entry.source, 'flixpatrol');
      }
    }
  }
  assert.equal(streaming.folders.find(f => f.title === 'Netflix').sources[2].filters.watch_region, 'US');
});

test('refresh validates before replacing snapshot', () => {
  assert.throws(() => serialize({ regions: {} }), /Unexpected availability format/);
  const serialized = serialize(availability);
  const ctx = { window: {} };
  vm.runInNewContext(serialized, ctx);
  assert.ok(ctx.window.KAPTAIN_FLIXPATROL_AVAILABILITY.regions.hungary.skyshowtime);
});

test('Hungarian Cinema retains HU origin and hu language through native and AIO export', () => {
  const ctx = appContext();
  ctx.window.kaptainCustomize = { country: 'US', locale: 'en', foreignNative: false };
  const output = vm.runInContext('assembleFilteredDatabase()', ctx);
  const folder = output.find(c => c.title === 'International Cinema').folders.find(f => f.title === 'Hungarian Cinema');
  const split = JSON.parse(read('collections/international_cinema.json'))[0].folders.find(f => f.title === folder.title);
  assert.equal(folder.sources.length, 6);
  assert.equal(split.sources.length, 6);
  const template = JSON.parse(read('Kaptain_Catalog_Template.json'));
  for (const source of folder.sources) {
    assert.equal(source.filters.withOriginCountry, 'HU');
    assert.equal(source.filters.withOriginalLanguage, 'hu');
    const entry = regions.catalogEntry(template.find(e => e.folderTitle === folder.title && e.sourceTitle === source.title),
      source, 'International Cinema', folder.title);
    assert.ok(entry);
    assert.equal(entry.metadata.discover.params.with_origin_country, 'HU');
    assert.equal(entry.metadata.discover.params.with_original_language, 'hu');
    assert.ok(!entry.metadata.discover.params.watch_region);
  }
});

for (const country of ['HU', 'NL', 'US']) {
  test(`actual Self-Host wizard exports consistent ${country} catalog routing`, async () => {
    const ctx = appContext();
    ctx.window.kaptainCustomize = { country, locale: 'en' };
    ctx.fetch = async () => ({ ok: true, json: async () => JSON.parse(read('Kaptain_Catalog_Template.json')) });
    vm.runInContext(`database = database.filter(c => ['Streaming Services', 'International Cinema'].includes(c.title));
      database = database.map(c => ({ ...c, folders: c.folders.filter(f => ['Netflix', 'HBO Max', 'SkyShowtime', 'Hungarian Cinema'].includes(f.title)) }));`, ctx);
    vm.runInContext(read('wizard.js'), ctx);
    const output = await ctx.window.NuvioWizard.generateSelfHostExport();
    const aio = JSON.parse(output.aioConfig);
    const collection = JSON.parse(output.nuvioCollection);
    for (const folder of collection.flatMap(c => c.folders)) {
      for (const source of folder.sources) {
        assert.equal(source.provider, 'addon');
        assert.ok(aio.catalogs.some(c => c.id === source.catalogId && c.type === source.type), `${folder.title}/${source.title}`);
      }
      assert.equal(folder.catalogSources.length, folder.sources.length);
    }
    const charts = aio.catalogs.filter(c => c.source === 'flixpatrol');
    assert.equal(charts.length, country === 'US' ? 4 : 6);
    for (const chart of charts) {
      assert.ok(chart.id.includes(`.${country.toLowerCase()}.`));
      assert.equal(chart.metadata.countrySlug, regions.REGION_SLUGS[country]);
      assert.equal(chart.enableRatingPosters, true);
    }
    for (const entry of aio.catalogs.filter(c => c.id.startsWith('tmdb.discover.skyshowtime_'))) {
      assert.equal(entry.metadata.discover.params.watch_region, country);
      assert.equal(entry.metadata.discover.params.with_watch_providers, '1773');
    }
  });
}
