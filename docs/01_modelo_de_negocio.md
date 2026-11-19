# 01 · Modelo de negocio

> Cifras = supuestos de planeación del Excel ([Negocio](../modelo/Modelo_Costeo_Concentrados.xlsx)). Cámbielos allí y todo se recalcula.

## 1. Propuesta de valor

**"Engorde y finalizador en harina, fresco, hecho en Cúcuta, 10–15 % más barato que las marcas nacionales"**, para avicultores pequeños y medianos de Norte de Santander.

Ventajas que se pueden defender:
- **Aceite de palma propio o de la extractora cercana**: energía barata y sin el flete desde el interior.
- **Alimento fresco**: se fabrica por pedido y se entrega en menos de 7 días, mientras una marca nacional pasa semanas en bodegas de distribuidores.
- **Planta simple** (sin peletizadora): poca inversión, poca energía, operación con 3 personas.
- **Cercanía y servicio técnico**: visita a la granja y seguimiento de la conversión, que es lo que las marcas grandes no le dan al productor pequeño.

## 2. El problema central: harina frente a pellet

El pollo **convierte mejor con pellet o migaja** que con harina: desperdicia menos, come más rápido y no escoge las partículas. El concentrado comercial de engorde en Colombia se vende peletizado o "crombo". Nuestra harina tiene que **compensar con precio**:

| Concepto | Supuesto Inicial (`negocio_auditado.json`) | Realidad Solla Cúcuta (Nov 2026) |
|---|---|---|
| Precio comercial de referencia (Engorde) | 115.000 COP/bulto (`2.875/kg`) | **93.400 COP/bulto** (`2.335/kg` Broiler I Dorado Elite) |
| Iniciación / Preiniciación comercial | Incluido como referencia | Masterpollito **$106.500** · Nutrepollo **$96.200/bulto** |
| Penalización de conversión supuesta (harina vs. pellet) | 5,0 %–6,5 % (`audit_fitasa`) / 3,8 % (`L09` molienda VFD) | **Validar en piloto Camada #1 / #2** |
| Precio máximo competitivo de la harina | ≈ 108.000–109.500 COP/bulto | **$87.700** (6,5 %) a **$89.981/bulto** (3,8 %) |
| Costo Autoconsumo puesto planta (`Auditoria_Realista`) | ≈ 2.025,2 COP/kg (`audit_fitasa`) / **1.834,8** (`L09`) | **Ahorro real vs. Solla $93,4k:** **7,6 %** (`audit_fitasa`) vs. **18,4 %** (`L09` det.) / **16,5 %** (`L09` rob.) |

> **Lección estratégica (auditoría real nov-2026):** Con el precio real de Solla Broiler I Dorado en Cúcuta (**$93.400/bulto**), una fórmula tradicional sin optimización RL (`audit_fitasa`, $2.025,2/kg) deja margen muy estrecho frente a conversión en harina. La arquitectura **RL `L09`** ($1.825/kg en planta; $1.920/kg puesto en galpón incl. **$3.800/bulto** de flete + pigmento xantofila amarillo oro; 3,8 % penalización molienda VFD = **$1.993/kg** equivalente) sí sostiene **14,6 % de ahorro neto real en granja** (`$13.682/bulto` equivalente; +`$1.081.000` por lote de 800 aves en `AV-1` si la planta opera `>=45 t/mes`). Ver operación en [AV-2 Operación Activa en Granja](../avicola_02_operacion_granja/Plan_Ejecutivo_y_Auditoria_AV2.md).

**Mitigaciones:** (a) granulometría gruesa y uniforme (ver [03](03_planta_industrial.md)); (b) el 4 % de aceite reduce el polvo y la segregación de la harina; (c) asesorar sobre comederos y manejo; (d) a mediano plazo, **migaja o pellet con vapor de la biomasa de la extractora** ([06](06_oportunidades_mejora.md)).

## 3. Clientes y canales

| Segmento | Por qué compraría | Cómo llegarle |
|---|---|---|
| **Granja del hermano** (ancla) | Ahorro directo; sirve de vitrina | Autoconsumo, primer registro ICA |
| Engordadores pequeños (500–5.000 aves/lote) | Precio, crédito corto, entrega en finca | Venta directa y visitas técnicas |
| Agropecuarias / distribuidores del área metropolitana de Cúcuta y municipios | Mejor margen que con las marcas nacionales | Margen de 8–12 %, material POP |
| Pollo campesino / semipesado | Aceptan mejor la harina | Distribuidores rurales |
| Integraciones medianas (a futuro) | Maquila de su propia fórmula | Contrato de fabricación ([05](05_regulacion_calidad.md)) |

**Programa completo sin peletizar:** el cliente necesita iniciador entre los días 0 y 21. Se puede **distribuir el iniciador de una marca aliada** o comprarlo por maquila a una planta peletizadora. Así se vende "el programa completo" y el cliente no se queda con la marca grande por comodidad.

## 4. Economía unitaria (Excel, escenario con fitasa)

| Indicador | Valor |
|---|---|
| Precio de venta | 2.450 COP/kg |
| Costo variable total (materias primas + merma + empaque + energía + flete + comisión) | ≈ 2.046 COP/kg |
| **Margen de contribución** | **≈ 404 COP/kg (16,5 %)** |
| Costos fijos mensuales con depreciación | ≈ 20,5 M COP |
| **Punto de equilibrio** | **≈ 51 t/mes ≈ 1.270 bultos ≈ 32 lotes de 500 pollos** |
| Utilidad a 150 t/mes | ≈ 40 M COP/mes |
| Recuperación a 150 t/mes (con capital de trabajo) | ≈ 13 meses |

**Sensibilidad crítica:** si las materias primas suben un 10 % (≈ 190 COP/kg) y el precio de venta no sube, el margen cae a la mitad. Hay que **trasladar precios cada mes** y **comprar con cobertura** (contratos de maíz y soya a 60–90 días).

## 5. Modelo por fases

| Fase | Qué es | Volumen | Inversión indicativa* | Hito para pasar a la siguiente |
|---|---|---|---|---|
| **0 · Piloto** | Mezcladora pequeña en la granja, autoconsumo del hermano | 2–10 t/mes | Baja | La conversión real de la harina frente al comercial está medida |
| **1 · Planta harina** | Bodega, molino + mezcladora de 1 t, registro ICA comercial | 50–300 t/mes | ≈ 250 M COP + capital de trabajo | Se superan 100 t/mes de ventas estables |
| **2 · Valor agregado** | Migaja/pellet con caldera de biomasa de palma, línea de ponedoras y ganado | 300–1.000 t/mes | A evaluar | — |

\* Cifras de planeación para cotizar, no presupuestos.

## 6. Riesgos principales

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El mercado rechaza la harina | Alto | Piloto con datos, precio, servicio técnico, migaja en la fase 2 |
| Volatilidad de maíz/soya (CBOT + TRM) | Alto | Precio indexado, compras programadas, fórmula re-optimizada cada mes |
| Aflatoxinas en el maíz | Alto | Análisis rápido por lote, secuestrante, almacenamiento seco |
| Cartera (venta a crédito a granjas) | Medio | Plazo máximo de 15–30 días y pago contra entrega al inicio |
| Mínimos de compra de premix y aminoácidos | Medio | Comprar por bulto con el fabricante de premix; núcleo comercial al inicio |
| Competencia de precio de las marcas grandes | Medio | Nicho de cercanía y servicio, sin pelear la guerra de precios |
