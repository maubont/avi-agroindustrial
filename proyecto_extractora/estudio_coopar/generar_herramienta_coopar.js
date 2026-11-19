// Generador v3.0 de la Herramienta Excel para el Estudio Piloto en Planta Coopar (Ing. Billy Ramírez)
// Autor técnico: Ing. Mauricio Bonilla
// Mejoras v3.0 (Auditoría de 5 Expertos):
// 1. Trazabilidad completa y ajuste de corriente real de lodo en Coopar (Centrífuga sedimentada 85% H o Tricanter 76% H).
// 2. Sustrato basal constante (Torta + Lodo = 1.500 g) e insumos protegidos bajo sobres codificados (M-01, M-02, Complejo Buffer N-01).
// 3. Control gravimétrico no destructivo por bandeja (Peso bruto - Tara) y alerta térmica para clima de Tibú (<40 °C).
// 4. Separación de columnas de Captura Real (en blanco, sin errores #¡DIV/0!) y Columnas de Referencia con Balance de Masa de Nitrógeno estricto.
// 5. Hoja 4 dedicada al Escalado Piloto de 30 kg (6 canastillas x 5 kg, evaluación térmica Centro vs. Borde).
// (La información confidencial de proveedores, formulación abierta de sobres y costos se trasladó al Anexo Confidencial interno).
'use strict';
const path = require('path');
const ExcelJS = require('../../modelo/node_modules/exceljs');

const wb = new ExcelJS.Workbook();
wb.creator = 'Ing. Mauricio Bonilla - Estudio FES Coopar v3.0';
wb.calcProperties.fullCalcOnLoad = true;

const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const AZUL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const VERDE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const NARANJA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };
const GRIS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const BORDE = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
};

const head = (row) => row.eachCell((c) => {
  c.font = { bold: true };
  c.fill = AZUL;
  c.alignment = { wrapText: true, vertical: 'middle' };
  c.border = BORDE;
});
const decorate = (ws) => ws.eachRow((r) => r.eachCell((c) => { if (!c.border) c.border = BORDE; }));

