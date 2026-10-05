# Kaptain Collection personal fork

This personal fork adds Hungary to Guided Customize, regional FlixPatrol
charts, SkyShowtime, and Hungarian Cinema to the existing static editor.

Preview: https://daermond.github.io/Kaptain-Collection/

## Provider Top 10 lists (2026-10-05)

The 18 Streaming Services folders that had Top 10 lists now use FlixPatrol
through AIO Metadata, replacing their TMDB/Trakt Top 10 sources. Native, friend,
Self-Host and AIO Streams setups use consistent catalog/source names:

- **Top 10 Movies** and **Top 10 Series** for services with separate charts.
- One **Top 10** for combined charts (AMC+, Crunchyroll, Discovery+, MGM+, Mubi,
  Shudder and Tubi TV), avoiding duplicate movie/series rows for the same chart.
- **Top 10 Movies** only for Pluto TV, which has no separate series chart.

For Hungary, Netflix, Apple TV+, Prime Video, Disney+, HBO Max and SkyShowtime
have both movie and series charts. Unsupported regional charts are omitted;
the provider's New, Popular, Top Rated and genre lists remain. Providers without
existing Top 10 rows are left unchanged. Country selection follows the existing
availability rules. With no country selected, the baseline is US except
SkyShowtime (HU) and Mubi (GB), whose US charts do not exist.

Friend catalog setup now carries each selected chart's readable title through
both matching templates and newly synthesized regional catalogs. A bare catalog
ID is no longer used as the default FlixPatrol display name. Source names,
catalog names and exported catalog references agree, including after media-type
regionalization. Re-run Guided Setup or regenerate/apply the export to update
an existing Nuvio profile and its AIO catalogs.

Validation: 44 offline tests passed. Separate live crawler checks on 2026-10-05
passed for HU/NL (66 generated descriptors per region), US (129 descriptors)
and GB (87 descriptors, including Mubi).
These checks verify names, country metadata, chart lookup and usable TMDB IDs;
Nuvio device rendering and metadata hydration remain separate checks.

## FlixPatrol runtime compatibility fix (2026-10-04)

Regional IDs alone are insufficient on AIOMetadata deployments that cannot
translate ISO country codes. The regional chart builder emitted `metadata: {}`,
and synthesized friend-pack catalogs omitted country metadata entirely. Those
deployments can request `hu.json` instead of `hungary.json`, yielding empty/error
catalog responses and disappearing rows in Nuvio despite healthy crawler data.
This is a confirmed configuration defect; the reported device symptom has not
been reproduced with a personal Nuvio account.

All FlixPatrol descriptors now use the shared `KaptainRegions.chartCatalog()`
builder and the existing `REGION_SLUGS` mapping. For example,
`flixpatrol.netflix.hu.movie` carries `metadata.countrySlug: "hungary"`, while
NL carries `"netherlands"`. Global IDs keep `"world"` (AIOMetadata selects
`global.json`). Movie/series/all types, display types and rating-poster support
follow the native catalog format; collection placement still uses `showInHome:
false`. Existing friend templates are normalized too, preserving their names,
display preferences and unrelated metadata. Native regional provisioning,
the later shared For You instance, friend setup, Self-Host and AIO Streams
receive the same country metadata. Unsupported/global/country-locked handling
and Hungary/SkyShowtime/Hungarian Cinema selection behavior stay intact.

**Existing installs need a regenerated AIO configuration.** Reload the preview
and rerun Guided Setup for the desired profile, or regenerate and apply the
Self-Host/AIO export. Refreshing the editor does not update an already saved
remote AIO configuration.

