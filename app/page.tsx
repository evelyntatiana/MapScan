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
import { AnalyticsReportPage, type AnalyticsReportKind } from "./analytics-report";

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
  flow: "in" | "out" | "distribution";
  flowLabel: string;
  points: [number, number][];
};

type TrafficAccess = {
  id: number;
  label: string;
  shortLabel: string;
  lon: number;
  lat: number;
  confidence: string;
  role: string;
  coordinateNote: string;
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
  dailyAir: GenericRow[];
  historical: Record<"annual" | "seasonal" | "monthly" | "weekly", HistorySlice[]>;
  geography: {
    center: [number, number];
    initialZoom: number;
    boundary: [number, number][];
    roads: MapRoad[];
    trafficAccesses: TrafficAccess[];
    aermodProfile: number[];
    aermodStats: {
      points: number;
      min: number;
      median: number;
      p90: number;
      p95: number;
      max: number;
      inventoryPeriod: string;
      method: string;
      directMeasurement: boolean;
    };
    passThroughEntryPct: number;
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

type AcademicReferenceId = "who2021" | "parra2022" | "hu2022" | "mainka2022" | "vilcassim2023";
type MixtureReportKind = "science" | "origin" | "impact";

type HealthProfile = {
  category: "Contaminante atmosférico gaseoso" | "Material particulado" | "Variable meteorológica";
  origin: string;
  role: string;
  health: string;
  references: AcademicReferenceId[];
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
    ingredients: ["NO", "O₃"],
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
  { label: "NO", group: "gas" },
  { label: "PM₁", group: "partícula" },
  { label: "PM₂.₅", group: "partícula" },
  { label: "PM₁₀", group: "partícula" },
  { label: "Humedad", group: "meteorología" },
  { label: "Precipitación", group: "meteorología" },
  { label: "Presión atmosférica", group: "meteorología" },
  { label: "Temperatura", group: "meteorología" },
  { label: "Radiación global", group: "meteorología" },
  { label: "Luz solar", group: "meteorología" },
  { label: "Inversión térmica", group: "meteorología" },
];

const POLLUTANT_NAMES: Record<string, string> = {
  CO: "monóxido de carbono",
  "SO₂": "dióxido de azufre",
  "NO₂": "dióxido de nitrógeno",
  NO: "monóxido de nitrógeno",
  "O₃": "ozono",
  "PM₁": "material particulado ≤ 1 µm",
  "PM₂.₅": "material particulado fino ≤ 2,5 µm",
  "PM₁₀": "material particulado ≤ 10 µm",
};

const ACADEMIC_REFERENCES: Record<AcademicReferenceId, { short: string; apa: string; url: string }> = {
  who2021: {
    short: "OMS, 2021",
    apa: "World Health Organization. (2021). WHO global air quality guidelines: Particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide.",
    url: "https://www.who.int/publications/i/item/9789240034228",
  },
  parra2022: {
    short: "Parra et al., 2022",
    apa: "Parra, R., Saud, C., & Espinoza, C. (2022). Simulating PM2.5 concentrations during New Year in Cuenca, Ecuador: Effects of advancing the time of burning activities. Toxics, 10(5), 264.",
    url: "https://doi.org/10.3390/toxics10050264",
  },
  hu2022: {
    short: "Hu et al., 2022",
    apa: "Hu, Y., Wu, M., Li, Y., & Liu, X. (2022). Influence of PM1 exposure on total and cause-specific respiratory diseases: A systematic review and meta-analysis. Environmental Science and Pollution Research, 29, 15117–15126.",
    url: "https://doi.org/10.1007/s11356-021-16536-0",
  },
  mainka2022: {
    short: "Mainka y Żak, 2022",
    apa: "Mainka, A., & Żak, M. (2022). Synergistic or antagonistic health effects of long- and short-term exposure to ambient NO2 and PM2.5: A review. International Journal of Environmental Research and Public Health, 19(21), 14079.",
    url: "https://doi.org/10.3390/ijerph192114079",
  },
  vilcassim2023: {
    short: "Vilcassim y Thurston, 2023",
    apa: "Vilcassim, R., & Thurston, G. D. (2023). Gaps and future directions in research on health effects of air pollution. eBioMedicine, 93, 104668.",
    url: "https://doi.org/10.1016/j.ebiom.2023.104668",
  },
};

const HEALTH_PROFILES: Record<string, HealthProfile> = {
  "NO₂": {
    category: "Contaminante atmosférico gaseoso",
    origin: "Se forma sobre todo cuando el NO emitido por combustión a alta temperatura se oxida en el aire. En el entorno industrial son plausibles el tránsito diésel y a gasolina, calderas, hornos y otros equipos de combustión; identificar una fuente concreta exige medición e inventario.",
    role: "Es parte de los NOx —grupo que incluye especialmente NO y NO₂— y participa, junto con radiación y compuestos orgánicos volátiles, en la química que puede formar O₃ troposférico.",
    health: "La exposición puede inflamar las vías respiratorias, agravar el asma y aumentar la susceptibilidad a síntomas e infecciones respiratorias, según nivel y duración de exposición.",
    references: ["who2021", "parra2022"],
  },
  "O₃": {
    category: "Contaminante atmosférico gaseoso",
    origin: "No suele emitirse directamente. Se forma en la atmósfera cuando NOx y compuestos orgánicos volátiles reaccionan bajo luz solar; por ello, su máximo puede aparecer lejos o después de las fuentes precursoras.",
    role: "Es un oxidante fotoquímico secundario. El NO puede consumirlo localmente y regenerar NO₂, mientras la radiación y otros precursores controlan su balance neto.",
    health: "Puede irritar e inflamar las vías respiratorias, reducir temporalmente la función pulmonar y agravar asma y otros síntomas, especialmente durante actividad al aire libre.",
    references: ["who2021", "vilcassim2023"],
  },
  "SO₂": {
    category: "Contaminante atmosférico gaseoso",
    origin: "Se asocia con la combustión de combustibles que contienen azufre y con ciertos procesos industriales. En un parque industrial son plausibles calderas, hornos y chimeneas, pero el combustible y el control de emisiones determinan la contribución real.",
    role: "Es un gas soluble que puede oxidarse y contribuir a sulfatos del PM₂.₅; humedad, oxidantes y tiempo de residencia modifican ese proceso.",
    health: "Las exposiciones breves pueden provocar broncoconstricción, tos e irritación, con mayor sensibilidad en personas con asma.",
    references: ["who2021", "parra2022"],
  },
  "CO": {
    category: "Contaminante atmosférico gaseoso",
    origin: "Proviene de combustión incompleta. Son fuentes plausibles los motores, flotas antiguas o mal mantenidas, calderas, hornos y quemas; su presencia no identifica por sí sola qué equipo lo produjo.",
    role: "Es relativamente estable a escala urbana y funciona como trazador de combustión y acumulación cuando la dispersión es débil. No es equivalente a CO₂ ni a todos los gases de combustión.",
    health: "Al unirse a la hemoglobina reduce el transporte de oxígeno. A concentraciones elevadas puede causar cefalea, mareo y efectos cardiovasculares o neurológicos; el riesgo depende de dosis y tiempo.",
    references: ["who2021", "parra2022"],
  },
  "NO": {
    category: "Contaminante atmosférico gaseoso",
    origin: "Se emite principalmente en combustiones a alta temperatura de motores, calderas y hornos. Cerca de la fuente suele ser una fracción importante de los NOx y después se transforma con rapidez.",
    role: "Reacciona con O₃ para formar NO₂ y O₂. La evidencia sanitaria ambiental suele evaluar NO₂ o NOx; por eso NO no se usa aquí como sustituto automático de NO₂.",
    health: "Su principal lectura en esta herramienta es como precursor y marcador de emisiones de combustión. No se asigna un riesgo sanitario independiente sin concentración, duración y especiación de NOx.",
    references: ["who2021", "vilcassim2023"],
  },
  "PM₁": {
    category: "Material particulado",
    origin: "Puede proceder de combustión diésel y gasolina, hornos, calderas y procesos que generan aerosol fino, además de formación secundaria. La red descrita para Cuenca incluye medición de fracciones finas.",
    role: "Es la fracción con diámetro aerodinámico ≤ 1 µm; no equivale a una composición química única ni debe confundirse automáticamente con partículas ultrafinas.",
    health: "Puede depositarse profundamente en el tracto respiratorio. La revisión disponible observa asociaciones con algunos desenlaces respiratorios, pero advierte evidencia limitada, heterogeneidad y sesgo de publicación.",
    references: ["hu2022", "parra2022", "vilcassim2023"],
  },
  "PM₂.₅": {
    category: "Material particulado",
    origin: "Puede ser primario —tránsito diésel, combustión industrial y otras quemas— o secundario, por conversión de gases como SO₂ y NOx. El estudio local identifica tránsito e industria entre los antecedentes relevantes de Cuenca.",
    role: "Agrupa partículas ≤ 2,5 µm con composición variable. Puede permanecer suspendido y transportarse; humedad, lluvia y estabilidad modifican su masa, remoción y dispersión.",
    health: "Penetra en regiones profundas del pulmón y se asocia con efectos respiratorios y cardiovasculares; el riesgo cambia con concentración, composición, exposición y susceptibilidad.",
    references: ["who2021", "parra2022", "mainka2022"],
  },
  "PM₁₀": {
    category: "Material particulado",
    origin: "En el contexto industrial puede provenir de polvo vial resuspendido, desgaste, construcción, trituración, manejo de materiales y fracciones de combustión. La asignación a una fuente requiere análisis de composición y viento.",
    role: "Incluye partículas inhalables ≤ 10 µm y contiene a las fracciones más finas; seleccionar PM₁, PM₂.₅ y PM₁₀ no representa tres masas independientes que puedan sumarse.",
    health: "Puede depositarse en vías respiratorias y asociarse con síntomas y exacerbaciones respiratorias; su composición y distribución de tamaños influyen en el efecto.",
    references: ["who2021", "vilcassim2023"],
  },
  "Humedad": {
    category: "Variable meteorológica",
    origin: "Es una propiedad del aire, no una emisión industrial ni un contaminante. Depende del ciclo meteorológico local y del contenido de vapor de agua.",
    role: "Puede favorecer crecimiento higroscópico del aerosol y química acuosa; también modifica visibilidad, deposición y algunas mediciones de partículas.",
    health: "No se le atribuye la toxicidad de un contaminante en esta lectura. Su efecto sanitario es indirecto: puede cambiar la concentración, el tamaño y la persistencia de aquello que se inhala.",
    references: ["parra2022", "vilcassim2023"],
  },
  "Precipitación": {
    category: "Variable meteorológica",
    origin: "Es un proceso meteorológico, no una sustancia emitida por una fuente. Su intensidad y duración controlan cuánto material puede retirar.",
    role: "Captura partículas y gases solubles dentro y debajo de las nubes, reduciendo a menudo la carga suspendida y transfiriendo parte de ella al suelo o al agua.",
    health: "Modifica indirectamente la exposición al limpiar temporalmente el aire; no convierte por sí sola una mezcla en inocua ni elimina todos los contaminantes.",
    references: ["parra2022", "vilcassim2023"],
  },
  "Presión atmosférica": {
    category: "Variable meteorológica",
    origin: "Describe el estado de la masa de aire; no procede de chimeneas, vehículos ni procesos industriales.",
    role: "Debe leerse junto con temperatura, estabilidad y viento. Ciertos patrones persistentes pueden acompañar ventilación débil o condiciones favorables a acumulación, pero la presión aislada no determina la calidad del aire.",
    health: "En el laboratorio actúa como modificador indirecto de exposición. No se le asigna un efecto tóxico atribuible a contaminación.",
    references: ["parra2022", "vilcassim2023"],
  },
  "Temperatura": {
    category: "Variable meteorológica",
    origin: "Es una condición térmica ambiental, no un contaminante. Cambia por hora, nubosidad, superficie, altitud y circulación atmosférica.",
    role: "Controla estabilidad, convección y velocidades de reacción. El calentamiento diurno puede profundizar la capa de mezcla; ciertos escenarios cálidos y soleados favorecen fotoquímica.",
    health: "Modifica indirectamente la dosis inhalada al cambiar dispersión y química. El estrés térmico es un riesgo distinto y no se suma aquí como toxicidad del aire.",
    references: ["parra2022", "vilcassim2023"],
  },
  "Radiación global": {
    category: "Variable meteorológica",
    origin: "Es la energía solar total recibida por la superficie; no es una emisión ni un contaminante.",
    role: "Aporta energía a la fotoquímica y al calentamiento superficial. Puede favorecer convección y, si existen precursores, procesos que generan O₃ secundario.",
    health: "Su papel sanitario en esta mezcla es indirecto: puede modificar formación y dispersión. No se interpreta como dosis de radiación sobre personas.",
    references: ["parra2022", "who2021"],
  },
  "Luz solar": {
    category: "Variable meteorológica",
    origin: "Es una condición de iluminación natural; no procede de procesos industriales y no es un contaminante atmosférico.",
    role: "La fracción fotoquímicamente activa impulsa la fotólisis de NO₂ y participa en ciclos de formación y consumo de O₃, siempre condicionados por precursores y tiempo.",
    health: "Afecta indirectamente la exposición al modificar la química del aire. La herramienta no equipara luz solar con toxicidad ni con concentración de O₃.",
    references: ["who2021", "parra2022"],
  },
  "Inversión térmica": {
    category: "Variable meteorológica",
    origin: "Es una estructura vertical de temperatura en la que aire más cálido queda sobre aire frío cercano al suelo; no es una emisión.",
    role: "Reduce la convección y puede formar una capa de mezcla somera. Con viento débil, los contaminantes se diluyen menos y permanecen cerca de las fuentes.",
    health: "No es tóxica por sí misma, pero puede elevar la exposición simultánea a gases y partículas al concentrarlos en el aire respirado.",
    references: ["parra2022", "vilcassim2023"],
  },
};

const SCENARIO_GROUPS = [
  { label: "Contaminantes atmosféricos gaseosos", items: ["CO", "SO₂", "NO₂", "O₃"] },
  { label: "Material particulado", items: ["PM₁", "PM₂.₅", "PM₁₀"] },
];

const INGREDIENT_GROUPS = [
  { label: "Contaminantes atmosféricos gaseosos", group: "gas" },
  { label: "Material particulado", group: "partícula" },
  { label: "Meteorología", group: "meteorología" },
];

function compactNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: digits,
  }).format(value);
}