// ============================================================================
// HOJA 1: CALCULADORA DE MEZCLA Y TRAZABILIDAD (FASE A: ESCALA LAB 1,5 kg)
// ============================================================================
{
  const ws = wb.addWorksheet('1_Calculadora_Mezcla', { views: [{ state: 'frozen', xSplit: 1, ySplit: 8 }] });
  ws.getColumn(1).width = 58;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 48;

  ws.getCell('A1').value = 'PROTOCOLO FES COOPAR - HOJA 1: TRAZABILIDAD Y DOSIFICACIÓN DE LABORATORIO (v3.0)';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Dirección Planta: Ing. Billy Ramírez (Coopar Ltda.) | Dirección Estudio: Ing. Mauricio Bonilla | Celdas AMARILLAS = Entrada de datos';
  ws.getCell('A2').fill = AMARILLO;

  // Bloque 0: Trazabilidad del Lote
  ws.getRow(4).values = ['0. DATOS DE TRAZABILIDAD DEL MONTAJE', 'Registro / Valor', 'Bandeja T0', 'Bandeja T1', 'Bandeja T2 / Observaciones'];
  head(ws.getRow(4));
  ws.getRow(5).values = ['Fecha y Hora de inicio del montaje (Hora 0)', 'Pendiente', 'Blanco Físico', 'Bioconversión M-01/M-02', 'Síntesis Proteica + N-01'];
  ws.getRow(6).values = ['Punto de toma del Lodo en Coopar y Temp. de salida (°C)', 'Salida deslodadora sedimentada (88 °C)', 'Tara vacía (g):', 'Tara vacía (g):', 'Tara vacía (g):'];
  ws.getRow(7).values = ['Peso Tara de cada bandeja vacía seca [gramos]', 0, 250.0, 250.0, 250.0];
  ws.getRow(5).getCell(2).fill = AMARILLO;
  ws.getRow(6).getCell(2).fill = AMARILLO;
  for (let c = 3; c <= 5; c++) {
    ws.getRow(7).getCell(c).fill = AMARILLO;
    ws.getRow(7).getCell(c).numFmt = '0.0';
  }

  // Bloque 1: Caracterización Previa en Lab Coopar
  ws.getRow(9).values = ['1. CARACTERIZACIÓN EN LABORATORIO COOPAR (HORA 0)', 'Valor Medido', 'Unidad', 'Rango Típico', 'Método en Laboratorio Coopar'];
  head(ws.getRow(9));

  const inRow = (r, etq, val, uni, rango, nota, fmt, calc) => {
    const row = ws.getRow(r);
    row.values = [etq, val, uni, rango, nota];
    row.getCell(2).fill = calc ? GRIS : AMARILLO;
    row.getCell(2).numFmt = fmt;
  };
  inRow(10, 'Humedad de la Torta de Palmiste molida (<2,5 mm)', 0.10, '%', '8,0% a 11,0%', 'Estufa Lab Coopar a 103 °C (insumo llevado por Ing. Mauricio Bonilla)', '0.0%');
  inRow(11, 'Humedad (Agua) del Lodo espeso de Clarificación Coopar', 0.85, '%', '75% (Tricanter) a 86% (Sedim.)', 'Sedimentar lodo de deslodadora 30 min en caliente y decantar agua libre', '0.0%');
  inRow(12, 'Aceite residual en el Lodo espeso (base húmeda)', 0.018, '%', '1,2% a 2,5%', 'Soxhlet o Centrífuga de lodos Lab Coopar', '0.0%');
  inRow(13, 'Sólidos No Aceitosos (SNA / VML) en el Lodo (calculado)', { formula: '1-B11-B12' }, '%', '12,0% a 22,0%', 'Calculado automáticamente: 100% - %Agua - %Aceite', '0.0%', true);
  inRow(14, 'pH inicial del Lodo enfriado (<34 °C)', 5.0, 'pH', '4,7 a 5,3', 'Potenciómetro Lab Coopar (si es <4,6 ajustar con pizca de CaCO3)', '0.00');
  inRow(15, 'Masa basal húmeda por bandeja (Torta + Lodo)', 1500, 'gramos', '1.500 g', 'Base constante para los 3 tratamientos (cama de 3,0 a 3,5 cm)', '#,##0');
  inRow(16, 'Humedad inicial objetivo de la mezcla basal', 0.53, '%', '52,0% a 55,0%', 'Óptimo de actividad de agua (aw > 0,95) para colonización fúngica', '0.0%');

  // Bloque 2: Dosificación Exacta por Bandeja
  ws.getRow(18).values = ['2. DOSIFICACIÓN EXACTA POR BANDEJA (EN GRAMOS)', 'T0 (Blanco Físico)', 'T1 (Solo Inóculos)', 'T2 (Inóculos + N-01)', 'Instrucción operativa en Hora 0'];
  head(ws.getRow(18));

  ws.getRow(19).values = [
    'Torta de Palmiste fresca molida (<2,5 mm) [gramos]',
    { formula: 'B15*(1-(B16-B10)/(B11-B10))' },
    { formula: 'B15*(1-(B16-B10)/(B11-B10))' },
    { formula: 'B15*(1-(B16-B10)/(B11-B10))' },
    'Hora 0: Pesar igual cantidad de torta en las 3 bandejas'
  ];
  ws.getRow(20).values = [
    'Lodo espeso de Clarificación Coopar enfriado a <34 °C [gramos]',
    { formula: 'B15*(B16-B10)/(B11-B10)' },
    { formula: 'B15*(B16-B10)/(B11-B10)' },
    { formula: 'B15*(B16-B10)/(B11-B10)' },
    'Hora 0: Tomar tras ciclón desarenador, sedimentar 30 min y enfriar a <34 °C'
  ];
  ws.getRow(21).values = [
    'Sobre N-01: Complejo Mineral N-P-Buffer (23,9% N, 3,0% MS) [gramos]',
    0,
    0,
    { formula: 'B15*(1-B16)*0.030' },
    'Hora 0 (Solo T2): Disolver el Sobre N-01 en el lodo tibio antes de mezclar'
  ];
  ws.getRow(22).values = [
    'Sobre M-01: Consorcio Fúngico Primario (1,2% MS basal) [gramos]',
    0,
    { formula: 'B15*(1-B16)*0.012' },
    { formula: 'B15*(1-B16)*0.012' },
    'Hora 0 (T1 y T2): Incorporar Sobre M-01 cuando la mezcla esté a <= 34 °C'
  ];
  ws.getRow(23).values = [
    'Sobre M-02: Co-inóculo Levadura Activa (0,5% MS basal) [gramos]',
    0,
    { formula: 'B15*(1-B16)*0.005' },
    { formula: 'B15*(1-B16)*0.005' },
    'Aspersión superficial / co-inoculación sin destruir el micelio'
  ];
  ws.getRow(24).values = [
    'Agua limpia de hidratación de inóculos y sales [gramos / mL]',
    0,
    { formula: 'ROUND((C22+C23)*1.10,1)' },
    { formula: 'ROUND((D21+D22+D23)*1.10,1)' },
    'Compensa los sólidos secos de los sobres para mantener ~53% de humedad'
  ];
  ws.getRow(25).values = [
    'PESO NETO HÚMEDO INICIAL EN BANDEJA [gramos]',
    { formula: 'SUM(B19:B24)' },
    { formula: 'SUM(C19:C24)' },
    { formula: 'SUM(D19:D24)' },
    'Extender sin compactar (espesor de cama: 3,0 a 3,5 cm)'
  ];
  ws.getRow(26).values = [
    'Materia Seca Total Inicial en la bandeja [gramos MS]',
    { formula: 'B19*(1-$B$10)+B20*(1-$B$11)' },
    { formula: 'C19*(1-$B$10)+C20*(1-$B$11)+(C22+C23)*0.92' },
    { formula: 'D19*(1-$B$10)+D20*(1-$B$11)+D21+(D22+D23)*0.92' },
    'Incluye MS de Torta + SNA y Aceite del Lodo + MS de sobres (92%)'
  ];
  ws.getRow(27).values = [
    'Proteína Cruda Equivalente aportada por Sobre N-01 (g N x 6,25) [gramos]',
    0,
    0,
    { formula: 'D21*0.2391*6.25' },
    'Masa exacta de Proteína Equivalente inorgánica que entra a la bandeja T2'
  ];
  ws.getRow(28).values = [
    'Incremento máximo teórico de PC por Sobre N-01 (% sobre MS inicial)',
    0,
    0,
    { formula: 'D27/D26' },
    'Sirve para auditar el Balance de Nitrógeno en la Hoja 3'
  ];

  for (let r = 19; r <= 27; r++) {
    for (let c = 2; c <= 4; c++) ws.getRow(r).getCell(c).numFmt = '0.0';
  }
  for (let c = 2; c <= 4; c++) ws.getRow(28).getCell(c).numFmt = '0.0%';
  for (let c = 1; c <= 4; c++) {
    ws.getRow(25).getCell(c).font = { bold: true };
    ws.getRow(25).getCell(c).fill = VERDE;
    ws.getRow(26).getCell(c).font = { bold: true };
  }
  decorate(ws);
}

