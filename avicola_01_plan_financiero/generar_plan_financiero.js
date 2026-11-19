'use strict';

const path = require('path');
const fs = require('fs');
const ExcelJS = require(path.resolve(__dirname, '../modelo/node_modules/exceljs'));

// Curva oficial Ross 308 AP (2021) Mixto: días 28 a 49 (Fuente: PDF Ross 308 AP 2021 pág. 3 interna / 4 PDF)
const ROSS_TABLA_28_49 = [
  // [dia, peso_vivo_g, cons_acum_g]
  [28, 1593, 2086], [29, 1688, 2238], [30, 1784, 2395], [31, 1882, 2558],
  [32, 1981, 2726], [33, 2080, 2899], [34, 2181, 3076], [35, 2282, 3259],
  [36, 2384, 3447], [37, 2486, 3639], [38, 2588, 3835], [39, 2690, 4036],
  [40, 2792, 4242], [41, 2894, 4451], [42, 2995, 4664], [43, 3096, 4881],
  [44, 3197, 5102], [45, 3297, 5326], [46, 3396, 5553], [47, 3494, 5784],
  [48, 3591, 6018], [49, 3687, 6254]
];

// Rendimiento eviscerado seco exacto PDF Ross 308 AP 2021 (págs. 12-13 PDF, promedio Macho/Hembra)
const REND_SECO_PDF = [
  [2.8, 0.7436, 0.7468, 0.7452],
  [3.0, 0.7458, 0.7492, 0.7475],
  [3.2, 0.7486, 0.7516, 0.7501],
  [3.4, 0.7514, 0.7539, 0.7527],
  [3.6, 0.7541, 0.7561, 0.7551]
];

const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const AZUL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const AZUL_OSC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const VERDE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const VERDE_FUERTE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
const ROJO_SUAVE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const GRIS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

const BORDE = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
};

function styleTitle(ws, titulo, subtitulo) {
  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1F4E78' } };
  if (subtitulo) {
    ws.getCell('A2').value = subtitulo;
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF595959' } };
  }
}

function styleHeader(row) {
  row.height = 28;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = AZUL_OSC;
    c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    c.border = BORDE;
  });
}

function styleSubHeader(row, fill = AZUL) {
  row.height = 21;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FF1F4E78' }, size: 10 };
    c.fill = fill;
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = BORDE;
  });
}

function setInput(cell, val, numFmt, align) {
  cell.value = val;
  if (numFmt) cell.numFmt = numFmt;
  cell.fill = AMARILLO;
  cell.font = { bold: true, color: { argb: 'FF000000' } };
  cell.protection = { locked: false };
  if (align) cell.alignment = { horizontal: align };
  cell.border = BORDE;
}

function setFormula(cell, formula, numFmt, opts = {}) {
  cell.value = { formula };
  if (numFmt) cell.numFmt = numFmt;
  if (opts.fill) cell.fill = opts.fill;
  if (opts.bold) cell.font = { bold: true, color: opts.color ? { argb: opts.color } : undefined };
  if (opts.align) cell.alignment = { horizontal: opts.align };
  cell.border = BORDE;
}

function protectSheet(ws) {
  ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatCells: false });
}

