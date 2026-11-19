# Planta de Concentrados — Pollo de engorde en harina (Cúcuta, Norte de Santander)

Proyecto para montar una planta de alimento balanceado **en harina (mash)** para pollo de engorde en las etapas de **crecimiento y finalización (día 21 → sacrificio)**. Esas etapas no necesitan peletizadora, lo que mantiene la línea sencilla, barata y con poca energía. El **aceite crudo de palma** de la extractora es la fuente de energía.

## Portafolio de Proyectos ([`TABLERO_SEGUIMIENTO.md`](TABLERO_SEGUIMIENTO.md))

👉 **[TABLERO_SEGUIMIENTO.md](TABLERO_SEGUIMIENTO.md)** — Centro de control del portafolio dividido claramente en dos divisiones:

### División Avícola (Foco Actual)
1. **Proyecto Avícola 1 (`AV-1`) · Plan Financiero y Simulador de Rentabilidad Avícola:** [`Resumen_Ejecutivo_AV1.md`](avicola_01_plan_financiero/Resumen_Ejecutivo_AV1.md) · [`AV1_Plan_Financiero_Avicola.xlsx`](avicola_01_plan_financiero/AV1_Plan_Financiero_Avicola.xlsx)
2. **Proyecto Avícola 2 (`AV-2`) · Operación Activa en Granja — Lotes 1 a 3 (Nov 2026 – Ene 2027):** [`Plan_Ejecutivo_y_Auditoria_AV2.md`](avicola_02_operacion_granja/Plan_Ejecutivo_y_Auditoria_AV2.md) · [`AV2_Operacion_Granja_Lotes_1_a_3.xlsx`](avicola_02_operacion_granja/AV2_Operacion_Granja_Lotes_1_a_3.xlsx)

### Proyectos Industriales Hermanos
3. **Proyecto Industrial `IND-ALIM` · Planta de Concentrado de Pollo en Molienda Gruesa (`RL L09`):** [`docs/`](docs/) y [`modelo/`](modelo/)
4. **Proyecto Industrial `IND-PALMA` · Biorrefinerías de Palma de 2 y 4 t RFF/h + Puente Coopar:** [`proyecto_extractora/README.md`](proyecto_extractora/README.md)

## Estado Proyecto 1: Planta de Concentrados (12-nov-2026)

| Frente | Estado | Documento |
|---|---|---|
| Decisiones tomadas (resumen del chat previo) | ✅ Consolidado | [00_bitacora_decisiones.md](docs/00_bitacora_decisiones.md) |
| Modelo de negocio | 🟡 Borrador con números de planeación | [01_modelo_de_negocio.md](docs/01_modelo_de_negocio.md) |
| Producto y formulación | 🟢 Fórmulas F1/F2 re-optimizadas contra Ross 2022 (verificado) | [02_producto_y_formulacion.md](docs/02_producto_y_formulacion.md) |
| Planta industrial | 🟡 Concepto por fases | [03_planta_industrial.md](docs/03_planta_industrial.md) |
| Abastecimiento y proveedores | 🔴 Falta cotizar | [04_abastecimiento_proveedores.md](docs/04_abastecimiento_proveedores.md) |
| Regulación ICA y calidad | 🟡 Ruta identificada | [05_regulacion_calidad.md](docs/05_regulacion_calidad.md) |
| Oportunidades de mejora | 🟢 Lista priorizada | [06_oportunidades_mejora.md](docs/06_oportunidades_mejora.md) |
| Modelo de costeo (Excel) | 🟢 Funcional | [modelo/Modelo_Costeo_Concentrados.xlsx](modelo/Modelo_Costeo_Concentrados.xlsx) |

> **Proyecto independiente (en carpeta aparte):** [proyecto_extractora/README.md](proyecto_extractora/README.md) — Estructuración de Plantas Extractoras de Palma de 2 y 4 t RFF/h con aprovechamiento total de subproductos y modelo de participación accionaria.

## Estructura

```
docs/                     Documentos del proyecto (negocio, producto, planta, regulación)
docs/referencias/         Fuentes primarias (Ross 2022 Tabla 2 en PDF)
modelo/datos/*.json       Matriz de ingredientes, precios, requerimientos, supuestos del negocio
modelo/formulador.js      Optimizador de mínimo costo + generador del Excel
modelo/Modelo_Costeo_Concentrados.xlsx   Costeo: fórmulas, costo por pollo, punto de equilibrio
modelo/resultados_formulacion.md         Última corrida del optimizador
```

Para re-formular con nuevos precios o análisis: edite `modelo/datos/ingredientes.json` y ejecute

```powershell
cd modelo; node formulador.js
```

## Números clave (supuestos de planeación, por validar)

- Costo de materias primas: **≈ 1.850–1.930 COP/kg** (bulto 40 kg ≈ 75.000 COP), frente a un concentrado comercial de **105.000–135.000 COP/bulto**.
- Punto de equilibrio con planta formal (personal, arriendo, asesor técnico): **≈ 50 t/mes ≈ 32 lotes de 500 pollos al mes**. Un solo lote de 500 aves consume ≈ 1,6 t, así que **la planta solo se paga vendiendo a terceros**.
- La fitasa ahorra ≈ 29.000 COP/t y deja el aceite en ≈ 3,6 %.

## Próximos 5 pasos

1. Cotizar en firme (puesto en Cúcuta) maíz, soya 46, premix, aminoácidos, fosfato y fitasa → actualizar `ingredientes.json`.
2. Sondear la demanda: 15–20 granjas de engorde en un radio de 100 km (volumen, marca actual, precio y si aceptarían harina).
3. Hacer un **lote piloto** con la granja del hermano (harina propia contra comercial en el mismo galpón) para medir la penalización real de conversión.
4. Contratar el asesor técnico (MV o zootecnista) e iniciar el registro ICA como **fabricante para autoconsumo** (Res. 061252/2020).
5. Cotizar los equipos de la fase 0/1 (molino de martillos, mezcladora, tanque de aceite calentado).
