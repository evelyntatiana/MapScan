"""Export the analyzed Mapscan research artifacts into browser-ready JSON.

Run with the same Python environment used to train/read the sklearn artifact.
The deployed application does not need Python; it consumes the generated files.
"""

from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from pyproj import Transformer


APP_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = APP_ROOT.parent
PUBLIC = APP_ROOT / "public"
PUBLIC.mkdir(exist_ok=True)


def clean(value):
    if value is None:
        return None
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if not math.isfinite(float(value)) else round(float(value), 6)
    if pd.isna(value):
        return None
    return str(value)


def records(frame: pd.DataFrame) -> list[dict]:
    return [{str(k): clean(v) for k, v in row.items()} for row in frame.to_dict("records")]


def read_csv(path: Path) -> pd.DataFrame:
    try:
        return pd.read_csv(path)
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="latin-1")


def read_state_csv(name: str) -> pd.DataFrame:
    archive = PROJECT_ROOT / "actividad_industrial" / "estatal" / "datasets_cuenca_completos.zip"
    with zipfile.ZipFile(archive) as zf, zf.open(name) as stream:
        return pd.read_csv(stream)


base = read_csv(PROJECT_ROOT / "modelo_original" / "dataset_final_calidad_aire.csv")
base["Fecha"] = pd.to_datetime(base["Fecha"])
air_full = read_csv(PROJECT_ROOT / "Metereologia" / "dataset_unificado_calidad_aire.csv")
air_full["Fecha"] = pd.to_datetime(air_full["Fecha"])
target = read_csv(PROJECT_ROOT / "modelo_original" / "target_y.csv")
feature_importance = read_csv(PROJECT_ROOT / "modelo2" / "features_importance_enriquecido.csv")
enriched = joblib.load(PROJECT_ROOT / "modelo2" / "modelo_deterioro_aire_ENRIQUECIDO.pkl")
base_model = joblib.load(PROJECT_ROOT / "modelo_original" / "modelo_deterioro_aire.pkl")

poly = PROJECT_ROOT / "actividad_industrial" / "politecnica"
industries = read_csv(poly / "dataset_industrias_master.csv")
monitoring = read_csv(poly / "puntos_muestreo_cuenca_so2.csv")
normative = read_csv(poly / "dataset_normativa_atmosfera.csv")
fuel = read_csv(poly / "dataset_consumo_combustibles.csv")
aermod = read_csv(poly / "dataset_trafico_aermod_361puntos.csv")

state_coords = read_state_csv("dataset_coordenadas_empresas.csv")
state_loads = read_state_csv("dataset_cargas_globales.csv")
state_sources = read_state_csv("dataset_master_fuentes.csv")

traffic_dir = PROJECT_ROOT / "trafico"
modal = read_csv(traffic_dir / "modal_split.csv")
fleet = read_csv(traffic_dir / "vehicle_fleet.csv")
carbon = read_csv(traffic_dir / "carbon_footprint.csv")
od = read_csv(traffic_dir / "origin_destination_matrix.csv")
flow = read_csv(traffic_dir / "traffic_flow.csv")
parking = read_csv(traffic_dir / "parking.csv")
bus = read_csv(traffic_dir / "bus_lines.csv")
desire = read_csv(traffic_dir / "lineas_deseo.csv")
problems = read_csv(traffic_dir / "problemas_por_eje.csv")
strategies = read_csv(traffic_dir / "estrategias.csv")
indicators = read_csv(traffic_dir / "indicadores_generales.csv")

# Convert the UTM 17S research coordinates to WGS84 for the map projection.
to_wgs = Transformer.from_crs(32717, 4326, always_xy=True)
industrial_records = []
for idx, row in industries.iterrows():
    lon, lat = to_wgs.transform(row["Coord_X"], row["Coord_Y"])
    pressure = clean(row["Caldero_Capacidad_Presion"])
    equipment = "Fuente fija" if pressure in (None, "N/A") else f"Caldero · {pressure}"
    industrial_records.append(
        {
            "id": int(idx),
            "name": clean(row["Empresa"]),
            "lon": round(lon, 7),
            "lat": round(lat, 7),
            "altitude": clean(row["Altitud_msnm"]),
            "fuel": clean(row["Combustible_Principal"]) or "No documentado",
            "so2Concentration": clean(row["Conc_SO2_mg_m3"]),
            "exitVelocity": clean(row["Vel_Salida_m_s"]),
            "stackDiameter": clean(row["Diam_Chimenea_m"]),
            "emissionRate": clean(row["Tasa_Emision_g_s"]),
            "stackHeight": None,
            "outletTemperature": None,
            "source": "UPS · 2015",
            "category": "Inventario industrial georreferenciado",
            "equipment": equipment,
            "sourceCount": 1,
            "emissions": {
                "CO": None,
                "NO₂": None,
                "SO₂": clean(row["Tasa_Emision_g_s"]),
            },
        }
    )

