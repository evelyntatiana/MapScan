"use client";

import { useMemo, useState, type ReactNode } from "react";

type Row = Record<string, string | number | boolean | null>;

type Pollutant = {
  label: string;
  feature: string;
  unit: string;
  color: string;
};

type HistorySlice = {
  key: string;
  label: string;
  values: Record<string, { median: number; mean: number; p90: number; count: number }>;
};

type AnalyticsData = {
  meta: {
    periodStart: string;
    periodEnd: string;
    predictionHorizonHours: number;
    pm25Threshold: number;
    originalFeatures: number;
    enrichedFeatures: number;
    trainingRows: number;
    trees: number;
    metrics: Record<string, number>;
    baseMetrics: Record<string, number>;
  };
  pollutants: Pollutant[];
  hourlyProfile: Row[];
  dailyAir: Row[];
  historical: Record<"annual" | "seasonal" | "monthly" | "weekly", HistorySlice[]>;
  geography: {
    aermodStats: { points: number; min: number; median: number; p90: number; p95: number; max: number; inventoryPeriod: string; method: string; directMeasurement: boolean };
    passThroughEntryPct: number;
  };
  industrial: {
    sites: {
      name: string;
      lon: number;
      lat: number;
      source: string;
      category: string;
      equipment: string;
      emissionRate: number;
      so2Concentration: number | null;
      exitVelocity: number;
      stackDiameter: number;
      stackHeight: number | null;
      outletTemperature: number | null;
      emissions: Record<string, number | null>;
    }[];
    topStateLoads: Row[];
    stateCoordinateSources: Row[];
    equipment: Row[];
  };
  traffic: {
    modal: Row[];
    fleet: Row[];
    carbon: Row[];
    od: Row[];
    parking: Row[];
    desireLines: Row[];
    problems: Row[];
    strategies: Row[];
  };
  topFeatures: { Feature: string; Importance: number }[];
};

export type AnalyticsReportKind = "air" | "industry" | "traffic" | "model";

type ModuleDefinition = {
  id: string;
  number: string;
  title: string;
  short: string;
  purpose: string;
  axes: string;
  units: string;
  colors: string;
  marks: string;
  local: string;
  limitation: string;
};

type ChartPoint = { label: string; value: number };
type BarPoint = ChartPoint & { color?: string; note?: string };

