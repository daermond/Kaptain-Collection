/* Regional catalog helpers shared by native export, AIO setup, and validation. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KaptainRegions = api;
})(typeof window === 'object' ? window : globalThis, function() {
  const FLIX_ID = /^flixpatrol\.([a-z0-9-]+)\.([a-z]{2}|world)\.(movie|series|all)(?:\.([a-z0-9-]+))?$/;
  const REGION_SLUGS = {
    US: 'united-states', GB: 'united-kingdom', CA: 'canada', AU: 'australia',
    NZ: 'new-zealand', IE: 'ireland', DE: 'germany', FR: 'france', ES: 'spain',
    MX: 'mexico', IT: 'italy', NL: 'netherlands', SE: 'sweden', NO: 'norway',
    DK: 'denmark', FI: 'finland', PL: 'poland', HU: 'hungary', PT: 'portugal',
    BR: 'brazil', TR: 'turkey', IN: 'india'
  };

  function parseFlixPatrol(id) {
    const match = FLIX_ID.exec(String(id || ''));
    return match ? { service: match[1], country: match[2], type: match[3], variant: match[4] } : null;
  }

  function chartName(id) {
    const parsed = parseFlixPatrol(id);
    return parsed ? (parsed.type === 'movie' ? 'Top 10 Movies' : parsed.type === 'series' ? 'Top 10 Series' : 'Top 10') : null;
  }

  function regionalize(source, country, availability) {
    const parsed = parseFlixPatrol(source.catalogId);
    const selected = String(country || '').toUpperCase();
    if (!parsed || !/^[A-Z]{2}$/.test(selected) || parsed.country === 'world' || source.countryLocked) {
      return { source: { ...source }, status: 'unchanged' };
    }
    const region = availability?.regions?.[REGION_SLUGS[selected]];
    // Unknown countries / unavailable index: preserve the original rather than guess.
    if (!region) return { source: { ...source }, status: 'unverified', originalCountry: parsed.country };
    const sections = region[parsed.service];
    const category = parsed.type === 'movie' ? 'movies' : parsed.type === 'series' ? 'series' : 'overall';
    // AIOMetadata also falls back from movie/series to an overall chart.
    const supported = sections && (parsed.variant
      ? (sections[category] || []).includes(parsed.variant)
      : Object.hasOwn(sections, category) || (parsed.type !== 'all' && Object.hasOwn(sections, 'overall')));
    if (!supported) return { source: null, status: 'unsupported' };
    const catalogId = `flixpatrol.${parsed.service}.${selected.toLowerCase()}.${parsed.type}`
      + (parsed.variant ? `.${parsed.variant}` : '');
    return { source: { ...source, catalogId }, status: 'supported' };
  }

  function chartCatalog(source) {
    const parsed = parseFlixPatrol(source.catalogId);
    if (!parsed) return null;
    // Match AIOMetadata's native creator; older hosts cannot resolve ISO codes.
    const countrySlug = parsed.country === 'world' ? 'world' : REGION_SLUGS[parsed.country.toUpperCase()];
    const metadata = { ...source.metadata };
    if (countrySlug) metadata.countrySlug = countrySlug;
    return {
      id: source.catalogId, type: parsed.type,
      name: source.title || source.name || chartName(source.catalogId), source: 'flixpatrol',
      enabled: true, showInHome: false, displayType: source.displayType || (parsed.type === 'all' ? 'movie' : parsed.type),
      genreSelection: 'standard', sort: 'default', order: 'asc', cacheTTL: 86400,
      enableRatingPosters: true, metadata
    };
  }

  function chartCatalogs(collections) {
    const byId = new Map();
    (collections || []).forEach(c => (c.folders || []).forEach(f => (f.sources || []).forEach(s => {
      if (s.provider !== 'addon' || s.addonId !== 'aio-metadata') return;
      const entry = chartCatalog(s);
      if (entry) byId.set(entry.id, entry);
    })));
    return [...byId.values()];
  }

  // The published AIO template has US storefronts. Copy the selected source's
  // storefront into the per-export template, never into the shared database.
  function catalogEntry(template, source, collectionTitle, folderTitle) {
    const chart = chartCatalog(source);
    if (chart && source.addonId === 'aio-metadata') return { ...chart, collectionTitle, folderTitle, sourceTitle: source.title };
    let entry = template ? JSON.parse(JSON.stringify(template)) : null;
    if (entry && folderTitle === 'SkyShowtime' && source.tmdbSourceType === 'DISCOVER') {
      entry.id = 'tmdb.discover.skyshowtime_' + source.title.toLowerCase().replace(/\s+/g, '_');
      entry.folderTitle = folderTitle;
      entry.sourceTitle = source.title;
      delete entry.instId;
      const params = entry.metadata?.discover?.params;
      if (params) {
        params.with_watch_providers = source.filters.with_watch_providers;
        params[entry.type === 'series' ? 'first_air_date.lte' : 'primary_release_date.lte'] = new Date().toISOString().slice(0, 10);
        if (!source.filters.withOriginalLanguage && !source.filters.with_original_language) delete params.with_original_language;
      }
    }
    if (!entry && folderTitle === 'SkyShowtime' && source.tmdbSourceType === 'DISCOVER') {
      const type = source.mediaType === 'TV' ? 'series' : 'movie';
      const mediaType = type === 'series' ? 'tv' : 'movie';
      entry = {
        id: 'tmdb.discover.skyshowtime_' + source.title.toLowerCase().replace(/\s+/g, '_'),
        type, name: source.title, source: 'tmdb', collectionTitle, folderTitle, sourceTitle: source.title,
        metadata: { itemCount: 200, mediatype: type, discover: {
          version: 2, source: 'tmdb', mediaType, params: {
            include_adult: false, sort_by: source.sortBy,
            with_watch_providers: source.filters.with_watch_providers,
            // Avoid upcoming titles in New lists; evaluated at export time.
            [type === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte']: new Date().toISOString().slice(0, 10)
          }
        } }
      };
    }
    const params = entry?.metadata?.discover?.params;
    const region = source.filters?.watch_region || source.filters?.watchRegion;
    if (params && region && source.tmdbSourceType === 'DISCOVER') params.watch_region = region;
    if (params && source.filters?.withOriginalLanguage) params.with_original_language = source.filters.withOriginalLanguage;
    return entry;
  }

  function chartHint(folder, country, availability) {
    const results = (folder.sources || []).filter(s => parseFlixPatrol(s.catalogId))
      .map(s => regionalize(s, country, availability));
    if (results.some(r => r.status === 'unsupported')) {
      return `Some Top 10 charts are unavailable for ${country} and will be left out. Other selected lists stay included.`;
    }
    const unknown = results.find(r => r.status === 'unverified');
    if (unknown) return `Chart availability could not be verified for ${country}; original ${unknown.originalCountry.toUpperCase()} charts are kept.`;
    return results.length ? `Top 10 charts use ${country}. Requires AIO Metadata; Guided Setup installs it.` : '';
  }

  return { REGION_SLUGS, parseFlixPatrol, chartName, regionalize, chartCatalog, chartCatalogs, catalogEntry, chartHint };
});