# Merge the ten anonymized state-university companies that have real UTM
# coordinates. Their equipment and pollutant loads remain traceable to the
# 2018 inventory instead of being inferred from the named UPS companies.
for offset, row in state_coords.iterrows():
    lon, lat = to_wgs.transform(row["Coord_X_UTM"], row["Coord_Y_UTM"])
    company = str(row["Empresa"])
    company_sources = state_sources[state_sources["Empresa"].astype(str) == company]
    equipment_names = company_sources["Fuente_Fija"].dropna().astype(str).unique().tolist()
    industrial_records.append(
        {
            "id": int(100 + offset),
            "name": f"Empresa {company}",
            "lon": round(lon, 7),
            "lat": round(lat, 7),
            "altitude": 2560,
            "fuel": "No documentado",
            "so2Concentration": None,
            "exitVelocity": clean(row["Vel_Salida_ms"]),
            "stackDiameter": clean(row["Diametro_m"]),
            "emissionRate": clean(row["Carga_Total_gs"]),
            "stackHeight": clean(row["Altura_m"]),
            "outletTemperature": clean(row["Temp_Salida_C"]),
            "source": "UCuenca · 2018",
            "category": clean(row["Rubro"]),
            "equipment": " · ".join(equipment_names[:3]) if equipment_names else "Fuente fija",
            "sourceCount": int(len(company_sources)),
            "emissions": {
                "CO": clean(row["CO_gs"]),
                "NO₂": clean(row["NOx_gs"]),
                "SO₂": clean(row["SO2_gs"]),
            },
        }
    )

hour_cols = [
    "CONT_CO", "CONT_NO2", "CONT_OZONE", "CONT_PM1", "CONT_PM10",
    "CONT_SO2", "CONT_PM25", "MET_TEMP", "MET_HUM", "MET_PRES",
]
hourly = base.groupby("HORA")[hour_cols].median().reset_index()
recent = base.sort_values("Fecha").tail(72)[["Fecha", *hour_cols]].copy()
recent["Fecha"] = recent["Fecha"].dt.strftime("%Y-%m-%dT%H:%M:%S")

# Preserve the full 2016–2026 evidence window without shipping the 79k-row
# hourly table. One row per day is enough for the interactive long-range
# series while retaining daily minima and maxima for uncertainty bands.
daily_air = (
    air_full.set_index("Fecha")[hour_cols]
    .resample("D")
    .agg(["mean", "min", "max"])
)
daily_air.columns = [f"{feature}_{stat}" for feature, stat in daily_air.columns]
daily_air = daily_air.reset_index()
daily_air["Fecha"] = daily_air["Fecha"].dt.strftime("%Y-%m-%d")

base["Año"] = base["Fecha"].dt.year
base["Mes"] = base["Fecha"].dt.month
base["DiaSemana"] = base["Fecha"].dt.dayofweek
base["Estacion"] = base["Mes"].map(
    lambda month: "Verano" if month in (12, 1, 2)
    else "Otoño" if month in (3, 4, 5)
    else "Invierno" if month in (6, 7, 8)
    else "Primavera"
)


def historical_profile(frame: pd.DataFrame, key: str, order: list, labels: dict) -> list[dict]:
    profile = []
    for value in order:
        subset = frame[frame[key] == value]
        if subset.empty:
            continue
        values = {}
        for feature in hour_cols[:7]:
            series = subset[feature].dropna()
            values[feature] = {
                "median": clean(series.median()),
                "mean": clean(series.mean()),
                "p90": clean(series.quantile(0.9)),
                "count": int(len(series)),
            }
        profile.append({"key": str(value), "label": labels[value], "values": values})
    return profile


years = sorted(base["Año"].dropna().astype(int).unique().tolist())
month_labels = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril", 5: "Mayo", 6: "Junio",
    7: "Julio", 8: "Agosto", 9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}
weekday_labels = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}
season_order = ["Verano", "Otoño", "Invierno", "Primavera"]

