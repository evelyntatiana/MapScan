"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
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
  so2Concentration: number;
  exitVelocity: number;
  stackDiameter: number;
  emissionRate: number;
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
    accent: "#f7cf65",
    mapPollutant: "O₃",
  },
  {
    ingredients: ["SO₂", "Humedad"],
    product: "Sulfatos secundarios",
    equation: "SO₂ + oxidantes + H₂O → aerosol de sulfato",
    explanation:
      "En aire húmedo, el SO₂ puede oxidarse y contribuir a partículas finas secundarias que permanecen suspendidas.",
    accent: "#d47af3",
    mapPollutant: "PM₂.₅",
  },
  {
    ingredients: ["PM₂.₅", "Humedad"],
    product: "Crecimiento higroscópico",
    equation: "PM₂.₅ + H₂O(g) → partícula hidratada",
    explanation:
      "Las partículas captan agua, crecen y reducen la visibilidad; el simulador aumenta su tamaño aparente.",
    accent: "#ff8ca1",
    mapPollutant: "PM₂.₅",
  },
  {
    ingredients: ["CO", "Inversión térmica"],
    product: "Acumulación local",
    equation: "Emisión + capa estable → dispersión vertical limitada",
    explanation:
      "Una capa estable reduce la mezcla vertical. El CO y otros contaminantes quedan concentrados cerca de las fuentes.",
    accent: "#ef6f4e",
    mapPollutant: "CO",
  },
  {
    ingredients: ["NO₂", "O₃"],
    product: "Ciclo fotoquímico",
    equation: "NO + O₃ → NO₂ + O₂",
    explanation:
      "El ozono reacciona con NO y regenera NO₂. La radiación y los compuestos orgánicos controlan el balance del ciclo.",
    accent: "#9b8cff",
    mapPollutant: "NO₂",
  },
];

