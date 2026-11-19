'use strict';

const path = require('path');
const ExcelJS = require(path.resolve(__dirname, '../modelo/node_modules/exceljs'));

// Curva oficial Ross 308 AP (2021) Mixto (g/ave y consumo g/ave) - Fuente: PDF Ross 308 AP 2021 pág. 3 interna / 4 PDF
const ROSS_PESO_G = [
  44, // d0
  60, 77, 96, 118, 143, 170, 201,
  235, 272, 313, 357, 404, 455, 510,
  568, 629, 694, 762, 833, 907, 984,
  1064, 1147, 1232, 1319, 1408, 1500, 1593,
  1688, 1784, 1882, 1981, 2080, 2181, 2282,
  2384, 2486, 2588, 2690, 2792, 2894, 2995,
  3096, 3197, 3297, 3396, 3494, 3591, 3687
];

const ROSS_CONS_DIA_G = [
  // d1..d49
  11, 14, 18, 22, 27, 31, 35,
  40, 45, 49, 54, 59, 64, 69,
  75, 80, 85, 91, 96, 102, 108,
  113, 119, 124, 130, 136, 141, 147,
  152, 157, 163, 168, 173, 178, 183,
  187, 192, 197, 201, 205, 209, 213,
  217, 221, 224, 227, 231, 234, 237
];

const ROSS_CONS_ACUM_G = [
  // d1..d49 (tabla Ross AP 2021)
  11, 25, 43, 66, 92, 123, 158,
  198, 243, 292, 346, 406, 470, 539,
  614, 694, 780, 871, 967, 1069, 1177,
  1290, 1409, 1533, 1663, 1799, 1940, 2086,
  2238, 2395, 2558, 2726, 2899, 3076, 3259,
  3447, 3639, 3835, 4036, 4242, 4451, 4664,
  4881, 5102, 5326, 5553, 5784, 6018, 6254
];