historical = {
    "annual": historical_profile(base, "Año", years, {year: str(year) for year in years}),
    "seasonal": historical_profile(base, "Estacion", season_order, {season: season for season in season_order}),
    "monthly": historical_profile(base, "Mes", list(range(1, 13)), month_labels),
    "weekly": historical_profile(base, "DiaSemana", list(range(7)), weekday_labels),
}

# Geographic frame derived from the study maps: the polygon follows Paseo Río
# Machángara, Cornelio Vintimilla, Av. de las Américas and Av. de los Migrantes.
# Road centerlines below were reconstructed against the named OpenStreetMap ways
# referenced by prompt3. They are intentionally kept separate from the 361-point
# AERMOD inventory: the latter supplies a historical emission distribution, not
# direct street-sensor coordinates.
park_boundary = [
    [-78.9840, -2.8816], [-78.9837, -2.8762], [-78.9821, -2.8715],
    [-78.9792, -2.8693], [-78.9759, -2.8694], [-78.9724, -2.8717],
    [-78.9688, -2.8750], [-78.9691, -2.8788], [-78.9709, -2.8825],
    [-78.9761, -2.8837], [-78.9815, -2.8832], [-78.9840, -2.8816],
]
roads = [
    {
        "name": "Av. de las Américas", "class": "arterial", "trafficWeight": 1.0,
        "flow": "out", "flowLabel": "Salida · Centro de Cuenca",
        "points": [[-78.9752577, -2.8813478], [-78.9767227, -2.8806303], [-78.9783122, -2.8796630], [-78.9799281, -2.8791164], [-78.9810339, -2.8791182], [-78.9825455, -2.8799386], [-78.9835306, -2.8809440], [-78.9849201, -2.8816260]],
    },
    {
        "name": "Cornelio Vintimilla", "class": "industrial", "trafficWeight": 0.82,
        "flow": "distribution", "flowLabel": "Distribución interna · 67% del tráfico de paso",
        "points": [[-78.9754896, -2.8725450], [-78.9761733, -2.8728857], [-78.9768262, -2.8736308], [-78.9774693, -2.8745149], [-78.9784647, -2.8758605], [-78.9795482, -2.8772450], [-78.9800710, -2.8781118]],
    },
    {
        "name": "Octavio Chacón Moscoso", "class": "arterial", "trafficWeight": 0.92,
        "flow": "out", "flowLabel": "Salida · Panamericana / Autopista",
        "points": [[-78.9814250, -2.8758464], [-78.9795482, -2.8772450], [-78.9781638, -2.8783000], [-78.9762322, -2.8797733], [-78.9755538, -2.8806636], [-78.9752577, -2.8813478]],
    },
    {
        "name": "Carlos Tosi Siri", "class": "industrial", "trafficWeight": 0.68,
        "flow": "distribution", "flowLabel": "Acceso norte · Carlos Tosi",
        "points": [[-78.9803677, -2.8744402], [-78.9784647, -2.8758605], [-78.9776495, -2.8764417], [-78.9768108, -2.8766003], [-78.9762913, -2.8769891], [-78.9756437, -2.8774846], [-78.9749881, -2.8780761]],
    },
    {
        "name": "Paseo Río Machángara", "class": "river-road", "trafficWeight": 0.48,
        "flow": "in", "flowLabel": "Entrada · Checa / Chiquintad / Patamarca",
        "points": [[-78.9773266, -2.8710145], [-78.9787807, -2.8725879], [-78.9799317, -2.8738242], [-78.9803677, -2.8744402], [-78.9814250, -2.8758464], [-78.9818708, -2.8767153], [-78.9812289, -2.8780764], [-78.9810512, -2.8784155], [-78.9810215, -2.8788924]],
    },
    {
        "name": "Av. 25 de Marzo", "class": "arterial", "trafficWeight": 0.88,
        "flow": "in", "flowLabel": "Entrada · Ricaurte",
        "points": [[-78.9694470, -2.8659297], [-78.9707077, -2.8679841], [-78.9716965, -2.8694650], [-78.9724217, -2.8711487], [-78.9732065, -2.8718069], [-78.9740732, -2.8715620], [-78.9749346, -2.8721869], [-78.9748139, -2.8723735]],
    },
    {
        "name": "Av. de los Migrantes", "class": "arterial", "trafficWeight": 0.76,
        "flow": "distribution", "flowLabel": "Conexión · Patamarca / Ricaurte",
        "points": [[-78.9748139, -2.8723735], [-78.9740057, -2.8736212], [-78.9734751, -2.8751259], [-78.9724319, -2.8768418], [-78.9715653, -2.8784843], [-78.9709351, -2.8802786], [-78.9681078, -2.8810434]],
    },
    {
        "name": "Av. del Toril", "class": "access", "trafficWeight": 0.90,
        "flow": "in", "flowLabel": "Entrada · Bomba Sindicato",
        "points": [[-78.9827700, -2.8780300], [-78.9828600, -2.8786500], [-78.9827900, -2.8792500], [-78.9826347, -2.8802252]],
    },
]

