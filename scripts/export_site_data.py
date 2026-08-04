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
# Named route centerlines provide an analytical traffic overlay while the live
# tile layer supplies the complete street/satellite context.
park_boundary = [
    [-78.9840, -2.8816], [-78.9837, -2.8762], [-78.9821, -2.8715],
    [-78.9792, -2.8693], [-78.9759, -2.8694], [-78.9724, -2.8717],
    [-78.9688, -2.8750], [-78.9691, -2.8788], [-78.9709, -2.8825],
    [-78.9761, -2.8837], [-78.9815, -2.8832], [-78.9840, -2.8816],
]
roads = [
    {
        "name": "Av. de las Américas", "class": "arterial", "trafficWeight": 1.0,
        "points": [[-78.9845, -2.8813], [-78.9818, -2.8826], [-78.9780, -2.8834], [-78.9739, -2.8834], [-78.9690, -2.8810]],
    },
    {
        "name": "Cornelio Vintimilla", "class": "industrial", "trafficWeight": 0.82,
        "points": [[-78.9811, -2.8698], [-78.9798, -2.8724], [-78.9781, -2.8754], [-78.9765, -2.8784], [-78.9746, -2.8826]],
    },
    {
        "name": "Octavio Chacón Moscoso", "class": "arterial", "trafficWeight": 0.92,
        "points": [[-78.9842, -2.8760], [-78.9814, -2.8775], [-78.9786, -2.8793], [-78.9756, -2.8812]],
    },
    {
        "name": "Carlos Tosi", "class": "industrial", "trafficWeight": 0.68,
        "points": [[-78.9814, -2.8733], [-78.9784, -2.8735], [-78.9752, -2.8736], [-78.9714, -2.8738]],
    },
    {
        "name": "Paseo Río Machángara", "class": "river-road", "trafficWeight": 0.48,
        "points": [[-78.9838, -2.8708], [-78.9837, -2.8743], [-78.9836, -2.8782], [-78.9838, -2.8818]],
    },
    {
        "name": "Av. de los Migrantes", "class": "arterial", "trafficWeight": 0.76,
        "points": [[-78.9720, -2.8697], [-78.9705, -2.8729], [-78.9691, -2.8761], [-78.9689, -2.8800]],
    },
    {
        "name": "Manuel Ambrosi", "class": "industrial", "trafficWeight": 0.58,
        "points": [[-78.9821, -2.8751], [-78.9794, -2.8752], [-78.9762, -2.8755], [-78.9728, -2.8760]],
    },
]

local_aermod = aermod[
    aermod["Coord_X"].between(723700, 726100)
    & aermod["Coord_Y"].between(9680500, 9683200)
].copy()
aermod_points = []
for _, row in local_aermod.iterrows():
    lon, lat = to_wgs.transform(row["Coord_X"], row["Coord_Y"])
    aermod_points.append({
        "lon": round(lon, 7), "lat": round(lat, 7),
        "emissionRate": clean(row["emision_rate"]), "id": clean(row["Id"]),
    })

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
    "historical": historical,
    "geography": {
        "center": [-78.9771, -2.8767],
        "initialZoom": 15,
        "boundary": park_boundary,
        "roads": roads,
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
