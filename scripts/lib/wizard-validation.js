// Run the real static editor/export code with a small DOM stub, without accounts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const regions = require('../../catalog-regions');
const availability = require('../../collections/flixpatrol-availability');
const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function appContext(file = 'collections/database.js') {
  const context = vm.createContext({
    window: { KaptainRegions: regions, KAPTAIN_FLIXPATROL_AVAILABILITY: availability },
    document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; },
      querySelector() { return null; }, documentElement: { getAttribute() { return null; }, removeAttribute() {} } },
    localStorage: { getItem() { return null; }, setItem() {} },
    console, setTimeout, clearTimeout, URL, Blob, AbortSignal
  });
  vm.runInContext(read(file), context);
  vm.runInContext(read('app.js'), context);
  vm.runInContext('database = window.NUVIO_DATABASE; initializeSelections();', context);
  return context;
}

function loadWizard(context) {
  vm.runInContext(read('wizard.js').replace('  // Expose shared bits',
    '  window.__validation = { synthesizeFriendCatalog, filterFriendCatalogs, collectSelectedAioCatalogIds, aioCatalogConfigEntry, ensureRegionalChartAddon, generateAIOStreamsBuild, state };\n  // Expose shared bits'), context);
  return context.window.__validation;
}

async function generatedChartPaths(country = 'HU') {
  const output = {};
  for (const [label, file] of [['native', 'collections/database.js'], ['friend', 'collections/database.kaoxt.js']]) {
    const ctx = appContext(file);
    ctx.window.kaptainCustomize = { country, locale: 'en' };
    ctx.fetch = async () => ({ ok: true, json: async () => JSON.parse(read('Kaptain_Catalog_Template.json')) });
    const wizard = loadWizard(ctx);
    const collections = vm.runInContext('assembleFilteredDatabase()', ctx);
    if (label === 'native') output.native = regions.chartCatalogs(collections);
    else {
      const { ids, typeById, nameById } = wizard.collectSelectedAioCatalogIds(collections);
      const templates = JSON.parse(read('collections/kaoxt-aio-catalogs.json'));
      output.friend = wizard.filterFriendCatalogs(Array.isArray(templates) ? templates : templates.catalogs, ids, typeById, nameById)
        .filter(c => regions.parseFlixPatrol(c.id));
    }
    const selfHost = await ctx.window.NuvioWizard.generateSelfHostExport();
    output[label + '-self-host'] = JSON.parse(selfHost.aioConfig).catalogs.filter(c => regions.parseFlixPatrol(c.id));
    // AIO Streams sends the same final converter's output to /api/config/save.
    output[label + '-aio-streams-descriptors'] = regions.chartCatalogs(collections).map(wizard.aioCatalogConfigEntry);
  }
  return output;
}

module.exports = { appContext, loadWizard, generatedChartPaths };
