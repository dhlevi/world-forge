/**
 * Tunable constants for world generation. Distances are in km, heights in m,
 * temperatures in °C and precipitation in mm/yr, so every value is
 * independent of grid resolution.
 */
export const TECTONICS = {
  plateWarp: 0.22,
  plateWarpFreq: 2.5,
  minSpeed: 0.3,
  maxSpeed: 1.0,
  /** Share of plate area seeded as continental, relative to the land fraction. */
  continentalPlateShare: 1.15,
  plateBiasWeight: 0.5,
  crustNoiseWeight: 0.6,
  crustNoiseFreq: 1.4,
  crustBlurKm: 350,
  crustDetailWeight: 0.12,
  crustDetailFreq: 4,

  landBase: 120,
  landPlateau: 650,
  shelfDepth: 160,
  shelfWidth: 0.04,
  abyssDepth: 4200,
  slopeWidth: 0.2,

  maxInfluenceKm: 1100,
  stressScale: 1.6,
  mountainHeight: 5000,
  /** Width of the main ridge; foothills add a lower, wider shoulder. */
  mountainWidthKm: 130,
  foothillShare: 0.3,
  foothillWidthFactor: 3,
  /** Ocean–continent ranges peak this far inland of the plate boundary. */
  subductionRangeOffsetKm: 90,
  /** Low-frequency noise breaks long boundary ranges into segments of varying height. */
  rangeSegmentFreq: 6.5,
  collisionBoost: 1.35,
  /** Heights above the soft cap are compressed so peaks stay in a plausible (~9 km) range. */
  peakSoftCapM: 6000,
  peakCompression: 0.4,
  trenchDepth: 3500,
  trenchWidthKm: 70,
  arcHeight: 6500,
  arcOffsetKm: 140,
  arcWidthKm: 60,
  /** Arcs are segmented into island groups where low-frequency noise exceeds the threshold. */
  arcSegmentFreq: 6,
  arcSegmentThreshold: -0.2,
  riftDepth: 900,
  riftWidthKm: 70,
  ridgeHeight: 1800,
  ridgeWidthKm: 250,

  mountainRidgeFreq: 40,
  /**
   * Worn-down interior ranges (Appalachian/Ural style) along the boundaries of an older, finer
   * plate pattern; only some of those boundaries survive as ranges.
   */
  sutureSeeds: 40,
  sutureActiveShare: 0.8,
  sutureHeight: 2600,
  sutureWidthKm: 120,
  sutureWarp: 0.06,
  sutureWarpFreq: 3,
  /** Enclosed seas larger than this (km²) become lowland basins. */
  inlandSeaMaxKm2: 25000,
  inlandBasinFloorM: 150,
  hillAmp: 300,
  hillFreq: 8,
  plateauAmp: 600,
  plateauFreq: 3,
};

