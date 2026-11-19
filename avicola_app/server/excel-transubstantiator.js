'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');
const TwinEngine = require('../shared/causal-twin-engine');
const { populateXlsxCachedValues } = require('./excel-formula-cache');

function loadExcelJS() {
  const candidates = [
    'exceljs',
    path.resolve(__dirname, '../node_modules/exceljs'),
    path.resolve(__dirname, '../../modelo/node_modules/exceljs')
  ];
  for (const modPath of candidates) {
    try {
      return require(modPath);
    } catch (_) {
      // intenta siguiente ruta
    }
  }
  throw new Error('No se encontró ExcelJS en node_modules ni en modelo/node_modules');
}

const ExcelJS = loadExcelJS();

function resolveTemplatePath(bundledRelPath, canonicalRelPath) {
  const bundled = path.resolve(__dirname, bundledRelPath);
  if (fs.existsSync(bundled)) return bundled;
  const canonical = path.resolve(__dirname, canonicalRelPath);
  return canonical;
}

const CANONICAL_AV1_PATH = resolveTemplatePath(
  '../templates/AV1_Plan_Financiero_Avicola.xlsx',
  '../../avicola_01_plan_financiero/AV1_Plan_Financiero_Avicola.xlsx'
);
const CANONICAL_AV2_PATH = resolveTemplatePath(
  '../templates/AV2_Operacion_Granja_Lotes_1_a_3.xlsx',
  '../../avicola_02_operacion_granja/AV2_Operacion_Granja_Lotes_1_a_3.xlsx'
);
const DEFAULT_EXPORTS_DIR = process.env.DATA_DIR
  ? path.join(path.resolve(process.env.DATA_DIR), 'exports')
  : path.resolve(__dirname, '../data/exports');

function toUtcDate(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}

function toIsoDate(val) {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number' && val > 20000) {
    // Número serial de Excel (epoch 1899-12-30)
    const utcMs = Math.round((val - 25569) * 86400 * 1000);
    return new Date(utcMs).toISOString().slice(0, 10);
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return val.trim().slice(0, 10);
  }
  return null;
}

function unwrapCellValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') {
    if (val instanceof Date) return val;
    if ('formula' in val) return val.result !== undefined ? val.result : null;
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((t) => t.text).join('');
    }
    if ('result' in val) return val.result;
  }
  return val;
}

