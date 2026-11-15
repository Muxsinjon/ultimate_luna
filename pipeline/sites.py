"""Curated landing sites. lat/lon in degrees (east-positive longitude, -180..180).

`verify=True` marks values we could not yet cross-check against a primary
source (LROC Quickmap / mission paper) during the hackathon; the UI shows a
small badge for them.
"""

SITES = [
    # --- South pole: Artemis III candidate-region sites --------------------------------
    dict(id="connecting-ridge", name="Connecting Ridge (Shackleton–de Gerlache)", group="Artemis III candidate",
         lat=-89.53432, lon=-150.05233,
         source="Artemis III landing-site workshop 2023, abstract #2036 (USRA/LPI): 89.53432 S, 209.94767 E"),
    dict(id="peak-near-shackleton", name="Peak near Shackleton", group="Artemis III candidate",
         lat=-89.01701, lon=126.27302,
         source="Artemis III landing-site workshop 2023, abstract #2036 (USRA/LPI)"),
    dict(id="nobile-rim-2", name="Nobile Rim 2 (optimal point)", group="Artemis III candidate",
         lat=-84.20156, lon=60.69989,
         source="Acta Astronautica 226 (2025) 469, multi-criteria Artemis III site study (arXiv:2406.19863)"),
    dict(id="mons-mouton", name="Mons Mouton (summit plateau)", group="Artemis III candidate",
         lat=-84.6, lon=31.0, source="IAU feature centre, via Wikipedia 'Mons Mouton'"),
    dict(id="shackleton-floor", name="Shackleton crater floor (permanent shadow)", group="South pole feature",
         lat=-89.67, lon=129.78, source="IAU feature centre (Gazetteer of Planetary Nomenclature)", verify=True),
    # --- Milestone 3 processed 5 m terrain sites: centre pixel of each NASA PGDA product 78 DEM (no landing point claimed)
    dict(id="shackleton-rim-site04", name="Shackleton Rim (PGDA Site04 DEM centre)", group="Artemis III candidate",
         lat=-89.76674, lon=-171.89281,
         source="NASA GSFC PGDA product 78 (Barker et al. 2021), Site04 5 m DEM centre pixel: 89.76674 S, 188.10719 E"),
    dict(id="nobile-rim-1-site06", name="Nobile Rim 1 (PGDA Site06 DEM centre)", group="Artemis III candidate",
         lat=-85.43812, lon=37.36812,
         source="NASA GSFC PGDA product 78 (Barker et al. 2021), Site06 5 m DEM centre pixel: 85.43812 S, 37.36812 E"),
    # --- CLPS / commercial ---------------------------------------------------------------
    dict(id="im-2", name="IM-2 Athena (Intuitive Machines)", group="CLPS / commercial",
         lat=-84.7906, lon=29.1958, source="Wikipedia 'IM-2': 84°47′26″S 29°11′45″E"),
    dict(id="im-1", name="IM-1 Odysseus, Malapert A", group="CLPS / commercial",
         lat=-80.13, lon=1.44, source="LROC (LRO imaged lander): 80.13 S, 1.44 E, 2579 m"),
    dict(id="blue-ghost-1", name="Blue Ghost Mission 1, Mare Crisium", group="CLPS / commercial",
         lat=18.5623, lon=61.8103, source="LRO image of lander (Firefly / LROC): 18.5623 N, 61.8103 E"),
    # --- Other nations -------------------------------------------------------------------
    dict(id="chandrayaan-3", name="Chandrayaan-3 Vikram (Shiv Shakti Point)", group="Other nations",
         lat=-69.373, lon=32.319, source="ISRO: 69.373 S, 32.319 E, near Manzinus C"),
    dict(id="slim", name="SLIM (JAXA), near Shioli crater", group="Other nations",
         lat=-13.316, lon=25.251, source="JAXA SLIM landing position (approx.)", verify=True),
    dict(id="change-4", name="Chang'e 4, Von Kármán crater (far side)", group="Other nations",
         lat=-45.4446, lon=177.5991, source="Published Chang'e-4 landing position (LROC)", verify=True),
    # --- Apollo (NASA/LROC coordinates) -------------------------------------------------
    dict(id="apollo-11", name="Apollo 11, Tranquility Base", group="Apollo",
         lat=0.67409, lon=23.47298, source="LROC / NASA Apollo landing coordinates"),
    dict(id="apollo-12", name="Apollo 12, Oceanus Procellarum", group="Apollo",
         lat=-3.01239, lon=-23.42157, source="LROC / NASA Apollo landing coordinates"),
    dict(id="apollo-14", name="Apollo 14, Fra Mauro", group="Apollo",
         lat=-3.64530, lon=-17.47136, source="LROC / NASA Apollo landing coordinates"),
    dict(id="apollo-15", name="Apollo 15, Hadley–Apennine", group="Apollo",
         lat=26.13222, lon=3.63386, source="LROC / NASA Apollo landing coordinates"),
    dict(id="apollo-16", name="Apollo 16, Descartes Highlands", group="Apollo",
         lat=-8.97301, lon=15.50019, source="LROC / NASA Apollo landing coordinates"),
    dict(id="apollo-17", name="Apollo 17, Taurus–Littrow", group="Apollo",
         lat=20.19080, lon=30.77168, source="LROC / NASA Apollo landing coordinates"),
]
