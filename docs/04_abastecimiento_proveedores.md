# 04 · Abastecimiento y proveedores

> No se inventan contactos. La tabla lista **a quién buscar** y **qué pedir**. Los nombres de empresa son referencias públicas que hay que confirmar.

## 1. Participación en el costo (fórmula F2 con fitasa)

| Insumo | kg/t | % del costo aprox. | Prioridad de negociación |
|---|---:|---:|---|
| Maíz amarillo | ≈ 620 | ≈ 45 % | 🔴 Máxima |
| Soya 46 % | ≈ 310 | ≈ 36 % | 🔴 Máxima |
| Aceite crudo de palma | ≈ 37 | ≈ 8 % | 🟡 (ventaja local) |
| Premix | 3 | ≈ 3,5 % | 🟡 |
| Aminoácidos (Lys, Met, Thr, Val) | ≈ 6 | ≈ 3,5 % | 🟡 |
| Fosfato, caliza, sal, bicarbonato, aditivos | ≈ 20 | ≈ 3 % | 🟢 |

## 2. Fuentes a contactar

| Insumo | Tipo de proveedor | Referencias para buscar | Qué pedir |
|---|---|---|---|
| Maíz amarillo importado | Importadores directos en puerto (Barranquilla/Cartagena) o mayoristas en Bucaramanga | **Seaboard Overseas Colombia (Contilatin)**, **Hacienda S.A.S.** (Galapa/Barranquilla), **Italcol (División Materias Primas)**, **Agromat**, Bolsa Mercantil de Colombia | Precio **puesto en Cúcuta** o FOB puerto/Bucaramanga, humedad, granos dañados, **aflatoxinas**, mínimo por despacho (bulto 40–50 kg, big-bag 1–1,5 t o tractomula 34 t) |
| Maíz nacional (cosecha) | Productores y secadoras de la región, Cesar o Meta | Fenalce seccional | Precio en cosecha, secado, certificado de aflatoxinas |
| Torta/harina de soya 46–48 % | Mismos importadores de maíz en Barranquilla/Cartagena y distribuidores en Bucaramanga; extractoras de la Orinoquía | **Seaboard Overseas (Contilatin)**, **Italcol Materias Primas** (bulto 40 kg o granel, mín. 46 % PC), **Hacienda S.A.S.**, **Agromat**, mayoristas de Bucaramanga/Girón | PC garantizada (≥ 46 %), **actividad ureásica** (máx. 0,08 ΔpH) y solubilidad en KOH (78–85 %), humedad, precio por bulto/big-bag/tractomula |
| Aceite crudo de palma | **Coopar Ltda. / Extractoras de la zona** (Corredor Astilleros – Tibú, Norte de Santander) | **Ing. Billy Ramírez** (Director de Planta, Coopar) · Compra comercial de Torta de Palmiste expeller en extractoras vecinas (p. ej. Oleonorte) | Precio a puerta de planta, AGL ($<3,5\text{ \%}$), H+I ($<0,5\text{ \%}$), peróxidos y suministro de **Lodo espeso de clarificación (Coopar)** para el módulo de bio-fermentación |
| Premix vitamínico-mineral | Fabricantes con operación en Colombia | Carval (Cali), Cargill-Provimi (Bogotá/Funza), DSM-Firmenich (Tocancipá) | Premix **a la medida de Ross finalizador** (Tabla 2: vitaminas y trazas por kg); bultos de 20–25 kg |
| Aminoácidos, fitasa, colina, secuestrante | Distribuidores de aditivos (a menudo los mismos del premix) | Representantes de Evonik, CJ, Ajinomoto/Metex, ADM | Precio por bulto de 25 kg, **matriz nutricional de la fitasa** |
| Fosfato monocálcico, caliza, sal, bicarbonato | Distribuidores de insumos pecuarios / minería local (caliza) | Agropecuarias mayoristas de Cúcuta y Bucaramanga | Ficha técnica: % Ca, % P, flúor (fosfato) |
| Empaque | Fabricantes de sacos de polipropileno laminado | — | Bulto de 40 kg con impresión y espacio para el lote |

## 3. Tácticas de compra

1. **Volumen mínimo:** al inicio el maíz y la soya se compran de a tractomula (≈ 34 t), lo que equivale a unas 3–4 semanas de producción con 50–60 t/mes. Ese es el capital de trabajo mínimo real.
2. **Núcleo comercial temporal:** mientras el volumen es pequeño, comprar un **núcleo** que ya traiga premix, aminoácidos, fitasa y colina (20–30 kg/t) simplifica la compra y el pesaje. Luego se pasa a ingredientes sueltos para ahorrar.
3. **Comprar en bloque con otros:** unirse con otros productores o con la propia granja para completar tractomulas.
4. **Re-formular cada mes** con los precios del momento (`node formulador.js`). La soya y el maíz se sustituyen entre sí según el precio.

## 4. Plantilla de solicitud de cotización

```
Asunto: Solicitud de cotización – planta de alimento balanceado (Cúcuta)
Producto: ______  Especificación: ______  Volumen mensual estimado: ___ t
Precio puesto en: Cúcuta (dirección)   Forma: granel / bulto ___ kg / big-bag
Favor incluir: ficha técnica, certificado de análisis por lote, tiempo de entrega,
condiciones de pago, mínimo por pedido, vigencia del precio.
```