The native creator and handler were checked at AIOMetadata commit
[`e1c9cc6`](https://github.com/cedya77/aiometadata/tree/e1c9cc6a0934e3cef5221d0cbfe1ad75af200332):
[`catalogUtils.ts`](https://github.com/cedya77/aiometadata/blob/e1c9cc6a0934e3cef5221d0cbfe1ad75af200332/configure/src/utils/catalogUtils.ts),
[`getCatalog.ts`](https://github.com/cedya77/aiometadata/blob/e1c9cc6a0934e3cef5221d0cbfe1ad75af200332/addon/lib/getCatalog.ts),
and [`flixpatrolUtils.ts`](https://github.com/cedya77/aiometadata/blob/e1c9cc6a0934e3cef5221d0cbfe1ad75af200332/addon/utils/flixpatrolUtils.ts).

### Hosted checks and limits

On 2026-10-04 both [ElfHosted](https://aiometadata.elfhosted.com/manifest.json)
and [Midnight](https://aiometadatafortheweebs.midnightignite.me/manifest.json)
reported version **3.4.1**; `/health` was healthy. `/api/version` returned 404,
and no commit identifier was exposed in the tested public responses.
Their read-only `POST /api/flixpatrol/probe` returned `hasMovies: true` and
`hasShows: true` for `countrySlug: "hungary"` with Netflix, HBO Max, Disney,
Prime Video and SkyShowtime. Both also accepted `countrySlug: "hu"` for Netflix.

There was no observed host capability difference in these probes. Host racing,
user host choices, catalog ceilings and host-specific Trakt authentication
therefore remain unchanged. Canonical metadata removes reliance on fallback
without adding per-setup probes or assuming a version proves compatibility.
The probes confirm chart sections, not TMDB hydration, configured catalog
responses or Nuvio device rendering. If rows still disappear after regenerating
the configuration, the configured catalog response and Nuvio behavior need a
separate reproduction; public probes cannot establish the original cause.

| Finding | Class | Evidence | Conflict or limitation | Confidence |
| --- | --- | --- | --- | --- |
| Generated catalogs omitted the native country slug | Fact | Builders and upstream creator linked above | Fixed across construction paths | high |
| HU/NL descriptors resolve to charts with TMDB IDs | Fact | Offline fixture tests and optional live validator | Does not hydrate metadata or render Nuvio | high |
| Missing slugs caused the reported disappearing rows | Inference | Handler uses metadata before the ID country | Both tested hosts currently accept ISO fallback; no device reproduction | medium |

Confidence is high in the configuration fix and medium in attributing the
original symptom to it. The material counter-evidence is the hosts' current
ISO support. What remains unknown is whether this resolves the affected Nuvio
profile: no account/device reproduction was available, so a further cause may
remain. Regenerating its config and inspecting the affected configured catalog
response plus the Nuvio row would resolve that question.

## Try it

1. Open **Guided Customize** and choose **Hungary** in Your Region.
2. Keep SkyShowtime selected in Streaming Services. It follows Netflix's full
   51-source layout: Top 10 Movies/Series, New, Popular, Top Rated, and genre lists.
3. Keep International Cinema selected to include **Hungarian Cinema**. It has
   Popular, Top Rated, Recent, and two movie genre groups, plus a series list.
4. Finish customization and use Save File, Self-Host, or Guided Setup.

SkyShowtime discovery rows use TMDB provider **1773** and the selected
`watch_region` / `watchRegion` (for example `HU`). Top 10 rows use
`flixpatrol.skyshowtime.hu.movie` and `.series` for Hungary. The other provider
Top 10 lists also use FlixPatrol. Existing FlixPatrol addon sources,
including the Kaoxt friend pack, use the same generic regionalization rules.

Hungarian Cinema uses `withOriginCountry=HU` and `withOriginalLanguage=hu`,
including when foreign-language content is turned off. Selecting a different
streaming region does not change the country of a country-cinema folder.

## Availability and routing

`catalog-regions.js` parses service, country, media type, and optional chart variant.
The bundled `collections/flixpatrol-availability.js` contains the crawler's
service/country/section index. This makes static Pages and offline exports work
without a live probe or API key. The streaming selection step explains chart handling.

- Supported combinations use the selected country in lowercase.
- Unsupported charts are omitted; other selected sources remain. For example,
  SkyShowtime US omits Top 10 and keeps its TMDB sources with `watch_region=US`.
  A country where SkyShowtime isn't sold can legitimately have empty TMDB results.
- Global (`world`) catalogs, explicitly `countryLocked` sources, and unrelated
  addon IDs stay unchanged. Existing Crave/Hayu TMDB country locks are preserved.
- If the index or country mapping is missing, the original chart is preserved
  and the wizard explains that its region could not be verified.
- AIO conversion uses the exported source's region, so a static US catalog
  template cannot override a user's HU choice. SkyShowtime reuses Netflix's
  matching discovery templates with its own IDs/provider/region and current
  upper release-date cutoff. Genre filters remain intact.
- Native/collection-only Send provisions regional charts before pushing their
  references. A later native For You setup includes those charts in the shared
  instance and removes the temporary regional instance. Friend packs retain
  their existing provisioning path. Self-Host and AIO Streams include FlixPatrol
  as proper catalog descriptors rather than treating them as Trakt recommendations.

Save File exports collection definitions only. To import those directly into
Nuvio, a configured AIO Metadata addon must supply the chart catalogs; use the
editor's Guided Setup or Self-Host export to create that configuration.
External community AIO hosts and Nuvio account/device behavior remain separate
from editor validation. No personal Nuvio account was used for testing.

Snapshot source: [fp-crawler availability](https://github.com/0xConstant1/fp-crawler/blob/main/catalogs/availability.json).
Its generation time is recorded in the bundled file. Availability can change;
refresh it manually with `npm run refresh:charts`, review the change, then run tests.
The refresh script validates the schema before replacing the last good snapshot.
Chart existence does not guarantee a particular AIO host is up or has current data.

TMDB provider verification and parser compatibility were checked against
[AIOMetadata's provider definitions](https://github.com/cedya77/aiometadata/blob/main/addon/static/catalog-types.json)
and [FlixPatrol implementation](https://github.com/cedya77/aiometadata/blob/main/addon/utils/flixpatrolUtils.ts).
SkyShowtime artwork uses the same
[Prism artwork repository](https://github.com/bramst0ne/prism-wallpapers/tree/main/collections/networks/5944-skyshowtime)
already used by the editor; Hungarian Cinema uses the supplied Hungary-outline
artwork, bundled at `assets/hungarian-cinema.png` and served by this fork's Pages
preview. Its absolute URL also works in exported Nuvio collections.

## Local preview and validation

Requires Node.js 20+ and Python 3 for the optional local server. Tests have no
third-party dependency or secret requirement.

```sh
npm test
npm run validate:flixpatrol
npm run validate:flixpatrol -- --region NL
npm run validate:flixpatrol -- --region US
python -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080/. Tests cover Netflix, HBO Max, SkyShowtime, HU/NL/US,
unsupported sections, variants/global/locked sources, friend-pack regionalization,
selection/reference consistency, immutable native export, real Self-Host wizard
output, SkyShowtime genre filters, and Hungarian country/language preservation.

Unit tests additionally resolve actual native/friend/Self-Host outputs and the
AIO Streams descriptor converter against a pinned Hungary crawler fixture,
with ISO fallback deliberately absent. An actual AIO Streams build is exercised
with mocked saves/installs to check both movie and series routing. Missing or
stale slugs, empty charts, unresolved TMDB entries and missing variants fail
validation. The fixture contains only chart IDs/ranks/TMDB data and records its
source commit and scrape time; unit tests never call public hosts.

`validate:flixpatrol` is a separate optional live check. It generates descriptors
through the real wizard paths, fetches each required crawler region file once,
and fails on mismatched country metadata or a chart without usable TMDB IDs.
It does not create hosted configs or access Nuvio accounts. To run offline:

```sh
npm run validate:flixpatrol -- --fixture tests/fixtures/flixpatrol-hungary.json
```

The live HU and NL checks passed on 2026-10-04 (36 descriptors per region).
Every HU chart had 10 usable entries. NL HBO Max/Disney series each had 9 usable
TMDB entries; the remaining checked NL charts had 10.

The static editor works on GitHub Pages. The optional Python YouTube/GIF helper
is not hosted there; it still requires the supplied local server.

## Personal maintenance and GitHub Pages

Personal changes live on **personal-flixpatrol**. GitHub Pages is configured to
deploy its root directory, so updates do not require merging into `main`.
In Settings → Pages choose **Deploy from a branch**, **personal-flixpatrol**, **/ (root)**.
No custom domain or paid hosting is needed. Commits to that branch update the preview.

To publish further personal changes:

```sh
git switch personal-flixpatrol
npm test
git push origin personal-flixpatrol
```

There is no upstream PR for the personal branch. The earlier `hu-skyshowtime`
branch was already attached to an upstream draft PR; it is left unchanged so
personal changes do not appear there. Keep the fork to keep the preview and
its bundled artwork available. Future upstream updates can be reviewed and
merged into the personal branch when wanted; they are not synced automatically.

## License status

Upstream had no explicit project license at inspection. This fork does not add
one or claim rights over upstream code or external artwork. GitHub permits
viewing and forking public repositories, but absence of a license does not grant
general reuse or redistribution rights. This is a personal development/testing
fork. Further redistribution should consider licensing with
the upstream author. See [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
