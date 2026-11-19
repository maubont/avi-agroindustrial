# Proyecto Avícola 1 (`AV-1`) · Plan Financiero y Simulador de Rentabilidad Avícola

> **Propósito del proyecto:** Servir como **plan financiero maestro y simulador gerencial estándar** (tropicalizado con precios reales de Norte de Santander / Cúcuta) para evaluar la rentabilidad del negocio de engorde y beneficio de pollo **Ross 308 AP**, comparando escenarios antes de comprometer capital.

- **Libro de Excel principal:** [AV1_Plan_Financiero_Avicola.xlsx](file:///c:/Dev/Planta%20de%20Concentrados/avicola_01_plan_financiero/AV1_Plan_Financiero_Avicola.xlsx) (`5` hojas, `0` errores de fórmula verificados en Excel COM)
- **Generador reproducible:** [generar_plan_financiero.js](file:///c:/Dev/Planta%20de%20Concentrados/avicola_01_plan_financiero/generar_plan_financiero.js)
- **Proyecto operativo hermano:** [Proyecto Avícola 2 (`AV-2`) · Operación Activa en Granja](file:///c:/Dev/Planta%20de%20Concentrados/avicola_02_operacion_granja/Plan_Ejecutivo_y_Auditoria_AV2.md)

---

## 1. Arquitectura del Libro (Lectura en < 60 Segundos)

| Hoja | Nombre en Excel | Qué responde |
| :---: | :--- | :--- |
| **Portada** | `0_Resumen_Ejecutivo` | P&L cronológico **"De la Granja a la Venta Final"**, matriz de sensibilidad **Precio × Mortalidad (4×3)** y mensajes clave para gerencia/inversionistas. |
| **Hoja 1** | `1_Precios_Mercado_Regional` | Todas las celdas amarillas editables: alimento comercial **Solla**, pollito local (`$4.500`) vs. directo Bucaramanga (`$3.200`), arriendo, colaborador, sacrificio (`$1.500/ave`), logística post-sacrificio y fórmula propia con flete/pigmento. |
| **Hoja 2** | `2_Rentabilidad_por_Lote` | Cascada completa **Crianza Vivo → Beneficio → Canal con Menudencias** a **42 días (`6` semanas)** comparando: **(A)** 800 aves Comercial, **(B)** 800 aves Alimento Propio `d22+`, y **(C)** Referencia Lote 1 (`600` aves `@ $4.500`). |
| **Hoja 3** | `3_Proyeccion_Anual_12_Meses` | Flujo anual real de **6 lotes (12 meses completos de arriendo = `$11,0M/año`)** y separación entre **Gasto Operativo Anual** y **Capital de Trabajo Pico (`$15,11M`)**. |
| **Hoja 4** | `4_Glosario_y_Ross308` | Definición en lenguaje sencillo de cada concepto comercial/zootécnico, rendimientos exactos Ross 308 AP 2021 y tabla oficial días `28–49`. |

---

## 2. Cascada "De la Granja a la Venta Final" — Meta 6 Semanas / 42 Días (Cifras Verificadas en Excel COM)

| Etapa del Negocio (Orden Cronológico) | Lote 800 Aves (Alimento Comercial) | Lote 800 Aves (Alimento Propio d22+) | Ref. Lote 1 (600 Aves `@ $4.500`) | Proyección Anual (6 Lotes · 12 Meses) |
| :--- | :---: | :---: | :---: | :---: |
| Pollos iniciados / finales (`3,0%` bajas) | `800` / **`776`** | `800` / **`776`** | `600` / **`582`** | `4.600` / **`4.462`** |
| Peso vivo total en granja (`2,995 kg/ave` d42) | `2.324,1 kg` | `2.324,1 kg` | `1.743,1 kg` | `13.363,7 kg` |
| **1. Costo Total Crianza en Granja (Pollo vivo, COP)** | **`$13.193.800`** | **`$12.285.000`** | **`$10.986.900`** | **`$79.820.700`** |
| &nbsp;&nbsp;&nbsp;↳ Costo por kilo **VIVO** en granja (sin sacrificio) | `$5.677/kg` | `$5.286/kg` | `$6.303/kg` | `$5.973/kg` |
| &nbsp;&nbsp;&nbsp;↳ Utilidad alternativa vendiendo **VIVO** (`$7.400/kg`) | `$4.004.688` | `$4.913.488` | `$1.911.966` | `$19.070.606` |
| **2. Servicio de sacrificio en beneficiadero (`$1.500/ave`)** | `$1.164.000` | `$1.164.000` | `$873.000` | `$6.693.000` |
| **3. Inversión Total Puesta en Canal (COP)** | **`$14.357.800`** | **`$13.449.000`** | **`$11.859.900`** | **`$86.513.700`** |
| Carne vendible en canal con menudencias (`82,5%`, kg) | `1.917,4 kg` | `1.917,4 kg` | `1.438,0 kg` | `11.025,0 kg` |
| &nbsp;&nbsp;&nbsp;↳ **Costo final por kilo en CANAL (Punto equilibrio)** | **`$7.488/kg`** | **`$7.014/kg`** | **`$8.247/kg`** | **`$7.847/kg`** |
| **4. Precio de venta referencia en canal (`COP/kg`)** | `$11.500/kg` | `$11.500/kg` | `$11.500/kg` | `$11.500/kg` |
| **5. Ingreso Bruto Total de la Venta (COP)** | `$22.050.089` | `$22.050.089` | `$16.537.566` | `$126.788.009` |
| **6. UTILIDAD NETA LIBRE VENDIENDO PROCESADO (COP)** | **`$7.692.289`** | **`$8.601.089`** | **`$4.677.666`** | **`$40.274.309`** |
| &nbsp;&nbsp;&nbsp;↳ Margen neto sobre las ventas (%) | `34,9%` | `39,0%` | `28,3%` | `31,8%` |
| &nbsp;&nbsp;&nbsp;↳ Retorno s/capital invertido (Ciclo 42d / Anual s/Pico) | `53,6%` | `64,0%` | `39,4%` | **`266,6%`** *(s/ `$15,11M` pico)* |
| **Ganancia extra por procesar vs. vender vivo (`$7.400/kg`)** | **`+$3.687.601`** | **`+$3.687.601`** | **`+$2.765.700`** | **`+$21.203.703`** |

> [!NOTE]
> - **Comparativa Meta 6 Semanas (`42d`) vs. Peso `2,70 kg` sin pluma:** Con el plan semanal de campo **`4.445 g/ave`** (`Consumo Pollo`: `175 g` S1 + `1.029 g` S2–S3 + `3.241 g` S4–S6) a los **42 días**, el pollo Ross 308 AP mixto alcanza **`2,995 kg` vivos = `~2,47 kg` en canal con menudencias (`82,5%`)** (`2,24 kg` eviscerado seco `74,75%`). Si el comprador exige **`2,70–2,72 kg` con menudencias**, extender **+3 días hasta el Día 45** (`3,297 kg` vivos).
> - **Punto de indiferencia Canal vs. Vivo:** Desde **`$9.577/kg`** en canal (con menudencias), procesar pagando `$1.500/ave` iguala la venta vivo en puerta de granja a `$7.400/kg` (logística post-sacrificio editable en `$0` base en `1_Precios_Mercado_Regional`).

---

## 3. Análisis de Sensibilidad (Lote 800 Aves Comercial · 42 Días)

| Precio Venta Canal (c/menudencias) | Lectura Cúcuta | Mortalidad `3,0%` | Mortalidad `6,0%` | Mortalidad `9,0%` | Impacto `9%` vs `3%` |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`$9.500/kg`** | Piso de indiferencia (~venta vivo) | `$3.857.491` | `$3.613.131` | `$3.179.172` | `-$678.319` |
| **`$10.500/kg`** | Mayorista conservador (baja estacional) | `$5.774.890` | `$5.471.229` | `$4.977.969` | `-$796.921` |
| **`$11.500/kg`** | **ESCENARIO BASE ACTUAL** | **`$7.692.289`** | **`$7.329.327`** | **`$6.776.766`** | `-$915.523` |
| **`$12.500/kg`** | Venta directa / asaderos / pico Navidad | `$9.609.688` | `$9.187.425` | `$8.575.563` | `-$1.034.125` |

---

## 4. Mejoras Técnico-Económicas de Auditoría Incorporadas

1. **Alineación exacta a 6 semanas (`42` días) con tabla `Consumo Pollo`:** Consumo base calibrado en **`4.445 g/ave`** (`0,175` d1–7 + `1,029` d8–21 + `3,241` d22–42), dando exactamente **`67` bultos** (`600` aves `@ 3%` bajas) y **`89` bultos** (`800` aves `@ 3%` bajas), con **`$0` de diferencia** frente a `AV-2`.
2. **Eliminación de sesgo en arriendo anual (`6` vs. `12` meses):** La proyección anual carga los **`12,0` meses reales (`$11,0M/año`)** y separa el gasto operativo anual del **Capital de Trabajo Pico (`$15.107.800`)**.
3. **Alimento Propio (`F2`) real en granja (`d22+`):** Además de `+3,8%` consumo harina vs. pelet (`89 -> 91` bultos), incorpora **`$3.800/bulto`** (`$3.000` flete planta→granja + `$800` pigmento xantofila para piel amarilla) — aun así ahorra **`-$908.800/lote`** (**`-$474/kg` canal**, sujeto a escala de planta `>=45 t/mes`).
4. **Rendimiento eviscerado seco exacto (Ross 308 AP PDF 2021):** Actualizado a **`74,75%`** para pollo de `~3,00 kg` vivos en **Día 42** (`75,14%` a `3,30 kg` en día 45; `75,51%` a `3,59 kg` en día 48).