traffic_accesses = [
    {
        "id": 1, "label": "Carlos Tosi + Cornelio Vintimilla",
        "shortLabel": "Carlos Tosi", "lon": -78.97796, "lat": -2.87607,
        "confidence": "Muy alta", "role": "Acceso norte",
        "coordinateNote": "Coordenada GPS publicada en la guía.",
    },
    {
        "id": 2, "label": "Octavio Chacón + Cornelio Vintimilla",
        "shortLabel": "Octavio + Cornelio", "lon": -78.9795482, "lat": -2.8772450,
        "confidence": "Alta", "role": "Distribución / salida norte",
        "coordinateNote": "Intersección cartográfica; la coordenada de la guía es aproximada.",
    },
    {
        "id": 3, "label": "Vía a Patamarca + Octavio Chacón + Paseo Río Machángara",
        "shortLabel": "Nodo Patamarca", "lon": -78.9787807, "lat": -2.8725879,
        "confidence": "Muy alta para el lugar", "role": "Entrada Checa · Chiquintad · Ricaurte",
        "coordinateNote": "Nodo cartográfico reconstruido; no es una estación GPS publicada.",
    },
    {
        "id": 4, "label": "Av. de las Américas + Av. del Toril / Bomba Sindicato",
        "shortLabel": "Bomba Sindicato", "lon": -78.98277, "lat": -2.87803,
        "confidence": "Muy alta", "role": "Acceso sur / salida al centro",
        "coordinateNote": "Coordenada de referencia publicada para el sector.",
    },
]

aermod_points = []
for _, row in aermod.iterrows():
    lon, lat = to_wgs.transform(row["Coord_X"], row["Coord_Y"])
    aermod_points.append({
        "lon": round(lon, 7), "lat": round(lat, 7),
        "emissionRate": clean(row["emision_rate"]), "id": clean(row["Id"]),
    })

aermod_profile = [clean(value) for value in aermod["emision_rate"].tolist()]
aermod_stats = {
    "points": int(len(aermod_profile)),
    "min": clean(aermod["emision_rate"].min()),
    "median": clean(aermod["emision_rate"].median()),
    "p90": clean(aermod["emision_rate"].quantile(0.90)),
    "p95": clean(aermod["emision_rate"].quantile(0.95)),
    "max": clean(aermod["emision_rate"].max()),
    "inventoryPeriod": "Inventario histórico 2008–2012",
    "method": "AERMOD · SO₂ de tráfico",
    "directMeasurement": False,
}

pollutant_meta = {
    "CO": ("CONT_CO", "mg/m³", "#ef6f4e"),
    "NO₂": ("CONT_NO2", "µg/m³", "#9b8cff"),
    "O₃": ("CONT_OZONE", "µg/m³", "#f7cf65"),
    "PM₁": ("CONT_PM1", "µg/m³", "#64d5c2"),
    "PM₁₀": ("CONT_PM10", "µg/m³", "#48a9e6"),
    "SO₂": ("CONT_SO2", "µg/m³", "#d47af3"),
    "PM₂.₅": ("CONT_PM25", "µg/m³", "#ff8ca1"),
}
pollutants = []
for label, (feature, unit, color) in pollutant_meta.items():
    s = base[feature]
    pollutants.append(
        {
            "label": label,
            "feature": feature,
            "unit": unit,
            "color": color,
            "min": round(float(s.quantile(0.01)), 3),
            "max": round(float(s.quantile(0.99)), 3),
            "observedMax": round(float(s.max()), 3),
            "median": round(float(s.median()), 3),
            "mean": round(float(s.mean()), 3),
        }
    )