const REPORTS: Record<AnalyticsReportKind, { number: string; eyebrow: string; title: string; intro: string; modules: ModuleDefinition[] }> = {
  air: {
    number: "04",
    eyebrow: "Gases, partículas y meteorología",
    title: "Atlas temporal de la atmósfera",
    intro: "Explora por separado la evolución, distribución, ciclos y relaciones estadísticas de siete contaminantes y tres variables meteorológicas. Cada vista conserva sus unidades y declara sus vacíos.",
    modules: [
      { id: "daily", number: "01", title: "Serie temporal completa", short: "Evolución diaria", purpose: "Reconocer cambios, episodios y vacíos a lo largo de todo el archivo disponible.", axes: "X: fecha civil. Y: promedio diario de la variable seleccionada.", units: "La unidad cambia con el contaminante y se indica junto al eje.", colors: "La línea adopta el color documental de cada contaminante; el umbral PM₂.₅ se marca en coral.", marks: "Los puntos destacados corresponden al mínimo y máximo visibles; las interrupciones de cobertura no se convierten en ceros.", local: "La lectura reúne la estación y los archivos históricos integrados para Cuenca entre 2016 y 2026, según disponibilidad de cada variable.", limitation: "Es un resumen diario de datos históricos, no monitoreo en vivo. Un pico no demuestra por sí solo una fuente concreta." },
      { id: "box", number: "02", title: "Distribución anual", short: "Caja y bigotes", purpose: "Comparar centro, dispersión y valores extremos por año sin reducir la historia a un promedio.", axes: "X: año. Y: distribución de promedios diarios; caja Q1–Q3, línea mediana y bigotes mínimo–máximo.", units: "La unidad corresponde a la variable elegida.", colors: "Caja turquesa, mediana amarilla y bigotes gris petróleo.", marks: "La etiqueta n informa cuántos días válidos entran en cada caja; años sin registros no aparecen.", local: "Permite distinguir años estables de años heterogéneos en la serie de Cuenca.", limitation: "Los bigotes muestran extremos observados, no un criterio automático de atípicos; la cobertura desigual puede cambiar la forma de la caja." },
      { id: "hour", number: "03", title: "Patrón horario", short: "Ciclo de 24 horas", purpose: "Detectar las horas en que la mediana histórica sube o baja.", axes: "X: hora local de Ecuador continental. Y: mediana histórica por hora.", units: "La unidad corresponde al contaminante seleccionado.", colors: "Línea del contaminante y guía amarilla en la hora de mayor valor.", marks: "La hora pico se rotula directamente sobre el gráfico.", local: "El perfil ayuda a relacionar el ciclo diario con movilidad, actividad productiva y estabilidad atmosférica del valle.", limitation: "Una mediana horaria combina temporadas y años; describe patrón, no pronóstico de un día específico." },
      { id: "weather", number: "04", title: "Meteorología", short: "Temperatura, humedad y presión", purpose: "Observar cómo cambian las condiciones que favorecen ventilación, transformación o acumulación.", axes: "X: fecha. Y: promedio diario de temperatura, humedad relativa o presión.", units: "°C, % o Pa según el selector.", colors: "Azul para temperatura, violeta para humedad y amarillo oscuro para presión.", marks: "Se indican el promedio y los extremos de la vista.", local: "La topografía de Cuenca vuelve relevantes la estabilidad, la humedad y la ventilación para interpretar episodios.", limitation: "Estas variables modulan la contaminación, pero no prueban causalidad. Viento y radiación no tienen cobertura homogénea en este archivo exportado." },
      { id: "patterns", number: "05", title: "Patrones estacionales", short: "Mes, semana y estación", purpose: "Comparar medianas, promedios o percentiles altos entre periodos equivalentes.", axes: "X: agrupación temporal seleccionada. Y: estadístico histórico.", units: "Unidad del contaminante; el selector define mediana, media o P90.", colors: "Barras turquesa y resalte amarillo para el periodo de mayor valor.", marks: "Cada barra incluye su valor y el número de observaciones subyacentes en la explicación.", local: "La comparación hace visibles ciclos ligados a lluvia, radiación, horarios laborales y tráfico.", limitation: "Las agrupaciones no controlan cambios de instrumento, cobertura o tendencia de largo plazo." },
      { id: "correlation", number: "06", title: "Correlaciones", short: "Contaminantes + clima", purpose: "Examinar qué variables se mueven juntas antes de formular hipótesis causales.", axes: "Filas y columnas: variables seleccionadas. Celda: coeficiente de Pearson pareado.", units: "Coeficiente adimensional de −1 a +1.", colors: "Coral indica relación negativa, papel indica cercanía a cero y turquesa relación positiva.", marks: "Cada celda lleva el coeficiente; la diagonal vale 1,00.", local: "La matriz unificada ayuda a identificar firmas compartidas en los datos históricos de Cuenca.", limitation: "Correlación no implica causalidad. Se calcula por pares con días válidos y puede mezclar estacionalidad, autocorrelación o cambios de cobertura." },
    ],
  },
  industry: {
    number: "05",
    eyebrow: "Actividad industrial",
    title: "Inventario y anatomía de las fuentes",
    intro: "Concentra el inventario georreferenciado, las cargas por empresa y rubro, las condiciones físicas de salida y los resultados de estudios universitarios sin presentar las simulaciones como medición directa.",
    modules: [
      { id: "inventory", number: "01", title: "Inventario y distribución", short: "Fuentes por actividad", purpose: "Contar fuentes y reconocer las actividades representadas en el inventario integrado.", axes: "X: número de fuentes georreferenciadas. Y: categoría de actividad.", units: "Fuentes inventariadas.", colors: "Turquesa para el recuento y amarillo para la categoría predominante.", marks: "El número al final de cada barra es el conteo exacto.", local: "El conjunto combina 32 registros UPS (2015) y 10 fuentes UCuenca (2018).", limitation: "Los años, alcances y criterios de ambos estudios son distintos; el conteo no equivale a una lista vigente de permisos o establecimientos activos." },
      { id: "loads", number: "02", title: "Emisiones por empresa y rubro", short: "CO, NOx, SO₂ y total", purpose: "Comparar las cargas del inventario estatal por empresa o actividad.", axes: "X: carga en g/s. Y: empresa anonimizada y rubro.", units: "Gramos por segundo (g/s).", colors: "Un color por contaminante; el total usa amarillo.", marks: "Las barras muestran los mayores registros disponibles; la etiqueta conserva empresa y rubro.", local: "El mayor aporte del conjunto estatal se concentra en pocos rubros de combustión industrial.", limitation: "Las empresas están anonimizadas en el archivo analítico. Las cargas son inventario/modelación, no lectura instantánea de chimenea." },
      { id: "distribution", number: "03", title: "Distribución de emisiones", short: "Histograma de cargas", purpose: "Mostrar asimetría y concentración de cargas sin ocultar fuentes pequeñas.", axes: "X: intervalos de tasa de emisión. Y: número de fuentes dentro de cada intervalo.", units: "g/s en X; fuentes en Y.", colors: "Coral para frecuencia y amarillo en el intervalo con más fuentes.", marks: "Los intervalos se calculan sobre valores válidos; se informa n.", local: "La distribución permite ver si la carga está repartida o dominada por pocos emisores.", limitation: "El rango puede estar dominado por valores extremos; cambiar de contaminante cambia la población válida." },
      { id: "software", number: "04", title: "Cobertura de métodos y software", short: "Screen View, Disper y AERMOD", purpose: "Distinguir qué aporta cada paquete analítico antes de comparar resultados.", axes: "X: registros o puntos documentados. Y: estudio/método de origen.", units: "Cobertura documental, no concentración.", colors: "Violeta para estudios de concentración, turquesa para inventario y amarillo para el campo AERMOD.", marks: "Las etiquetas separan fuentes georreferenciadas de puntos del campo de dispersión.", local: "UPS empleó Screen View 3; UCuenca documentó Disper 5.2; el proyecto integra además 361 puntos AERMOD.", limitation: "No se grafican magnitudes incompatibles como si fueran equivalentes. Esta vista compara cobertura; la validación de software requiere escenarios de entrada idénticos." },
      { id: "physical", number: "05", title: "Características físicas", short: "Chimenea y gases", purpose: "Comparar altura, diámetro, velocidad o temperatura de salida por fuente.", axes: "X: magnitud física seleccionada. Y: fuente industrial.", units: "m, m/s o °C según el selector.", colors: "Azul petróleo, con amarillo para el valor mayor de la vista.", marks: "Solo se incluyen registros válidos y se conserva el nombre de la fuente.", local: "Estas variables condicionan el ascenso inicial de la pluma y su dispersión en el entorno industrial.", limitation: "Altura o velocidad alta no significan automáticamente mayor impacto; deben analizarse junto con carga, meteorología y receptor." },
      { id: "types", number: "06", title: "Emisiones por tipo de fuente", short: "Hornos, calderos y otros", purpose: "Relacionar cantidad de equipos con la carga total asociada.", axes: "X: carga total en g/s. Y: tipo de equipo.", units: "g/s; la etiqueta también informa número de fuentes.", colors: "Coral para carga y una marca turquesa para cantidad.", marks: "Cada fila rotula carga y número de fuentes.", local: "El inventario resume el peso relativo de hornos, calderos y otros equipos de combustión.", limitation: "Una categoría agrupa equipos de tamaños y combustibles diferentes; el total no describe desempeño individual." },
      { id: "emitters", number: "07", title: "Principales emisores y relación espacial", short: "Regresión o mapa", purpose: "Examinar emisores altos y la relación entre tasa de SO₂ y concentración modelada, o su distribución geográfica.", axes: "Regresión: X tasa de emisión, Y concentración modelada. Mapa: X longitud, Y latitud.", units: "g/s y µg/m³; grados decimales en la vista espacial.", colors: "Coral para fuentes y amarillo para la tendencia; color no expresa cumplimiento legal.", marks: "Cada punto identifica una fuente al pasar el cursor; la recta es un ajuste descriptivo.", local: "La vista espacial conecta el inventario con el Mapa maestro del Parque Industrial.", limitation: "Concentración y emisión no son intercambiables. La regresión es exploratoria y no sustituye modelación de dispersión con meteorología y topografía." },
    ],
  },
  traffic: {
    number: "06",
    eyebrow: "Tráfico y movilidad",
    title: "Demanda, huella y oportunidades",
    intro: "Ordena el diagnóstico EMES en cuatro lecturas: reparto modal y flota, problemas y tráfico de paso, líneas de deseo y estacionamiento, y matriz origen–destino con estrategias.",
    modules: [
      { id: "modal", number: "01", title: "Movilidad, flota y carbono", short: "Reparto modal", purpose: "Comparar modos de viaje y dimensionar la huella anual asociada a los desplazamientos laborales.", axes: "X: porcentaje de viajes. Y: modo de transporte.", units: "% del reparto modal; cifras de flota y CO₂ se explican debajo.", colors: "Turquesa para modos sostenibles, coral para motorizados y amarillo para el mayor porcentaje.", marks: "Cada barra indica el porcentaje original del conjunto.", local: "El diagnóstico estima 19.329 viajes laborales diarios y 14.699,60 t CO₂/año.", limitation: "Las cifras provienen del estudio EMES (2019) y de supuestos de movilidad; no representan aforo o inventario 2026 en tiempo real." },
      { id: "problems", number: "02", title: "Problemas, FODA y tráfico de paso", short: "Diagnóstico priorizado", purpose: "Mostrar qué ejes concentraron más problemas seleccionados y contextualizar la entrada de tráfico de paso.", axes: "X: problemas seleccionados. Y: eje temático.", units: "Número de problemas; el porcentaje de paso se informa como indicador independiente.", colors: "Violeta para diagnóstico y amarillo para el eje más seleccionado.", marks: "La etiqueta muestra seleccionados frente a explorados cuando el archivo lo permite.", local: "El 74,2% del tráfico de paso documentado entra por Cornelio Vintimilla, conectado con Ricaurte.", limitation: "Un FODA recoge diagnóstico participativo y no es una medición de exposición. El porcentaje describe el estudio original." },
      { id: "desire", number: "03", title: "Líneas de deseo y estacionamiento", short: "Movimientos internos", purpose: "Resumir intensidad de desplazamientos por modo y capacidad de estacionamiento documentada.", axes: "X: número de relaciones registradas. Y: modo de desplazamiento.", units: "Relaciones cualitativas; las plazas se presentan aparte.", colors: "Azul para relaciones y amarillo para el modo más frecuente.", marks: "Cada relación conserva intensidad alta, media o baja en el recuento explicado.", local: "La vista ayuda a localizar oportunidades para caminar, pedalear y ordenar el estacionamiento dentro de la unidad funcional.", limitation: "Las líneas son relaciones cualitativas, no volúmenes de personas; no deben sumarse como viajes observados." },
      { id: "od", number: "04", title: "Matriz origen–destino y estrategias", short: "18 zonas de origen", purpose: "Comparar el peso modal estimado de las zonas que alimentan el Parque Industrial.", axes: "Filas: zona de origen. Columnas: modo. Celda: viajes laborales estimados.", units: "Viajes/día estimados.", colors: "Papel para cero y turquesa creciente para mayor flujo; los números son valores exactos.", marks: "La matriz incluye las 18 zonas del archivo y cinco modos principales.", local: "El Valle, Monay y Totoracocha aparecen entre los orígenes de mayor demanda estimada.", limitation: "Es una matriz modelada, no rastreo individual. Las estrategias son propuestas del estudio y requieren evaluación operativa antes de aplicarse." },
    ],
  },
  model: {
    number: "07",
    eyebrow: "Modelo de predicción",
    title: "Rendimiento, variables y alertas",
    intro: "Separa de forma explícita el Random Forest base del cuaderno y el modelo enriquecido que alimenta la experiencia interactiva. Ambos predicen riesgo de PM₂.₅ a seis horas, pero no comparten el mismo espacio de variables.",
    modules: [
      { id: "performance", number: "01", title: "Evaluación del modelo", short: "Base vs. enriquecido", purpose: "Comparar métricas comunes sin mezclar corridas ni presentar la mejora como una validación externa.", axes: "X: métrica. Y: puntuación de 0 a 1.", units: "Proporción adimensional.", colors: "Gris para el cuaderno base y turquesa para el modelo enriquecido.", marks: "Cada barra rotula el valor; precisión y recall base se documentan en la explicación.", local: "El objetivo es anticipar PM₂.₅ > 15 µg/m³ con seis horas de horizonte.", limitation: "Son evaluaciones internas sobre particiones históricas. No equivalen a desempeño prospectivo ni a una alerta oficial." },
      { id: "features", number: "02", title: "Importancia de variables", short: "Detalle o categoría", purpose: "Reconocer qué señales utiliza más el bosque y agruparlas por familia para evitar una lista opaca.", axes: "X: importancia relativa. Y: variable o categoría.", units: "Importancia normalizada del Random Forest.", colors: "Amarillo accesible reemplaza el verde solicitado en el documento; el fondo conserva alto contraste.", marks: "Se muestran las variables principales o la suma por categoría.", local: "La lectura evidencia el peso de partículas, rezagos, ciclos y meteorología en el modelo enriquecido.", limitation: "Importancia no prueba causalidad; variables correlacionadas pueden repartirse o intercambiar su peso." },
      { id: "thresholds", number: "03", title: "Umbrales y alertas", short: "Precisión vs. recall", purpose: "Hacer visible el costo de bajar o subir el umbral operativo.", axes: "X: umbral de probabilidad. Y: precisión y recall.", units: "Proporciones de 0 a 1; etiquetas con número de alertas.", colors: "Turquesa para recall, coral para precisión y amarillo para 0,40 recomendado.", marks: "El umbral 0,40 queda sombreado; la tabla inferior conserva TP, FP y FN.", local: "El umbral operativo prioriza detectar episodios sin saturar por completo las alertas.", limitation: "El balance depende de prevalencia, costos y población usuaria. Debe recalibrarse con datos posteriores y gobernanza de alertas." },
      { id: "validation", number: "04", title: "Validación temporal", short: "Cinco pliegues", purpose: "Comprobar si el desempeño cambia cuando el entrenamiento siempre antecede al periodo evaluado.", axes: "X: pliegue temporal. Y: AUC-ROC.", units: "Puntuación adimensional de 0 a 1.", colors: "Línea amarilla y promedio turquesa punteado.", marks: "Cada pliegue se rotula; la media base es 0,7877.", local: "La secuencia temporal es más realista que mezclar aleatoriamente pasado y futuro.", limitation: "Cinco pliegues no capturan todos los cambios de instrumento, clima o actividad. La validación sigue siendo histórica." },
    ],
  },
};