function readNum(ws, ref, fallback = null) {
  const raw = unwrapCellValue(ws.getCell(ref).value);
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readText(ws, ref, fallback = null) {
  const raw = unwrapCellValue(ws.getCell(ref).value);
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim();
  return s === '' ? fallback : s;
}

/**
 * Limpia resultados en caché de fórmulas para forzar recálculo limpio al abrir en Excel
 * preservando intacta cada fórmula, estilo y validación.
 */
function addDaysIso(isoDate, deltaDays) {
  const dt = toUtcDate(isoDate || '2026-11-13');
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function setTextWithWrap(ws, ref, text, minHeight = null) {
  if (!ws) return;
  const cell = ws.getCell(ref);
  cell.value = text;
  const prevAlign = cell.alignment || {};
  cell.alignment = {
    ...prevAlign,
    vertical: prevAlign.vertical || 'middle',
    wrapText: true
  };
  if (minHeight !== null) {
    const rowNum = Number(String(ref).replace(/[^0-9]/g, ''));
    if (Number.isFinite(rowNum) && rowNum > 0) {
      const row = ws.getRow(rowNum);
      if (!row.height || row.height < minHeight) row.height = minHeight;
    }
  }
}

function applyNarrativeClarityAv1(wb1) {
  const ws0 = wb1.getWorksheet('0_Resumen_Ejecutivo');
  if (ws0) {
    if (ws0.getColumn(1)) ws0.getColumn(1).width = Math.max(ws0.getColumn(1).width || 46, 52);
    if (ws0.getColumn(2)) ws0.getColumn(2).width = Math.max(ws0.getColumn(2).width || 30, 42);
    setTextWithWrap(
      ws0,
      'A2',
      'Lectura ejecutiva en 60 segundos · Vereda La Alejandra, El Zulia (Cúcuta) · De la crianza en granja al pollo procesado en canal con menudencias ($1.500/ave sacrificio y faenado).',
      28
    );
    setTextWithWrap(ws0, 'A10', '2. Servicio de sacrificio y faenado ($1.500/ave)');
    setTextWithWrap(ws0, 'B19', 'Valor agregado neto del sacrificio y faenado (vs. vender vivo)', 24);
    setTextWithWrap(ws0, 'B23', 'Equivalencia comercial vs. vender vivo ($7.400/kg)', 24);
    for (let r = 29; r <= 33; r++) {
      const cell = ws0.getCell(`A${r}`);
      if (cell.value) {
        cell.alignment = { ...(cell.alignment || {}), vertical: 'middle', wrapText: true };
        ws0.getRow(r).height = Math.max(ws0.getRow(r).height || 24, 28);
      }
    }
  }

  const ws1 = wb1.getWorksheet('1_Precios_Mercado_Regional');
  if (ws1) {
    if (ws1.getColumn(1)) ws1.getColumn(1).width = Math.max(ws1.getColumn(1).width || 46, 50);
    if (ws1.getColumn(6)) ws1.getColumn(6).width = Math.max(ws1.getColumn(6).width || 36, 48);
    setTextWithWrap(ws1, 'A9', 'Alimento Preiniciación (Días 1-7 · Sem 1): Solla Masterpollito (ICA 9508 AL)', 24);
    setTextWithWrap(ws1, 'F9', 'Minipelet rojo 2 mm (~24% PC) · ficha oficial Solla Preiniciación; precio real Cúcuta ($2.662,5/kg)', 24);
    setTextWithWrap(ws1, 'A10', 'Alimento Iniciación (Días 8-21 · Sem 2-3): Solla Nutrepollo Cr SP (ICA 3054 AL)', 24);
    setTextWithWrap(ws1, 'F10', 'Crombo (~20% PC) · ficha oficial Solla Iniciación; precio real Cúcuta ($2.405/kg)', 24);
    setTextWithWrap(ws1, 'A15', 'C. INSUMOS DE GRANJA, SACRIFICIO Y LOGÍSTICA POST-FAENA');
    setTextWithWrap(ws1, 'A20', 'Servicio de sacrificio y faenado en maquila');
    setTextWithWrap(ws1, 'F28', 'Alternativa de venta al contado en finca sin maquila ni merma por faenado', 24);
  }

  const ws2 = wb1.getWorksheet('2_Rentabilidad_por_Lote');
  if (ws2) {
    if (ws2.getColumn(1)) ws2.getColumn(1).width = Math.max(ws2.getColumn(1).width || 48, 56);
    setTextWithWrap(
      ws2,
      'A2',
      'Flujo cronológico sin siglas: Escala Física -> Costos en Granja (Pollo Vivo) -> Venta Vivo vs. Sacrificio y Faenado en Canal -> Utilidad Neta y Margen.',
      26
    );
    setTextWithWrap(ws2, 'A24', 'Bultos Alimento Preiniciación Master Pollito (d1-7 Sem 1, sup. 99,25%)', 22);
    setTextWithWrap(ws2, 'A25', 'Bultos Alimento Iniciación Nutrepollo Cr SP (d8-21 Sem 2-3, sup. 98,35%)', 22);
    setTextWithWrap(ws2, 'A41', '4. PROCESAMIENTO EN PLANTA DE SACRIFICIO Y FAENADO (PASO A CANAL CON MENUDENCIAS)');
    setTextWithWrap(ws2, 'A42', 'Servicio de sacrificio y faenado ($1.500 x pollos finales)');
  }
}

function applyNarrativeClarityAv2(wb2) {
  const wsTab = wb2.getWorksheet('0_Tablero_Gerencial');
  if (wsTab) {
    if (wsTab.getColumn(1)) wsTab.getColumn(1).width = Math.max(wsTab.getColumn(1).width || 48, 54);
    if (wsTab.getColumn(6)) wsTab.getColumn(6).width = Math.max(wsTab.getColumn(6).width || 34, 50);
    setTextWithWrap(
      wsTab,
      'A2',
      'Vereda La Alejandra, El Zulia · Lote 1 (13-nov: 600 comprados / 603 vivos reales en galpón) | Lote 2 (23-nov, 800 aves) | Lote 3 (05-dic -> salida 15-ene, 800 aves). Celdas AMARILLAS editables.',
      28
    );
    setTextWithWrap(
      wsTab,
      'C6',
      '600 comprados ($4.500/ave) · 603 vivos reales recibidos en galpón (0 bajas adicionales hoy) · 582 proyectados a venta (3% merma ppto.)',
      26
    );
    setTextWithWrap(
      wsTab,
      'C7',
      'Meta Pre-Navidad 22-dic (Día 40 = 2,79 kg vivo / 2,30 kg canal) | Cierre nominal 24-dic (Día 42 = 3,00 kg vivo / 2,47 kg c/menud.) | 45d = 2,72 kg',
      26
    );
    setTextWithWrap(wsTab, 'F29', 'Aves vivas proyectadas que llegan a cosecha/faenado');
    setTextWithWrap(wsTab, 'A33', '4. Servicio de sacrificio y faenado ($1.500/ave)');
    setTextWithWrap(wsTab, 'A36', '   -> COSTO REAL DE PRODUCCIÓN POR KILO EN CANAL (Equilibrio contable, COP/kg)', 26);
    setTextWithWrap(wsTab, 'F36', 'Costo real: Lote 1 $8.247/kg -> Lotes 2-3 $7.488/kg (Consol. $7.695/kg; holgura 33,1% vs $11.500)', 26);
    setTextWithWrap(wsTab, 'A41', '10. Capital de Trabajo Pico Requerido (23-dic · Víspera 1.ª cosecha Día 41 L1, COP)', 26);
    setTextWithWrap(wsTab, 'F41', 'Tope de bolsillo antes de cobrar Lote 1 (15-ene Payback 3L | 06-feb Continuo 900)', 26);
    setTextWithWrap(wsTab, 'B46', 'Equivalencia comercial vs. vender vivo ($7.400/kg)', 26);
    setTextWithWrap(wsTab, 'F46', 'Equivale a vender en pie a $7.400/kg ($9.577/kg eq. canal); el costo real es $7.695/kg', 26);
  }

  const wsPlan = wb2.getWorksheet('1_Plan_3_Lotes_y_Capacidad');
  if (wsPlan) {
    if (wsPlan.getColumn(7)) wsPlan.getColumn(7).width = Math.max(wsPlan.getColumn(7).width || 38, 50);
    setTextWithWrap(wsPlan, 'A6', 'Escenario de Edad al Sacrificio');
    setTextWithWrap(wsPlan, 'G29', 'Costo total de crianza en pie antes de enviar a sacrificio y faenado', 24);
    setTextWithWrap(wsPlan, 'A31', '3. SACRIFICIO Y FAENADO, CANAL CON MENUDENCIAS Y UTILIDAD NETA FINAL');
    setTextWithWrap(wsPlan, 'A32', 'Servicio de sacrificio y faenado ($1.500/ave)');
    setTextWithWrap(wsPlan, 'A42', 'Área útil de referencia del galpón (3 secciones · m² por medir en finca)', 26);
    setTextWithWrap(
      wsPlan,
      'C42',
      'Capacidad declarada: 3 secciones (hasta 900 aves/secc.). 280 m² es ref. técnica (pendiente medir m² reales en campo)',
      26
    );
    setTextWithWrap(
      wsPlan,
      'C61',
      'Tope máximo de caja el 23-dic (Víspera 1.ª cosecha, Día 41 L1). Se recupera el 15-ene (3 lotes) o 06-feb (Continuo 900)',
      26
    );
  }

  const wsCost = wb2.getWorksheet('2_Costos_y_Equilibrio_Lote1');
  if (wsCost) {
    if (wsCost.getColumn(1)) wsCost.getColumn(1).width = Math.max(wsCost.getColumn(1).width || 44, 52);
    if (wsCost.getColumn(6)) wsCost.getColumn(6).width = Math.max(wsCost.getColumn(6).width || 38, 56);
    setTextWithWrap(wsCost, 'A4', '1. Referencia Preliminar (54 Bultos) vs. Compra Real Justo a Tiempo (JIT Sem 1 = 3 bultos)', 24);
    setTextWithWrap(wsCost, 'A5', 'Preiniciación d1-7 (Sem 1): Solla Masterpollito (ICA 9508 AL)', 26);
    setTextWithWrap(wsCost, 'F5', 'ICA 9508 AL · Minipelet rojo 2 mm (Preiniciación) · COMPRA REAL SEM 1: 3 bultos ($319.500) en bodega (~2 bultos hoy en piso)', 28);
    setTextWithWrap(wsCost, 'A6', 'Iniciación d8-21 (Sem 2-3): Solla Nutrepollo Cr SP (ICA 3054 AL)', 26);
    setTextWithWrap(wsCost, 'F6', 'ICA 3054 AL · Crombo (Iniciación) · COMPRA JIT SEM 2-3 (antes del 20-nov Día 8): 16 bultos requeridos ($1.539.200)', 28);
    setTextWithWrap(wsCost, 'F7', 'ICA 16430 AL · Pelet 3 mm (Engorde) · COMPRA JIT SEM 4-6 (desde 04-dic Día 22): 48 bultos requeridos ($4.483.200)', 28);
    setTextWithWrap(wsCost, 'A8', 'Subtotal Referencia Preliminar 54 Bultos (~500 aves · ver Plan Real JIT abajo)', 24);
    setTextWithWrap(wsCost, 'A12', 'Preiniciación Masterpollito (d1-7 · Sem 1)', 22);
    setTextWithWrap(wsCost, 'A13', 'Iniciación Nutrepollo Cr SP (d8-21 · Sem 2-3)', 22);
    setTextWithWrap(wsCost, 'A17', '3. ESTRUCTURA COMPLETA DE COSTOS Y UTILIDAD NETA (ETAPA 1 GRANJA -> ETAPA 2 SACRIFICIO Y FAENADO -> VENTA)', 26);
    setTextWithWrap(wsCost, 'A31', 'ETAPA 2 · Servicio de Sacrificio y Faenado ($1.500/pollo vivo final)', 24);
    setTextWithWrap(wsCost, 'A46', 'Equivalencia comercial en canal frente a vender vivo a $7.400/kg (NO es costo de producción, COP/kg)', 26);
  }

  const wsBit = wb2.getWorksheet('4_Bitacora_Diaria_Lote1');
  if (wsBit) {
    for (let r = 5; r <= 11; r++) setTextWithWrap(wsBit, `C${r}`, 'Preiniciación (d1-7 · S1)');
    for (let r = 12; r <= 25; r++) setTextWithWrap(wsBit, `C${r}`, 'Iniciación (d8-21 · S2-3)');
    setTextWithWrap(wsBit, 'C54', 'Preiniciación Masterpollito (d1-7 · Sem 1)');
    setTextWithWrap(wsBit, 'C55', 'Iniciación Nutrepollo Cr SP (d8-21 · Sem 2-3)');
    setTextWithWrap(wsBit, 'R11', TwinEngine.HITOS_BITACORA[7] || 'Fin Sem 1 Preiniciación Master Pollito (~175 g/ave) | Sug. Vacuna Newcastle + Bronquitis | Pesaje S1');
    setTextWithWrap(wsBit, 'R12', TwinEngine.HITOS_BITACORA[8] || 'Cambio a Iniciación Nutrepollo Cr SP (ICA 3054 AL) desde 20-nov | Sem 2-3');
    setTextWithWrap(wsBit, 'R25', TwinEngine.HITOS_BITACORA[21] || 'Último día Iniciación Nutrepollo Cr SP (~984 g vivo Ross) | Pesaje S3');
  }

  const wsPes = wb2.getWorksheet('5_Pesajes_y_Beneficio');
  if (wsPes) {
    if (wsPes.getColumn(1)) wsPes.getColumn(1).width = Math.max(wsPes.getColumn(1).width || 12, 16);
    if (wsPes.getColumn(2)) wsPes.getColumn(2).width = Math.max(wsPes.getColumn(2).width || 12, 30);
    if (wsPes.getColumn(9)) wsPes.getColumn(9).width = Math.max(wsPes.getColumn(9).width || 13, 46);
    setTextWithWrap(wsPes, 'A1', 'AV-2 · PESAJE SEMANAL, META PRE-NAVIDAD (22-DIC), CONVERSIÓN (FCR) Y LIQUIDACIÓN DE SACRIFICIO');
    setTextWithWrap(wsPes, 'B18', 'Día 40 (22-dic · Meta Pre-Navidad)', 24);
    setTextWithWrap(wsPes, 'I18', 'META PRE-NAVIDAD (22-dic): ~2,79 kg vivo / 2,30 kg canal para despachos navideños', 24);
    setTextWithWrap(wsPes, 'B19', 'Día 42 (24-dic · Meta 6 Semanas)', 24);
    setTextWithWrap(wsPes, 'I19', 'CIERRE NOMINAL 6 SEM (24-dic): ~3,00 kg vivo / 2,47 kg canal c/menudencias', 24);
    setTextWithWrap(wsPes, 'A25', 'SECCIÓN C: LIQUIDACIÓN REAL EN PLANTA DE SACRIFICIO Y FAENADO (LLENAR AL CIERRE DEL LOTE)');
    setTextWithWrap(wsPes, 'A26', 'Pollos recibidos vivos en planta de sacrificio (cabezas)');
    setTextWithWrap(wsPes, 'A27', 'Peso vivo total antes del sacrificio en finca/planta (kg)');
  }

  const wsAnx = wb2.getWorksheet('6_Anexo_Auditoria_Inicial');
  if (wsAnx) {
    if (wsAnx.getColumn(1)) wsAnx.getColumn(1).width = Math.max(wsAnx.getColumn(1).width || 48, 54);
    setTextWithWrap(wsAnx, 'A1', 'ANEXO DE AUDITORÍA · TRANSICIÓN DE 54 BULTOS (PRELIMINAR) A 67 BULTOS REALES JIT (600 AVES)');
    setTextWithWrap(
      wsAnx,
      'A2',
      'Explica la transición desde la cotización preliminar de 54 bultos hacia el Plan Real de 67 bultos con compras Justo a Tiempo (JIT: 3 b. Sem 1 + 16 b. Sem 2-3 + 48 b. Sem 4-6).',
      26
    );
    setTextWithWrap(wsAnx, 'B4', 'Preiniciación Master ($106,5k)');
    setTextWithWrap(wsAnx, 'C4', 'Iniciación Nutrepollo ($96,2k)');
    setTextWithWrap(wsAnx, 'A5', 'Cotización preliminar anterior (54 bultos / base ~500 aves)');
    setTextWithWrap(wsAnx, 'A10', 'Diferencia frente a referencia preliminar (fila 7 vs. 54 bultos)');
    setTextWithWrap(
      wsAnx,
      'A22',
      '1. Los 3 bultos de Preiniciación Masterpollito (120 kg, ICA 9508 AL) cubren toda la Semana 1 (105 kg = 2,63 bultos) y dejan 15 kg de transición a Iniciación.',
      26
    );
  }
}

function buildExecutiveRoleSheet(wb2, state, twinComp, options = {}) {
  const sheetName = '6_Viajes_Ventas_Minuta';
  const prevMinutaSheet = wb2.getWorksheet(sheetName);
  if (prevMinutaSheet) wb2.removeWorksheet(prevMinutaSheet.id);

  const ws = wb2.addWorksheet(sheetName, {
    properties: { tabColor: { argb: 'FF0F766E' } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  ws.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  ws.columns = [
    { width: 42 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 22 },
    { width: 48 },
    { width: 3.5 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 },
    { width: 11.8 }
  ];

  const COP_FMT = '"$"#,##0;-"$"#,##0;"-"';
  const PCT_FMT = '0.0%';
  const KG_FMT = '#,##0.00';
  const INT_FMT = '#,##0';
  const CANVAS_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  const WHITE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  const ROW_RULE = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  const addSpacerRow = (height = 14) => {
    const row = ws.addRow([]);
    row.height = height;
    for (let c = 1; c <= 17; c++) row.getCell(c).fill = CANVAS_FILL;
    return row;
  };

  const styleBanner = (row, bgHex, fontSize = 11, height = 25, endColLetter = 'G') => {
    const r = row.number;
    ws.mergeCells(`A${r}:${endColLetter}${r}`);
    const endColIdx = endColLetter === 'P' ? 16 : 7;
    for (let c = 1; c <= endColIdx; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.font = { name: 'Calibri', bold: true, size: fontSize, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    }
    row.height = height;
  };

  const styleHeaderRow = (row, bgHex = 'FFE2E8F0', fgHex = 'FF0F172A', accentHex = 'FF334155') => {
    row.height = 24;
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.font = { name: 'Calibri', bold: true, size: 9.5, color: { argb: fgHex } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: accentHex } }
      };
      cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 7 ? 'left' : 'center', wrapText: true };
    }
  };

  const styleDataRow = (row, idx, numFmts = {}, highlightBg = null) => {
    const col1Len = String(row.getCell(1).value || '').length;
    const col7Len = String(row.getCell(7).value || '').length;
    const linesNeeded = Math.max(1, Math.ceil(col7Len / 45), Math.ceil(col1Len / 38));
    row.height = Math.max(22, Math.min(54, linesNeeded * 15 + 6));
    const bgHex = highlightBg || (idx % 2 === 1 ? 'FFF8FAFC' : 'FFFFFFFF');
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgHex } };
      cell.border = ROW_RULE;
      cell.font = { name: 'Calibri', size: 9.5, bold: c === 1 || Boolean(highlightBg), color: { argb: 'FF0F172A' } };
      if (numFmts[c]) {
        cell.numFmt = numFmts[c];
        cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
      } else {
        cell.alignment = {
          vertical: 'middle',
          horizontal: c === 2 && typeof cell.value === 'string' && cell.value.length <= 22 ? 'center' : 'left',
          wrapText: true
        };
      }
    }
  };

  const frameCardBlock = (startRow, endRow, accentHex) => {
    const edge = { style: 'medium', color: { argb: accentHex } };
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 1; c <= 7; c++) {
        const cell = ws.getCell(r, c);
        const cur = cell.border || {};
        const nextBorder = { ...cur };
        if (r === startRow) nextBorder.top = edge;
        if (r === endRow) nextBorder.bottom = edge;
        if (c === 1) nextBorder.left = edge;
        if (c === 7) nextBorder.right = edge;
        cell.border = nextBorder;
      }
    }
  };

  const buildKpiCard = (c1, c2, topAccentHex, title, value, numFmt, subtitle, valueColor = 'FF0F172A') => {
    const cardSide = { style: 'thin', color: { argb: 'FF94A3B8' } };
    const topThick = { style: 'thick', color: { argb: topAccentHex } };
    const l1 = ws.getColumn(c1).letter;
    const l2 = ws.getColumn(c2).letter;
    ws.mergeCells(`${l1}4:${l2}4`);
    ws.mergeCells(`${l1}5:${l2}5`);
    ws.mergeCells(`${l1}6:${l2}6`);
    ws.getCell(4, c1).value = title;
    ws.getCell(5, c1).value = value;
    ws.getCell(6, c1).value = subtitle;
    for (let r = 4; r <= 6; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = WHITE_FILL;
        cell.border = {
          top: r === 4 ? topThick : undefined,
          bottom: r === 6 ? cardSide : undefined,
          left: c === c1 ? cardSide : undefined,
          right: c === c2 ? cardSide : undefined
        };
      }
    }
    ws.getCell(4, c1).font = { name: 'Calibri', bold: true, size: 8.5, color: { argb: topAccentHex } };
    ws.getCell(4, c1).alignment = { vertical: 'bottom', horizontal: 'center' };
    ws.getCell(5, c1).font = { name: 'Calibri', bold: true, size: 14, color: { argb: valueColor } };
    if (numFmt) ws.getCell(5, c1).numFmt = numFmt;
    ws.getCell(5, c1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getCell(6, c1).font = { name: 'Calibri', italic: true, size: 8.5, color: { argb: 'FF475569' } };
    ws.getCell(6, c1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  };

  const buildChartCardFrame = (startRow, endRow, title, subtitle, accentHex) => {
    ws.mergeCells(`I${startRow}:P${startRow}`);
    ws.mergeCells(`I${startRow + 1}:P${startRow + 1}`);
    ws.getCell(startRow, 9).value = title;
    ws.getCell(startRow + 1, 9).value = subtitle;
    const outerSide = { style: 'medium', color: { argb: accentHex } };
    const subBottom = { style: 'thin', color: { argb: 'FFCBD5E1' } };
    for (let r = startRow; r <= endRow; r++) {
      for (let c = 9; c <= 16; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = r === startRow
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: accentHex } }
          : r === startRow + 1
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
            : WHITE_FILL;
        cell.border = {
          top: r === startRow ? outerSide : undefined,
          bottom: r === endRow ? outerSide : r === startRow + 1 ? subBottom : undefined,
          left: c === 9 ? outerSide : undefined,
          right: c === 16 ? outerSide : undefined
        };
      }
    }
    ws.getCell(startRow, 9).font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    ws.getCell(startRow, 9).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getCell(startRow + 1, 9).font = { name: 'Calibri', italic: true, size: 8.5, color: { argb: 'FF475569' } };
    ws.getCell(startRow + 1, 9).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(startRow).height = Math.max(ws.getRow(startRow).height || 22, 24);
    ws.getRow(startRow + 1).height = Math.max(ws.getRow(startRow + 1).height || 18, 18);
  };

  const av2 = twinComp.av2 || {};
  const lotes = av2.lotes || [];
  const l1 = lotes[0] || {};
  const l2 = lotes[1] || {};
  const cons3 = av2.consolidado3Lotes || {};
  const gov = av2.gobiernoEjecutivo || {};
  const est = gov.estadoCampoHoy || {};
  const tv = gov.tesoreriaViva || {};
  const ac = gov.escenarioAcido || {};
  const ry = gov.riesgosYDecisiones || {};
  const kpi = av2.kpiIndustriales || {};
  const bsc = av2.scorecardBsc || {};
  const cont = av2.continuoResumen || { config: {}, loteModelo: {} };
  const aud = av2.auditoriaBodegaLote1 || { fisicaJit: { compradoHoy: {}, porComprarJit: {} } };
  const jitHoy = (aud.fisicaJit && aud.fisicaJit.compradoHoy) || {};
  const jitPend = (aud.fisicaJit && aud.fisicaJit.porComprarJit) || {};
  const precios = state.preciosRegionales || {};
  const params = state.parametrosGenerales || {};
  const trans = av2.transporte || { viajes: [], kmTotales: 0, costoTransporteTotalCop: 0, utilidadLote1PostTransporteCop: 0 };
  const ventasRes = av2.ventasParcialesResumen || {
    ventas: [], totalAvesVendidas: 0, totalKgVendidos: 0, totalIngresosCop: 0, totalMargenCop: 0, comparativaModalidadesLote1: {}
  };
  const agentName = (state.identidadAgente && state.identidadAgente.nombre) || 'Avi';

  // FILAS 1-2: BANNER CORPORATIVO COMPLETO (A..P)
  styleBanner(
    ws.addRow(['GRANJA LA ALEJANDRA (EL ZULIA) · TABLERO EJECUTIVO POR ROLES, KPIs AVIAGEN/FENAVI Y MINUTA OPERATIVA']),
    'FF0F172A', 12.5, 30, 'P'
  );
  const subBanner = ws.addRow([
    `Copiloto: ${agentName} | Lote 1 en curso: Día ${est.diaCicloL1 || 4} (${est.avesVivasReportadasHoy || 603} vivas reales / ${l1.avesIniciadas || 600} compradas) | Venta canal c/menudencias: $${Math.round(precios.precioCanalKg || 11500).toLocaleString('es-CO')}/kg | Corte: ${new Date().toISOString().slice(0, 10)}`
  ]);
  styleBanner(subBanner, 'FF1E293B', 9.5, 22, 'P');

  // FILA 3: ESPACIADOR CANVAS
  addSpacerRow(10);

  // FILAS 4-6: 4 TARJETAS KPI FLOTANTES EJECUTIVAS (se reservan secuencialmente para no saltar filas)
  ws.addRow([]).height = 18;
  ws.addRow([]).height = 28;
  ws.addRow([]).height = 18;
  for (let r = 4; r <= 6; r++) {
    for (let c = 1; c <= 17; c++) ws.getCell(r, c).fill = CANVAS_FILL;
  }
  const bod = state.bodegaInicialLote1 || { masterpollitoBultos: 3, nutrepolloBultos: 11, broilerBultos: 40 };
  const masterHoyKpi = jitHoy.masterpollito ?? 3;
  const nutreHoyKpi = Math.max(0, (bod.nutrepolloBultos || 11) - 11);
  const broilerHoyKpi = Math.max(0, (bod.broilerBultos || 40) - 40);
  const totalCompradoHoyBultos = masterHoyKpi + nutreHoyKpi + broilerHoyKpi;
  const totalReqBultos = (l1.bultosInic || 3) + (l1.bultosPre || 16) + (l1.bultosEng || 48);
  const costoCanal3L = Math.round(kpi.costoKgCanal3Lotes || 7695);
  const holguraKg = Math.round((precios.precioCanalKg || 11500) - costoCanal3L);

  buildKpiCard(
    1, 2, 'FF1E3A8A',
    'UTILIDAD NETA PLAN BASE (3 LOTES)',
    Math.round(cons3.utilidadCanal || 20062243), COP_FMT,
    `Margen ${((cons3.margenCanal || 0.3309) * 100).toFixed(1)}% · ROI s/Pico ${((tv.roiSobrePico3LotesPct || 0.6187) * 100).toFixed(1)}%`,
    'FF065F46'
  );
  buildKpiCard(
    3, 5, 'FFBE123C',
    `CAPITAL DE TRABAJO PICO (${tv.picoFechaCorta || '23-DIC'})`,
    -Math.round(Math.abs(tv.picoSolo3LCop || 31212600)), COP_FMT,
    `Tope víspera 1.ª cosecha · Payback ${tv.payback3LotesFechaCorta || '15-ene'}`,
    'FF9F1239'
  );
  buildKpiCard(
    6, 7, 'FF047857',
    'COSTO REAL CANAL VS. PRECIO DE VENTA',
    costoCanal3L, COP_FMT,
    `Holgura +$${holguraKg.toLocaleString('es-CO')}/kg frente a $${Math.round(precios.precioCanalKg || 11500).toLocaleString('es-CO')}/kg`,
    'FF0F172A'
  );
  buildKpiCard(
    9, 16, 'FFB45309',
    'BODEGA FÍSICA JIT HOY (PREINICIACIÓN SEM 1)',
    `${totalCompradoHoyBultos} / ${totalReqBultos} bultos`, null,
    `Invertido $${Math.round(jitHoy.costoCop || 319500).toLocaleString('es-CO')} · Caja protegida JIT $${Math.round((l1.costoAlimento || 6341900) - (jitHoy.costoCop || 319500)).toLocaleString('es-CO')}`,
    'FF92400E'
  );

  // FILA 7: ESPACIADOR CANVAS
  addSpacerRow(14);

  // BLOQUE 1 · DUEÑO / INVERSIONISTA
  const b1Row = ws.addRow(['1. RESUMEN PARA EL DUEÑO / INVERSIONISTA — CAJA FECHADA, RETORNO PLAN BASE VS. CONTINGENCIA ESTRÉS']);
  styleBanner(b1Row, 'FF1E3A8A', 10.5, 24);
  styleHeaderRow(ws.addRow([
    'Hito de Caja o Retorno', 'Fecha / Ventana', 'Plan Base (COP)', 'Continuo 900 / Alt.', '% Margen / ROI', 'Estado / Rol', 'Lectura Ejecutiva Directa'
  ]), 'FFDBEAFE', 'FF1E3A8A', 'FF1E3A8A');
  const ownerRows = [
    ['Desembolso Real Arranque + Sem 1 (JIT)', '30-oct a 13-nov', Math.round(tv.comprometidoArranqueRealCop || 4326000), Math.round(jitHoy.costoCop || 319500), null, 'Ejecutado Hoy', 'Arriendo M1 ($750k) + L1 600 pollitos ($2,70M) + 70% insumos ($556,5k) + 3 bultos Master Sem 1 ($319,5k)', null],
    ['Próximo Giro Fuerte: Lote 2 (800 aves @ $3.200)', est.lote2FechaEnt || '2026-11-23', Math.round(tv.giroSem3Cop || 4674475), -1040000, null, 'En 7 días', 'Columna derecha muestra ahorro directo (-$1.040.000) por compra de pollito B/manga frente a $4.500 local', null],
    ['Giro Arriendo Mes 2 + Ingreso Lote 3 (800 aves)', '30-nov a 05-dic', Math.round(tv.giroSem4Cop || 7441485), 'Sale 15-ene-2027', null, 'Programado', 'Arriendo M2 ($750k) + 800 pollitos L3 ($2,56M) + alimento Sem 4 (Lote 3 sale 15-ene-2027)', null],
    ['Giros Alimentación Paralela (3 Lotes en Engorde)', '06-dic a 23-dic', Math.round(tv.giroSem5a7Solo3LCop || 14773045), Math.round(tv.giroSem5a7ContCop || 18955965), null, 'Pico de Levante', 'Compra escalonada JIT de Broiler I Dorado sin inmovilizar capital antes de tiempo', null],
    ['TOPE DE CAPITAL DE TRABAJO (Máximo de Bolsillo)', `${tv.picoFechaCorta || '23-dic'} (Día 41 L1)`, -Math.round(Math.abs(tv.picoSolo3LCop || 31212600)), -Math.round(Math.abs(tv.picoContinuoCop || 35395520)), tv.roiSobrePico3LotesPct || 0.6187, 'Víspera 1.ª cosecha', 'Máxima caja requerida un día antes del primer cobro del Lote 1 (24-dic). ROI = utilidad / pico', 'FFFEF2F2'],
    ['HITO PAYBACK · Recuperación 100% del Capital', `${tv.payback3LotesFechaCorta || '15-ene'} (3L) / ${tv.paybackContinuoFechaCorta || '06-feb'} (Cont.)`, Math.round(cons3.utilidadCanal || 20062243), Math.round(tv.cajaSem18ContinuoCop || 47295092), tv.roiSobrePicoContinuoSem18Pct || 1.336, 'Retorno Total', 'En 3 lotes recupera caja el 15-ene; en flujo continuo 900 c/18d cierra Sem 18 (20-mar) con $47,30M', 'FFECFDF5'],
    ['UTILIDAD NETA PLAN BASE (Escenario Esperado)', 'Lotes 1 a 3', Math.round(cons3.utilidadCanal || 20062243), Math.round(tv.utilLoteContNetoArr || 9069169), cons3.margenCanal || 0.3309, 'Escenario Base', 'Col. D = utilidad neta mensualizada/lote en Continuo 900. Saldo final tras Mes 4 arriendo = $19.312.243', 'FFDCFCE7'],
    ['SIMULACIÓN CONTINGENCIA ESTRÉS (Hipotético · NO real)', 'Prueba Ácida', Math.round(ac.utilidadAcida3LCop || 14042301), Math.round(ac.cajaPost4mAcidaCop || 13292301), ac.roiPicoAcido3LPct || 0.4259, 'Solo Estrés', 'Castiga al tiempo -1,5% merma frío, -$500/kg precio, +$350/kg flete y +3% consumo (diferencia -$6,02M)', 'FFFEF3C7']
  ];
  let lastRow = b1Row.number + 1;
  ownerRows.forEach((r, idx) => {
    const hl = r.pop();
    const row = ws.addRow(r);
    styleDataRow(row, idx, { 3: COP_FMT, 4: typeof r[3] === 'number' ? COP_FMT : null, 5: PCT_FMT }, hl);
    lastRow = row.number;
  });
  frameCardBlock(b1Row.number, lastRow, 'FF1E3A8A');
  addSpacerRow(14);

  // BLOQUE 2 · GERENTE (BSC + FENAVI + AVIAGEN)
  const b2Row = ws.addRow(['2. CUADRO DE MANDO PARA EL GERENTE — KAPLAN & NORTON · ESTÁNDARES AVIAGEN ROSS 308 & FENAVI']);
  styleBanner(b2Row, 'FF065F46', 10.5, 24);
  styleHeaderRow(ws.addRow([
    'Indicador Gerencial', 'Perspectiva BSC', 'Valor 3 Lotes / Meta', 'Referencia Lote 1', 'Benchmark / %', 'Semáforo Actual', 'Interpretación y Palanca de Margen'
  ]), 'FFD1FAE5', 'FF065F46', 'FF065F46');
  const l1Mofc = Math.round((l1.ingresoCanal || 0) - (l1.costoAlimento || 0));
  const finSem = (bsc.financiera && bsc.financiera.status) || 'verde';
  const cliSem = (bsc.clienteMercado && bsc.clienteMercado.status) || 'ambar';
  const procSem = (bsc.procesosInternos && bsc.procesosInternos.status) || 'rojo';
  const aprSem = (bsc.aprendizajeCampo && bsc.aprendizajeCampo.status) || 'rojo';
  const iepVal = (bsc.procesosInternos && (bsc.procesosInternos.iepRealCampo || bsc.procesosInternos.iepRossTeorico)) || 424;
  const fcrTabla = (bsc.procesosInternos && bsc.procesosInternos.fcrObjetivoTabla) || 1.63;
  const mgrRows = [
    ['MOFC (Margen sobre Costo de Alimento)', '1. Financiera', Math.round(kpi.mofc3LotesCop || 37448243), l1Mofc, kpi.mofc3LotesPct || 0.618, finSem.toUpperCase(), 'Ingresos menos concentrado Solla ($23,19M = 57,2% del costo canal). Meta FENAVI >= 50%.'],
    ['Costo Real de Producción por kg en Canal', '1. Financiera', Math.round(kpi.costoKgCanal3Lotes || 7695), Math.round(l1.costoKgCanal || 8247), 1 - ((kpi.costoKgCanal3Lotes || 7695) / Math.max(1, precios.precioCanalKg || 11500)), finSem.toUpperCase(), `Costo vivo 3L = $${Math.round(kpi.costoKgVivo3Lotes || 5848).toLocaleString('es-CO')}/kg. Holgura neta ${(cons3.margenCanal * 100 || 33.1).toFixed(1)}% frente a $${Math.round(precios.precioCanalKg || 11500).toLocaleString('es-CO')}/kg.`],
    ['Equivalencia Comercial frente a Venta en Pie', '2. Cliente y Mercado', Math.round(kpi.precioIndiferenciaCanalVsVivo || 9577), Math.round(precios.precioVivoKg || 7400), ((precios.precioCanalKg || 11500) - (kpi.precioIndiferenciaCanalVsVivo || 9577)) / Math.max(1, precios.precioCanalKg || 11500), cliSem.toUpperCase(), 'NO es costo: equivale a vender vivo a $7.400/kg ($7.400 ÷ 82,5% + $607 faena). Procesar gana +$1.923/kg extra.'],
    ['IEP (Índice Eficiencia Europea Ross 308)', '3. Procesos Internos', Math.round(iepVal), Number(fcrTabla.toFixed(2)), Number((kpi.gmdMetaRoss42dG || 70.3).toFixed(1)), procSem.toUpperCase(), 'Col. D = FCR tabla (meta 1,57-1,65) | Col. E = GMD g/día (70,3). IEP >320 Bueno / >360 Excelente (real al Día 7).'],
    ['Viabilidad Real en Galpón vs. Presupuesto', '4. Aprendizaje y Campo', est.avesVivasReportadasHoy || 603, l1.avesIniciadas || 600, 1 - (l1.mortalidadEsperadaPct || 0.03), aprSem.toUpperCase(), `Compradas 600 nominales; recibidas 603 vivas reales (0 bajas hoy). Reportados ${est.diasReportadosEnVentana || 0}/${est.diasTranscurridos || 4} días en bitácora.`],
    ['Capacidad Física del Galpón (3 Secciones)', '3. Procesos Internos', ry.capacidadDeclaradaSeccionAves || 900, l2.avesIniciadas || 800, ry.areaMedidaVerificada ? `${Number((ry.densidad42dSeccionKgM2 || 0).toFixed(1))} kg/m²` : `Por medir (ref. ${Math.round(params.areaGalponM2 || 280)} m²)`, ry.areaMedidaVerificada ? 'VERIFICADA' : 'M² POR MEDIR', 'Capacidad declarada 900 aves/secc. 280 m² es ref. preliminar; medir largo × ancho real en finca.']
  ];
  lastRow = b2Row.number + 1;
  mgrRows.forEach((r, idx) => {
    const fmt = idx <= 2
      ? { 3: COP_FMT, 4: COP_FMT, 5: PCT_FMT }
      : idx === 3
        ? { 3: INT_FMT, 4: KG_FMT, 5: KG_FMT }
        : idx === 4
          ? { 3: INT_FMT, 4: INT_FMT, 5: PCT_FMT }
          : { 3: INT_FMT, 4: INT_FMT };
    const row = ws.addRow(r);
    styleDataRow(row, idx, fmt);
    lastRow = row.number;
  });
  frameCardBlock(b2Row.number, lastRow, 'FF065F46');
  addSpacerRow(14);

  // BLOQUE 3A · OPERADOR DE CAMPO — BODEGA FÍSICA SOLLA JIT (TAXONOMÍA OFICIAL SOLLA)
  const b3aRow = ws.addRow(['3A. OPERADOR DE CAMPO — BODEGA FÍSICA SOLLA JUSTO A TIEMPO (JIT SIN DESCAPITALIZAR)']);
  styleBanner(b3aRow, 'FF92400E', 10.5, 24);
  styleHeaderRow(ws.addRow([
    'Etapa y Producto Solla', 'Ventana / Fecha Límite', 'Comprado Hoy (Bultos)', 'Saldo / Piso (Bultos)', 'Por Comprar JIT (B.)', 'Costo Etapa Ppto (COP)', 'Instrucción Operativa de Bodega y Pedidos'
  ]), 'FFFEF3C7', 'FF92400E', 'FF92400E');
  const nutreCompradosHoy = nutreHoyKpi;
  const broilerCompradosHoy = broilerHoyKpi;
  const bultosInicReq = l1.bultosInic || 3;
  const bultosPreReq = l1.bultosPre || 16;
  const bultosEngReq = l1.bultosEng || 48;
  const jitRows = [
    ['1. Preiniciación (d1-7) · Master Pollito ICA 9508', 'Sem 1 (13 a 19-nov)', jitHoy.masterpollito ?? 3, Number((est.masterRestantesPiso ?? 2.0).toFixed(2)), Math.max(0, bultosInicReq - (jitHoy.masterpollito ?? 3)), Math.round(l1.costoAlimInic || 319500), 'Minipelet rojo (ficha Preiniciación Solla). Única fase comprada al arranque ($319.500); ~2 bultos hoy en piso.'],
    ['2. Iniciación (d8-21) · Nutrepollo Cr SP ICA 3054', 'Antes del 20-nov (Día 8)', nutreCompradosHoy, Number((est.nutreRestantesPiso ?? 0).toFixed(2)), est.porComprarJitNutre ?? Math.max(0, bultosPreReq - nutreCompradosHoy), Math.round(l1.costoAlimPre || 1539200), 'Crombelizado (ficha Iniciación Solla). Pedir 16 bultos antes del viernes 20-nov para cubrir Sem 2-3 sin congelar caja.'],
    ['3. Engorde (d22-42) · Broiler I Dorado ICA 16430', 'Desde 04-dic (Sem 4-6)', broilerCompradosHoy, Number((est.broilerRestantesPiso ?? 0).toFixed(2)), est.porComprarJitBroiler ?? Math.max(0, bultosEngReq - broilerCompradosHoy), Math.round(l1.costoAlimEng || 4483200), 'Peletizado (ficha Engorde Solla). Abastecer escalonado por semana desde 04-dic (~16 bultos/sem) conforme gira el capital.'],
    ['TOTAL PLAN ALIMENTO LOTE 1 (67 BULTOS)', '42 días (6 semanas)', totalCompradoHoyBultos, Number(((est.bultosRestantesPisoHoy ?? 2.0)).toFixed(2)), (jitPend.totalBultos ?? 64), Math.round(l1.costoAlimento || 6341900), 'Estrategia JIT evita sacar $6,02M por adelantado el Día 1 manteniendo stock vivo para 603 pollos.']
  ];
  lastRow = b3aRow.number + 1;
  jitRows.forEach((r, idx) => {
    const row = ws.addRow(r);
    styleDataRow(row, idx, { 3: INT_FMT, 4: KG_FMT, 5: INT_FMT, 6: COP_FMT }, idx === 3 ? 'FFFEF3C7' : null);
    lastRow = row.number;
  });
  frameCardBlock(b3aRow.number, lastRow, 'FF92400E');
  addSpacerRow(14);

  // BLOQUE 3B · CURVA PRE-NAVIDAD
  const b3bRow = ws.addRow(['3B. SEGUIMIENTO CURVA DE CRECIMIENTO LOTE 1 — META PRE-NAVIDAD (22-DIC DÍA 40) VS. CIERRE (24-DIC DÍA 42)']);
  styleBanner(b3bRow, 'FF0F766E', 10.5, 24);
  styleHeaderRow(ws.addRow([
    'Hito del Ciclo Lote 1', 'Fecha Calendario', 'Peso Vivo Meta (g)', 'Muestra 30 Aves (kg)', 'Canal c/Menud. (kg)', 'Alim. Acum. Ave (g)', 'Acción de Campo / Pesaje Real Registrado'
  ]), 'FFCCFBF1', 'FF0F766E', 'FF0F766E');
  const fIngL1 = l1.fechaIngreso || '2026-11-13';
  const climaMult = 1 + (params.factorClimaCucutaPct || 0);
  const rendCanal = params.rendimientoCanalConMenudPct || 0.825;
  const pesMap = new Map((state.pesajesSemanalesLote1 || []).map((p) => [p.dia, p]));
  const curveDays = [
    { d: 1, tag: 'Día 1 · Ingreso Lote 1', note: `Recepción ${est.avesRecibidasReales || 603} vivas reales (600 compradas) · Agua+electrolitos`, hl: null },
    { d: 4, tag: 'Día 4 · HOY EN GRANJA', note: `Revisar consumo, agua y mortalidad (~${(est.masterRestantesPiso ?? 2.0).toFixed(1)} bultos Master en piso)`, hl: 'FFFEF9C3' },
    { d: 7, tag: 'Día 7 · 1.er Pesaje Semanal (S1)', note: 'Pesar 30 aves en báscula para activar FCR e IEP reales · Fin Preiniciación Master Pollito', hl: null },
    { d: 14, tag: 'Día 14 · Pesaje Semanal (S2)', note: 'Verificar ganancia vs tabla Ross en Iniciación Nutrepollo Cr SP', hl: null },
    { d: 21, tag: 'Día 21 · Pesaje S3 (Transición)', note: 'Retiro gradual criadora · Fin Iniciación Nutrepollo y transición a Engorde Broiler I', hl: null },
    { d: 28, tag: 'Día 28 · Pesaje S4 (Meta Preventa)', note: 'Amarrar >=70% preventa navideña (408 pollos) con peso real verificado', hl: null },
    { d: 35, tag: 'Día 35 · Pesaje S5 (Pre-Cosecha)', note: 'Control estrés calórico El Zulia (agua fresca, ventilación)', hl: null },
    { d: 40, tag: 'Día 40 · META PRE-NAVIDAD (22-DIC)', note: 'Ventana despacho festivo antes del 24/25-dic (~2,79 kg vivo / 2,30 kg canal)', hl: 'FFDCFCE7' },
    { d: 42, tag: 'Día 42 · CIERRE NOMINAL (24-DIC)', note: 'Salida 6 semanas (~3,00 kg vivo / 2,47 kg canal). Primer cobro grande del plan.', hl: 'FFDCFCE7' },
    { d: 45, tag: 'Día 45 · Opción +3d (27-DIC)', note: 'Solo si cliente exige >=2,70 kg en canal y el galpón permite densidad', hl: null }
  ];
  lastRow = b3bRow.number + 1;
  curveDays.forEach((item, idx) => {
    const pesoG = Math.round((TwinEngine.ROSS_PESO_G[item.d] || 0) * climaMult);
    const muestra30Kg = Number(((pesoG * 30) / 1000).toFixed(2));
    const canalKg = Number(((pesoG / 1000) * rendCanal).toFixed(2));
    const alimAcumG = TwinEngine.ROSS_CONS_ACUM_G[item.d - 1] || 0;
    const pes = pesMap.get(item.d);
    const realTxt = pes && Number.isFinite(pes.pesoMuestraKg)
      ? `REAL REGISTRADO: ${pes.pesoMuestraKg.toFixed(2)} kg / ${pes.muestraAves} aves (${Math.round((pes.pesoMuestraKg / Math.max(1, pes.muestraAves)) * 1000)} g/ave) · ${item.note}`
      : item.note;
    const row = ws.addRow([item.tag, addDaysIso(fIngL1, item.d - 1), pesoG, muestra30Kg, canalKg, alimAcumG, realTxt]);
    styleDataRow(row, idx, { 3: INT_FMT, 4: KG_FMT, 5: KG_FMT, 6: INT_FMT }, item.hl);
    lastRow = row.number;
  });
  frameCardBlock(b3bRow.number, lastRow, 'FF0F766E');
  addSpacerRow(14);

  // BLOQUE 4 · TRANSPORTE, VENTAS PARCIALES, MATRIZ 3 MODALIDADES Y RFCs
  const b4aRow = ws.addRow(['4A. CONTROL DE VIAJES Y COMBUSTIBLE (TRANSPORTE PROPIO GRANJA)']);
  styleBanner(b4aRow, 'FF334155', 10.5, 24);
  styleHeaderRow(ws.addRow(['ID Viaje', 'Fecha', 'Lote', 'Odóm. Inicial', 'Odóm. Final', 'Km', 'Costo Aplicado (COP) · Observación']), 'FFE2E8F0', 'FF334155', 'FF334155');
  lastRow = b4aRow.number + 1;
  if (trans.viajes.length === 0) {
    const row = ws.addRow(['Sin viajes registrados aún', '—', 'lote-1', 0, 0, 0, 'Pendiente registro real · Impacto L1 post-transporte: $' + Math.round(trans.utilidadLote1PostTransporteCop || 0).toLocaleString('es-CO')]);
    styleDataRow(row, 0, { 4: INT_FMT, 5: INT_FMT, 6: INT_FMT });
    lastRow = row.number;
  } else {
    trans.viajes.forEach((v, idx) => {
      const row = ws.addRow([v.id, v.fecha, v.loteId, v.odometroInicial, v.odometroFinal, v.kmRecorridos, `$${Math.round(v.costoAplicadoCop || 0).toLocaleString('es-CO')} · ${v.estado} · ${v.observacion || v.motivo || ''}`]);
      styleDataRow(row, idx, { 4: INT_FMT, 5: INT_FMT, 6: INT_FMT });
      lastRow = row.number;
    });
  }
  frameCardBlock(b4aRow.number, lastRow, 'FF334155');
  addSpacerRow(14);

  const b4bRow = ws.addRow(['4B. SALIDAS, VENTAS PARCIALES Y COMPARATIVA 3 MODALIDADES LOTE 1']);
  styleBanner(b4bRow, 'FF334155', 10.5, 24);
  styleHeaderRow(ws.addRow(['Modalidad / Venta', 'Kg Vendibles', 'Precio / kg (COP)', 'Ingreso Bruto (COP)', 'Costo Total (COP)', 'Utilidad Neta (COP)', 'Margen % y Lectura']), 'FFE2E8F0', 'FF334155', 'FF334155');
  const cmpMod = ventasRes.comparativaModalidadesLote1 || {};
  const modeLabels = ['Referencia Granja', 'Ancla Recomendada', 'Decisión Aparte Módulo 3'];
  lastRow = b4bRow.number + 1;
  [cmpMod.enPie100, cmpMod.canal100, cmpMod.piezas100].filter(Boolean).forEach((m, idx) => {
    const row = ws.addRow([
      `Escenario L1 · ${m.modalidad}`,
      Number((m.kgVendibles || 0).toFixed(2)),
      Math.round(m.precioKgCop || 0),
      Math.round(m.ingresoCop || 0),
      Math.round(m.costoCop || 0),
      Math.round(m.utilidadCop || 0),
      `${((m.margenPct || 0) * 100).toFixed(1)}% sobre ingreso (${modeLabels[idx] || 'Comparativa'})`
    ]);
    styleDataRow(row, idx, { 2: KG_FMT, 3: COP_FMT, 4: COP_FMT, 5: COP_FMT, 6: COP_FMT }, idx === 1 ? 'FFDCFCE7' : null);
    lastRow = row.number;
  });

  if (ventasRes.ventas.length > 0) {
    ventasRes.ventas.forEach((s, idx) => {
      const row = ws.addRow([
        `Venta ${s.id} · ${s.cliente} (${s.fecha})`,
        Number((s.pesoKg || 0).toFixed(2)),
        s.pesoKg > 0 ? Math.round((s.ingresoTotalCop || 0) / s.pesoKg) : 0,
        Math.round(s.ingresoTotalCop || 0),
        Math.round((s.ingresoTotalCop || 0) - (s.margenBrutoCop || 0)),
        Math.round(s.margenBrutoCop || 0),
        `${s.modalidad} (${s.corteDetalle}) · ${s.cantidadAves} aves`
      ]);
      styleDataRow(row, idx, { 2: KG_FMT, 3: COP_FMT, 4: COP_FMT, 5: COP_FMT, 6: COP_FMT });
      lastRow = row.number;
    });
  } else {
    const row = ws.addRow(['Ventas parciales reales registradas hoy', 0, 0, 0, 0, 0, 'Sin despachos todavía · Meta 1.ª cosecha: 22 a 24-dic-2026']);
    styleDataRow(row, 3, { 2: KG_FMT, 3: COP_FMT, 4: COP_FMT, 5: COP_FMT, 6: COP_FMT });
    lastRow = row.number;
  }
  frameCardBlock(b4bRow.number, lastRow, 'FF334155');

  if (Array.isArray(options.rfcs) && options.rfcs.length > 0) {
    addSpacerRow(14);
    const b4cRow = ws.addRow(['4C. MINUTA DE DECISIONES Y SOLICITUDES DE CAMBIO (RFCs)']);
    styleBanner(b4cRow, 'FF334155', 10.5, 24);
    styleHeaderRow(ws.addRow(['Código', 'Fecha', 'Categoría', 'Estado', '—', '—', 'Título e Impacto Estimado']), 'FFE2E8F0', 'FF334155', 'FF334155');
    lastRow = b4cRow.number + 1;
    options.rfcs.forEach((r, idx) => {
      const row = ws.addRow([r.rfcCode, (r.createdAt || '').slice(0, 10), r.categoria, r.estado, '', '', `${r.titulo} | ${r.impactoEstimado || ''}`]);
      styleDataRow(row, idx);
      lastRow = row.number;
    });
    frameCardBlock(b4cRow.number, lastRow, 'FF334155');
  }

  // PANEL DERECHO (Cols I..P): Lienzo #F1F5F9 y 3 TARJETAS BLANCAS CON MARCO DE COLOR PARA GRÁFICOS NATIVOS
  const maxDashboardRow = Math.max(68, ws.rowCount + 2);
  for (let r = 3; r <= maxDashboardRow; r++) {
    ws.getCell(r, 8).fill = CANVAS_FILL; // Canaleta H
    ws.getCell(r, 17).fill = CANVAS_FILL; // Borde derecho Q
    if (r >= 7) {
      for (let c = 9; c <= 16; c++) ws.getCell(r, c).fill = CANVAS_FILL;
    }
    if (r > lastRow && r > 66) {
      for (let c = 1; c <= 7; c++) ws.getCell(r, c).fill = CANVAS_FILL;
    }
  }
  buildChartCardFrame(
    8, 26,
    'GRÁFICO 1 · CURVA DE CRECIMIENTO LOTE 1 (PRE-NAVIDAD VS. CIERRE)',
    'Peso vivo objetivo Ross 308 (g/ave): Día 40 = 22-dic (~2,79 kg) vs. Día 42 = 24-dic (~3,00 kg)',
    'FF0F766E'
  );
  buildChartCardFrame(
    28, 46,
    'GRÁFICO 2 · COMPARATIVA COMERCIAL POR MODALIDAD LOTE 1',
    'Ingreso Bruto vs. Costo Total y Utilidad Neta (En Pie vs. Canal c/Menudencias vs. Presas)',
    'FF1E3A8A'
  );
  buildChartCardFrame(
    48, 66,
    'GRÁFICO 3 · BODEGA SOLLA JUSTO A TIEMPO (COMPRADO VS. POR COMPRAR)',
    'Preiniciación Master (Sem 1) comprada al arranque · Iniciación Nutrepollo y Engorde Broiler JIT',
    'FF92400E'
  );
}

