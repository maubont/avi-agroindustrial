# Proyecto Avícola 2 (`AV-2`) · Operación Activa en Granja — Lotes 1 a 3 (Nov 2026 – Ene 2027)

> **Propósito del proyecto:** Plan maestro operativo, flujo de caja semanal y bitácora diaria de campo para ejecutar los **3 primeros lotes reales**: Lote 1 en curso (`600` aves alojadas el **13 de noviembre de 2026**), Lote 2 (`+10` días, `800` aves) y Lote 3 (`800` aves con salida meta **15 de enero de 2027**).

- **Libro de Excel principal:** [AV2_Operacion_Granja_Lotes_1_a_3.xlsx](file:///c:/Dev/Planta%20de%20Concentrados/avicola_02_operacion_granja/AV2_Operacion_Granja_Lotes_1_a_3.xlsx) (`7` hojas, `0` errores de fórmula verificados en Excel COM)
- **Generador reproducible:** [generar_control_operacion.js](file:///c:/Dev/Planta%20de%20Concentrados/avicola_02_operacion_granja/generar_control_operacion.js)
- **Proyecto hermano estándar:** [Proyecto Avícola 1 (`AV-1`) · Plan Financiero y Simulador](file:///c:/Dev/Planta%20de%20Concentrados/avicola_01_plan_financiero/Resumen_Ejecutivo_AV1.md)

---

## 1. Cronograma y Resumen Económico Consolidado — Meta 6 Semanas / 42 Días (De la Granja a la Venta Final)

| Métrica / Etapa | Lote 1 (`600` Aves · Hoy) | Lote 2 (`+10d · 800` Aves) | Lote 3 (`Meta 15-Ene · 800`) | **CONSOLIDADO 3 LOTES** |
| :--- | :---: | :---: | :---: | :---: |
| **Ingreso Día 1 / Inicio Engorde (d22) / Salida (d42)** | `13-nov` / `04-dic` / **`24-dic`** | `23-nov` / `14-dic` / **`03-ene`** | **`05-dic`** *(04-dic c/ayuno)* / `26-dic` / **`15-ene`** | `2.200` pollos alojados |
| Pollos vivos comercializados (`3,0%` bajas) | `582 aves` | `776 aves` | `776 aves` | **`2.134 aves`** |
| Peso vivo producido en granja (`2,995 kg/ave` d42) | `1.743,1 kg` | `2.324,1 kg` | `2.324,1 kg` | **`6.391,3 kg`** |
| Bultos de alimento ppto. (`+bodega 0%` bajas) | `67` (`68` bodega) | `89` | `89` | **`245 bultos`** |
| **Costo Total Crianza en Granja (Pollo Vivo)** | `$10.986.900` | `$13.193.800` | `$13.193.800` | **`$37.374.500`** |
| &nbsp;&nbsp;&nbsp;↳ Costo por kilo **VIVO** en granja (sin sacrificio) | `$6.303/kg` | `$5.677/kg` | `$5.677/kg` | **`$5.848/kg`** *(baja -$626/kg)* |
| Servicio de sacrificio (`$1.500/ave`) | `$873.000` | `$1.164.000` | `$1.164.000` | **`$3.201.000`** |
| **Inversión Total Puesta en Canal (COP)** | **`$11.859.900`** | **`$14.357.800`** | **`$14.357.800`** | **`$40.575.500`** |
| Carne vendible en canal con menudencias (`82,5%`) | `1.438,0 kg` | `1.917,4 kg` | `1.917,4 kg` | **`5.272,8 kg`** |
| &nbsp;&nbsp;&nbsp;↳ **Costo por kilo en CANAL (Punto equilibrio)** | **`$8.247/kg`** | **`$7.488/kg`** | **`$7.488/kg`** | **`$7.695/kg`** *(baja -$759/kg)* |
| Ingreso Bruto ref. (`$11.500/kg` c/menudencias) | `$16.537.566` | `$22.050.089` | `$22.050.089` | **`$60.637.743`** |
| **UTILIDAD NETA LIBRE POR LOTE / COHORTE** | **`$4.677.666`** | **`$7.692.289`** | **`$7.692.289`** | **`$20.062.243`** |
| Margen neto sobre ventas (%) | `28,3%` | `34,9%` | `34,9%` | **`33,1%`** |
| **Capital de Trabajo Pico Requerido (Sem 7, `20-23 dic`)** | `$11.859.900` *(lote)* | — | — | **`$31.212.600`** *(traslape 3 lotes)* |
| **Saldo Neto Final tras 4.º mes de contrato arriendo (`$3,0M`)** | — | — | — | **`+$19.312.243`** |

---

## 2. Hallazgos Críticos de la Auditoría Forense (Técnica, Operativa y Financiera)

### A. Auditoría de Alimentación Lote 1: `54` bultos iniciales vs. Calculadora `Consumo Pollo` (`6` Semanas / `42` Días)

| Semana / Fase Solla | Consumo (`Consumo Pollo` 600 aves) | Bultos Exactos | Bultos Iniciales (`$5,11M`) | Bultos Ppto. (`3%` bajas) / Bodega (`0%`) | Faltante a Comprar (`+$1,23M`) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Sem 1 (`d1–7`):** *Master Pollito* | `175 g/ave` (`105.000 g`) | `2,63 b.` | `3` (`$319.500`) | **`3`** / `3` (`$319.500`) | `0` bultos (`$0`) |
| **Sem 2 (`d8–14`):** *Nutrepollo Cr SP* | `385 g/ave` (`231.000 g`) | `5,78 b.` | — | — | — |
| **Sem 3 (`d15–21`):** *Nutrepollo Cr SP* | `644 g/ave` (`386.400 g`) | `9,66 b.` | `11` (`$1.058.200`) *(S2+S3)* | **`16`** / `16` (`$1.539.200`) | **`+5` bultos (`+$481.000`)** |
| **Sem 4 (`d22–28`):** *Broiler I Pel SP* | `931 g/ave` (`558.600 g`) | `13,97 b.` | — | — | — |
| **Sem 5 (`d29–35`):** *Broiler I Pel SP* | `1.050 g/ave` (`630.000 g`) | `15,75 b.` | — | — | — |
| **Sem 6 (`d36–42`):** *Broiler I Pel SP* | `1.260 g/ave` (`756.000 g`) | `18,90 b.` | `40` (`$3.736.000`) *(S4–S6)* | **`48`** / `49` (`$4.483.200`) | **`+8` a `+9` b. (`+$747.200` ppto.)** |
| **TOTAL 6 SEMANAS (42 DÍAS)** | **`4.445 g/ave` (`2.667.000 g`)** | **`66,68 b.`** | **`54` (`$5.113.700`)** | **`67`** (`$6.341.900`) / **`68`** bodega | **`+13` (`+$1.228.200`)** / `+14` bodega |

> [!CAUTION]
> **Alarma de inventario Preiniciador:** En Semanas 2 y 3 se requieren **`15,44` bultos (`16` físicos)** de *Nutrepollo*, por lo que los `11` bultos comprados dejan un **déficit de `+5` bultos (`$481.000`)** antes de terminar la Semana 3 (`03-dic`). Los `3` bultos de *Masterpollito* (`120 kg`) sí cubren la Semana 1 (`105 kg`) y dejan `15 kg` para transición.

### B. Meta `42` Días (`6` Semanas) vs. Peso Comercial `2,70 kg` y Programación Lote 3 (`15 de enero`)

1. **Lo que entrega el lote a los `42` días (`24-dic` Lote 1):** Con **`4.445 g/ave`** de consumo y curva mixta Ross 308 AP (`2,995 kg` vivos), el pollo procesado con menudencias (`82,5%`) entrega **`~2,47 kg` vendibles** (`2,24 kg` eviscerado seco `74,75%` + `0,23 kg` menudencias). Alcanzar `2,70 kg` en canal a 42d exigiría un FCR biológicamente irreal (`1,358`) en clima cálido.
2. **Opción si el cliente exige `>=2,70 kg` con menudencias (`45d`):** Extender **+3 días al Día 45** (`3,297 kg` vivos = **`2,72 kg` con menudencias**; requiere `77` bultos en Lote 1 / `102` en lotes de 800). Si exige `2,70 kg` seco sin vísceras, requiere **Día 48** (`3,591 kg` vivos = `2,71 kg`).
3. **Calendario exacto Lote 3 (`800` pollos `@ $3.200` en Bucaramanga, salida `42` días):**
   - **Sacrificio meta:** Viernes **15 de enero de 2027** (Día 42) -> **Ingreso Día 1: sábado `05-dic-2026`** (**viernes `04-dic`** si ayuna `10–12 h` la noche previa).
   - **Fecha límite pedido en Bucaramanga (`-10` días):** **Miércoles `25-nov-2026`** (`-$1.040.000` de ahorro frente a `$4.500/ave`).

### C. Riesgo Térmico, Bioseguridad y Flujo de Caja en el Pico Multi-Edades (`05-dic` a `24-dic`)

- **Hacinamiento y estrés calórico en Cúcuta:** Del `05-dic` al `24-dic` convivirán `20` días **`2.200` aves simultáneas** de `3` edades (`3.984,2 kg` = **`~4,0` toneladas vivas**; **`~0,8 t` menos carga térmica** que al día 45) con **`0` días de vacío sanitario** entre lotes.
  - Exige galpón **mínimo de `275–300 m²`** (`<= 26–28 kg/m²`; a `280 m²` resulta en `14,2 kg/m²` en `1_Plan_3_Lotes_y_Capacidad!B45` — **verifique y edite celda `B42` con los m² reales**).
  - Separación hermética de **3 zonas térmicas** (`32–34°C` pollito Lote 3 vs. `<21°C` engorde Lote 1), **`4` criadoras**, **`~80` comederos tolva** y **`~30` bebederos campana**.
- **Capital de Trabajo Pico (`$31,21M` líquido):** Como el Lote 1 cobra el `24-dic` después de comprar pollos y alimento de Lotes 1, 2 y 3 más `2` meses de arriendo, el **déficit acumulado de caja en Semana 7 (`20–23 dic`) es `-$31.212.600`**. Tener caja asegurada antes de pedir el Lote 3.
- **Lote 4 recomendado:** Iniciar Lote 4 tras `7–10` días de vacío sanitario al salir Lote 1 permite aprovechar el 4.º mes del contrato inicial de arriendo (`$750.000` fin de enero).

---

## 3. Hojas del Libro de Control en Campo

- `0_Tablero_Gerencial`: Parámetros Lote 1 (`B7=42`, `B12=74,75%`), estado vivo desde bitácora, comparativo 3 lotes y sensibilidad rápida.
- `1_Plan_3_Lotes_y_Capacidad`: Calculadora inversa Lote 3 (`42d / 45d / 48d`), tabla multi-lote consolidada, auditoría de densidad térmica Cúcuta y flujo de caja semanal.
- `2_Costos_y_Equilibrio_Lote1`: `54` bultos vs. `67`/`68` reales (`Consumo Pollo` 6 sem), estructura de costos y punto de equilibrio (`$6.303/kg` vivo · `$8.247/kg` canal).
- `3_Impacto_Alimento_Propio`: Evaluador para ensayos con harina propia en `d22+` (hoy `0%` ensayo; ahorro real `14,6%` = `$13.682/bulto` equivalente tras flete/pigmento/conversión).
- `4_Bitacora_Diaria_Lote1`: Registro diario días `1–49` (`Iniciación d1-7`, `Preiniciador d8-21`, `Engorde d22+`).
- `5_Pesajes_y_Beneficio`: Pesajes semanales (`d7..d48`), rendimiento exacto Ross e ingreso de liquidación real en beneficiadero.
- `6_Anexo_Auditoria_Inicial`: Tabla completa Sem 1–6 (`Consumo Pollo`), conciliación `54` vs `67/68` bultos y comparación `42d Calc` vs `42d Ross` vs `45d Ross`.