const SOURCE_LINKS: Record<AnalyticsReportKind, { label: string; detail: string; url?: string }[]> = {
  air: [
    { label: "EMOV EP · Red de monitoreo de calidad del aire", detail: "Información oficial y contexto de la estación", url: "https://caire.emov.gob.ec/informacion" },
    { label: "EMOV EP · Informes de calidad del aire", detail: "Repositorio de informes locales", url: "https://caire.emov.gob.ec/informes" },
    { label: "IERSE · Meteorología continua", detail: "Universidad del Azuay", url: "https://ierse.uazuay.edu.ec/proyectos/meteorologia-continua/" },
  ],
  industry: [
    { label: "Molina Arízaga & Jiménez Bueno (2015)", detail: "Tesis UPS sobre concentración de SO₂ en el Parque Industrial", url: "https://dspace.ups.edu.ec/handle/123456789/8021" },
    { label: "Avilés Flores & Rivera Banegas (2018)", detail: "Tesis UCuenca sobre dispersión de contaminantes", url: "https://dspace.ucuenca.edu.ec/items/2e7e9162-d433-4a1b-a711-2a6f8aadce91/full" },
  ],
  traffic: [
    { label: "Proyecto EMES (2019)", detail: "Informe técnico de movilidad empresarial sostenible", url: "https://cajarecursosdus.lideresparagobernar.org/uploads/content/documentos/informe_tecnicoproyectoemes_1618803891.pdf" },
    { label: "UCUENCA EP · Estrategias de movilidad", detail: "Ficha institucional del proyecto", url: "https://ucuencaep.com.ec/estrategias-de-movilidad-empresarial-sostenible-a-partir-del-analisis-de-movilidad-y-huella-de-carbono-generada-por-desplazamientos-de-los-trabajadores-del-parque-industrial-de-cuenca/" },
  ],
  model: [
    { label: "Tenecela & Criollo · Cuaderno de modelado", detail: "Random Forest reproducible incluido en el proyecto Aire Cuenca" },
    { label: "Datos de origen EMOV EP + IERSE", detail: "Serie histórica usada por el flujo de preparación" },
  ],
};

const BASE_THRESHOLDS = [
  { threshold: 0.3, alerts: 1159, tp: 651, fp: 508, fn: 28, precision: 0.562, recall: 0.959, f1: 0.708 },
  { threshold: 0.4, alerts: 931, tp: 583, fp: 348, fn: 96, precision: 0.626, recall: 0.859, f1: 0.724 },
  { threshold: 0.5, alerts: 686, tp: 472, fp: 214, fn: 207, precision: 0.688, recall: 0.695, f1: 0.692 },
  { threshold: 0.6, alerts: 491, tp: 375, fp: 116, fn: 304, precision: 0.764, recall: 0.552, f1: 0.641 },
  { threshold: 0.7, alerts: 323, tp: 268, fp: 55, fn: 411, precision: 0.83, recall: 0.395, f1: 0.535 },
];

const TEMPORAL_AUC = [0.71, 0.782, 0.793, 0.856, 0.797];
const POLLUTANT_NAMES: Record<string, string> = { CONT_CO: "CO", CONT_NO2: "NO₂", CONT_OZONE: "O₃", CONT_SO2: "SO₂", CONT_PM1: "PM₁", CONT_PM10: "PM₁₀", CONT_PM25: "PM₂.₅" };
const METEOROLOGY = [
  { feature: "MET_TEMP", label: "Temperatura", unit: "°C", color: "#397fb0" },
  { feature: "MET_HUM", label: "Humedad relativa", unit: "%", color: "#8f73c9" },
  { feature: "MET_PRES", label: "Presión", unit: "Pa", color: "#a87613" },
];

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("es-EC", { maximumFractionDigits: digits }).format(value);
}

function shorten(value: string, limit = 36) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function samplePoints(points: ChartPoint[], limit = 620) {
  if (points.length <= limit) return points;
  const step = (points.length - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * step)]);
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function pearson(rows: Row[], featureA: string, featureB: string) {
  const pairs = rows.map((row) => [numberValue(row[`${featureA}_mean`]), numberValue(row[`${featureB}_mean`])]).filter((pair): pair is [number, number] => pair[0] !== null && pair[1] !== null);
  if (pairs.length < 3) return 0;
  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  pairs.forEach(([a, b]) => {
    numerator += (a - meanA) * (b - meanB);
    denominatorA += (a - meanA) ** 2;
    denominatorB += (b - meanB) ** 2;
  });
  return denominatorA && denominatorB ? numerator / Math.sqrt(denominatorA * denominatorB) : 0;
}

function ChartShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <figure className="analytics-chart-shell"><figcaption><strong>{title}</strong><span>{subtitle}</span></figcaption>{children}</figure>;
}