/**
 * Estilizado visual corporativo (siguiendo Anthropic xlsx & xlsx-author skills):
 * - Oculta cuadrículas en tableros gerenciales y financieros (mantiene en bitácoras).
 * - Pestañas coloreadas por rol (Gerencia / Finanzas / Campo / Auditoría).
 * - Código de color financiero estándar: azul entradas, verde enlaces, negro fórmulas.
 * - Formato condicional nativo (escalas de calor + barras de datos) e impresión ajustada.
 */
function applyExecutiveVisualPolish(wb, kind) {
  const TAB_COLORS = kind === 'AV1'
    ? {
        '0_Resumen_Ejecutivo': 'FF0F172A',
        '1_Precios_Mercado_Regional': 'FF475569',
        '2_Rentabilidad_por_Lote': 'FF047857',
        '3_Proyeccion_Anual_12_Meses': 'FF0F766E',
        '4_Glosario_y_Ross308': 'FF64748B'
      }
    : {
        '0_Tablero_Gerencial': 'FF0F172A',
        '1_Plan_3_Lotes_y_Capacidad': 'FF047857',
        '2_Costos_y_Equilibrio_Lote1': 'FF065F46',
        '3_Impacto_Alimento_Propio': 'FFB45309',
        '4_Bitacora_Diaria_Lote1': 'FFD97706',
        '5_Pesajes_y_Beneficio': 'FFB45309',
        '6_Anexo_Auditoria_Inicial': 'FF475569',
        '6_Viajes_Ventas_Minuta': 'FF0F766E'
      };

  const KEEP_GRID_SHEETS = new Set(['4_Bitacora_Diaria_Lote1', '5_Pesajes_y_Beneficio']);

  wb.eachSheet((ws) => {
    const tabArgb = TAB_COLORS[ws.name];
    if (tabArgb) {
      ws.properties = ws.properties || {};
      ws.properties.tabColor = { argb: tabArgb };
    }

    const showGrid = KEEP_GRID_SHEETS.has(ws.name);
    const prevViews = Array.isArray(ws.views) && ws.views.length ? ws.views : [{}];
    ws.views = prevViews.map((v, idx) => (idx === 0 ? { ...v, showGridLines: showGrid } : v));

    ws.pageSetup = {
      ...(ws.pageSetup || {}),
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0
    };

    // Portada ejecutiva elegante y tarjetas de lienzo en hojas principales
    const CANVAS_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    const WHITE_BG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    const safeUnmerge = (range) => {
      try { ws.unMergeCells(range); } catch (_) {}
    };
    const paintCanvasRange = (c1, c2, r1, r2) => {
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          ws.getCell(r, c).fill = CANVAS_BG;
        }
      }
    };
    const frameBlockBorder = (c1, c2, r1, r2, accentHex) => {
      const edge = { style: 'medium', color: { argb: accentHex } };
      for (let r = r1; r <= r2; r++) {
        for (let c = c1; c <= c2; c++) {
          const cell = ws.getCell(r, c);
          const cur = cell.border || {};
          const next = { ...cur };
          if (r === r1) next.top = edge;
          if (r === r2) next.bottom = edge;
          if (c === c1) next.left = edge;
          if (c === c2) next.right = edge;
          cell.border = next;
        }
      }
    };
    const buildRightChartCard = (colStart, colEnd, r1, r2, title, subtitle, accentHex) => {
      const l1 = ws.getColumn(colStart).letter;
      const l2 = ws.getColumn(colEnd).letter;
      safeUnmerge(`${l1}${r1}:${l2}${r1}`);
      safeUnmerge(`${l1}${r1 + 1}:${l2}${r1 + 1}`);
      ws.mergeCells(`${l1}${r1}:${l2}${r1}`);
      ws.mergeCells(`${l1}${r1 + 1}:${l2}${r1 + 1}`);
      ws.getCell(r1, colStart).value = title;
      ws.getCell(r1 + 1, colStart).value = subtitle;
      const edge = { style: 'medium', color: { argb: accentHex } };
      const subBottom = { style: 'thin', color: { argb: 'FFCBD5E1' } };
      for (let r = r1; r <= r2; r++) {
        for (let c = colStart; c <= colEnd; c++) {
          const cell = ws.getCell(r, c);
          cell.fill = r === r1
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: accentHex } }
            : r === r1 + 1
              ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
              : WHITE_BG;
          cell.border = {
            top: r === r1 ? edge : undefined,
            bottom: r === r2 ? edge : r === r1 + 1 ? subBottom : undefined,
            left: c === colStart ? edge : undefined,
            right: c === colEnd ? edge : undefined
          };
        }
      }
      ws.getCell(r1, colStart).font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      ws.getCell(r1, colStart).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getCell(r1 + 1, colStart).font = { name: 'Calibri', italic: true, size: 8.5, color: { argb: 'FF475569' } };
      ws.getCell(r1 + 1, colStart).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(r1).height = Math.max(ws.getRow(r1).height || 22, 24);
      ws.getRow(r1 + 1).height = Math.max(ws.getRow(r1 + 1).height || 18, 18);
    };

    if (ws.name === '0_Resumen_Ejecutivo' || ws.name === '0_Tablero_Gerencial') {
      safeUnmerge('A1:F1');
      safeUnmerge('A2:F2');
      safeUnmerge('A1:O1');
      safeUnmerge('A2:O2');
      ws.mergeCells('A1:O1');
      ws.mergeCells('A2:O2');
      const r1 = ws.getRow(1);
      r1.height = 30;
      for (let ci = 1; ci <= 15; ci++) {
        const hc = r1.getCell(ci);
        hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        hc.font = { name: 'Calibri', bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        hc.alignment = { vertical: 'middle', horizontal: 'left', indent: ci === 1 ? 1 : 0 };
      }
      const r2 = ws.getRow(2);
      r2.height = Math.max(r2.height || 24, 26);
      for (let ci = 1; ci <= 15; ci++) {
        const sc = r2.getCell(ci);
        sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        sc.font = { name: 'Calibri', italic: true, size: 9.5, color: { argb: 'FFE2E8F0' } };
        sc.alignment = { vertical: 'middle', horizontal: 'left', indent: ci === 1 ? 1 : 0, wrapText: true };
      }

      ws.getColumn(7).width = 3.5; // Canaleta separadora G entre tablas (A..F) y gráficos (H..O)
      for (let ci = 8; ci <= 15; ci++) ws.getColumn(ci).width = 11.8;

      if (ws.name === '0_Resumen_Ejecutivo') {
        paintCanvasRange(1, 16, 3, 3);
        paintCanvasRange(1, 6, 20, 20);
        paintCanvasRange(1, 6, 27, 27);
        paintCanvasRange(7, 16, 3, 37);
        ws.getRow(3).height = 10;
        ws.getRow(20).height = 14;
        ws.getRow(27).height = 14;
        frameBlockBorder(1, 6, 4, 19, 'FF1E3A8A');
        frameBlockBorder(1, 6, 21, 26, 'FF047857');
        frameBlockBorder(1, 6, 28, 33, 'FF475569');
        buildRightChartCard(
          8, 15, 4, 20,
          'GRÁFICO 1 · COMPARATIVO FINANCIERO POR ESCENARIO (COP)',
          'Inversión total en canal, ingreso bruto y utilidad neta: 800 Comercial vs. Propio vs. Lote 1',
          'FF1E3A8A'
        );
        buildRightChartCard(
          8, 15, 22, 36,
          'GRÁFICO 2 · SENSIBILIDAD LOTE 800: PRECIO CANAL VS. MORTALIDAD',
          'Utilidad neta estimada ($9.500 a $12.500/kg) frente a mortalidad 3%, 6% y 9%',
          'FF047857'
        );
      } else {
        paintCanvasRange(1, 16, 3, 3);
        paintCanvasRange(1, 6, 19, 19);
        paintCanvasRange(1, 6, 26, 26);
        paintCanvasRange(1, 6, 43, 43);
        paintCanvasRange(7, 16, 3, 51);
        ws.getRow(3).height = 10;
        ws.getRow(19).height = 14;
        ws.getRow(26).height = 14;
        ws.getRow(43).height = 14;
        frameBlockBorder(1, 6, 4, 18, 'FF1E3A8A');
        frameBlockBorder(1, 6, 20, 25, 'FF0F766E');
        frameBlockBorder(1, 6, 27, 42, 'FF047857');
        frameBlockBorder(1, 6, 44, 49, 'FF334155');
        buildRightChartCard(
          8, 15, 4, 24,
          'GRÁFICO 1 · RENTABILIDAD MULTI-LOTE (LOTES 1, 2 Y 3)',
          'Comparativo de Inversión Total puesta en canal, Ingreso Bruto y Utilidad Neta',
          'FF1E3A8A'
        );
        buildRightChartCard(
          8, 15, 26, 47,
          'GRÁFICO 2 · SENSIBILIDAD CONSOLIDADO 3 LOTES SEGÚN PRECIO EN CANAL',
          'Utilidad Neta 3 Lotes vs. Caja Final tras pagar el 4.º mes de arriendo',
          'FF047857'
        );
      }
    } else if (ws.name === '1_Plan_3_Lotes_y_Capacidad') {
      ws.getColumn(8).width = 3.5; // Canaleta separadora H entre Flujo de Caja (A..G) y Curva de Caja (I..P)
      for (let ci = 9; ci <= 16; ci++) ws.getColumn(ci).width = 11.8;
      paintCanvasRange(8, 17, 47, 65);
      frameBlockBorder(1, 7, 48, 62, 'FF1E3A8A');
      buildRightChartCard(
        9, 16, 48, 64,
        'GRÁFICO · CURVA REAL DE CAJA ACUMULADA SEMANAL (3 LOTES)',
        'Evolución desde Arriendo Mes 1 hasta Tope Capital 23-Dic (-$31,21M) y Payback 15-Ene',
        'FF1E3A8A'
      );
    }

    // Código de color Wall Street: azul para celdas editables amarillas, verde para enlaces entre hojas
    if (ws.name !== '6_Viajes_Ventas_Minuta') {
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          const fillArgb = cell.fill && cell.fill.fgColor && String(cell.fill.fgColor.argb || '').toUpperCase();
          const fontArgb = cell.font && cell.font.color && String(cell.font.color.argb || '').toUpperCase();
          const isWhiteHeader = fontArgb === 'FFFFFFFF';
          const baseFont = { ...(cell.font || {}), name: (cell.font && cell.font.name) || 'Calibri' };
          if (isWhiteHeader) {
            cell.font = baseFont;
            return;
          }

          const val = cell.value;
          const isFormula = val && typeof val === 'object' && typeof val.formula === 'string';
          if (!isFormula && (fillArgb === 'FFFFF2CC' || fillArgb === 'FFFEF9C3')) {
            cell.font = { ...baseFont, color: { argb: 'FF0000FF' }, bold: true };
          } else if (isFormula && val.formula.includes('!')) {
            cell.font = { ...baseFont, color: { argb: 'FF006100' } };
          } else {
            cell.font = baseFont;
          }
        });
      });
    }
  });

  // Formato condicional nativo (escalas de calor + barras de datos, sin duplicar reglas)
  const resetCf = (sheet) => {
    if (sheet && Array.isArray(sheet.conditionalFormattings)) sheet.conditionalFormattings = [];
  };

  if (kind === 'AV1') {
    const ws0 = wb.getWorksheet('0_Resumen_Ejecutivo');
    if (ws0 && typeof ws0.addConditionalFormatting === 'function') {
      resetCf(ws0);
      ws0.addConditionalFormatting({
        ref: 'C23:E26',
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
            color: [{ argb: 'FFFCA5A5' }, { argb: 'FFFDE68A' }, { argb: 'FF6EE7B7' }]
          }
        ]
      });
    }
  } else if (kind === 'AV2') {
    const ws0 = wb.getWorksheet('0_Tablero_Gerencial');
    if (ws0 && typeof ws0.addConditionalFormatting === 'function') {
      resetCf(ws0);
      ws0.addConditionalFormatting({
        ref: 'D46:E49',
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
            color: [{ argb: 'FFFCA5A5' }, { argb: 'FFFDE68A' }, { argb: 'FF6EE7B7' }]
          }
        ]
      });
    }

    const ws1 = wb.getWorksheet('1_Plan_3_Lotes_y_Capacidad');
    if (ws1 && typeof ws1.addConditionalFormatting === 'function') {
      resetCf(ws1);
      ws1.addConditionalFormatting({
        ref: 'G50:G60',
        rules: [
          {
            type: 'colorScale',
            cfvo: [{ type: 'min' }, { type: 'num', value: 0 }, { type: 'max' }],
            color: [{ argb: 'FFFDA4AF' }, { argb: 'FFF8FAFC' }, { argb: 'FF6EE7B7' }]
          }
        ]
      });
      ws1.addConditionalFormatting({
        ref: 'F50:F60',
        rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF0284C7' } }]
      });
    }

    const ws6 = wb.getWorksheet('6_Viajes_Ventas_Minuta');
    if (ws6 && typeof ws6.addConditionalFormatting === 'function') {
      resetCf(ws6);
      let curveHeaderRow = null;
      ws6.eachRow((row, r) => {
        if (String(row.getCell(1).value || '').includes('Hito del Ciclo Lote 1')) curveHeaderRow = r;
      });
      if (curveHeaderRow) {
        ws6.addConditionalFormatting({
          ref: `C${curveHeaderRow + 1}:C${curveHeaderRow + 10}`,
          rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF059669' } }]
        });
      }
    }
  }
}