function buildPlanFinanciero() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'División Avícola AV-1 - Plan Financiero y Rentabilidad';
  wb.created = new Date('2026-11-14T11:15:00Z');
  wb.calcProperties.fullCalcOnLoad = true;

  // Crear 5 hojas en orden gerencial/inversionista
  const ws0 = wb.addWorksheet('0_Resumen_Ejecutivo', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws1 = wb.addWorksheet('1_Precios_Mercado_Regional', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws2 = wb.addWorksheet('2_Rentabilidad_por_Lote', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const ws3 = wb.addWorksheet('3_Proyeccion_Anual_12_Meses', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws4 = wb.addWorksheet('4_Glosario_y_Ross308', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  // =========================================================================
  // HOJA 1: 1_Precios_Mercado_Regional (antes 1_Precios_Ref_vs_Tropicalizado)
  // =========================================================================
  ws1.columns = [
    { width: 52 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 50 }
  ];
  styleTitle(
    ws1,
    'AV-1 · PRECIOS REGIONALES DE MERCADO (CÚCUTA Y BUCARAMANGA)',
    'Compara referencias nacionales en web (Colombia) contra precios reales negociados en la región. Celdas AMARILLAS editables alimentan todo el libro.'
  );

  const h1 = ws1.getRow(4);
  h1.values = [
    'Insumo, Servicio o Parámetro Comercial', 'Unidad', 'Referencia Nacional / Web',
    'Precio Real Regional', 'Desviación (%)', 'Fuente / Criterio Económico'
  ];
  styleHeader(h1);

  const itemsH1 = [
    { tipo: 'sec', titulo: 'A. GENÉTICA (POLLITO DE 1 DÍA)' },
    { key: 'pollitoLocal', lbl: 'Pollito de 1 día Ross 308 AP — compra local (Lote 1)', uni: 'COP / ave', web: 4650, real: 4500, fmt: '#,##0', nota: 'Ref. distribuidores Santander/N. Santander ($4.300-$5.000) vs. factura real Lote 1' },
    { key: 'pollitoBmanga', lbl: 'Pollito de 1 día Ross 308 AP — directo Bucaramanga (Lotes 2+)', uni: 'COP / ave', web: 4500, real: 3200, fmt: '#,##0', nota: 'Negociación directa incubadora Santander (-$1.300/ave frente a canal local)' },

    { tipo: 'sec', titulo: 'B. NUTRICIÓN Y CONVERSIÓN ALIMENTICIA (COMERCIAL VS. PLANTA PROPIA)' },
    { key: 'alimInic', lbl: 'Alimento Iniciación (Días 1-7 · Sem 1): Solla Masterpollito (ICA 9508 AL)', uni: 'COP / bulto 40kg', web: 112000, real: 106500, fmt: '#,##0', nota: 'Minipelet 2 mm, 24% proteína; precio real Cúcuta ($2.662,5/kg)' },
    { key: 'alimPre', lbl: 'Alimento Preiniciador (Días 8-21 · Sem 2-3): Solla Nutrepollo (ICA 3054 AL)', uni: 'COP / bulto 40kg', web: 108000, real: 96200, fmt: '#,##0', nota: 'Crombo 20% proteína; precio real Cúcuta ($2.405/kg)' },
    { key: 'alimEngCom', lbl: 'Alimento Engorde Comercial (Días 22-42 · Sem 4-6): Solla Broiler Dorado (ICA 16430 AL)', uni: 'COP / bulto 40kg', web: 110000, real: 93400, fmt: '#,##0', nota: 'Pelet 3 mm, 18,5% proteína; precio real Cúcuta ($2.335/kg)' },
    { key: 'alimEngPropio', lbl: 'Alimento Engorde Propio en Harina (puesto en planta de alimento)', uni: 'COP / bulto 40kg', web: 93400, real: 73000, fmt: '#,##0', nota: 'Costo fabricación estimado ($1.825/kg x 40 kg) sujeto a escala de planta >=45 t/mes' },
    { key: 'fletePigmento', lbl: 'Flete planta -> granja + pigmento amarillo oro (solo alimento propio)', uni: 'COP / bulto 40kg', web: 3800, real: 3800, fmt: '#,##0', nota: '$3.000 flete + $800 pigmento xantofila; ponga $0 si planta en sitio y sin pigmentar' },
    { key: 'extraHarina', lbl: 'Consumo físico adicional por usar harina propia vs. peletizado comercial', uni: '% extra alimento', web: 0.065, real: 0.038, fmt: '0.0%', nota: '3,8% con molienda gruesa controlada (vs. 6,5% molienda fina); validar en piloto' },

    { tipo: 'sec', titulo: 'C. INSUMOS DE GRANJA, BENEFICIO Y LOGÍSTICA POST-SACRIFICIO' },
    { key: 'cama', lbl: 'Cama para galpón (cascarilla de arroz o viruta)', uni: 'COP / ave iniciada', web: 375, real: 300, fmt: '#,##0', nota: '$180.000 por 600 aves | $240.000 por 800 aves (zona arrocera El Zulia/Cúcuta)' },
    { key: 'gas', lbl: 'Gas propano / calefacción criadoras (semanas 1 a 3)', uni: 'COP / ave iniciada', web: 450, real: 425, fmt: '#,##0', nota: '$255.000 por 600 aves | $340.000 por 800 aves' },
    { key: 'vacunas', lbl: 'Vacunas (Newcastle, Gumboro), vitaminas y desinfección', uni: 'COP / ave iniciada', web: 438, real: 400, fmt: '#,##0', nota: '$240.000 por 600 aves | $320.000 por 800 aves' },
    { key: 'energia', lbl: 'Energía eléctrica, agua y consumibles varios de granja', uni: 'COP / ave iniciada', web: 225, real: 200, fmt: '#,##0', nota: '$120.000 por 600 aves | $160.000 por 800 aves (Total insumos granja = $1.325/ave)' },
    { key: 'sacrificio', lbl: 'Servicio de sacrificio / beneficio en maquila', uni: 'COP / pollo procesado', web: 1600, real: 1500, fmt: '#,##0', nota: 'Tarifa real confirmada ($1.500/ave); NO se paga si se vende pollo vivo en granja' },
    { key: 'logisticaCanal', lbl: 'Costos post-sacrificio (flete frío, bolsa, hielo, guías sanitarias)', uni: 'COP / kg canal', web: 250, real: 0, fmt: '#,##0', nota: '$0 si cliente recoge en planta; digite $200-$350/kg si asume empaque, hielo y entrega' },

    { tipo: 'sec', titulo: 'D. ARRIENDO, PERSONAL Y PRECIOS DE VENTA EN MERCADO' },
    { key: 'arriendoIni', lbl: 'Arriendo mensual del galpón — Meses 1 a 4 (tarifa contrato inicial)', uni: 'COP / mes', web: 1000000, real: 750000, fmt: '#,##0', nota: 'Contrato real $750.000/mes los primeros 4 meses ($3.000.000 totales)' },
    { key: 'arriendoReg', lbl: 'Arriendo mensual del galpón — Meses 5 a 12 (canon regular anual)', uni: 'COP / mes', web: 1200000, real: 1000000, fmt: '#,##0', nota: 'Canon esperado tras mes 4 (bajar a $750.000 si logra prórroga en mismo valor)' },
    { key: 'mesesLoteStd', lbl: 'Meses de arriendo cargados por lote en régimen escalonado', uni: 'meses / lote', web: 2.0, real: 1.0, fmt: '0.00', nota: '1,00 mes si hay rotación multi-sección; 1,33-2,00 meses si hay vacío sanitario entre lotes' },
    { key: 'colaborador', lbl: 'Pago fijo colaborador / acompañamiento técnico por camada', uni: 'COP / lote', web: 500000, real: 400000, fmt: '#,##0', nota: 'Valor fijo acordado por lote' },
    { key: 'precioCanal', lbl: 'Precio de venta referencia — Pollo PROCESADO con menudencias', uni: 'COP / kg canal', web: 11500, real: 11500, fmt: '#,##0', nota: 'Incluye molleja, corazón, hígado y pescuezo (ref. Cenabastos Cúcuta / SIPSA-DANE)' },
    { key: 'precioVivo', lbl: 'Precio de venta referencia — Pollo VIVO en puerta de granja', uni: 'COP / kg vivo', web: 7400, real: 7400, fmt: '#,##0', nota: 'Alternativa de venta al contado en finca sin maquila ni pérdida de peso por beneficio' }
  ];

  const R1 = {};
  let r1Idx = 5;
  for (const item of itemsH1) {
    const row = ws1.getRow(r1Idx);
    if (item.tipo === 'sec') {
      row.getCell(1).value = item.titulo;
      styleSubHeader(row);
      ws1.mergeCells(`A${r1Idx}:F${r1Idx}`);
    } else {
      R1[item.key] = r1Idx;
      row.getCell(1).value = item.lbl; row.getCell(1).border = BORDE;
      row.getCell(2).value = item.uni; row.getCell(2).alignment = { horizontal: 'center' }; row.getCell(2).border = BORDE;
      setInput(row.getCell(3), item.web, item.fmt);
      setInput(row.getCell(4), item.real, item.fmt);
      setFormula(row.getCell(5), `IFERROR((D${r1Idx}-C${r1Idx})/C${r1Idx},0)`, '+0.0%;-0.0%;0.0%', { fill: GRIS });
      row.getCell(6).value = item.nota; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
    }
    r1Idx++;
  }
  protectSheet(ws1);

  // =========================================================================
  // HOJA 4: 4_Glosario_y_Ross308 (Tablas técnicas separadas de las portadas)
  // =========================================================================
  ws4.columns = [
    { width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 52 }
  ];
  styleTitle(
    ws4,
    'GLOSARIO EJECUTIVO Y TABLAS TÉCNICAS DE REFERENCIA (ROSS 308 AP)',
    'Diccionario en español claro para gerentes e inversionistas externos, más objetivos oficiales de crecimiento y rendimiento de canal.'
  );

  ws4.getCell('A4').value = '1. DICCIONARIO PARA INVERSIONISTAS Y GERENTES (SIN SIGLAS CRÍPTICAS)';
  styleSubHeader(ws4.getRow(4));
  ws4.mergeCells('A4:E4');
  const h4g = ws4.getRow(5);
  h4g.values = ['Término en el Modelo', 'Definición Clara', 'Valor / Rango Clave', 'Impacto Económico', 'Notas para Junta / Inversionista'];
  styleHeader(h4g);

  const glosario = [
    ['Pollo Vivo en Granja', 'Animal entregado vivo en puerta de galpón antes del sacrificio.', '$7.400 / kg vivo', 'Venta de contado sin flete ni sacrificio', 'Conocido en el sector como pollo "en pie". Sirve de piso mínimo de precio.'],
    ['Pollo Procesado con Menudencias', 'Pollo sacrificado, desplumado y eviscerado con hígado, molleja, corazón y pescuezo.', '82,5% del peso vivo', 'Aumenta ganancia vs. vender vivo', 'Llamado "en canal con vísceras". A 42 días (2,995 kg vivo) rinde ~2,47 kg vendibles; a 45 días (3,30 kg) da 2,72 kg.'],
    ['Eviscerado Seco sin Menudencias', 'Carcasa limpia (pechuga, muslos, alas) sin órganos internos.', '74,75% del peso vivo (d42)', 'Requiere 48 días para pesar 2,70 kg', 'Si el comprador pide 2,70 kg sin menudencias, el lote debe llegar a ~3,59 kg vivo (día 48).'],
    ['Conversión Alimenticia (FCR)', 'Kilogramos de alimento consumidos por cada kg de pollo vivo producido.', '~1,53 efectivo (d42 calc.)', 'Cada +0,05 puntos suma ~$117/kg vivo', 'Mide eficiencia de la dieta y manejo. Un número más bajo significa menor gasto por kilo.'],
    ['Mortalidad por Etapas', 'Porcentaje de aves perdidas entre el día 1 y el sacrificio.', '3,0% estándar', 'Bajas tempranas ahorran alimento engorde', 'Se usa 3,0% para proyectar finanzas conservadoras; pedidos de alimento prevén margen físico.'],
    ['Capital de Trabajo Pico', 'Dinero máximo inmovilizado al mismo tiempo antes de cobrar las ventas.', 'NO es el gasto anual', 'Base real para medir el retorno (ROI)', 'El costo anual es el flujo de 12 meses; el capital en riesgo real es el pico acumulado del ciclo.']
  ];
  glosario.forEach((g, idx) => {
    const row = ws4.getRow(6 + idx);
    g.forEach((val, ci) => {
      row.getCell(1 + ci).value = val;
      row.getCell(1 + ci).border = BORDE;
      row.getCell(1 + ci).alignment = { wrapText: true, vertical: 'top' };
      if (ci === 0) row.getCell(1 + ci).font = { bold: true };
    });
  });

  const rossHeaderRow = 14;
  ws4.getCell(`A${rossHeaderRow}`).value = '2. CURVA OFICIAL ROSS 308 AP (2021) — OBJETIVOS MIXTOS (DÍAS 28 A 49)';
  styleSubHeader(ws4.getRow(rossHeaderRow));
  ws4.mergeCells(`A${rossHeaderRow}:E${rossHeaderRow}`);
  const h4r = ws4.getRow(rossHeaderRow + 1);
  h4r.values = ['Edad (días)', 'Peso Vivo Ross Mixto (g)', 'Consumo Acum. Ross (g)', 'Conversión Teórica Ross', 'Nota Genética'];
  styleHeader(h4r);

  const rossStart = rossHeaderRow + 2; // row 16
  ROSS_TABLA_28_49.forEach(([dia, pv, ca], idx) => {
    const rr = ws4.getRow(rossStart + idx);
    rr.getCell(1).value = dia; rr.getCell(1).numFmt = '0'; rr.getCell(1).alignment = { horizontal: 'center' }; rr.getCell(1).border = BORDE;
    rr.getCell(2).value = pv; rr.getCell(2).numFmt = '#,##0'; rr.getCell(2).border = BORDE;
    rr.getCell(3).value = ca; rr.getCell(3).numFmt = '#,##0'; rr.getCell(3).border = BORDE;
    setFormula(rr.getCell(4), `IFERROR(C${rossStart + idx}/B${rossStart + idx},0)`, '0.000');
    rr.getCell(5).value = dia === 42 ? 'Nochebuena Lote 1 (~2,99 kg vivo)' : (dia === 45 ? 'Edad estándar meta 2,72 kg con menudencias' : (dia === 48 ? 'Edad meta 2,70 kg eviscerado seco' : ''));
    rr.getCell(5).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; rr.getCell(5).border = BORDE;
  });
  const rossEnd = rossStart + ROSS_TABLA_28_49.length - 1; // row 37

  const rendStart = rossEnd + 3; // row 40
  ws4.getCell(`A${rendStart}`).value = '3. RENDIMIENTO EVISCERADO SECO EXACTO (ROSS 308 AP 2021, PÁGS. 12-13)';
  styleSubHeader(ws4.getRow(rendStart));
  ws4.mergeCells(`A${rendStart}:E${rendStart}`);
  const h4e = ws4.getRow(rendStart + 1);
  h4e.values = ['Peso Vivo (kg)', '% Eviscerado Macho', '% Eviscerado Hembra', '% Promedio Mixto', 'Canal Seca sin Menudencias (kg)'];
  styleHeader(h4e);
  REND_SECO_PDF.forEach(([pk, pm, ph, prom], idx) => {
    const rr = ws4.getRow(rendStart + 2 + idx);
    rr.getCell(1).value = pk; rr.getCell(1).numFmt = '0.0'; rr.getCell(1).border = BORDE;
    rr.getCell(2).value = pm; rr.getCell(2).numFmt = '0.00%'; rr.getCell(2).border = BORDE;
    rr.getCell(3).value = ph; rr.getCell(3).numFmt = '0.00%'; rr.getCell(3).border = BORDE;
    rr.getCell(4).value = prom; rr.getCell(4).numFmt = '0.00%'; rr.getCell(4).font = { bold: true }; rr.getCell(4).border = BORDE;
    setFormula(rr.getCell(5), `A${rendStart + 2 + idx}*D${rendStart + 2 + idx}`, '0.000', { bold: true });
  });
  protectSheet(ws4);

  // =========================================================================
  // HOJA 2: 2_Rentabilidad_por_Lote (antes 2_Presupuesto_Lote_Estandar)
  // Flujo estricto: Supuestos -> Escala Física -> Costos Granja -> Venta Vivo
  //                 -> Beneficio/Canal -> Venta Final y Punto Indiferencia
  // =========================================================================
  ws2.columns = [
    { width: 52 }, { width: 20 }, { width: 20 }, { width: 22 }, { width: 22 }
  ];
  styleTitle(
    ws2,
    'AV-1 · RENTABILIDAD POR LOTE: DE LA GRANJA A LA VENTA FINAL',
    'Flujo cronológico sin siglas: Escala Física -> Costos en Granja (Pollo Vivo) -> Venta Vivo vs. Beneficio en Canal con Menudencias -> Utilidad Libre y Margen.'
  );

  ws2.getCell('A4').value = 'PARÁMETROS PRODUCTIVOS Y DE MERCADO DEL LOTE (EDITABLES EN AMARILLO)';
  styleSubHeader(ws2.getRow(4));
  ws2.mergeCells('A4:E4');

  const h2A = ws2.getRow(5);
  h2A.values = ['Parámetro Zootécnico / Operativo', 'Valor Base', 'Referencia Técnica', '', 'Observación / Impacto'];
  styleHeader(h2A);

  // Filas 6..15: parámetros limpios
  const params2 = [
    [6, 'Tamaño de camada estándar proyectada (aves iniciadas Día 1)', 800, '#,##0', true, 'Lotes 2+ estándar en 800 aves; Columna D fija Lote 1 en 600 aves', ''],
    [7, 'Edad objetivo de salida al mercado (días, entre 28 y 49)', 42, '0', true, 'Meta 6 sem (42d = ~2,995 kg vivo / ~2,47 kg c/menud.); para 2,72 kg c/menud. requiere 45d', ''],
    [8, 'Mortalidad esperada acumulada en crianza (%)', 0.030, '0.0%', true, 'Estándar conservador de planeación (supervivencia ponderada por etapa)', ''],
    [9, 'Factor ajuste clima cálido Cúcuta sobre peso vivo Ross (%)', 0.000, '+0.0%;-0.0%;0.0%', true, '0,0% = objetivo genético ideal; digite -5% a -8% para estrés térmico sin túnel', ''],
    [10, 'Peso vivo promedio por pollo al sacrificio (kg/ave)', `(INDEX('4_Glosario_y_Ross308'!$A$${rossStart}:$C$${rossEnd},MATCH(B7,'4_Glosario_y_Ross308'!$A$${rossStart}:$A$${rossEnd},0),2)/1000)*(1+B9)`, '0.000', false, 'Curva Ross 308 AP ajustada por estrés térmico B9 (~2,995 kg a 42d; ~3,297 kg a 45d)', ''],
    [11, 'Consumo acumulado teórico sin mortalidad (kg/ave)', `4.445+(INDEX('4_Glosario_y_Ross308'!$A$${rossStart}:$C$${rossEnd},MATCH(B7,'4_Glosario_y_Ross308'!$A$${rossStart}:$A$${rossEnd},0),3)/1000-4.664)`, '0.000', false, 'Base Consumo Pollo 6 sem (0,175 S1 + 1,029 S2-3 + 3,241 S4-6 = 4,445 kg/ave) + delta Ross', ''],
    [12, 'Merma adicional transporte / segunda calidad no cobrable (%)', 0.000, '0.0%', true, '0,0% teórico; digite 2,0%-3,5% para incluir ahogo/decomiso en planta', ''],
    [13, 'Rendimiento en canal CON menudencias (molleja, corazón, hígado, pescuezo)', 0.825, '0.0%', true, '~74,75% eviscerado seco Ross (d42) + ~7,75% menudencias comestibles', ''],
    [14, 'Rendimiento eviscerado seco SIN menudencias (referencia Ross)', 0.7475, '0.00%', true, 'Promedio Macho/Hembra PDF Ross 308 AP para ~3,00 kg vivo (Día 42)', '']
  ];
  for (const [r, lbl, val, fmt, isInp, nota] of params2) {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (isInp) setInput(row.getCell(2), val, fmt);
    else setFormula(row.getCell(2), val, fmt, { fill: GRIS, bold: true });
    row.getCell(3).value = r === 10 ? 'Ross 308 AP (2021)' : (r === 13 ? 'Con menudencias' : '');
    row.getCell(3).border = BORDE;
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).value = ''; row.getCell(4).border = BORDE;
    row.getCell(5).value = nota; row.getCell(5).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(5).border = BORDE;
  }

  // Bloque B: Cascada de Rentabilidad (Filas 17..)
  const h2B = ws2.getRow(17);
  h2B.values = [
    'Etapa / Indicador Económico (En Orden de Operación)',
    'Esc. A · Estándar 800 Aves (100% Comercial)',
    'Esc. B · Con Alimento Propio Engorde (d22+)',
    'Ref. Lote 1 Real (600 Aves, Pollito $4.500)',
    'Impacto Alimento Propio (Esc. B vs. A)'
  ];
  styleHeader(h2B);

  const p1 = "'1_Precios_Mercado_Regional'";
  // Mapa de filas exacto en Hoja 2 (para enlazar limpiamente desde Resumen y Anual)
  const R2 = {};
  let r2Cur = 18;
  const pushSec2 = (titulo) => {
    const row = ws2.getRow(r2Cur);
    row.getCell(1).value = titulo;
    styleSubHeader(row);
    ws2.mergeCells(`A${r2Cur}:E${r2Cur}`);
    r2Cur++;
  };
  const pushRow2 = (key, lbl, fB, fC, fD, fmt, opts = {}) => {
    R2[key] = r2Cur;
    const row = ws2.getRow(r2Cur);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (opts.bold) row.getCell(1).font = { bold: true };
    const fill = opts.fill || (opts.bold ? VERDE : undefined);
    setFormula(row.getCell(2), fB, fmt, { bold: opts.bold, fill });
    setFormula(row.getCell(3), fC, fmt, { bold: opts.bold, fill });
    setFormula(row.getCell(4), fD, fmt, { bold: opts.bold, fill: opts.fillD || (opts.bold ? AZUL : undefined) });
    const fE = opts.customE || `C${r2Cur}-B${r2Cur}`;
    setFormula(row.getCell(5), fE, opts.fmtE || fmt, { bold: opts.bold, fill: opts.fillE || (opts.bold ? VERDE : GRIS) });
    r2Cur++;
  };

  pushSec2('1. ESCALA FÍSICA Y CONSUMO DE ALIMENTO EN GRANJA');
  pushRow2('avesInic', 'Pollos iniciados (Día 1)', '$B$6', '$B$6', '600', '#,##0');
  pushRow2('bajas', 'Mortalidad esperada en crianza (3,0% sobre iniciadas)', `ROUND(B${R2.avesInic}*$B$8,0)`, `ROUND(C${R2.avesInic}*$B$8,0)`, `ROUND(D${R2.avesInic}*$B$8,0)`, '#,##0');
  pushRow2('avesFin', 'Pollos vivos listos al final del ciclo', `B${R2.avesInic}-B${R2.bajas}`, `C${R2.avesInic}-C${R2.bajas}`, `D${R2.avesInic}-D${R2.bajas}`, '#,##0', { bold: true, fill: GRIS, fillD: GRIS });
  pushRow2('pesoVivoAve', 'Peso vivo promedio por pollo en granja (kg)', '$B$10', '$B$10', '$B$10', '0.000');
  pushRow2('pesoVivoTot', 'Peso vivo total producido en granja (kg vivos)', `B${R2.avesFin}*B${R2.pesoVivoAve}`, `C${R2.avesFin}*C${R2.pesoVivoAve}`, `D${R2.avesFin}*D${R2.pesoVivoAve}`, '#,##0.0', { bold: true, fill: GRIS, fillD: GRIS });
  pushRow2('bultosInic', 'Bultos Alimento Iniciación (d1-7 Sem 1, supervivencia 99,25%)', `ROUNDUP(B${R2.avesInic}*0.175*(1-0.25*$B$8)/40,0)`, `ROUNDUP(C${R2.avesInic}*0.175*(1-0.25*$B$8)/40,0)`, `ROUNDUP(D${R2.avesInic}*0.175*(1-0.25*$B$8)/40,0)`, '0');
  pushRow2('bultosPre', 'Bultos Alimento Preiniciador (d8-21 Sem 2-3, sup. 98,35%)', `ROUNDUP(B${R2.avesInic}*1.029*(1-0.55*$B$8)/40,0)`, `ROUNDUP(C${R2.avesInic}*1.029*(1-0.55*$B$8)/40,0)`, `ROUNDUP(D${R2.avesInic}*1.029*(1-0.55*$B$8)/40,0)`, '0');
  pushRow2('bultosEng', 'Bultos Alimento Engorde (d22-salida Sem 4-6, sup. 97,6% | +3,8% harina)', `ROUNDUP(B${R2.avesInic}*($B$11-1.204)*(1-0.80*$B$8)/40,0)`, `ROUNDUP(C${R2.avesInic}*($B$11-1.204)*(1-0.80*$B$8)*(1+${p1}!$D$${R1.extraHarina})/40,0)`, `ROUNDUP(D${R2.avesInic}*($B$11-1.204)*(1-0.80*$B$8)/40,0)`, '0');
  pushRow2('bultosTot', 'Total bultos requeridos (40 kg c/u)', `B${R2.bultosInic}+B${R2.bultosPre}+B${R2.bultosEng}`, `C${R2.bultosInic}+C${R2.bultosPre}+C${R2.bultosEng}`, `D${R2.bultosInic}+D${R2.bultosPre}+D${R2.bultosEng}`, '0', { bold: true, fill: GRIS, fillD: GRIS });
  pushRow2('fcrReal', 'Conversión Alimenticia Efectiva (kg alimento comprado / kg vivo producido)', `IFERROR(B${R2.bultosTot}*40/B${R2.pesoVivoTot},0)`, `IFERROR(C${R2.bultosTot}*40/C${R2.pesoVivoTot},0)`, `IFERROR(D${R2.bultosTot}*40/D${R2.pesoVivoTot},0)`, '0.000');

  pushSec2('2. COSTOS DE PRODUCCIÓN EN GRANJA (HASTA POLLO VIVO SIN SACRIFICIO)');
  pushRow2('precioPollito', 'Precio unitario pollito de 1 día aplicado (COP/ave)', `${p1}!$D$${R1.pollitoBmanga}`, `${p1}!$D$${R1.pollitoBmanga}`, `${p1}!$D$${R1.pollitoLocal}`, '#,##0');
  pushRow2('costoPollito', 'Compra total de pollitos de 1 día (COP)', `B${R2.avesInic}*B${R2.precioPollito}`, `C${R2.avesInic}*C${R2.precioPollito}`, `D${R2.avesInic}*D${R2.precioPollito}`, '#,##0');
  pushRow2(
    'costoAlim',
    'Costo total de alimento puesto en granja (3 etapas, incl. flete/pigmento en Propio)',
    `B${R2.bultosInic}*${p1}!$D$${R1.alimInic}+B${R2.bultosPre}*${p1}!$D$${R1.alimPre}+B${R2.bultosEng}*${p1}!$D$${R1.alimEngCom}`,
    `C${R2.bultosInic}*${p1}!$D$${R1.alimInic}+C${R2.bultosPre}*${p1}!$D$${R1.alimPre}+C${R2.bultosEng}*(${p1}!$D$${R1.alimEngPropio}+${p1}!$D$${R1.fletePigmento})`,
    `D${R2.bultosInic}*${p1}!$D$${R1.alimInic}+D${R2.bultosPre}*${p1}!$D$${R1.alimPre}+D${R2.bultosEng}*${p1}!$D$${R1.alimEngCom}`,
    '#,##0'
  );
  pushRow2(
    'costoInsumos',
    'Insumos operativos de granja (cama, gas, vacunas y energía @ $1.325/ave)',
    `B${R2.avesInic}*SUM(${p1}!$D$${R1.cama}:${p1}!$D$${R1.energia})`,
    `C${R2.avesInic}*SUM(${p1}!$D$${R1.cama}:${p1}!$D$${R1.energia})`,
    `D${R2.avesInic}*SUM(${p1}!$D$${R1.cama}:${p1}!$D$${R1.energia})`,
    '#,##0'
  );
  pushRow2(
    'costoFijos',
    'Arriendo galpón asignado + Colaborador ($400.000/lote)',
    `${p1}!$D$${R1.arriendoIni}*${p1}!$D$${R1.mesesLoteStd}+${p1}!$D$${R1.colaborador}`,
    `${p1}!$D$${R1.arriendoIni}*${p1}!$D$${R1.mesesLoteStd}+${p1}!$D$${R1.colaborador}`,
    `${p1}!$D$${R1.arriendoIni}*${p1}!$D$${R1.mesesLoteStd}+${p1}!$D$${R1.colaborador}`,
    '#,##0'
  );
  pushRow2(
    'costoVivoTot',
    'SUBTOTAL COSTO DE CRIANZA EN GRANJA — Pollo Vivo sin sacrificio (COP)',
    `B${R2.costoPollito}+B${R2.costoAlim}+B${R2.costoInsumos}+B${R2.costoFijos}`,
    `C${R2.costoPollito}+C${R2.costoAlim}+C${R2.costoInsumos}+C${R2.costoFijos}`,
    `D${R2.costoPollito}+D${R2.costoAlim}+D${R2.costoInsumos}+D${R2.costoFijos}`,
    '#,##0',
    { bold: true }
  );
  pushRow2(
    'costoKgVivo',
    'COSTO DE PRODUCCIÓN POR KILO VIVO EN GRANJA (Punto equilibrio en pie, COP/kg)',
    `IFERROR(B${R2.costoVivoTot}/B${R2.pesoVivoTot},0)`,
    `IFERROR(C${R2.costoVivoTot}/C${R2.pesoVivoTot},0)`,
    `IFERROR(D${R2.costoVivoTot}/D${R2.pesoVivoTot},0)`,
    '#,##0',
    { bold: true }
  );

  pushSec2('3. OPCIÓN A — VENTA DE POLLO VIVO EN GRANJA (REFERENCIA SIN SACRIFICIO)');
  pushRow2('precioVivo', 'Precio de venta referencia pollo vivo en puerta de granja (COP/kg)', `${p1}!$D$${R1.precioVivo}`, `${p1}!$D$${R1.precioVivo}`, `${p1}!$D$${R1.precioVivo}`, '#,##0');
  pushRow2('ingresoVivo', 'Ingreso bruto vendiendo pollo vivo en granja (COP)', `B${R2.pesoVivoTot}*B${R2.precioVivo}`, `C${R2.pesoVivoTot}*C${R2.precioVivo}`, `D${R2.pesoVivoTot}*D${R2.precioVivo}`, '#,##0');
  pushRow2('utilidadVivo', 'Utilidad neta vendiendo pollo vivo en granja (COP)', `B${R2.ingresoVivo}-B${R2.costoVivoTot}`, `C${R2.ingresoVivo}-C${R2.costoVivoTot}`, `D${R2.ingresoVivo}-D${R2.costoVivoTot}`, '#,##0', { bold: true, fill: GRIS, fillD: GRIS });

  pushSec2('4. PROCESAMIENTO EN PLANTA DE BENEFICIO (PASO A CANAL CON MENUDENCIAS)');
  pushRow2('costoSacrificio', 'Servicio de sacrificio en beneficiadero ($1.500 x pollos finales)', `B${R2.avesFin}*${p1}!$D$${R1.sacrificio}`, `C${R2.avesFin}*${p1}!$D$${R1.sacrificio}`, `D${R2.avesFin}*${p1}!$D$${R1.sacrificio}`, '#,##0');
  pushRow2('kgCanalVend', 'Carne vendible en CANAL CON MENUDENCIAS (82,5% del peso vivo - merma B12, kg)', `B${R2.pesoVivoTot}*$B$13*(1-$B$12)`, `C${R2.pesoVivoTot}*$B$13*(1-$B$12)`, `D${R2.pesoVivoTot}*$B$13*(1-$B$12)`, '#,##0.0', { bold: true, fill: GRIS, fillD: GRIS });
  pushRow2('costoComerc', 'Logística y empaque post-sacrificio (editable Hoja 1)', `B${R2.kgCanalVend}*${p1}!$D$${R1.logisticaCanal}`, `C${R2.kgCanalVend}*${p1}!$D$${R1.logisticaCanal}`, `D${R2.kgCanalVend}*${p1}!$D$${R1.logisticaCanal}`, '#,##0');
  pushRow2('costoCanalTot', 'INVERSIÓN TOTAL PUESTA EN CANAL (Crianza + Sacrificio + Logística, COP)', `B${R2.costoVivoTot}+B${R2.costoSacrificio}+B${R2.costoComerc}`, `C${R2.costoVivoTot}+C${R2.costoSacrificio}+C${R2.costoComerc}`, `D${R2.costoVivoTot}+D${R2.costoSacrificio}+D${R2.costoComerc}`, '#,##0', { bold: true });
  pushRow2('costoKgCanal', 'COSTO FINAL POR KILO EN CANAL CON MENUDENCIAS (Punto equilibrio, COP/kg)', `IFERROR(B${R2.costoCanalTot}/B${R2.kgCanalVend},0)`, `IFERROR(C${R2.costoCanalTot}/C${R2.kgCanalVend},0)`, `IFERROR(D${R2.costoCanalTot}/D${R2.kgCanalVend},0)`, '#,##0', { bold: true });

  pushSec2('5. OPCIÓN B — VENTA FINAL PROCESADO EN CANAL CON MENUDENCIAS (RECOMENDADA)');
  pushRow2('precioCanal', 'Precio de venta referencia en canal con menudencias (COP/kg)', `${p1}!$D$${R1.precioCanal}`, `${p1}!$D$${R1.precioCanal}`, `${p1}!$D$${R1.precioCanal}`, '#,##0');
  pushRow2('ingresoCanal', 'Ingreso bruto total vendiendo en canal con menudencias (COP)', `B${R2.kgCanalVend}*B${R2.precioCanal}`, `C${R2.kgCanalVend}*C${R2.precioCanal}`, `D${R2.kgCanalVend}*D${R2.precioCanal}`, '#,##0');
  pushRow2('utilidadCanal', 'UTILIDAD NETA LIBRE VENDIENDO EN CANAL (COP)', `B${R2.ingresoCanal}-B${R2.costoCanalTot}`, `C${R2.ingresoCanal}-C${R2.costoCanalTot}`, `D${R2.ingresoCanal}-D${R2.costoCanalTot}`, '#,##0', { bold: true, fill: VERDE_FUERTE });
  pushRow2('margenCanal', 'Margen neto sobre las ventas en canal (%)', `IFERROR(B${R2.utilidadCanal}/B${R2.ingresoCanal},0)`, `IFERROR(C${R2.utilidadCanal}/C${R2.ingresoCanal},0)`, `IFERROR(D${R2.utilidadCanal}/D${R2.ingresoCanal},0)`, '0.0%');
  pushRow2('roiCiclo', 'Retorno sobre inversión total del ciclo (42 días, %)', `IFERROR(B${R2.utilidadCanal}/B${R2.costoCanalTot},0)`, `IFERROR(C${R2.utilidadCanal}/C${R2.costoCanalTot},0)`, `IFERROR(D${R2.utilidadCanal}/D${R2.costoCanalTot},0)`, '0.0%', { bold: true });
  pushRow2('extraCanal', 'Ganancia adicional por procesar vs. vender pollo vivo en granja (COP)', `B${R2.utilidadCanal}-B${R2.utilidadVivo}`, `C${R2.utilidadCanal}-C${R2.utilidadVivo}`, `D${R2.utilidadCanal}-D${R2.utilidadVivo}`, '#,##0', { bold: true, fill: AZUL, fillD: AZUL });
  pushRow2('precioIndif', 'Precio mínimo en canal donde da igual vender vivo a $7.400/kg (COP/kg)', `IFERROR((B${R2.ingresoVivo}+B${R2.costoSacrificio}+B${R2.costoComerc})/B${R2.kgCanalVend},0)`, `IFERROR((C${R2.ingresoVivo}+C${R2.costoSacrificio}+C${R2.costoComerc})/C${R2.kgCanalVend},0)`, `IFERROR((D${R2.ingresoVivo}+D${R2.costoSacrificio}+D${R2.costoComerc})/D${R2.kgCanalVend},0)`, '#,##0', { bold: true, fill: ROJO_SUAVE, fillD: ROJO_SUAVE });
  protectSheet(ws2);

  // =========================================================================
  // HOJA 3: 3_Proyeccion_Anual_12_Meses (Corregida: 12 meses reales de arriendo,
  // listas texto sin 0/1, ROUNDUP real por lote sin bug lineal, Capital Pico real)
  // =========================================================================
  ws3.columns = [
    { width: 50 }, { width: 17 }, { width: 17 }, { width: 17 },
    { width: 17 }, { width: 17 }, { width: 17 }, { width: 20 }
  ];
  styleTitle(
    ws3,
    'AV-1 · PROYECCIÓN FINANCIERA ANUAL (6 CAMADAS · 12 MESES REALES DE ARRIENDO)',
    'Celdas AMARILLAS editables con menú desplegable ("100% Comercial" / "Mixto Propio"). Incluye los 12 meses completos de arriendo del año y Capital de Trabajo Pico Real.'
  );

  const h3 = ws3.getRow(4);
  h3.values = [
    'Concepto / Camada del Año',
    'Camada 1 (Real)', 'Camada 2', 'Camada 3', 'Camada 4', 'Camada 5', 'Camada 6',
    'CONSOLIDADO 12 MESES'
  ];
  styleHeader(h3);

  const cols = ['B', 'C', 'D', 'E', 'F', 'G'];
  const avesDef = [600, 800, 800, 800, 800, 800];
  const dietDef = ['100% Comercial', '100% Comercial', 'Mixto Propio', 'Mixto Propio', 'Mixto Propio', 'Mixto Propio'];
  // 12 meses reales en operación todo-dentro/todo-fuera de 6 ciclos/año (2 meses/ciclo: Lotes 1-2 a tarifa meses 1-4 $750k/mes; Lotes 3-6 a canon regular $1.000k/mes)
  const mesesArrDef = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0];

  const l2 = "'2_Rentabilidad_por_Lote'";
  const r3_5 = ws3.getRow(5); r3_5.getCell(1).value = 'Aves iniciadas por camada (editable)'; r3_5.getCell(1).border = BORDE;
  const r3_6 = ws3.getRow(6); r3_6.getCell(1).value = 'Programa de alimento en engorde (días 22 a salida)'; r3_6.getCell(1).border = BORDE;
  const r3_7 = ws3.getRow(7); r3_7.getCell(1).value = 'Precio pollito aplicado (COP/ave)'; r3_7.getCell(1).border = BORDE;
  const r3_8 = ws3.getRow(8); r3_8.getCell(1).value = 'Meses de arriendo cubiertos por camada (suma = 12 meses/año)'; r3_8.getCell(1).border = BORDE;
  const r3_9 = ws3.getRow(9); r3_9.getCell(1).value = 'Canon mensual de arriendo aplicable (Meses 1-4 vs. 5-12)'; r3_9.getCell(1).border = BORDE;

  cols.forEach((cl, idx) => {
    setInput(r3_5.getCell(2 + idx), avesDef[idx], '#,##0');
    const cDiet = r3_6.getCell(2 + idx);
    setInput(cDiet, dietDef[idx], null, 'center');
    cDiet.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"100% Comercial,Mixto Propio"']
    };
    setFormula(
      r3_7.getCell(2 + idx),
      idx === 0 ? `${p1}!$D$${R1.pollitoLocal}` : `${p1}!$D$${R1.pollitoBmanga}`,
      '#,##0'
    );
    setInput(r3_8.getCell(2 + idx), mesesArrDef[idx], '0.0');
    setFormula(
      r3_9.getCell(2 + idx),
      idx < 2 ? `${p1}!$D$${R1.arriendoIni}` : `${p1}!$D$${R1.arriendoReg}`,
      '#,##0'
    );
  });
  setFormula(r3_5.getCell(8), 'SUM(B5:G5)', '#,##0', { bold: true, fill: GRIS });
  setFormula(r3_6.getCell(8), 'COUNTIF(B6:G6,"Mixto Propio")&" c/Propio"', '@', { fill: GRIS, align: 'center' });
  setFormula(r3_7.getCell(8), 'AVERAGE(B7:G7)', '#,##0', { fill: GRIS });
  setFormula(r3_8.getCell(8), 'SUM(B8:G8)', '0.0', { bold: true, fill: GRIS });
  setFormula(r3_9.getCell(8), 'AVERAGE(B9:G9)', '#,##0', { fill: GRIS });

  // Cálculo exacto por fase con ROUNDUP para eliminar el bug del prorrateo lineal ($48.100)
  const bInicC = (cl) => `ROUNDUP(${cl}5*0.175*(1-0.25*${l2}!$B$8)/40,0)`;
  const bPreC = (cl) => `ROUNDUP(${cl}5*1.029*(1-0.55*${l2}!$B$8)/40,0)`;
  const bEngComC = (cl) => `ROUNDUP(${cl}5*(${l2}!$B$11-1.204)*(1-0.80*${l2}!$B$8)/40,0)`;
  const bEngProC = (cl) => `ROUNDUP(${cl}5*(${l2}!$B$11-1.204)*(1-0.80*${l2}!$B$8)*(1+${p1}!$D$${R1.extraHarina})/40,0)`;

  const anualRows = [
    [11, 'Pollos vivos finales comercializados (tras mortalidad)', (cl) => `${cl}5-ROUND(${cl}5*${l2}!$B$8,0)`, '#,##0', 'SUM(B11:G11)', false],
    [12, 'Compra de pollitos de 1 día (COP)', (cl) => `${cl}5*${cl}7`, '#,##0', 'SUM(B12:G12)', false],
    [13, 'Alimento balanceado (ROUNDUP exacto por lote y programa)', (cl) => `${bInicC(cl)}*${p1}!$D$${R1.alimInic}+${bPreC(cl)}*${p1}!$D$${R1.alimPre}+IF(${cl}6="Mixto Propio",${bEngProC(cl)}*(${p1}!$D$${R1.alimEngPropio}+${p1}!$D$${R1.fletePigmento}),${bEngComC(cl)}*${p1}!$D$${R1.alimEngCom})`, '#,##0', 'SUM(B13:G13)', false],
    [14, 'Insumos operativos granja (@ $1.325/ave iniciada)', (cl) => `${cl}5*SUM(${p1}!$D$${R1.cama}:${p1}!$D$${R1.energia})`, '#,##0', 'SUM(B14:G14)', false],
    [15, 'Arriendo real 12 meses + Colaborador ($400k/lote)', (cl) => `${cl}8*${cl}9+${p1}!$D$${R1.colaborador}`, '#,##0', 'SUM(B15:G15)', false],
    [16, 'COSTO CRIANZA EN GRANJA — Pollo Vivo (COP)', (cl) => `SUM(${cl}12:${cl}15)`, '#,##0', 'SUM(B16:G16)', true],
    [17, 'Servicio de sacrificio ($1.500/ave) + Logística canal', (cl) => `${cl}11*${p1}!$D$${R1.sacrificio}+${cl}18*${p1}!$D$${R1.logisticaCanal}`, '#,##0', 'SUM(B17:G17)', false],
    [18, 'Carne vendible en canal con menudencias (kg)', (cl) => `${cl}11*${l2}!$B$10*${l2}!$B$13*(1-${l2}!$B$12)`, '#,##0.0', 'SUM(B18:G18)', false],
    [19, 'GASTO TOTAL OPERATIVO DEL LOTE / AÑO EN CANAL (COP)', (cl) => `${cl}16+${cl}17`, '#,##0', 'SUM(B19:G19)', true],
    [20, 'Costo por kilo en canal con menudencias (COP/kg)', (cl) => `IFERROR(${cl}19/${cl}18,0)`, '#,##0', 'IFERROR(H19/H18,0)', true],
    [21, 'Precio de venta referencia en canal (COP/kg)', () => `${p1}!$D$${R1.precioCanal}`, '#,##0', 'AVERAGE(B21:G21)', false],
    [22, 'Ingreso bruto anual vendiendo en canal (COP)', (cl) => `${cl}18*${cl}21`, '#,##0', 'SUM(B22:G22)', false],
    [23, 'UTILIDAD NETA LIBRE POR CAMADA / AÑO (COP)', (cl) => `${cl}22-${cl}19`, '#,##0', 'SUM(B23:G23)', true],
    [24, 'Flujo de utilidad acumulada en el año (COP)', (cl, idx) => (idx === 0 ? 'B23' : `${cols[idx - 1]}24+${cl}23`), '#,##0', 'G23+G24-G23', true]
  ];

  for (const [r, lbl, fFn, fmt, totFml, isHL] of anualRows) {
    const row = ws3.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (isHL) row.getCell(1).font = { bold: true };
    cols.forEach((cl, idx) => {
      setFormula(row.getCell(2 + idx), fFn(cl, idx), fmt, { bold: isHL, fill: r === 23 || r === 24 ? VERDE_FUERTE : (isHL ? VERDE : undefined) });
    });
    setFormula(row.getCell(8), r === 24 ? 'G24' : totFml, fmt, { bold: true, fill: r === 23 || r === 24 ? VERDE_FUERTE : (isHL ? AZUL : GRIS) });
  }

  // Bloque Financiero Real: Capital de Trabajo Pico vs. Gasto Bruto Anual (Filas 26..29)
  ws3.getCell('A26').value = 'INDICADORES DE CAPITAL PARA EL INVERSIONISTA (SEPARA FLUJO ANUAL DE CAPITAL EN RIESGO)';
  styleSubHeader(ws3.getRow(26));
  ws3.mergeCells('A26:H26');
  const kpiAnual = [
    [27, 'Capital de Trabajo Pico Requerido (1 lote máximo rotando sin traslape multi-lote, COP)', 'MAX(B19:G19)', '#,##0', 'Si rotan 2-3 lotes simultáneos (modelo AV-2), sube a ~2,0x este valor mientras cobra Lote 1'],
    [28, 'Retorno Anual sobre Capital de Trabajo Pico (Utilidad Año / Capital Pico, %)', 'IFERROR(H23/B27,0)', '0.0%', 'Rentabilidad anual del dinero rotando durante los 12 meses'],
    [29, 'Margen Neto Anual sobre Ventas Totales (%)', 'IFERROR(H23/H22,0)', '0.0%', 'Margen neto promedio del negocio tras pagar 12 meses completos de arriendo']
  ];
  for (const [r, lbl, fml, fmt, nota] of kpiAnual) {
    const row = ws3.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).font = { bold: true }; row.getCell(1).border = BORDE;
    setFormula(row.getCell(2), fml, fmt, { bold: true, fill: AZUL });
    row.getCell(3).value = nota; row.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(3).border = BORDE;
    ws3.mergeCells(`C${r}:H${r}`);
  }
  protectSheet(ws3);

  // =========================================================================
  // HOJA 0: 0_Resumen_Ejecutivo (Portada < 60 segundos)
  // =========================================================================
  ws0.columns = [
    { width: 48 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 24 }
  ];
  styleTitle(
    ws0,
    'PROYECTO AVÍCOLA 1 (AV-1) · PLAN FINANCIERO Y RENTABILIDAD DEL NEGOCIO',
    'Lectura ejecutiva en menos de 60 segundos: De la crianza en granja al pollo procesado en canal con menudencias. Todo enlazado en tiempo real.'
  );

  const h0 = ws0.getRow(4);
  h0.values = [
    'Etapa del Negocio (De la Granja a la Venta Final)',
    'Base o Regla Visible',
    'Lote 800 Aves (Alimento Comercial)',
    'Lote 800 Aves (Alimento Propio d22+)',
    'Ref. Lote 1 (600 Aves @ $4.500)',
    'Proyección Anual (6 Lotes · 12 Meses)'
  ];
  styleHeader(h0);

  const rows0 = [
    [5, 'Pollos iniciados / Pollos finales al sacrificio', 'Descuenta 3,0% bajas', `ROUND(${l2}!B${R2.avesFin},0)`, `ROUND(${l2}!C${R2.avesFin},0)`, `ROUND(${l2}!D${R2.avesFin},0)`, "'3_Proyeccion_Anual_12_Meses'!H11", '#,##0', false],
    [6, 'Peso vivo total producido en granja (kg)', '~3,00 kg vivo / pollo (42d)', `${l2}!B${R2.pesoVivoTot}`, `${l2}!C${R2.pesoVivoTot}`, `${l2}!D${R2.pesoVivoTot}`, `'3_Proyeccion_Anual_12_Meses'!H11*${l2}!B$10`, '#,##0.0', false],
    [7, '1. COSTO TOTAL CRIANZA EN GRANJA (Pollo vivo, COP)', 'Pollito + Alim. + Insumos + Fijos', `${l2}!B${R2.costoVivoTot}`, `${l2}!C${R2.costoVivoTot}`, `${l2}!D${R2.costoVivoTot}`, "'3_Proyeccion_Anual_12_Meses'!H16", '#,##0', true],
    [8, '   -> Costo por kilo VIVO en granja (sin sacrificio)', 'Punto equilibrio en pie (COP/kg)', `${l2}!B${R2.costoKgVivo}`, `${l2}!C${R2.costoKgVivo}`, `${l2}!D${R2.costoKgVivo}`, "'3_Proyeccion_Anual_12_Meses'!H16/B8*0", '#,##0', false],
    [9, '   -> Utilidad alternativa vendiendo VIVO ($7.400/kg)', 'Ingreso vivo menos crianza', `${l2}!B${R2.utilidadVivo}`, `${l2}!C${R2.utilidadVivo}`, `${l2}!D${R2.utilidadVivo}`, `F6*${p1}!D${R1.precioVivo}-F7`, '#,##0', false],
    [10, '2. Servicio de sacrificio en beneficiadero ($1.500/ave)', 'Incluye logística editable', `${l2}!B${R2.costoSacrificio}+${l2}!B${R2.costoComerc}`, `${l2}!C${R2.costoSacrificio}+${l2}!C${R2.costoComerc}`, `${l2}!D${R2.costoSacrificio}+${l2}!D${R2.costoComerc}`, "'3_Proyeccion_Anual_12_Meses'!H17", '#,##0', false],
    [11, '3. INVERSIÓN TOTAL PUESTA EN CANAL (COP)', 'Crianza + Sacrificio', `${l2}!B${R2.costoCanalTot}`, `${l2}!C${R2.costoCanalTot}`, `${l2}!D${R2.costoCanalTot}`, "'3_Proyeccion_Anual_12_Meses'!H19", '#,##0', true],
    [12, 'Carne vendible en canal con menudencias (kg)', '82,5% del peso vivo', `${l2}!B${R2.kgCanalVend}`, `${l2}!C${R2.kgCanalVend}`, `${l2}!D${R2.kgCanalVend}`, "'3_Proyeccion_Anual_12_Meses'!H18", '#,##0.0', false],
    [13, '   -> Costo final por kilo en CANAL (Punto de equilibrio)', 'Inversión / Kilos canal (COP/kg)', `${l2}!B${R2.costoKgCanal}`, `${l2}!C${R2.costoKgCanal}`, `${l2}!D${R2.costoKgCanal}`, "'3_Proyeccion_Anual_12_Meses'!H20", '#,##0', true],
    [14, '4. Precio de venta mayorista pollo procesado (COP/kg)', 'Con menudencias (molleja/cor.)', `${l2}!B${R2.precioCanal}`, `${l2}!C${R2.precioCanal}`, `${l2}!D${R2.precioCanal}`, "'3_Proyeccion_Anual_12_Meses'!H21", '#,##0', false],
    [15, '5. INGRESO BRUTO TOTAL DE LA VENTA (COP)', 'Kilos canal x Precio venta', `${l2}!B${R2.ingresoCanal}`, `${l2}!C${R2.ingresoCanal}`, `${l2}!D${R2.ingresoCanal}`, "'3_Proyeccion_Anual_12_Meses'!H22", '#,##0', false],
    [16, '6. UTILIDAD NETA LIBRE VENDIENDO PROCESADO (COP)', 'Ingreso menos Inversión Total', `${l2}!B${R2.utilidadCanal}`, `${l2}!C${R2.utilidadCanal}`, `${l2}!D${R2.utilidadCanal}`, "'3_Proyeccion_Anual_12_Meses'!H23", '#,##0', true],
    [17, '   -> Margen neto sobre las ventas (%)', 'Utilidad / Ingreso Bruto', `${l2}!B${R2.margenCanal}`, `${l2}!C${R2.margenCanal}`, `${l2}!D${R2.margenCanal}`, 'IFERROR(F16/F15,0)', '0.0%', false],
    [18, '   -> Retorno sobre capital invertido / Pico (%)', 'Ciclo 42d (cols C-E) / Anual s/Pico (col F)', `${l2}!B${R2.roiCiclo}`, `${l2}!C${R2.roiCiclo}`, `${l2}!D${R2.roiCiclo}`, "'3_Proyeccion_Anual_12_Meses'!B28", '0.0%', true],
    [19, 'Ganancia extra por procesar vs. vender vivo ($7.400/kg)', 'Valor agregado neto del beneficio', `${l2}!B${R2.extraCanal}`, `${l2}!C${R2.extraCanal}`, `${l2}!D${R2.extraCanal}`, 'F16-F9', '#,##0', false]
  ];
  // Corregir F8 (Costo por kg vivo anual promedio):
  rows0[3][6] = 'IFERROR(F7/F6,0)';

  for (const [r, lbl, regla, fC, fD, fE, fF, fmt, isHL] of rows0) {
    const row = ws0.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    row.getCell(2).value = regla; row.getCell(2).border = BORDE; row.getCell(2).font = { italic: true, size: 9, color: { argb: 'FF595959' } };
    if (isHL) row.getCell(1).font = { bold: true };
    const fill = r === 16 ? VERDE_FUERTE : (isHL ? VERDE : undefined);
    setFormula(row.getCell(3), fC, fmt, { bold: isHL, fill });
    setFormula(row.getCell(4), fD, fmt, { bold: isHL, fill });
    setFormula(row.getCell(5), fE, fmt, { bold: isHL, fill: r === 16 ? VERDE_FUERTE : (isHL ? AZUL : undefined) });
    setFormula(row.getCell(6), fF, fmt, { bold: isHL, fill: r === 16 ? VERDE_FUERTE : (isHL ? AZUL : undefined) });
  }

  // Bloque 2 en Portada: Matriz de Sensibilidad 4x3 (Precio Venta Canal x Mortalidad) para 800 aves Comercial
  ws0.getCell('A21').value = 'ANÁLISIS DE RIESGO: UTILIDAD NETA (LOTE 800 AVES COMERCIAL) SEGÚN PRECIO DE VENTA Y MORTALIDAD';
  styleSubHeader(ws0.getRow(21));
  ws0.mergeCells('A21:F21');

  const h0s = ws0.getRow(22);
  h0s.values = [
    'Escenario de Precio en Canal (con menudencias)',
    'Lectura Comercial en Cúcuta',
    'Mortalidad 3,0% (Estándar)',
    'Mortalidad 6,0% (Alerta)',
    'Mortalidad 9,0% (Crítica)',
    'Diferencia 9% vs 3% bajas'
  ];
  styleHeader(h0s);

  const sensPrecios = [
    [23, 9500, 'Piso de indiferencia (~igual a vender vivo a $7.400/kg)'],
    [24, 10500, 'Escenario mayorista conservador (baja estacional)'],
    [25, 11500, 'ESCENARIO BASE ACTUAL ($11.500/kg con menudencias)'],
    [26, 12500, 'Escenario pico demanda o venta directa / Navidad']
  ];
  const morts = [0.03, 0.06, 0.09];
  for (const [r, pr, desc] of sensPrecios) {
    const row = ws0.getRow(r);
    row.getCell(1).value = pr; row.getCell(1).numFmt = '"$"#,##0"/kg"'; row.getCell(1).font = { bold: true }; row.getCell(1).border = BORDE;
    row.getCell(2).value = desc; row.getCell(2).font = { italic: true, size: 9 }; row.getCell(2).border = BORDE;
    morts.forEach((m, mi) => {
      // Formula exacta sin macros recalculando bultos y costos para 800 aves a mortalidad m y precio pr:
      const avesF = `(800-ROUND(800*${m},0))`;
      const kgCan = `(${avesF}*${l2}!$B$10*${l2}!$B$13*(1-${l2}!$B$12))`;
      const cAlim = `(ROUNDUP(800*0.175*(1-0.25*${m})/40,0)*${p1}!$D$${R1.alimInic}+ROUNDUP(800*1.029*(1-0.55*${m})/40,0)*${p1}!$D$${R1.alimPre}+ROUNDUP(800*(${l2}!$B$11-1.204)*(1-0.80*${m})/40,0)*${p1}!$D$${R1.alimEngCom})`;
      const cVarFijo = `(800*${p1}!$D$${R1.pollitoBmanga}+800*SUM(${p1}!$D$${R1.cama}:${p1}!$D$${R1.energia})+${l2}!$B$${R2.costoFijos}+${avesF}*${p1}!$D$${R1.sacrificio}+${kgCan}*${p1}!$D$${R1.logisticaCanal})`;
      const fmlUtil = `(${kgCan}*A${r})-(${cAlim}+${cVarFijo})`;
      setFormula(row.getCell(3 + mi), fmlUtil, '#,##0', {
        bold: r === 25 && mi === 0,
        fill: r === 25 && mi === 0 ? VERDE_FUERTE : (r === 23 ? ROJO_SUAVE : undefined)
      });
    });
    setFormula(row.getCell(6), `E${r}-C${r}`, '#,##0', { fill: GRIS });
  }

  // Bloque 3: Mensajes Clave en Portada
  ws0.getCell('A28').value = 'MENSAJES CLAVE PARA EL GERENTE Y EL INVERSIONISTA';
  styleSubHeader(ws0.getRow(28));
  ws0.mergeCells('A28:F28');
  const msgs = [
    '1. Por qué procesamos el pollo (42d): Pagar $1.500/ave de sacrificio ($1,16M) convierte $4,00M de ganancia en pie en $7,69M en canal (+$3,69M extra/lote). Punto equilibrio canal: $7.488/kg.',
    '2. Compra directa de pollito en Bucaramanga: Bajar de $4.500 a $3.200/ave ahorra -$1.040.000 directos en cada lote de 800 aves y reduce el costo en canal en -$542/kg.',
    '3. Alimento propio en harina (engorde d22+): Incluso pagando $3.800/bulto de flete + pigmento amarillo oro y +3,8% más consumo, reduce el costo de engorde en -$908.800/lote (-$474/kg canal, planta >=45 t/mes).',
    '4. Meta 6 semanas (42d) vs. 2,70 kg: Con 42 días (4.445 g/ave calc.) y Ross 2,995 kg vivo entrega ~2,47 kg canal c/menudencias; si el comprador exige >=2,70 kg c/menud., extender +3 días (Día 45 = 2,72 kg).',
    '5. Honestidad anual (12 meses): La proyección anual carga los 12 meses reales de arriendo ($11,0M/año), logrando $40,27M de utilidad neta anual con capital pico rotativo de 1 ciclo ($15,11M; 266,6% ROI).'
  ];
  msgs.forEach((m, idx) => {
    const r = 29 + idx;
    ws0.getCell(`A${r}`).value = m;
    ws0.getCell(`A${r}`).font = { size: 9, color: { argb: 'FF333333' } };
    ws0.getCell(`A${r}`).border = BORDE;
    ws0.mergeCells(`A${r}:F${r}`);
  });
  protectSheet(ws0);

  const outPath = path.join(__dirname, 'AV1_Plan_Financiero_Avicola.xlsx');
  return wb.xlsx.writeFile(outPath).then(() => outPath);
}

if (require.main === module) {
  buildPlanFinanciero()
    .then((p) => {
      console.log('OK ->', p);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { buildPlanFinanciero };