// ============================================================================
// HOJA 2: BITÁCORA DE CONTROL GRAVIMÉTRICO Y TÉRMICO (NO DESTRUCTIVA)
// ============================================================================
{
  const ws = wb.addWorksheet('2_Bitacora_Control', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 14;
  ws.getColumn(9).width = 18;
  ws.getColumn(10).width = 44;

  ws.getCell('A1').value = 'BITÁCORA DE INCUBACIÓN Y CONTROL TÉRMICO / GRAVIMÉTRICO (FASE A - FUERA DEL LAB DE ACEITES)';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'ATENCIÓN CLIMA TIBÚ (30-34 °C): Usar agua a temp. ambiente (NO caliente) para humedad y entreabrir tapa 2 cm si Temp. Cama > 37 °C.';
  ws.getCell('A2').fill = NARANJA;

  ws.getRow(4).values = [
    'Hora Control',
    'Temp. Ambiente (°C)',
    'Temp. Cama T1 (°C)',
    'Temp. Cama T2 (°C)',
    'Peso Bruto Bandeja T1 (g)',
    'Peso Bruto Bandeja T2 (g)',
    'pH T1 (Hora 0 y Fin)',
    'pH T2 (Hora 0 y Fin)',
    'Estado Térmico (<40 °C)',
    'Guía de Inspección Visual / Aroma (Rango Esperado)'
  ];
  head(ws.getRow(4));
  ws.getRow(4).height = 32;

  const guia = [
    [0, 'Montaje inicial (T <= 34 °C). pH inicial meta: 4,9 a 5,3. Vaso con agua a temp. ambiente.'],
    [12, 'Fase de latencia/germinación (T cama esperada: 33-35 °C). Verificar ausencia de condensación goteando.'],
    [24, 'Fase exponencial (T cama: 36-39 °C). Micelio blanco visible. Entreabrir tapa 2 cm para evacuar calor y CO2.'],
    [36, 'Pico metabólico (T cama: 37-39,5 °C). Si supera 39 °C, ventilar 10 min sin romper el tejido micelial.'],
    [48, 'Consolidación de torta micelial blanca (T cama: 35-38 °C). Aroma agradable a pan/champiñón fresco.'],
    [60, 'Maduración enzimática (T cama: 34-36 °C). Cosechar aquí si asoman cabezas grises de esporulación.'],
    [72, 'Cosecha final (Hora 60-72). Medir Peso Bruto final y pH final (meta 5,2-6,2) y pasar a secado a 60-65 °C.']
  ];

  guia.forEach((g, idx) => {
    const rNum = 5 + idx;
    const r = ws.getRow(rNum);
    r.getCell(1).value = g[0];
    r.getCell(1).alignment = { horizontal: 'center' };
    for (let c = 2; c <= 8; c++) {
      r.getCell(c).value = null; // En blanco para captura real sin sesgo
      r.getCell(c).fill = AMARILLO;
    }
    for (let c = 2; c <= 4; c++) r.getCell(c).numFmt = '0.0';
    for (let c = 5; c <= 6; c++) r.getCell(c).numFmt = '#,##0.0';
    for (let c = 7; c <= 8; c++) r.getCell(c).numFmt = '0.00';
    r.getCell(9).value = {
      formula: `IF(COUNT(C${rNum}:D${rNum})=0,"Pendiente",IF(MAX(C${rNum}:D${rNum})>40,"ALERTA: VENTILAR (>40°C)","OK (<40°C)"))`
    };
    r.getCell(9).fill = GRIS;
    r.getCell(10).value = g[1];
  });
  decorate(ws);
}

// ============================================================================
// HOJA 3: RESULTADOS, AUDITORÍA DE CONSERVACIÓN DE NITRÓGENO Y VALORACIÓN
// ============================================================================
{
  const ws = wb.addWorksheet('3_Resultados_y_Balance_N', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
  ws.getColumn(1).width = 56;
  ws.getColumn(2).width = 15;
  ws.getColumn(3).width = 15;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 15;
  ws.getColumn(6).width = 15;
  ws.getColumn(7).width = 15;
  ws.getColumn(8).width = 44;

  ws.getCell('A1').value = 'RESULTADOS BROMATOLÓGICOS, AUDITORÍA DE CONSERVACIÓN DE NITRÓGENO Y VALORACIÓN (v3.0)';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Columnas B-D (AMARILLAS) = Captura de datos reales del ensayo. Columnas E-G (GRISES) = Simulación de Referencia con Balance de Masa Estricto.';
  ws.getCell('A2').fill = AMARILLO;

  ws.getRow(4).values = [
    '1. BALANCE DE MASA Y SECADO (Base Comercial ~10% Humedad)',
    'T0 REAL', 'T1 REAL', 'T2 REAL',
    'T0 Ref. Esp.', 'T1 Ref. Esp.', 'T2 Ref. Esp.',
    'Método / Criterio de Auditoría Física'
  ];
  head(ws.getRow(4));
  ws.getRow(4).height = 28;

  const setRow = (r, label, vals, fmt, amReal, bold, green, note) => {
    const row = ws.getRow(r);
    row.getCell(1).value = label;
    vals.forEach((v, i) => {
      const c = row.getCell(2 + i);
      c.value = (typeof v === 'string' && v.startsWith('=')) ? { formula: v.slice(1) } : v;
      if (fmt) c.numFmt = fmt;
      if (i < 3) {
        if (amReal) c.fill = AMARILLO;
        else if (green) c.fill = VERDE;
      } else {
        c.fill = GRIS;
      }
    });
    row.getCell(8).value = note || '';
    if (bold) for (let i = 1; i <= 7; i++) row.getCell(i).font = { bold: true };
  };

  setRow(5, 'Materia Seca Inicial en bandeja [gramos MS]', [
    "='1_Calculadora_Mezcla'!B26", "='1_Calculadora_Mezcla'!C26", "='1_Calculadora_Mezcla'!D26",
    "='1_Calculadora_Mezcla'!B26", "='1_Calculadora_Mezcla'!C26", "='1_Calculadora_Mezcla'!D26"
  ], '0.0', false, false, false, 'Viene automáticamente de la Hoja 1');

  setRow(6, 'Peso neto húmedo al finalizar fermentación antes de secado [gramos]', [
    null, null, null, 1500.0, 1340.0, 1355.0
  ], '0.0', true, false, false, 'Peso Bruto final en Hoja 2 menos Tara de bandeja vacía');

  setRow(7, 'Peso del producto seco final salido de estufa (60-65 °C) [gramos]', [
    null, null, null, 780.0, 720.0, 730.0
  ], '0.0', true, true, false, 'Pesar al enfriar tras secado hasta ~10% de humedad');

  setRow(8, 'Humedad final medida en el producto seco [% tal cual]', [
    null, null, null, 0.10, 0.10, 0.10
  ], '0.0%', true, false, false, 'Medido en Lab Coopar (estufa 103 °C sobre 5 g de muestra)');

  setRow(9, 'Materia Seca Final recuperada [gramos MS]', [
    '=IF(COUNT(B7:B8)<2,"",B7*(1-B8))',
    '=IF(COUNT(C7:C8)<2,"",C7*(1-C8))',
    '=IF(COUNT(D7:D8)<2,"",D7*(1-D8))',
    '=E7*(1-E8)', '=F7*(1-F8)', '=G7*(1-G8)'
  ], '0.0', false, true, false, 'Gramos reales de sólidos secos recuperados tras fermentar');

  setRow(10, 'Recuperación de Materia Seca [%]', [
    '=IF(B9="","",B9/B5)', '=IF(C9="","",C9/C5)', '=IF(D9="","",D9/D5)',
    '=E9/E5', '=F9/F5', '=G9/G5'
  ], '0.0%', false, true, false, 'Esperado: 88% a 92% en T1/T2 (el 8-12% se respira como CO2)');

  setRow(11, 'Rendimiento comercial estandarizado al 10% H sobre Torta inicial [%]', [
    '=IF(B9="","",(B9/0.90)/\'1_Calculadora_Mezcla\'!B19)',
    '=IF(C9="","",(C9/0.90)/\'1_Calculadora_Mezcla\'!C19)',
    '=IF(D9="","",(D9/0.90)/\'1_Calculadora_Mezcla\'!D19)',
    '=(E9/0.90)/\'1_Calculadora_Mezcla\'!B19',
    '=(F9/0.90)/\'1_Calculadora_Mezcla\'!C19',
    '=(G9/0.90)/\'1_Calculadora_Mezcla\'!D19'
  ], '0.0%', false, true, true, 'Kilos de ingrediente al 10% H obtenidos por cada 100 kg de Torta');

  ws.getRow(13).values = [
    '2. COMPOSICIÓN BROMATOLÓGICA (Reportada en Base Comercial al ~10% Humedad)',
    'T0 REAL', 'T1 REAL', 'T2 REAL',
    'T0 Ref. Esp.', 'T1 Ref. Esp.', 'T2 Ref. Esp.',
    'Laboratorio Responsable y Método Analítico'
  ];
  head(ws.getRow(13));

  setRow(14, 'Proteína Cruda Total Kjeldahl - PC (% tal cual) [N total x 6,25]', [
    null, null, null, 0.162, 0.179, 0.216
  ], '0.0%', true, true, false, 'Lab Externo (AOAC 984.13). En Base Seca equivale a: 18,0% / 19,9% / 24,0%');

  setRow(15, 'Proteína Verdadera TCA o No Amoniacal (% tal cual) [Aminoácidos + Quitina]', [
    null, null, null, 0.157, 0.173, 0.204
  ], '0.0%', true, true, false, 'Lab Externo: Precipitación TCA o (N_Kjeldahl - N_Amoniacal) x 6,25');

  setRow(16, 'Grasa Cruda / Extracto Etéreo - EE (% tal cual)', [
    null, null, null, 0.084, 0.078, 0.076
  ], '0.0%', true, false, false, 'LAB COOPAR (Soxhlet). Ligera reducción por consumo oxidativo fúngico');

  setRow(17, 'Fibra Cruda - FC (% tal cual) [Solicitar además FDN en Lab Externo]', [
    null, null, null, 0.175, 0.128, 0.120
  ], '0.0%', true, true, false, 'Lab Externo (AOAC 962.09). Meta: reducción relativa del 22% al 32%');

  setRow(18, 'Cenizas / Minerales Totales (% tal cual)', [
    null, null, null, 0.048, 0.053, 0.064
  ], '0.0%', true, false, false, 'LAB COOPAR (Mufla 550 °C) o Lab Externo');

  setRow(19, 'Extracto Libre de Nitrógeno - ELN (% tal cual, calculado)', [
    '=IF(COUNT(B8,B14,B16:B18)<5,"",1-B8-B14-B16-B17-B18)',
    '=IF(COUNT(C8,C14,C16:C18)<5,"",1-C8-C14-C16-C17-C18)',
    '=IF(COUNT(D8,D14,D16:D18)<5,"",1-D8-D14-D16-D17-D18)',
    '=1-E8-E14-E16-E17-E18',
    '=1-F8-F14-F16-F17-F18',
    '=1-G8-G14-G16-G17-G18'
  ], '0.0%', false, false, false, 'Todas las variables en la misma escala decimal (0,0% a 100,0%)');

  setRow(20, 'Equivalencia de Proteína Verdadera en Base 100% Seca (% MS)', [
    '=IF(COUNT(B8,B15)<2,"",B15/(1-B8))',
    '=IF(COUNT(C8,C15)<2,"",C15/(1-C8))',
    '=IF(COUNT(D8,D15)<2,"",D15/(1-D8))',
    '=E15/(1-E8)', '=F15/(1-F8)', '=G15/(1-G8)'
  ], '0.0%', false, true, true, 'Estándar comparativo independiente de la humedad final de secado');

  ws.getRow(22).values = [
    '3. AUDITORÍA DE BALANCE DE NITRÓGENO Y VALORACIÓN NUTRICIONAL',
    'T0 REAL', 'T1 REAL', 'T2 REAL',
    'T0 Ref. Esp.', 'T1 Ref. Esp.', 'T2 Ref. Esp.',
    'Ecuación Física / Criterio de Aceptación (Go / No-Go)'
  ];
  head(ws.getRow(22));

  setRow(23, 'Masa absoluta de Proteína Cruda Total en la bandeja [gramos PC]', [
    '=IF(COUNT(B7,B14)<2,"",B7*B14)',
    '=IF(COUNT(C7,C14)<2,"",C7*C14)',
    '=IF(COUNT(D7,D14)<2,"",D7*D14)',
    '=E7*E14', '=F7*F14', '=G7*G14'
  ], '0.0', false, false, false, 'Gramos totales de N x 6,25 recuperados en la bandeja');

  setRow(24, 'Recuperación de Nitrógeno Total vs. N Inicial [%] (Ley Conservación Masa)', [
    '=IF(B23="","",1)',
    '=IF(COUNT(B23,C23)<2,"",C23/(B23+(\'1_Calculadora_Mezcla\'!C22*0.10+\'1_Calculadora_Mezcla\'!C23*0.45)))',
    '=IF(COUNT(B23,D23)<2,"",D23/(B23+(\'1_Calculadora_Mezcla\'!D22*0.10+\'1_Calculadora_Mezcla\'!D23*0.45)+\'1_Calculadora_Mezcla\'!D27))',
    '=1',
    '=F23/(E23+(\'1_Calculadora_Mezcla\'!C22*0.10+\'1_Calculadora_Mezcla\'!C23*0.45))',
    '=G23/(E23+(\'1_Calculadora_Mezcla\'!D22*0.10+\'1_Calculadora_Mezcla\'!D23*0.45)+\'1_Calculadora_Mezcla\'!D27)'
  ], '0.0%', false, true, false, 'CRÍTICO: Debe estar entre 94% y 102% (si >103% hay error de pesaje o Kjeldahl)');

  setRow(25, 'Eficiencia Real de Bioconversión del Sobre N-01 a Proteína Verdadera [%]', [
    'N/A', 'N/A',
    '=IF(COUNT(C7,D7,C15,D15)<4,"",((D7*D15)-(C7*C15))/\'1_Calculadora_Mezcla\'!D27)',
    'N/A', 'N/A',
    '=((G7*G15)-(F7*F15))/\'1_Calculadora_Mezcla\'!D27'
  ], '0.0%', false, true, true, 'Gramos de nueva Proteína TCA en T2 divididos entre los 31,6 g PC eq del Sobre N-01');

  setRow(26, 'Nitrógeno No Proteico (NNP) Residual en producto seco [% tal cual]', [
    '=IF(COUNT(B14:B15)<2,"",B14-B15)',
    '=IF(COUNT(C14:C15)<2,"",C14-C15)',
    '=IF(COUNT(D14:D15)<2,"",D14-D15)',
    '=E14-E15', '=F14-F15', '=G14-G15'
  ], '0.0%', false, false, false, 'Para pollos debe ser <1,5% en el ingrediente (<0,08% en dieta al 5% inclusión)');

  setRow(27, 'Reducción relativa de Fibra Cruda respecto al Blanco T0 [%]', [
    '=IF(B17="","",0)',
    '=IF(COUNT(B17,C17)<2,"",(C17-B17)/B17)',
    '=IF(COUNT(B17,D17)<2,"",(D17-B17)/B17)',
    '=0', '=(F17-E17)/E17', '=(G17-E17)/E17'
  ], '0.0%', false, true, false, 'Meta Etapa A: reducción entre -22% y -32%');

  setRow(28, 'Energía Metabolizable Aviar estimada - EMAn [kcal/kg tal cual]', [
    '=IF(B19="","",ROUND((35*B15+78*B16+16.5*B19-22*B17)*100,0))',
    '=IF(C19="","",ROUND((35*C15+78*C16+16.5*C19-22*C17)*100,0))',
    '=IF(D19="","",ROUND((35*D15+78*D16+16.5*D19-22*D17)*100,0))',
    '=ROUND((35*E15+78*E16+16.5*E19-22*E17)*100,0)',
    '=ROUND((35*F15+78*F16+16.5*F19-22*F17)*100,0)',
    '=ROUND((35*G15+78*G16+16.5*G19-22*G17)*100,0)'
  ], '#,##0', false, true, false, 'Ecuación conservadora ajustada a palmiste en aves (1.530 a 1.745 kcal/kg)');

  setRow(29, 'Precio Sombra LP Pollo Engorde (Cúcuta) [COP/kg]', [
    '=IF(B28="","",MAX(0,ROUND(38.8*(B15*100)+0.695*B28-1259,0)))',
    '=IF(C28="","",MAX(0,ROUND(38.8*(C15*100)+0.695*C28-1259,0)))',
    '=IF(D28="","",MAX(0,ROUND(38.8*(D15*100)+0.695*D28-1259,0)))',
    '=MAX(0,ROUND(38.8*(E15*100)+0.695*E28-1259,0))',
    '=MAX(0,ROUND(38.8*(F15*100)+0.695*F28-1259,0))',
    '=MAX(0,ROUND(38.8*(G15*100)+0.695*G28-1259,0))'
  ], '#,##0', false, true, true, 'Valor dual en LP Pollo (~590-745 $/kg a inclusión del 3% al 5%)');

  setRow(30, 'Valor Comercial Equivalente en Suplemento Ganadero / Rumiantes [COP/kg]', [
    '=IF(B28="","",ROUND(28*(B14*100)+0.32*B28,0))',
    '=IF(C28="","",ROUND(28*(C14*100)+0.32*C28,0))',
    '=IF(D28="","",ROUND(28*(D14*100)+0.32*D28,0))',
    '=ROUND(28*(E14*100)+0.32*E28,0)',
    '=ROUND(28*(F14*100)+0.32*F28,0)',
    '=ROUND(28*(G14*100)+0.32*G28,0)'
  ], '#,##0', false, true, true, 'En rumiantes aprovecha 100% de la PC total y FDN hidrolizada (~940-1.160 $/kg)');

  decorate(ws);
}

// ============================================================================
// HOJA 4: ESCALADO PILOTO 30 KG (FASE B: VALIDACIÓN TERMOFÍSICA Y LOTE POLLOS)
// ============================================================================
{
  const ws = wb.addWorksheet('4_Escalado_Piloto_30kg', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
  ws.getColumn(1).width = 56;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 48;

  ws.getCell('A1').value = 'FASE B: ESCALADO PILOTO DE 30 KG HÚMEDOS (~15 KG SECOS PARA PRUEBA EN POLLOS)';
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = 'Se ejecuta SOLO con el tratamiento ganador de la Fase A, fuera del laboratorio analítico de aceites (en 6 canastillas perforadas de 5,0 kg c/u).';
  ws.getCell('A2').fill = VERDE;

  ws.getRow(4).values = ['1. PARÁMETROS DE ESCALADO (6 CANASTILLAS DE 60x40 cm x 5,0 kg)', 'Por Canastilla (5 kg)', 'Lote Total (30 kg)', 'Unidad', 'Criterio de Ingeniería de Escalado'];
  head(ws.getRow(4));

  const escRows = [
    ['Masa húmeda basal por unidad (Torta + Lodo)', 5000.0, { formula: 'B5*6' }, 'gramos', '6 canastillas plásticas caladas con malla sombra transpirable'],
    ['Torta de Palmiste fresca molida (<2,5 mm)', { formula: "'1_Calculadora_Mezcla'!D19*(B5/'1_Calculadora_Mezcla'!$B$15)" }, { formula: 'B6*6/1000' }, 'g / kg (Col C)', 'Total lote: ~12,80 kg de Torta de Palmiste molida'],
    ['Lodo espeso de Clarificación Coopar (<34 °C)', { formula: "'1_Calculadora_Mezcla'!D20*(B5/'1_Calculadora_Mezcla'!$B$15)" }, { formula: 'B7*6/1000' }, 'g / kg (Col C)', 'Total lote: ~17,20 kg de Lodo espeso (1 bidón HDPE de 20 L)'],
    ['Sobre N-01: Complejo Mineral N-P-Buffer (si ganador es T2)', { formula: "'1_Calculadora_Mezcla'!D21*(B5/'1_Calculadora_Mezcla'!$B$15)" }, { formula: 'B8*6' }, 'gramos', 'Total lote: ~423 g disueltos en el lodo tibio'],
    ['Sobre M-01: Consorcio Fúngico Primario (Hora 0)', { formula: "'1_Calculadora_Mezcla'!D22*(B5/'1_Calculadora_Mezcla'!$B$15)" }, { formula: 'B9*6' }, 'gramos', 'Total lote: ~169 g mezclados homogéneamente'],
    ['Sobre M-02: Co-inóculo Levadura Activa', { formula: "'1_Calculadora_Mezcla'!D23*(B5/'1_Calculadora_Mezcla'!$B$15)" }, { formula: 'B10*6' }, 'gramos', 'Total lote: ~71 g'],
    ['Producto seco final esperado al 10% de humedad', { formula: "('1_Calculadora_Mezcla'!D26*(B5/'1_Calculadora_Mezcla'!$B$15)*0.891)/0.90" }, { formula: 'B11*6/1000' }, 'g / kg (Col C)', 'Entrega ~14,6 kg secos -> permite fabricar 290 kg de alimento al 5%']
  ];

  escRows.forEach((rData, idx) => {
    const r = ws.getRow(5 + idx);
    r.values = rData;
    r.getCell(2).numFmt = '#,##0.0';
    r.getCell(3).numFmt = '#,##0.00';
    if (idx === 0) r.getCell(2).fill = AMARILLO;
    if (idx === 6) {
      for (let c = 1; c <= 4; c++) {
        r.getCell(c).font = { bold: true };
        r.getCell(c).fill = VERDE;
      }
    }
  });

  ws.getRow(13).values = [
    '2. CONTROL DE GRADIENTE TÉRMICO (CENTRO vs. BORDE EN PICO METABÓLICO HORA 24-36)',
    'Temp. Centro (°C)', 'Temp. Borde (°C)', 'Gradiente ΔT (°C)',
    'Evaluación de Disipación de Calor Metabólico (Meta: ΔT <= 4,0 °C y Centro <= 40 °C)'
  ];
  head(ws.getRow(13));

  const camas = [
    ['Canastilla R1 - Espesor de cama 3,5 cm (Control delgado)', null, null],
    ['Canastilla R2 - Espesor de cama 3,5 cm (Control delgado)', null, null],
    ['Canastilla R3 - Espesor de cama 3,5 cm (Control delgado)', null, null],
    ['Canastilla R4 - Espesor de cama 5,5 cm (Prueba espesor medio)', null, null],
    ['Canastilla R5 - Espesor de cama 5,5 cm (Prueba espesor medio)', null, null],
    ['Canastilla R6 - Espesor de cama 5,5 cm (Prueba espesor medio)', null, null]
  ];

  camas.forEach((cData, i) => {
    const rNum = 14 + i;
    const r = ws.getRow(rNum);
    r.getCell(1).value = cData[0];
    r.getCell(2).value = cData[1];
    r.getCell(3).value = cData[2];
    r.getCell(2).fill = AMARILLO;
    r.getCell(3).fill = AMARILLO;
    r.getCell(2).numFmt = '0.0';
    r.getCell(3).numFmt = '0.0';
    r.getCell(4).value = { formula: `IF(COUNT(B${rNum}:C${rNum})<2,"",B${rNum}-C${rNum})` };
    r.getCell(4).numFmt = '0.0';
    r.getCell(5).value = {
      formula: `IF(COUNT(B${rNum}:C${rNum})<2,"Pendiente de medición en Hora 28",IF(B${rNum}>40,"ALERTA: Sobrecalentamiento en núcleo (>40°C)",IF((B${rNum}-C${rNum})>4,"ALERTA: Gradiente alto (>4°C), reducir espesor","OK: Transferencia térmica adecuada")))`
    };
  });

  decorate(ws);
}

  // Validación básica de datos para las columnas amarillas (Hoja 1 y Hoja 2)
  const ws1 = wb.getWorksheet('1_Calculadora_Mezcla');
  ['B10', 'B11', 'B12', 'B16'].forEach((addr) => {
    ws1.getCell(addr).dataValidation = {
      type: 'decimal', operator: 'between', formulae: [0, 1],
      showErrorMessage: true, errorTitle: 'Porcentaje inválido', error: 'Ingrese un porcentaje entre 0% y 100%.'
    };
  });
  ws1.getCell('B14').dataValidation = {
    type: 'decimal', operator: 'between', formulae: [2.5, 9.0],
    showErrorMessage: true, errorTitle: 'pH fuera de rango', error: 'Ingrese un pH entre 2,5 y 9,0.'
  };

  const ws2 = wb.getWorksheet('2_Bitacora_Control');
  for (let r = 5; r <= 11; r++) {
    ['B', 'C', 'D'].forEach((col) => {
      ws2.getCell(`${col}${r}`).dataValidation = {
        type: 'decimal', operator: 'between', formulae: [15, 60],
        showErrorMessage: true, errorTitle: 'Temperatura fuera de rango', error: 'Ingrese temperatura en °C (15 a 60 °C).'
      };
    });
    ['G', 'H'].forEach((col) => {
      ws2.getCell(`${col}${r}`).dataValidation = {
        type: 'decimal', operator: 'between', formulae: [2.5, 9.0],
        showErrorMessage: true, errorTitle: 'pH fuera de rango', error: 'Ingrese pH entre 2,5 y 9,0.'
      };
    });
  }

const out = path.join(__dirname, 'Herramienta_Estudio_Coopar_FES.xlsx');
wb.xlsx.writeFile(out).then(() => console.log('OK v3.0 ->', out));
