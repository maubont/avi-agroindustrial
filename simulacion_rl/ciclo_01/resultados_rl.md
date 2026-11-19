# Resultados Ciclo 1 — Aprendizaje por Refuerzo (RL) Multi-Agente
**Planta de Concentrados en Harina · Cúcuta, Norte de Santander**  
**Titular:** Ing. Mauricio Bonilla · **Gobernanza:** Oleonorte / Carlos Carrascal es únicamente proveedor externo comercial de torta expeller de palmiste (sin sociedad ni equity).

---

## 1. Resumen Ejecutivo y Compuerta de Meta

El ciclo completo de optimización por refuerzo (**Paso 0 Auditoría Forense → Fase 1 [20 Exploradores] → Simulación 1 → Fase 2 [20 Revisores Prácticos] → Simulación 2 → Fase 3 [10 Líderes × 5 Especialistas] → Simulación 3**) **superó todas las metas trazadas para Ciclo 1** sin trucos nutricionales, sin doble conteo enzimático ni químico, cumpliendo 100 % Ross 2022 y la normativa ICA colombiana:

| Métrica | Línea Base Auditada (`audit_fitasa`) | Meta RL Ciclo 1 | **Ganador `L09` (Fase 2 Integrada)** | `L09_B` (Fases Base `0,95/2,50`) | `L09_A` (Arranque Fase 1 Sin Extractora, FPKC $880) | Cumplimiento Meta |
|---|---:|---:|---:|---:|---:|---|
| **Factible (Ross + DEB + Ca:Pd)** | Sí | Sí | **Sí** | **Sí** | **Sí** | **CUMPLE** |
| **MP Ponderado (COP/kg)** | 1.921,0 | ≤ 1.785,0 | **1.742,5** (`-178,5`) | **1.748,7** (`-172,3`) | **1.776,0** (`-145,0`) | **CUMPLE (`-42,5` margen)** |
| **Costo kg Vivo d21–42 (COP)** | 4.228 | ≤ 3.950 | **3.733** (`-495`) | **3.746** (`-482`) | **3.802** (`-426`) | **CUMPLE (`-217` margen)** |
| **Punto de Equilibrio (t/mes)** | 77,0 | ≤ 55,0 | **45,2** (`-31,8`) | **45,8** (`-31,2`) | **46,4** (`-30,6`) | **CUMPLE (`-9,8` margen)** |
| **Precio Sombra FPKC F2 (COP/kg)** | 531,9 | ≥ 850,0 | **871,6** (`+339,7`) | **871,6** (`+339,7`) | 871,6 *(entra 23,9/0)* | **CUMPLE (`+21,6` margen)** |
| **Cumplimiento Monte Carlo F1 / F2 (%)** | 35,4% / 35,6% *(N=500)* | ≥ Base | **43,2% / 45,2%** | **43,2% / 45,2%** | **43,0% / 38,4%** | **SUPERA BASE (`+7,8/+9,6 pp`)** |
| **Reward Compuesto `simulador_rl.js`** | 0,0 | Maximizar | **553,2** | **537,8** | **473,6** | **Compuerta Aprobada** |

En optimización robusta *Chance-Constrained* (`z = 0,8`, `N = 1.000` en `formulador.js`), **`rl_optimo` (`L09`)** mantiene factibilidad completa con `MP_pond = 1.786,4 COP/kg`, `Vivo = 3.824 COP/kg`, `PE = 49,5 t/mes`, `J_F2 = 1.819,8 COP/kg` y **`58,7%` de cumplimiento conjunto F2** (frente a `42,9%` en la línea base robusta `audit_fitasa`).

---

## 2. Ranking Final — Simulación 3 (10 Líderes × 5 Especialistas Auditores)