function resolveUvBinary() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv'),
    'uv'
  ];
  for (const cand of candidates) {
    if (cand === 'uv' || fs.existsSync(cand)) return cand;
  }
  return null;
}

function applyNativeChartsIfAvailable(kind, xlsxPath) {
  const scriptPath = path.resolve(__dirname, 'excel-visual-charts.py');
  if (!fs.existsSync(scriptPath) || !fs.existsSync(xlsxPath)) return { applied: false, reason: 'missing_file' };

  const uvBin = resolveUvBinary();
  if (uvBin) {
    const r = spawnSync(uvBin, ['run', '--with', 'openpyxl', 'python', scriptPath, kind, xlsxPath], {
      encoding: 'utf8',
      timeout: 25000
    });
    if (r.status === 0) return { applied: true, runner: 'uv' };
  }

  for (const pyBin of ['/app/.venv/bin/python', '/opt/venv/bin/python', 'python3', 'python']) {
    if (pyBin.startsWith('/') && !fs.existsSync(pyBin)) continue;
    const r = spawnSync(pyBin, [scriptPath, kind, xlsxPath], { encoding: 'utf8', timeout: 20000 });
    if (r.status === 0) return { applied: true, runner: pyBin };
  }
  return { applied: false, reason: 'python_openpyxl_unavailable' };
}

