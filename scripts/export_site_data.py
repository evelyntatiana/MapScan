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
        }
    )

hour_cols = [
    "CONT_CO", "CONT_NO2", "CONT_OZONE", "CONT_PM1", "CONT_PM10",
    "CONT_SO2", "CONT_PM25", "MET_TEMP", "MET_HUM", "MET_PRES",
]
hourly = base.groupby("HORA")[hour_cols].median().reset_index()
recent = base.sort_values("Fecha").tail(72)[["Fecha", *hour_cols]].copy()
recent["Fecha"] = recent["Fecha"].dt.strftime("%Y-%m-%dT%H:%M:%S")

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
