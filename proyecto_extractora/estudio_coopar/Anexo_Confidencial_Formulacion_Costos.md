# Anexo Técnico Confidencial (Uso Interno — Ing. Mauricio Bonilla)

> **CONFIDENCIAL — NO ENTREGAR A COOPAR NI A TERCEROS.**  
> Este documento contiene el desglose exacto de los sobres codificados (`M-01`, `M-02` y `N-01`) del archivo [Protocolo_Estudio_Piloto_Coopar_Ing_Billy_Ramirez.md](Protocolo_Estudio_Piloto_Coopar_Ing_Billy_Ramirez.md), la justificación microbiológica de selección de cepas, la prohibición sanitaria sobre multiplicación artesanal en arroz y los costos reales de preparación.

---

## 1. Desglose Exacto de los Sobres Codificados (Fase A: 1.500 g basales / bandeja)

Con base en una mezcla basal de **1.500 g al 53,0 % de humedad** (**705,0 g de Materia Seca basal** = 640 g de torta al 10 % H + 860 g de lodo espeso sedimentado al 85 % H):

### A. Sobre `N-01`: Complejo Mineral N-P-Buffer (Solo para T2 · 3,0 % de MS basal = 21,15 g)
Reemplaza al sulfato de amonio puro al 2,4 % (que habría desplomado el pH por debajo de 3,5 y aportado exceso tóxico de azufre para pollos) por una mezcla **autorregulada de pH y segura para aves**:

| Componente del Sobre `N-01` | % sobre MS basal | Gramos / bandeja T2 (1,5 kg) | Gramos para Fase B (30 kg) | % N | Aporte exacto de N (g / bandeja) | Función Técnica |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Urea grado USP / alimenticio** *(libre de biuret y metales)* | 1,0 % | **7,05 g** | 141,0 g | 46,0 % | 3,243 g | Fuente principal de N económica; la ureasa fúngica libera $\text{NH}_3$ y evita caída letal de pH. |
| **Sulfato de Amonio grado alimenticio/USP** | 1,0 % | **7,05 g** | 141,0 g | 21,0 % | 1,481 g | Fuente rápida de $\text{NH}_4^+$ y azufre orgánico (0,24 % S en MS, seguro para balance electrolítico aviar). |
| **Fosfato Monoamónico (MAP) grado técnico/alimenticio** | 0,4 % | **2,82 g** | 56,4 g | 12,0 % | 0,338 g | Aporta N + Fósforo disponible (26 % P) indispensable para ATP y ácidos nucleicos del micelio. |
| **Carbonato de Calcio ($\text{CaCO}_3$ grado feed)** | 0,6 % | **4,23 g** | 84,6 g | 0,0 % | 0,000 g | *Buffer* alcalino que estabiliza el pH en la ventana **5,0 – 6,0** durante las primeras 24 horas. |
| **TOTAL SOBRE `N-01`** | **3,0 %** | **21,15 g** | **423,0 g** | **23,93 %** | **5,062 g N** (**31,64 g PC eq**) | **Aporte exacto programado en celda `B21/D27` del Excel v3.0.** |

### B. Sobres `M-01` y `M-02`: Inóculos Biológicos