/**
 * Sanitiza en memoria cualquier archivo .xlsx que contenga dibujos/gráficos nativos
 * para que ExcelJS pueda leer sus celdas sin fallar por bug en xl/drawings.
 */
async function sanitizeXlsxBufferForExcelJS(filePathOrBuffer) {
  const rawBuf = Buffer.isBuffer(filePathOrBuffer)
    ? filePathOrBuffer
    : fs.readFileSync(String(filePathOrBuffer));

  const zip = await JSZip.loadAsync(rawBuf);
  const drawingEntries = Object.keys(zip.files).filter(
    (name) => name.startsWith('xl/drawings/') || name.startsWith('xl/charts/')
  );
  if (drawingEntries.length === 0) {
    return rawBuf;
  }

  for (const entry of drawingEntries) {
    zip.remove(entry);
  }
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
      const xml = await zip.file(name).async('string');
      const cleaned = xml
        .replace(/<drawing\b[^>]*\/>/gi, '')
        .replace(/<legacyDrawing\b[^>]*\/>/gi, '');
      if (cleaned !== xml) zip.file(name, cleaned);
    } else if (/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(name)) {
      const rels = await zip.file(name).async('string');
      const cleanedRels = rels.replace(/<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*\/>/gi, '');
      if (cleanedRels !== rels) zip.file(name, cleanedRels);
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Limpia resultados en caché de fórmulas para forzar recálculo limpio al abrir en Excel
 * preservando intacta cada fórmula, estilo y validación.
 */
function markWorkbookForFullRecalc(wb) {
  wb.calcProperties = wb.calcProperties || {};
  wb.calcProperties.fullCalcOnLoad = true;
  wb.eachSheet((ws) => {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value && typeof cell.value === 'object' && cell.value.formula) {
          cell.value = { formula: cell.value.formula };
        }
      });
    });
  });
}

