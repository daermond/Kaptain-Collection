# Kaptain Collection regional catalog preview

This development fork adds Hungary to Guided Customize, regional FlixPatrol
charts, SkyShowtime, and Hungarian Cinema to the existing static editor.

Preview: https://daermond.github.io/Kaptain-Collection/

## Try it

1. Open **Guided Customize** and choose **Hungary** in Your Region.
2. Keep SkyShowtime selected in Streaming Services. It follows Netflix's full
   51-source layout: Top 10 Movies/Series, New, Popular, Top Rated, and genre lists.
3. Keep International Cinema selected to include **Hungarian Cinema**. It has
   Popular, Top Rated, Recent, and two movie genre groups, plus a series list.
4. Finish customization and use Save File, Self-Host, or Guided Setup.

SkyShowtime discovery rows use TMDB provider **1773** and the selected
`watch_region` / `watchRegion` (for example `HU`). Top 10 rows use
`flixpatrol.skyshowtime.hu.movie` and `.series` for Hungary. Netflix and HBO Max's
existing TMDB/Trakt Top 10 lists are preserved. Existing FlixPatrol addon sources,
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
already used by the editor; Hungarian Cinema uses a Hungarian flag from FlagCDN.

## Local preview and validation

Requires Node.js 20+ and Python 3 for the optional local server. Tests have no
third-party dependency or secret requirement.

```sh
npm test
python -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080/. Tests cover Netflix, HBO Max, SkyShowtime, HU/NL/US,
unsupported sections, variants/global/locked sources, friend-pack regionalization,
selection/reference consistency, immutable native export, real Self-Host wizard
output, SkyShowtime genre filters, and Hungarian country/language preservation.

The static editor works on GitHub Pages. The optional Python YouTube/GIF helper
is not hosted there; it still requires the supplied local server.

## GitHub Pages and upstream sync

The fork's `main` is kept at upstream. GitHub Pages is configured to deploy the
root directory of `hu-skyshowtime`, so testing does not require merging it into
`main`. In Settings → Pages choose **Deploy from a branch**, **hu-skyshowtime**, **/ (root)**.
No custom domain or paid hosting is needed. Commits to that branch update the preview.

To refresh the upstream baseline without merging feature changes into `main`:

```sh
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch hu-skyshowtime
git merge upstream/main
npm test
git push origin hu-skyshowtime
```

The feature PR can target this fork's `main` for review, and the same branch can
be proposed to `ImKaptain/Kaptain-Collection:main`. Keep the fork while its Pages
preview and upstream PR are needed. Once upstream accepts the change and its
site is verified, the personal fork can be deleted; doing so also removes this preview.

## License status

Upstream had no explicit project license at inspection. This fork does not add
one or claim rights over upstream code or external artwork. GitHub permits
viewing and forking public repositories, but absence of a license does not grant
general reuse or redistribution rights. This is a development/testing fork and
proposed contribution. Further redistribution should consider licensing with
the upstream author. See [GitHub's licensing guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