export const CLIMATE = {
  equatorTempC: 27,
  poleTempC: -22,
  lapseRateCPerKm: 6.5,
  tempNoiseC: 2.5,

  /** e-folding distances for moisture uptake over sea and rain-out over land/sea. */
  evapLengthKm: 700,
  rainLengthLandKm: 2500,
  rainLengthSeaKm: 3500,
  /** Fraction of moisture above saturation that condenses per step (orographic lift). */
  condenseRate: 0.6,
  /** Fraction of land precipitation returned to the air by evapotranspiration. */
  recycle: 0.6,
  precipScale: 5.0e6,
  /** Clausius–Clapeyron-like growth of moisture capacity per °C (damped for annual means). */
  saturationPerC: 0.045,
  precipBlurKm: 150,

  /** Meridional wind strength relative to the zonal bands (equatorward trades, poleward westerlies). */
  meridionalWind: 0.35,
  /** Max rotation (rad) of the wind bands by low-frequency noise, so flow meanders. */
  windMeanderRad: 0.5,
  windMeanderFreq: 3,
  /** Terrain smoothing before wind deflection, and slope (m/km) at which deflection is full. */
  windTerrainBlurKm: 150,
  windDeflectSlopeMPerKm: 15,
  /** Fraction of the uphill wind component removed on steep terrain. */
  windDeflect: 0.8,
  landWindFactor: 0.85,
  /** Moisture advection step and total travel distance simulated. */
  advectStepKm: 80,
  advectDistanceKm: 5000,
  /** Moisture transport runs on a grid at most this wide; finer grids are downsampled. */
  advectMaxWidth: 1024,

  /** Ocean currents: share of wind speed driving zonal drift, boundary-current widths and strengths. */
  currentWindDrift: 0.6,
  westBoundaryKm: 400,
  eastBoundaryKm: 700,
  westBoundaryStrength: 1.2,
  eastBoundaryStrength: 0.7,
  /** Ocean width (km, east–west) below which gyres don't form, and at which they are full strength. */
  minBasinKm: 1500,
  fullBasinKm: 5000,
  currentScanKm: 6000,
  boundarySmoothKm: 250,
  /** Advection step for sea temperature and its inland spread (smooth fields tolerate long steps). */
  oceanStepKm: 150,
  /** Sea-surface temperature relaxes toward the latitude baseline over this distance of travel. */
  sstRelaxKm: 2500,
  sstTravelKm: 6000,
  /** Extra cooling (°C) of eastern-boundary waters from coastal upwelling. */
  upwellingC: 4,
  /** e-folding distance over which the wind carries a sea-temperature anomaly inland. */
  inlandAnomalyKm: 600,
  /** Rain suppression from stable air over cold water: factor exp(anomaly / this). */
  coldStabilityC: 4,
  currentStreamSpacingDeg: 7,
  currentStreamStepKm: 90,
  currentStreamSteps: 24,
  /** Wind overlay streamline seed spacing (degrees latitude), step and length. */
  streamlineSpacingDeg: 6,
  streamlineStepKm: 60,
  streamlineSteps: 20,

  /** Seasons: latitude shift of the wind bands toward the summer hemisphere. */
  seasonalBandShiftDeg: 3,
  /** Warmest/coldest-month half-amplitude (°C) at the pole over sea and deep inland, scaled by |sin lat|^exp. */
  oceanSeasonalAmpC: 5,
  landSeasonalAmpC: 24,
  seasonalAmpLatExponent: 1.2,
  /** e-folding distance (km) of sea influence carried inland by the wind. */
  continentalityKm: 900,
  /** Monsoon: onshore summer / offshore winter wind from the smoothed land-fraction gradient. */
  monsoonStrength: 0.15,
  monsoonScaleKm: 1500,
  monsoonLandBlurKm: 800,
  monsoonMaxLatDeg: 40,

  /** Rain multiplier = base + convergence * normalised wind convergence (±1 at ITCZ / subtropical highs). */
  rainFactorBase: 1.0,
  rainFactorConvergence: 0.8,
  rainFactorMin: 0.2,
  /** Convergence of the idealised trade winds at the equator (1/km), used to normalise. */
  convergenceRefPerKm: 3.3e-4,
  convergenceBlurKm: 500,
};

export const EROSION = {
  iterations: 6,
  /** Stream-power coefficient at erosion strength 1. */
  k: 0.04,
  /** Drainage-area exponent of the stream-power law. */
  m: 0.5,
  /** Fraction of each closed depression filled with sediment per iteration at strength 1. */
  deposit: 0.5,
};

export const HYDROLOGY = {
  /** Precipitation-weighted drainage area (km² at 1000 mm/yr) above which a cell is a river. */
  riverThresholdKm2: 25000,
  lakeMinDepthM: 15,
  /** Basins drier than this stay dry (evaporation outpaces inflow). */
  lakeMinPrecipMm: 350,
  /** Closed depressions shallower than this are filled flat (sediment) so lakes stay rare. */
  pitFillDepthM: 120,
  /** Monotonic remap that lifts lowlands / deepens shelves near sea level so coasts stay crisp. */
  coastStepLandM: 25,
  coastStepSeaM: 30,
  coastLiftM: 200,
  coastDropM: 100,
  coastScaleM: 80,
  riverJitter: 0.6,
  riverSmoothing: 2,
  /** Physical river width (m) at order 0, growing by this factor per discharge doubling. */
  riverWidthM: 12,
  riverWidthGrowth: 1.45,
};

export const KOPPEN = {
  /** Coldest-month threshold (°C) between temperate (C) and continental (D) climates. */
  temperateMinColdC: 0,
  /** Relative spread of monthly precipitation around each half-year mean (driest/wettest month). */
  monthlySpread: 0.3,
};