function LineChart({ points, color, unit, reference, referenceLabel, average, secondary, highlightIndex, highlightLabel }: { points: ChartPoint[]; color: string; unit: string; reference?: number; referenceLabel?: string; average?: number; secondary?: { points: ChartPoint[]; color: string; label: string }; highlightIndex?: number; highlightLabel?: string }) {
  const sampled = samplePoints(points);
  const secondarySampled = secondary ? samplePoints(secondary.points) : [];
  const values = [...sampled.map((point) => point.value), ...secondarySampled.map((point) => point.value)];
  if (reference !== undefined) values.push(reference);
  if (average !== undefined) values.push(average);
  if (!values.length) return <div className="analytics-empty">No hay registros válidos para esta combinación.</div>;
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.1, Math.abs(rawMax) * 0.02, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const width = 1000;
  const height = 470;
  const left = 86;
  const right = 34;
  const top = 34;
  const bottom = 70;
  const x = (index: number, length: number) => left + (index / Math.max(1, length - 1)) * (width - left - right);
  const y = (value: number) => top + ((max - value) / (max - min || 1)) * (height - top - bottom);
  const makePath = (series: ChartPoint[]) => series.map((point, index) => `${index ? "L" : "M"}${x(index, series.length).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * (index / 4));
  const maxPoint = sampled.reduce((best, point) => point.value > best.value ? point : best, sampled[0]);
  return (
    <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico de líneas con ${points.length} valores en ${unit}`}>
      {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="analytics-gridline" /><text x={left - 14} y={y(tick) + 5} textAnchor="end" className="analytics-axis-text">{formatNumber(tick, Math.abs(max) < 10 ? 2 : 1)}</text></g>)}
      <text x={20} y={height / 2} transform={`rotate(-90 20 ${height / 2})`} textAnchor="middle" className="analytics-axis-title">{unit}</text>
      {reference !== undefined ? <g><line x1={left} x2={width - right} y1={y(reference)} y2={y(reference)} className="analytics-reference-line" /><text x={width - right} y={y(reference) - 9} textAnchor="end" className="analytics-reference-text">{referenceLabel || formatNumber(reference)}</text></g> : null}
      {highlightIndex !== undefined && sampled[highlightIndex] ? <g><line x1={x(highlightIndex, sampled.length)} x2={x(highlightIndex, sampled.length)} y1={top} y2={height - bottom} className="analytics-highlight-line" /><text x={x(highlightIndex, sampled.length) + 9} y={top + 18} className="analytics-highlight-text">{highlightLabel || sampled[highlightIndex].label}</text></g> : null}
      {average !== undefined ? <line x1={left} x2={width - right} y1={y(average)} y2={y(average)} className="analytics-average-line" /> : null}
      <path d={makePath(sampled)} fill="none" stroke={color} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      {secondary && secondarySampled.length ? <path d={makePath(secondarySampled)} fill="none" stroke={secondary.color} strokeWidth="4" strokeDasharray="11 8" strokeLinejoin="round" /> : null}
      <circle cx={x(sampled.indexOf(maxPoint), sampled.length)} cy={y(maxPoint.value)} r="7" fill="#f7cf65"><title>Máximo: {maxPoint.label}, {formatNumber(maxPoint.value)} {unit}</title></circle>
      <text x={left} y={height - 28} className="analytics-axis-text">{sampled[0]?.label}</text>
      <text x={width - right} y={height - 28} textAnchor="end" className="analytics-axis-text">{sampled.at(-1)?.label}</text>
      {secondary ? <g transform={`translate(${left + 10} ${top + 8})`}><line x1="0" x2="34" y1="0" y2="0" stroke={color} strokeWidth="4" /><text x="44" y="5" className="analytics-legend-text">Precisión</text><line x1="145" x2="179" y1="0" y2="0" stroke={secondary.color} strokeWidth="4" strokeDasharray="8 5" /><text x="189" y="5" className="analytics-legend-text">{secondary.label}</text></g> : null}
    </svg>
  );
}

function HorizontalBars({ points, unit, maxRows = 14 }: { points: BarPoint[]; unit: string; maxRows?: number }) {
  const visible = points.slice(0, maxRows);
  if (!visible.length) return <div className="analytics-empty">No hay valores válidos para esta vista.</div>;
  const max = Math.max(...visible.map((point) => point.value), 0.0001);
  const rowHeight = 46;
  const height = 58 + visible.length * rowHeight;
  const left = 300;
  const right = 110;
  const width = 1000;
  return (
    <svg className="analytics-chart analytics-bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Gráfico de barras horizontales en ${unit}`}>
      {visible.map((point, index) => {
        const y = 30 + index * rowHeight;
        const barWidth = (point.value / max) * (width - left - right);
        return <g key={`${point.label}-${index}`}><text x={left - 16} y={y + 20} textAnchor="end" className="analytics-bar-label"><title>{point.label}</title>{shorten(point.label)}</text><rect x={left} y={y} width={width - left - right} height="26" rx="3" className="analytics-bar-track" /><rect x={left} y={y} width={Math.max(barWidth, 2)} height="26" rx="3" fill={point.color || "#55bfae"} /><text x={Math.min(left + barWidth + 10, width - 95)} y={y + 19} className="analytics-bar-value">{formatNumber(point.value, point.value < 10 ? 2 : 1)} {unit}</text>{point.note ? <text x={width - right + 4} y={y + 19} className="analytics-bar-note">{point.note}</text> : null}</g>;
      })}
    </svg>
  );
}

