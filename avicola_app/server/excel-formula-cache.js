'use strict';

const fs = require('fs');
const JSZip = require('jszip');
const FormulaParser = require('fast-formula-parser');

function colIndexToLetter(col) {
  let c = Number(col);
  let s = '';
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - m) / 26);
  }
  return s;
}

function unwrapArg(x) {
  return x && typeof x === 'object' && 'value' in x ? x.value : x;
}

function flattenArg(arg) {
  const v = unwrapArg(arg);
  if (!Array.isArray(v)) return [v];
  const out = [];
  for (const r of v) {
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return out;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Evalúa todas las fórmulas de un Workbook cargado en ExcelJS y retorna sus valores exactos.
 */
function evaluateWorkbookFormulas(wb) {
  const cache = new Map();
  const sheetMap = new Map();
  wb.eachSheet((ws) => sheetMap.set(ws.name, ws));

  const readCell = ({ sheet, row, col }) => {
    const ws = sheetMap.get(sheet);
    if (!ws) return '';
    const key = `${sheet}!${row}:${col}`;
    if (cache.has(key)) return cache.get(key);
    const cell = ws.getRow(row).getCell(col);
    let v = cell.value;
    if (v && typeof v === 'object') {
      if (v instanceof Date) {
        v = Math.round(v.getTime() / 86400000 + 25569);
      } else if ('formula' in v) {
        cache.set(key, 0);
        const parser = new FormulaParser({
          functions: customFns,
          onCell: readCell,
          onRange: (ref) => {
            const out = [];
            for (let r = ref.from.row; r <= ref.to.row; r++) {
              const rowArr = [];
              for (let c = ref.from.col; c <= ref.to.col; c++) {
                rowArr.push(readCell({ sheet: ref.sheet, row: r, col: c }));
              }
              out.push(rowArr);
            }
            return out;
          }
        });
        v = parser.parse(v.formula, { sheet, row, col });
        if (v instanceof Date) v = Math.round(v.getTime() / 86400000 + 25569);
      } else if ('richText' in v && Array.isArray(v.richText)) {
        v = v.richText.map((t) => t.text).join('');
      }
    }
    if (v === null || v === undefined) v = '';
    cache.set(key, v);
    return v;
  };

  const customFns = {
    MIN: (...args) => {
      const n = args
        .flatMap(flattenArg)
        .filter((x) => x !== '' && x !== null && x !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      return n.length ? Math.min(...n) : 0;
    },
    MAX: (...args) => {
      const n = args
        .flatMap(flattenArg)
        .filter((x) => x !== '' && x !== null && x !== undefined)
        .map(Number)
        .filter(Number.isFinite);
      return n.length ? Math.max(...n) : 0;
    },
    MATCH: (lookupArg, rangeArg, matchTypeArg) => {
      const target = unwrapArg(lookupArg);
      const mt = matchTypeArg === undefined ? 1 : Number(unwrapArg(matchTypeArg));
      const arr = flattenArg(rangeArg);
      if (mt === 0) {
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] === target) return i + 1;
        }
      } else {
        let best = -1;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] <= target) best = i + 1;
        }
        if (best > 0) return best;
      }
      throw new Error('#N/A');
    },
    INDEX: (_context, rangeArg, rowArg, colArg) => {
      const rRef = rangeArg && rangeArg.ref ? rangeArg.ref : null;
      const rIdx = Math.max(1, Number(unwrapArg(rowArg) || 1));
      const cIdx = colArg === undefined ? 1 : Math.max(1, Number(unwrapArg(colArg) || 1));
      if (rRef) {
        return readCell({
          sheet: rRef.sheet,
          row: rRef.from.row + rIdx - 1,
          col: rRef.from.col + cIdx - 1
        });
      }
      const grid = unwrapArg(rangeArg);
      if (!Array.isArray(grid)) return grid;
      const row = Array.isArray(grid[rIdx - 1]) ? grid[rIdx - 1] : grid[0];
      return Array.isArray(row) ? (row[cIdx - 1] ?? 0) : (grid[rIdx - 1] ?? 0);
    },
    SUMIFS: (sumRangeArg, ...critPairs) => {
      const sumArr = flattenArg(sumRangeArg);
      const pairs = [];
      for (let i = 0; i < critPairs.length; i += 2) {
        pairs.push([flattenArg(critPairs[i]), unwrapArg(critPairs[i + 1])]);
      }
      let tot = 0;
      for (let idx = 0; idx < sumArr.length; idx++) {
        let ok = true;
        for (const [rArr, crit] of pairs) {
          const val = rArr[idx];
          if (typeof crit === 'string' && /^(<=|>=|<>|<|>|=)/.test(crit)) {
            const m = crit.match(/^(<=|>=|<>|<|>|=)(.*)$/);
            const op = m[1];
            const rhs = Number.isFinite(Number(m[2])) && m[2] !== '' ? Number(m[2]) : m[2];
            if (op === '<=' && !(val <= rhs)) ok = false;
            else if (op === '>=' && !(val >= rhs)) ok = false;
            else if (op === '<>' && !(val != rhs)) ok = false;
            else if (op === '<' && !(val < rhs)) ok = false;
            else if (op === '>' && !(val > rhs)) ok = false;
            else if (op === '=' && !(val == rhs)) ok = false;
          } else if (val !== crit) {
            ok = false;
          }
        }
        if (ok) tot += Number(sumArr[idx]) || 0;
      }
      return tot;
    }
  };

  let formulasEvaluated = 0;
  const formulaErrors = [];
  const valuesBySheet = {};

  wb.eachSheet((ws) => {
    valuesBySheet[ws.name] = {};
    ws.eachRow((row, r) => {
      row.eachCell((cell, c) => {
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) {
          const ref = `${colIndexToLetter(c)}${r}`;
          try {
            const res = readCell({ sheet: ws.name, row: r, col: c });
            if (typeof res === 'string' && /^#(REF!|DIV\/0!|NAME\?|VALUE!|N\/A|NUM!)/.test(res)) {
              formulaErrors.push(`${ws.name}!${ref}=${res}`);
            } else if (res && typeof res === 'object' && res._error) {
              formulaErrors.push(`${ws.name}!${ref}=${res._error}`);
            } else {
              formulasEvaluated++;
              valuesBySheet[ws.name][ref] = res;
            }
          } catch (err) {
            formulaErrors.push(`${ws.name}!${ref}=${err.message}`);
          }
        }
      });
    });
  });

  return { formulasEvaluated, formulaErrors, valuesBySheet };
}