const INGREDIENTS = [
  "NO₂",
  "O₃",
  "SO₂",
  "CO",
  "PM₂.₅",
  "Humedad",
  "Luz solar",
  "Inversión térmica",
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
  selectedSite,
  selectedPollutant,
  hour,
  windSpeed,
  windDirection,
  showTraffic,
  showMonitoring,
  showPlumes,
  onSelectSite,
}: {
  sites: IndustrialSite[];
  monitoring: GenericRow[];
  selectedSite: IndustrialSite | null;
  selectedPollutant: Pollutant;
  hour: number;
  windSpeed: number;
  windDirection: number;
  showTraffic: boolean;
  showMonitoring: boolean;
  showPlumes: boolean;
  onSelectSite: (site: IndustrialSite) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const hits = useRef<{ site: IndustrialSite; x: number; y: number; r: number }[]>([]);

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

    const coords = [
      ...sites.map((site) => ({ lon: site.lon, lat: site.lat })),
      ...monitoring.map((point) => ({
        lon: Number(point.Longitud),
        lat: Number(point.Latitud),
      })),
    ].filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat));
    const minLon = Math.min(...coords.map((p) => p.lon));
    const maxLon = Math.max(...coords.map((p) => p.lon));
    const minLat = Math.min(...coords.map((p) => p.lat));
    const maxLat = Math.max(...coords.map((p) => p.lat));

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

    const project = (lon: number, lat: number) => {
      const x = 38 + ((lon - minLon) / (maxLon - minLon || 1)) * (width - 76);
      const y = 42 + ((maxLat - lat) / (maxLat - minLat || 1)) * (height - 92);
      return { x, y };
    };

    const hexRgb = (hex: string) => {
      const normalized = hex.replace("#", "");
      return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
    };
    const [red, green, blue] = hexRgb(selectedPollutant.color);

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#0d1b20");
      bg.addColorStop(0.55, "#10191d");
      bg.addColorStop(1, "#091216");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#365158";
      ctx.lineWidth = 1;
      for (let i = -height; i < width + height; i += 42) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - height * 0.4, height);
        ctx.stroke();
      }
      for (let y = 54; y < height; y += 66) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y + 36);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(141,170,164,.16)";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(-20, height * 0.73);
      ctx.bezierCurveTo(width * 0.24, height * 0.54, width * 0.62, height * 0.83, width + 30, height * 0.58);
      ctx.stroke();
      ctx.strokeStyle = "rgba(115,196,218,.2)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      if (showTraffic) {
        const peak = hour >= 5 && hour <= 9 || hour >= 14 && hour <= 18;
        ctx.save();
        ctx.setLineDash([8, 12]);
        ctx.lineDashOffset = -frame * (peak ? 0.8 : 0.35);
        ctx.lineWidth = peak ? 2.5 : 1.5;
        ctx.strokeStyle = peak ? "rgba(247,207,101,.68)" : "rgba(247,207,101,.35)";
        const center = project(-78.9798, -2.876);
        const origins = [
          [width * 0.05, height * 0.18],
          [width * 0.08, height * 0.82],
          [width * 0.48, height - 5],
          [width * 0.92, height * 0.84],
          [width * 0.94, height * 0.22],
        ];
        for (const [x, y] of origins) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo((x + center.x) / 2, center.y - 60, center.x, center.y);
          ctx.stroke();
        }
        ctx.restore();
      }

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
          ctx.font = "600 9px ui-monospace, monospace";
          ctx.fillStyle = "rgba(220,239,233,.72)";
          ctx.fillText(String(point.Punto), pos.x + 8, pos.y - 7);
        }
      }

      const ranked = [...sites].sort((a, b) => b.emissionRate - a.emissionRate);
      const sources = ranked.slice(0, 9);
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

      const windAngle = ((windDirection - 90) * Math.PI) / 180;
      particles.current = particles.current.filter((particle) => {
        particle.age += 1;
        return particle.age < particle.life;
      });
      for (const particle of particles.current) {
        const source = sites.find((site) => site.id === particle.source);
        if (!source) continue;
        const origin = project(source.lon, source.lat);
        const travel = particle.age * (0.12 + windSpeed * 0.08);
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
        const selected = selectedSite?.id === site.id;
        const intensity = Math.min(1, site.emissionRate / 12);
        if (intensity > 0.05) {
          const glow = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, 18 + intensity * 30);
          glow.addColorStop(0, `rgba(${red},${green},${blue},${0.18 + intensity * 0.18})`);
          glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 22 + intensity * 26, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = selected ? "#f4efe4" : "#667d82";
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
          ctx.fillText(site.name.slice(0, 28), pos.x + 14, pos.y - 17);
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
      ctx.fillStyle = "rgba(244,239,228,.65)";
      ctx.fillText(`${windDirection}° · ${windSpeed.toFixed(1)} m/s`, 47, height - 27);

      animation = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, [sites, monitoring, selectedSite, selectedPollutant, hour, windSpeed, windDirection, showTraffic, showMonitoring, showPlumes]);

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const match = hits.current
      .map((hit) => ({ ...hit, distance: Math.hypot(hit.x - x, hit.y - y) }))
      .filter((hit) => hit.distance <= hit.r)
      .sort((a, b) => a.distance - b.distance)[0];
    if (match) onSelectSite(match.site);
  };

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas"
      onClick={handleClick}
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
  const hourProfile = useMemo(
    () => data?.hourlyProfile.find((row) => Number(row.HORA) === hour),
    [data, hour],
  );
  const mixResult = useMemo(() => {
    const exact = CHEMISTRY.find((recipe) => recipe.ingredients.every((item) => ingredients.includes(item)));
    if (exact) return exact;
    return {
      product: ingredients.length < 2 ? "Selecciona dos variables" : "Interacción multivariable",
      equation: ingredients.length ? ingredients.join(" + ") : "—",
      explanation:
        ingredients.length < 2
          ? "Combina contaminantes y condiciones atmosféricas para revelar un mecanismo."
          : "El sistema combina dispersión, acumulación y afinidad química. Esta mezcla requiere más datos de cinética para cuantificar un producto específico.",
      accent: selectedPollutant?.color ?? "#64d5c2",
      mapPollutant: selectedPollutant?.label ?? "PM₂.₅",
      ingredients,
    };
  }, [ingredients, selectedPollutant]);

  const toggleIngredient = useCallback((ingredient: string) => {
    setIngredients((current) => {
      if (current.includes(ingredient)) return current.filter((item) => item !== ingredient);
      if (current.length >= 4) return [...current.slice(1), ingredient];
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
                selectedSite={selectedSite}
                selectedPollutant={selectedPollutant}
                hour={hour}
                windSpeed={windSpeed}
                windDirection={windDirection}
                showTraffic={showTraffic}
                showMonitoring={showMonitoring}
                showPlumes={showPlumes}
                onSelectSite={(site) => setSelectedSiteId(site.id)}
              />

              <div className="map-tools" aria-label="Capas del mapa">
                <Toggle active={showPlumes} label="Plumas" onClick={() => setShowPlumes((value) => !value)} />
                <Toggle active={showTraffic} label="Tráfico" onClick={() => setShowTraffic((value) => !value)} />
                <Toggle active={showMonitoring} label="Muestreo" onClick={() => setShowMonitoring((value) => !value)} />
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
                      <span>Fuente seleccionada</span>
                      <button aria-label="Seleccionar siguiente industria" onClick={() => {
                        const next = (selectedSite.id + 1) % data.industrial.sites.length;
                        setSelectedSiteId(next);
                      }}>↗</button>
                    </div>
                    <h3>{selectedSite.name}</h3>
                    <p>{selectedSite.fuel} · {compactNumber(selectedSite.altitude, 0)} msnm</p>
                    <div className="inspector-metrics">
                      <div><span>SO₂</span><strong>{compactNumber(selectedSite.so2Concentration)}</strong><small>mg/m³</small></div>
                      <div><span>Emisión</span><strong>{compactNumber(selectedSite.emissionRate, 2)}</strong><small>g/s</small></div>
                      <div><span>Salida</span><strong>{compactNumber(selectedSite.exitVelocity, 1)}</strong><small>m/s</small></div>
                    </div>
                    <p className="inspector-note">La pluma combina tasa documentada, hora y viento simulado.</p>
                  </>
                ) : null}
              </aside>

              <div className="map-legend">
                <span><i className="legend-factory" /> 32 focos industriales</span>
                <span><i className="legend-monitor" /> 10 puntos de muestreo</span>
                <span><i className="legend-route" /> Flujos origen-destino</span>
              </div>
            </div>

            <div className="timeline-control">
              <button className="play-button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pausar tiempo" : "Reproducir tiempo"}>
                {playing ? "Ⅱ" : "▶"}
              </button>
              <div className="time-readout">
                <strong>{String(hour).padStart(2, "0")}:00</strong>
                <span>{hour >= 5 && hour <= 9 || hour >= 14 && hour <= 18 ? "franja de alta movilidad" : "franja base"}</span>
              </div>
              <input type="range" min="0" max="23" value={hour} onChange={(event) => setHour(Number(event.target.value))} aria-label="Hora de simulación" />
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

            <div className="risk-gauge" style={{ "--risk": `${Math.round((probability ?? 0) * 360)}deg`, "--risk-color": band.color } as React.CSSProperties}>
              <div>
                <small>probabilidad</small>
                <strong>{probability === null ? "—" : `${Math.round(probability * 100)}%`}</strong>
                <span>{band.label}</span>
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
            <div className="module-head"><span>Variables disponibles</span><small>máximo 4</small></div>
            <div className="ingredient-list">
              {INGREDIENTS.map((ingredient) => (
                <button key={ingredient} className={ingredients.includes(ingredient) ? "is-selected" : ""} onClick={() => toggleIngredient(ingredient)}>
                  <i />{ingredient}<span>{ingredients.includes(ingredient) ? "−" : "+"}</span>
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