function BoxPlot({ groups, unit }: { groups: { label: string; min: number; q1: number; median: number; q3: number; max: number; n: number }[]; unit: string }) {
  if (!groups.length) return <div className="analytics-empty">No hay suficientes días válidos para construir cajas anuales.</div>;
  const width = 1000;
  const height = 500;
  const left = 80;
  const right = 30;
  const top = 35;
  const bottom = 78;
  const minValue = Math.min(...groups.map((group) => group.min));
  const maxValue = Math.max(...groups.map((group) => group.max));
  const pad = Math.max((maxValue - minValue) * 0.08, 0.2);
  const min = minValue - pad;
  const max = maxValue + pad;
  const y = (value: number) => top + ((max - value) / (max - min || 1)) * (height - top - bottom);
  const band = (width - left - right) / groups.length;
  const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  return <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Diagrama de cajas anual en ${unit}`}>
    {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="analytics-gridline" /><text x={left - 12} y={y(tick) + 5} textAnchor="end" className="analytics-axis-text">{formatNumber(tick, 1)}</text></g>)}
    {groups.map((group, index) => { const center = left + band * (index + 0.5); const boxWidth = Math.min(54, band * 0.55); return <g key={group.label}><line x1={center} x2={center} y1={y(group.min)} y2={y(group.max)} stroke="#496263" strokeWidth="3" /><line x1={center - boxWidth / 3} x2={center + boxWidth / 3} y1={y(group.min)} y2={y(group.min)} stroke="#496263" strokeWidth="3" /><line x1={center - boxWidth / 3} x2={center + boxWidth / 3} y1={y(group.max)} y2={y(group.max)} stroke="#496263" strokeWidth="3" /><rect x={center - boxWidth / 2} y={y(group.q3)} width={boxWidth} height={Math.max(3, y(group.q1) - y(group.q3))} fill="#62cdbb" fillOpacity=".72" stroke="#275e59" strokeWidth="2" /><line x1={center - boxWidth / 2} x2={center + boxWidth / 2} y1={y(group.median)} y2={y(group.median)} stroke="#f7cf65" strokeWidth="5" /><text x={center} y={height - 45} textAnchor="middle" className="analytics-axis-text">{group.label}</text><text x={center} y={height - 23} textAnchor="middle" className="analytics-sample-text">n={group.n}</text><title>{group.label}: mínimo {formatNumber(group.min)}, Q1 {formatNumber(group.q1)}, mediana {formatNumber(group.median)}, Q3 {formatNumber(group.q3)}, máximo {formatNumber(group.max)} {unit}</title></g>; })}
    <text x={20} y={height / 2} transform={`rotate(-90 20 ${height / 2})`} textAnchor="middle" className="analytics-axis-title">{unit}</text>
  </svg>;
}

function Heatmap({ labels, values }: { labels: string[]; values: number[][] }) {
  const width = 1000;
  const left = 190;
  const top = 145;
  const size = Math.min(72, (width - left - 32) / labels.length);
  const height = top + size * labels.length + 35;
  const color = (value: number) => value >= 0 ? `rgba(49, 157, 139, ${0.12 + Math.abs(value) * 0.82})` : `rgba(224, 103, 76, ${0.12 + Math.abs(value) * 0.82})`;
  return <svg className="analytics-chart analytics-heatmap" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Matriz de correlaciones de Pearson">
    {labels.map((label, index) => <g key={label}><text x={left - 14} y={top + index * size + size * 0.63} textAnchor="end" className="analytics-matrix-label">{label}</text><text x={left + index * size + size * 0.5} y={top - 13} transform={`rotate(-48 ${left + index * size + size * 0.5} ${top - 13})`} textAnchor="start" className="analytics-matrix-label">{label}</text></g>)}
    {values.map((row, rowIndex) => row.map((value, columnIndex) => <g key={`${rowIndex}-${columnIndex}`}><rect x={left + columnIndex * size} y={top + rowIndex * size} width={size - 3} height={size - 3} rx="3" fill={color(value)} /><text x={left + columnIndex * size + (size - 3) / 2} y={top + rowIndex * size + size * 0.58} textAnchor="middle" className="analytics-matrix-value">{formatNumber(value, 2)}</text></g>))}
    <g transform={`translate(${left} ${height - 12})`}><rect width="22" height="8" fill="rgba(224,103,76,.85)" /><text x="30" y="8" className="analytics-legend-text">−1 negativa</text><rect x="145" width="22" height="8" fill="rgba(49,157,139,.85)" /><text x="175" y="8" className="analytics-legend-text">+1 positiva</text></g>
  </svg>;
}

function MatrixChart({ rows, columns }: { rows: { label: string; values: number[] }[]; columns: string[] }) {
  const width = 1000;
  const left = 235;
  const top = 76;
  const cellWidth = (width - left - 24) / columns.length;
  const cellHeight = 35;
  const max = Math.max(...rows.flatMap((row) => row.values), 1);
  const height = top + rows.length * cellHeight + 32;
  return <svg className="analytics-chart analytics-od-matrix" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Matriz origen destino por modo">
    {columns.map((column, index) => <text key={column} x={left + index * cellWidth + cellWidth / 2} y={44} textAnchor="middle" className="analytics-matrix-label">{column}</text>)}
    {rows.map((row, rowIndex) => <g key={row.label}><text x={left - 12} y={top + rowIndex * cellHeight + 22} textAnchor="end" className="analytics-matrix-label">{shorten(row.label, 30)}</text>{row.values.map((value, columnIndex) => <g key={columnIndex}><rect x={left + columnIndex * cellWidth} y={top + rowIndex * cellHeight} width={cellWidth - 3} height={cellHeight - 3} rx="2" fill={`rgba(42, 157, 138, ${0.08 + value / max * 0.88})`} /><text x={left + columnIndex * cellWidth + (cellWidth - 3) / 2} y={top + rowIndex * cellHeight + 22} textAnchor="middle" className="analytics-matrix-value">{value}</text></g>)}</g>)}
  </svg>;
}

function ScatterChart({ points, xLabel, yLabel, xUnit, yUnit, spatial = false }: { points: { x: number; y: number; label: string; size?: number }[]; xLabel: string; yLabel: string; xUnit: string; yUnit: string; spatial?: boolean }) {
  if (points.length < 2) return <div className="analytics-empty">No hay suficientes pares válidos para esta relación.</div>;
  const width = 1000;
  const height = 500;
  const left = 96;
  const right = 36;
  const top = 35;
  const bottom = 86;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padX = Math.max((maxX - minX) * 0.08, 0.001);
  const padY = Math.max((maxY - minY) * 0.08, 0.001);
  const x = (value: number) => left + ((value - (minX - padX)) / ((maxX + padX) - (minX - padX))) * (width - left - right);
  const y = (value: number) => top + (((maxY + padY) - value) / ((maxY + padY) - (minY - padY))) * (height - top - bottom);
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const slope = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / (points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) || 1);
  const intercept = meanY - slope * meanX;
  return <svg className="analytics-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${spatial ? "Mapa de puntos" : "Diagrama de dispersión"}: ${xLabel} frente a ${yLabel}`}>
    {Array.from({ length: 5 }, (_, index) => index).map((index) => { const tickY = minY - padY + ((maxY + padY) - (minY - padY)) * index / 4; return <g key={`y-${index}`}><line x1={left} x2={width - right} y1={y(tickY)} y2={y(tickY)} className="analytics-gridline" /><text x={left - 12} y={y(tickY) + 5} textAnchor="end" className="analytics-axis-text">{formatNumber(tickY, spatial ? 4 : 1)}</text></g>; })}
    {Array.from({ length: 5 }, (_, index) => index).map((index) => { const tickX = minX - padX + ((maxX + padX) - (minX - padX)) * index / 4; return <text key={`x-${index}`} x={x(tickX)} y={height - 50} textAnchor="middle" className="analytics-axis-text">{formatNumber(tickX, spatial ? 4 : 1)}</text>; })}
    {!spatial ? <line x1={x(minX)} y1={y(intercept + slope * minX)} x2={x(maxX)} y2={y(intercept + slope * maxX)} stroke="#f7cf65" strokeWidth="4" strokeDasharray="10 7" /> : null}
    {points.map((point, index) => <circle key={`${point.label}-${index}`} cx={x(point.x)} cy={y(point.y)} r={Math.max(5, Math.min(13, point.size || 7))} fill="#e0674c" fillOpacity=".76" stroke="#fff" strokeWidth="1.5"><title>{point.label}: {formatNumber(point.x, 3)} {xUnit}; {formatNumber(point.y, 3)} {yUnit}</title></circle>)}
    <text x={(left + width - right) / 2} y={height - 16} textAnchor="middle" className="analytics-axis-title">{xLabel} ({xUnit})</text><text x="22" y={(top + height - bottom) / 2} transform={`rotate(-90 22 ${(top + height - bottom) / 2})`} textAnchor="middle" className="analytics-axis-title">{yLabel} ({yUnit})</text>
  </svg>;
}

function categoryForFeature(feature: string) {
  const normalized = feature.toUpperCase();
  if (normalized.includes("PM") || normalized.includes("CONT_")) return "Contaminantes";
  if (normalized.includes("MET_") || normalized.includes("TEMP") || normalized.includes("HUM") || normalized.includes("PRES")) return "Meteorología";
  if (normalized.includes("HORA") || normalized.includes("DIA") || normalized.includes("MES") || normalized.includes("SIN") || normalized.includes("COS")) return "Ciclos temporales";
  if (normalized.includes("LAG") || normalized.includes("ROLL") || normalized.includes("EMA")) return "Memoria y rezagos";
  return "Interacciones y otras";
}