async function ensureCanonicalTemplatesExist() {
  if (!fs.existsSync(CANONICAL_AV1_PATH)) {
    const { buildPlanFinanciero } = require('../../avicola_01_plan_financiero/generar_plan_financiero');
    await buildPlanFinanciero();
  }
  if (!fs.existsSync(CANONICAL_AV2_PATH)) {
    const { buildControlOperacion } = require('../../avicola_02_operacion_granja/generar_control_operacion');
    await buildControlOperacion();
  }
}

/**
 * COMPILADOR EN VIVO (Gemelo Digital -> Libros Excel AV-1 y AV-2 con 100% Fórmulas Nativas).
 * No altera el archivo maestro canónico salvo que options.updateCanonical === true.
 */
async function compileTwinToWorkbooks(stateInput, options = {}) {
  await ensureCanonicalTemplatesExist();

  const state = stateInput || TwinEngine.createDefaultTwinState();
  const precios = state.preciosRegionales;
  const params = state.parametrosGenerales;
  const bod = state.bodegaInicialLote1;
  const l1 = state.lotes[0];
  const l2 = state.lotes[1];
  const l3 = state.lotes[2];

  const exportsDir = options.exportsDir || DEFAULT_EXPORTS_DIR;
  fs.mkdirSync(exportsDir, { recursive: true });

  const targetAv1 = options.updateCanonical
    ? CANONICAL_AV1_PATH
    : path.join(exportsDir, options.av1Filename || 'AV1_Plan_Financiero_Avicola_Live.xlsx');
  const targetAv2 = options.updateCanonical
    ? CANONICAL_AV2_PATH
    : path.join(exportsDir, options.av2Filename || 'AV2_Operacion_Granja_Lotes_1_a_3_Live.xlsx');

  // -------------------------------------------------------------------------
  // 1. Compilar AV-1 desde plantilla maestra e inyectar entradas amarillas
  // -------------------------------------------------------------------------
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(CANONICAL_AV1_PATH);
  markWorkbookForFullRecalc(wb1);

  const ws1Precios = wb1.getWorksheet('1_Precios_Mercado_Regional');
  ws1Precios.getCell('D6').value = precios.pollitoLocal;
  ws1Precios.getCell('D7').value = precios.pollitoBmanga;
  ws1Precios.getCell('D9').value = precios.alimInicBulto;
  ws1Precios.getCell('D10').value = precios.alimPreBulto;
  ws1Precios.getCell('D11').value = precios.alimEngComBulto;
  ws1Precios.getCell('D12').value = precios.alimEngPropioBulto;
  ws1Precios.getCell('D13').value = precios.fletePigmentoBulto;
  ws1Precios.getCell('D14').value = precios.extraHarinaPct;
  ws1Precios.getCell('D16').value = precios.camaAve;
  ws1Precios.getCell('D17').value = precios.gasAve;
  ws1Precios.getCell('D18').value = precios.vacunasAve;
  ws1Precios.getCell('D19').value = precios.energiaAve;
  ws1Precios.getCell('D20').value = precios.sacrificioAve;
  ws1Precios.getCell('D21').value = precios.logisticaCanalKg;
  ws1Precios.getCell('D23').value = precios.arriendoIniMes;
  ws1Precios.getCell('D24').value = precios.arriendoRegMes;
  ws1Precios.getCell('D25').value = precios.mesesArriendoPorLote;
  ws1Precios.getCell('D26').value = precios.colaboradorLote;
  ws1Precios.getCell('D27').value = precios.precioCanalKg;
  ws1Precios.getCell('D28').value = precios.precioVivoKg;

  const ws1Rent = wb1.getWorksheet('2_Rentabilidad_por_Lote');
  ws1Rent.getCell('B7').value = params.edadObjetivoGlobal;
  ws1Rent.getCell('B8').value = params.mortalidadEsperadaPct;
  ws1Rent.getCell('B9').value = params.factorClimaCucutaPct;
  ws1Rent.getCell('B12').value = params.mermaTransportePct;
  ws1Rent.getCell('B13').value = params.rendimientoCanalConMenudPct;
  ws1Rent.getCell('B14').value = params.rendimientoEviscSecoPct;

  const ws1Anual = wb1.getWorksheet('3_Proyeccion_Anual_12_Meses');
  const colsAnual = ['B', 'C', 'D', 'E', 'F', 'G'];
  (state.proyeccionAnualConfig.camadas || []).slice(0, 6).forEach((cam, idx) => {
    const cl = colsAnual[idx];
    ws1Anual.getCell(`${cl}5`).value = cam.aves;
    ws1Anual.getCell(`${cl}6`).value = cam.dieta;
    ws1Anual.getCell(`${cl}8`).value = cam.mesesArriendo;
  });

  applyNarrativeClarityAv1(wb1);
  applyExecutiveVisualPolish(wb1, 'AV1');
  const tmpAv1 = `${targetAv1}.tmp-${process.pid}.xlsx`;
  await wb1.xlsx.writeFile(tmpAv1);
  fs.renameSync(tmpAv1, targetAv1);
  if (!options.updateCanonical && options.skipCharts !== true) {
    applyNativeChartsIfAvailable('AV1', targetAv1);
  }
  await populateXlsxCachedValues(targetAv1, ExcelJS, sanitizeXlsxBufferForExcelJS);

  // -------------------------------------------------------------------------
  // 2. Compilar AV-2 desde plantilla maestra e inyectar entradas + bitácora
  // -------------------------------------------------------------------------
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(CANONICAL_AV2_PATH);
  markWorkbookForFullRecalc(wb2);

  const ws2Tab = wb2.getWorksheet('0_Tablero_Gerencial');
  ws2Tab.getCell('B5').value = toUtcDate(l1.fechaIngreso);
  ws2Tab.getCell('B6').value = l1.avesIniciadas;
  ws2Tab.getCell('B7').value = l1.edadObjetivoDias;
  ws2Tab.getCell('B8').value = l1.mortalidadEsperadaPct;
  ws2Tab.getCell('B9').value = params.factorClimaCucutaPct;
  ws2Tab.getCell('B10').value = params.pesoComercialMetaKg;
  ws2Tab.getCell('B11').value = params.rendimientoCanalConMenudPct;
  ws2Tab.getCell('B12').value = params.rendimientoEviscSecoPct;
  ws2Tab.getCell('B13').value = params.mermaTransportePct;
  ws2Tab.getCell('B14').value = precios.arriendoIniMes;
  ws2Tab.getCell('B15').value = l1.mesesArriendo;
  ws2Tab.getCell('B16').value = precios.colaboradorLote;
  ws2Tab.getCell('B17').value = precios.precioCanalKg;
  ws2Tab.getCell('B18').value = precios.precioVivoKg;

  const ws2Plan = wb2.getWorksheet('1_Plan_3_Lotes_y_Capacidad');
  ws2Plan.getCell('B5').value = toUtcDate(l3.fechaMetaSacrificio || '2027-01-15');
  ws2Plan.getCell('D5').value = l3.avesIniciadas;
  ws2Plan.getCell('F5').value = precios.pollitoBmanga;
  ws2Plan.getCell('B12').value = l2.desfaseDiasDespuesLote1 ?? 10;
  ws2Plan.getCell('D12').value = l2.edadObjetivoDias;
  ws2Plan.getCell('F12').value = l2.mortalidadEsperadaPct;
  ws2Plan.getCell('B13').value = l2.mesesArriendo;
  ws2Plan.getCell('D13').value = l3.mesesArriendo;
  ws2Plan.getCell('C16').value = l2.avesIniciadas;
  ws2Plan.getCell('C23').value = precios.pollitoBmanga;
  ws2Plan.getCell('B42').value = params.areaGalponM2;
  ws2Plan.getCell('B46').value = params.equipamientoAdicionalCop || 0;

  const ws2Cost = wb2.getWorksheet('2_Costos_y_Equilibrio_Lote1');
  ws2Cost.getCell('B5').value = bod.masterpollitoBultos;
  ws2Cost.getCell('B6').value = bod.nutrepolloBultos;
  ws2Cost.getCell('B7').value = bod.broilerBultos;
  ws2Cost.getCell('C5').value = precios.alimInicBulto;
  ws2Cost.getCell('C6').value = precios.alimPreBulto;
  ws2Cost.getCell('C7').value = precios.alimEngComBulto;
  ws2Cost.getCell('C19').value = precios.pollitoLocal;
  ws2Cost.getCell('C20').value = precios.camaAve * l1.avesIniciadas;
  ws2Cost.getCell('C21').value = precios.gasAve * l1.avesIniciadas;
  ws2Cost.getCell('C22').value = precios.vacunasAve * l1.avesIniciadas;
  ws2Cost.getCell('C23').value = precios.energiaAve * l1.avesIniciadas;
  ws2Cost.getCell('C31').value = precios.sacrificioAve;

  const ws2Prop = wb2.getWorksheet('3_Impacto_Alimento_Propio');
  ws2Prop.getCell('B6').value = precios.alimEngPropioBulto / 40;
  ws2Prop.getCell('B7').value = precios.fletePigmentoBulto / 40;
  ws2Prop.getCell('B9').value = precios.extraHarinaPct;
  ws2Prop.getCell('B13').value = params.pctEnsayoAlimentoPropioLote1 || 0;

  const ws2Bit = wb2.getWorksheet('4_Bitacora_Diaria_Lote1');
  (state.bitacoraDiariaLote1 || []).slice(0, 49).forEach((entry, idx) => {
    const r = 5 + idx;
    ws2Bit.getCell(`G${r}`).value = entry.mortalidad ?? null;
    ws2Bit.getCell(`H${r}`).value = entry.descarte ?? null;
    ws2Bit.getCell(`K${r}`).value = entry.alimRealKg ?? null;
    ws2Bit.getCell(`O${r}`).value = entry.tempC ?? null;
    ws2Bit.getCell(`P${r}`).value = entry.aguaL ?? null;
    ws2Bit.getCell(`R${r}`).value = entry.observacion || '';
  });

  const ws2Pes = wb2.getWorksheet('5_Pesajes_y_Beneficio');
  (state.pesajesSemanalesLote1 || []).slice(0, 8).forEach((p, idx) => {
    const r = 6 + idx;
    ws2Pes.getCell(`A${r}`).value = p.dia;
    ws2Pes.getCell(`C${r}`).value = p.muestraAves;
    ws2Pes.getCell(`D${r}`).value = p.pesoMuestraKg ?? null;
  });
  const liq = state.liquidacionPlantaLote1 || {};
  ws2Pes.getCell('C26').value = liq.pollosRecibidos ?? null;
  ws2Pes.getCell('C27').value = liq.pesoVivoPlantaKg ?? null;
  ws2Pes.getCell('C28').value = liq.pesoCanalFriaSinMenudKg ?? null;
  ws2Pes.getCell('C29').value = liq.pesoMenudenciasKg ?? null;

  applyNarrativeClarityAv2(wb2);
  const twinComp = TwinEngine.computeFullTwin(state);
  buildExecutiveRoleSheet(wb2, state, twinComp, options);
  applyExecutiveVisualPolish(wb2, 'AV2');

  const tmpAv2 = `${targetAv2}.tmp-${process.pid}.xlsx`;
  await wb2.xlsx.writeFile(tmpAv2);
  fs.renameSync(tmpAv2, targetAv2);
  if (!options.updateCanonical && options.skipCharts !== true) {
    applyNativeChartsIfAvailable('AV2', targetAv2);
  }
  await populateXlsxCachedValues(targetAv2, ExcelJS, sanitizeXlsxBufferForExcelJS);

  return {
    ok: true,
    compiledAt: new Date().toISOString(),
    updateCanonical: Boolean(options.updateCanonical),
    files: {
      av1Path: targetAv1,
      av2Path: targetAv2
    }
  };
}