function buildSheetPathMap(workbookXml, relsXml) {
  const relMap = {};
  const relTags = relsXml.match(/<Relationship\b[^>]*>/gi) || [];
  for (const tag of relTags) {
    const idM = tag.match(/\bId="([^"]+)"/i);
    const tgtM = tag.match(/\bTarget="([^"]+)"/i);
    if (idM && tgtM) {
      let target = tgtM[1].replace(/^\/+/, '');
      if (!target.startsWith('xl/')) target = `xl/${target}`;
      relMap[idM[1]] = target;
    }
  }
  const sheetMap = {};
  const sheetTags = workbookXml.match(/<sheet\b[^>]*>/gi) || [];
  for (const tag of sheetTags) {
    const nameM = tag.match(/\bname="([^"]+)"/i);
    const ridM = tag.match(/\br:id="([^"]+)"/i);
    if (nameM && ridM && relMap[ridM[1]]) {
      sheetMap[nameM[1]] = relMap[ridM[1]];
    }
  }
  return sheetMap;
}

/**
 * Inyecta los resultados calculados (<v>...</v>) directamente en el XML del archivo .xlsx
 * después de ExcelJS + openpyxl para que la Vista Protegida, previsualizadores y móviles
 * muestren el 100% de cifras, gráficos y formato condicional al instante.
 */
async function populateXlsxCachedValues(xlsxPath, ExcelJS, sanitizeBufferFn) {
  const rawBuf = fs.readFileSync(xlsxPath);
  const cleanBuf = sanitizeBufferFn ? await sanitizeBufferFn(rawBuf) : rawBuf;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(cleanBuf);

  const evalRes = evaluateWorkbookFormulas(wb);
  const zip = await JSZip.loadAsync(rawBuf);
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheetPaths = buildSheetPathMap(wbXml, relsXml);

  for (const [sheetName, sheetXmlPath] of Object.entries(sheetPaths)) {
    const sheetVals = evalRes.valuesBySheet[sheetName];
    if (!sheetVals || !zip.file(sheetXmlPath)) continue;
    const xml = await zip.file(sheetXmlPath).async('string');

    const updated = xml.replace(
      /<c\b[^>]*\/>|<c\b([^>]*\br="([A-Z]+\d+)"[^>]*)>([\s\S]*?)<\/c>/g,
      (full, attrs, ref, inner) => {
        if (!attrs || !ref || !(ref in sheetVals) || !/<f\b/.test(inner)) return full;
        const val = sheetVals[ref];
        let nextAttrs = attrs.replace(/\s+t="[^"]*"/g, '');
        let vTag = '';
        if (typeof val === 'number' && Number.isFinite(val)) {
          vTag = `<v>${val}</v>`;
        } else if (typeof val === 'boolean') {
          nextAttrs += ' t="b"';
          vTag = `<v>${val ? 1 : 0}</v>`;
        } else if (val !== null && val !== undefined) {
          nextAttrs += ' t="str"';
          vTag = `<v>${escapeXml(val)}</v>`;
        } else {
          return full;
        }
        const strippedInner = inner.replace(/<v\b[^>]*>[\s\S]*?<\/v>|<v\b[^>]*\/>/g, '');
        return `<c${nextAttrs}>${strippedInner}${vTag}</c>`;
      }
    );

    if (updated !== xml) zip.file(sheetXmlPath, updated);
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const tmpOut = `${xlsxPath}.cachetmp-${process.pid}.xlsx`;
  fs.writeFileSync(tmpOut, outBuf);
  fs.renameSync(tmpOut, xlsxPath);
  return evalRes;
}

module.exports = {
  evaluateWorkbookFormulas,
  populateXlsxCachedValues
};