// Rendimiento canal eviscerado seco exacto PDF Ross 308 AP 2021 (págs. 12-13 PDF, promedio Macho/Hembra)
const REND_SECO_EXACTO = [
  [2.80, 'Día 40', 0.7452],
  [3.00, 'Día 42 (24-dic, Meta 6 Semanas)', 0.7475],
  [3.30, 'Día 45 (27-dic, +3d para 2,72 kg)', 0.7514],
  [3.40, 'Día 46', 0.7527],
  [3.59, 'Día 48 (30-dic, 2,71 kg evisc. seco)', 0.7551]
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

function styleSubHeader(row) {
  row.height = 21;
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FF1F4E78' }, size: 10 };
    c.fill = AZUL;
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

function buildControlOperacion() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'División Avícola AV-2 - Operación Activa en Granja Lotes 1 a 3';
  wb.created = new Date('2026-11-14T11:25:00Z');
  wb.calcProperties.fullCalcOnLoad = true;

  // Orden gerencial: Portada -> Plan 3 Lotes & Flujo Caja -> Costos Lote 1 -> Puente Alimento Propio -> Bitácora Diaria -> Pesajes -> Anexo Auditoría
  const ws0 = wb.addWorksheet('0_Tablero_Gerencial', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws1 = wb.addWorksheet('1_Plan_3_Lotes_y_Capacidad', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const ws2 = wb.addWorksheet('2_Costos_y_Equilibrio_Lote1', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws3 = wb.addWorksheet('3_Impacto_Alimento_Propio', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });
  const ws4 = wb.addWorksheet('4_Bitacora_Diaria_Lote1', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const ws5 = wb.addWorksheet('5_Pesajes_y_Beneficio', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  const ws6 = wb.addWorksheet('6_Anexo_Auditoria_Inicial', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
  });

  // =========================================================================
  // HOJA 0: 0_Tablero_Gerencial (Parámetros Lote 1 en B5:B17 + Resumen Ejecutivo)
  // =========================================================================
  ws0.columns = [
    { width: 48 }, { width: 19 }, { width: 19 }, { width: 21 }, { width: 21 }, { width: 34 }
  ];
  styleTitle(
    ws0,
    'PROYECTO AVÍCOLA 2 (AV-2) · OPERACIÓN ACTIVA EN GRANJA — LOTES 1 A 3 (NOV 2026 – ENE 2027)',
    'Lote 1 alojado 2026-11-13 (600 pollos) | Lote 2 (+10 días, 800 pollos) | Lote 3 (salida 15-ene-2027, 800 pollos). Celdas AMARILLAS editables.'
  );

  ws0.getCell('A4').value = 'PARÁMETROS DE CONTROL OPERATIVO Y FINANCIERO — LOTE 1 (ENTRADAS)';
  styleSubHeader(ws0.getRow(4));
  ws0.mergeCells('A4:F4');

  // Filas 5..18 en Col B (celdas fijas referenciadas por todo el libro)
  const params0 = [
    [5, 'Fecha de ingreso Lote 1 (Día 1 en galpón)', new Date(Date.UTC(2026, 10, 13)), 'yyyy-mm-dd', 'Alojados el 13 de noviembre de 2026'],
    [6, 'Cantidad de pollos iniciados Lote 1 (aves)', 600, '#,##0', 'Comprados 600 pollos Ross 308 AP a $4.500/ave'],
    [7, 'Edad objetivo de salida al mercado (días)', 42, '0', '42 días (6 semanas = 24-dic, ~3,00 kg vivo / 2,47 kg c/menud.) | 45d (27-dic = 2,72 kg)'],
    [8, 'Mortalidad esperada para presupuesto financiero (%)', 0.030, '0.0%', 'Usa 3,0% para no inflar ingresos (o baja real registrada si es mayor); compras mantienen respaldo 0%'],
    [9, 'Factor ajuste clima cálido Cúcuta sobre peso vivo (%)', 0.000, '+0.0%;-0.0%;0.0%', '0,0% = objetivo Ross; digite -5% a -8% para simular pérdida por calor'],
    [10, 'Peso comercial meta por pollo procesado (kg)', 2.70, '0.00', 'Meta comercial deseada (2,70 kg sin pluma; a 42d Ross = ~2,47 kg con menudencias)'],
    [11, 'Rendimiento procesado CON menudencias (%)', 0.825, '0.0%', 'Incluye canal eviscerada (~74,75% a d42) + hígado, molleja, corazón y pescuezo (~7,75%)'],
    [12, 'Rendimiento eviscerado seco SIN menudencias (%)', 0.7475, '0.00%', 'Promedio exacto PDF Ross 308 AP 2021 para pollo de 3,00 kg (Día 42)'],
    [13, 'Merma adicional transporte / segunda calidad (%)', 0.000, '0.0%', '0,0% base teórica; digite 2,0%-3,5% para modelar descarte/merma en planta'],
    [14, 'Arriendo mensual del galpón (COP/mes)', 750000, '#,##0', 'Contrato inicial primeros 4 meses ($3.000.000 totales)'],
    [15, 'Meses de arriendo asignados al Lote 1 (meses)', 1.0, '0.00', '1,00 mes bajo rotación escalonada (cada lote en Hoja 1 tiene su propio campo; contrato = 4,0 meses)'],
    [16, 'Pago fijo colaborador acompañamiento Lote 1 (COP)', 400000, '#,##0', 'Valor fijo acordado por acompañamiento del lote'],
    [17, 'Precio de venta referencia — Pollo PROCESADO con menudencias (COP/kg)', 11500, '#,##0', 'Precio Cenabastos / mercado Cúcuta dic-2026'],
    [18, 'Precio de venta alternativa — Pollo VIVO en puerta de granja (COP/kg)', 7400, '#,##0', 'Venta en granja sin servicio de sacrificio']
  ];
  for (const [r, lbl, val, fmt, nota] of params0) {
    const row = ws0.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    setInput(row.getCell(2), val, fmt);
    row.getCell(3).value = nota; row.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(3).border = BORDE;
    ws0.mergeCells(`C${r}:F${r}`);
  }

  // Bloque B: Estado Real de Bitácora Lote 1 (Filas 20..25)
  ws0.getCell('A20').value = 'ESTADO EN VIVO DEL LOTE 1 (ACTUALIZADO DESDE BITÁCORA DIARIA Y PESAJES)';
  styleSubHeader(ws0.getRow(20));
  ws0.mergeCells('A20:F20');

  const estadoVivo = [
    [21, 'Días registrados con alimento real en Bitácora', "COUNT('4_Bitacora_Diaria_Lote1'!K5:K53)", '0', 'Se actualiza al digitar consumo diario en Hoja 4'],
    [22, 'Fecha proyectada de sacrificio Lote 1 (según edad B7)', 'B5+B7-1', 'yyyy-mm-dd', 'Día 42 (6 sem) = jueves 24-dic-2026 | Día 45 (2,72 kg) = dom 27-dic'],
    [23, 'Mortalidad + descarte acumulada registrada hoy en galpón (aves)', "SUM('4_Bitacora_Diaria_Lote1'!G5:G53)+SUM('4_Bitacora_Diaria_Lote1'!H5:H53)", '#,##0', 'Límite meta <= 3,5% (máximo 21 aves en 600)'],
    [24, 'Pollos vivos proyectados al sacrificio (tras bajas efectivas)', "MIN(INDEX('4_Bitacora_Diaria_Lote1'!I5:I53,MATCH(B7,'4_Bitacora_Diaria_Lote1'!A5:A53,0)),ROUND(B6*(1-B8),0))", '#,##0', 'Toma 3,0% esperado (582 aves) mientras no supere las bajas reales registradas'],
    [25, 'Mortalidad efectiva aplicada en proyecciones (%)', 'IFERROR(1-B24/B6,0)', '0.0%', 'Si los registros reales de bajas superan 3,0%, ajusta todo automáticamente']
  ];
  for (const [r, lbl, fml, fmt, nota] of estadoVivo) {
    const row = ws0.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    setFormula(row.getCell(2), fml, fmt, { bold: r === 24, fill: r === 24 ? AZUL : GRIS });
    row.getCell(3).value = nota; row.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(3).border = BORDE;
    ws0.mergeCells(`C${r}:F${r}`);
  }

  // Bloque C: Resumen Ejecutivo "De la Granja a la Venta Final" (Lote 1 vs Lote 2 vs Lote 3 vs Consolidado) -> Filas 27..41
  ws0.getCell('A27').value = 'RESUMEN EJECUTIVO DE LA OPERACIÓN ACTIVA: DE LA GRANJA A LA VENTA FINAL';
  styleSubHeader(ws0.getRow(27));
  ws0.mergeCells('A27:F27');

  const h0c = ws0.getRow(28);
  h0c.values = [
    'Etapa / Indicador Económico',
    'Lote 1 (600 Aves · Hoy)',
    'Lote 2 (+10d · 800 Aves)',
    'Lote 3 (15-Ene · 800 Aves)',
    'CONSOLIDADO 3 LOTES',
    'Observación Gerencial'
  ];
  styleHeader(h0c);

  // Filas referenciadas desde Hoja 1 (1_Plan_3_Lotes_y_Capacidad) -> las definiremos con mapa R1L en Hoja 1 primero?
  // En JS construimos primero las filas lógicas de Hoja 1 (o conocemos exacto R1L). Mejor aún: construimos ws4, ws5, ws2, ws3, ws1, ws6 y al final llenamos Bloque C y D de ws0!
  // ¡Qué práctica de ingeniería tan limpia y libre de errores de fila!

  // =========================================================================
  // HOJA 4: 4_Bitacora_Diaria_Lote1 (d1..d49 en filas 5..53)
  // =========================================================================
  ws4.columns = [
    { width: 6 }, { width: 12 }, { width: 16 }, { width: 13 }, { width: 12 }, { width: 13 },
    { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 14 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 34 }
  ];
  styleTitle(
    ws4,
    'AV-2 · BITÁCORA DIARIA EN GALPÓN — LOTE 1 (600 POLLOS ROSS 308 AP, DÍAS 1 A 49)',
    'Celdas AMARILLAS = registro diario en granja (mortalidad, descarte, alimento servido kg, temperatura, agua 1,8-2,0 L/kg alimento). Alimento futuro usa curva Ross.'
  );
  const h4 = ws4.getRow(4);
  h4.values = [
    'Día', 'Fecha', 'Etapa / Alimento', 'Peso Ross (g)', 'Cons. Ross (g/d)', 'Acum. Ross (g)',
    'Bajas Mort.', 'Descarte', 'Aves Vivas', 'Est. Hato (kg/d)', 'Alim. Real (kg)', 'Desvío (kg)',
    'Acum. Lote (kg)', 'Bultos Acum.', 'Temp. (°C)', 'Agua Real (L)', 'Agua : Alim.', 'Manejo / Vacunas / Observaciones'
  ];
  styleHeader(h4);

  const hitos = {
    1: 'Recepción 600 pollos (13-nov) | Agua+electrolitos | 32-33°C',
    7: 'Fin Sem 1 Masterpollito (~175 g/ave calc.) | Sug. Vacuna Newcastle + Bronquitis | Pesaje S1',
    8: 'Cambio a Preiniciador Nutrepollo (ICA 3054 AL) desde 20-nov | Sem 2-3 (~1,03 kg/ave)',
    11: '23-nov: Ingreso programado Lote 2 (800 pollos @ $3.200 en sección aislada)',
    14: 'Fin Sem 2 | Sug. Vacuna Gumboro (IBD) | Pesaje Semana 2',
    21: 'Último día Preiniciador Nutrepollo (~984 g vivo Ross) | Pesaje S3 | <21°C desde hoy',
    22: '04-dic: Inicio Engorde Broiler I Dorado (Sem 4-6, pelet 3 mm)',
    23: '05-dic: Ingreso programado Lote 3 (800 pollos) para salir 15-ene-2027 (42 días)',
    28: 'Pesaje Semana 4 (~1,59 kg vivo)',
    35: 'Pesaje Semana 5 (~2,28 kg vivo) | Vigilar estrés calórico Cúcuta',
    42: '24-dic META 6 SEMANAS LOTE 1 | ~3,00 kg vivo (~2,47 kg con menud.; ayuno 10-12h antes)',
    45: '27-dic Opción +3d | ~3,30 kg vivo (~2,72 kg con menudencias si el cliente exige 2,70 kg)',
    48: '30-dic | ~3,59 kg vivo (~2,71 kg eviscerado seco sin menudencias)',
    49: '31-dic | Cierre máximo tabla (~3,69 kg vivo)'
  };

  for (let d = 1; d <= 49; d++) {
    const r = 4 + d;
    const row = ws4.getRow(r);
    row.getCell(1).value = d; row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(1).border = BORDE;
    setFormula(row.getCell(2), `'0_Tablero_Gerencial'!$B$5+A${r}-1`, 'yyyy-mm-dd', { align: 'center' });
    row.getCell(3).value = d <= 7 ? 'Iniciación (d1-7 · S1)' : (d <= 21 ? 'Preiniciador (d8-21 · S2-3)' : 'Engorde (d22+ · S4-6)');
    row.getCell(3).border = BORDE;
    row.getCell(3).fill = d <= 7 ? VERDE : (d <= 21 ? AZUL : GRIS);

    row.getCell(4).value = ROSS_PESO_G[d]; row.getCell(4).numFmt = '#,##0'; row.getCell(4).border = BORDE;
    row.getCell(5).value = ROSS_CONS_DIA_G[d - 1]; row.getCell(5).numFmt = '0'; row.getCell(5).border = BORDE;
    row.getCell(6).value = ROSS_CONS_ACUM_G[d - 1]; row.getCell(6).numFmt = '#,##0'; row.getCell(6).border = BORDE;

    setInput(row.getCell(7), null, '0');
    setInput(row.getCell(8), null, '0');
    const prevI = d === 1 ? "'0_Tablero_Gerencial'!$B$6" : `I${r - 1}`;
    setFormula(row.getCell(9), `${prevI}-IF(ISNUMBER(G${r}),G${r},0)-IF(ISNUMBER(H${r}),H${r},0)`, '#,##0');
    setFormula(row.getCell(10), `I${r}*E${r}/1000`, '0.0');
    setInput(row.getCell(11), null, '0.0');
    setFormula(row.getCell(12), `IF(ISNUMBER(K${r}),K${r}-J${r},"")`, '+0.0;-0.0;0.0');
    const prevM = d === 1 ? '0' : `M${r - 1}`;
    setFormula(row.getCell(13), `${prevM}+IF(ISNUMBER(K${r}),K${r},J${r})`, '#,##0.0');
    setFormula(row.getCell(14), `M${r}/40`, '0.0');
    setInput(row.getCell(15), null, '0.0');
    setInput(row.getCell(16), null, '0');
    setFormula(row.getCell(17), `IF(AND(ISNUMBER(P${r}),ISNUMBER(K${r}),K${r}>0),P${r}/K${r},"")`, '0.00');
    setInput(row.getCell(18), hitos[d] || '');
    row.getCell(18).font = { bold: Boolean(hitos[d]), size: 9 };
  }

  const fasesResumen = [
    [54, 'Iniciación Masterpollito (d1-7 · Sem 1)', 'SUM(K5:K11)+SUMIFS(J5:J11,K5:K11,"")', 'SUM(G5:G11)+SUM(H5:H11)'],
    [55, 'Preiniciador Nutrepollo (d8-21 · Sem 2-3)', 'SUM(K12:K25)+SUMIFS(J12:J25,K12:K25,"")', 'SUM(G12:G25)+SUM(H12:H25)'],
    [56, 'Engorde Broiler Dorado (d22-42 · Sem 4-6)', 'SUM(K26:K46)+SUMIFS(J26:J46,K26:K46,"")', 'SUM(G26:G46)+SUM(H26:H46)'],
    [57, 'Engorde Broiler Dorado (d22-45 · opc. 2,72 kg)', 'SUM(K26:K49)+SUMIFS(J26:J49,K26:K49,"")', 'SUM(G26:G49)+SUM(H26:H49)'],
    [58, 'Engorde Broiler Dorado (d22-48 · opc. seco)', 'SUM(K26:K52)+SUMIFS(J26:J52,K26:K52,"")', 'SUM(G26:G52)+SUM(H26:H52)']
  ];
  for (const [r, lbl, fmlKg, fmlMort] of fasesResumen) {
    const row = ws4.getRow(r);
    row.getCell(3).value = lbl; row.getCell(3).font = { bold: true }; row.getCell(3).border = BORDE;
    setFormula(row.getCell(9), fmlMort, '0', { fill: GRIS });
    setFormula(row.getCell(10), fmlKg, '#,##0.0', { bold: true, fill: VERDE });
    setFormula(row.getCell(14), `J${r}/40`, '0.0', { bold: true, fill: VERDE });
  }
  const rDyn = ws4.getRow(59);
  rDyn.getCell(3).value = 'Engorde Broiler Dorado (d22 a Edad Meta B7)'; rDyn.getCell(3).font = { bold: true }; rDyn.getCell(3).border = BORDE;
  setFormula(
    rDyn.getCell(10),
    'SUMIFS(K26:K53,A26:A53,"<="&\'0_Tablero_Gerencial\'!$B$7)+SUMIFS(J26:J53,A26:A53,"<="&\'0_Tablero_Gerencial\'!$B$7,K26:K53,"")',
    '#,##0.0',
    { bold: true, fill: AZUL }
  );
  setFormula(rDyn.getCell(14), 'J59/40', '0.0', { bold: true, fill: AZUL });
  protectSheet(ws4);

  // =========================================================================
  // HOJA 5: 5_Pesajes_y_Beneficio (Corregida: FCR Meta Ross, rango IEP > 350, REND_SECO exacto PDF Ross)
  // =========================================================================
  ws5.columns = [
    { width: 8 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 12 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 13 }, { width: 12 }, { width: 11 }, { width: 12 }
  ];
  styleTitle(
    ws5,
    'AV-2 · PESAJE SEMANAL, CONVERSIÓN ALIMENTICIA (FCR) Y BENEFICIO EN PLANTA',
    'Registre muestras semanales de 30+ pollos y el pesaje real de sacrificio. Índice IEP > 350 = excelente desempeño productivo.'
  );
  ws5.getCell('A4').value = 'SECCIÓN A: CONTROL DE PESO SEMANAL Y CONVERSIÓN ALIMENTICIA VS. META ROSS 308 AP';
  styleSubHeader(ws5.getRow(4));
  ws5.mergeCells('A4:N4');

  const h5a = ws5.getRow(5);
  h5a.values = [
    'Día', 'Fecha', 'Muestra (aves)', 'Peso Muestra (kg)', 'Peso Real (g)', 'Meta Ross (g)',
    'Dif. vs Ross (%)', 'Acum. Lote (kg)', 'Aves Vivas', 'Peso Vivo Lote (kg)', 'FCR Real Lote', 'FCR Meta Ross', 'IEP (Meta >350)'
  ];
  styleHeader(h5a);

  [7, 14, 21, 28, 35, 42, 45, 48].forEach((dia, idx) => {
    const r = 6 + idx;
    const row = ws5.getRow(r);
    setInput(row.getCell(1), dia, '0');
    setFormula(row.getCell(2), `'0_Tablero_Gerencial'!$B$5+A${r}-1`, 'yyyy-mm-dd', { align: 'center' });
    setInput(row.getCell(3), 30, '0');
    setInput(row.getCell(4), null, '0.00');
    setFormula(row.getCell(5), `IF(AND(ISNUMBER(D${r}),ISNUMBER(C${r}),C${r}>0),D${r}/C${r}*1000,"")`, '#,##0', { bold: true });
    setFormula(row.getCell(6), `INDEX('4_Bitacora_Diaria_Lote1'!$D$5:$D$53,MATCH(A${r},'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))`, '#,##0');
    setFormula(row.getCell(7), `IF(ISNUMBER(E${r}),(E${r}-F${r})/F${r},"")`, '+0.0%;-0.0%;0.0%');
    setFormula(row.getCell(8), `INDEX('4_Bitacora_Diaria_Lote1'!$M$5:$M$53,MATCH(A${r},'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))`, '#,##0.0');
    setFormula(row.getCell(9), `INDEX('4_Bitacora_Diaria_Lote1'!$I$5:$I$53,MATCH(A${r},'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))`, '#,##0');
    setFormula(row.getCell(10), `IF(ISNUMBER(E${r}),I${r}*E${r}/1000,I${r}*F${r}/1000)`, '#,##0.0');
    setFormula(row.getCell(11), `IF(AND(ISNUMBER(E${r}),E${r}>0),H${r}/(I${r}*E${r}/1000),"")`, '0.000', { bold: true, fill: VERDE });
    setFormula(row.getCell(12), `INDEX('4_Bitacora_Diaria_Lote1'!$F$5:$F$53,MATCH(A${r},'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/F${r}`, '0.000', { fill: GRIS });
    setFormula(row.getCell(13), `IF(AND(ISNUMBER(K${r}),K${r}>0),((I${r}/'0_Tablero_Gerencial'!$B$6*100)*(E${r}/1000))/(A${r}*K${r})*100,"")`, '#,##0');
  });

  ws5.getCell('A16').value = 'SECCIÓN B: CONVERSIÓN DE POLLO VIVO A CANAL SIN PLUMA (RENDIMIENTO EXACTO ROSS 308 AP 2021)';
  styleSubHeader(ws5.getRow(16));
  ws5.mergeCells('A16:I16');
  const h5b = ws5.getRow(17);
  h5b.values = [
    'Peso Vivo (kg)', 'Edad Ross Mixto', '% Canal Seco Ross', 'Eviscerado Seco sin Menudencias (kg)', '% Menudencias',
    'Canal CON Menudencias (kg)', '¿Cumple >=2,70 kg con menud.?', '¿Cumple >=2,70 kg sin menud.?', 'Nota Comercial'
  ];
  styleHeader(h5b);

  REND_SECO_EXACTO.forEach(([pv, ed, rSeco], idx) => {
    const r = 18 + idx;
    const row = ws5.getRow(r);
    row.getCell(1).value = pv; row.getCell(1).numFmt = '0.00'; row.getCell(1).border = BORDE;
    row.getCell(2).value = ed; row.getCell(2).border = BORDE;
    row.getCell(3).value = rSeco; row.getCell(3).numFmt = '0.00%'; row.getCell(3).border = BORDE;
    setFormula(row.getCell(4), `A${r}*C${r}`, '0.00');
    row.getCell(5).value = 0.074; row.getCell(5).numFmt = '0.0%'; row.getCell(5).border = BORDE;
    setFormula(row.getCell(6), `A${r}*(C${r}+E${r})`, '0.00', { bold: true });
    setFormula(row.getCell(7), `IF(F${r}>='0_Tablero_Gerencial'!$B$10,"SÍ","NO")`, null, { align: 'center', fill: idx >= 2 ? VERDE : ROJO_SUAVE });
    setFormula(row.getCell(8), `IF(D${r}>='0_Tablero_Gerencial'!$B$10,"SÍ","NO")`, null, { align: 'center', fill: idx === 4 ? VERDE : ROJO_SUAVE });
    row.getCell(9).value = idx === 1
      ? 'META ACTUAL 6 SEM (42d): ~2,47 kg con menudencias'
      : (idx === 2
        ? 'Requiere +3d (27-dic) para alcanzar 2,72 kg c/menudencias'
        : (idx === 4 ? 'Solo si el cliente exige 2,70 kg seco sin vísceras' : ''));
    row.getCell(9).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(9).border = BORDE;
  });

  ws5.getCell('A25').value = 'SECCIÓN C: LIQUIDACIÓN REAL EN PLANTA DE BENEFICIO (LLENAR AL SACRIFICIO)';
  styleSubHeader(ws5.getRow(25));
  ws5.mergeCells('A25:D25');
  const benRows = [
    [26, 'Pollos recibidos vivos en planta de beneficio (cabezas)', null, '#,##0', true],
    [27, 'Peso vivo total antes de beneficio en finca/planta (kg)', null, '#,##0.0', true],
    [28, 'Peso total canal fría SIN menudencias (kg)', null, '#,##0.0', true],
    [29, 'Peso total menudencias limpias (hígado, molleja, corazón y pescuezo, kg)', null, '#,##0.0', true],
    [30, 'Rendimiento real eviscerado seco (%)', 'IF(AND(ISNUMBER(C27),C27>0,ISNUMBER(C28)),C28/C27,"")', '0.0%', false],
    [31, 'Rendimiento real CON menudencias (%)', 'IF(AND(ISNUMBER(C27),C27>0,ISNUMBER(C28),ISNUMBER(C29)),(C28+C29)/C27,"")', '0.0%', false]
  ];
  for (const [r, lbl, val, fmt, isInp] of benRows) {
    const row = ws5.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    ws5.mergeCells(`A${r}:B${r}`);
    if (isInp) setInput(row.getCell(3), val, fmt);
    else setFormula(row.getCell(3), val, fmt, { bold: true, fill: VERDE });
  }
  protectSheet(ws5);

  // =========================================================================
  // HOJA 2: 2_Costos_y_Equilibrio_Lote1 (Antes 4_Flujo_Caja_y_Costo_Kg)
  // Corregida: subtítulo exacto sin $1,5M falso, Etapa 1 Granja -> Etapa 2 Sacrificio
  // =========================================================================
  ws2.columns = [
    { width: 52 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 38 }
  ];
  styleTitle(
    ws2,
    'AV-2 · COSTOS REALES, PLAN DE COMPRAS Y PUNTO DE EQUILIBRIO — LOTE 1 (600 POLLOS)',
    'Enlazado en tiempo real a Hoja 0 (arriendo asignado, edad meta B7 y mortalidad efectiva B25). Celdas AMARILLAS = editables con facturas.'
  );

  // Sección 1: Presupuesto Inicial Base 54 Bultos y Precios Solla (Filas 4..9)
  const h2_1 = ws2.getRow(4);
  h2_1.values = ['1. Presupuesto Base Inicial (54 Bultos) y Precios Reales Solla', 'Bultos (40kg)', 'Precio/Bulto', 'Subtotal (COP)', 'Precio / kg', 'Registro ICA / Presentación Real'];
  styleHeader(h2_1);

  const alimInit = [
    [5, 'Iniciación d1-7 (Sem 1): Solla Masterpollito Elite (24% PC)', 3, 106500, 'ICA 9508 AL · Minipelet 2 mm · 175 g/ave (2,63 b. -> 3 b. iniciales)'],
    [6, 'Preiniciador d8-21 (Sem 2-3): Solla Nutrepollo Crombo Elite (20% PC)', 11, 96200, 'ICA 3054 AL · Crombo · 1.029 g/ave (faltan +5 bultos a los 11 comprados)'],
    [7, 'Engorde d22-42 (Sem 4-6): Solla Broiler I Dorado Elite (18,5% PC)', 40, 93400, 'ICA 16430 AL · Pelet 3 mm · 3.241 g/ave (48-49 b. requeridos vs 40 base)']
  ];
  for (const [r, lbl, b, p, obs] of alimInit) {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    setInput(row.getCell(2), b, '0.0');
    setInput(row.getCell(3), p, '#,##0');
    setFormula(row.getCell(4), `B${r}*C${r}`, '#,##0');
    setFormula(row.getCell(5), `C${r}/40`, '#,##0.0');
    row.getCell(6).value = obs; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
  }
  const r2_8 = ws2.getRow(8);
  r2_8.getCell(1).value = 'Subtotal Presupuesto Inicial de Alimento (54 bultos)'; r2_8.getCell(1).font = { bold: true }; r2_8.getCell(1).border = BORDE;
  setFormula(r2_8.getCell(2), 'SUM(B5:B7)', '0.0', { bold: true, fill: GRIS });
  setFormula(r2_8.getCell(3), 'D8/B8', '#,##0', { fill: GRIS });
  setFormula(r2_8.getCell(4), 'SUM(D5:D7)', '#,##0', { bold: true, fill: GRIS });
  setFormula(r2_8.getCell(5), 'C8/40', '#,##0.0', { fill: GRIS });

  // Sección 2: Plan de Abastecimiento Bodega (0% bajas) vs Presupuesto Financiero Ajustado por Mortalidad (Filas 10..17)
  ws2.getCell('A10').value = '2. REQUERIMIENTO DE ALIMENTO: PRESUPUESTO AJUSTADO A MORTALIDAD VS. RESERVA FÍSICA BODEGA (0% BAJAS)';
  styleSubHeader(ws2.getRow(10));
  ws2.mergeCells('A10:F10');
  const h2_2 = ws2.getRow(11);
  h2_2.values = ['Etapa de Alimentación', 'Bultos Ppto. (c/bajas)', 'Adicional vs 54 b.', 'Reserva Bodega (0% bajas)', 'Costo Alimento Ppto. (COP)', 'Diferencia Faltante vs Base (COP)'];
  styleHeader(h2_2);

  // Fórmula exacta por fase (Consumo Pollo 6 sem: 0,175 + 1,029 + 3,241 = 4,445 kg/ave) reconciliada con AV-1 usando mortalidad efectiva B25 de Hoja 0!
  const p0 = "'0_Tablero_Gerencial'";
  const fmlBultosPpto = [
    [12, 'Iniciación Masterpollito (d1-7 · Sem 1)', `ROUNDUP(${p0}!$B$6*0.175*(1-0.25*${p0}!$B$25)/40,0)`, 'B5', 'C5', `ROUNDUP(${p0}!$B$6*0.175/40,0)`],
    [13, 'Preiniciador Nutrepollo (d8-21 · Sem 2-3)', `ROUNDUP(${p0}!$B$6*1.029*(1-0.55*${p0}!$B$25)/40,0)`, 'B6', 'C6', `ROUNDUP(${p0}!$B$6*1.029/40,0)`],
    [14, 'Engorde Broiler Dorado (d22 a Edad Meta B7)', `ROUNDUP(${p0}!$B$6*(3.241+(INDEX('4_Bitacora_Diaria_Lote1'!$F$5:$F$53,MATCH(${p0}!$B$7,'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/1000-4.664))*(1-0.80*${p0}!$B$25)/40,0)`, 'B7', 'C7', `ROUNDUP(${p0}!$B$6*(3.241+(INDEX('4_Bitacora_Diaria_Lote1'!$F$5:$F$53,MATCH(${p0}!$B$7,'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/1000-4.664))/40,0)`]
  ];
  for (const [r, lbl, fPpto, refInit, refPrec, fBod] of fmlBultosPpto) {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    setFormula(row.getCell(2), fPpto, '0', { bold: true });
    setFormula(row.getCell(3), `B${r}-${refInit}`, '+0;-0;0', { fill: ROJO_SUAVE });
    setFormula(row.getCell(4), fBod, '0', { fill: GRIS });
    setFormula(row.getCell(5), `B${r}*${refPrec}`, '#,##0', { bold: true });
    setFormula(row.getCell(6), `C${r}*${refPrec}`, '#,##0', { fill: ROJO_SUAVE });
  }
  const r2_15 = ws2.getRow(15);
  r2_15.getCell(1).value = 'TOTAL ALIMENTO PROYECTADO LOTE 1'; r2_15.getCell(1).font = { bold: true }; r2_15.getCell(1).border = BORDE;
  setFormula(r2_15.getCell(2), 'SUM(B12:B14)', '0', { bold: true, fill: VERDE });
  setFormula(r2_15.getCell(3), 'SUM(C12:C14)', '+0;-0;0', { bold: true, fill: ROJO_SUAVE });
  setFormula(r2_15.getCell(4), 'SUM(D12:D14)', '0', { bold: true, fill: GRIS });
  setFormula(r2_15.getCell(5), 'SUM(E12:E14)', '#,##0', { bold: true, fill: VERDE });
  setFormula(r2_15.getCell(6), 'SUM(F12:F14)', '#,##0', { bold: true, fill: ROJO_SUAVE });

  // Sección 3: Cascada Ordenada de Costos "De la Granja a la Venta Final" (Filas 17..43)
  ws2.getCell('A17').value = '3. ESTRUCTURA COMPLETA DE COSTOS Y RENTABILIDAD (ETAPA 1 GRANJA -> ETAPA 2 BENEFICIO -> VENTA)';
  styleSubHeader(ws2.getRow(17));
  ws2.mergeCells('A17:F17');
  const h2_3 = ws2.getRow(18);
  h2_3.values = ['Rubro de Inversión o Etapa', 'Cantidad', 'Costo Unitario', 'Total (COP)', '% sobre Canal', 'Observación'];
  styleHeader(h2_3);

  const rubros2 = [
    [19, 'Pollitos de 1 día Ross 308 AP (compra real local)', `${p0}!B6`, 4500, true, 'Lotes 2 y 3 bajan a $3.200 directo en Bucaramanga (-$1.300/ave)'],
    [20, 'Cama para piso (cascarilla de arroz / viruta)', 1, 180000, true, '$300 por ave iniciada (editar según factura real)'],
    [21, 'Gas propano / calefacción semanas 1 a 3', 1, 255000, true, '$425 por ave iniciada (reconciliado con Estándar AV-1)'],
    [22, 'Vacunas (Newcastle, Gumboro), vitaminas y desinfectante', 1, 240000, true, '$400 por ave iniciada'],
    [23, 'Energía eléctrica, agua y varios granja', 1, 120000, true, '$200 por ave iniciada (Total insumos granja = $795.000)'],
    [24, 'Arriendo asignado del galpón (meses Hoja 0!B15)', `${p0}!B15`, `${p0}!B14`, false, 'Tarifa mensual $750.000 (ver cobertura completa 4 meses en Hoja 1)'],
    [25, 'Colaborador acompañamiento técnico Lote 1', 1, `${p0}!B16`, false, 'Valor fijo acordado ($400.000/lote)']
  ];
  for (const [r, lbl, cant, unit, unitIsInp, nota] of rubros2) {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (typeof cant === 'number') setInput(row.getCell(2), cant, '#,##0.0');
    else setFormula(row.getCell(2), cant, '#,##0.0');
    if (unitIsInp) setInput(row.getCell(3), unit, '#,##0');
    else setFormula(row.getCell(3), unit, '#,##0');
    setFormula(row.getCell(4), `B${r}*C${r}`, '#,##0', { bold: r >= 24 });
    setFormula(row.getCell(5), `IFERROR(D${r}/$D$32,0)`, '0.0%');
    row.getCell(6).value = nota; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
  }

  // Subtotales ordenados sin mezclar sacrificio dentro de granja (Filas 27..32)
  const addSub2 = (r, lbl, fD, fill, bold = true) => {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (bold) row.getCell(1).font = { bold: true };
    setFormula(row.getCell(4), fD, '#,##0', { bold, fill });
    setFormula(row.getCell(5), `IFERROR(D${r}/$D$32,0)`, '0.0%', { bold });
  };
  addSub2(27, 'Subtotal Alimento Proyectado Lote 1 (de Sección 2)', 'E15', GRIS);
  addSub2(28, 'Subtotal Pollito + Insumos Operativos Granja', 'SUM(D19:D23)', undefined, false);
  addSub2(29, 'Subtotal Fijos Galpón (Arriendo + Colaborador)', 'D24+D25', AMARILLO);
  addSub2(30, 'ETAPA 1 · COSTO TOTAL EN GRANJA — Pollo Vivo sin sacrificio (COP)', 'D27+D28+D29', AZUL);

  // Fila 31: ETAPA 2 Sacrificio ($1.500/ave final B24) + Costo logística post-sacrificio (editable $0)
  const r2_31 = ws2.getRow(31);
  r2_31.getCell(1).value = 'ETAPA 2 · Servicio de Sacrificio / Beneficiadero ($1.500/pollo vivo final)'; r2_31.getCell(1).border = BORDE;
  setFormula(r2_31.getCell(2), `${p0}!B24`, '#,##0');
  setInput(r2_31.getCell(3), 1500, '#,##0');
  setFormula(r2_31.getCell(4), 'B31*C31', '#,##0', { bold: true });
  setFormula(r2_31.getCell(5), 'IFERROR(D31/$D$32,0)', '0.0%');
  r2_31.getCell(6).value = 'Se aplica únicamente al vender pollo procesado; excluido en venta vivo en granja'; r2_31.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; r2_31.getCell(6).border = BORDE;

  const r2_32 = ws2.getRow(32);
  r2_32.getCell(1).value = 'INVERSIÓN TOTAL PUESTA EN CANAL (Crianza Granja + Sacrificio, COP)'; r2_32.getCell(1).font = { bold: true }; r2_32.getCell(1).border = BORDE;
  setFormula(r2_32.getCell(4), 'D30+D31', '#,##0', { bold: true, fill: VERDE });
  setFormula(r2_32.getCell(5), '1', '0.0%', { bold: true });

  // Indicadores finales en orden cronológico (Filas 34..43)
  const econ2 = [
    [34, 'Peso vivo promedio por pollo al sacrificio (kg, ajustado clima B9)', `(INDEX('4_Bitacora_Diaria_Lote1'!$D$5:$D$53,MATCH(${p0}!$B$7,'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/1000)*(1+${p0}!$B$9)`, '0.000', false],
    [35, 'Peso vivo total en granja (kg de pollo vivo vendible)', `${p0}!B24*B34`, '#,##0.0', true],
    [36, 'COSTO POR KILO VIVO EN GRANJA (sin sacrificio, punto equilibrio en pie)', 'IFERROR(D30/B35,0)', '#,##0', true],
    [37, 'Utilidad neta alternativa vendiendo VIVO en granja a $7.400/kg (COP)', `B35*${p0}!B18-D30`, '#,##0', false],
    [38, 'Carne vendible en CANAL CON MENUDENCIAS (82,5% - merma B13, kg)', `B35*${p0}!B11*(1-${p0}!B13)`, '#,##0.0', true],
    [39, 'COSTO POR KILO EN CANAL CON MENUDENCIAS (incl. sacrificio $1.500/ave)', 'IFERROR(D32/B38,0)', '#,##0', true],
    [40, 'Costo por kilo eviscerado seco SIN menudencias (74,75% a d42, COP/kg)', `IFERROR(D32/(B35*${p0}!B12*(1-${p0}!B13)),0)`, '#,##0', false],
    [41, 'Precio de venta referencia en canal con menudencias (COP/kg)', `${p0}!B17`, '#,##0', false],
    [42, 'INGRESO BRUTO TOTAL VENDIENDO EN CANAL (Kilos x Precio, COP)', 'B38*B41', '#,##0', false],
    [43, 'UTILIDAD NETA LIBRE VENDIENDO EN CANAL (COP)', 'B42-D32', '#,##0', true],
    [44, 'Margen neto sobre venta / ROI por ciclo en canal (%)', 'IFERROR(B43/B42,0)', '0.0%', true],
    [45, 'Retorno sobre capital invertido en el ciclo (ROI %)', 'IFERROR(B43/D32,0)', '0.0%', true],
    [46, 'Precio mínimo en canal donde da igual vender vivo a $7.400/kg (COP/kg)', `IFERROR((B35*${p0}!B18+D31)/B38,0)`, '#,##0', true]
  ];
  for (const [r, lbl, fml, fmt, isHL] of econ2) {
    const row = ws2.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (isHL) row.getCell(1).font = { bold: true };
    const fill = r === 43 ? VERDE_FUERTE : (r === 46 ? ROJO_SUAVE : (isHL ? VERDE : GRIS));
    setFormula(row.getCell(2), fml, fmt, { bold: isHL, fill });
  }
  protectSheet(ws2);

  // =========================================================================
  // HOJA 3: 3_Impacto_Alimento_Propio (sin jerga críptica RL/audit_fitasa)
  // =========================================================================
  ws3.columns = [
    { width: 54 }, { width: 20 }, { width: 46 }
  ];
  styleTitle(
    ws3,
    'AV-2 · EVALUADOR DE INTEGRACIÓN CON PLANTA PROPIA EN ENGORDE (DÍAS 22+)',
    'Compara alimento comercial peletizado (Solla Broiler I Dorado) contra fórmula propia en harina incluyendo flete, pigmento y conversión.'
  );
  const h3p = ws3.getRow(3);
  h3p.values = ['Parámetro Económico', 'Valor', 'Criterio de Validación en Campo'];
  styleHeader(h3p);

  const p3Rows = [
    [4, 'Precio real alimento comercial Broiler I Dorado (COP/bulto 40 kg)', "='2_Costos_y_Equilibrio_Lote1'!C7", '#,##0', false, 'Dato real cotizado Cúcuta ($93.400/bulto)'],
    [5, 'Precio por kilo comercial peletizado (COP/kg)', '=B4/40', '#,##0.0', false, 'Equivalente comercial puesto en granja'],
    [6, 'Costo fórmula propia en harina puesto en planta (COP/kg)', 1825, '#,##0.0', true, '$73.000/bulto puesto en planta (requiere escala >= 45 t/mes para cubrir fijos planta)'],
    [7, 'Flete planta -> granja + pigmento amarillo oro (COP/kg harina)', 95, '#,##0.0', true, '$75/kg flete ($3.000/bulto) + $20/kg xantofila piel amarilla ($800/bulto); 0 si en finca'],
    [8, 'Costo total harina propia puesta en galpón (COP/kg)', '=B6+B7', '#,##0.0', false, 'Costo real en comedero incluyendo logística y pigmento'],
    [9, 'Mayor consumo físico esperado en harina vs. pelet (%)', 0.038, '0.0%', true, '3,8% con molienda gruesa controlada (subir a 6,5% si molienda fina)'],
    [10, 'Costo efectivo ajustado por conversión en granja (COP/kg)', '=B8*(1+B9)', '#,##0.0', false, 'Base justa comparable 1:1 contra 1 kg de alimento peletizado'],
    [11, 'Ahorro neto real frente al alimento comercial (%)', '=1-B10/B5', '0.0%', false, 'Ahorro porcentual verdadero después de conversión, flete y pigmento'],
    [12, 'Ahorro neto real por bulto equivalente de 40 kg (COP/bulto)', '=(B5-B10)*40', '#,##0', false, 'Ganancia limpia por cada bulto comercial sustituido'],
    [13, '% del engorde (d22+) alimentado con piloto propio en este lote', 0.00, '0.0%', true, '0% mientras se cotiza/monta planta; 50% o 100% cuando inicie ensayo'],
    [14, 'Bultos comerciales requeridos en etapa d22 a meta', "='2_Costos_y_Equilibrio_Lote1'!B14", '0', false, 'Tomado en tiempo real del Lote 1'],
    [15, 'Bultos comerciales sustituidos con piloto propio', '=ROUND(B13*B14,0)', '0', false, 'Volumen a formular para el ensayo'],
    [16, 'Ahorro neto proyectado en el Lote 1 por ensayo propio (COP)', '=B15*B12', '#,##0', false, 'Impacto directo en caja del lote']
  ];
  for (const [r, lbl, val, fmt, isInp, obs] of p3Rows) {
    const row = ws3.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (isInp) setInput(row.getCell(2), val, fmt);
    else setFormula(row.getCell(2), String(val).replace(/^=/, ''), fmt, { bold: [8, 10, 11, 12, 16].includes(r), fill: [11, 12, 16].includes(r) ? VERDE : GRIS });
    row.getCell(3).value = obs; row.getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(3).border = BORDE;
  }
  protectSheet(ws3);

  // =========================================================================
  // HOJA 6: 6_Anexo_Auditoria_Inicial (Mueve arqueología del presupuesto 54 bultos al final)
  // =========================================================================
  ws6.columns = [
    { width: 48 }, { width: 17 }, { width: 17 }, { width: 18 }, { width: 17 }, { width: 22 }
  ];
  styleTitle(
    ws6,
    'ANEXO FORENSE · AUDITORÍA PRESUPUESTO 54 BULTOS VS. CALCULADORA 6 SEMANAS (42 DÍAS)',
    'Reconcilia los 54 bultos comprados ($5,11M) contra la hoja real Consumo Pollo (600 pollos, 6 sem = 4.445 g/ave -> 67-68 bultos) y la curva Ross 308 AP.'
  );
  const h6a = ws6.getRow(4);
  h6a.values = [
    'Escenario / Base de Alimentación (600 Aves)',
    'Iniciación ($106,5k)', 'Preiniciador ($96,2k)', 'Engorde ($93,4k)',
    'Total Bultos', 'Costo Alimento Total (COP)'
  ];
  styleHeader(h6a);

  const l2_c = "'2_Costos_y_Equilibrio_Lote1'";
  const audRows = [
    [5, 'Presupuesto inicial comprado (54 bultos / base ~500 aves)', 3, 11, 40],
    [6, 'Día 42 — Calculadora Consumo Pollo 6 sem (4.445 g/ave | 0% bajas bodega)', 'ROUNDUP(600*0.175/40,0)', 'ROUNDUP(600*1.029/40,0)', 'ROUNDUP(600*3.241/40,0)'],
    [7, 'Día 42 — Ppto. Financiero Lote 1 (4.445 g/ave | 3% bajas, ~2,47 kg c/m)', `${l2_c}!B12`, `${l2_c}!B13`, `${l2_c}!B14`],
    [8, 'Día 42 — Curva Teórica Ross 308 AP (4.664 g/ave | 0% bajas bodega)', 'ROUNDUP(600*0.175/40,0)', 'ROUNDUP(600*1.029/40,0)', 'ROUNDUP(600*(4.664-1.204)/40,0)'],
    [9, 'Día 45 — Opción +3d para >=2,70 kg c/menud. (Calc+Ross | 3% bajas)', 'ROUNDUP(600*0.175*(1-0.25*0.03)/40,0)', 'ROUNDUP(600*1.029*(1-0.55*0.03)/40,0)', 'ROUNDUP(600*(3.241+(5.326-4.664))*(1-0.80*0.03)/40,0)']
  ];
  for (const [r, lbl, m, n, b] of audRows) {
    const row = ws6.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    const setV = (c, v) => (typeof v === 'number'
      ? (() => { c.value = v; c.numFmt = '0'; c.border = BORDE; c.alignment = { horizontal: 'right' }; })()
      : setFormula(c, v, '0', { align: 'right' }));
    setV(row.getCell(2), m); setV(row.getCell(3), n); setV(row.getCell(4), b);
    setFormula(row.getCell(5), `SUM(B${r}:D${r})`, '0', { bold: true });
    setFormula(row.getCell(6), `B${r}*${l2_c}!C5+C${r}*${l2_c}!C6+D${r}*${l2_c}!C7`, '#,##0', { bold: true, fill: r === 7 ? VERDE : undefined });
  }
  const r6_10 = ws6.getRow(10);
  r6_10.getCell(1).value = 'Diferencia faltante a Día 42 Ppto. 6 sem (fila 7 vs. 54 bultos comprados)'; r6_10.getCell(1).font = { bold: true }; r6_10.getCell(1).border = BORDE;
  for (let c = 2; c <= 6; c++) {
    const cl = String.fromCharCode(64 + c);
    setFormula(r6_10.getCell(c), `${cl}7-${cl}5`, c === 6 ? '#,##0' : '+0;-0;0', { bold: true, fill: ROJO_SUAVE });
  }

  // Tabla exacta Sem 1 a 6 según Calculadora Consumo Pollo (600 aves)
  ws6.getCell('A12').value = 'DESGLOSE SEMANAL OFICIAL DE CAMPO (HOJA "CONSUMO POLLO" — 600 ANIMALES, 6 SEMANAS)';
  styleSubHeader(ws6.getRow(12));
  ws6.mergeCells('A12:F12');
  const h6b = ws6.getRow(13);
  h6b.values = ['Semana', 'Material Solla', 'Gramos / Ave / Sem', 'Gramos Totales (600 aves)', 'Bultos Exactos (40 kg)', 'Bultos a Comprar / Fase'];
  styleHeader(h6b);
  const semCalc = [
    [14, 'Semana 1 (d1-7)', 'Master Pollito', 175, 'Master Pollito = 3 bultos (cubierta)'],
    [15, 'Semana 2 (d8-14)', 'Nutrepollo Cr SP', 385, 'Nutrepollo S2+S3 = 15,44 -> 16 bultos'],
    [16, 'Semana 3 (d15-21)', 'Nutrepollo Cr SP', 644, 'Faltante Nutrepollo vs 11 comprados = +5 b.'],
    [17, 'Semana 4 (d22-28)', 'Broiler I Pel SP', 931, 'Engorde S4+S5+S6 = 48,62 -> 48 b. (3% bajas)'],
    [18, 'Semana 5 (d29-35)', 'Broiler I Pel SP', 1050, '49 bultos en bodega sin bajas'],
    [19, 'Semana 6 (d36-42)', 'Broiler I Pel SP', 1260, 'Faltante Broiler vs 40 comprados = +8 a +9 b.']
  ];
  for (const [r, sem, mat, gAve, obs] of semCalc) {
    const row = ws6.getRow(r);
    row.getCell(1).value = sem; row.getCell(1).border = BORDE;
    row.getCell(2).value = mat; row.getCell(2).border = BORDE;
    row.getCell(3).value = gAve; row.getCell(3).numFmt = '#,##0'; row.getCell(3).border = BORDE;
    setFormula(row.getCell(4), `C${r}*600`, '#,##0');
    setFormula(row.getCell(5), `D${r}/40000`, '0.00', { bold: true });
    row.getCell(6).value = obs; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
  }
  const r6_20 = ws6.getRow(20);
  r6_20.getCell(1).value = 'TOTAL 6 SEMANAS (42 DÍAS)'; r6_20.getCell(1).font = { bold: true }; r6_20.getCell(1).border = BORDE;
  r6_20.getCell(2).value = 'Plan 3 fases'; r6_20.getCell(2).border = BORDE;
  setFormula(r6_20.getCell(3), 'SUM(C14:C19)', '#,##0', { bold: true, fill: VERDE });
  setFormula(r6_20.getCell(4), 'SUM(D14:D19)', '#,##0', { bold: true, fill: VERDE });
  setFormula(r6_20.getCell(5), 'SUM(E14:E19)', '0.00', { bold: true, fill: VERDE });
  r6_20.getCell(6).value = '67 bultos ppto. (3% bajas) / 68 bultos bodega (0% bajas)'; r6_20.getCell(6).font = { bold: true, size: 9 }; r6_20.getCell(6).border = BORDE;

  const notas6 = [
    '1. Los 3 bultos de Iniciación Masterpollito (120 kg) cubren toda la Semana 1 (105 kg = 2,63 bultos) y dejan 15 kg de remanente para transición.',
    '2. El déficit inmediato está en Nutrepollo S2-S3: necesita 15,44 bultos (16 bultos físicos); los 11 comprados dejan un faltante de +5 bultos.',
    '3. Zootecnia: Con 4.445 g/ave en 42 días (Ross ~2,995 kg vivo), el pollo procesado pesa ~2,47 kg c/menudencias (82,5%); llegar a 2,70 kg requiere ~45 días (~3,30 kg vivo).'
  ];
  notas6.forEach((n, i) => {
    ws6.getCell(`A${22 + i}`).value = n;
    ws6.getCell(`A${22 + i}`).font = { size: 9, color: { argb: 'FF404040' } };
    ws6.mergeCells(`A${22 + i}:F${22 + i}`);
  });
  protectSheet(ws6);

  // =========================================================================
  // HOJA 1: 1_Plan_3_Lotes_y_Capacidad (Plan Multi-Lote + Capacidad Cúcuta + Flujo Caja Semanal)
  // =========================================================================
  ws1.columns = [
    { width: 52 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 38 }
  ];
  styleTitle(
    ws1,
    'AV-2 · PLAN MULTI-LOTE (LOTES 1, 2 Y 3), CAPACIDAD EN GALPÓN Y FLUJO DE CAJA SEMANAL',
    'Sin columnas vacías ni siglas confusas. Sigue el flujo: Granja (Pollo Vivo) -> Sacrificio -> Canal -> Venta -> Capacidad Térmica Cúcuta -> Tesorería Real.'
  );

  // Sección A: Calculadora Inversa Lote 3 (Filas 4..9)
  ws1.getCell('A4').value = 'SECCIÓN A: PROGRAMACIÓN INVERSA LOTE 3 (META SACRIFICIO: 15 DE ENERO DE 2027)';
  styleSubHeader(ws1.getRow(4));
  ws1.mergeCells('A4:G4');

  const p1a = ws1.getRow(5);
  p1a.getCell(1).value = 'Fecha meta de salida al sacrificio Lote 3'; p1a.getCell(1).border = BORDE;
  setInput(p1a.getCell(2), new Date(Date.UTC(2027, 0, 15)), 'yyyy-mm-dd', 'center');
  p1a.getCell(3).value = 'Aves iniciadas Lote 3'; p1a.getCell(3).border = BORDE;
  setInput(p1a.getCell(4), 800, '#,##0');
  p1a.getCell(5).value = 'Pollito B/manga ($)'; p1a.getCell(5).border = BORDE;
  setInput(p1a.getCell(6), 3200, '#,##0');
  setFormula(p1a.getCell(7), 'D5*(4500-F5)', '"Ahorro vs $4.500: $"#,##0', { bold: true, fill: VERDE });

  const h1a = ws1.getRow(6);
  h1a.values = [
    'Escenario de Edad al Beneficio',
    'Peso Vivo Ross (kg)', 'Peso Procesado c/Menud. (kg)', 'Ingreso Día 1 (calendario)',
    'Fecha Límite Pedido (-10d)', 'Bultos Totales (ppto. 3% bajas)', 'Nota de Ayuno Pre-Sacrificio (10-12 h)'
  ];
  styleHeader(h1a);

  const escC3 = [
    [7, 42, ROSS_PESO_G[42] / 1000, ROSS_CONS_ACUM_G[41] / 1000, 'META ACTUAL 6 SEM (~2,47 kg c/menud.); entrar 04-dic si ayuna noche previa'],
    [8, 45, ROSS_PESO_G[45] / 1000, ROSS_CONS_ACUM_G[44] / 1000, 'OPCIÓN +3d SI EXIGE >=2,70 kg con menud.; entrar 01-dic si ayuna noche previa'],
    [9, 48, ROSS_PESO_G[48] / 1000, ROSS_CONS_ACUM_G[47] / 1000, 'Necesario solo si exige 2,70 kg eviscerado seco sin menudencias']
  ];
  for (const [r, edad, pv, caKg, nota] of escC3) {
    const row = ws1.getRow(r);
    row.getCell(1).value = `${edad} días de crecimiento`; row.getCell(1).border = BORDE;
    row.getCell(2).value = pv; row.getCell(2).numFmt = '0.000'; row.getCell(2).border = BORDE;
    setFormula(row.getCell(3), `B${r}*${p0}!$B$11`, '0.00');
    setFormula(row.getCell(4), `$B$5-${edad}+1`, 'yyyy-mm-dd', { bold: true, fill: r === 7 ? VERDE_FUERTE : AMARILLO, align: 'center' });
    setFormula(row.getCell(5), `D${r}-10`, 'yyyy-mm-dd', { align: 'center' });
    const fB = `ROUNDUP($D$5*0.175*(1-0.25*${p0}!$B$8)/40,0)+ROUNDUP($D$5*1.029*(1-0.55*${p0}!$B$8)/40,0)+ROUNDUP($D$5*(3.241+(${caKg}-4.664))*(1-0.80*${p0}!$B$8)/40,0)`;
    setFormula(row.getCell(6), fB, '#,##0', { bold: true });
    row.getCell(7).value = nota; row.getCell(7).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(7).border = BORDE;
  }

  // Sección B: Comparativo Multi-Lote Ordenado (Filas 11..)
  ws1.getCell('A11').value = 'SECCIÓN B: COMPARATIVO FINANCIERO Y CRONOGRAMA DE LOS 3 LOTES (DE LA GRANJA A LA VENTA FINAL)';
  styleSubHeader(ws1.getRow(11));
  ws1.mergeCells('A11:G11');

  const r1_12 = ws1.getRow(12);
  r1_12.getCell(1).value = 'Desfase de entrada Lote 2 después de Lote 1 (días)'; r1_12.getCell(1).border = BORDE;
  setInput(r1_12.getCell(2), 10, '0');
  r1_12.getCell(3).value = 'Edad sacrificio Lotes 2 y 3 (días)'; r1_12.getCell(3).border = BORDE;
  setInput(r1_12.getCell(4), 42, '0');
  r1_12.getCell(5).value = 'Mortalidad esperada Lotes 2 y 3 (%)'; r1_12.getCell(5).border = BORDE;
  setInput(r1_12.getCell(6), 0.030, '0.0%');
  r1_12.getCell(7).value = 'Lote 2 ingresa el 23-nov y sale 03-ene (42d) | Lote 3 ingresa el 05-dic y sale 15-ene (42d).';
  r1_12.getCell(7).font = { italic: true, size: 9, color: { argb: 'FF1F4E78' } }; r1_12.getCell(7).border = BORDE;

  const r1_13 = ws1.getRow(13);
  r1_13.getCell(1).value = 'Meses de arriendo Lote 2 (celda propia independiente)'; r1_13.getCell(1).border = BORDE;
  setInput(r1_13.getCell(2), 1.0, '0.00');
  r1_13.getCell(3).value = 'Meses arriendo Lote 3 (propia)'; r1_13.getCell(3).border = BORDE;
  setInput(r1_13.getCell(4), 1.0, '0.00');
  r1_13.getCell(5).value = 'Insumos granja por ave ($)'; r1_13.getCell(5).border = BORDE;
  setFormula(r1_13.getCell(6), `SUM(${l2_c}!$D$20:$D$23)/${p0}!$B$6`, '#,##0', { fill: GRIS });
  r1_13.getCell(7).value = 'Total contrato inicial = 4,0 meses ($3.000.000); Flujo de Caja abajo absorbe los 4 meses completos.';
  r1_13.getCell(7).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; r1_13.getCell(7).border = BORDE;

  // Cabecera tabla multi-lote SIN columna vacía
  const h1b = ws1.getRow(14);
  h1b.values = [
    'Etapa / Métrica Multi-Lote',
    'Lote 1 (Real en Curso)',
    'Lote 2 (+10 Días)',
    'Lote 3 (Meta 15-Ene)',
    'CONSOLIDADO 3 LOTES',
    'Dif. Lote 2 vs. Lote 1',
    'Criterio / Explicación para Gerencia'
  ];
  styleHeader(h1b);

  const R1L = {};
  let rCur = 15;
  const pushLSec = (titulo) => {
    const row = ws1.getRow(rCur);
    row.getCell(1).value = titulo;
    styleSubHeader(row);
    ws1.mergeCells(`A${rCur}:G${rCur}`);
    rCur++;
  };
  const pushLRow = (key, lbl, bSpec, cSpec, dSpec, fmt, eFml, fFml, nota, opts = {}) => {
    R1L[key] = rCur;
    const sub = (s) => (typeof s === 'string' ? s.replace(/\{r\}/g, String(rCur)) : s);
    const row = ws1.getRow(rCur);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (opts.bold) row.getCell(1).font = { bold: true };
    const fill = opts.fill || (opts.bold ? VERDE : undefined);
    const applySpec = (cell, spec) => {
      if (spec.inp !== undefined) setInput(cell, spec.inp, fmt, spec.align);
      else setFormula(cell, sub(spec.fml), fmt, { bold: opts.bold, fill, align: spec.align });
    };
    applySpec(row.getCell(2), bSpec);
    applySpec(row.getCell(3), cSpec);
    applySpec(row.getCell(4), dSpec);
    if (eFml) setFormula(row.getCell(5), sub(eFml), fmt, { bold: opts.bold, fill: opts.fillE || (opts.bold ? VERDE : GRIS), align: bSpec.align });
    else { row.getCell(5).value = '—'; row.getCell(5).alignment = { horizontal: 'center' }; row.getCell(5).border = BORDE; }
    if (fFml) setFormula(row.getCell(6), sub(fFml), fmt.startsWith('yyyy') ? '+0;-0;0' : fmt, { bold: opts.bold, fill: opts.fillF || ROJO_SUAVE });
    else { row.getCell(6).value = '—'; row.getCell(6).alignment = { horizontal: 'center' }; row.getCell(6).border = BORDE; }
    row.getCell(7).value = nota; row.getCell(7).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(7).border = BORDE;
    rCur++;
  };

  pushLSec('1. CRONOGRAMA Y ESCALA PRODUCTIVA');
  pushLRow('avesInic', 'Pollos iniciados (Día 1)', { fml: `${p0}!B6` }, { inp: 800 }, { fml: 'D5' }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', '+200 aves por lote en Lotes 2 y 3');
  pushLRow('fechaEnt', 'Fecha de ingreso al galpón (Día 1)', { fml: `${p0}!B5`, align: 'center' }, { fml: 'B{r}+B12', align: 'center' }, { fml: '$B$5-$D$12+1', align: 'center' }, 'yyyy-mm-dd', null, 'C{r}-B{r}', 'Tres ingresos separados 9-10 días en nov-dic');
  pushLRow('fechaEng', 'Inicio etapa Engorde (Día 22)', { fml: `B${R1L.fechaEnt}+21`, align: 'center' }, { fml: `C${R1L.fechaEnt}+21`, align: 'center' }, { fml: `D${R1L.fechaEnt}+21`, align: 'center' }, 'yyyy-mm-dd', null, null, 'Ventana para piloto de alimento propio si planta opera');
  pushLRow('fechaSal', 'Fecha estimada de salida al sacrificio', { fml: `${p0}!B22`, align: 'center' }, { fml: `C${R1L.fechaEnt}+$D$12-1`, align: 'center' }, { fml: '$B$5', align: 'center' }, 'yyyy-mm-dd', null, null, 'Lote 3 alineado con meta exacta 15-ene-2027');
  pushLRow('avesFin', 'Pollos vivos comercializados (tras 3% bajas esperadas)', { fml: `${p0}!B24` }, { fml: `C${R1L.avesInic}-ROUND(C${R1L.avesInic}*$F$12,0)` }, { fml: `D${R1L.avesInic}-ROUND(D${R1L.avesInic}*$F$12,0)` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Reconciliado con Estándar AV-1 para no sobrestimar ventas');
  const fConsEdad = `INDEX('4_Bitacora_Diaria_Lote1'!$F$5:$F$53,MATCH($D$12,'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/1000`;
  const fPesoEdad = `(INDEX('4_Bitacora_Diaria_Lote1'!$D$5:$D$53,MATCH($D$12,'4_Bitacora_Diaria_Lote1'!$A$5:$A$53,0))/1000)*(1+${p0}!$B$9)`;
  pushLRow('pesoVivoTot', 'Peso vivo total producido en granja (kg)', { fml: `${l2_c}!B35` }, { fml: `C${R1L.avesFin}*${fPesoEdad}` }, { fml: `D${R1L.avesFin}*${fPesoEdad}` }, '#,##0.0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Kilogramos totales en puerta de granja antes de sacrificio');

  pushLSec('2. COSTOS EN GRANJA (POLLO VIVO SIN SACRIFICIO)');
  pushLRow('precPollito', 'Precio unitario pollito de 1 día (COP/ave)', { fml: `${l2_c}!C19` }, { inp: 3200 }, { fml: 'F5' }, '#,##0', 'AVERAGE(B{r}:D{r})', 'C{r}-B{r}', '-$1.300/ave (-28,9%) con proveedor directo Bucaramanga');
  pushLRow('costPollito', 'Compra total pollitos de 1 día (COP)', { fml: `${l2_c}!D19` }, { fml: `C${R1L.avesInic}*C${R1L.precPollito}` }, { fml: `D${R1L.avesInic}*D${R1L.precPollito}` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', '800 pollos a $3.200 cuestan $140k MENOS que 600 a $4.500');

  const fBultosL = (avesRef, mortRef) =>
    `ROUNDUP(${avesRef}*0.175*(1-0.25*${mortRef})/40,0)+ROUNDUP(${avesRef}*1.029*(1-0.55*${mortRef})/40,0)+ROUNDUP(${avesRef}*(3.241+(${fConsEdad}-4.664))*(1-0.80*${mortRef})/40,0)`;
  const fCostoAlimL = (avesRef, mortRef) =>
    `ROUNDUP(${avesRef}*0.175*(1-0.25*${mortRef})/40,0)*${l2_c}!$C$5+ROUNDUP(${avesRef}*1.029*(1-0.55*${mortRef})/40,0)*${l2_c}!$C$6+ROUNDUP(${avesRef}*(3.241+(${fConsEdad}-4.664))*(1-0.80*${mortRef})/40,0)*${l2_c}!$C$7`;

  pushLRow('bultos', 'Bultos de alimento requeridos (ppto. con bajas)', { fml: `${l2_c}!B15` }, { fml: fBultosL(`C${R1L.avesInic}`, '$F$12') }, { fml: fBultosL(`D${R1L.avesInic}`, '$F$12') }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Reserva física 0% bajas en bodega = +1 a +2 bultos por lote');
  pushLRow('costAlim', 'Costo total alimento balanceado Solla (COP)', { fml: `${l2_c}!D27` }, { fml: fCostoAlimL(`C${R1L.avesInic}`, '$F$12') }, { fml: fCostoAlimL(`D${R1L.avesInic}`, '$F$12') }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Precios reales Solla ($106,5k / $96,2k / $93,4k)');
  pushLRow('costIns', 'Insumos operativos de granja (@ $1.325/ave)', { fml: `SUM(${l2_c}!D20:D23)` }, { fml: `C${R1L.avesInic}*$F$13` }, { fml: `D${R1L.avesInic}*$F$13` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Cama, gas, vacunas, energía y agua');
  pushLRow('costFij', 'Arriendo asignado (celda propia) + Colaborador ($400k)', { fml: `${l2_c}!D29` }, { fml: `${p0}!$B$14*B13+${p0}!$B$16` }, { fml: `${p0}!$B$14*D13+${p0}!$B$16` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Nota: $750k restantes del 4.º mes van en Flujo de Tesorería abajo');
  pushLRow('costVivoTot', 'COSTO TOTAL EN GRANJA — Pollo Vivo sin sacrificio (COP)', { fml: `B${R1L.costPollito}+B${R1L.costAlim}+B${R1L.costIns}+B${R1L.costFij}` }, { fml: `C${R1L.costPollito}+C${R1L.costAlim}+C${R1L.costIns}+C${R1L.costFij}` }, { fml: `D${R1L.costPollito}+D${R1L.costAlim}+D${R1L.costIns}+D${R1L.costFij}` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Piso total de crianza antes de enviar a beneficiadero', { bold: true, fill: AZUL, fillE: AZUL });
  pushLRow('costKgVivo', 'COSTO POR KILO VIVO EN GRANJA (sin sacrificio, COP/kg)', { fml: `IFERROR(B${R1L.costVivoTot}/B${R1L.pesoVivoTot},0)` }, { fml: `IFERROR(C${R1L.costVivoTot}/C${R1L.pesoVivoTot},0)` }, { fml: `IFERROR(D${R1L.costVivoTot}/D${R1L.pesoVivoTot},0)` }, '#,##0', `IFERROR(E${R1L.costVivoTot}/E${R1L.pesoVivoTot},0)`, 'C{r}-B{r}', 'Baja por escala 800 aves y pollito de $3.200', { bold: true });

  pushLSec('3. BENEFICIO, CANAL CON MENUDENCIAS Y UTILIDAD FINAL');
  pushLRow('costSac', 'Servicio de sacrificio en beneficiadero ($1.500/ave)', { fml: `${l2_c}!D31` }, { fml: `C${R1L.avesFin}*${l2_c}!$C$31` }, { fml: `D${R1L.avesFin}*${l2_c}!$C$31` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', '$1.500 por pollo procesado');
  pushLRow('costCanTot', 'INVERSIÓN TOTAL PUESTA EN CANAL (COP)', { fml: `B${R1L.costVivoTot}+B${R1L.costSac}` }, { fml: `C${R1L.costVivoTot}+C${R1L.costSac}` }, { fml: `D${R1L.costVivoTot}+D${R1L.costSac}` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Costo completo por lote puesto en canal', { bold: true });
  pushLRow('kgCanal', 'Carne vendible en canal con menudencias (82,5%, kg)', { fml: `${l2_c}!B38` }, { fml: `C${R1L.pesoVivoTot}*${p0}!$B$11*(1-${p0}!$B$13)` }, { fml: `D${R1L.pesoVivoTot}*${p0}!$B$11*(1-${p0}!$B$13)` }, '#,##0.0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Incluye molleja, corazón, hígado y pescuezo');
  pushLRow('costKgCan', 'COSTO FINAL POR KILO EN CANAL CON MENUDENCIAS (COP/kg)', { fml: `IFERROR(B${R1L.costCanTot}/B${R1L.kgCanal},0)` }, { fml: `IFERROR(C${R1L.costCanTot}/C${R1L.kgCanal},0)` }, { fml: `IFERROR(D${R1L.costCanTot}/D${R1L.kgCanal},0)` }, '#,##0', `IFERROR(E${R1L.costCanTot}/E${R1L.kgCanal},0)`, 'C{r}-B{r}', 'Punto de equilibrio real para venta en canal', { bold: true });
  pushLRow('precCan', 'Precio de venta referencia en canal (COP/kg)', { fml: `${p0}!$B$17` }, { fml: `${p0}!$B$17` }, { fml: `${p0}!$B$17` }, '#,##0', `${p0}!$B$17`, null, 'Editable en Tablero Gerencial B17');
  pushLRow('ingCan', 'INGRESO BRUTO TOTAL VENDIENDO EN CANAL (COP)', { fml: `B${R1L.kgCanal}*B${R1L.precCan}` }, { fml: `C${R1L.kgCanal}*C${R1L.precCan}` }, { fml: `D${R1L.kgCanal}*D${R1L.precCan}` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Kilos vendibles x Precio por kilo');
  pushLRow('utilCan', 'UTILIDAD NETA LIBRE VENDIENDO EN CANAL (COP)', { fml: `B${R1L.ingCan}-B${R1L.costCanTot}` }, { fml: `C${R1L.ingCan}-C${R1L.costCanTot}` }, { fml: `D${R1L.ingCan}-D${R1L.costCanTot}` }, '#,##0', 'SUM(B{r}:D{r})', 'C{r}-B{r}', 'Ganancia neta proyectada por lote y consolidada', { bold: true, fill: VERDE_FUERTE, fillE: VERDE_FUERTE });
  pushLRow('margenCan', 'Margen neto sobre ventas / ROI del lote (%)', { fml: `IFERROR(B${R1L.utilCan}/B${R1L.ingCan},0)` }, { fml: `IFERROR(C${R1L.utilCan}/C${R1L.ingCan},0)` }, { fml: `IFERROR(D${R1L.utilCan}/D${R1L.ingCan},0)` }, '0.0%', `IFERROR(E${R1L.utilCan}/E${R1L.ingCan},0)`, null, 'Porcentaje de utilidad libre sobre las ventas');

  // Sección C: Capacidad Física, Densidad Térmica Cúcuta y Equipamiento (2.200 aves simultáneas)
  rCur += 1;
  const secCRow = rCur++;
  ws1.getCell(`A${secCRow}`).value = 'SECCIÓN C: AUDITORÍA DE ESPACIO, ESTRÉS TÉRMICO EN CÚCUTA Y EQUIPOS (PICO TRES EDADES: 05-DIC A 24-DIC)';
  styleSubHeader(ws1.getRow(secCRow));
  ws1.mergeCells(`A${secCRow}:G${secCRow}`);

  const capAreaRow = rCur++;
  ws1.getRow(capAreaRow).getCell(1).value = 'Área útil disponible del galpón para las 3 secciones (m², editable)'; ws1.getRow(capAreaRow).getCell(1).border = BORDE;
  setInput(ws1.getRow(capAreaRow).getCell(2), 280, '#,##0');
  ws1.getRow(capAreaRow).getCell(3).value = 'Mínimo recomendado Cúcuta = 275-300 m² para nunca superar 26-28 kg/m²'; ws1.getRow(capAreaRow).getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; ws1.getRow(capAreaRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${capAreaRow}:G${capAreaRow}`);

  const picoAvesRow = rCur++;
  ws1.getRow(picoAvesRow).getCell(1).value = 'Pico máximo de aves simultáneas en granja (05-dic a 24-dic)'; ws1.getRow(picoAvesRow).getCell(1).font = { bold: true }; ws1.getRow(picoAvesRow).getCell(1).border = BORDE;
  setFormula(
    ws1.getRow(picoAvesRow).getCell(2),
    `IF(AND(C${R1L.fechaEnt}<=B${R1L.fechaSal},D${R1L.fechaEnt}<=B${R1L.fechaSal},D${R1L.fechaEnt}<=C${R1L.fechaSal}),B${R1L.avesInic}+C${R1L.avesInic}+D${R1L.avesInic},MAX(B${R1L.avesInic},C${R1L.avesInic},D${R1L.avesInic}))`,
    '#,##0',
    { bold: true, fill: ROJO_SUAVE }
  );
  ws1.getRow(picoAvesRow).getCell(3).value = '600 (d23-42) + 800 (d13-32) + 800 (d1-20) conviviendo 20 días con 0 días de vacío sanitario'; ws1.getRow(picoAvesRow).getCell(3).font = { italic: true, size: 9 }; ws1.getRow(picoAvesRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${picoAvesRow}:G${picoAvesRow}`);

  const picoKgRow = rCur++;
  ws1.getRow(picoKgRow).getCell(1).value = 'Biomasa viva máxima simultánea estimada el 24-dic (antes de sacar Lote 1, kg)'; ws1.getRow(picoKgRow).getCell(1).border = BORDE;
  // Al 24-dic: Lote 1 (día 42: peso B34) + Lote 2 (día 32: 1,981 kg) + Lote 3 (día 20: 0,907 kg)
  setFormula(
    ws1.getRow(picoKgRow).getCell(2),
    `B${R1L.avesFin}*${l2_c}!B34+C${R1L.avesFin}*1.981+D${R1L.avesFin}*0.907`,
    '#,##0.0',
    { bold: true, fill: ROJO_SUAVE }
  );
  ws1.getRow(picoKgRow).getCell(3).value = 'Peso total acumulado en piso (~4,0 toneladas vivas en clima cálido; ~0,8 t menos carga térmica que a 45d)'; ws1.getRow(picoKgRow).getCell(3).font = { italic: true, size: 9 }; ws1.getRow(picoKgRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${picoKgRow}:G${picoKgRow}`);

  const densKgRow = rCur++;
  ws1.getRow(densKgRow).getCell(1).value = 'Densidad pico en clima cálido Cúcuta (kg vivos / m² — límite seguro 26-28 kg/m²)'; ws1.getRow(densKgRow).getCell(1).font = { bold: true }; ws1.getRow(densKgRow).getCell(1).border = BORDE;
  setFormula(ws1.getRow(densKgRow).getCell(2), `IFERROR(B${picoKgRow}/B${capAreaRow},0)`, '0.0', { bold: true, fill: VERDE });
  setFormula(
    ws1.getRow(densKgRow).getCell(3),
    `IF(B${densKgRow}>28,"ALERTA ROJA: Excede 28 kg/m² (riesgo choque térmico Cúcuta)",IF(B${densKgRow}>25,"PRECAUCIÓN: Exige ventiladores y cortinas térmicas separadas","ÓPTIMO <25 kg/m² con divisiones herméticas"))`,
    '@',
    { bold: true, fill: ROJO_SUAVE }
  );
  ws1.mergeCells(`C${densKgRow}:G${densKgRow}`);

  const equipRow = rCur++;
  ws1.getRow(equipRow).getCell(1).value = 'Presupuesto de adecuaciones / cortinas / comederos para 2.200 aves (editable COP)'; ws1.getRow(equipRow).getCell(1).border = BORDE;
  setInput(ws1.getRow(equipRow).getCell(2), 0, '#,##0');
  ws1.getRow(equipRow).getCell(3).value = 'Se requieren ~4 criadoras, ~80 comederos tolva, ~30 bebederos campana y 3 secciones térmicamente aisladas'; ws1.getRow(equipRow).getCell(3).font = { italic: true, size: 9 }; ws1.getRow(equipRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${equipRow}:G${equipRow}`);

  // Sección D: Flujo de Caja Semanal Real (Nov 2026 – Feb 2027) y Pico Real de Efectivo
  rCur += 1;
  const secDRow = rCur++;
  ws1.getCell(`A${secDRow}`).value = 'SECCIÓN D: FLUJO DE CAJA SEMANAL REAL DEL CUATRIMESTRE (PICO DE EFECTIVO ANTES DEL PRIMER COBRO)';
  styleSubHeader(ws1.getRow(secDRow));
  ws1.mergeCells(`A${secDRow}:G${secDRow}`);

  const h1d = ws1.getRow(rCur++);
  h1d.values = [
    'Semana / Hito de Tesorería',
    'Ingresos (Ventas)',
    'Pollitos + Insumos',
    'Alimento Requerido',
    'Arriendo (4m) + Benef. + Colab',
    'Flujo Neto Semana',
    'Saldo Acumulado de Caja (COP)'
  ];
  styleHeader(h1d);

  // Alimento repartido por etapas reales (~4% inic Sem1-2, ~21% preinic Sem3-4, ~75% engorde Sem5-7) y 4 meses reales de arriendo ($750k x 4 = $3,0M)
  const fStart = rCur;
  const weeks = [
    ['Sem 1 (30-oct a 06-nov) · Arriendo Mes 1', '0', '0', '0', `${p0}!$B$14`],
    ['Sem 2 (13-nov) · Ingreso Lote 1 (600 aves @ $4.500)', '0', `B${R1L.costPollito}+0.7*B${R1L.costIns}`, `0.05*B${R1L.costAlim}`, `B${equipRow}`],
    ['Sem 3 (23-nov) · Ingreso Lote 2 (800 aves @ $3.200)', '0', `C${R1L.costPollito}+0.7*C${R1L.costIns}`, `0.15*B${R1L.costAlim}+0.05*C${R1L.costAlim}`, '0'],
    ['Sem 4 (30-nov a 05-dic) · Arriendo Mes 2 + Ingreso Lote 3 (800)', '0', `D${R1L.costPollito}+0.7*D${R1L.costIns}+0.15*B${R1L.costIns}`, `0.25*B${R1L.costAlim}+0.15*C${R1L.costAlim}+0.05*D${R1L.costAlim}`, `${p0}!$B$14`],
    ['Sem 5 (06-12 dic) · Engorde Lote 1 + Levante Lotes 2 y 3', '0', `0.15*C${R1L.costIns}+0.15*D${R1L.costIns}`, `0.25*B${R1L.costAlim}+0.20*C${R1L.costAlim}+0.15*D${R1L.costAlim}`, '0'],
    ['Sem 6 (13-19 dic) · Pico consumo paralelo 3 lotes', '0', `0.15*B${R1L.costIns}+0.15*C${R1L.costIns}`, `0.20*B${R1L.costAlim}+0.25*C${R1L.costAlim}+0.20*D${R1L.costAlim}`, '0'],
    ['Sem 7 (20-23 dic) · Víspera cierre Lote 1 (PICO DE CAJA)', '0', `0.15*D${R1L.costIns}`, `0.10*B${R1L.costAlim}+0.20*C${R1L.costAlim}+0.25*D${R1L.costAlim}`, '0'],
    ['Sem 8 (24-31 dic) · COBRO LOTE 1 (24-dic) + Arriendo Mes 3', `B${R1L.ingCan}`, '0', `0.15*C${R1L.costAlim}+0.20*D${R1L.costAlim}`, `${p0}!$B$14+B${R1L.costSac}+${p0}!$B$16`],
    ['Sem 9 (01-07 ene) · COBRO LOTE 2 (03-ene) + Liquidación Lote 2', `C${R1L.ingCan}`, '0', `0.15*D${R1L.costAlim}`, `C${R1L.costSac}+${p0}!$B$16`],
    ['Sem 10 (08-15 ene) · COBRO LOTE 3 (15-ene) + Liquidación Lote 3', `D${R1L.ingCan}`, '0', '0', `D${R1L.costSac}+${p0}!$B$16`],
    ['Sem 11 (30-ene) · Pago Mes 4 Contrato Arriendo ($750k cierre 4m)', '0', '0', '0', `${p0}!$B$14`]
  ];
  weeks.forEach(([lbl, ing, fPol, fAlim, fFij], idx) => {
    const r = fStart + idx;
    const row = ws1.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (idx === 6) row.getCell(1).font = { bold: true };
    setFormula(row.getCell(2), ing, '#,##0', { fill: idx >= 7 && idx <= 9 ? VERDE : undefined });
    setFormula(row.getCell(3), fPol, '#,##0');
    setFormula(row.getCell(4), fAlim, '#,##0');
    setFormula(row.getCell(5), fFij, '#,##0');
    setFormula(row.getCell(6), `B${r}-(C${r}+D${r}+E${r})`, '+#,##0;-#,##0;0', { bold: true });
    const fAcum = idx === 0 ? `F${r}` : `G${r - 1}+F${r}`;
    setFormula(row.getCell(7), fAcum, '+#,##0;-#,##0;0', { bold: idx === 6 || idx === weeks.length - 1, fill: idx === 6 ? ROJO_SUAVE : (idx === weeks.length - 1 ? VERDE_FUERTE : GRIS) });
  });
  const fEnd = fStart + weeks.length - 1;

  const picoCashRow = fEnd + 1;
  ws1.getRow(picoCashRow).getCell(1).value = 'CAPITAL DE TRABAJO PICO REQUERIDO ANTES DEL PRIMER COBRO (mínimo caja)';
  ws1.getRow(picoCashRow).getCell(1).font = { bold: true }; ws1.getRow(picoCashRow).getCell(1).border = BORDE;
  setFormula(ws1.getRow(picoCashRow).getCell(2), `ABS(MIN(G${fStart}:G${fEnd}))`, '#,##0', { bold: true, fill: ROJO_SUAVE });
  ws1.getRow(picoCashRow).getCell(3).value = 'Dinero líquido máximo que requiere la operación antes de vender Lote 1 el 24-dic (cubre 100% contrato arriendo 4 meses = $3,0M)';
  ws1.getRow(picoCashRow).getCell(3).font = { italic: true, size: 9, color: { argb: 'FF9C0006' } }; ws1.getRow(picoCashRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${picoCashRow}:G${picoCashRow}`);

  const cajaFinRow = picoCashRow + 1;
  ws1.getRow(cajaFinRow).getCell(1).value = 'SALDO NETO FINAL EN CAJA TRAS PAGAR LOS 4 MESES DE ARRIENDO ($3.000.000)';
  ws1.getRow(cajaFinRow).getCell(1).font = { bold: true }; ws1.getRow(cajaFinRow).getCell(1).border = BORDE;
  setFormula(ws1.getRow(cajaFinRow).getCell(2), `G${fEnd}`, '#,##0', { bold: true, fill: VERDE_FUERTE });
  ws1.getRow(cajaFinRow).getCell(3).value = 'Igual a Utilidad Consolidada de los 3 Lotes menos los $750k del mes 4 sin cobertura de lote';
  ws1.getRow(cajaFinRow).getCell(3).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; ws1.getRow(cajaFinRow).getCell(3).border = BORDE;
  ws1.mergeCells(`C${cajaFinRow}:G${cajaFinRow}`);
  protectSheet(ws1);

  // =========================================================================
  // AHORA SÍ COMPLETAMOS BLOQUE C DE HOJA 0 (0_Tablero_Gerencial) CON ENLACES EXACTOS
  // =========================================================================
  const s1 = "'1_Plan_3_Lotes_y_Capacidad'";
  const resumen0 = [
    [29, '1. Pollos vivos comercializados (descontando 3% bajas)', `${s1}!B${R1L.avesFin}`, `${s1}!C${R1L.avesFin}`, `${s1}!D${R1L.avesFin}`, `${s1}!E${R1L.avesFin}`, '#,##0', false, 'Aves vivas que llegan a beneficio'],
    [30, '2. Peso vivo total producido en granja (kg)', `${s1}!B${R1L.pesoVivoTot}`, `${s1}!C${R1L.pesoVivoTot}`, `${s1}!D${R1L.pesoVivoTot}`, `${s1}!E${R1L.pesoVivoTot}`, '#,##0.0', false, '~3,00 kg por ave a los 42 días (6 semanas)'],
    [31, '3. COSTO TOTAL DE CRIANZA EN GRANJA (Pollo vivo, COP)', `${s1}!B${R1L.costVivoTot}`, `${s1}!C${R1L.costVivoTot}`, `${s1}!D${R1L.costVivoTot}`, `${s1}!E${R1L.costVivoTot}`, '#,##0', true, 'Pollitos + Alimento + Insumos + Arriendo + Colab'],
    [32, '   -> Costo por kilo VIVO en granja (sin sacrificio, COP/kg)', `${s1}!B${R1L.costKgVivo}`, `${s1}!C${R1L.costKgVivo}`, `${s1}!D${R1L.costKgVivo}`, `${s1}!E${R1L.costKgVivo}`, '#,##0', false, 'Baja -$626/kg ($6.303 -> $5.677/kg) por escala 800 aves + pollito $3.200'],
    [33, '4. Servicio de sacrificio en beneficiadero ($1.500/ave)', `${s1}!B${R1L.costSac}`, `${s1}!C${R1L.costSac}`, `${s1}!D${R1L.costSac}`, `${s1}!E${R1L.costSac}`, '#,##0', false, 'Excluido automáticamente si se vende vivo en pie'],
    [34, '5. INVERSIÓN TOTAL PUESTA EN CANAL (COP)', `${s1}!B${R1L.costCanTot}`, `${s1}!C${R1L.costCanTot}`, `${s1}!D${R1L.costCanTot}`, `${s1}!E${R1L.costCanTot}`, '#,##0', true, 'Costo crianza + Servicio de sacrificio'],
    [35, '6. Carne vendible en canal con menudencias (82,5%, kg)', `${s1}!B${R1L.kgCanal}`, `${s1}!C${R1L.kgCanal}`, `${s1}!D${R1L.kgCanal}`, `${s1}!E${R1L.kgCanal}`, '#,##0.0', false, 'Incluye molleja, corazón, hígado y pescuezo (~2,47 kg/ave a 42d)'],
    [36, '   -> COSTO FINAL POR KILO EN CANAL (Punto equilibrio, COP/kg)', `${s1}!B${R1L.costKgCan}`, `${s1}!C${R1L.costKgCan}`, `${s1}!D${R1L.costKgCan}`, `${s1}!E${R1L.costKgCan}`, '#,##0', true, 'Baja -$759/kg: Lote 1 $8.247/kg -> Lotes 2 y 3 $7.488/kg (consol. $7.695/kg)'],
    [37, '7. Precio de venta referencia en canal (COP/kg)', `${s1}!B${R1L.precCan}`, `${s1}!C${R1L.precCan}`, `${s1}!D${R1L.precCan}`, `${s1}!E${R1L.precCan}`, '#,##0', false, 'Editable en celda B17'],
    [38, '8. INGRESO BRUTO ESTIMADO EN CANAL (COP)', `${s1}!B${R1L.ingCan}`, `${s1}!C${R1L.ingCan}`, `${s1}!D${R1L.ingCan}`, `${s1}!E${R1L.ingCan}`, '#,##0', false, 'Kilos vendibles x Precio venta'],
    [39, '9. UTILIDAD NETA LIBRE VENDIENDO EN CANAL (COP)', `${s1}!B${R1L.utilCan}`, `${s1}!C${R1L.utilCan}`, `${s1}!D${R1L.utilCan}`, `${s1}!E${R1L.utilCan}`, '#,##0', true, 'Descuenta alimento, pollito, sacrificio y fijos'],
    [40, '   -> Margen neto sobre las ventas (%)', `${s1}!B${R1L.margenCan}`, `${s1}!C${R1L.margenCan}`, `${s1}!D${R1L.margenCan}`, `${s1}!E${R1L.margenCan}`, '0.0%', false, 'Porcentaje libre por cada $100 vendidos'],
    [41, '10. Capital de Trabajo Pico Requerido antes del 24-dic (COP)', `B34`, 'N/A', 'N/A', `${s1}!B${picoCashRow}`, '#,##0', true, 'Máxima caja requerida por traslape simultáneo de los 3 lotes'],
    [42, '11. Saldo neto final tras pagar los 4 meses completos de arriendo ($3M)', 'N/A', 'N/A', 'N/A', `${s1}!B${cajaFinRow}`, '#,##0', true, 'Descuenta $750.000 del 4.º mes si no hay Lote 4 antes de fin de feb']
  ];

  for (const [r, lbl, fB, fC, fD, fE, fmt, isHL, nota] of resumen0) {
    const row = ws0.getRow(r);
    row.getCell(1).value = lbl; row.getCell(1).border = BORDE;
    if (isHL) row.getCell(1).font = { bold: true };
    const fill = r === 39 || r === 42 ? VERDE_FUERTE : (r === 41 ? ROJO_SUAVE : (isHL ? VERDE : undefined));
    const putCell = (ci, f) => {
      if (f === 'N/A') {
        row.getCell(ci).value = '—'; row.getCell(ci).alignment = { horizontal: 'center' }; row.getCell(ci).border = BORDE;
      } else {
        setFormula(row.getCell(ci), f, fmt, { bold: isHL, fill: ci === 5 && isHL && r !== 41 && r !== 39 ? AZUL : fill });
      }
    };
    putCell(2, fB); putCell(3, fC); putCell(4, fD); putCell(5, fE);
    row.getCell(6).value = nota; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
  }

  // Bloque D en Portada: Sensibilidad de Precio Canal en Consolidado 3 Lotes (Filas 44..49)
  ws0.getCell('A44').value = 'SENSIBILIDAD RÁPIDA CONSOLIDADO 3 LOTES (SI VARÍA EL PRECIO DE VENTA EN CÚCUTA)';
  styleSubHeader(ws0.getRow(44));
  ws0.mergeCells('A44:F44');

  const h0d = ws0.getRow(45);
  h0d.values = ['Precio Venta Canal Supuesto', 'Escenario de Mercado', 'Ingreso Bruto 3 Lotes', 'Utilidad Neta 3 Lotes', 'Caja Final Post 4m Arriendo', 'Lectura Ejecutiva'];
  styleHeader(h0d);

  const sensOp = [
    [46, 9500, 'Piso de indiferencia vs. vender vivo', 'Casi igual a vender en puerta de granja ($7.400/kg)'],
    [47, 10500, 'Mayorista conservador (baja estacional)', 'Aún deja utilidad saludable tras cubrir todo el arriendo'],
    [48, 11500, 'ESCENARIO BASE ACTUAL ($11.500/kg)', 'Meta financiera principal de la cohorte'],
    [49, 12500, 'Venta directa / asaderos / pico Navidad', 'Alta captura de valor con menudencias incluidas']
  ];
  for (const [r, pr, esc, lect] of sensOp) {
    const row = ws0.getRow(r);
    row.getCell(1).value = pr; row.getCell(1).numFmt = '"$"#,##0"/kg"'; row.getCell(1).font = { bold: true }; row.getCell(1).border = BORDE;
    row.getCell(2).value = esc; row.getCell(2).font = { italic: true, size: 9 }; row.getCell(2).border = BORDE;
    setFormula(row.getCell(3), `E35*A${r}`, '#,##0');
    setFormula(row.getCell(4), `C${r}-E34`, '#,##0', { bold: r === 48, fill: r === 48 ? VERDE_FUERTE : (r === 46 ? ROJO_SUAVE : undefined) });
    setFormula(row.getCell(5), `D${r}-750000`, '#,##0', { fill: GRIS });
    row.getCell(6).value = lect; row.getCell(6).font = { italic: true, size: 9, color: { argb: 'FF595959' } }; row.getCell(6).border = BORDE;
  }
  protectSheet(ws0);

  const outPath = path.join(__dirname, 'AV2_Operacion_Granja_Lotes_1_a_3.xlsx');
  return wb.xlsx.writeFile(outPath).then(() => outPath);
}

if (require.main === module) {
  buildControlOperacion()
    .then((p) => {
      console.log('OK ->', p);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { buildControlOperacion };