export function AnalyticsReportPage({ kind, data, onClose }: { kind: AnalyticsReportKind; data: AnalyticsData; onClose: () => void }) {
  const report = REPORTS[kind];
  const [moduleId, setModuleId] = useState(report.modules[0].id);
  const [pollutantFeature, setPollutantFeature] = useState("CONT_PM25");
  const [weatherFeature, setWeatherFeature] = useState("MET_TEMP");
  const [historyDimension, setHistoryDimension] = useState<"annual" | "seasonal" | "monthly" | "weekly">("monthly");
  const [historyMetric, setHistoryMetric] = useState<"median" | "mean" | "p90">("median");
  const [correlationMode, setCorrelationMode] = useState<"pollutants" | "weather" | "all">("all");
  const [industryMetric, setIndustryMetric] = useState("Carga_Total_gs");
  const [physicalMetric, setPhysicalMetric] = useState<"stackHeight" | "stackDiameter" | "exitVelocity" | "outletTemperature">("stackHeight");
  const [emitterView, setEmitterView] = useState<"relation" | "spatial">("relation");
  const [featureView, setFeatureView] = useState<"detail" | "category">("detail");
  const activeModule = report.modules.find((item) => item.id === moduleId) || report.modules[0];
  const pollutant = data.pollutants.find((item) => item.feature === pollutantFeature) || data.pollutants[0];
  const weather = METEOROLOGY.find((item) => item.feature === weatherFeature) || METEOROLOGY[0];
  const reportPeriod = kind === "air"
    ? `${String(data.dailyAir[0]?.Fecha || "2016")}—${String(data.dailyAir.at(-1)?.Fecha || "2026")}`
    : kind === "industry"
      ? "Estudios 2015 + 2018"
      : kind === "traffic"
        ? "Proyecto EMES · 2019"
        : `${data.meta.periodStart}—${data.meta.periodEnd}`;

  const annualBoxes = useMemo(() => {
    const years = new Map<string, number[]>();
    data.dailyAir.forEach((row) => {
      const date = String(row.Fecha || "");
      const value = numberValue(row[`${pollutantFeature}_mean`]);
      if (date.length >= 4 && value !== null) {
        const year = date.slice(0, 4);
        years.set(year, [...(years.get(year) || []), value]);
      }
    });
    return Array.from(years.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, values]) => ({ label, min: Math.min(...values), q1: percentile(values, 0.25), median: percentile(values, 0.5), q3: percentile(values, 0.75), max: Math.max(...values), n: values.length }));
  }, [data.dailyAir, pollutantFeature]);

  const correlationFeatures = useMemo(() => correlationMode === "pollutants"
    ? data.pollutants.map((item) => item.feature)
    : correlationMode === "weather"
      ? [pollutantFeature, ...METEOROLOGY.map((item) => item.feature)]
      : [...data.pollutants.map((item) => item.feature), ...METEOROLOGY.map((item) => item.feature)], [correlationMode, data.pollutants, pollutantFeature]);
  const correlationValues = useMemo(() => correlationFeatures.map((featureA) => correlationFeatures.map((featureB) => pearson(data.dailyAir, featureA, featureB))), [correlationFeatures, data.dailyAir]);
  const correlationLabels = correlationFeatures.map((feature) => POLLUTANT_NAMES[feature] || METEOROLOGY.find((item) => item.feature === feature)?.label || feature);

  const controls = (() => {
    if (kind === "air") return <>
      {activeModule.id !== "weather" && activeModule.id !== "correlation" ? <label><span>Contaminante</span><select value={pollutantFeature} onChange={(event) => setPollutantFeature(event.target.value)}>{data.pollutants.map((item) => <option key={item.feature} value={item.feature}>{item.label} · {item.unit}</option>)}</select></label> : null}
      {activeModule.id === "weather" ? <label><span>Variable meteorológica</span><select value={weatherFeature} onChange={(event) => setWeatherFeature(event.target.value)}>{METEOROLOGY.map((item) => <option key={item.feature} value={item.feature}>{item.label} · {item.unit}</option>)}</select></label> : null}
      {activeModule.id === "patterns" ? <><label><span>Agrupación</span><select value={historyDimension} onChange={(event) => setHistoryDimension(event.target.value as typeof historyDimension)}><option value="annual">Año</option><option value="seasonal">Estación</option><option value="monthly">Mes</option><option value="weekly">Día de semana</option></select></label><label><span>Estadístico</span><select value={historyMetric} onChange={(event) => setHistoryMetric(event.target.value as typeof historyMetric)}><option value="median">Mediana</option><option value="mean">Promedio</option><option value="p90">Percentil 90</option></select></label></> : null}
      {activeModule.id === "correlation" ? <><label><span>Variables</span><select value={correlationMode} onChange={(event) => setCorrelationMode(event.target.value as typeof correlationMode)}><option value="pollutants">Solo contaminantes</option><option value="weather">Contaminante + meteorología</option><option value="all">Matriz unificada</option></select></label>{correlationMode === "weather" ? <label><span>Contaminante central</span><select value={pollutantFeature} onChange={(event) => setPollutantFeature(event.target.value)}>{data.pollutants.map((item) => <option key={item.feature} value={item.feature}>{item.label}</option>)}</select></label> : null}</> : null}
    </>;
    if (kind === "industry") return <>
      {activeModule.id === "loads" ? <label><span>Carga</span><select value={industryMetric} onChange={(event) => setIndustryMetric(event.target.value)}><option value="Carga_Total_gs">Total</option><option value="CO_gs">CO</option><option value="NOx_gs">NOx</option><option value="SO2_gs">SO₂</option></select></label> : null}
      {activeModule.id === "distribution" ? <label><span>Contaminante</span><select value={pollutantFeature} onChange={(event) => setPollutantFeature(event.target.value)}>{data.pollutants.map((item) => <option key={item.feature} value={item.feature}>{item.label}</option>)}</select></label> : null}
      {activeModule.id === "physical" ? <label><span>Magnitud física</span><select value={physicalMetric} onChange={(event) => setPhysicalMetric(event.target.value as typeof physicalMetric)}><option value="stackHeight">Altura de chimenea</option><option value="stackDiameter">Diámetro</option><option value="exitVelocity">Velocidad de salida</option><option value="outletTemperature">Temperatura de salida</option></select></label> : null}
      {activeModule.id === "emitters" ? <label><span>Vista</span><select value={emitterView} onChange={(event) => setEmitterView(event.target.value as typeof emitterView)}><option value="relation">Emisión ↔ concentración</option><option value="spatial">Distribución espacial</option></select></label> : null}
    </>;
    if (kind === "model" && activeModule.id === "features") return <label><span>Agrupación</span><select value={featureView} onChange={(event) => setFeatureView(event.target.value as typeof featureView)}><option value="detail">Variables principales</option><option value="category">Categorías</option></select></label>;
    return null;
  })();

  const chart = (() => {
    if (kind === "air") {
      if (activeModule.id === "daily") {
        const points = data.dailyAir.map((row) => ({ label: String(row.Fecha || ""), value: numberValue(row[`${pollutantFeature}_mean`]) })).filter((point): point is ChartPoint => point.value !== null);
        return <ChartShell title={`${pollutant.label} · promedio diario`} subtitle={`${points.length} días válidos · ${points[0]?.label || "sin fecha"}—${points.at(-1)?.label || "sin fecha"}`}><LineChart points={points} color={pollutant.color} unit={pollutant.unit} reference={pollutantFeature === "CONT_PM25" ? data.meta.pm25Threshold : undefined} referenceLabel={pollutantFeature === "CONT_PM25" ? `Umbral operativo ${data.meta.pm25Threshold} ${pollutant.unit}` : undefined} /></ChartShell>;
      }
      if (activeModule.id === "box") return <ChartShell title={`${pollutant.label} · cajas anuales`} subtitle={`${annualBoxes.length} años con cobertura válida`}><BoxPlot groups={annualBoxes} unit={pollutant.unit} /></ChartShell>;
      if (activeModule.id === "hour") {
        const points = data.hourlyProfile.map((row) => ({ label: `${String(row.HORA).padStart(2, "0")}:00`, value: numberValue(row[pollutantFeature]) })).filter((point): point is ChartPoint => point.value !== null);
        return <ChartShell title={`${pollutant.label} · perfil de 24 horas`} subtitle="Mediana histórica por hora local"><LineChart points={points} color={pollutant.color} unit={pollutant.unit} /></ChartShell>;
      }
      if (activeModule.id === "weather") {
        const points = data.dailyAir.map((row) => ({ label: String(row.Fecha || ""), value: numberValue(row[`${weatherFeature}_mean`]) })).filter((point): point is ChartPoint => point.value !== null);
        const mean = points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : undefined;
        return <ChartShell title={`${weather.label} · promedio diario`} subtitle={`${points.length} días válidos`}><LineChart points={points} color={weather.color} unit={weather.unit} average={mean} /></ChartShell>;
      }
      if (activeModule.id === "patterns") {
        const points = data.historical[historyDimension].map((slice) => ({ label: slice.label, value: slice.values[pollutantFeature]?.[historyMetric] ?? 0, color: pollutant.color }));
        return <ChartShell title={`${pollutant.label} · ${historyMetric === "median" ? "mediana" : historyMetric === "mean" ? "promedio" : "percentil 90"}`} subtitle={`Agrupación: ${historyDimension}`}><HorizontalBars points={points.sort((a, b) => b.value - a.value)} unit={pollutant.unit} maxRows={20} /></ChartShell>;
      }
      return <ChartShell title="Matriz de correlaciones pareadas" subtitle={`${correlationLabels.length} variables · días válidos por par`}><Heatmap labels={correlationLabels} values={correlationValues} /></ChartShell>;
    }

    if (kind === "industry") {
      if (activeModule.id === "inventory") {
        const counts = new Map<string, number>();
        data.industrial.sites.forEach((site) => counts.set(site.category, (counts.get(site.category) || 0) + 1));
        return <ChartShell title="Fuentes por categoría industrial" subtitle={`${data.industrial.sites.length} fuentes georreferenciadas`}><HorizontalBars points={Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)} unit="fuentes" /></ChartShell>;
      }
      if (activeModule.id === "loads") {
        const labels: Record<string, string> = { Carga_Total_gs: "Carga total", CO_gs: "CO", NOx_gs: "NOx", SO2_gs: "SO₂" };
        const points = data.industrial.topStateLoads.map((row) => ({ label: `${row.Empresa} · ${row.Rubro}`, value: numberValue(row[industryMetric]) || 0, color: industryMetric === "Carga_Total_gs" ? "#d6a82e" : industryMetric === "SO2_gs" ? "#925fc0" : industryMetric === "NOx_gs" ? "#dc7658" : "#55bfae" })).sort((a, b) => b.value - a.value);
        return <ChartShell title={`${labels[industryMetric]} por empresa y rubro`} subtitle="Inventario estatal anonimizado"><HorizontalBars points={points} unit="g/s" maxRows={12} /></ChartShell>;
      }
      if (activeModule.id === "distribution") {
        const values = data.industrial.sites.map((site) => numberValue(site.emissions[pollutant.label]) ?? (pollutantFeature === "CONT_SO2" ? site.emissionRate : null)).filter((value): value is number => value !== null && value >= 0);
        const bins = 9;
        const max = Math.max(...values, 1);
        const width = max / bins;
        const points = Array.from({ length: bins }, (_, index) => ({ label: `${formatNumber(index * width, 2)}–${formatNumber((index + 1) * width, 2)}`, value: values.filter((value) => value >= index * width && (index === bins - 1 ? value <= (index + 1) * width : value < (index + 1) * width)).length, color: "#df7055" }));
        return <ChartShell title={`${pollutant.label} · histograma de fuentes`} subtitle={`n=${values.length} cargas válidas`}><HorizontalBars points={points} unit="fuentes" /></ChartShell>;
      }
      if (activeModule.id === "software") {
        const sourceCounts = new Map<string, number>();
        data.industrial.sites.forEach((site) => sourceCounts.set(site.source, (sourceCounts.get(site.source) || 0) + 1));
        const points = [...Array.from(sourceCounts, ([label, value]) => ({ label: label.includes("UPS") ? `${label} · Screen View 3` : `${label} · Disper 5.2`, value, color: label.includes("UPS") ? "#8e70c6" : "#55bfae", note: "fuentes" })), { label: `Campo ${data.geography.aermodStats.method}`, value: data.geography.aermodStats.points, color: "#d6a82e", note: "puntos" }];
        return <ChartShell title="Cobertura documental por método" subtitle="Recuentos; no compara concentraciones"><HorizontalBars points={points.sort((a, b) => b.value - a.value)} unit="registros" /></ChartShell>;
      }
      if (activeModule.id === "physical") {
        const config = { stackHeight: { label: "Altura de chimenea", unit: "m" }, stackDiameter: { label: "Diámetro de salida", unit: "m" }, exitVelocity: { label: "Velocidad de salida", unit: "m/s" }, outletTemperature: { label: "Temperatura de salida", unit: "°C" } }[physicalMetric];
        const points = data.industrial.sites.map((site) => ({ label: site.name, value: numberValue(site[physicalMetric]) })).filter((point): point is { label: string; value: number } => point.value !== null).sort((a, b) => b.value - a.value).map((point, index) => ({ ...point, color: index === 0 ? "#d6a82e" : "#397f83" }));
        return <ChartShell title={config.label} subtitle={`${points.length} fuentes con dato válido`}><HorizontalBars points={points} unit={config.unit} maxRows={16} /></ChartShell>;
      }
      if (activeModule.id === "types") {
        const points = data.industrial.equipment.map((row) => ({ label: String(row.Tipo_Fuente), value: numberValue(row.Carga_Total_gs) || 0, color: "#df7055", note: `${numberValue(row.Fuentes) || 0} fuentes` })).sort((a, b) => b.value - a.value);
        return <ChartShell title="Carga total por tipo de equipo" subtitle="La etiqueta lateral informa el número de fuentes"><HorizontalBars points={points} unit="g/s" /></ChartShell>;
      }
      const points = data.industrial.sites.filter((site) => emitterView === "spatial" ? Number.isFinite(site.lon) && Number.isFinite(site.lat) : site.so2Concentration !== null && Number.isFinite(site.emissionRate)).map((site) => emitterView === "spatial" ? { x: site.lon, y: site.lat, label: site.name, size: 5 + Math.log1p(site.emissionRate) * 2 } : { x: site.emissionRate, y: site.so2Concentration || 0, label: site.name, size: 7 });
      return <ChartShell title={emitterView === "spatial" ? "Distribución espacial de fuentes" : "Emisión de SO₂ frente a concentración modelada"} subtitle={emitterView === "spatial" ? "El tamaño orienta sobre la tasa; usa el Mapa maestro para el contexto cartográfico" : "Ajuste descriptivo, no causal"}><ScatterChart points={points} xLabel={emitterView === "spatial" ? "Longitud" : "Tasa de emisión"} yLabel={emitterView === "spatial" ? "Latitud" : "Concentración modelada"} xUnit={emitterView === "spatial" ? "°" : "g/s"} yUnit={emitterView === "spatial" ? "°" : "µg/m³"} spatial={emitterView === "spatial"} /></ChartShell>;
    }

    if (kind === "traffic") {
      if (activeModule.id === "modal") {
        const points = data.traffic.modal.map((row) => ({ label: String(row.Modo), value: numberValue(row.Porcentaje) || 0, color: row.Sostenible ? "#55bfae" : "#df7055" })).sort((a, b) => b.value - a.value).map((point, index) => ({ ...point, color: index === 0 ? "#d6a82e" : point.color }));
        return <ChartShell title="Reparto modal de viajes laborales" subtitle="PMEP 2015–2025 · contexto del Parque Industrial"><HorizontalBars points={points} unit="%" /></ChartShell>;
      }
      if (activeModule.id === "problems") {
        const points = data.traffic.problems.map((row) => ({ label: String(row.Eje_Tematico), value: numberValue(row.Problemas_Seleccionados) || 0, color: "#8e70c6", note: `${numberValue(row.Problemas_Explotados) || 0} explorados` })).sort((a, b) => b.value - a.value).map((point, index) => ({ ...point, color: index === 0 ? "#d6a82e" : point.color }));
        return <ChartShell title="Problemas priorizados por eje" subtitle={`${formatNumber(data.geography.passThroughEntryPct, 1)}% del tráfico de paso entra por Cornelio Vintimilla`}><HorizontalBars points={points} unit="seleccionados" /></ChartShell>;
      }
      if (activeModule.id === "desire") {
        const counts = new Map<string, number>();
        data.traffic.desireLines.forEach((row) => counts.set(String(row.Modo), (counts.get(String(row.Modo)) || 0) + 1));
        const points = Array.from(counts, ([label, value]) => ({ label, value, color: "#397fb0" })).sort((a, b) => b.value - a.value).map((point, index) => ({ ...point, color: index === 0 ? "#d6a82e" : point.color }));
        return <ChartShell title="Relaciones de deseo por modo" subtitle={`${data.traffic.parking.reduce((sum, row) => sum + (numberValue(row.Cantidad_Plazas) || 0), 0)} plazas consignadas en el archivo de estacionamiento`}><HorizontalBars points={points} unit="relaciones" /></ChartShell>;
      }
      const columns = ["Bus", "Privado", "Pie", "Moto", "Bici"];
      const rows = data.traffic.od.map((row) => ({ label: String(row.Zona_Origen), values: ["Viajes_Bus", "Viajes_Vehiculo_Privado", "Viajes_Pie", "Viajes_Moto", "Viajes_Bicicleta"].map((key) => numberValue(row[key]) || 0) }));
      return <ChartShell title="Matriz origen–destino por modo" subtitle={`${rows.length} zonas · ${data.traffic.strategies.length} estrategias documentadas`}><MatrixChart rows={rows} columns={columns} /></ChartShell>;
    }

    if (activeModule.id === "performance") {
      const points = [
        { label: "Exactitud · base", value: data.meta.baseMetrics.Accuracy || 0.675405, color: "#8d9a98" },
        { label: "Exactitud · enriquecido", value: data.meta.metrics.accuracy, color: "#55bfae" },
        { label: "F1 · base", value: data.meta.baseMetrics.F1 || 0.691575, color: "#8d9a98" },
        { label: "F1 · enriquecido", value: data.meta.metrics.f1_score, color: "#55bfae" },
        { label: "AUC-ROC · base", value: data.meta.baseMetrics["AUC-ROC"] || 0.748119, color: "#8d9a98" },
        { label: "AUC-ROC · enriquecido", value: data.meta.metrics.roc_auc, color: "#55bfae" },
      ];
      return <ChartShell title="Métricas comunes de dos corridas separadas" subtitle={`Base: ${data.meta.originalFeatures} variables · Enriquecido: ${data.meta.enrichedFeatures} variables`}><HorizontalBars points={points} unit="" /></ChartShell>;
    }
    if (activeModule.id === "features") {
      let points: BarPoint[];
      if (featureView === "detail") points = data.topFeatures.slice(0, 18).map((feature) => ({ label: feature.Feature, value: feature.Importance, color: "#e0b63f" }));
      else {
        const categories = new Map<string, number>();
        data.topFeatures.forEach((feature) => { const category = categoryForFeature(feature.Feature); categories.set(category, (categories.get(category) || 0) + feature.Importance); });
        points = Array.from(categories, ([label, value]) => ({ label, value, color: "#e0b63f" })).sort((a, b) => b.value - a.value);
      }
      return <ChartShell title={featureView === "detail" ? "Variables principales" : "Importancia agregada por categoría"} subtitle="Amarillo de alto contraste: no depende de distinguir rojo y verde"><HorizontalBars points={points} unit="" maxRows={18} /></ChartShell>;
    }
    if (activeModule.id === "thresholds") {
      const precisionPoints = BASE_THRESHOLDS.map((row) => ({ label: row.threshold.toFixed(2), value: row.precision }));
      const recallPoints = BASE_THRESHOLDS.map((row) => ({ label: row.threshold.toFixed(2), value: row.recall }));
      return <ChartShell title="Precisión y recall por umbral" subtitle="Cuaderno base · 0,40 recomendado · etiquetas de alertas en la tabla"><LineChart points={precisionPoints} color="#df7055" unit="proporción" highlightIndex={1} highlightLabel="Umbral operativo 0,40" secondary={{ points: recallPoints, color: "#55bfae", label: "Recall" }} /></ChartShell>;
    }
    const points = TEMPORAL_AUC.map((value, index) => ({ label: `Pliegue ${index + 1}`, value }));
    return <ChartShell title="AUC-ROC por pliegue temporal" subtitle="Entrenamiento anterior al periodo de evaluación"><LineChart points={points} color="#e0b63f" unit="AUC-ROC" average={0.7877} /></ChartShell>;
  })();

  const extraEvidence = (() => {
    if (kind === "traffic" && activeModule.id === "modal") return <div className="analytics-kpis"><div><span>Viajes laborales</span><strong>19.329</strong><small>estimados por día</small></div><div><span>Huella anual correcta</span><strong>14.699,60</strong><small>t CO₂/año · sin duplicar</small></div><div><span>Flota privada</span><strong>{formatNumber(data.traffic.fleet.reduce((sum, row) => sum + (numberValue(row.Cantidad) || 0), 0), 0)}</strong><small>vehículos consignados</small></div></div>;
    if (kind === "traffic" && activeModule.id === "od") return <ol className="analytics-strategies">{data.traffic.strategies.map((row) => <li key={String(row.ID_Estrategia)}><span>{String(row.ID_Estrategia).padStart(2, "0")}</span><div><strong>{String(row.Nombre_Estrategia)}</strong><p>{String(row.Objetivo)}</p></div></li>)}</ol>;
    if (kind === "model" && activeModule.id === "performance") return <div className="analytics-kpis"><div><span>Base · precisión</span><strong>0,6880</strong><small>cuaderno RF</small></div><div><span>Base · recall</span><strong>0,6951</strong><small>cuaderno RF</small></div><div><span>Enriquecido · árboles</span><strong>{data.meta.trees}</strong><small>corrida interactiva</small></div></div>;
    if (kind === "model" && activeModule.id === "thresholds") return <div className="analytics-threshold-table" role="region" aria-label="Tabla de rendimiento por umbral" tabIndex={0}><table><thead><tr><th>Umbral</th><th>Alertas</th><th>TP</th><th>FP</th><th>FN</th><th>Precisión</th><th>Recall</th><th>F1</th></tr></thead><tbody>{BASE_THRESHOLDS.map((row) => <tr key={row.threshold} className={row.threshold === 0.4 ? "is-recommended" : ""}><th>{row.threshold.toFixed(2)}</th><td>{row.alerts}</td><td>{row.tp}</td><td>{row.fp}</td><td>{row.fn}</td><td>{formatNumber(row.precision, 3)}</td><td>{formatNumber(row.recall, 3)}</td><td>{formatNumber(row.f1, 3)}</td></tr>)}</tbody></table></div>;
    if (kind === "industry" && activeModule.id === "software") return <div className="analytics-method-grid"><div><strong>Screen View 3</strong><p>Cribado de concentración de SO₂ documentado en la tesis UPS. Útil para escenarios conservadores.</p></div><div><strong>Disper 5.2</strong><p>Herramienta documentada por UCuenca para el estudio de dispersión del inventario estatal.</p></div><div><strong>AERMOD</strong><p>{data.geography.aermodStats.points} puntos de un campo histórico de dispersión. No son sensores ni observaciones directas.</p></div></div>;
    return null;
  })();

  return (
    <section className="analytics-report-page" role="dialog" aria-modal="true" aria-labelledby="analytics-report-title">
      <header className="analytics-toolbar">
        <button type="button" onClick={onClose} autoFocus><span aria-hidden="true">←</span> Volver a Mezcla de variables</button>
        <div><b>Aire Cuenca</b><span>Informe analítico secundario</span></div>
      </header>
      <div className="analytics-scroll">
        <article className="analytics-sheet">
          <header className="analytics-title-block">
            <p>Informe {report.number} · {report.eyebrow}</p>
            <h1 id="analytics-report-title">{report.title}</h1>
            <div className="analytics-title-grid"><p>{report.intro}</p><dl><div><dt>Periodo de esta fuente</dt><dd>{reportPeriod}</dd></div><div><dt>Carácter</dt><dd>Histórico y educativo</dd></div><div><dt>Vista activa</dt><dd>{activeModule.number} / {report.modules.length.toString().padStart(2, "0")}</dd></div></dl></div>
          </header>

          <nav className="analytics-module-nav" aria-label={`Módulos de ${report.title}`}>
            {report.modules.map((item) => <button key={item.id} type="button" className={item.id === activeModule.id ? "is-active" : ""} aria-current={item.id === activeModule.id ? "page" : undefined} onClick={() => setModuleId(item.id)}><span>{item.number}</span><strong>{item.title}</strong><small>{item.short}</small></button>)}
          </nav>

          <section className="analytics-active-module" aria-labelledby="analytics-module-title">
            <header><div><p>Módulo {activeModule.number}</p><h2 id="analytics-module-title">{activeModule.title}</h2></div>{controls ? <div className="analytics-controls">{controls}</div> : null}</header>
            {chart}
            {extraEvidence}
            <div className="analytics-reading-grid">
              <section><span>01 · Propósito</span><h3>Qué permite responder</h3><p>{activeModule.purpose}</p></section>
              <section><span>02 · Ejes y unidades</span><h3>Cómo está construido</h3><p>{activeModule.axes} {activeModule.units}</p></section>
              <section><span>03 · Colores y marcas</span><h3>Qué significa la forma</h3><p>{activeModule.colors} {activeModule.marks}</p></section>
              <section><span>04 · Contexto de Cuenca</span><h3>Cómo leerlo localmente</h3><p>{activeModule.local}</p></section>
            </div>
            <aside className="analytics-limitation"><strong>Límite de interpretación</strong><p>{activeModule.limitation}</p></aside>
          </section>

          <section className="analytics-sources">
            <header><p>Procedencia verificable</p><h2>Fuentes y trazabilidad</h2></header>
            <ol>{SOURCE_LINKS[kind].map((source) => <li key={source.label}><span>{String(SOURCE_LINKS[kind].indexOf(source) + 1).padStart(2, "0")}</span><div><strong>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : source.label}</strong><p>{source.detail}</p></div></li>)}</ol>
            <p className="analytics-source-note">La interfaz resume archivos procesados por el proyecto. Conserva año, unidad y método cuando están disponibles y señala expresamente cuándo un resultado es inventario, estimación, modelación o dato histórico.</p>
          </section>

          <footer className="analytics-footer"><span>Aire Cuenca · Informe {report.number}</span><button type="button" onClick={onClose}>Cerrar informe y volver</button></footer>
        </article>
      </div>
    </section>
  );
}
