"""Construye la extracción, limpieza y EDA reproducible de las fuentes de prompt 5.

Uso desde la raíz del proyecto:
    python scripts/build_academic_evidence.py
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCES_ROOT = ROOT / "fuentes_academicas"
OUTPUT_ROOT = ROOT / "extraccion_academica"

SOURCES = [
    {
        "id": "01_oms_2021_guias_aire",
        "pdf": "fuentes_academicas/01_oms_2021_guias_aire/OMS_2021_AQG_resumen.pdf",
        "apa": "World Health Organization. (2021). WHO global air quality guidelines: Particulate matter (PM2.5 and PM10), ozone, nitrogen dioxide, sulfur dioxide and carbon monoxide. https://iris.who.int/handle/10665/345329",
        "url": "https://www.who.int/publications/i/item/9789240034228",
        "terms": ["PM2.5", "PM10", "ozone", "nitrogen dioxide", "sulfur dioxide", "carbon monoxide", "health"],
    },
    {
        "id": "02_parra_2022_cuenca_pm25",
        "pdf": "fuentes_academicas/02_parra_2022_cuenca_pm25/Parra_Saud_Espinoza_2022.pdf",
        "apa": "Parra, R., Saud, C., & Espinoza, C. (2022). Simulating PM2.5 concentrations during New Year in Cuenca, Ecuador: Effects of advancing the time of burning activities. Toxics, 10(5), 264. https://doi.org/10.3390/toxics10050264",
        "url": "https://doi.org/10.3390/toxics10050264",
        "terms": ["Cuenca", "PM2.5", "diesel", "industries", "boundary layer", "inversion", "radiation"],
    },
    {
        "id": "03_hu_2022_pm1_salud",
        "pdf": "fuentes_academicas/03_hu_2022_pm1_salud/Hu_et_al_2022_PM1.pdf",
        "apa": "Hu, Y., Wu, M., Li, Y., & Liu, X. (2022). Influence of PM1 exposure on total and cause-specific respiratory diseases: A systematic review and meta-analysis. Environmental Science and Pollution Research, 29, 15117–15126. https://doi.org/10.1007/s11356-021-16536-0",
        "url": "https://doi.org/10.1007/s11356-021-16536-0",
        "terms": ["PM1", "respiratory", "asthma", "pneumonia", "heterogeneity", "publication bias"],
    },
    {
        "id": "04_mainka_zak_2022_mezclas",
        "pdf": "fuentes_academicas/04_mainka_zak_2022_mezclas/Mainka_Zak_2022_mezclas.pdf",
        "apa": "Mainka, A., & Żak, M. (2022). Synergistic or antagonistic health effects of long- and short-term exposure to ambient NO2 and PM2.5: A review. International Journal of Environmental Research and Public Health, 19(21), 14079. https://doi.org/10.3390/ijerph192114079",
        "url": "https://doi.org/10.3390/ijerph192114079",
        "terms": ["NO2", "PM2.5", "synergistic", "antagonistic", "mixture", "health"],
    },
    {
        "id": "05_vilcassim_thurston_2023_brechas",
        "pdf": "fuentes_academicas/05_vilcassim_thurston_2023_brechas/Vilcassim_Thurston_2023.pdf",
        "apa": "Vilcassim, R., & Thurston, G. D. (2023). Gaps and future directions in research on health effects of air pollution. eBioMedicine, 93, 104668. https://doi.org/10.1016/j.ebiom.2023.104668",
        "url": "https://doi.org/10.1016/j.ebiom.2023.104668",
        "terms": ["mixtures", "multipollutant", "PM1", "sources", "composition", "health effects"],
    },
]

EVIDENCE = [
    {
        "source_id": "01_oms_2021_guias_aire",
        "variables": "PM2.5|PM10|O3|NO2|SO2|CO",
        "dimension": "salud",
        "finding": "La evidencia sanitaria sustenta guías para PM2.5, PM10, O3, NO2, SO2 y CO; la exposición debe interpretarse según concentración, duración y población susceptible.",
        "location": "Resumen ejecutivo y capítulos de contaminantes",
    },
    {
        "source_id": "01_oms_2021_guias_aire",
        "variables": "PM2.5|PM10",
        "dimension": "salud",
        "finding": "El material particulado se asocia con efectos respiratorios y cardiovasculares; el tamaño aerodinámico modifica la penetración y deposición en el aparato respiratorio.",
        "location": "Capítulo de material particulado",
    },
    {
        "source_id": "01_oms_2021_guias_aire",
        "variables": "O3|NO2|SO2|CO",
        "dimension": "salud",
        "finding": "Los gases regulados tienen perfiles sanitarios distintos; no deben agruparse como si toxicidad, estado gaseoso y condición de contaminante fueran sinónimos.",
        "location": "Capítulos de contaminantes gaseosos",
    },
    {
        "source_id": "02_parra_2022_cuenca_pm25",
        "variables": "PM2.5",
        "dimension": "origen_local",
        "finding": "En Cuenca, el tránsito diésel, las fuentes industriales del noreste y otras combustiones locales son antecedentes plausibles de PM2.5 primario; la atribución puntual requiere inventario y medición.",
        "location": "Introduction; Study area and emissions",
    },
    {
        "source_id": "02_parra_2022_cuenca_pm25",
        "variables": "Temperatura|Radiación global|Luz solar|Inversión térmica",
        "dimension": "meteorologia",
        "finding": "La estabilidad, la inversión y una capa de mezcla somera favorecen la acumulación; el calentamiento y la convección diurna pueden mejorar la dispersión.",
        "location": "Results and discussion: meteorology and PBL",
    },
    {
        "source_id": "02_parra_2022_cuenca_pm25",
        "variables": "PM1|PM2.5",
        "dimension": "origen_local",
        "finding": "La red local descrita mide fracciones finas, lo que permite contextualizar PM1 y PM2.5 sin asumir que una fracción equivale químicamente a la otra.",
        "location": "Study area and monitoring network",
    },
    {
        "source_id": "03_hu_2022_pm1_salud",
        "variables": "PM1",
        "dimension": "salud",
        "finding": "PM1 puede alcanzar regiones profundas del tracto respiratorio; el metaanálisis encontró asociaciones con algunos desenlaces respiratorios, con resultados no uniformes entre desenlaces.",
        "location": "Abstract; Results; Discussion",
    },
    {
        "source_id": "03_hu_2022_pm1_salud",
        "variables": "PM1",
        "dimension": "limitacion",
        "finding": "La base epidemiológica para PM1 sigue siendo pequeña y heterogénea, con sesgo de publicación señalado; no corresponde describirla como una estimación universal o determinista.",
        "location": "Publication bias; Limitations; Conclusion",
    },
    {
        "source_id": "04_mainka_zak_2022_mezclas",
        "variables": "NO2|PM2.5",
        "dimension": "mezcla",
        "finding": "La coexposición a NO2 y PM2.5 no produce una única respuesta universal: según desenlace y diseño, las interacciones reportadas pueden ser sinérgicas, antagónicas o no concluyentes.",
        "location": "Results and conclusions",
    },
    {
        "source_id": "04_mainka_zak_2022_mezclas",
        "variables": "NO2|PM2.5",
        "dimension": "limitacion",
        "finding": "Los modelos de un solo contaminante no describen por completo una atmósfera multipolutante; tampoco es válido sumar riesgos individuales sin un modelo de interacción y exposición.",
        "location": "Introduction; Discussion",
    },
    {
        "source_id": "05_vilcassim_thurston_2023_brechas",
        "variables": "Todos",
        "dimension": "limitacion",
        "finding": "La composición, la fuente, la escala espacial, el tiempo y la susceptibilidad condicionan los efectos; la evaluación multipolutante conserva brechas metodológicas importantes.",
        "location": "Research gaps and future directions",
    },
    {
        "source_id": "05_vilcassim_thurston_2023_brechas",
        "variables": "PM1|PM2.5|PM10",
        "dimension": "salud",
        "finding": "El tamaño, la composición y el origen de las partículas importan para la toxicidad y la exposición; una etiqueta de tamaño no identifica por sí sola la mezcla química.",
        "location": "Particulate matter research gaps",
    },
]


def normalize(text: str) -> str:
    text = text.replace("\u00ad", "").replace("\u00a0", " ")
    text = re.sub(r"(?<=\w)-\n(?=\w)", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def term_count(text: str, term: str) -> int:
    return len(re.findall(re.escape(term), text, flags=re.IGNORECASE))


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def render_plot(dimensions: Counter, path: Path) -> None:
    width, height = 1100, 620
    image = Image.new("RGB", (width, height), "#f5f1e8")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=22)
    title_font = ImageFont.load_default(size=34)
    draw.text((70, 48), "Cobertura de evidencia por dimensión", fill="#173d3a", font=title_font)
    draw.text((72, 102), "Cantidad de hallazgos curados; no representa magnitud de riesgo", fill="#5f6e6f", font=font)
    items = list(dimensions.items())
    maximum = max((value for _, value in items), default=1)
    baseline = 510
    chart_height = 310
    slot = 900 / max(len(items), 1)
    for index, (label, value) in enumerate(items):
        left = 100 + index * slot
        bar_width = min(120, slot * 0.56)
        bar_height = chart_height * value / maximum
        draw.rounded_rectangle((left, baseline - bar_height, left + bar_width, baseline), radius=12, fill="#2f736a")
        draw.text((left + bar_width / 2 - 7, baseline - bar_height - 34), str(value), fill="#173d3a", font=font)
        draw.text((left, baseline + 18), label, fill="#33494a", font=font)
    draw.line((72, baseline, 1030, baseline), fill="#aab6ae", width=2)
    image.save(path)


def notebook_for(source: dict, output_dir: Path) -> dict:
    source_json = json.dumps(source, ensure_ascii=False, indent=2)
    code = f'''from pathlib import Path
import csv, json, re
from collections import Counter
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader

SOURCE = json.loads(r\'''{source_json}\''')
cwd = Path.cwd()
root = cwd.parents[1] if cwd.name == SOURCE["id"] else cwd
pdf_path = root / SOURCE["pdf"]
out = root / "extraccion_academica" / SOURCE["id"]
reader = PdfReader(str(pdf_path))
raw = "\\n\\n".join(page.extract_text() or "" for page in reader.pages)
clean = raw.replace("\\u00ad", "").replace("\\u00a0", " ")
clean = re.sub(r"(?<=\\w)-\\n(?=\\w)", "", clean)
clean = re.sub(r"[ \\t]+", " ", clean)
clean = re.sub(r"\\n{{3,}}", "\\n\\n", clean).strip()
(out / "texto_normalizado.txt").write_text(clean, encoding="utf-8")
counts = [{{"termino": term, "apariciones": len(re.findall(re.escape(term), clean, re.I))}} for term in SOURCE["terms"]]
with (out / "perfil_terminos.csv").open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["termino", "apariciones"])
    writer.writeheader(); writer.writerows(counts)
counts'''
    plot_code = '''evidence = json.loads((out / "evidencia_curada.json").read_text(encoding="utf-8"))
dimensions = Counter(row["dimension"] for row in evidence)
image = Image.new("RGB", (1100, 620), "#f5f1e8")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=22)
draw.text((70, 48), "Cobertura de evidencia por dimensión", fill="#173d3a", font=ImageFont.load_default(size=34))
items = list(dimensions.items()); maximum = max(dimensions.values(), default=1)
for index, (label, value) in enumerate(items):
    slot = 900 / max(len(items), 1); left = 100 + index * slot; bar_width = min(120, slot * .56)
    bar_height = 310 * value / maximum
    draw.rounded_rectangle((left, 510 - bar_height, left + bar_width, 510), radius=12, fill="#2f736a")
    draw.text((left, 528), label, fill="#33494a", font=font)
image.save(out / "cobertura_evidencia.png")
image'''
    return {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"# ETL y EDA — {source['id']}\n",
                    "Cuaderno reproducible para extraer texto del PDF original, normalizarlo, perfilar términos y visualizar la cobertura de la evidencia curada.\n\n",
                    f"**Referencia APA 7:** {source['apa']}\n",
                ],
            },
            {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": code.splitlines(keepends=True)},
            {"cell_type": "markdown", "metadata": {}, "source": ["## EDA de la evidencia curada\n", "El gráfico resume dimensiones, no magnitudes de riesgo ni causalidad individual.\n"]},
            {"cell_type": "code", "execution_count": None, "metadata": {}, "outputs": [], "source": plot_code.splitlines(keepends=True)},
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    consolidated: list[dict] = []
    manifest: list[dict] = []

    for source in SOURCES:
        pdf_path = ROOT / source["pdf"]
        if pdf_path.read_bytes()[:5] != b"%PDF-":
            raise ValueError(f"No es un PDF válido: {pdf_path}")

        reader = PdfReader(str(pdf_path))
        raw_text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        clean_text = normalize(raw_text)
        output_dir = OUTPUT_ROOT / source["id"]
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "texto_normalizado.txt").write_text(clean_text, encoding="utf-8")

        counts = [{"termino": term, "apariciones": term_count(clean_text, term)} for term in source["terms"]]
        write_csv(output_dir / "perfil_terminos.csv", counts)

        rows = []
        for row in EVIDENCE:
            if row["source_id"] != source["id"]:
                continue
            enriched = {**row, "cita_apa": source["apa"], "url": source["url"]}
            rows.append(enriched)
            consolidated.append(enriched)
        write_csv(output_dir / "evidencia_curada.csv", rows)
        (output_dir / "evidencia_curada.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

        dimensions = Counter(row["dimension"] for row in rows)
        render_plot(dimensions, output_dir / "cobertura_evidencia.png")

        summary = {
            "source_id": source["id"],
            "pdf": source["pdf"],
            "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
            "pages": len(reader.pages),
            "characters_raw": len(raw_text),
            "characters_clean": len(clean_text),
            "evidence_records": len(rows),
            "term_profile": counts,
        }
        (output_dir / "resumen_etl.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        notebook = notebook_for(source, output_dir)
        (output_dir / "analisis_etl_eda.ipynb").write_text(json.dumps(notebook, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest.append(summary)

    (OUTPUT_ROOT / "catalogo_evidencia.json").write_text(json.dumps(consolidated, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(OUTPUT_ROOT / "catalogo_evidencia.csv", consolidated)
    (OUTPUT_ROOT / "manifiesto_fuentes.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Procesadas {len(SOURCES)} fuentes y {len(consolidated)} hallazgos curados.")


if __name__ == "__main__":
    main()
