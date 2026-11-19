// Generador del Modelo Financiero y de Balance de Masa para Plantas Extractoras de 2 y 4 t RFF/h
// Uso: node proyecto_extractora/generar_modelo_extractora.js
'use strict';
const path = require('path');
const ExcelJS = require('../modelo/node_modules/exceljs');

const wb = new ExcelJS.Workbook();
wb.creator = 'Proyecto Extractora Modular 2 y 4 t/h';
wb.calcProperties.fullCalcOnLoad = true;

const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const AZUL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const VERDE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const GRIS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };

const ws = wb.addWorksheet('Modelo_2_y_4_th', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
ws.getColumn(1).width = 56;
ws.getColumn(2).width = 18;
ws.getColumn(3).width = 20;
ws.getColumn(4).width = 20;
ws.getColumn(5).width = 48;

ws.getCell('A1').value = 'MODELO DE PRE-FACTIBILIDAD: BIORREFINERÍA DE PALMA (2 y 4 t RFF/h) + SUBPRODUCTOS + EQUITY';
ws.getCell('A1').font = { bold: true, size: 13 };
ws.getCell('A2').value = 'Celdas AMARILLAS = Supuestos editables. Todo lo demás se recalcula con fórmulas.';
ws.getCell('A2').fill = AMARILLO;

const h = ws.getRow(4);
h.values = ['Rubro / Parámetro', 'Parámetro Base / Unidad', 'Planta 2 t RFF/h', 'Planta 4 t RFF/h', 'Notas técnicas y de negocio'];
h.eachCell((c) => { c.font = { bold: true }; c.fill = AZUL; });

let r = 5;
const sec = (t) => { const row = ws.getRow(r++); row.getCell(1).value = t; row.getCell(1).font = { bold: true }; for (let i = 1; i <= 5; i++) row.getCell(i).fill = GRIS; };
const param = (etq, val, fmt, nota) => {
  const row = ws.getRow(r);
  row.values = [etq, val, null, null, nota || ''];
  row.getCell(2).fill = AMARILLO;
  if (fmt) row.getCell(2).numFmt = fmt;
  return r++;
};
const fila24 = (etq, fBase, f2, f4, fmt, nota, bold, verde) => {
  const row = ws.getRow(r);
  row.getCell(1).value = etq;
  if (fBase !== null) {
    if (typeof fBase === 'object') row.getCell(2).value = fBase;
    else { row.getCell(2).value = fBase; row.getCell(2).fill = AMARILLO; }
    if (fmt) row.getCell(2).numFmt = fmt;
  }
  row.getCell(3).value = typeof f2 === 'string' ? { formula: f2 } : f2;
  row.getCell(4).value = typeof f4 === 'string' ? { formula: f4 } : f4;
  if ( typeof f2 === 'number' ) row.getCell(3).fill = AMARILLO;
  if ( typeof f4 === 'number' ) row.getCell(4).fill = AMARILLO;
  if (fmt) { row.getCell(3).numFmt = fmt; row.getCell(4).numFmt = fmt; }
  row.getCell(5).value = nota || '';
  if (bold) for (let i = 1; i <= 4; i++) row.getCell(i).font = { bold: true };
  if (verde) for (let i = 1; i <= 4; i++) row.getCell(i).fill = VERDE;
  return r++;
};

sec('1. CAPACIDAD OPERATIVA Y ABASTECIMIENTO DE FRUTA (RFF)');
const rCap = fila24('Capacidad nominal (t RFF / hora)', null, 2, 4, '0.0', '1 línea de 2 t/h vs. 2 líneas de 2 t/h', true);
const rHoras = param('Horas efectivas de operación al mes', 350, '#,##0', 'Ej. 14 h/día x 25 días (sube a 450 h en pico)');
const rProdHa = param('Productividad promedio de palma en la zona (t RFF/ha/año)', 18, '0.0', 'Promedio nacional 16-22 t RFF/ha/año');
const rRffMes = fila24('Fruta procesada por mes (t RFF / mes)', null, `C${rCap}*B${rHoras}`, `D${rCap}*B${rHoras}`, '#,##0', '', true);
const rHa = fila24('Hectáreas de cultivo requeridas para abastecer la planta', null, `C${rRffMes}*12/B${rProdHa}`, `D${rRffMes}*12/B${rProdHa}`, '#,##0', 'Fincas del inversionista + proveedores cercanos');

sec('2. BALANCE DE MASA MENSUAL: ACEITES Y SUBPRODUCTOS VALORIZADOS');
const rOer = fila24('1. Aceite Crudo de Palma - CPO (t/mes)', 0.21, `C$${rRffMes}*B${r}`, `D$${rRffMes}*B${r}`, '0.0', 'Col B = % extracción (OER 21 %)');
ws.getRow(r - 1).getCell(2).numFmt = '0.0%';
const rPko = fila24('2. Aceite de Palmiste - PKO vía Expeller (t/mes)', 0.019, `C$${rRffMes}*B${r}`, `D$${rRffMes}*B${r}`, '0.0', 'Col B = % sobre RFF (~42 % de la almendra)');
ws.getRow(r - 1).getCell(2).numFmt = '0.0%';
const rFpkc = fila24('3. Palmiste + Lodo Tricanter POME Bio-Fermentado 27% PC (t/mes)', 0.04, `C$${rRffMes}*B${r}`, `D$${rRffMes}*B${r}`, '0.0', '2,7% torta + 1,3% sólidos POME fermentados con hongos');
ws.getRow(r - 1).getCell(2).numFmt = '0.0%';
const rCarb = fila24('4. Carbón de Cuesco / Biochar por pirólisis (t/mes)', 0.02, `C$${rRffMes}*B${r}`, `D$${rRffMes}*B${r}`, '0.0', '6% cuesco x 33% rendimiento pirólisis (fibra cubre caldera)');
ws.getRow(r - 1).getCell(2).numFmt = '0.0%';
const rAbono = fila24('5. Bioabono / Humus de Raquis + POME + Ceniza (t/mes)', 0.10, `C$${rRffMes}*B${r}`, `D$${rRffMes}*B${r}`, '0.0', '22% raquis compostado con fracción líquida POME y lombriz');
ws.getRow(r - 1).getCell(2).numFmt = '0.0%';

sec('3. PRECIOS DE VENTA EN PUERTA DE PLANTA E INGRESOS MENSUALES (COP)');
const rPCpo = fila24('Ingreso 1: Aceite Crudo de Palma - CPO (COP/mes)', 3800000, `C${rOer}*B${r}`, `D${rOer}*B${r}`, '#,##0', 'Col B = Precio COP/t de CPO');
const rPPko = fila24('Ingreso 2: Aceite de Palmiste - PKO (COP/mes)', 4600000, `C${rPko}*B${r}`, `D${rPko}*B${r}`, '#,##0', 'Col B = Precio COP/t de PKO');
const rPFpkc = fila24('Ingreso 3: Alimento Proteico Bio-Fermentado 27% PC (COP/mes)', 1650000, `C${rFpkc}*B${r}`, `D${rFpkc}*B${r}`, '#,##0', 'Col B = Precio COP/t ($66.000 bulto 40 kg)');
const rPCarb = fila24('Ingreso 4: Carbón de Cuesco / Biochar (COP/mes)', 1500000, `C${rCarb}*B${r}`, `D${rCarb}*B${r}`, '#,##0', 'Col B = Precio COP/t (sin activar; activado vale >$5,5M/t)');
const rPAbono = fila24('Ingreso 5: Bioabono / Humus Potásico (COP/mes)', 280000, `C${rAbono}*B${r}`, `D${rAbono}*B${r}`, '#,##0', 'Col B = Precio COP/t ($14.000 bulto 50 kg)');
const rIngSub = fila24('SUBTOTAL INGRESOS SOLO POR SUBPRODUCTOS (Líneas 3+4+5)', null, `SUM(C${rPFpkc}:C${rPAbono})`, `SUM(D${rPFpkc}:D${rPAbono})`, '#,##0', 'Dinero que una extractora tradicional pierde', true, true);
const rIngTot = fila24('INGRESOS BRUTOS TOTALES MENSUALES (COP/mes)', null, `SUM(C${rPCpo}:C${rPAbono})`, `SUM(D${rPCpo}:D${rPAbono})`, '#,##0', '', true);

sec('4. COSTOS DE FRUTA (RFF) Y OPERACIÓN MENSUAL (OPEX)');
const rPRff = fila24('Compra de Fruta Fresca - RFF puesta en planta (COP/mes)', 710000, `C${rRffMes}*B${r}`, `D${rRffMes}*B${r}`, '#,##0', 'Col B = Precio compra RFF (~17-18,5% del CPO + acopio)');
const rNom = fila24('Nómina operativa, técnica y administrativa (COP/mes)', null, 32000000, 46000000, '#,##0', 'Turnos extracción + módulo subproductos');
const rInoc = fila24('Insumos bio-fermentación (inóculo, sales, sacos) y laboratorio', 85000, `C${rFpkc}*B${r}`, `D${rFpkc}*B${r}`, '#,##0', 'Col B = COP por tonelada de FPKC producida');
const rMant = fila24('Mantenimiento, repuestos, seguros y energía de respaldo', null, 16000000, 26000000, '#,##0', 'La energía principal sale de la caldera y del biogás');
const rCostTot = fila24('COSTO Y GASTO OPERATIVO TOTAL MENSUAL (COP/mes)', null, `C${rPRff}+C${rNom}+C${rInoc}+C${rMant}`, `D${rPRff}+D${rNom}+D${rInoc}+D${rMant}`, '#,##0', '', true);

sec('5. FLUJO DE CAJA (EBITDA), CAPEX Y PARTICIPACIÓN DEL ESTRUCTURADOR (EQUITY)');
const rEbitda = fila24('EBITDA MENSUAL DE LA PLANTA (COP/mes)', null, `C${rIngTot}-C${rCostTot}`, `D${rIngTot}-D${rCostTot}`, '#,##0', 'Utilidad operativa de caja antes de impuestos', true, true);
const rEbitdaAnual = fila24('EBITDA ANUAL PROYECTADO (COP/año)', null, `C${rEbitda}*12`, `D${rEbitda}*12`, '#,##0', '', true);
const rCapex = fila24('CAPEX Total Estimado Llave en Mano (COP)', null, 3300000000, 5200000000, '#,##0', 'Extracción + Palmistería + FES + Carbón + Biogás + Obra civil', true);
const rPayback = fila24('Periodo de Recuperación de la Inversión - Payback (Años)', null, `C${rCapex}/C${rEbitdaAnual}`, `D${rCapex}/D${rEbitdaAnual}`, '0.00', 'CAPEX / EBITDA Anual', true);
const rPctEq = param('Tu Participación Accionaria como Socio Estructurador (%)', 0.15, '0.0%', 'Aporte de ingeniería, tecnología de subproductos y gestión');
const rDivMes = fila24('TU UTILIDAD / DIVIDENDO MENSUAL ESTIMADO (COP/mes)', null, `C${rEbitda}*B${rPctEq}`, `D${rEbitda}*B${rPctEq}`, '#,##0', 'Ingreso pasivo/activo como socio del proyecto', true, true);
const rDivAnual = fila24('TU UTILIDAD / DIVIDENDO ANUAL ESTIMADO (COP/año)', null, `C${rDivMes}*12`, `D${rDivMes}*12`, '#,##0', '', true, true);

const out = path.join(__dirname, 'Modelo_Extractora_2_y_4_th.xlsx');
wb.xlsx.writeFile(out).then(() => console.log('OK ->', out));