| Código | Opción 1 (Arranque Rápido 40–48 h, GRAS alimenticio) | Opción 2 (Máxima Degradación de Fibra / Mananos 60–72 h) | Dosis MS | Gramos / bandeja | Regla Operativa Crítica |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **`M-01`** | ***Rhizopus oligosporus*** comercial certificado (*Ragi Tempeh* grado alimenticio, $\ge 10^7$ esporas/g) | ***Aspergillus oryzae*** (*Koji-kin* grado alimenticio) o cepa certificada no toxigénica de ***Aspergillus niger*** | **1,2 %** | **8,5 g** | **Si usas *Rhizopus* (Opción 1): NO voltear ni desmenuzar a la Hora 36** (tiene hifas cenocíticas sin septos y el volteo rompe el tejido), y cosechar entre **44 y 48 h** antes de que esporule en negro. Si usas *Aspergillus* (Opción 2): hifas septadas sí toleran aireación/volteo a las 36 h y alcanzan **-25 % a -32 %** de reducción real de fibra a las 60–72 h. |
| **`M-02`** | ***Saccharomyces cerevisiae*** activa seca (panificación alta actividad o forrajera viva) | ***Saccharomyces cerevisiae*** activa seca | **0,5 %** | **3,5 g** | En Opción 1 co-inocular en **Hora 0** (humedad 53–55 %) para no romper el micelio de *Rhizopus* a la Hora 36. En Opción 2 se puede asperjar en Hora 36 al airear la cama. |

---

## 2. Alerta de Inocuidad: Por Qué NO Multiplicar Inóculo en Arroz sin Autoclave en Tibú

* En la versión anterior se contemplaba multiplicar un sobre de 100 g en 10 kg de arroz partido cocido durante 96 horas para abaratar semilla. **Esta práctica queda descartada en ambiente no estéril** por dos razones sanitarias críticas:
  1. En clima tropical (Tibú, 30–34 °C) sin autoclave ni flujo laminar, el arroz húmedo favorece la proliferación silenciosa de ***Aspergillus flavus*** (productor de **Aflatoxina B1**, cancerígena y regulada a $<20\text{ ppb}$ por el ICA) y endosporas de ***Bacillus cereus***. Usar ese arroz como semilla siembra micotoxinas en todo el lote de alimento.
  2. La trazabilidad de cepas comerciales certificadas (*Ragi Tempeh* o *Koji-kin* grado alimenticio) garantiza ausencia de *Rhizopus microsporus* productor de rizoxina y de micotoxinas.
* **Estrategia correcta:** Para los ensayos de validación (4,5 kg y 30 kg) usar **100 % inóculo comercial certificado** (costo total en la Fase A menor a **$15.000 COP**). Solo en planta industrial (Proyecto 2) se diseñaría un cuarto limpio con autoclave para inóculo madre certificado.

---

## 3. Presupuesto Real Estimado del Estudio Completo (Asumido por Ing. Mauricio Bonilla)

| Ítem | Fase A (4,5 kg · 3 bandejas) | Fase B (30 kg · 6 canastillas) | Observación de Abastecimiento |
| :--- | :---: | :---: | :--- |
| Torta de palmiste expeller fresca (compra regional) | ~$5.000 COP (2,5 kg) | ~$25.000 COP (15 kg) | Comprada fresca en palma/Oleonorte y llevada ya molida (<2,5 mm). |
| Inóculo primario `M-01` (sobre certificado 100–250 g) | ~$10.000 COP (prorrateo) | ~$60.000 COP (170 g) | Comprar 1 paquete de *Ragi Tempeh* y/o *Koji-kin* certificado. |
| Levadura activa seca `M-02` (bloque 500 g) | ~$1.000 COP | ~$4.000 COP | Distribuidoras de panadería / insumos pecuarios en Cúcuta. |
| Sales grado alimenticio/USP (`N-01`) | <$1.000 COP | ~$6.000 COP | Usar estrictamente grado técnico limpio/USP (prohibido fertilizante agrícola por Flúor/Cadmio). |
| Análisis bromatológico externo (3 muestras × PC, TCA/NNP, FDN, FC, AA, Aflatoxinas) | ~$450.000 – $850.000 COP | ~$250.000 COP (pool + micotoxinas) | Cotizar paquete en laboratorio acreditado ONAC/ICA (Cúcuta/Bucaramanga/Bogotá). |
| Deshidratador portátil de bandejas + cava + higrómetro/termómetro sonda | ~$280.000 – $400.000 COP | Reutiliza equipos + marquesina/aire | Activo propio reutilizable para futuros prototipos. |
