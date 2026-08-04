"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

type GenericRow = Record<string, string | number | boolean | null>;

type Pollutant = {
  label: string;
  feature: string;
  unit: string;
  color: string;
  min: number;
  max: number;
  observedMax: number;
  median: number;
  mean: number;
};

type IndustrialSite = {
  id: number;
  name: string;
  lon: number;
  lat: number;
  altitude: number;
  fuel: string;
  so2Concentration: number | null;
  exitVelocity: number;
  stackDiameter: number;
  emissionRate: number;
  stackHeight: number | null;
  outletTemperature: number | null;
  source: string;
  category: string;
  equipment: string;
  sourceCount: number;
  emissions: Record<string, number | null>;
};

type HistorySlice = {
  key: string;
  label: string;
  values: Record<string, { median: number; mean: number; p90: number; count: number }>;
};

type MapView = { lon: number; lat: number; zoom: number };

type MapRoad = {
  name: string;
  class: string;
  trafficWeight: number;
  points: [number, number][];
};

type AppData = {
  meta: {
    periodStart: string;
    periodEnd: string;
    modelRows: number;
    sourceRows: number;
    targetPositivePct: number;
    predictionHorizonHours: number;
    pm25Threshold: number;
    originalFeatures: number;
    enrichedFeatures: number;
    trainingRows: number;
    trees: number;
    sourceBundles: { estatal: number; politecnica: number; trafico: number };
    metrics: Record<string, number>;
    baseMetrics: Record<string, number>;
    methodNote: string;
  };
  pollutants: Pollutant[];
  hourlyProfile: GenericRow[];
  recentSeries: GenericRow[];
  historical: Record<"annual" | "seasonal" | "monthly" | "weekly", HistorySlice[]>;
  geography: {
    center: [number, number];
    initialZoom: number;
    boundary: [number, number][];
    roads: MapRoad[];
    aermodPoints: { id: number; lon: number; lat: number; emissionRate: number }[];
  };
  industrial: {
    sites: IndustrialSite[];
    topStateLoads: GenericRow[];
    stateCoordinateSources: GenericRow[];
    equipment: GenericRow[];
    fuelConsumption: GenericRow[];
    aermod: { points: number; meanEmissionRate: number; maxEmissionRate: number };
  };
  monitoringPoints: GenericRow[];
  normative: GenericRow[];
  traffic: {
    modal: GenericRow[];
    fleet: GenericRow[];
    carbon: GenericRow[];
    od: GenericRow[];
    flow: GenericRow[];
    parking: GenericRow[];
    bus: GenericRow[];
    desireLines: GenericRow[];
    problems: GenericRow[];
    strategies: GenericRow[];
    indicators: GenericRow[];
  };
  topFeatures: { Feature: string; Importance: number }[];
};

type TreePayload = {
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  p: number[];
};

type ModelPayload = {
  featureNames: string[];
  mean: number[];
  scale: number[];
  trees: TreePayload[];
};

type Particle = {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  drift: number;
  source: number;
};

const CHEMISTRY = [
  {
    ingredients: ["NO₂", "Luz solar"],
    product: "O₃ troposférico",
    equation: "NO₂ + hν → NO + O  ·  O + O₂ → O₃",
    explanation:
      "La radiación rompe el NO₂; el oxígeno liberado reacciona con O₂ y forma ozono cerca del suelo.",
    detail:
      "Es un ciclo fotoquímico, no una conversión total e instantánea. La intensidad de la radiación acelera la fotólisis del NO₂ y el balance final depende también de NO, compuestos orgánicos volátiles y tiempo de residencia. En el mapa se interpreta como potencial de formación de O₃, no como una concentración calculada.",
    accent: "#f7cf65",
    mapPollutant: "O₃",
  },
  {
    ingredients: ["SO₂", "Humedad"],
    product: "Sulfatos secundarios",
    equation: "SO₂ + oxidantes + H₂O → aerosol de sulfato",
    explanation:
      "En aire húmedo, el SO₂ puede oxidarse y contribuir a partículas finas secundarias que permanecen suspendidas.",
    detail:
      "El SO₂ puede oxidarse en fase gaseosa o dentro de gotas y convertirse en sulfato. La humedad facilita la fase acuosa; la radiación y los oxidantes controlan la velocidad. El producto se representa como aerosol secundario probable y no como una reacción estequiométrica cerrada.",
    accent: "#d47af3",
    mapPollutant: "PM₂.₅",
  },
  {
    ingredients: ["PM₂.₅", "Humedad"],
    product: "Crecimiento higroscópico",
    equation: "PM₂.₅ + H₂O(g) → partícula hidratada",
    explanation:
      "Las partículas captan agua, crecen y reducen la visibilidad; el simulador aumenta su tamaño aparente.",
    detail:
      "Las sales higroscópicas dentro del PM atraen vapor de agua cuando aumenta la humedad relativa. El diámetro óptico crece, cambia la dispersión de la luz y puede aumentar la masa medida sin que aparezca una nueva fuente primaria. La magnitud depende de la composición del aerosol.",
    accent: "#ff8ca1",
    mapPollutant: "PM₂.₅",
  },
  {
    ingredients: ["CO", "Inversión térmica"],
    product: "Acumulación local",
    equation: "Emisión + capa estable → dispersión vertical limitada",
    explanation:
      "Una capa estable reduce la mezcla vertical. El CO y otros contaminantes quedan concentrados cerca de las fuentes.",
    detail:
      "La inversión térmica coloca aire más cálido sobre aire frío superficial y limita la convección. Con viento débil, las emisiones se diluyen menos y aumenta su permanencia cerca del suelo. Es un mecanismo de acumulación física, no una reacción química del CO.",
    accent: "#ef6f4e",
    mapPollutant: "CO",
  },
  {
    ingredients: ["NO₂", "O₃"],
    product: "Ciclo fotoquímico",
    equation: "NO + O₃ → NO₂ + O₂",
    explanation:
      "El ozono reacciona con NO y regenera NO₂. La radiación y los compuestos orgánicos controlan el balance del ciclo.",
    detail:
      "La titulación de O₃ por NO y la fotólisis posterior del NO₂ forman un ciclo rápido. Sin radicales derivados de compuestos orgánicos, el ciclo por sí solo no produce una acumulación neta sostenida de ozono. La lectura visual comunica el mecanismo y conserva esa limitación.",
    accent: "#9b8cff",
    mapPollutant: "NO₂",
  },
];

const INGREDIENTS = [
  { label: "NO₂", group: "gas" },
  { label: "O₃", group: "gas" },
  { label: "SO₂", group: "gas" },
  { label: "CO", group: "gas" },
  { label: "PM₁", group: "partícula" },
  { label: "PM₂.₅", group: "partícula" },
  { label: "PM₁₀", group: "partícula" },
  { label: "Humedad", group: "meteorología" },
  { label: "Precipitación", group: "meteorología" },
  { label: "Presión atmosférica", group: "meteorología" },
  { label: "Temperatura", group: "meteorología" },
  { label: "Radiación global", group: "meteorología" },
  { label: "Luz solar", group: "meteorología" },
  { label: "Inversión térmica", group: "estabilidad" },
];

const FEATURE_LABELS: Record<string, string> = {
  CONT_PM10: "PM₁₀ actual",
  CONT_PM1: "PM₁ actual",
  CONT_PM25: "PM₂.₅ actual",
  CONT_NO2: "NO₂ actual",
  CONT_OZONE: "O₃ actual",
  CONT_SO2: "SO₂ actual",
  CONT_CO: "CO actual",
};

function compactNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: digits,
  }).format(value);
}

function featureLabel(feature: string) {
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature];
  return feature
    .replace("CONT_", "")
    .replaceAll("_ROLLING_MEAN_", " · media ")
    .replaceAll("_LAG_", " · rezago ")
    .replaceAll("_", " ")
    .replace("PM25", "PM₂.₅")
    .replace("PM10", "PM₁₀")
    .replace("PM1", "PM₁")
    .toLowerCase();
}