function trafficEmissionPosition(rate: number, min: number, max: number) {
  const safeMin = Math.max(0.001, min);
  const safeMax = Math.max(safeMin + 0.001, max);
  return Math.max(0, Math.min(1, (Math.log1p(rate) - Math.log1p(safeMin)) / (Math.log1p(safeMax) - Math.log1p(safeMin))));
}

function historicalLabel(slice: HistorySlice | undefined, dimension: "annual" | "seasonal" | "monthly" | "weekly") {
  if (!slice || dimension !== "seasonal") return slice?.label ?? "—";
  const months: Record<string, string> = {
    Verano: "Dic–Feb",
    Otoño: "Mar–May",
    Invierno: "Jun–Ago",
    Primavera: "Sep–Nov",
  };
  return `${slice.label} · ${months[slice.label] ?? ""}`.trim();
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
  if (selected.has("NO") && selected.has("O₃")) {
    mechanisms.push("titulación de O₃ por NO y regeneración de NO₂");
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

function interpretHealthEvidence(ingredients: string[]) {
  const profiles = ingredients
    .map((ingredient) => ({ ingredient, profile: HEALTH_PROFILES[ingredient] }))
    .filter((item): item is { ingredient: string; profile: HealthProfile } => Boolean(item.profile));
  const pollutants = profiles.filter(({ profile }) => profile.category !== "Variable meteorológica");
  const meteorology = profiles.filter(({ profile }) => profile.category === "Variable meteorológica");
  const particles = pollutants.filter(({ profile }) => profile.category === "Material particulado");
  const gases = pollutants.filter(({ profile }) => profile.category === "Contaminante atmosférico gaseoso");

  let summary = "Selecciona una o más variables para construir una lectura sanitaria trazable.";
  if (profiles.length === 1 && pollutants.length === 1) {
    summary = `La selección contiene una sola exposición, ${profiles[0].ingredient}. Se explica su vía principal sin presentarla como mezcla ni calcular un riesgo individual.`;
  } else if (pollutants.length === 0 && meteorology.length) {
    summary = `La selección contiene ${meteorology.length === 1 ? "una condición meteorológica" : `${meteorology.length} condiciones meteorológicas`}, no contaminantes. Estas variables modifican el transporte, la transformación o la remoción de una contaminación que tendría que medirse por separado.`;
  } else if (pollutants.length === 1 && meteorology.length) {
    summary = `La selección combina ${pollutants[0].ingredient} con ${meteorology.length === 1 ? "un modificador meteorológico" : `${meteorology.length} modificadores meteorológicos`}. La condición atmosférica puede aumentar o reducir la dosis inhalada, pero no crea una suma automática de riesgos.`;
  } else if (pollutants.length > 1) {
    summary = `La selección representa una coexposición a ${pollutants.length} contaminantes${meteorology.length ? ` bajo ${meteorology.length} condiciones meteorológicas` : ""}. Comparten tiempo y espacio de exposición, aunque cada sustancia o fracción conserva fuentes, transformación y toxicidad propias.`;
  }

  const pathways: string[] = [];
  if (gases.some(({ ingredient }) => ["NO₂", "O₃", "SO₂"].includes(ingredient))) {
    pathways.push("Irritación e inflamación de las vías respiratorias, con sensibilidad especial en personas con asma.");
  }
  if (particles.length) {
    pathways.push("Depósito de partículas en el aparato respiratorio; las fracciones finas pueden alcanzar regiones más profundas y relacionarse con respuestas respiratorias y cardiovasculares.");
  }
  if (gases.some(({ ingredient }) => ingredient === "CO")) {
    pathways.push("Reducción del transporte de oxígeno por CO cuando la dosis es suficiente, una vía distinta de la irritación respiratoria.");
  }
  if (gases.some(({ ingredient }) => ["NO", "NO₂", "O₃"].includes(ingredient))) {
    pathways.push("Química acoplada de NO, NO₂ y O₃: cambia la mezcla respirada, pero no permite deducir una concentración final sin mediciones y un modelo fotoquímico.");
  }
  if (!pathways.length) {
    pathways.push("Sin contaminantes seleccionados no se puede atribuir una vía tóxica; solo se describe cómo la meteorología alteraría una exposición medida.");
  }

  const meteorologyEffects = meteorology.map(({ ingredient }) => ({
    Humedad: "la humedad puede hacer crecer partículas higroscópicas y favorecer química acuosa",
    Precipitación: "la precipitación puede retirar partículas y gases solubles",
    "Presión atmosférica": "la presión aporta contexto sinóptico, pero aislada no determina acumulación",
    Temperatura: "la temperatura modifica estabilidad, convección y velocidades de reacción",
    "Radiación global": "la radiación global aporta energía a la convección y la fotoquímica",
    "Luz solar": "la luz solar activa ciclos fotoquímicos como la fotólisis de NO₂",
    "Inversión térmica": "la inversión térmica restringe la mezcla vertical y puede concentrar emisiones",
  }[ingredient])).filter(Boolean);

  const meteorologyNote = meteorologyEffects.length
    ? `En esta selección, ${meteorologyEffects.join("; ")}. El efecto neto también depende de viento, nubosidad, intensidad y duración del episodio.`
    : "No se seleccionaron variables meteorológicas; por eso esta lectura no infiere ventilación, remoción ni estabilidad del episodio.";

  const references = new Set<AcademicReferenceId>();
  profiles.forEach(({ profile }) => profile.references.forEach((reference) => references.add(reference)));
  if (pollutants.length) references.add("who2021");
  if (pollutants.length > 1) {
    references.add("mainka2022");
    references.add("vilcassim2023");
  }
  if (meteorology.length) references.add("parra2022");

  return {
    profiles,
    summary,
    pathways,
    meteorologyNote,
    referenceIds: Array.from(references),
    limitation: "Interpretación cualitativa, no diagnóstico ni estimación cuantitativa de riesgo. Los riesgos individuales no se suman de forma directa: las interacciones pueden ser aditivas, sinérgicas, antagónicas o estar confundidas. El resultado real depende de concentración, composición, duración, momento, susceptibilidad y coexposiciones.",
  };
}

function AcademicReferenceList({ ids }: { ids: AcademicReferenceId[] }) {
  if (!ids.length) return null;
  return (
    <div className="academic-reference-block">
      <strong>Fuentes académicas · APA 7</strong>
      <ol>
        {ids.map((id) => {
          const reference = ACADEMIC_REFERENCES[id];
          return <li key={id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.apa}</a></li>;
        })}
      </ol>
    </div>
  );
}

function MixtureReportPage({
  kind,
  ingredients,
  mixResult,
  healthResult,
  onClose,
}: {
  kind: MixtureReportKind;
  ingredients: string[];
  mixResult: ReturnType<typeof interpretMixture>;
  healthResult: ReturnType<typeof interpretHealthEvidence>;
  onClose: () => void;
}) {
  const titles: Record<MixtureReportKind, string> = {
    science: "Explicación científica completa",
    origin: "Origen local y efecto en salud",
    impact: "Impacto integrado de la mezcla",
  };
  const subtitles: Record<MixtureReportKind, string> = {
    science: "Interpretación físico-química del escenario seleccionado",
    origin: "Informe variable por variable para el entorno industrial de Cuenca",
    impact: "Lectura sanitaria conjunta y límites de interpretación",
  };

  return (
    <section className="mixture-report-page" role="dialog" aria-modal="true" aria-labelledby="mixture-report-title">
      <header className="report-toolbar">
        <button type="button" onClick={onClose} autoFocus><span>←</span> Volver a Mezcla de variables</button>
        <div><b>Aire Cuenca</b><span>Informe técnico del laboratorio</span></div>
      </header>
      <div className="report-scroll">
        <article className="report-sheet">
          <header className="report-title-block">
            <p>Laboratorio químico visual · Informe {kind === "science" ? "01" : kind === "origin" ? "02" : "03"}</p>
            <h1 id="mixture-report-title">{titles[kind]}</h1>
            <h2>{subtitles[kind]}</h2>
            <div className="report-context">
              <span><b>Resultado conceptual</b>{mixResult.product}</span>
              <span><b>Variables seleccionadas</b>{ingredients.length || "Ninguna"}</span>
              <span><b>Alcance</b>Interpretación educativa</span>
            </div>
          </header>

          {kind === "science" ? (
            <div className="report-body">
              <section>
                <p className="report-section-label">01 · Lectura principal</p>
                <h3>{mixResult.product}</h3>
                <p className="report-lead">{mixResult.explanation}</p>
                <code className="report-equation">{mixResult.equation}</code>
              </section>
              <section>
                <p className="report-section-label">02 · Desarrollo científico</p>
                <h3>Qué ocurre en el sistema atmosférico</h3>
                <p>{mixResult.detail}</p>
              </section>
              <section>
                <p className="report-section-label">03 · Procesos reconocidos</p>
                <h3>Mecanismos activados por la selección</h3>
                <ol className="report-numbered-list">
                  {mixResult.mechanisms.map((mechanism, index) => <li key={mechanism}><span>{String(index + 1).padStart(2, "0")}</span><p>{mechanism}</p></li>)}
                </ol>
              </section>
              <aside className="report-notice">
                <b>Límite de esta explicación</b>
                <p>Esta lectura describe relaciones causales plausibles. No sustituye una corrida cinética, termodinámica o de dispersión validada, ni calcula concentraciones finales sin datos de entrada suficientes.</p>
              </aside>
            </div>
          ) : null}

          {kind === "origin" ? (
            <div className="report-body">
              <section>
                <p className="report-section-label">Criterio de lectura</p>
                <p className="report-lead">Cada variable se presenta por separado y en el orden elegido. “Origen local” identifica fuentes plausibles para el Parque Industrial y su entorno; no atribuye una emisión a una instalación concreta sin medición e inventario.</p>
              </section>
              {healthResult.profiles.length ? (
                <div className="report-variable-list">
                  {healthResult.profiles.map(({ ingredient, profile }, index) => (
                    <section key={ingredient} className="report-variable-card">
                      <header><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{ingredient}</h3><p>{profile.category}</p></div></header>
                      <div className="report-finding"><h4>{profile.category === "Variable meteorológica" ? "Naturaleza de la variable" : "Origen probable en el contexto local"}</h4><p>{profile.origin}</p></div>
                      <div className="report-finding"><h4>Papel atmosférico</h4><p>{profile.role}</p></div>
                      <div className="report-finding"><h4>Efecto en salud</h4><p>{profile.health}</p></div>
                      <p className="report-inline-citations">{profile.references.map((id) => <a key={id} href={ACADEMIC_REFERENCES[id].url} target="_blank" rel="noreferrer">{ACADEMIC_REFERENCES[id].short}</a>)}</p>
                    </section>
                  ))}
                </div>
              ) : <p className="report-empty">No hay variables seleccionadas. Vuelve al laboratorio y añade al menos una para generar el informe.</p>}
              <AcademicReferenceList ids={healthResult.referenceIds} />
            </div>
          ) : null}

          {kind === "impact" ? (
            <div className="report-body">
              {ingredients.length ? <div className="report-tags">{ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div> : null}
              <section>
                <p className="report-section-label">01 · Síntesis de la selección</p>
                <h3>Cómo interpretar la exposición conjunta</h3>
                <p className="report-lead">{healthResult.summary}</p>
              </section>
              <section>
                <p className="report-section-label">02 · Salud</p>
                <h3>Vías y sistemas compartidos</h3>
                <ul className="report-bullet-list">{healthResult.pathways.map((pathway) => <li key={pathway}>{pathway}</li>)}</ul>
              </section>
              <section>
                <p className="report-section-label">03 · Atmósfera</p>
                <h3>Modulación meteorológica</h3>
                <p>{healthResult.meteorologyNote}</p>
              </section>
              <aside className="report-notice warning">
                <b>Límite científico</b>
                <p>{healthResult.limitation}</p>
              </aside>
              <AcademicReferenceList ids={healthResult.referenceIds} />
            </div>
          ) : null}

          <footer className="report-footer"><span>Aire Cuenca · Laboratorio atmosférico</span><button type="button" onClick={onClose}>Cerrar informe y volver</button></footer>
        </article>
      </div>
    </section>
  );
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
  showTrafficEmissions,
  selectedTrafficEmission,
  showMonitoring,
  showPlumes,
  mapStyle,
  view,
  historyFactor,
  onViewChange,
  onSelectSite,
  onSelectTrafficEmission,
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
  showTrafficEmissions: boolean;
  selectedTrafficEmission: { index: number; rate: number } | null;
  showMonitoring: boolean;
  showPlumes: boolean;
  mapStyle: keyof typeof TILE_SOURCES;
  view: MapView;
  historyFactor: number;
  onViewChange: (view: MapView) => void;
  onSelectSite: (site: IndustrialSite) => void;
  onSelectTrafficEmission: (selection: { index: number; rate: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const hits = useRef<{ site: IndustrialSite; x: number; y: number; r: number }[]>([]);
  const trafficHits = useRef<{ index: number; rate: number; x: number; y: number; r: number }[]>([]);
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

    const pointAlongPath = (points: [number, number][], progress: number) => {
      const projected = points.map(([lon, lat]) => project(lon, lat));
      const lengths = projected.slice(1).map((point, index) => Math.hypot(point.x - projected[index].x, point.y - projected[index].y));
      const total = lengths.reduce((sum, value) => sum + value, 0);
      let target = Math.max(0, Math.min(1, progress)) * total;
      for (let index = 0; index < lengths.length; index += 1) {
        if (target <= lengths[index] || index === lengths.length - 1) {
          const ratio = lengths[index] ? target / lengths[index] : 0;
          const start = projected[index];
          const end = projected[index + 1];
          return {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
            angle: Math.atan2(end.y - start.y, end.x - start.x),
          };
        }
        target -= lengths[index];
      }
      return { ...projected[0], angle: 0 };
    };

    const trafficEmissionStyle = (rate: number) => {
      const min = Math.max(0.001, geography.aermodStats.min);
      const max = Math.max(min + 0.001, geography.aermodStats.max);
      const normalized = trafficEmissionPosition(rate, min, max);
      const low = [246, 239, 142];
      const middle = [255, 159, 67];
      const high = [255, 77, 87];
      const mix = (from: number[], to: number[], amount: number) => from.map((value, index) => Math.round(value + (to[index] - value) * amount));
      const rgb = normalized < 0.58 ? mix(low, middle, normalized / 0.58) : mix(middle, high, (normalized - 0.58) / 0.42);
      return { normalized, rgb };
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
      geography.roads.forEach((road) => {
        ctx.beginPath();
        drawPath(road.points);
        ctx.strokeStyle = mapStyle === "streets" ? "rgba(12,38,43,.52)" : "rgba(221,235,228,.38)";
        ctx.lineWidth = road.class === "arterial" ? 5.5 : road.class === "access" ? 4.5 : 3.5;
        ctx.setLineDash([]);
        ctx.stroke();
        if (showTraffic) {
          ctx.beginPath();
          drawPath(road.points);
          ctx.setLineDash([3, 11]);
          ctx.lineDashOffset = -frame * (peak ? 0.9 : 0.38) * road.trafficWeight;
          ctx.lineWidth = peak ? 4.2 : 3.2;
          ctx.strokeStyle = peak ? `rgba(247,207,101,${0.48 + road.trafficWeight * 0.34})` : `rgba(247,207,101,${0.24 + road.trafficWeight * 0.22})`;
          ctx.stroke();

          const arrow = pointAlongPath(road.points, road.flow === "in" ? 0.72 : 0.62);
          ctx.save();
          ctx.translate(arrow.x, arrow.y);
          ctx.rotate(arrow.angle);
          ctx.setLineDash([]);
          ctx.fillStyle = road.flow === "in" ? "rgba(100,213,194,.94)" : road.flow === "out" ? "rgba(247,207,101,.96)" : "rgba(235,239,228,.84)";
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-5, -4.5);
          ctx.lineTo(-2, 0);
          ctx.lineTo(-5, 4.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      });
      ctx.restore();

      trafficHits.current = [];
      if (showTrafficEmissions && geography.aermodPoints.length) {
        ctx.save();
        ctx.globalCompositeOperation = mapStyle === "streets" ? "multiply" : "screen";
        geography.aermodPoints.forEach((point, index) => {
          const rate = point.emissionRate;
          const pos = project(point.lon, point.lat);
          if (pos.x < -15 || pos.y < -15 || pos.x > width + 15 || pos.y > height + 15) return;
          const { normalized, rgb } = trafficEmissionStyle(rate);
          const pulse = peak ? 0.94 : 0.66 + Math.sin((hour / 24) * Math.PI * 2) * 0.08;
          if (normalized > 0.68) {
            const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 7 + normalized * 8);
            glow.addColorStop(0, `rgba(${rgb.join(",")},${0.26 * pulse})`);
            glow.addColorStop(1, `rgba(${rgb.join(",")},0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 7 + normalized * 8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 1.3 + normalized * 3.4, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb.join(",")},${(0.44 + normalized * 0.48) * pulse})`;
          ctx.fill();
          trafficHits.current.push({ index, rate, x: pos.x, y: pos.y, r: 7 });
          if (selectedTrafficEmission?.index === index) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 8.5 + Math.sin(frame * 0.08) * 1.2, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255,255,255,.96)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        });
        ctx.restore();
      }

      ctx.save();
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (const road of geography.roads) {
        const pos = pointAlongPath(road.points, 0.46);
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
      const sources = ranked;
      const maxEmission = Math.max(...sources.map(emissionFor), 1);
      const windAngle = ((windDirection - 90) * Math.PI) / 180;

      if (showPlumes) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (const site of sources) {
          const origin = project(site.lon, site.lat);
          if (origin.x < -220 || origin.y < -220 || origin.x > width + 220 || origin.y > height + 220) continue;
          const selectedBoost = selectedSite?.id === site.id ? 1.18 : 1;
          const strength = Math.max(0.06, emissionFor(site) / maxEmission) * Math.max(0.45, Math.min(2.25, historyFactor)) * selectedBoost;
          const length = 38 + strength * 118 + windSpeed * 5.5;
          const breadth = 11 + strength * 34 + Math.max(0, 3 - windSpeed) * 3.2;
          ctx.save();
          ctx.translate(origin.x, origin.y);
          ctx.rotate(windAngle);
          const bands = [
            { scale: 1, alpha: selectedSite?.id === site.id ? 0.16 : 0.075 },
            { scale: 0.63, alpha: selectedSite?.id === site.id ? 0.21 : 0.11 },
            { scale: 0.31, alpha: selectedSite?.id === site.id ? 0.30 : 0.18 },
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

      if (showPlumes && frame % 2 === 0 && particles.current.length < 420) {
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

      if (!showPlumes) particles.current = [];
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

      if (showTraffic) {
        const labelShifts: Record<number, [number, number]> = {
          1: [15, -14],
          2: [15, 22],
          3: [15, -17],
          4: [15, 23],
        };
        ctx.save();
        for (const access of geography.trafficAccesses) {
          const pos = project(access.lon, access.lat);
          if (pos.x < -80 || pos.y < -40 || pos.x > width + 80 || pos.y > height + 40) continue;
          const color = access.id === 3 || access.id === 4 ? "#64d5c2" : "#f7cf65";
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 13 + Math.sin(frame * 0.045 + access.id) * 1.4, 0, Math.PI * 2);
          ctx.strokeStyle = `${color}77`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(8,23,26,.92)";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#f4efe4";
          ctx.font = "700 9px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(access.id), pos.x, pos.y + 0.5);

          const [shiftX, shiftY] = labelShifts[access.id] ?? [14, -14];
          const labelX = pos.x + shiftX;
          const labelY = pos.y + shiftY;
          ctx.font = "700 8px ui-monospace, monospace";
          ctx.textAlign = "left";
          const labelWidth = Math.min(156, ctx.measureText(access.shortLabel).width + 15);
          ctx.fillStyle = "rgba(7,20,23,.86)";
          ctx.fillRect(labelX - 5, labelY - 9, labelWidth, 17);
          ctx.fillStyle = color;
          ctx.fillText(access.shortLabel, labelX, labelY);
        }
        ctx.restore();
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
  }, [sites, monitoring, geography, selectedSite, selectedPollutant, hour, windSpeed, windDirection, showTraffic, showTrafficEmissions, selectedTrafficEmission, showMonitoring, showPlumes, mapStyle, view, historyFactor]);

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const trafficMatch = showTrafficEmissions ? trafficHits.current
      .map((hit) => ({ ...hit, distance: Math.hypot(hit.x - x, hit.y - y) }))
      .filter((hit) => hit.distance <= hit.r)
      .sort((a, b) => a.distance - b.distance)[0] : undefined;
    if (trafficMatch) {
      onSelectTrafficEmission({ index: trafficMatch.index, rate: trafficMatch.rate });
      return;
    }
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
    const nextZoom = Math.max(9, Math.min(18, view.zoom + (event.deltaY < 0 ? 1 : -1)));
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
      aria-label="Mapa atmosférico interactivo del Parque Industrial de Cuenca; los puntos de SO₂ de tráfico se pueden seleccionar"
    />
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
  const [showTrafficEmissions, setShowTrafficEmissions] = useState(true);
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
  const [selectedTrafficEmission, setSelectedTrafficEmission] = useState<{ index: number; rate: number } | null>(null);
  const [inputs, setInputs] = useState<Record<string, number>>({});
  const [ingredients, setIngredients] = useState<string[]>(["NO₂", "Luz solar"]);
  const [activeMixtureReport, setActiveMixtureReport] = useState<MixtureReportKind | null>(null);
  const [activeAnalyticsReport, setActiveAnalyticsReport] = useState<AnalyticsReportKind | null>(null);

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

  useEffect(() => {
    if (!activeMixtureReport && !activeAnalyticsReport) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMixtureReport(null);
        setActiveAnalyticsReport(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeMixtureReport, activeAnalyticsReport]);

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
  const referenceProbability = useMemo(() => {
    if (!model || !hourProfile) return null;
    const referenceInputs: Record<string, number> = {};
    for (const [key, value] of Object.entries(hourProfile)) {
      const numeric = Number(value);
      if ((key.startsWith("CONT_") || key.startsWith("MET_")) && Number.isFinite(numeric)) referenceInputs[key] = numeric;
    }
    return predictForest(model, referenceInputs, hour);
  }, [hour, hourProfile, model]);
  const referenceBand = riskBand(referenceProbability ?? 0);
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
  const healthResult = useMemo(() => interpretHealthEvidence(ingredients), [ingredients]);
  const trafficMarkerPercent = selectedTrafficEmission
    ? trafficEmissionPosition(selectedTrafficEmission.rate, data?.geography.aermodStats.min ?? 0, data?.geography.aermodStats.max ?? 1) * 100
    : null;

  const toggleIngredient = useCallback((ingredient: string) => {
    setIngredients((current) => {
      if (current.includes(ingredient)) return current.filter((item) => item !== ingredient);
      return [...current, ingredient];
    });
  }, []);

  if (!data || !selectedPollutant) return <AppLoading error={error} />;

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
                showTrafficEmissions={showTrafficEmissions}
                selectedTrafficEmission={selectedTrafficEmission}
                showMonitoring={showMonitoring}
                showPlumes={showPlumes}
                mapStyle={mapStyle}
                view={mapView}
                historyFactor={historyFactor}
                onViewChange={setMapView}
                onSelectSite={(site) => setSelectedSiteId(site.id)}
                onSelectTrafficEmission={setSelectedTrafficEmission}
              />

              <div className="map-tools" aria-label="Capas del mapa">
                <Toggle active={showPlumes} label="Plumas" onClick={() => setShowPlumes((value) => !value)} />
                <Toggle active={showTraffic} label="Tráfico" onClick={() => setShowTraffic((value) => !value)} />
                <Toggle active={showTrafficEmissions} label="SO₂ tráfico" onClick={() => setShowTrafficEmissions((value) => !value)} />
                <Toggle active={showMonitoring} label="Muestreo" onClick={() => setShowMonitoring((value) => !value)} />
              </div>

              <div className="basemap-switch" aria-label="Mapa base">
                {(Object.keys(TILE_SOURCES) as (keyof typeof TILE_SOURCES)[]).map((style) => (
                  <button key={style} className={mapStyle === style ? "is-active" : ""} onClick={() => setMapStyle(style)}>
                    {TILE_SOURCES[style].label}
                  </button>
                ))}
              </div>

              {showTraffic ? (
                <aside className="traffic-context-panel" aria-label="Contexto de accesos y emisiones de tráfico">
                  <div className="traffic-context-head">
                    <span>Red vial reconstruida</span>
                    <strong>{data.geography.trafficAccesses.length} nodos</strong>
                  </div>
                  <div className="traffic-context-route"><b>Entradas</b><span>Checa / Chiquintad → Patamarca · Ricaurte → 25 de Marzo</span></div>
                  <div className="traffic-context-route"><b>Salidas</b><span>Centro → Las Américas · Norte → Panamericana / Autopista</span></div>
                  <div className="traffic-context-stat"><strong>{data.geography.passThroughEntryPct}%</strong><span>del tráfico de paso entra por Cornelio Vintimilla, conectado con Ricaurte.</span></div>
                  {showTrafficEmissions ? (
                    <div className="traffic-emission-key">
                      <div><span>SO₂ tráfico · escala logarítmica</span><b>{data.geography.aermodStats.points} puntos AERMOD</b></div>
                      <div className="traffic-emission-bar" aria-hidden="true">
                        {trafficMarkerPercent !== null ? <i style={{ left: `${trafficMarkerPercent}%` }} /> : null}
                      </div>
                      <div className="traffic-emission-ticks" aria-hidden="true">{[0, 5, 10, 15, 20, 25, 30].map((tick) => <span key={tick} style={{ left: `${trafficEmissionPosition(tick, data.geography.aermodStats.min, data.geography.aermodStats.max) * 100}%` }}>{tick}</span>)}</div>
                      <small className="traffic-emission-unit">Tasa de emisión (g/s)</small>
                      <strong className="traffic-emission-selection" aria-live="polite">
                        {selectedTrafficEmission
                          ? `Punto ${selectedTrafficEmission.index + 1} · ${compactNumber(selectedTrafficEmission.rate, 2)} g/s`
                          : "Selecciona un punto del mapa"}
                      </strong>
                    </div>
                  ) : null}
                </aside>
              ) : null}

              <div className="map-extent-actions" aria-label="Vistas analíticas del mapa">
                <button type="button" onClick={() => {
                  const longitudes = data.geography.aermodPoints.map((point) => point.lon);
                  const latitudes = data.geography.aermodPoints.map((point) => point.lat);
                  setShowTrafficEmissions(true);
                  setMapView({
                    lon: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
                    lat: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
                    zoom: 10,
                  });
                }}><span>Campo AERMOD</span><b>{data.geography.aermodStats.points} puntos reales</b></button>
                <button type="button" onClick={() => {
                  setActiveMixtureReport(null);
                  setActiveAnalyticsReport("air");
                }}><span>Informe atmosférico</span><b>Abrir página ↗</b></button>
              </div>

              <div className="map-navigation" aria-label="Navegación del mapa">
                <button onClick={() => setMapView((current) => ({ ...current, zoom: Math.min(18, current.zoom + 1) }))} aria-label="Acercar">+</button>
                <button onClick={() => setMapView((current) => ({ ...current, zoom: Math.max(9, current.zoom - 1) }))} aria-label="Alejar">−</button>
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
                <span><i className="legend-factory" /> {data.industrial.sites.length} fuentes · todas con pluma</span>
                <span><i className="legend-monitor" /> 10 puntos de muestreo</span>
                <span><i className="legend-route" /> Flujo 24 h sobre calles</span>
                <span><i className="legend-traffic-emission" /> SO₂ tráfico AERMOD</span>
              </div>

              <div className="map-attribution">{TILE_SOURCES[mapStyle].attribution} · vías OSM · nodos reconstruidos de la guía</div>
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
                  <label>Lectura<select value={historyPrimary?.key} onChange={(event) => setHistoryA(event.target.value)}>{historySlices.map((slice) => <option key={slice.key} value={slice.key}>{historicalLabel(slice, historyDimension)}</option>)}</select></label>
                  <span className="history-versus">vs</span>
                  <label>Comparar<select value={historyComparison?.key} onChange={(event) => setHistoryB(event.target.value)}>{historySlices.map((slice) => <option key={slice.key} value={slice.key}>{historicalLabel(slice, historyDimension)}</option>)}</select></label>
                  <div className="history-result"><strong>{compactNumber(historyPrimaryValue, selectedPollutant.label === "CO" ? 2 : 1)} {selectedPollutant.unit}</strong><span>{historyDelta >= 0 ? "+" : ""}{compactNumber(historyDelta, 0)}% frente a {historicalLabel(historyComparison, historyDimension)}</span></div>
                  {historyDimension === "seasonal" ? <p className="seasonal-context">Cuenca está en el hemisferio sur. Las estaciones afectan la dispersión de contaminantes y la actividad industrial.</p> : null}
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
                  <div><small>mediana</small><strong>{referenceProbability === null ? "—" : `${Math.round(referenceProbability * 100)}%`}</strong><span>{referenceBand.label}</span></div>
                </div>
                <small>2022–2026 · {String(hour).padStart(2, "0")}:00</small>
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
            <p className="risk-note"><i style={{ background: band.color }} />{band.note}<span> Referencia histórica: mediana de cada hora entre 2022 y 2026.</span></p>

            <div className="scenario-inputs">
              <div className="scenario-title"><span>Escenario atmosférico</span><button onClick={() => {
                const defaults: Record<string, number> = {};
                data.pollutants.forEach((pollutant) => defaults[pollutant.feature] = pollutant.median);
                defaults.MET_TEMP = 15.4; defaults.MET_HUM = 69.4; defaults.MET_PRES = 75645;
                setInputs(defaults);
              }}>Restablecer</button></div>
              {SCENARIO_GROUPS.map((group) => (
                <details className="scenario-group" key={group.label} open>
                  <summary><span>{group.label}</span><small>{group.items.length}</small></summary>
                  <div className="scenario-group-controls">
                    {group.items.map((label) => data.pollutants.find((pollutant) => pollutant.label === label)).filter((pollutant): pollutant is Pollutant => Boolean(pollutant)).map((pollutant) => (
                      <label key={pollutant.feature}>
                        <span><strong>{pollutant.label} — {POLLUTANT_NAMES[pollutant.label]}</strong><b>{compactNumber(inputs[pollutant.feature] ?? pollutant.median, pollutant.label === "CO" ? 2 : 1)} {pollutant.unit}</b></span>
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
                    {group.label.startsWith("Contaminantes") ? (
                      <div className="scenario-unmodeled"><strong>NO — monóxido de nitrógeno</strong><small>Contexto químico; no existe una serie independiente para controlarlo en este modelo RF.</small></div>
                    ) : null}
                  </div>
                </details>
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
              {INGREDIENT_GROUPS.map((section) => (
                <details className="ingredient-group" key={section.label} open>
                  <summary><span>{section.label}</span><small>{INGREDIENTS.filter((ingredient) => ingredient.group === section.group).length}</small></summary>
                  <div>
                    {INGREDIENTS.filter((ingredient) => ingredient.group === section.group).map((ingredient) => (
                      <button key={ingredient.label} className={ingredients.includes(ingredient.label) ? "is-selected" : ""} onClick={() => toggleIngredient(ingredient.label)}>
                        <i /><span className="ingredient-name"><strong>{ingredient.label}{POLLUTANT_NAMES[ingredient.label] ? ` — ${POLLUTANT_NAMES[ingredient.label]}` : ""}</strong></span><span>{ingredients.includes(ingredient.label) ? "−" : "+"}</span>
                      </button>
                    ))}
                  </div>
                </details>
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
            <div className="report-links" aria-label="Informes de la mezcla">
              <button type="button" onClick={() => setActiveMixtureReport("science")}><span><small>Informe 01</small><b>Explicación científica completa</b></span><i aria-hidden="true">→</i></button>
              <button type="button" onClick={() => setActiveMixtureReport("origin")}><span><small>Informe 02</small><b>Origen local y efecto en salud</b></span><i aria-hidden="true">→</i></button>
              <button type="button" onClick={() => setActiveMixtureReport("impact")}><span><small>Informe 03</small><b>Impacto integrado de la mezcla</b></span><i aria-hidden="true">→</i></button>
            </div>
            <button className="primary-action" onClick={() => {
              setSelectedPollutantLabel(mixResult.mapPollutant);
              document.getElementById("laboratorio")?.scrollIntoView({ behavior: "smooth" });
            }}>Proyectar en el mapa <span>↗</span></button>
          </div>
        </div>

        <div className="analytics-launch-block" aria-labelledby="analytics-launch-title">
          <header>
            <div><p className="panel-kicker">Biblioteca analítica</p><h3 id="analytics-launch-title">Cuatro informes para explorar sin letra pequeña.</h3></div>
            <p>Cada opción abre una página secundaria de lectura cómoda. Verás un solo gráfico grande a la vez, controles claros, explicación completa y fuentes verificables.</p>
          </header>
          <div className="analytics-launch-grid">
            {([
              { kind: "air", number: "04", title: "Gases, partículas y meteorología", detail: "6 módulos · series, distribución, ciclos y correlaciones", accent: "#55bfae" },
              { kind: "industry", number: "05", title: "Actividad industrial", detail: "7 módulos · inventario, emisiones, métodos y fuentes", accent: "#df7055" },
              { kind: "traffic", number: "06", title: "Tráfico y movilidad", detail: "4 módulos · huella, diagnóstico, deseos y matriz O–D", accent: "#8e70c6" },
              { kind: "model", number: "07", title: "Modelo de predicción", detail: "4 módulos · evaluación, variables, umbrales y validación", accent: "#e0b63f" },
            ] as { kind: AnalyticsReportKind; number: string; title: string; detail: string; accent: string }[]).map((item) => (
              <button key={item.kind} type="button" style={{ "--analytics-accent": item.accent } as React.CSSProperties} onClick={() => {
                setActiveMixtureReport(null);
                setActiveAnalyticsReport(item.kind);
              }}>
                <span>{item.number}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <i aria-hidden="true">Abrir informe →</i>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">A//C</span><span><strong>Aire Cuenca</strong><small>Laboratorio atmosférico</small></span></div>
        <p>Simulación educativa y analítica. No sustituye una alerta oficial de calidad del aire.</p>
        <a href="#laboratorio">Volver al mapa ↑</a>
      </footer>
      {activeMixtureReport ? <MixtureReportPage kind={activeMixtureReport} ingredients={ingredients} mixResult={mixResult} healthResult={healthResult} onClose={() => setActiveMixtureReport(null)} /> : null}
      {activeAnalyticsReport ? <AnalyticsReportPage kind={activeAnalyticsReport} data={data} onClose={() => setActiveAnalyticsReport(null)} /> : null}
    </main>
  );
}