export const BIOMES = {
  /** Glaciers where it is this cold, summers stay cool and snowfall is heavy enough to accumulate. */
  glacierTempC: -6,
  glacierMaxWarmC: 6,
  glacierMinPrecipMm: 600,
  alpineMinElevationM: 1000,
  montaneMinElevationM: 1500,
  wetlandMaxSlopeMPerKm: 1.0,
  wetlandMaxElevationM: 600,
  wetlandMinPrecipMm: 400,
  /** Drainage area (km², precipitation-weighted) of a major river, and the half-width of its floodplain corridor. */
  floodplainMinAccKm2: 50000,
  floodplainHalfWidthKm: 35,
  mangroveMinTempC: 22,
  mangroveMinPrecipMm: 1200,
  mangroveMaxSlopeMPerKm: 4,
  /** Width (km) of the coastal band where mangroves can grow. */
  mangroveBandKm: 40,
  /** Sediment depth (m) filling an arid closed basin that makes it a salt flat (playa). */
  saltFlatMinFillM: 20,
};

export const SETTLEMENTS = {
  /** Minimum spacing (km) between cities, and between any two towns or cities, in the Old World. */
  citySpacingKm: 280,
  townSpacingKm: 65,
  /** New World: no cities, and towns (tribal towns, colonies) far apart. */
  newWorldTownSpacingKm: 190,
  /** New World villages: the share of village candidates kept (they are sparser). */
  newWorldVillageShare: 0.4,
  /** Habitability (0..~1.5) needed to found a city / town / village. */
  cityMinScore: 0.75,
  townMinScore: 0.4,
  villageMinScore: 0.3,
  /** Bonus multipliers on habitability for a river, sea coast or lakeshore site. */
  riverBonus: 0.25,
  coastBonus: 0.2,
  lakeBonus: 0.15,
  /** Longest road considered between cities / between towns (km). */
  cityLinkKm: 900,
  townLinkKm: 260,
  /** Road cost doubles at this slope (m/km); reusing an existing road costs this fraction. */
  roadSlopeRefMPerKm: 25,
  roadReuseFactor: 0.45,
  /** Extra cost (km-equivalent) for bridging a river. */
  roadBridgeKm: 12,
  /** Longest open-water crossing (sea or lake, m) a road may bridge at full detail; longer ones break the road. */
  roadMaxBridgeM: 750,
  roadJitter: 0.5,
  roadSmoothing: 2,
  /** Regional villages: candidate spacing and the longest track to a road, town or village (km). */
  villageSpacingKm: 13,
  villageLinkKm: 30,
  /** Walled-town density (people per hectare) and village density, which set plan sizes. */
  cityDensityPerHa: 200,
  villageDensityPerHa: 60,
};

export const RENDER = {
  /** Amplitude (m) of the first sub-grid detail octave on flat terrain. */
  detailAmpM: 160,
  /** Amplitude falloff exponent per octave wavelength inland; higher = smoother. */
  detailHurst: 0.9,
  /** Coastal detail uses a rougher falloff so shorelines stay fractal at every zoom. */
  coastAmpM: 60,
  coastHurst: 0.5,
  coastWidthM: 60,
  maxOctaves: 12,
  baseRough: 0.12,
  oceanRough: 0.15,
  mountainRoughPerKm: 0.8,
  maxRough: 3,
  /** Elevation range over which detail noise turns ridged. */
  ridgeStartM: 400,
  ridgeFullM: 2200,
  /** Domain warp (in grid cells) applied to biome lookups to hide the grid. */
  biomeWarpCells: 0.8,
  /** Hillshade vertical exaggeration = hillshadeScale * pixelKm ^ hillshadeExp. */
  hillshadeScale: 5,
  hillshadeExp: 0.2,
  sunAzimuthDeg: 315,
  sunAltitudeDeg: 40,
  snowStartC: -2,
  snowFullC: -8,
  /** Snow cover needs supply: none below the first value, full above the second (mm/yr). */
  snowMinPrecipMm: 100,
  snowFullPrecipMm: 400,
  rockStartM: 1800,
  rockFullM: 4000,
  seaIceC: -8,
};