Evaluado en [`simulador_rl.js`](file:///c:/Dev/Planta%20de%20Concentrados/modelo/simulador_rl.js) → [`ranking_sim3.json`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/ranking_sim3.json):

| Puesto | ID Propuesta | Factible | Reward | MP Pond. | ΔMP | Vivo | PE (t/m) | Sombra FPKC F2 | MC F2 (%) |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **1** | [`L09_supercombinacion_optima`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L09.json) | Sí | **553,2** | **1.742,5** | **178,5** | **3.733** | **45,2** | **871,6** | **45,2%** |
| **2** | [`L01_compras_logistica_fases`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L01.json) | Sí | 210,8 | 1.848,9 | 72,1 | 4.063 | 53,3 | 411,1 | 35,0% |
| **3** | [`L03_cadena_fpkc_tamizado_nsp`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L03.json) | Sí | 150,6 | 1.885,8 | 35,2 | 4.154 | 71,7 | 934,8 | 35,8% |
| **4** | [`L05_energia_regional_auditada`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L05.json) | Sí | 144,2 | 1.884,2 | 36,8 | 4.150 | 68,3 | 833,1 | 38,2% |
| **5** | [`L02_stack_enzimatico_real`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L02.json) | Sí | 99,6 | 1.883,9 | 37,1 | 4.150 | 68,3 | 531,9 | 38,2% |
| **6** | [`L08_molienda_gruesa_fcr`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L08.json) | Sí | 42,6 | 1.921,0 | 0,0 | 4.101 | 75,0 | 531,9 | 35,6% |
| **7** | [`L07_quimica_mineral_deb_azufre`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L07.json) | Sí | 40,9 | 1.906,0 | 15,0 | 4.196 | 73,2 | 527,3 | 37,2% |
| **8** | [`L10_estrategia_dual_multiespecie`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L10.json) | Sí | 38,8 | 1.920,3 | 0,7 | 4.226 | 79,1 | 821,2 | 34,0% |
| **9** | [`L06_proteinas_alternativas_ica`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L06.json) | Sí | 32,3 | 1.907,8 | 13,2 | 4.202 | 76,1 | 541,1 | 39,8% |
| **10** | [`L04_estrategia_lipidica_optima`](file:///c:/Dev/Planta%20de%20Concentrados/simulacion_rl/ciclo_01/fase3_lideres/L04.json) | Sí | 28,3 | 1.911,5 | 9,5 | 4.208 | 74,6 | 548,4 | 35,6% |

---

## 3. Receta Verificada `L09` (`rl_optimo`) y Reglas Anti-Conflictos Aplicadas

### Fórmulas Verificadas (kg/t exacta en `motor_lp.js`)
- **Fase 1 (`$1.790,7/t` | `EM 3.050 kcal/kg`, `PC 21,93%`, `EE 5,75%`, `FC 3,07%`, `Ca:Pd 1,786`, `DEB 223,1`, `Cl 0,230%`, `aceite 2,27%`):**
  Maíz `570,087` | Torta soya `277,777` | **FPKC `60,000`** | **Harina vísceras avícola `40,000`** | Aceite palma CPO `22,709` | DCP `4,889` | CaCO₃ `3,997` | DL-Met `3,063` | Premix `3,000` | Multi-NSP 1:10 `3,000` | L-Lys HCl `2,527` | Bicarbonato Na `2,404` | Sal `1,622` | Secuestrante `1,500` | Colina Cl `1,267` | L-Thr `0,964` | GAA `0,600` | Fitasa `0,300` | Antioxidante `0,250` | L-Val `0,044`.
- **Fase 2 (`$1.732,7/t` | `EM 3.100 kcal/kg`, `PC 20,97%`, `EE 7,60%`, `FC 3,16%`, `Ca:Pd 1,806`, `DEB 220,0`, `Cl 0,213%`, `aceite 4,00%`):**
  Maíz `537,766` | Torta soya `249,775` | **FPKC `120,000`** | Aceite palma CPO `40,000` | **Harina vísceras avícola `25,939`** | CaCO₃ `4,079` | Premix `3,000` | Multi-NSP 1:10 `3,000` | DL-Met `2,745` | **L-Lys Sulfato 70% `2,500`** | DCP `2,467` | Sal `2,277` | Bicarbonato Na `1,632` | Secuestrante `1,500` | L-Thr `0,719` | L-Lys HCl `0,618` | GAA `0,600` | **Betaína anhidra `0,433`** | Colina Cl `0,400` | Fitasa `0,300` | Antioxidante `0,250`.

### 6 Salvaguardas Críticas Descubiertas en la Auditoría
1. **Desactivación de doble conteo enzimático (`L02` vs `L01`/`R03`/`L03`):** Se rechazó la proteasa (`R03`, ROI negativo `-3,6` a `-7,0 $/kg`), la lisolecitina (`R07`, redundante frente a CPO `$4.150/kg`) y la mezcla simultánea de fitasa 500 FTU (`L01`) + 1.500 FTU (`L02`), dejando `fitasa 1.500 FTU (0,3 kg/t)` + `enz_nsp_predil 1:10` sin crédito duplicado de AA sobre `fpkc`.
2. **Desactivación de la "Bomba de Azufre" (`L07` + `L09`):** Veto absoluto a `Na₂SO₄`; restringiendo `L-Lys Sulfato 70%` a **solo F2 ≤ 2,50 kg/t** (con CoA ≤ 8% S), el Azufre total se mantiene `≤ 0,300%` incluso al 12% de FPKC + harina de vísceras + DL-Met.
3. **Blindaje de fluidez en harina y pigmentación (`L05` + `L04` + `L08`):** Tope líquido `aceite 1,5% min – 3,5%/4,0% max` (evita "paradoja del aceite cero" al activar soya extruida opcional, manteniendo `EE ≤ 7,60%` a 32 °C) + piso `maíz ≥ 36%` para pigmentación regional de piel en Cúcuta + molienda gruesa VFD/zaranda (`3,8%` penalización harina, sin alterar consumos artificialmente).
4. **Inocuidad ICA y segregación mono-especie (`L06` + `L10`):** Veto absoluto a `mbm_bovino`, `hch_porcina`, `h_plumas`, `pulidura_arroz`, `harina_yuca`, `glicerina_feed` y al secado solar de Fase 1; tamizado PRE-FES (#14–#16) ejecutado aguas arriba manteniendo la planta de Cúcuta **100% mono-especie aviar** (ahorra `+$111M` CAPEX de línea dual y cumple Res. ICA 061252/2020 y 991/2001).
5. **Reconciliación real de CAPEX pre-IVA y OPEX fijo (`L09`):** CAPEX adicional consolidado **`$92,0M` pre-IVA** (`$46,0M` arranque Fase 1 [polipasto `$16,5M` + bodega enzimas `$3,5M` + BPMAA HV `$8,0M` + VFD/zaranda `$18,0M`] + `$46,0M` PRE-FES/lector micotoxinas ICA; caja inicial total con IVA 19%: **`$393,68M COP`**), eliminando solapamiento de `$25M` con `L10`. OPEX fijo neto mensual: **`-$300.000/mes`** (`-$1,5M` ahorro logística/fases + `$600k` lab HV + `$600k` mant./kits FPKC).
6. **Gobernanza de implementación por etapas:** Arrancar inmediatamente con **`L09_A` (Fase 1 sin Extractora)** para capturar `$1.776/kg` MP y PE `46,4 t/mes` mientras se validan en paralelo las pruebas de laboratorio y campo de [`Herramienta_Estudio_Coopar_FES.xlsx`](file:///c:/Dev/Planta%20de%20Concentrados/proyecto_extractora/estudio_coopar/Herramienta_Estudio_Coopar_FES.xlsx).
