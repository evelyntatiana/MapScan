# Extracción académica reproducible

Cada subdirectorio corresponde a una fuente y contiene:

- `analisis_etl_eda.ipynb`: cuaderno Jupyter/Colab reproducible.
- `texto_normalizado.txt`: texto extraído y limpiado del PDF.
- `perfil_terminos.csv`: frecuencia no sensible a mayúsculas de términos definidos por fuente.
- `evidencia_curada.csv` y `.json`: hallazgos para la interfaz, con dimensión, localización, APA 7 y URL.
- `cobertura_evidencia.png`: EDA visual del número de hallazgos por dimensión.
- `resumen_etl.json`: páginas, tamaños, SHA-256 y métricas de extracción.

Los archivos `catalogo_evidencia.csv/.json` consolidan la evidencia y `manifiesto_fuentes.json` permite verificar integridad. El proceso incluye **extracción, transformación, limpieza y análisis exploratorio de datos (EDA)**. Se reproduce con:

```powershell
python scripts/build_academic_evidence.py
```

La curación distingue evidencia observada de interpretación contextual. “Origen local” significa fuente plausible para Cuenca según el inventario y la literatura consultada; no es atribución causal a una instalación concreta. Las variables meteorológicas se tratan como modificadores de formación, transporte, dispersión o remoción, no como contaminantes.