function riskBand(probability: number) {
  if (probability >= 0.7)
    return { label: "Alerta alta", color: "#ff6b64", note: "Activa medidas preventivas y vigilancia reforzada." };
  if (probability >= 0.4)
    return { label: "Vigilancia", color: "#f7cf65", note: "El modelo supera el umbral operativo de alerta." };
  return { label: "Estable", color: "#64d5c2", note: "Sin señal fuerte de deterioro en este escenario." };
}

function predictForest(
  model: ModelPayload,
  inputs: Record<string, number>,
  hour: number,
) {
  const index = new Map(model.featureNames.map((name, i) => [name, i]));
  const raw = model.mean.slice();
  const set = (name: string, value: number) => {
    const i = index.get(name);
    if (i !== undefined && Number.isFinite(value)) raw[i] = value;
  };

  for (const [name, value] of Object.entries(inputs)) {
    set(name, value);
    if (name.startsWith("CONT_") || ["MET_TEMP", "MET_HUM", "MET_PRES"].includes(name)) {
      for (const lag of [1, 3, 6, 12, 24]) set(`${name}_LAG_${lag}h`, value);
      for (const window of [3, 6, 12, 24]) set(`${name}_ROLLING_MEAN_${window}h`, value);
      set(`${name}_DIFF_1h`, 0);
    }
  }

  set("HORA", hour);
  set("ES_HORA_PICO", hour >= 7 && hour <= 9 || hour >= 17 && hour <= 19 ? 1 : 0);
  set("ES_NOCTURNO", hour < 6 || hour >= 20 ? 1 : 0);
  set("HORA_SEN", Math.sin((2 * Math.PI * hour) / 24));
  set("HORA_COS", Math.cos((2 * Math.PI * hour) / 24));
  if (inputs.MET_TEMP !== undefined) {
    set("MET_TEMP_MAX", inputs.MET_TEMP + 1.1);
    set("MET_TEMP_MIN", inputs.MET_TEMP - 1.1);
    set("MET_TEMP_RANGO", 2.2);
  }
  if (inputs.MET_HUM !== undefined) {
    set("MET_HUM_MAX", Math.min(100, inputs.MET_HUM + 4));
    set("MET_HUM_MIN", Math.max(0, inputs.MET_HUM - 4));
    set("MET_HUM_RANGO", 8);
  }
  if (inputs.CONT_PM10 && inputs.CONT_PM25) {
    set("RAZON_PM10_PM25", inputs.CONT_PM10 / inputs.CONT_PM25);
  }
  if (inputs.CONT_PM1 && inputs.CONT_PM25) {
    set("RAZON_PM1_PM25", inputs.CONT_PM1 / inputs.CONT_PM25);
  }

  const scaled = raw.map((value, i) => (value - model.mean[i]) / (model.scale[i] || 1));
  let probability = 0;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.f[node] >= 0) {
      node = scaled[tree.f[node]] <= tree.t[node] ? tree.l[node] : tree.r[node];
    }
    probability += tree.p[node];
  }
  return probability / model.trees.length;
}

function interpretMixture(ingredients: string[], fallback: Pollutant | undefined) {
  const selected = new Set(ingredients);
  const recipes = CHEMISTRY
    .filter((recipe) => recipe.ingredients.every((item) => selected.has(item)))
    .sort((a, b) => b.ingredients.length - a.ingredients.length);
  const mechanisms: string[] = [];

  if (selected.has("NO₂") && (selected.has("Luz solar") || selected.has("Radiación global"))) {
    mechanisms.push("fotólisis de NO₂ y potencial de formación de O₃");
  }
  if (selected.has("SO₂") && (selected.has("Humedad") || selected.has("Precipitación"))) {
    mechanisms.push("oxidación acuosa y formación potencial de sulfato");
  }
  if (["PM₁", "PM₂.₅", "PM₁₀"].some((item) => selected.has(item)) && selected.has("Humedad")) {
    mechanisms.push("crecimiento higroscópico del aerosol");
  }
  if (["PM₁", "PM₂.₅", "PM₁₀", "SO₂"].some((item) => selected.has(item)) && selected.has("Precipitación")) {
    mechanisms.push("remoción por deposición húmeda");
  }
  if (selected.has("Inversión térmica") || (selected.has("Presión atmosférica") && selected.has("Temperatura"))) {
    mechanisms.push("estabilidad atmosférica y menor mezcla vertical");
  }

  const exact = recipes[0];
  const product = ingredients.length < 2
    ? "Selecciona dos variables"
    : mechanisms.length > 1
      ? "Sistema atmosférico acoplado"
      : exact?.product ?? mechanisms[0] ?? "Interacción multivariable";
  const equation = mechanisms.length > 1 ? `${ingredients.join(" + ")} → procesos acoplados` : exact?.equation ?? (ingredients.length ? ingredients.join(" + ") : "—");
  const explanation = mechanisms.length > 1
    ? `La selección activa simultáneamente ${mechanisms.join("; ")}. El resultado integra química, remoción y estabilidad sin inventar una concentración final.`
    : exact?.explanation
      ?? (ingredients.length < 2
      ? "Combina contaminantes y condiciones atmosféricas para revelar un mecanismo."
      : mechanisms.length
        ? `La selección activa ${mechanisms.join("; ")}. La cámara muestra la dirección esperada del proceso, no una concentración final.`
        : "Las variables comparten el mismo volumen de aire, pero no hay base suficiente para afirmar un producto químico único. La lectura se conserva como interacción física y contexto de exposición.");

  const detailParts = [
    exact?.detail,
    selected.has("Precipitación")
      ? "La precipitación puede retirar gases solubles y partículas por captura dentro y debajo de las nubes. Un episodio de lluvia suele disminuir la carga suspendida, aunque puede trasladar contaminantes al suelo y al agua."
      : null,
    selected.has("Presión atmosférica")
      ? "La presión no reacciona con los contaminantes; funciona como indicador del estado de la masa de aire. Su efecto debe leerse junto con temperatura, inversión y viento."
      : null,
    selected.has("Radiación global")
      ? "La radiación global aporta energía a la química fotoquímica y también modifica la convección superficial. Su efecto cambia con nubosidad, hora y disponibilidad de precursores."
      : null,
    selected.has("PM₁") || selected.has("PM₂.₅") || selected.has("PM₁₀")
      ? "Las fracciones PM representan tamaños aerodinámicos distintos: PM₁ penetra más profundamente, PM₂.₅ permanece más tiempo suspendido y PM₁₀ sedimenta con mayor rapidez. Mezclarlas no crea una sustancia nueva; integra fracciones de exposición."
      : null,
  ].filter(Boolean) as string[];

  return {
    product,
    equation,
    explanation,
    detail: detailParts.join(" ") || "La cuantificación exigiría concentraciones iniciales, tiempo de residencia, oxidantes, composición del aerosol y constantes cinéticas. El laboratorio evita inventar esos valores y limita el resultado a una interpretación causal.",
    mechanisms: mechanisms.length ? mechanisms : ["coexistencia sin producto químico determinado"],
    accent: exact?.accent ?? fallback?.color ?? "#64d5c2",
    mapPollutant: exact?.mapPollutant
      ?? ingredients.find((item) => ["NO₂", "O₃", "SO₂", "CO", "PM₁", "PM₂.₅", "PM₁₀"].includes(item))
      ?? fallback?.label
      ?? "PM₂.₅",
  };
}

