# 02 · Producto y formulación

## 1. Portafolio propuesto

| SKU | Etapa | Base Ross 2022 (Tabla 2) | Presentación |
|---|---|---|---|
| **F1 Crecimiento** | d21–28 | "Crecimiento" (11–24 d): 3.050 kcal, Lys dig. 1,18 % | Harina, bulto 40 kg |
| **F2 Finalizador** | d29–sacrificio | "Finalizador 1" (25–39 d): 3.100 kcal, Lys dig. 1,08 % | Harina, bulto 40 kg |

**Recomendación de lanzamiento:** empezar con **un solo SKU, "Engorde-Finalizador harina" (d22–sacrificio)**, formulado como F2 con unos 3–4 % más de aminoácidos. Así hay un solo inventario y un solo registro ICA al principio, y para el cliente la compra es más simple. F1 se agrega cuando el volumen lo justifique. Si el cliente vende a los 35–38 días, conviene subir la densidad de aminoácidos (Ross sugiere hasta +5 % cuando se busca rendimiento en canal).

**Retiro:** si la fórmula lleva anticoccidial, se necesita una **versión de retiro** sin fármaco para los últimos días. Ross dice que puede formularse igual que el finalizador.

## 2. Fórmulas re-optimizadas (kg/t)

Mínimo costo con [formulador.js](../modelo/formulador.js), cumpliendo el 100 % de los mínimos Ross 2022 Tabla 2. Matriz y precios de referencia. Detalle en [resultados_formulacion.md](../modelo/resultados_formulacion.md).

| Ingrediente | F1 chat | F2 chat | **F1 base** | **F2 base** | **F1 fitasa** | **F2 fitasa** |
|---|---:|---:|---:|---:|---:|---:|
| Maíz amarillo | 581,4 | 629,0 | 575,6 | 611,0 | 587,7 | 623,1 |
| Soya 46 % | 333,0 | 292,0 | 342,3 | 311,1 | 340,6 | 309,5 |
| Aceite crudo de palma | 44,9 | 42,7 | 40,0 | 41,1 | 35,5 | 36,5 |
| L-lisina HCl | 2,8 | 2,7 | 2,5 | 2,1 | 2,5 | 2,1 |
| DL-metionina | 3,6 | 3,3 | 3,4 | 3,0 | 3,4 | 3,0 |
| L-treonina | 1,5 | 1,3 | 1,2 | 0,9 | 1,2 | 0,9 |
| L-valina | — | — | 0,3 | 0,1 | 0,3 | 0,1 |
| Carbonato de calcio | 11,0 | 9,7 | 10,7 | 9,4 | 10,5 | 9,2 |
| Fosfato monocálcico | 13,5 | 11,0 | 14,6 | 11,8 | 8,8 | 6,1 |
| Sal / bicarbonato | 3,0 / 1,5 | 3,0 / 1,5 | 3,1 / 1,4 | 3,1 / 1,4 | 3,1 / 1,4 | 3,1 / 1,4 |
| Premix vit-min | 3,0 | 3,0 | 3,0 | 3,0 | 3,0 | 3,0 |
| Cloruro de colina 60 % | 0,8 | 0,8 | 0,9 | 0,8 | 0,9 | 0,8 |
| Secuestrante micotoxinas | — | — | 1,0 | 1,0 | 1,0 | 1,0 |
| Antioxidante (alimento) | — | — | 0,125 | 0,125 | 0,125 | 0,125 |
| Fitasa 500 FTU/kg | — | — | — | — | 0,1 | 0,1 |
| **Materias primas COP/kg** | 1.919 | 1.868 | 1.925 | 1.882 | **1.896** | **1.853** |

**Lectura:**
- Las fórmulas del chat, evaluadas con esta matriz, quedan cortas en P disponible (94 %), valina (95 %), isoleucina y colina. La versión **base** las corrige por unos 6–14 COP/kg más.
- **La fitasa paga sola:** reemplaza unos 5,7 kg/t de fosfato y libera espacio para que el maíz sustituya aceite. Ahorra ≈ 29.000 COP/t con una matriz conservadora (solo P y Ca). **Recomendada.**
- La L-valina entra en dosis muy bajas. Si no se consigue en volumen pequeño, se puede subir 1–2 % la soya.
- **Proteína cruda en la etiqueta:** ≈ 21,2 % (F1) y 20,0 % (F2). Grasa (EE) ≈ 6,6–6,8 %, por encima de la mayoría de las marcas. Es un **argumento de venta** ("más energía") y hay que declararlo en el registro ICA.

## 3. Especificación del aceite crudo de palma (compra)

| Parámetro | Límite propuesto | Frecuencia |
|---|---|---|
| Ácidos grasos libres (como palmítico) | ≤ 5 % (típico 2,5–3,5 %) | Cada carga |
| Humedad + impurezas | ≤ 0,5 % (según norma de la extractora) | Cada carga |
| Índice de peróxidos | ≤ 5 meq O₂/kg | Cada carga |
| Color | Rojo-naranja (los carotenos se conservan) | Visual |
| Almacenamiento máximo en planta | 30 días, tanque cerrado | — |

## 4. Control de calidad del producto

| Control | Materia prima | Producto terminado |
|---|---|---|
| Humedad | Maíz ≤ 13–14 % (cada carga) | ≤ 12,5 % |
| Aflatoxinas (tira rápida) | Maíz, **cada carga**; rechazo > 20 ppb | Mensual |
| Proteína / grasa (laboratorio externo) | Soya y maíz cada proveedor nuevo y mensual | Mensual por SKU |
| Granulometría (tamices) | Caliza GMD 300–350 µm (Ross 2022) | Semanal: maíz GMD 1.200–2.000 µm; dieta DGM 1.000–1.500 µm; finos < 1 mm por debajo de 25 % |
| Homogeneidad de mezcla (CV, trazador sal/cloruros) | — | Al instalar la mezcladora y cada 6 meses; CV < 10 % |
| Muestra de retención | — | 1 kg por lote, guardada 3 meses |

## 5. Pendientes técnicos (con el asesor)

- Anticoccidial: ionóforo o químico, dosis y **tiempo de retiro**, o programa con vacuna.
- Pigmentación: averiguar si el mercado de Cúcuta paga más por pollo amarillo. Si sí, versión "dorada" con xantofilas (extracto de flor de cempasúchil).
- Validar la penalización de conversión de la harina en el lote piloto (mismo galpón, dos grupos, peso y consumo semanal).
- Reemplazar la matriz con el análisis del maíz y la soya del proveedor elegido.