model_meta = enriched["metadata"]
app_data = {
    "meta": {
        "periodStart": base["Fecha"].min().strftime("%Y-%m-%d"),
        "periodEnd": base["Fecha"].max().strftime("%Y-%m-%d"),
        "modelRows": int(len(base)),
        "sourceRows": 3568317,
        "targetPositivePct": round(float(target["TARGET"].mean() * 100), 1),
        "predictionHorizonHours": 6,
        "pm25Threshold": 15,
        "originalFeatures": int(len(base_model["features"])),
        "enrichedFeatures": int(model_meta["n_features_total"]),
        "trainingRows": int(model_meta["n_muestras_entrenamiento"]),
        "trees": int(enriched["modelo"].n_estimators),
        "sourceBundles": {"estatal": 21, "politecnica": 19, "trafico": 33},
        "metrics": {k: clean(v) for k, v in model_meta["metricas"].items()},
        "baseMetrics": {k: clean(v) for k, v in base_model["metricas"].items()},
        "methodNote": "Simulación analítica con datos históricos; no representa sensores en vivo.",
    },
    "pollutants": pollutants,
    "hourlyProfile": records(hourly),
    "recentSeries": records(recent),
    "dailyAir": records(daily_air),
    "historical": historical,
    "geography": {
        "center": [-78.9771, -2.8767],
        "initialZoom": 15,
        "boundary": park_boundary,
        "roads": roads,
        "trafficAccesses": traffic_accesses,
        "aermodProfile": aermod_profile,
        "aermodStats": aermod_stats,
        "passThroughEntryPct": 67,
        "aermodPoints": aermod_points,
    },
    "industrial": {
        "sites": industrial_records,
        "topStateLoads": records(state_loads.sort_values("Carga_Total_gs", ascending=False).head(12)),
        "stateCoordinateSources": records(state_coords),
        "equipment": records(
            state_sources.groupby("Tipo_Fuente", dropna=False)
            .agg(Fuentes=("Fuente_Fija", "count"), Carga_Total_gs=("Carga_Total_gs", "sum"))
            .reset_index()
            .sort_values("Fuentes", ascending=False)
        ),
        "fuelConsumption": records(fuel),
        "aermod": {
            "points": int(len(aermod)),
            "meanEmissionRate": clean(aermod["emision_rate"].mean()),
            "maxEmissionRate": clean(aermod["emision_rate"].max()),
        },
    },
    "monitoringPoints": records(monitoring),
    "normative": records(normative),
    "traffic": {
        "modal": records(modal[modal["Fuente"] == "PMEP 2015-2025"]),
        "fleet": records(fleet[fleet["Tipo_Vehiculo"] != "TOTAL"]),
        "carbon": records(carbon[carbon["Empresa"] != "TOTAL"]),
        "od": records(od),
        "flow": records(flow),
        "parking": records(parking),
        "bus": records(bus),
        "desireLines": records(desire),
        "problems": records(problems),
        "strategies": records(strategies.drop_duplicates("Nombre_Estrategia")),
        "indicators": records(indicators),
    },
    "topFeatures": records(feature_importance.head(24)),
}

with (PUBLIC / "app-data.json").open("w", encoding="utf-8") as stream:
    json.dump(app_data, stream, ensure_ascii=False, separators=(",", ":"))

# A compact, exact browser representation of the trained 300-tree Random Forest.
forest = enriched["modelo"]
model_payload = {
    "featureNames": list(enriched["feature_names"]),
    "mean": [round(float(x), 8) for x in enriched["scaler"].mean_],
    "scale": [round(float(x), 8) if x else 1.0 for x in enriched["scaler"].scale_],
    "trees": [],
}

for estimator in forest.estimators_:
    tree = estimator.tree_
    probabilities = []
    for node in range(tree.node_count):
        vals = tree.value[node][0]
        total = float(np.sum(vals))
        probabilities.append(round(float(vals[1] / total), 6) if total and len(vals) > 1 else 0.0)
    model_payload["trees"].append(
        {
            "f": tree.feature.astype(int).tolist(),
            "t": [round(float(x), 6) for x in tree.threshold],
            "l": tree.children_left.astype(int).tolist(),
            "r": tree.children_right.astype(int).tolist(),
            "p": probabilities,
        }
    )

with (PUBLIC / "model-data.json").open("w", encoding="utf-8") as stream:
    json.dump(model_payload, stream, separators=(",", ":"))

print(f"app-data.json: {(PUBLIC / 'app-data.json').stat().st_size / 1024:.1f} KiB")
print(f"model-data.json: {(PUBLIC / 'model-data.json').stat().st_size / 1024 / 1024:.1f} MiB")