const TILE_SIZE = 256;
const MAX_LATITUDE = 85.05112878;
const TILE_SOURCES = {
  streets: {
    label: "Calles",
    attribution: "© OpenStreetMap · © CARTO",
    url: (z: number, x: number, y: number) => `https://${["a", "b", "c", "d"][(x + y) & 3]}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`,
  },
  satellite: {
    label: "Satélite",
    attribution: "Imágenes © Esri",
    url: (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  analysis: {
    label: "Análisis",
    attribution: "© OpenStreetMap · © CARTO",
    url: (z: number, x: number, y: number) => `https://${["a", "b", "c", "d"][(x + y) & 3]}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
  },
} as const;

function lonLatToWorld(lon: number, lat: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function worldToLonLat(x: number, y: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lon = x / scale * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lon, lat };
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`toggle ${active ? "is-active" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="toggle-dot" />
      {label}
    </button>
  );
}

function MapCanvas({
  sites,
  monitoring,
  geography,
  selectedSite,
  selectedPollutant,
  hour,
  windSpeed,
  windDirection,
  showTraffic,
  showMonitoring,
  showPlumes,
  mapStyle,
  view,
  historyFactor,
  onViewChange,
  onSelectSite,
}: {
  sites: IndustrialSite[];
  monitoring: GenericRow[];
  geography: AppData["geography"];
  selectedSite: IndustrialSite | null;
  selectedPollutant: Pollutant;
  hour: number;
  windSpeed: number;
  windDirection: number;
  showTraffic: boolean;
  showMonitoring: boolean;
  showPlumes: boolean;
  mapStyle: keyof typeof TILE_SOURCES;
  view: MapView;
  historyFactor: number;
  onViewChange: (view: MapView) => void;
  onSelectSite: (site: IndustrialSite) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const hits = useRef<{ site: IndustrialSite; x: number; y: number; r: number }[]>([]);
  const tiles = useRef<Map<string, HTMLImageElement>>(new Map());
  const drag = useRef<{ pointerId: number; x: number; y: number; worldX: number; worldY: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sites.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let animation = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const centerWorld = lonLatToWorld(view.lon, view.lat, view.zoom);
    const project = (lon: number, lat: number) => {
      const point = lonLatToWorld(lon, lat, view.zoom);
      return { x: point.x - centerWorld.x + width / 2, y: point.y - centerWorld.y + height / 2 };
    };

    const hexRgb = (hex: string) => {
      const normalized = hex.replace("#", "");
      return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
    };
    const [red, green, blue] = hexRgb(selectedPollutant.color);
    const source = TILE_SOURCES[mapStyle];
    const peak = hour >= 5 && hour <= 9 || hour >= 14 && hour <= 18;

    const emissionFor = (site: IndustrialSite) => {
      const documented = site.emissions[selectedPollutant.label];
      if (typeof documented === "number" && Number.isFinite(documented)) return documented;
      if (selectedPollutant.label === "PM₂.₅" || selectedPollutant.label === "PM₁" || selectedPollutant.label === "PM₁₀") {
        return site.emissionRate * 0.42;
      }
      if (selectedPollutant.label === "O₃") return site.emissionRate * 0.16;
      return site.emissionRate * 0.28;
    };

    const drawPath = (points: [number, number][]) => {
      points.forEach(([lon, lat], index) => {
        const point = project(lon, lat);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
    };

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = mapStyle === "streets" ? "#e7e9e3" : "#0b1418";
      ctx.fillRect(0, 0, width, height);

      const tileCount = 2 ** view.zoom;
      const minTileX = Math.floor((centerWorld.x - width / 2) / TILE_SIZE);
      const maxTileX = Math.floor((centerWorld.x + width / 2) / TILE_SIZE);
      const minTileY = Math.max(0, Math.floor((centerWorld.y - height / 2) / TILE_SIZE));
      const maxTileY = Math.min(tileCount - 1, Math.floor((centerWorld.y + height / 2) / TILE_SIZE));
      for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
          const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
          const key = `${mapStyle}:${view.zoom}:${wrappedX}:${tileY}`;
          let image = tiles.current.get(key);
          if (!image) {
            image = new Image();
            image.crossOrigin = "anonymous";
            image.src = source.url(view.zoom, wrappedX, tileY);
            tiles.current.set(key, image);
          }
          const x = tileX * TILE_SIZE - centerWorld.x + width / 2;
          const y = tileY * TILE_SIZE - centerWorld.y + height / 2;
          if (image.complete && image.naturalWidth) ctx.drawImage(image, x, y, TILE_SIZE + 1, TILE_SIZE + 1);
        }
      }

      ctx.fillStyle = mapStyle === "satellite" ? "rgba(4,14,17,.34)" : mapStyle === "analysis" ? "rgba(0,8,11,.18)" : "rgba(4,15,18,.08)";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.beginPath();
      drawPath(geography.boundary);
      ctx.closePath();
      ctx.fillStyle = mapStyle === "streets" ? "rgba(211,80,70,.12)" : "rgba(239,111,78,.11)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,111,91,.92)";
      ctx.setLineDash([9, 6]);
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const road of geography.roads) {
        ctx.beginPath();
        drawPath(road.points);
        ctx.strokeStyle = mapStyle === "streets" ? "rgba(12,38,43,.35)" : "rgba(221,235,228,.34)";
        ctx.lineWidth = road.class === "arterial" ? 5 : 3;
        ctx.setLineDash([]);
        ctx.stroke();
        if (showTraffic) {
          ctx.beginPath();
          drawPath(road.points);
          ctx.setLineDash([2, 12]);
          ctx.lineDashOffset = -frame * (peak ? 0.9 : 0.38) * road.trafficWeight;
          ctx.lineWidth = peak ? 4 : 3;
          ctx.strokeStyle = peak ? `rgba(247,207,101,${0.48 + road.trafficWeight * 0.34})` : `rgba(247,207,101,${0.24 + road.trafficWeight * 0.22})`;
          ctx.stroke();
        }
      }
      ctx.restore();

      if (showTraffic) {
        ctx.save();
        for (const point of geography.aermodPoints) {
          const pos = project(point.lon, point.lat);
          if (pos.x < -15 || pos.y < -15 || pos.x > width + 15 || pos.y > height + 15) continue;
          const radius = 2.5 + Math.min(6, point.emissionRate / 5);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,157,72,.74)";
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (const road of geography.roads) {
        const labelPoint = road.points[Math.floor(road.points.length / 2)];
        const pos = project(labelPoint[0], labelPoint[1]);
        if (pos.x < 60 || pos.x > width - 60 || pos.y < 20 || pos.y > height - 20) continue;
        ctx.fillStyle = mapStyle === "streets" ? "rgba(8,35,39,.82)" : "rgba(235,243,238,.72)";
        ctx.fillText(road.name, pos.x, pos.y - 7);
      }
      ctx.restore();

      if (showMonitoring) {
        for (const point of monitoring) {
          const lon = Number(point.Longitud);
          const lat = Number(point.Latitud);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
          const pos = project(lon, lat);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(100,213,194,.92)";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 10 + Math.sin(frame * 0.05) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(100,213,194,.28)";
          ctx.stroke();
          if (pos.x > -12 && pos.y > -12 && pos.x < width + 12 && pos.y < height + 12) {
            ctx.font = "600 9px ui-monospace, monospace";
            ctx.fillStyle = mapStyle === "streets" ? "rgba(8,44,47,.9)" : "rgba(220,239,233,.8)";
            ctx.fillText(String(point.Punto), pos.x + 8, pos.y - 7);
          }
        }
      }

      const ranked = [...sites].sort((a, b) => emissionFor(b) - emissionFor(a));
      const sources = ranked.slice(0, 12);
      const maxEmission = Math.max(...sources.map(emissionFor), 1);
      const windAngle = ((windDirection - 90) * Math.PI) / 180;

      if (showPlumes) {
        const visibleSources = [...sources.slice(0, 6)];
        if (selectedSite && !visibleSources.some((site) => site.id === selectedSite.id)) visibleSources.push(selectedSite);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const site of visibleSources) {
          const origin = project(site.lon, site.lat);
          if (origin.x < -220 || origin.y < -220 || origin.x > width + 220 || origin.y > height + 220) continue;
          const strength = Math.max(0.15, emissionFor(site) / maxEmission) * Math.max(0.45, Math.min(2.25, historyFactor));
          const length = 68 + strength * 132 + windSpeed * 7;
          const breadth = 22 + strength * 42 + Math.max(0, 3 - windSpeed) * 6;
          ctx.save();
          ctx.translate(origin.x, origin.y);
          ctx.rotate(windAngle);
          const bands = [
            { scale: 1, alpha: 0.10 },
            { scale: 0.73, alpha: 0.13 },
            { scale: 0.49, alpha: 0.18 },
            { scale: 0.28, alpha: 0.26 },
          ];
          for (const band of bands) {
            ctx.beginPath();
            ctx.ellipse(length * 0.34 * band.scale, 0, length * 0.57 * band.scale, breadth * band.scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${red},${green},${blue},${band.alpha})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(${red},${green},${blue},${band.alpha + 0.08})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      if (showPlumes && frame % 2 === 0 && particles.current.length < 320) {
        const source = sources[Math.floor(Math.random() * sources.length)];
        particles.current.push({
          x: 0,
          y: 0,
          age: 0,
          life: 120 + Math.random() * 130,
          size: 2 + Math.random() * 5,
          drift: Math.random() * Math.PI * 2,
          source: source.id,
        });
      }

      particles.current = particles.current.filter((particle) => {
        particle.age += 1;
        return particle.age < particle.life;
      });
      for (const particle of particles.current) {
        const source = sites.find((site) => site.id === particle.source);
        if (!source) continue;
        const origin = project(source.lon, source.lat);
        const travel = particle.age * (0.12 + windSpeed * 0.08) * Math.max(0.65, Math.min(1.5, historyFactor));
        const x = origin.x + Math.cos(windAngle) * travel + Math.sin(particle.drift + particle.age * 0.04) * 5;
        const y = origin.y + Math.sin(windAngle) * travel - particle.age * 0.1;
        const alpha = Math.max(0, (1 - particle.age / particle.life) * 0.5);
        const radius = particle.size + particle.age * 0.018;
        const plume = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.6);
        plume.addColorStop(0, `rgba(${red},${green},${blue},${alpha})`);
        plume.addColorStop(1, `rgba(${red},${green},${blue},0)`);
        ctx.fillStyle = plume;
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      hits.current = [];
      for (const site of sites) {
        const pos = project(site.lon, site.lat);
        if (pos.x < -35 || pos.y < -35 || pos.x > width + 35 || pos.y > height + 35) continue;
        const selected = selectedSite?.id === site.id;
        const intensity = Math.min(1, emissionFor(site) / maxEmission);
        if (intensity > 0.05) {
          const glow = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 18 + intensity * 30);
          glow.addColorStop(0, `rgba(${red},${green},${blue},${0.18 + intensity * 0.18})`);
          glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 22 + intensity * 26, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = selected ? "#f4efe4" : site.source.startsWith("UCuenca") ? "#cf8b6c" : "#667d82";
        ctx.fillRect(pos.x - 5, pos.y - 8, 12, 10);
        ctx.fillStyle = selected ? selectedPollutant.color : "#82989d";
        ctx.fillRect(pos.x + 2, pos.y - 16, 3, 10);
        ctx.beginPath();
        ctx.moveTo(pos.x - 5, pos.y - 8);
        ctx.lineTo(pos.x + 1, pos.y - 13);
        ctx.lineTo(pos.x + 7, pos.y - 8);
        ctx.fillStyle = selected ? "#d9d2c3" : "#50656a";
        ctx.fill();
        if (selected) {
          ctx.beginPath();
          ctx.arc(pos.x + 1, pos.y - 4, 15 + Math.sin(frame * 0.06) * 2, 0, Math.PI * 2);
          ctx.strokeStyle = selectedPollutant.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = "600 10px ui-monospace, monospace";
          ctx.fillStyle = "#f4efe4";
          ctx.fillText(`${site.name.slice(0, 24)} · ${site.source}`, pos.x + 14, pos.y - 17);
        }
        hits.current.push({ site, x: pos.x, y: pos.y, r: 16 });
      }

      ctx.save();
      ctx.translate(29, height - 31);
      ctx.rotate(windAngle);
      ctx.strokeStyle = "#f4efe4";
      ctx.fillStyle = "#f4efe4";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, -4);
      ctx.moveTo(10, 0);
      ctx.lineTo(5, 4);
      ctx.stroke();
      ctx.restore();
      ctx.font = "500 9px ui-monospace, monospace";
      ctx.fillStyle = mapStyle === "streets" ? "rgba(8,38,42,.82)" : "rgba(244,239,228,.75)";
      ctx.fillText(`${windDirection}° · ${windSpeed.toFixed(1)} m/s`, 47, height - 27);

      ctx.save();
      ctx.translate(width - 29, 34);
      ctx.fillStyle = mapStyle === "streets" ? "#12383c" : "#f4efe4";
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(5, 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-5, 2);
      ctx.closePath();
      ctx.fill();
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", 0, 14);
      ctx.restore();

      animation = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [sites, monitoring, geography, selectedSite, selectedPollutant, hour, windSpeed, windDirection, showTraffic, showMonitoring, showPlumes, mapStyle, view, historyFactor]);

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const match = hits.current
      .map((hit) => ({ ...hit, distance: Math.hypot(hit.x - x, hit.y - y) }))
      .filter((hit) => hit.distance <= hit.r)
      .sort((a, b) => a.distance - b.distance)[0];
    if (match) onSelectSite(match.site);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const nextZoom = Math.max(13, Math.min(18, view.zoom + (event.deltaY < 0 ? 1 : -1)));
    if (nextZoom === view.zoom) return;
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const currentCenter = lonLatToWorld(view.lon, view.lat, view.zoom);
    const anchor = worldToLonLat(currentCenter.x + offsetX, currentCenter.y + offsetY, view.zoom);
    const anchorAtNext = lonLatToWorld(anchor.lon, anchor.lat, nextZoom);
    const nextCenter = worldToLonLat(anchorAtNext.x - offsetX, anchorAtNext.y - offsetY, nextZoom);
    onViewChange({ ...nextCenter, zoom: nextZoom });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const center = lonLatToWorld(view.lon, view.lat, view.zoom);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, worldX: center.x, worldY: center.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 4) suppressClick.current = true;
    const next = worldToLonLat(active.worldX - (event.clientX - active.x), active.worldY - (event.clientY - active.y), view.zoom);
    onViewChange({ ...next, zoom: view.zoom });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      onClick={handleClick}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      aria-label="Mapa atmosférico interactivo del Parque Industrial de Cuenca"
    />
  );
}

function SparkBars({ data, activeHour }: { data: GenericRow[]; activeHour: number }) {
  const values = data.map((row) => Number(row.CONT_PM25));
  const max = Math.max(...values, 1);
  return (
    <div className="spark-bars" aria-label="Perfil histórico mediano de PM2.5 por hora">
      {values.map((value, hour) => (
        <div className="spark-column" key={hour} title={`${String(hour).padStart(2, "0")}:00 · ${value.toFixed(1)} µg/m³`}>
          <span
            className={hour === activeHour ? "is-current" : ""}
            style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

function AppLoading({ error }: { error: string | null }) {
  return (
    <main className="loading-shell">
      <div className="loading-mark">A//C</div>
      <p className="eyebrow">Laboratorio atmosférico</p>
      <h1>{error ? "No pudimos abrir el laboratorio" : "Integrando 73 fuentes de investigación"}</h1>
      <p>{error || "Georreferenciando industrias, tráfico y el modelo predictivo…"}</p>
      {!error && <div className="loading-line"><span /></div>}
    </main>
  );
}

export default function Home() {
  const [data, setData] = useState<AppData | null>(null);
  const [model, setModel] = useState<ModelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const [hour, setHour] = useState(7);
  const [playing, setPlaying] = useState(false);
  const [windSpeed, setWindSpeed] = useState(2.4);
  const [windDirection, setWindDirection] = useState(250);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showMonitoring, setShowMonitoring] = useState(true);
  const [showPlumes, setShowPlumes] = useState(true);
  const [mapStyle, setMapStyle] = useState<keyof typeof TILE_SOURCES>("satellite");
  const [mapView, setMapView] = useState<MapView>({ lon: -78.9771, lat: -2.8767, zoom: 15 });
  const [mapTimeMode, setMapTimeMode] = useState<"day" | "history">("day");
  const [historyDimension, setHistoryDimension] = useState<"annual" | "seasonal" | "monthly" | "weekly">("monthly");
  const [historyA, setHistoryA] = useState("9");
  const [historyB, setHistoryB] = useState("2");
  const [selectedPollutantLabel, setSelectedPollutantLabel] = useState("PM₂.₅");
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [ingredients, setIngredients] = useState<string[]>(["NO₂", "Luz solar"]);

  useEffect(() => {
    fetch("/app-data.json")
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo leer la base analítica.");
        return response.json();
      })
      .then((payload: AppData) => {
        setData(payload);
        const defaults: Record<string, number> = {};
        payload.pollutants.forEach((pollutant) => {
          defaults[pollutant.feature] = pollutant.median;
        });
        defaults.MET_TEMP = 15.4;
        defaults.MET_HUM = 69.4;
        defaults.MET_PRES = 75645;
        setInputs(defaults);
        setMapView({ lon: payload.geography.center[0], lat: payload.geography.center[1], zoom: payload.geography.initialZoom });
        const highest = [...payload.industrial.sites].sort((a, b) => b.emissionRate - a.emissionRate)[0];
        setSelectedSiteId(highest?.id ?? null);
      })
      .catch(() => setError("La base analítica no está disponible en este momento."));

    fetch("/model-data.json")
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el modelo.");
        return response.json();
      })
      .then((payload: ModelPayload) => setModel(payload))
      .catch(() => setError("La visualización abrió, pero el modelo predictivo no pudo cargarse."));
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("es-EC", {
          timeZone: "America/Guayaquil",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setHour((value) => (value + 1) % 24), 1150);
    return () => window.clearInterval(timer);
  }, [playing]);

  const selectedPollutant = useMemo(
    () => data?.pollutants.find((item) => item.label === selectedPollutantLabel) ?? data?.pollutants[0],
    [data, selectedPollutantLabel],
  );
  const selectedSite = useMemo(
    () => data?.industrial.sites.find((site) => site.id === selectedSiteId) ?? null,
    [data, selectedSiteId],
  );
  const probability = useMemo(
    () => model && Object.keys(inputs).length ? predictForest(model, inputs, hour) : null,
    [model, inputs, hour],
  );
  const band = riskBand(probability ?? 0);
  const referenceProbability = useMemo(() => {
    if (!model || !data?.recentSeries.length) return null;
    const reference = data.recentSeries[data.recentSeries.length - 1];
    const referenceInputs: Record<string, number> = {};
    for (const [key, value] of Object.entries(reference)) {
      const numeric = Number(value);
      if ((key.startsWith("CONT_") || key.startsWith("MET_")) && Number.isFinite(numeric)) referenceInputs[key] = numeric;
    }
    const referenceHour = new Date(String(reference.Fecha)).getHours();
    return predictForest(model, referenceInputs, referenceHour);
  }, [data, model]);
  const referenceBand = riskBand(referenceProbability ?? 0);
  const hourProfile = useMemo(
    () => data?.hourlyProfile.find((row) => Number(row.HORA) === hour),
    [data, hour],
  );
  const historySlices = data?.historical[historyDimension] ?? [];
  const historyPrimary = historySlices.find((slice) => slice.key === historyA) ?? historySlices[0];
  const historyComparison = historySlices.find((slice) => slice.key === historyB) ?? historySlices[1] ?? historySlices[0];
  const historyPrimaryValue = historyPrimary?.values[selectedPollutant?.feature ?? ""]?.median ?? selectedPollutant?.median ?? 1;
  const historyComparisonValue = historyComparison?.values[selectedPollutant?.feature ?? ""]?.median ?? selectedPollutant?.median ?? 1;
  const historyDelta = historyComparisonValue ? ((historyPrimaryValue - historyComparisonValue) / historyComparisonValue) * 100 : 0;
  const historyFactor = mapTimeMode === "history"
    ? Math.max(0.45, Math.min(2.25, historyPrimaryValue / Math.max(selectedPollutant?.median ?? 1, 0.001)))
    : 1;
  const mixResult = useMemo(() => interpretMixture(ingredients, selectedPollutant), [ingredients, selectedPollutant]);

  const toggleIngredient = useCallback((ingredient: string) => {
    setIngredients((current) => {
      if (current.includes(ingredient)) return current.filter((item) => item !== ingredient);
      return [...current, ingredient];
    });
  }, []);

  if (!data || !selectedPollutant) return <AppLoading error={error} />;

  const modalTotal = data.traffic.modal.reduce((sum, row) => sum + Number(row.Porcentaje || 0), 0) || 100;
  const modalColors = ["#64d5c2", "#ef6f4e", "#f7cf65", "#9b8cff", "#48a9e6", "#ff8ca1"];
  let donutCursor = 0;
  const donutStops = data.traffic.modal.map((row, i) => {
    const start = donutCursor;
    donutCursor += Number(row.Porcentaje || 0) / modalTotal * 100;
    return `${modalColors[i % modalColors.length]} ${start}% ${donutCursor}%`;
  }).join(",");
  const odModes = ["Viajes_Bus", "Viajes_Vehiculo_Privado", "Viajes_Pie", "Viajes_Moto", "Viajes_Bicicleta"];
  const maxOd = Math.max(...data.traffic.od.flatMap((row) => odModes.map((mode) => Number(row[mode] || 0))), 1);
  const highestFeature = data.topFeatures[0]?.Importance || 1;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#laboratorio" aria-label="Ir al laboratorio atmosférico">
          <span className="brand-mark">A//C</span>
          <span><strong>Aire Cuenca</strong><small>Inteligencia atmosférica</small></span>
        </a>
        <nav aria-label="Secciones principales">
          <a href="#laboratorio">Laboratorio</a>
          <a href="#mezclas">Mezclas</a>
          <a href="#movilidad">Movilidad</a>
          <a href="#modelo">Modelo</a>
        </nav>
        <div className="top-status">
          <span className="status-pulse" />
          <span>Simulación activa</span>
          <time>{clock} ECT</time>
        </div>
      </header>

      <section className="hero" id="laboratorio">
        <div className="hero-heading">
          <div>
            <p className="eyebrow">Parque Industrial · Cuenca, Ecuador</p>
            <h1>Lo invisible,<br /><em>ahora se puede explorar.</em></h1>
          </div>
          <div className="hero-intro">
            <p>
              Un mapa-laboratorio que hace visibles emisiones, partículas, clima y movilidad,
              y estima el deterioro del aire con seis horas de anticipación.
            </p>
            <div className="data-window">
              <span>Ventana analítica</span>
              <strong>{data.meta.periodStart.slice(0, 4)}—{data.meta.periodEnd.slice(0, 4)}</strong>
              <small>No es monitoreo en vivo</small>
            </div>
          </div>
        </div>

        <div className="control-deck">
          <section className="map-panel" aria-label="Mapa laboratorio">
            <div className="map-header">
              <div>
                <p className="panel-kicker">01 · Campo atmosférico</p>
                <h2>Mapa maestro</h2>
              </div>
              <div className="map-coordinate">
                <span>Centro</span>
                <strong>2.88° S · 78.98° O</strong>
              </div>
            </div>

            <div className="map-stage">
              <MapCanvas
                sites={data.industrial.sites}
                monitoring={data.monitoringPoints}
                geography={data.geography}
                selectedSite={selectedSite}
                selectedPollutant={selectedPollutant}
                hour={hour}
                windSpeed={windSpeed}
                windDirection={windDirection}
                showTraffic={showTraffic}
                showMonitoring={showMonitoring}
                showPlumes={showPlumes}
                mapStyle={mapStyle}
                view={mapView}
                historyFactor={historyFactor}
                onViewChange={setMapView}
                onSelectSite={(site) => setSelectedSiteId(site.id)}
              />

              <div className="map-tools" aria-label="Capas del mapa">
                <Toggle active={showPlumes} label="Plumas" onClick={() => setShowPlumes((value) => !value)} />
                <Toggle active={showTraffic} label="Tráfico" onClick={() => setShowTraffic((value) => !value)} />
                <Toggle active={showMonitoring} label="Muestreo" onClick={() => setShowMonitoring((value) => !value)} />
              </div>

              <div className="basemap-switch" aria-label="Mapa base">
                {(Object.keys(TILE_SOURCES) as (keyof typeof TILE_SOURCES)[]).map((style) => (
                  <button key={style} className={mapStyle === style ? "is-active" : ""} onClick={() => setMapStyle(style)}>
                    {TILE_SOURCES[style].label}
                  </button>
                ))}
              </div>

              <div className="map-navigation" aria-label="Navegación del mapa">
                <button onClick={() => setMapView((current) => ({ ...current, zoom: Math.min(18, current.zoom + 1) }))} aria-label="Acercar">+</button>
                <button onClick={() => setMapView((current) => ({ ...current, zoom: Math.max(13, current.zoom - 1) }))} aria-label="Alejar">−</button>
                <button onClick={() => setMapView({ lon: data.geography.center[0], lat: data.geography.center[1], zoom: data.geography.initialZoom })} aria-label="Centrar mapa">◎</button>
              </div>

              <div className="pollutant-strip" role="list" aria-label="Contaminantes visibles">
                {data.pollutants.map((pollutant) => (
                  <button
                    key={pollutant.label}
                    className={selectedPollutant.label === pollutant.label ? "is-active" : ""}
                    style={{ "--pollutant": pollutant.color } as React.CSSProperties}
                    onClick={() => setSelectedPollutantLabel(pollutant.label)}
                  >
                    <span />{pollutant.label}
                  </button>
                ))}
              </div>

              <aside className="site-inspector">
                {selectedSite ? (
                  <>
                    <div className="inspector-head">
                      <span>{selectedSite.source}</span>
                      <button aria-label="Seleccionar siguiente industria" onClick={() => {
                        const index = data.industrial.sites.findIndex((site) => site.id === selectedSite.id);
                        setSelectedSiteId(data.industrial.sites[(index + 1) % data.industrial.sites.length].id);
                      }}>↗</button>
                    </div>
                    <h3>{selectedSite.name}</h3>
                    <p>{selectedSite.category}</p>
                    <p className="inspector-equipment">{selectedSite.equipment} · {selectedSite.fuel}</p>
                    <div className="inspector-metrics">
                      <div><span>{selectedPollutant.label}</span><strong>{compactNumber(selectedSite.emissions[selectedPollutant.label] ?? selectedSite.emissionRate, 2)}</strong><small>g/s · visual</small></div>
                      <div><span>Fuentes</span><strong>{selectedSite.sourceCount}</strong><small>equipos</small></div>
                      <div><span>Salida</span><strong>{compactNumber(selectedSite.exitVelocity, 1)}</strong><small>m/s</small></div>
                    </div>
                    <p className="inspector-note">Ø {compactNumber(selectedSite.stackDiameter, 2)} m{selectedSite.stackHeight ? ` · h ${compactNumber(selectedSite.stackHeight, 1)} m` : ""}{selectedSite.outletTemperature ? ` · ${compactNumber(selectedSite.outletTemperature, 0)} °C` : ""}. La pluma combina inventario, hora y viento simulado.</p>
                  </>
                ) : null}
              </aside>

              <div className="map-legend">
                <span><i className="legend-factory" /> {data.industrial.sites.length} fuentes · 2 inventarios</span>
                <span><i className="legend-monitor" /> 10 puntos de muestreo</span>
                <span><i className="legend-route" /> Calles + tráfico AERMOD</span>
              </div>

              <div className="map-attribution">{TILE_SOURCES[mapStyle].attribution} · límite reconstruido de las tesis</div>
            </div>

            <div className={`timeline-control ${mapTimeMode === "history" ? "is-history" : ""}`}>
              <div className="time-mode-tabs" aria-label="Escala temporal">
                <button className={mapTimeMode === "day" ? "is-active" : ""} onClick={() => setMapTimeMode("day")}>24 horas</button>
                <button className={mapTimeMode === "history" ? "is-active" : ""} onClick={() => { setMapTimeMode("history"); setPlaying(false); }}>Histórico 2022–2026</button>
              </div>
              {mapTimeMode === "day" ? (
                <>
                  <button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pausar tiempo" : "Reproducir tiempo"}>
                    {playing ? "Ⅱ" : "▶"}
                  </button>
                  <div className="time-readout">
                    <strong>{String(hour).padStart(2, "0")}:00</strong>
                    <span>{hour >= 5 && hour <= 9 || hour >= 14 && hour <= 18 ? "franja de alta movilidad" : "franja base"}</span>
                  </div>
                  <input className="hour-range" type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} aria-label="Hora de simulación" />
                </>
              ) : (
                <div className="history-lens">
                  <label>Escala<select value={historyDimension} onChange={(event) => {
                    const dimension = event.target.value as typeof historyDimension;
                    const options = data.historical[dimension];
                    setHistoryDimension(dimension);
                    setHistoryA(options[Math.max(0, options.length - 1)]?.key ?? "");
                    setHistoryB(options[0]?.key ?? "");
                  }}><option value="annual">Año</option><option value="seasonal">Trimestre</option><option value="monthly">Mes</option><option value="weekly">Día</option></select></label>
                  <label>Lectura<select value={historyPrimary?.key} onChange={(event) => setHistoryA(event.target.value)}>{historySlices.map((slice) => <option key={slice.key} value={slice.key}>{slice.label}</option>)}</select></label>
                  <span className="history-versus">vs</span>
                  <label>Comparar<select value={historyComparison?.key} onChange={(event) => setHistoryB(event.target.value)}>{historySlices.map((slice) => <option key={slice.key} value={slice.key}>{slice.label}</option>)}</select></label>
                  <div className="history-result"><strong>{compactNumber(historyPrimaryValue, selectedPollutant.label === "CO" ? 2 : 1)} {selectedPollutant.unit}</strong><span>{historyDelta >= 0 ? "+" : ""}{compactNumber(historyDelta, 0)}% frente a {historyComparison?.label}</span></div>
                </div>
              )}
              <div className="weather-sliders">
                <label>Viento <b>{windSpeed.toFixed(1)} m/s</b><input type="range" min="0.3" max="8" step="0.1" value={windSpeed} onChange={(event) => setWindSpeed(Number(event.target.value))} /></label>
                <label>Dirección <b>{windDirection}°</b><input type="range" min="0" max="359" value={windDirection} onChange={(event) => setWindDirection(Number(event.target.value))} /></label>
              </div>
            </div>
          </section>

          <aside className="forecast-panel" aria-label="Predicción a seis horas">
            <div className="forecast-head">
              <div>
                <p className="panel-kicker">02 · Alerta temprana</p>
                <h2>Próximas 6 h</h2>
              </div>
              <span className={model ? "model-ready" : "model-loading"}>{model ? "RF · 300 árboles" : "cargando modelo"}</span>
            </div>

            <div className="risk-comparison">
              <div className="gauge-block is-reference">
                <span className="gauge-caption">Estado actual histórico</span>
                <div className="risk-gauge" style={{ "--risk": `${Math.round((referenceProbability ?? 0) * 360)}deg`, "--risk-color": referenceBand.color } as React.CSSProperties}>
                  <div><small>fijo</small><strong>{referenceProbability === null ? "—" : `${Math.round(referenceProbability * 100)}%`}</strong><span>{referenceBand.label}</span></div>
                </div>
                <small>Corte {data.meta.periodEnd}</small>
              </div>
              <div className="gauge-arrow">→</div>
              <div className="gauge-block">
                <span className="gauge-caption">Escenario próximas 6 h</span>
                <div className="risk-gauge" style={{ "--risk": `${Math.round((probability ?? 0) * 360)}deg`, "--risk-color": band.color } as React.CSSProperties}>
                  <div><small>probabilidad</small><strong>{probability === null ? "—" : `${Math.round(probability * 100)}%`}</strong><span>{band.label}</span></div>
                </div>
                <small>Interactivo</small>
              </div>
            </div>
            <p className="risk-note"><i style={{ background: band.color }} />{band.note}</p>

            <div className="scenario-inputs">
              <div className="scenario-title"><span>Escenario atmosférico</span><button onClick={() => {
                const defaults: Record<string, number> = {};
                data.pollutants.forEach((pollutant) => defaults[pollutant.feature] = pollutant.median);
                defaults.MET_TEMP = 15.4; defaults.MET_HUM = 69.4; defaults.MET_PRES = 75645;
                setInputs(defaults);
              }}>Restablecer</button></div>
              {data.pollutants.map((pollutant) => (
                <label key={pollutant.feature}>
                  <span>{pollutant.label}<b>{compactNumber(inputs[pollutant.feature] ?? pollutant.median, pollutant.label === "CO" ? 2 : 1)} {pollutant.unit}</b></span>
                  <input
                    type="range"
                    min={pollutant.min}
                    max={pollutant.max}
                    step={(pollutant.max - pollutant.min) / 100}
                    value={inputs[pollutant.feature] ?? pollutant.median}
                    onChange={(event) => setInputs((current) => ({ ...current, [pollutant.feature]: Number(event.target.value) }))}
                    style={{ "--range-color": pollutant.color } as React.CSSProperties}
                  />
                </label>
              ))}
              <div className="weather-input-grid">
                <label><span>Temperatura<b>{compactNumber(inputs.MET_TEMP ?? 15.4)} °C</b></span><input type="range" min="4" max="29" step="0.1" value={inputs.MET_TEMP ?? 15.4} onChange={(event) => setInputs((current) => ({ ...current, MET_TEMP: Number(event.target.value) }))} /></label>
                <label><span>Humedad<b>{compactNumber(inputs.MET_HUM ?? 69.4)}%</b></span><input type="range" min="22" max="100" step="1" value={inputs.MET_HUM ?? 69.4} onChange={(event) => setInputs((current) => ({ ...current, MET_HUM: Number(event.target.value) }))} /></label>
              </div>
            </div>

            <div className="forecast-foot">
              <span>Umbral operativo <b>0,40</b></span>
              <span>Objetivo <b>PM₂.₅ &gt; 15 µg/m³</b></span>
            </div>
          </aside>
        </div>

        <div className="hero-facts">
          <div><span>Modelo enriquecido</span><strong>{data.meta.enrichedFeatures}</strong><small>variables integradas</small></div>
          <div><span>Capacidad discriminante</span><strong>{Math.round(data.meta.metrics.roc_auc * 100)}%</strong><small>AUC-ROC reportado</small></div>
          <div><span>Campo industrial</span><strong>{data.industrial.sites.length}</strong><small>chimeneas georreferenciadas</small></div>
          <div><span>Movilidad laboral</span><strong>19.329</strong><small>viajes/día estimados</small></div>
        </div>
      </section>

      <section className="lab-section" id="mezclas">
        <div className="section-heading">
          <div><p className="eyebrow">Laboratorio químico visual</p><h2>Mezcla variables.<br /><em>Observa el mecanismo.</em></h2></div>
          <p>La complejidad físico-química queda detrás del sistema. Tú seleccionas condiciones; el laboratorio traduce la interacción a una explicación legible.</p>
        </div>

        <div className="mixer-grid">
          <div className="ingredient-bank">
            <div className="module-head"><span>Variables disponibles</span><small>sin límite artificial</small></div>
            <div className="ingredient-list">
              {INGREDIENTS.map((ingredient) => (
                <button key={ingredient.label} className={ingredients.includes(ingredient.label) ? "is-selected" : ""} onClick={() => toggleIngredient(ingredient.label)}>
                  <i /><span className="ingredient-name">{ingredient.label}<small>{ingredient.group}</small></span><span>{ingredients.includes(ingredient.label) ? "−" : "+"}</span>
                </button>
              ))}
            </div>
            <div className="lab-note"><span>Regla del laboratorio</span><p>Las reacciones son explicaciones causales simplificadas; el modelo de alerta y la química visual son capas distintas.</p></div>
          </div>

          <div className="mix-chamber" style={{ "--mix-accent": mixResult.accent } as React.CSSProperties}>
            <div className="chamber-grid" />
            <div className="selected-formula">
              {ingredients.length ? ingredients.map((ingredient, i) => <span key={ingredient}>{i ? <b>+</b> : null}{ingredient}</span>) : <span>Selecciona variables</span>}
            </div>
            <div className="vessel">
              <span className="bubble b1" /><span className="bubble b2" /><span className="bubble b3" /><span className="bubble b4" />
              <div className="vessel-liquid" />
            </div>
            <div className="reaction-arrow">↓</div>
            <div className="reaction-product"><small>resultado conceptual</small><strong>{mixResult.product}</strong></div>
          </div>

          <div className="reaction-card">
            <p className="panel-kicker">Lectura de la mezcla</p>
            <h3>{mixResult.product}</h3>
            <code>{mixResult.equation}</code>
            <p>{mixResult.explanation}</p>
            <div className="reaction-effects">
              <div><span>Dispersión</span><b>{windSpeed > 4 ? "alta" : windSpeed > 1.5 ? "media" : "baja"}</b></div>
              <div><span>Permanencia</span><b>{windSpeed < 1.5 ? "alta" : "moderada"}</b></div>
              <div><span>Hora</span><b>{String(hour).padStart(2, "0")}:00</b></div>
            </div>
            <details className="reaction-detail">
              <summary>Explicación científica completa <span>＋</span></summary>
              <div>
                <p>{mixResult.detail}</p>
                <strong>Mecanismos activados</strong>
                <ul>{mixResult.mechanisms.map((mechanism) => <li key={mechanism}>{mechanism}</li>)}</ul>
                <small>Lectura conceptual: no sustituye una corrida cinética, termodinámica o de dispersión validada.</small>
              </div>
            </details>
            <button className="primary-action" onClick={() => {
              setSelectedPollutantLabel(mixResult.mapPollutant);
              document.getElementById("laboratorio")?.scrollIntoView({ behavior: "smooth" });
            }}>Proyectar en el mapa <span>↗</span></button>
          </div>
        </div>
      </section>

      <section className="mobility-section" id="movilidad">
        <div className="section-heading inverted">
          <div><p className="eyebrow">Movilidad + emisiones</p><h2>La contaminación<br /><em>también llega por carretera.</em></h2></div>
          <p>El modelo origen-destino conecta 18 zonas con el Parque Industrial. La hora modifica la intensidad visible de las rutas y el contexto de exposición.</p>
        </div>

        <div className="mobility-dashboard">
          <article className="od-card">
            <div className="module-head"><span>Matriz origen—destino</span><small>viajes laborales estimados</small></div>
            <div className="od-table">
              <div className="od-header"><span>Zona</span>{["Bus", "Privado", "Pie", "Moto", "Bici"].map((mode) => <span key={mode}>{mode}</span>)}</div>
              {data.traffic.od.slice(0, 10).map((row) => (
                <div className="od-row" key={String(row.Zona_Origen)}>
                  <strong>{row.Zona_Origen}</strong>
                  {odModes.map((mode) => {
                    const value = Number(row[mode] || 0);
                    return <span key={mode} style={{ "--cell-alpha": `${0.08 + value / maxOd * 0.82}` } as React.CSSProperties} title={`${value} viajes`}>{value}</span>;
                  })}
                </div>
              ))}
            </div>
            <p className="table-note">El Valle, Monay y Totoracocha concentran los mayores flujos estimados hacia el parque.</p>
          </article>

          <article className="modal-card">
            <div className="module-head"><span>Reparto modal</span><small>PMEP 2015–2025</small></div>
            <div className="donut-wrap">
              <div className="donut" style={{ background: `conic-gradient(${donutStops})` }}><div><strong>64%</strong><span>bus + privado</span></div></div>
              <div className="donut-legend">
                {data.traffic.modal.map((row, i) => <div key={String(row.Modo)}><i style={{ background: modalColors[i % modalColors.length] }} /><span>{row.Modo}</span><b>{row.Porcentaje}%</b></div>)}
              </div>
            </div>
          </article>

          <article className="traffic-impact-card">
            <div className="module-head"><span>Huella de movilidad</span><small>dinámica + ralentí</small></div>
            <strong className="big-number">14.699,6 <small>t CO₂/año</small></strong>
            <div className="rank-bars">
              {data.traffic.carbon.map((row, i) => <div key={String(row.Empresa)}><span>{row.Empresa}</span><div><i style={{ width: `${Number(row.Porcentaje_CO2)}%`, background: modalColors[(i + 1) % modalColors.length] }} /></div><b>{row.Porcentaje_CO2}%</b></div>)}
            </div>
            <div className="traffic-callout"><strong>67%</strong><span>del tráfico del parque es de paso; el trabajo explica el 52% de esos viajes.</span></div>
          </article>
        </div>
      </section>

      <section className="industry-section">
        <div className="section-heading">
          <div><p className="eyebrow">Inventario industrial</p><h2>De la chimenea<br /><em>al campo de exposición.</em></h2></div>
          <p>Las fuentes combinan ubicación, combustible, concentración, altura, diámetro y velocidad de salida para convertir tablas estáticas en una lectura espacial.</p>
        </div>
        <div className="industry-grid">
          <article className="emitter-list">
            <div className="module-head"><span>Principales tasas de emisión SO₂</span><small>g/s · fuente politécnica</small></div>
            {[...data.industrial.sites].sort((a, b) => b.emissionRate - a.emissionRate).slice(0, 8).map((site, i) => (
              <button key={site.id} onClick={() => { setSelectedSiteId(site.id); setSelectedPollutantLabel("SO₂"); document.getElementById("laboratorio")?.scrollIntoView({ behavior: "smooth" }); }}>
                <span>{String(i + 1).padStart(2, "0")}</span><strong>{site.name}</strong><i><b style={{ width: `${Math.max(3, site.emissionRate / 44.059 * 100)}%` }} /></i><em>{compactNumber(site.emissionRate, 3)}</em>
              </button>
            ))}
          </article>
          <article className="source-anatomy">
            <div className="module-head"><span>Anatomía de las fuentes</span><small>47 registros físicos</small></div>
            <div className="equipment-visual">
              <div className="factory-silhouette"><span className="chimney c1" /><span className="chimney c2" /><span className="roof r1" /><span className="roof r2" /></div>
              <div className="equipment-stats">
                {data.industrial.equipment.slice(0, 4).map((row) => <div key={String(row.Tipo_Fuente)}><span>{row.Tipo_Fuente}</span><strong>{row.Fuentes}</strong><small>fuentes</small></div>)}
              </div>
            </div>
            <div className="aermod-note"><span>AERMOD</span><strong>{data.industrial.aermod.points} puntos</strong><p>Campo de tráfico y dispersión extraído para contextualizar el alcance espacial.</p></div>
          </article>
          <article className="fuel-card">
            <div className="module-head"><span>Consumo documentado</span><small>combustibles industriales</small></div>
            {data.industrial.fuelConsumption.map((row, i) => <div className="fuel-row" key={String(row.Combustible)}><span>{row.Combustible}</span><strong>{compactNumber(Number(row.Consumo), 0)}</strong><small>{row.Unidad}</small><i style={{ width: `${Math.max(4, Number(row.Consumo) / 11678551 * 100)}%`, background: modalColors[i % modalColors.length] }} /></div>)}
            <p>Las unidades se conservan tal como fueron publicadas; no se suman kg y galones.</p>
          </article>
        </div>
      </section>

      <section className="model-section" id="modelo">
        <div className="section-heading inverted">
          <div><p className="eyebrow">Modelo + trazabilidad</p><h2>Una alerta que<br /><em>puede explicarse.</em></h2></div>
          <p>El bosque aleatorio se ejecuta realmente con el escenario elegido. El mapa añade contexto industrial y de movilidad sin confundirlo con una medición en vivo.</p>
        </div>

        <div className="model-grid">
          <article className="metrics-card">
            <div className="module-head"><span>Evaluación reportada</span><small>modelo enriquecido</small></div>
            <div className="metric-big"><strong>{(data.meta.metrics.roc_auc * 100).toFixed(1)}%</strong><span>AUC-ROC</span></div>
            <div className="metric-pair"><div><span>Accuracy</span><b>{(data.meta.metrics.accuracy * 100).toFixed(1)}%</b></div><div><span>F1</span><b>{(data.meta.metrics.f1_score * 100).toFixed(1)}%</b></div><div><span>OOB</span><b>{(data.meta.metrics.oob_score * 100).toFixed(1)}%</b></div></div>
            <div className="model-comparison"><span>Base · {Math.round(data.meta.baseMetrics["AUC-ROC"] * 100)}% AUC</span><i><b style={{ width: `${data.meta.baseMetrics["AUC-ROC"] * 100}%` }} /></i><span>Enriquecido · {Math.round(data.meta.metrics.roc_auc * 100)}% AUC</span><i><b className="enriched" style={{ width: `${data.meta.metrics.roc_auc * 100}%` }} /></i></div>
          </article>

          <article className="importance-card">
            <div className="module-head"><span>Señales que más pesan</span><small>importancia del bosque</small></div>
            <div className="importance-list">
              {data.topFeatures.slice(0, 12).map((feature, i) => <div key={feature.Feature}><span>{String(i + 1).padStart(2, "0")}</span><strong>{featureLabel(feature.Feature)}</strong><i><b style={{ width: `${feature.Importance / highestFeature * 100}%` }} /></i><em>{(feature.Importance * 100).toFixed(2)}%</em></div>)}
            </div>
          </article>

          <article className="transparency-card">
            <p className="panel-kicker">Lectura honesta</p>
            <h3>Contexto no es lo mismo que señal predictiva.</h3>
            <p>El modelo enriquecido contiene 97 variables industriales y 89 de tráfico agregadas como constantes globales. Sirven para describir el entorno, pero las variables temporales de sensores dominan la decisión de cada alerta.</p>
            <div className="transparency-stats"><div><strong>176</strong><span>variables con importancia no nula</span></div><div><strong>184</strong><span>variables contextuales sin variación temporal</span></div></div>
            <p className="method-warning">Para atribuir una alerta a una empresa concreta harían falta emisiones y tráfico sincronizados por hora. Esta versión evita presentar esa atribución como un hecho.</p>
          </article>
        </div>

        <div className="profile-strip">
          <div>
            <span>Perfil PM₂.₅ por hora</span>
            <strong>{compactNumber(Number(hourProfile?.CONT_PM25 || 0))} µg/m³</strong>
            <small>mediana histórica a las {String(hour).padStart(2, "0")}:00</small>
          </div>
          <SparkBars data={data.hourlyProfile} activeHour={hour} />
        </div>
      </section>

      <section className="source-section">
        <div>
          <p className="eyebrow">Base de conocimiento</p>
          <h2>Todo el proyecto,<br />sin perder la procedencia.</h2>
        </div>
        <div className="source-manifest">
          <div><span>EDA + ETL</span><strong>{compactNumber(data.meta.sourceRows, 0)}</strong><small>registros de origen descritos</small></div>
          <div><span>Modelo final</span><strong>{compactNumber(data.meta.modelRows, 0)}</strong><small>filas completas</small></div>
          <div><span>Actividad estatal</span><strong>{data.meta.sourceBundles.estatal}</strong><small>artefactos procesados</small></div>
          <div><span>Actividad politécnica</span><strong>{data.meta.sourceBundles.politecnica}</strong><small>artefactos del paquete</small></div>
          <div><span>Tráfico EMES</span><strong>{data.meta.sourceBundles.trafico}</strong><small>artefactos del paquete</small></div>
        </div>
        <p className="source-note">Fuentes integradas por el proyecto: EMOV EP, estaciones Escuela Juan Montalvo / Parque Industrial y tesis de la Universidad de Cuenca y Universidad Politécnica Salesiana. Períodos y unidades se muestran según los archivos analizados.</p>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">A//C</span><span><strong>Aire Cuenca</strong><small>Laboratorio atmosférico</small></span></div>
        <p>Simulación educativa y analítica. No sustituye una alerta oficial de calidad del aire.</p>
        <a href="#laboratorio">Volver al mapa ↑</a>
      </footer>
    </main>
  );
}