function detectWorkbookKind(wb) {
  if (wb.getWorksheet('1_Precios_Mercado_Regional') && wb.getWorksheet('2_Rentabilidad_por_Lote')) {
    return 'AV1';
  }
  if (wb.getWorksheet('0_Tablero_Gerencial') && wb.getWorksheet('4_Bitacora_Diaria_Lote1')) {
    return 'AV2';
  }
  if (wb.getWorksheet('Consumo Pollo')) {
    return 'CONSUMO_POLLO';
  }
  return 'UNKNOWN';
}

function collectNumericDiffs(diffs, label, beforeVal, afterVal, applyFn) {
  if (afterVal === null || afterVal === undefined || !Number.isFinite(afterVal)) return;
  const b = Number(beforeVal ?? 0);
  const a = Number(afterVal);
  if (Math.abs(a - b) > 1e-6) {
    diffs.push({ field: label, before: b, after: a });
    applyFn(a);
  }
}

function collectTextDiffs(diffs, label, beforeVal, afterVal, applyFn) {
  if (afterVal === null || afterVal === undefined) return;
  const b = String(beforeVal ?? '');
  const a = String(afterVal);
  if (a !== b) {
    diffs.push({ field: label, before: b, after: a });
    applyFn(a);
  }
}

/**
 * HIDRATADOR INVERSO (.xlsx -> Gemelo Digital):
 * Lee celdas de entrada editadas y registros de bitácora, genera Diff Causal
 * financiero en vivo y produce el estado actualizado + eventos listos para Event Sourcing.
 */
