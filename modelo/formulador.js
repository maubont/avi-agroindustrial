// Formulador de mínimo costo + generador del modelo de costeo en Excel (v2.0 Auditada y Retrocompatible)
// Uso CLI: cd modelo && node formulador.js
// Uso como módulo: const motor = require('./formulador'); (sin efectos secundarios ni process.exit)
'use strict';
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const motor = require('./motor_lp');

const loadJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', f), 'utf8'));

function ejecutarCLI() {
  const ING = loadJson('ingredientes.json');
  const REQ = loadJson('requerimientos.json');
  const ESC = loadJson('escenarios.json');
  const NEG = loadJson('negocio.json');

  const ING_A = loadJson('ingredientes_auditado.json');
  const REQ_A = loadJson('requerimientos_auditado.json');
  const ESC_A = loadJson('escenarios_auditado.json');
  const NEG_A = loadJson('negocio_auditado.json');

  const NUT = ING.nutrientes;
  const ings = ING.ingredientes;
  const datosLegacy = { nutrientes: NUT, ingredientes: ings, requerimientos: REQ, negocio: NEG };
  const datosAud = { nutrientes: ING_A.nutrientes, ingredientes: ING_A.ingredientes, requerimientos: REQ_A, negocio: NEG_A };

  const columnas = [];
  for (const d of REQ.dietas) columnas.push({ titulo: `${d.id} chat`, dieta: d, kg: ESC.formula_chat[d.id] || {} });
  for (const e of ESC.escenarios) {
    for (const d of REQ.dietas) {
      // Mantiene paridad histórica exacta con formulador original
      const res = motor.optimizarDieta(d, e, datosLegacy, {
        decimales: 2,
        ignorarMaxEtapa: true,
        permitirLegacy100: true,
        permitirFijoSobreMax: true,
        redondeoLegacy2Dec: true
      });
      if (!res.factible) {
        console.error(`NO FACTIBLE: ${d.id} / ${e.id} -> ${res.motivo}`);
        process.exit(1);
      }
      columnas.push({ titulo: `${d.id} ${e.id}`, dieta: d, kg: res.kg, esc: e });
    }
  }

  // Escenarios auditados reales (calculados con motor_lp sin bugs)
  const colAud = [];
  for (const e of ESC_A.escenarios) {
    const cad = motor.evaluarCadenaCompleta(datosAud, e, { restriccionesFisiologicas: true, monteCarloRuns: 1000 });
    const cadRob = motor.evaluarCadenaCompleta(datosAud, e, { restriccionesFisiologicas: true, chanceZ: 0.8, monteCarloRuns: 1000 });
    const sombraFpkcF2 = motor.calcularPrecioSombra('fpkc', REQ_A.dietas[1], e, datosAud, { restriccionesFisiologicas: true, maxInclusionKg: 100 });
    colAud.push({ esc: e, det: cad, rob: cadRob, sombraFpkcF2, penPct: datosAud.negocio.mercado.penalizacion_conversion_harina_pct });
  }
  const rlPath = path.join(__dirname, '..', 'simulacion_rl', 'ciclo_01', 'fase3_lideres', 'L09.json');
  if (fs.existsSync(rlPath)) {
    const { prepararPropuestaContexto } = require('./simulador_rl');
    const l09Prop = JSON.parse(fs.readFileSync(rlPath, 'utf8'));
    const escBase = ESC_A.escenarios.find((x) => x.id === 'audit_fitasa');
    const prep = prepararPropuestaContexto(l09Prop, { datos: datosAud, escenarioBase: escBase });
    if (prep.ok) {
      const escRl = { ...prep.esc, id: 'rl_optimo', nombre: l09Prop.titulo };
      const cad = motor.evaluarCadenaCompleta(prep.datos, escRl, { restriccionesFisiologicas: true, monteCarloRuns: 1000 });
      const cadRob = motor.evaluarCadenaCompleta(prep.datos, escRl, { restriccionesFisiologicas: true, chanceZ: 0.8, monteCarloRuns: 1000 });
      const dF2Rl = prep.datos.requerimientos.dietas.find((d) => d.id === 'F2');
      const sombraFpkcF2 = motor.calcularPrecioSombra('fpkc', dF2Rl, escRl, prep.datos, { restriccionesFisiologicas: true, maxInclusionKg: 100 });
      colAud.push({ esc: escRl, det: cad, rob: cadRob, sombraFpkcF2, penPct: prep.datos.negocio.mercado.penalizacion_conversion_harina_pct });
    }
  }

  // ---------------------------------------------------------------- Excel
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Planta de Concentrados - Ing. Mauricio Bonilla (v2.0)';
  wb.calcProperties.fullCalcOnLoad = true;
  const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  const AZUL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
  const GRIS = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
  const VERDE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  const col = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const titulo = (ws, t, sub) => {
    ws.getCell('A1').value = t;
    ws.getCell('A1').font = { bold: true, size: 14 };
    if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, color: { argb: 'FF7F7F7F' } }; }
  };
  const encabezado = (row) => row.eachCell((c) => { c.font = { bold: true }; c.fill = AZUL; c.alignment = { wrapText: true, vertical: 'middle' }; });
  const unlock = (cell) => { cell.protection = { locked: false }; };

  // --- Leeme
  {
    const ws = wb.addWorksheet('Leeme');
    ws.getColumn(1).width = 120;
    const L = [
      'MODELO DE COSTEO - CONCENTRADO PARA POLLO DE ENGORDE EN HARINA (CRECIMIENTO / FINALIZADOR)',
      '',
      'Celdas AMARILLAS = datos de entrada editables (hojas protegidas sin contraseña para evitar borrar fórmulas).',
      'Hojas: Ingredientes | Requerimientos | Formulas | Costo_pollo | Negocio | Auditoria_Realista.',
      '',
      'Novedades v2.0 (tras Auditoría Forense):',
      '- Selector de escenarios robusto vía INDEX/MATCH con lista desplegable en Costo_pollo!B4.',
      '- Guards IFERROR / IF contra división por cero y sincronización de capital de trabajo (meses inventario).',
      '- Nueva pestaña Auditoria_Realista: incluye Cl real de L-Lisina HCl (19,4%) y Colina (15,2%), tope de aceite en harina (3,5%/4,0%), Balance Electrolítico (DEB), relación Ca:Pd, IVA 5% y análisis Monte Carlo.',
    ];
    L.forEach((t, i) => { ws.getCell(i + 1, 1).value = t; });
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A3').fill = AMARILLO;
  }

  // --- Ingredientes
  const ING_R0 = 4;
  const ING_RN = ING_R0 + ings.length - 1;
  const nutCol = {};
  {
    const ws = wb.addWorksheet('Ingredientes', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }] });
    titulo(ws, 'Ingredientes: precio y matriz nutricional base (ver pestaña Auditoria_Realista para línea base calibrada)', ING._nota);
    const h = ['id', 'Ingrediente', 'Precio COP/kg puesto en planta', ...NUT.map((n) => `${n.nombre} (${n.unidad})`)];
    const hr = ws.getRow(3); hr.values = h; encabezado(hr); hr.height = 45;
    NUT.forEach((n, j) => { nutCol[n.id] = col(3 + j); });
    ings.forEach((ing, i) => {
      const r = ws.getRow(ING_R0 + i);
      r.values = [ing.id, ing.nombre, ing.precio, ...NUT.map((n) => (ing[n.id] === undefined ? 0 : ing[n.id]))];
      for (let c = 3; c <= 3 + NUT.length; c++) { r.getCell(c).fill = AMARILLO; unlock(r.getCell(c)); }
      r.getCell(3).numFmt = '#,##0';
    });
    ws.getColumn(1).width = 9; ws.getColumn(2).width = 36; ws.getColumn(3).width = 14;
    for (let c = 4; c <= 3 + NUT.length; c++) ws.getColumn(c).width = 11;
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  // --- Requerimientos
  const reqRow = {};
  {
    const ws = wb.addWorksheet('Requerimientos');
    titulo(ws, 'Requerimientos Ross 308 - Especificaciones de Nutrición 2022, Tabla 2 (mixtos 2,0-3,5 kg)', REQ._fuente);
    const hr = ws.getRow(3);
    hr.values = ['id', 'Nutriente', 'Unidad', ...REQ.dietas.flatMap((d) => [`${d.id} mín`, `${d.id} máx`])];
    encabezado(hr);
    NUT.forEach((n, i) => {
      const r = ws.getRow(4 + i); reqRow[n.id] = 4 + i;
      r.values = [n.id, n.nombre, n.unidad, ...REQ.dietas.flatMap((d) => [d.min[n.id] ?? null, (d.max || {})[n.id] ?? null])];
      for (let c = 4; c <= 3 + 2 * REQ.dietas.length; c++) { r.getCell(c).fill = AMARILLO; unlock(r.getCell(c)); }
    });
    ws.getColumn(2).width = 30;
    const nota = 4 + NUT.length + 1;
    ws.getCell(nota, 1).value = 'F1 = Ross "Crecimiento" (11-24 d), uso propuesto d21-28. F2 = Ross "Finalizador 1" (25-39 d), uso propuesto d29-sacrificio.';
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }
  const reqCol = (dietaIdx, tipo) => col(3 + dietaIdx * 2 + (tipo === 'max' ? 1 : 0));

  // --- Formulas
  const F_R0 = 5, F_RN = F_R0 + ings.length - 1;
  const FC0 = 2;
  const filas = {};
  {
    const ws = wb.addWorksheet('Formulas', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
    titulo(ws, 'Fórmulas (kg por tonelada) - nutrientes, cumplimiento y costo', 'Edite inclusiones (amarillo). Columnas "base"/"fitasa" = óptimo de mínimo costo calculado por motor_lp.js');
    const hr = ws.getRow(4); hr.values = ['id', 'Ingrediente', ...columnas.map((c) => c.titulo)]; encabezado(hr);
    ings.forEach((ing, i) => {
      const r = ws.getRow(F_R0 + i);
      r.values = [ing.id, ing.nombre, ...columnas.map((c) => c.kg[ing.id] || 0)];
      columnas.forEach((_, k) => {
        const cell = r.getCell(FC0 + 1 + k);
        cell.fill = AMARILLO;
        unlock(cell);
        cell.numFmt = (['fitasa', 'antiox', 'secuest', 'colina'].includes(ing.id)) ? '0.000' : '0.00';
      });
    });
    let r = F_RN + 1;
    const fila = (etq, fn, fmt, bold) => {
      const row = ws.getRow(r); row.getCell(2).value = etq; if (bold) row.getCell(2).font = { bold: true };
      columnas.forEach((c, k) => { const L = col(FC0 + k); const cell = row.getCell(FC0 + 1 + k); cell.value = { formula: fn(L, c, k) }; if (fmt) cell.numFmt = fmt; if (bold) cell.font = { bold: true }; });
      return r++;
    };
    filas.total = fila('TOTAL (debe ser 1.000)', (L) => `SUM(${L}${F_R0}:${L}${F_RN})`, '0.00', true);
    r++;
    filas.costo_t = fila('Costo materias primas COP/t', (L) => `SUMPRODUCT(${L}${F_R0}:${L}${F_RN},Ingredientes!$C$${ING_R0}:$C$${ING_RN})`, '#,##0', true);
    filas.costo_kg = fila('Costo materias primas COP/kg', (L) => `${L}${filas.costo_t}/1000`, '#,##0', true);
    filas.costo_b = fila('Costo materias primas por bulto 40 kg', (L) => `${L}${filas.costo_kg}*40`, '#,##0', true);
    r++;
    ws.getRow(r).getCell(2).value = 'NUTRIENTES CALCULADOS'; ws.getRow(r).getCell(2).font = { bold: true }; ws.getRow(r).getCell(2).fill = GRIS; r++;
    filas.nut = {};
    for (const n of NUT) filas.nut[n.id] = fila(`${n.nombre} (${n.unidad})`, (L) => `SUMPRODUCT(${L}$${F_R0}:${L}$${F_RN},Ingredientes!$${nutCol[n.id]}$${ING_R0}:$${nutCol[n.id]}$${ING_RN})/1000`, n.unidad === '%' ? '0.000' : '#,##0');
    fila('Relación Ca : P disponible', (L) => `IFERROR(${L}${filas.nut.Ca}/${L}${filas.nut.Pd},0)`, '0.00');
    fila('Balance electrolítico Na+K-Cl (mEq/kg)', (L) => `${L}${filas.nut.Na}*10000/23+${L}${filas.nut.K}*10000/39.1-${L}${filas.nut.Cl}*10000/35.45`, '0');
    fila('Aceite agregado (%)', (L) => `${L}${F_R0 + ings.findIndex((i) => i.id === 'aceite')}/10`, '0.00');
    r++;
    ws.getRow(r).getCell(2).value = '% DEL MÍNIMO ROSS (rojo < 98 %, amarillo 98-99,5 %)'; ws.getRow(r).getCell(2).font = { bold: true }; ws.getRow(r).getCell(2).fill = GRIS; r++;
    const pctIni = r;
    for (const n of NUT) {
      fila(`${n.id} % mínimo`, (L, c) => { const di = REQ.dietas.indexOf(c.dieta); const q = `Requerimientos!$${reqCol(di, 'min')}$${reqRow[n.id]}`; return `IF(${q}="","",${L}${filas.nut[n.id]}/${q})`; }, '0.0%');
    }
    const pctFin = r - 1;
    r++;
    ws.getRow(r).getCell(2).value = 'ESTADO vs mín/máx'; ws.getRow(r).getCell(2).font = { bold: true }; ws.getRow(r).getCell(2).fill = GRIS; r++;
    const estIni = r;
    for (const n of NUT) {
      fila(`${n.id} estado`, (L, c) => {
        const di = REQ.dietas.indexOf(c.dieta);
        const mn = `Requerimientos!$${reqCol(di, 'min')}$${reqRow[n.id]}`, mx = `Requerimientos!$${reqCol(di, 'max')}$${reqRow[n.id]}`, v = `${L}${filas.nut[n.id]}`;
        return `IF(AND(${mn}<>"",${v}<${mn}*0.995),"BAJO",IF(AND(${mx}<>"",${v}>${mx}*1.005),"ALTO","OK"))`;
      });
    }
    const estFin = r - 1;
    const rango = (a, b) => `${col(FC0)}${a}:${col(FC0 + columnas.length - 1)}${b}`;
    ws.addConditionalFormatting({ ref: rango(pctIni, pctFin), rules: [
      { type: 'cellIs', operator: 'lessThan', formulae: ['0.98'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } }, priority: 1 },
      { type: 'cellIs', operator: 'lessThan', formulae: ['0.995'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE699' } } }, priority: 2 },
    ] });
    ws.addConditionalFormatting({ ref: rango(estIni, estFin), rules: [
      { type: 'containsText', operator: 'containsText', text: 'BAJO', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8CBAD' } } }, priority: 3 },
      { type: 'containsText', operator: 'containsText', text: 'ALTO', style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE699' } } }, priority: 4 },
    ] });
    ws.getColumn(1).width = 9; ws.getColumn(2).width = 42;
    columnas.forEach((_, k) => { ws.getColumn(FC0 + 1 + k).width = 13; });
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  // --- Costo_pollo
  const P = {};
  const fUlt = col(FC0 + columnas.length - 1);
  {
    const ws = wb.addWorksheet('Costo_pollo');
    titulo(ws, 'Costo de alimento por pollo (d21 - sacrificio): harina propia vs. concentrado comercial', 'Selector dinámico INDEX/MATCH sin fallos silenciosos.');
    ws.getColumn(1).width = 60; ws.getColumn(2).width = 16; ws.getColumn(3).width = 52;
    let r = 4;
    const inp = (k, etq, v, fmt, nota) => {
      const row = ws.getRow(r); row.values = [etq, v, nota || ''];
      row.getCell(2).fill = AMARILLO; unlock(row.getCell(2));
      if (fmt) row.getCell(2).numFmt = fmt; P[k] = `Costo_pollo!$B$${r}`; r++;
    };
    const calc = (k, etq, f, fmt, bold, nota) => {
      const row = ws.getRow(r); row.getCell(1).value = etq; row.getCell(2).value = { formula: f };
      if (nota) row.getCell(3).value = nota;
      if (fmt) row.getCell(2).numFmt = fmt;
      if (bold) { row.getCell(1).font = { bold: true }; row.getCell(2).font = { bold: true }; }
      P[k] = `Costo_pollo!$B$${r}`; r++;
    };
    inp('esc', 'Escenario de fórmula a usar (base / fitasa / chat)', 'fitasa', null, 'Lista desplegable sincronizada con pestaña Formulas');
    const escIds = ['chat', ...ESC.escenarios.map((e) => e.id)];
    ws.getCell('B4').dataValidation = { type: 'list', allowBlank: false, formulae: [`"${escIds.join(',')}"`] };

    inp('aves', 'Aves por lote', NEG.pollo.aves_por_lote, '#,##0');
    inp('mort', 'Mortalidad d21-sacrificio (%)', NEG.pollo.mortalidad_pct_d21_42, '0.0', 'Aplica factor lineal promedio (1 - mort/200) sobre consumo del lote');
    inp('c1', 'Consumo F1 por ave (kg, d21-28) con alimento peletizado', NEG.pollo.consumo_F1_kg_ave, '0.00');
    inp('c2', 'Consumo F2 por ave (kg, d29-42) con alimento peletizado', NEG.pollo.consumo_F2_kg_ave, '0.00');
    inp('pen', 'Penalización de conversión por dar harina en vez de pellet (%)', NEG.mercado.penalizacion_conversion_harina_pct, '0.0');
    inp('pcom', 'Precio concentrado comercial, bulto 40 kg (COP)', NEG.mercado.precio_comercial_bulto40, '#,##0');
    inp('emp', 'Empaque variable propio (COP/kg)', NEG.costos_variables_cop_kg.empaque, '#,##0');
    inp('ene', 'Energía molienda y mezcla propia (COP/kg)', NEG.costos_variables_cop_kg.energia_molienda_mezcla, '#,##0');
    r++;
    const sel = (dieta) => `IFERROR(INDEX(Formulas!$C$${filas.costo_kg}:$${fUlt}$${filas.costo_kg},1,MATCH("${dieta} "&${P.esc},Formulas!$C$4:$${fUlt}$4,0)),NA())`;
    calc('mp1', 'Costo MP F1 (COP/kg)', sel('F1'), '#,##0');
    calc('mp2', 'Costo MP F2 (COP/kg)', sel('F2'), '#,##0');
    calc('k1', 'Costo F1 propio (COP/kg) = materias primas + empaque + energía', `${P.mp1}+${P.emp}+${P.ene}`, '#,##0');
    calc('k2', 'Costo F2 propio (COP/kg) = materias primas + empaque + energía', `${P.mp2}+${P.emp}+${P.ene}`, '#,##0');
    calc('kcom', 'Costo comercial (COP/kg)', `${P.pcom}/40`, '#,##0');
    calc('aveH', 'Costo alimento por ave - harina propia (COP)', `(${P.c1}*${P.k1}+${P.c2}*${P.k2})*(1+${P.pen}/100)`, '#,##0', true);
    calc('aveC', 'Costo alimento por ave - comercial peletizado (COP)', `(${P.c1}+${P.c2})*${P.kcom}`, '#,##0', true);
    calc('ah', 'Ahorro por ave en autoconsumo (COP)', `${P.aveC}-${P.aveH}`, '#,##0', true);
    calc('ahl', 'Ahorro por lote (COP)', `${P.ah}*${P.aves}*(1-${P.mort}/200)`, '#,##0', true);
    calc('tl', 'Toneladas de harina por lote (con penalización)', `(${P.c1}+${P.c2})*(1+${P.pen}/100)*${P.aves}*(1-${P.mort}/200)/1000`, '0.00');
    calc('pe', 'Penalización de conversión que anula el ahorro (%)', `IFERROR(((${P.c1}+${P.c2})*${P.kcom}/(${P.c1}*${P.k1}+${P.c2}*${P.k2})-1)*100,0)`, '0.0');
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  // --- Negocio
  {
    const ws = wb.addWorksheet('Negocio');
    titulo(ws, 'Modelo de negocio - venta a terceros: margen, punto de equilibrio y retorno', 'Celdas amarillas editables. Incluye protección contra división por cero.');
    ws.getColumn(1).width = 60; ws.getColumn(2).width = 18; ws.getColumn(3).width = 56;
    let r = 4; const N = {};
    const inp = (k, etq, v, fmt, nota) => {
      const row = ws.getRow(r); row.values = [etq, v, nota || ''];
      row.getCell(2).fill = AMARILLO; unlock(row.getCell(2));
      row.getCell(2).numFmt = fmt || '#,##0'; N[k] = `$B$${r}`; r++;
    };
    const calc = (k, etq, f, fmt, bold) => {
      const row = ws.getRow(r); row.getCell(1).value = etq; row.getCell(2).value = { formula: f };
      row.getCell(2).numFmt = fmt || '#,##0';
      if (bold) { row.getCell(1).font = { bold: true }; row.getCell(2).font = { bold: true }; }
      N[k] = `$B$${r}`; r++;
    };
    const sec = (t) => { ws.getRow(r).getCell(1).value = t; ws.getRow(r).getCell(1).font = { bold: true }; ws.getRow(r).getCell(1).fill = GRIS; r++; };
    sec('Precio y mezcla de producto');
    inp('pv', 'Precio de venta bulto 40 kg (COP, antes de IVA 5%)', NEG.mercado.precio_venta_bulto40, '#,##0', 'Debe quedar bajo el precio máximo competitivo');
    calc('pmax', 'Precio máximo competitivo = comercial / (1 + penalización)', `IFERROR(${P.pcom}/(1+${P.pen}/100),0)`, '#,##0');
    calc('mix1', 'Participación de F1 en el volumen', `IFERROR(${P.c1}/(${P.c1}+${P.c2}),0.25)`, '0.0%');
    calc('mp', 'Costo materias primas promedio (COP/kg)', `${N.mix1}*${P.mp1}+(1-${N.mix1})*${P.mp2}`, '#,##0');
    sec('Costos variables (COP/kg)');
    const cv = NEG.costos_variables_cop_kg;
    calc('emp', 'Empaque (enlazado desde Costo_pollo)', `${P.emp}`, '#,##0');
    calc('ene', 'Energía molienda y mezcla (enlazado desde Costo_pollo)', `${P.ene}`, '#,##0');
    inp('mer', 'Merma de materias primas (%)', cv.merma_pct_materias_primas, '0.0');
    inp('fle', 'Flete de distribución', cv.flete_distribucion);
    inp('com', 'Comisión / descuento comercial (% del precio)', cv.comision_ventas_pct, '0.0');
    calc('pvkg', 'Precio de venta (COP/kg)', `${N.pv}/40`);
    calc('cvkg', 'Costo variable total (COP/kg)', `${N.mp}*(1+${N.mer}/100)+${N.emp}+${N.ene}+${N.fle}+${N.pvkg}*${N.com}/100`, '#,##0', true);
    calc('mc', 'Margen de contribución (COP/kg)', `${N.pvkg}-${N.cvkg}`, '#,##0', true);
    calc('mcp', 'Margen de contribución (% del precio)', `IFERROR(${N.mc}/${N.pvkg},0)`, '0.0%');
    sec('Costos fijos mensuales (COP)');
    const fk = Object.keys(NEG.costos_fijos_mensuales); const f0 = r;
    for (const k of fk) inp('f_' + k, k.replace(/_/g, ' '), NEG.costos_fijos_mensuales[k]);
    sec('Inversión');
    const iv = NEG.inversion;
    inp('eq', 'Equipos fase 1 (sin IVA 19%)', iv.equipos_fase1, '#,##0', 'Cotizar');
    inp('adec', 'Adecuaciones locativas', iv.adecuaciones_locativas);
    inp('leg', 'Registro ICA, legal, licencias', iv.registro_y_legal);
    inp('vu', 'Vida útil equipos/adecuaciones (meses)', iv.vida_util_meses, '0');
    inp('ctm', 'Capital de trabajo (meses de inventario)', iv.capital_trabajo_meses_inventario, '0.0');
    calc('dep', 'Depreciación mensual', `IFERROR((${N.eq}+${N.adec})/${N.vu},0)`);
    calc('cf', 'COSTOS FIJOS TOTALES MENSUALES (incl. depreciación)', `SUM(B${f0}:B${f0 + fk.length - 1})+${N.dep}`, '#,##0', true);
    sec('Resultados');
    calc('pe', 'PUNTO DE EQUILIBRIO (toneladas / mes)', `IF(${N.mc}<=0,"No rentable",${N.cf}/(${N.mc}*1000))`, '0.0', true);
    calc('peb', 'Punto de equilibrio (bultos de 40 kg / mes)', `IF(ISNUMBER(${N.pe}),${N.pe}*25,"No rentable")`, '#,##0');
    calc('pel', 'Equivale a lotes/mes en granja', `IF(ISNUMBER(${N.pe}),IFERROR(${N.pe}/${P.tl},0),"No rentable")`, '0.0');
    calc('pea', 'Equivale a pollos / mes en etapa de engorde', `IF(ISNUMBER(${N.pel}),${N.pel}*${P.aves},"No rentable")`, '#,##0');
    r++;
    const hr = ws.getRow(r); hr.values = ['Volumen (t/mes)', 'Utilidad operativa mensual (COP)', 'Capital de trabajo aprox. (COP)']; encabezado(hr); r++;
    for (const v of [20, 50, 100, 150, 250, 400]) {
      const row = ws.getRow(r); row.getCell(1).value = v; row.getCell(1).fill = AMARILLO; unlock(row.getCell(1));
      row.getCell(2).value = { formula: `A${r}*1000*${N.mc}-${N.cf}` }; row.getCell(2).numFmt = '#,##0';
      row.getCell(3).value = { formula: `A${r}*1000*${N.cvkg}*${N.ctm}` }; row.getCell(3).numFmt = '#,##0';
      r++;
    }
    ws.addConditionalFormatting({ ref: `B${r - 6}:B${r - 1}`, rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'], style: { font: { color: { argb: 'FFC00000' } } }, priority: 1 }] });
    r++;
    calc('inv', 'Inversión total (equipos + adecuaciones + legal)', `${N.eq}+${N.adec}+${N.leg}`, '#,##0', true);
    inp('vref', 'Volumen de referencia para retorno (t/mes)', 150, '#,##0');
    calc('pay', 'Recuperación simple de la inversión (meses) al volumen de referencia', `IF(${N.vref}*1000*${N.mc}-${N.cf}<=0,"No recupera",(${N.inv}+${N.vref}*1000*${N.cvkg}*${N.ctm})/(${N.vref}*1000*${N.mc}-${N.cf}+${N.dep}))`, '0.0', true);
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  // --- Auditoria_Realista (Resumen calibrado post-auditoría forense, línea base para RL)
  {
    const ws = wb.addWorksheet('Auditoria_Realista');
    titulo(ws, 'Línea Base Auditada y Política Óptima RL (Ciclo 1)', 'Incluye Cl real de Lisina/Colina, DEB 220-260, Ca:Pd 1,75-2,10, FC máx, aceite 3,5/4,0%, IVA 5%/19% y Monte Carlo (N=1.000).');
    ws.getColumn(1).width = 48;
    for (let k = 0; k < colAud.length * 2; k++) ws.getColumn(2 + k).width = 18;
    const hr = ws.getRow(4);
    hr.values = ['Métrica Auditada (Motor motor_lp.js)', ...colAud.flatMap((c) => [`${c.esc.id} (Det.)`, `${c.esc.id} (Rob. z=0.8)`])];
    encabezado(hr);

    const rows = [
      ['Costo MP F1 (COP/kg)', (x) => x.factible ? Math.round(x.F1.costo_kg) : 'INFACTIBLE', '#,##0'],
      ['Costo MP F2 (COP/kg)', (x) => x.factible ? Math.round(x.F2.costo_kg) : 'INFACTIBLE', '#,##0'],
      ['Costo MP Ponderado d21-42 (COP/kg)', (x) => x.factible ? x.mp_ponderado_cop_kg : 'INFACTIBLE', '#,##0.0'],
      ['Costo Autoconsumo puesto planta (COP/kg)', (x) => x.factible ? x.costo_fab_autoconsumo_cop_kg : 'INFACTIBLE', '#,##0.0'],
      ['Costo Alimento por kg vivo ganado d21-42 (COP)', (x) => x.factible ? x.costo_kg_vivo_auto_cop : 'INFACTIBLE', '#,##0'],
      ['Ahorro real vs. pellet comercial $115k (%)', (x) => x.factible ? x.ahorro_pct_vs_comercial / 100 : 'INFACTIBLE', '0.0%'],
      ['Punto de Equilibrio terceros (t/mes)', (x) => x.factible ? x.punto_equilibrio_t_mes : 'INFACTIBLE', '0.0'],
      ['Inclusión FPKC en F1 / F2 (kg/t)', (x) => x.factible ? `${(x.F1.kg.fpkc || 0).toFixed(1)} / ${(x.F2.kg.fpkc || 0).toFixed(1)}` : 'INFACTIBLE', null],
      ['Cloro real F1 / F2 (%) [Máx Ross 0,230%]', (x) => x.factible ? `${x.F1.nutrientes.Cl.toFixed(3)} / ${x.F2.nutrientes.Cl.toFixed(3)}` : 'INFACTIBLE', null],
      ['DEB real F1 / F2 (mEq/kg) [Meta 220-260]', (x) => x.factible ? `${Math.round(x.F1.nutrientes.DEB)} / ${Math.round(x.F2.nutrientes.DEB)}` : 'INFACTIBLE', null],
      ['Cumplimiento conjunto >=98% Ross F1 (%)', (x) => x.factible && x.mc_F1 ? x.mc_F1.prob_cumplimiento_conjunto_pct / 100 : 'N/A', '0.0%'],
      ['Cumplimiento conjunto >=98% Ross F2 (%)', (x) => x.factible && x.mc_F2 ? x.mc_F2.prob_cumplimiento_conjunto_pct / 100 : 'N/A', '0.0%'],
      ['Costo Robusto J(x) F2 en Monte Carlo (COP/kg)', (x) => x.factible && x.mc_F2 ? x.mc_F2.costo_robusto_J_kg : 'N/A', '#,##0.0'],
      ['Precio máx. harina equivalente vs. Solla $93.400 (COP/bulto)', (x, c) => x.factible ? 93400 / (1 + c.penPct / 100) : 'INFACTIBLE', '#,##0'],
      ['Ahorro real vs. Solla Broiler I Dorado $93.400 (%)', (x, c) => x.factible ? 1 - (x.costo_fab_autoconsumo_cop_kg * (1 + c.penPct / 100)) / 2335 : 'INFACTIBLE', '0.0%']
    ];

    rows.forEach(([lbl, fn, fmt], idx) => {
      const r = ws.getRow(5 + idx);
      r.getCell(1).value = lbl;
      colAud.forEach((c, j) => {
        const c1 = r.getCell(2 + j * 2);
        const c2 = r.getCell(3 + j * 2);
        const v1 = fn(c.det, c);
        const v2 = fn(c.rob, c);
        c1.value = v1;
        c2.value = v2;
        if (fmt && typeof v1 === 'number') c1.numFmt = fmt;
        if (fmt && typeof v2 === 'number') c2.numFmt = fmt;
        if (idx === 2 || idx === 4) { c1.fill = VERDE; c2.fill = VERDE; c1.font = { bold: true }; c2.font = { bold: true }; }
      });
    });

    const rSom = ws.getRow(5 + rows.length + 1);
    rSom.getCell(1).value = 'Precio Sombra de entrada FPKC en F2 (COP/kg)';
    rSom.getCell(1).font = { bold: true };
    colAud.forEach((c, j) => {
      rSom.getCell(2 + j * 2).value = c.sombraFpkcF2.entra ? c.sombraFpkcF2.precio_umbral_cop_kg : 0;
      rSom.getCell(2 + j * 2).numFmt = '#,##0.0';
      rSom.getCell(2 + j * 2).fill = AMARILLO;
    });
    ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
  }

  const xlsx = path.join(__dirname, 'Modelo_Costeo_Concentrados.xlsx');
  wb.xlsx.writeFile(xlsx).then(() => {
    const nombres = Object.fromEntries(ings.map((i) => [i.id, i.nombre]));
    let md = `# Resultados de formulación (generado por formulador.js v2.0)\n\n> Matriz y precios de REFERENCIA (ver modelo/datos). Requerimientos: Ross 2022 Tabla 2. Generado: ${new Date().toISOString().slice(0, 10)}\n\n`;
    md += `| Ingrediente (kg/t) | ${columnas.map((c) => c.titulo).join(' | ')} |\n|---|${columnas.map(() => '---:').join('|')}|\n`;
    for (const i of ings) {
      if (columnas.every((c) => !c.kg[i.id])) continue;
      md += `| ${nombres[i.id]} | ${columnas.map((c) => (c.kg[i.id] || 0).toFixed(2)).join(' | ')} |\n`;
    }
    const nz = columnas.map((c) => motor.calcularNutrientes(c.kg, ings, NUT));
    md += `| **Costo materias primas COP/kg** | ${nz.map((n) => Math.round(n.costo_t / 1000).toLocaleString('es-CO')).join(' | ')} |\n\n`;
    md += `| Nutriente | ${columnas.map((c) => c.titulo).join(' | ')} |\n|---|${columnas.map(() => '---:').join('|')}|\n`;
    for (const n of NUT) {
      md += `| ${n.nombre} (${n.unidad}) | ${columnas.map((c, k) => {
        const v = nz[k][n.id];
        const mn = c.dieta.min[n.id];
        const s = n.unidad === '%' ? v.toFixed(3) : Math.round(v).toString();
        return mn && v < mn * 0.995 ? `**${s}** ⚠ (${Math.round((v / mn) * 1000) / 10}%)` : s;
      }).join(' | ')} |\n`;
    }
    fs.writeFileSync(path.join(__dirname, 'resultados_formulacion.md'), md);
    console.log('OK ->', xlsx);
    console.log('=== RESUMEN LÍNEA BASE AUDITADA ===');
    for (const c of colAud) {
      if (c.det.factible) {
        console.log(`[${c.esc.id}] Det: MP_pond=${c.det.mp_ponderado_cop_kg} $/kg | F1=${Math.round(c.det.F1.costo_kg)} | F2=${Math.round(c.det.F2.costo_kg)} | Vivo=${c.det.costo_kg_vivo_auto_cop} $/kg | PE=${c.det.punto_equilibrio_t_mes} t/m | MC_F2=${c.det.mc_F2.prob_cumplimiento_conjunto_pct}% | Sombra_FPKC_F2=${c.sombraFpkcF2.precio_umbral_cop_kg} $/kg`);
      } else {
        console.log(`[${c.esc.id}] Det: INFACTIBLE (${c.det.motivo}) | Sombra_FPKC_F2=${c.sombraFpkcF2.precio_umbral_cop_kg} $/kg`);
      }
      if (c.rob.factible) {
        console.log(`[${c.esc.id}] Rob(z=0.8): MP_pond=${c.rob.mp_ponderado_cop_kg} $/kg | F1=${Math.round(c.rob.F1.costo_kg)} | F2=${Math.round(c.rob.F2.costo_kg)} | Vivo=${c.rob.costo_kg_vivo_auto_cop} $/kg | J_F2=${c.rob.mc_F2.costo_robusto_J_kg} $/kg | MC_F2=${c.rob.mc_F2.prob_cumplimiento_conjunto_pct}%`);
      } else {
        console.log(`[${c.esc.id}] Rob(z=0.8): INFACTIBLE (${c.rob.motivo})`);
      }
    }
  });
}

if (require.main === module) {
  ejecutarCLI();
}

module.exports = { ...motor, loadJson };