async function hydrateTwinFromWorkbook(filePathOrBuffer, currentState) {
  const wb = new ExcelJS.Workbook();
  const safeBuffer = await sanitizeXlsxBufferForExcelJS(filePathOrBuffer);
  await wb.xlsx.load(safeBuffer);

  const kind = detectWorkbookKind(wb);
  if (kind === 'UNKNOWN') {
    throw new Error('Formato de archivo Excel no reconocido. Usa AV1, AV2 o Consumo Pollo.');
  }

  const baseState = currentState ? JSON.parse(JSON.stringify(currentState)) : TwinEngine.createDefaultTwinState();
  const nextState = JSON.parse(JSON.stringify(baseState));
  const diffs = [];
  const generatedEvents = [];

  if (kind === 'AV1') {
    const wsP = wb.getWorksheet('1_Precios_Mercado_Regional');
    const p = nextState.preciosRegionales;
    const mapP = [
      ['D6', 'preciosRegionales.pollitoLocal'],
      ['D7', 'preciosRegionales.pollitoBmanga'],
      ['D9', 'preciosRegionales.alimInicBulto'],
      ['D10', 'preciosRegionales.alimPreBulto'],
      ['D11', 'preciosRegionales.alimEngComBulto'],
      ['D12', 'preciosRegionales.alimEngPropioBulto'],
      ['D13', 'preciosRegionales.fletePigmentoBulto'],
      ['D14', 'preciosRegionales.extraHarinaPct'],
      ['D16', 'preciosRegionales.camaAve'],
      ['D17', 'preciosRegionales.gasAve'],
      ['D18', 'preciosRegionales.vacunasAve'],
      ['D19', 'preciosRegionales.energiaAve'],
      ['D20', 'preciosRegionales.sacrificioAve'],
      ['D21', 'preciosRegionales.logisticaCanalKg'],
      ['D23', 'preciosRegionales.arriendoIniMes'],
      ['D24', 'preciosRegionales.arriendoRegMes'],
      ['D25', 'preciosRegionales.mesesArriendoPorLote'],
      ['D26', 'preciosRegionales.colaboradorLote'],
      ['D27', 'preciosRegionales.precioCanalKg'],
      ['D28', 'preciosRegionales.precioVivoKg']
    ];
    for (const [ref, pathName] of mapP) {
      const key = pathName.split('.')[1];
      collectNumericDiffs(diffs, pathName, p[key], readNum(wsP, ref), (v) => { p[key] = v; });
    }

    const wsR = wb.getWorksheet('2_Rentabilidad_por_Lote');
    const g = nextState.parametrosGenerales;
    collectNumericDiffs(diffs, 'parametrosGenerales.edadObjetivoGlobal', g.edadObjetivoGlobal, readNum(wsR, 'B7'), (v) => { g.edadObjetivoGlobal = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.mortalidadEsperadaPct', g.mortalidadEsperadaPct, readNum(wsR, 'B8'), (v) => { g.mortalidadEsperadaPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.factorClimaCucutaPct', g.factorClimaCucutaPct, readNum(wsR, 'B9'), (v) => { g.factorClimaCucutaPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.mermaTransportePct', g.mermaTransportePct, readNum(wsR, 'B12'), (v) => { g.mermaTransportePct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.rendimientoCanalConMenudPct', g.rendimientoCanalConMenudPct, readNum(wsR, 'B13'), (v) => { g.rendimientoCanalConMenudPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.rendimientoEviscSecoPct', g.rendimientoEviscSecoPct, readNum(wsR, 'B14'), (v) => { g.rendimientoEviscSecoPct = v; });

    const wsA = wb.getWorksheet('3_Proyeccion_Anual_12_Meses');
    const colsA = ['B', 'C', 'D', 'E', 'F', 'G'];
    (nextState.proyeccionAnualConfig.camadas || []).slice(0, 6).forEach((cam, idx) => {
      const cl = colsA[idx];
      collectNumericDiffs(diffs, `anual.camada${idx + 1}.aves`, cam.aves, readNum(wsA, `${cl}5`), (v) => { cam.aves = v; });
      collectTextDiffs(diffs, `anual.camada${idx + 1}.dieta`, cam.dieta, readText(wsA, `${cl}6`), (v) => { cam.dieta = v; });
      collectNumericDiffs(diffs, `anual.camada${idx + 1}.mesesArriendo`, cam.mesesArriendo, readNum(wsA, `${cl}8`), (v) => { cam.mesesArriendo = v; });
    });

    if (diffs.length > 0) {
      generatedEvents.push({
        type: 'PARAM_UPDATE',
        sourceChannel: 'excel_hydration',
        payload: {
          preciosRegionales: nextState.preciosRegionales,
          parametrosGenerales: nextState.parametrosGenerales
        }
      });
    }
  } else if (kind === 'AV2') {
    const wsT = wb.getWorksheet('0_Tablero_Gerencial');
    const wsPlan = wb.getWorksheet('1_Plan_3_Lotes_y_Capacidad');
    const wsCost = wb.getWorksheet('2_Costos_y_Equilibrio_Lote1');
    const wsProp = wb.getWorksheet('3_Impacto_Alimento_Propio');
    const wsBit = wb.getWorksheet('4_Bitacora_Diaria_Lote1');
    const wsPes = wb.getWorksheet('5_Pesajes_y_Beneficio');

    const p = nextState.preciosRegionales;
    const g = nextState.parametrosGenerales;
    const bod = nextState.bodegaInicialLote1;
    const l1 = nextState.lotes[0];
    const l2 = nextState.lotes[1];
    const l3 = nextState.lotes[2];

    const fIngresoL1 = toIsoDate(unwrapCellValue(wsT.getCell('B5').value));
    collectTextDiffs(diffs, 'lote1.fechaIngreso', l1.fechaIngreso, fIngresoL1, (v) => { l1.fechaIngreso = v; });
    collectNumericDiffs(diffs, 'lote1.avesIniciadas', l1.avesIniciadas, readNum(wsT, 'B6'), (v) => { l1.avesIniciadas = v; });
    collectNumericDiffs(diffs, 'lote1.edadObjetivoDias', l1.edadObjetivoDias, readNum(wsT, 'B7'), (v) => { l1.edadObjetivoDias = v; });
    collectNumericDiffs(diffs, 'lote1.mortalidadEsperadaPct', l1.mortalidadEsperadaPct, readNum(wsT, 'B8'), (v) => { l1.mortalidadEsperadaPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.factorClimaCucutaPct', g.factorClimaCucutaPct, readNum(wsT, 'B9'), (v) => { g.factorClimaCucutaPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.pesoComercialMetaKg', g.pesoComercialMetaKg, readNum(wsT, 'B10'), (v) => { g.pesoComercialMetaKg = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.rendimientoCanalConMenudPct', g.rendimientoCanalConMenudPct, readNum(wsT, 'B11'), (v) => { g.rendimientoCanalConMenudPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.rendimientoEviscSecoPct', g.rendimientoEviscSecoPct, readNum(wsT, 'B12'), (v) => { g.rendimientoEviscSecoPct = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.mermaTransportePct', g.mermaTransportePct, readNum(wsT, 'B13'), (v) => { g.mermaTransportePct = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.arriendoIniMes', p.arriendoIniMes, readNum(wsT, 'B14'), (v) => { p.arriendoIniMes = v; });
    collectNumericDiffs(diffs, 'lote1.mesesArriendo', l1.mesesArriendo, readNum(wsT, 'B15'), (v) => { l1.mesesArriendo = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.colaboradorLote', p.colaboradorLote, readNum(wsT, 'B16'), (v) => { p.colaboradorLote = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.precioCanalKg', p.precioCanalKg, readNum(wsT, 'B17'), (v) => { p.precioCanalKg = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.precioVivoKg', p.precioVivoKg, readNum(wsT, 'B18'), (v) => { p.precioVivoKg = v; });

    const fMetaL3 = toIsoDate(unwrapCellValue(wsPlan.getCell('B5').value));
    collectTextDiffs(diffs, 'lote3.fechaMetaSacrificio', l3.fechaMetaSacrificio, fMetaL3, (v) => { l3.fechaMetaSacrificio = v; });
    collectNumericDiffs(diffs, 'lote3.avesIniciadas', l3.avesIniciadas, readNum(wsPlan, 'D5'), (v) => { l3.avesIniciadas = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.pollitoBmanga', p.pollitoBmanga, readNum(wsPlan, 'F5'), (v) => { p.pollitoBmanga = v; });
    collectNumericDiffs(diffs, 'lote2.desfaseDiasDespuesLote1', l2.desfaseDiasDespuesLote1, readNum(wsPlan, 'B12'), (v) => { l2.desfaseDiasDespuesLote1 = v; });
    collectNumericDiffs(diffs, 'lote2.edadObjetivoDias', l2.edadObjetivoDias, readNum(wsPlan, 'D12'), (v) => {
      l2.edadObjetivoDias = v;
      l3.edadObjetivoDias = v;
    });
    collectNumericDiffs(diffs, 'lote2.mortalidadEsperadaPct', l2.mortalidadEsperadaPct, readNum(wsPlan, 'F12'), (v) => {
      l2.mortalidadEsperadaPct = v;
      l3.mortalidadEsperadaPct = v;
    });
    collectNumericDiffs(diffs, 'lote2.mesesArriendo', l2.mesesArriendo, readNum(wsPlan, 'B13'), (v) => { l2.mesesArriendo = v; });
    collectNumericDiffs(diffs, 'lote3.mesesArriendo', l3.mesesArriendo, readNum(wsPlan, 'D13'), (v) => { l3.mesesArriendo = v; });
    collectNumericDiffs(diffs, 'lote2.avesIniciadas', l2.avesIniciadas, readNum(wsPlan, 'C16'), (v) => { l2.avesIniciadas = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.areaGalponM2', g.areaGalponM2, readNum(wsPlan, 'B42'), (v) => { g.areaGalponM2 = v; });
    collectNumericDiffs(diffs, 'parametrosGenerales.equipamientoAdicionalCop', g.equipamientoAdicionalCop, readNum(wsPlan, 'B46'), (v) => { g.equipamientoAdicionalCop = v; });

    const bMaster = readNum(wsCost, 'B5');
    const bNutre = readNum(wsCost, 'B6');
    const bBroiler = readNum(wsCost, 'B7');
    if (bMaster !== null && bMaster !== bod.masterpollitoBultos) {
      diffs.push({ field: 'bodegaInicialLote1.masterpollitoBultos', before: bod.masterpollitoBultos, after: bMaster });
      generatedEvents.push({ type: 'FEED_PURCHASE', sourceChannel: 'excel_hydration', payload: { fase: 'Master Pollito', bultos: bMaster - bod.masterpollitoBultos } });
      bod.masterpollitoBultos = bMaster;
    }
    if (bNutre !== null && bNutre !== bod.nutrepolloBultos) {
      diffs.push({ field: 'bodegaInicialLote1.nutrepolloBultos', before: bod.nutrepolloBultos, after: bNutre });
      generatedEvents.push({ type: 'FEED_PURCHASE', sourceChannel: 'excel_hydration', payload: { fase: 'Nutrepollo Cr SP', bultos: bNutre - bod.nutrepolloBultos } });
      bod.nutrepolloBultos = bNutre;
    }
    if (bBroiler !== null && bBroiler !== bod.broilerBultos) {
      diffs.push({ field: 'bodegaInicialLote1.broilerBultos', before: bod.broilerBultos, after: bBroiler });
      generatedEvents.push({ type: 'FEED_PURCHASE', sourceChannel: 'excel_hydration', payload: { fase: 'Broiler I Dorado', bultos: bBroiler - bod.broilerBultos } });
      bod.broilerBultos = bBroiler;
    }

    collectNumericDiffs(diffs, 'preciosRegionales.alimInicBulto', p.alimInicBulto, readNum(wsCost, 'C5'), (v) => { p.alimInicBulto = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.alimPreBulto', p.alimPreBulto, readNum(wsCost, 'C6'), (v) => { p.alimPreBulto = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.alimEngComBulto', p.alimEngComBulto, readNum(wsCost, 'C7'), (v) => { p.alimEngComBulto = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.pollitoLocal', p.pollitoLocal, readNum(wsCost, 'C19'), (v) => { p.pollitoLocal = v; });

    const avesL1Div = Math.max(1, l1.avesIniciadas || 600);
    const camaTot = readNum(wsCost, 'C20');
    const gasTot = readNum(wsCost, 'C21');
    const vacTot = readNum(wsCost, 'C22');
    const eneTot = readNum(wsCost, 'C23');
    if (camaTot !== null) collectNumericDiffs(diffs, 'preciosRegionales.camaAve', p.camaAve, camaTot / avesL1Div, (v) => { p.camaAve = v; });
    if (gasTot !== null) collectNumericDiffs(diffs, 'preciosRegionales.gasAve', p.gasAve, gasTot / avesL1Div, (v) => { p.gasAve = v; });
    if (vacTot !== null) collectNumericDiffs(diffs, 'preciosRegionales.vacunasAve', p.vacunasAve, vacTot / avesL1Div, (v) => { p.vacunasAve = v; });
    if (eneTot !== null) collectNumericDiffs(diffs, 'preciosRegionales.energiaAve', p.energiaAve, eneTot / avesL1Div, (v) => { p.energiaAve = v; });
    collectNumericDiffs(diffs, 'preciosRegionales.sacrificioAve', p.sacrificioAve, readNum(wsCost, 'C31'), (v) => { p.sacrificioAve = v; });

    if (wsProp) {
      const harKg = readNum(wsProp, 'B6');
      const flKg = readNum(wsProp, 'B7');
      if (harKg !== null) collectNumericDiffs(diffs, 'preciosRegionales.alimEngPropioBulto', p.alimEngPropioBulto, harKg * 40, (v) => { p.alimEngPropioBulto = v; });
      if (flKg !== null) collectNumericDiffs(diffs, 'preciosRegionales.fletePigmentoBulto', p.fletePigmentoBulto, flKg * 40, (v) => { p.fletePigmentoBulto = v; });
      collectNumericDiffs(diffs, 'preciosRegionales.extraHarinaPct', p.extraHarinaPct, readNum(wsProp, 'B9'), (v) => { p.extraHarinaPct = v; });
      collectNumericDiffs(diffs, 'parametrosGenerales.pctEnsayoAlimentoPropioLote1', g.pctEnsayoAlimentoPropioLote1, readNum(wsProp, 'B13'), (v) => { g.pctEnsayoAlimentoPropioLote1 = v; });
    }

    // Bitácora Diaria Días 1..49
    for (let d = 1; d <= 49; d++) {
      const r = 4 + d;
      const cur = nextState.bitacoraDiariaLote1[d - 1];
      const mort = readNum(wsBit, `G${r}`);
      const desc = readNum(wsBit, `H${r}`);
      const alim = readNum(wsBit, `K${r}`);
      const temp = readNum(wsBit, `O${r}`);
      const agua = readNum(wsBit, `P${r}`);
      const obs = readText(wsBit, `R${r}`, '');

      const changed =
        mort !== cur.mortalidad ||
        desc !== cur.descarte ||
        alim !== cur.alimRealKg ||
        temp !== cur.tempC ||
        agua !== cur.aguaL ||
        (obs !== '' && obs !== cur.observacion);

      if (changed) {
        diffs.push({
          field: `bitacoraDiariaLote1.dia${d}`,
          before: { mortalidad: cur.mortalidad, descarte: cur.descarte, alimRealKg: cur.alimRealKg, tempC: cur.tempC, aguaL: cur.aguaL },
          after: { mortalidad: mort, descarte: desc, alimRealKg: alim, tempC: temp, aguaL: agua }
        });
        cur.mortalidad = mort;
        cur.descarte = desc;
        cur.alimRealKg = alim;
        cur.tempC = temp;
        cur.aguaL = agua;
        if (obs !== '') cur.observacion = obs;
        generatedEvents.push({
          type: 'DAILY_LOG',
          sourceChannel: 'excel_hydration',
          payload: { dia: d, mortalidad: mort, descarte: desc, alimRealKg: alim, tempC: temp, aguaL: agua, observacion: obs }
        });
      }
    }

    // Pesajes semanales
    if (wsPes) {
      for (let i = 0; i < 8; i++) {
        const r = 6 + i;
        const dia = readNum(wsPes, `A${r}`);
        const muestra = readNum(wsPes, `C${r}`);
        const pesoKg = readNum(wsPes, `D${r}`);
        if (!dia) continue;
        const curP = nextState.pesajesSemanalesLote1.find((x) => x.dia === dia);
        if (curP && (muestra !== curP.muestraAves || pesoKg !== curP.pesoMuestraKg)) {
          diffs.push({ field: `pesajesSemanales.dia${dia}`, before: curP.pesoMuestraKg, after: pesoKg });
          if (muestra !== null) curP.muestraAves = muestra;
          curP.pesoMuestraKg = pesoKg;
          generatedEvents.push({
            type: 'SAMPLE_WEIGHING',
            sourceChannel: 'excel_hydration',
            payload: { dia, muestraAves: curP.muestraAves, pesoMuestraKg: pesoKg }
          });
        }
      }
    }

    if (diffs.some((d) => !d.field.startsWith('bitacoraDiaria') && !d.field.startsWith('pesajes') && !d.field.startsWith('bodega'))) {
      generatedEvents.push({
        type: 'PARAM_UPDATE',
        sourceChannel: 'excel_hydration',
        payload: {
          preciosRegionales: nextState.preciosRegionales,
          parametrosGenerales: nextState.parametrosGenerales,
          lotes: nextState.lotes
        }
      });
    }
  } else if (kind === 'CONSUMO_POLLO') {
    const wsCP = wb.getWorksheet('Consumo Pollo');
    const aves = readNum(wsCP, 'H2');
    collectNumericDiffs(diffs, 'lote1.avesIniciadas', nextState.lotes[0].avesIniciadas, aves, (v) => {
      nextState.lotes[0].avesIniciadas = v;
    });
  }

  nextState.updatedAt = new Date().toISOString();

  // Cálculo del Diff Causal Financiero completo
  const beforeComputed = TwinEngine.computeFullTwin(baseState);
  const afterComputed = TwinEngine.computeFullTwin(nextState);
  const financialImpact = {
    deltaUtilidadLote1Cop: afterComputed.av2.lotes[0].utilidadCanal - beforeComputed.av2.lotes[0].utilidadCanal,
    deltaUtilidad800ComercialCop: afterComputed.av1.comercial800.utilidadCanal - beforeComputed.av1.comercial800.utilidadCanal,
    deltaUtilidad3LotesCop: afterComputed.av2.consolidado3Lotes.utilidadCanal - beforeComputed.av2.consolidado3Lotes.utilidadCanal,
    deltaCapitalPicoSem7Cop: afterComputed.av2.tesoreriaResumen.capitalTrabajoPicoSem7 - beforeComputed.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
    deltaAnual12mCop: afterComputed.av1.anual12Meses.consolidado.utilidadCanal - beforeComputed.av1.anual12Meses.consolidado.utilidadCanal
  };

  return {
    ok: true,
    workbookKind: kind,
    changesCount: diffs.length,
    diffChanges: diffs,
    financialImpact,
    generatedEvents,
    nextState,
    beforeComputed,
    afterComputed
  };
}

module.exports = {
  CANONICAL_AV1_PATH,
  CANONICAL_AV2_PATH,
  compileTwinToWorkbooks,
  hydrateTwinFromWorkbook,
  detectWorkbookKind,
  sanitizeXlsxBufferForExcelJS
};
