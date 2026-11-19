'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const TwinEngine = require('../shared/causal-twin-engine');
const { HybridTwinStore } = require('../server/state-store');
const {
  CANONICAL_AV1_PATH,
  CANONICAL_AV2_PATH,
  compileTwinToWorkbooks,
  hydrateTwinFromWorkbook,
  detectWorkbookKind,
  sanitizeXlsxBufferForExcelJS
} = require('../server/excel-transubstantiator');
const {
  SPEED_LEVELS,
  classifyAndRouteAction,
  AntigravityBridge
} = require('../server/antigravity-bridge');

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
      // intenta siguiente
    }
  }
  throw new Error('No se encontró ExcelJS para verificar AV-1/AV-2');
}

const ExcelJS = loadExcelJS();

function assertClose(actual, expected, tol = 1e-4, label = 'valor') {
  assert(
    Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tol,
    `Divergencia en ${label}: actual=${actual}, expected=${expected}, diff=${Math.abs(actual - expected)}`
  );
}

function runExcelComFormulaAudit(filePaths, tempDir) {
  const psScript = `
$ErrorActionPreference = 'Stop'
$files = @(${filePaths.map((p) => `'${p.replace(/'/g, "''")}'`).join(', ')})
$excel = $null
$results = @()

$filterCode = @'
using System;
using System.Runtime.InteropServices;

public class ComMessageFilter : IOleMessageFilter {
  private static int _retries = 0;
  public static void Register() {
    _retries = 0;
    IOleMessageFilter newFilter = new ComMessageFilter();
    IOleMessageFilter oldFilter = null;
    CoRegisterMessageFilter(newFilter, out oldFilter);
  }
  public static void Revoke() {
    IOleMessageFilter oldFilter = null;
    CoRegisterMessageFilter(null, out oldFilter);
  }
  int IOleMessageFilter.HandleInComingCall(int dwCallType, IntPtr hTaskCaller, int dwTickCount, IntPtr lpInterfaceInfo) {
    return 0;
  }
  int IOleMessageFilter.RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType) {
    if (dwRejectType == 2 && _retries < 25) {
      _retries++;
      return 250;
    }
    return -1;
  }
  int IOleMessageFilter.MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType) {
    return 2;
  }
  [DllImport("Ole32.dll")]
  private static extern int CoRegisterMessageFilter(IOleMessageFilter newFilter, out IOleMessageFilter oldFilter);
}

[ComImport(), Guid("00000016-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IOleMessageFilter {
  [PreserveSig] int HandleInComingCall(int dwCallType, IntPtr hTaskCaller, int dwTickCount, IntPtr lpInterfaceInfo);
  [PreserveSig] int RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType);
  [PreserveSig] int MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType);
}
'@
Add-Type -TypeDefinition $filterCode
[ComMessageFilter]::Register()

function Invoke-ComRetry([scriptblock]$Action, [int]$MaxAttempts = 25, [int]$DelayMs = 450) {
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    try {
      return (& $Action)
    } catch {
      $errText = ($_ | Out-String)
      if (($errText -match '0x80010001|0x800AC472|RPC_E_CALL_REJECTED') -and $i -lt $MaxAttempts) {
        Start-Sleep -Milliseconds $DelayMs
        continue
      }
      throw
    }
  }
}
try {
  $excel = New-Object -ComObject Excel.Application
  Start-Sleep -Milliseconds 600
  Invoke-ComRetry { $excel.Visible = $false }
  Invoke-ComRetry { $excel.DisplayAlerts = $false }
  Invoke-ComRetry { $excel.AskToUpdateLinks = $false }
  Invoke-ComRetry { $excel.AutomationSecurity = 3 }

  for ($w = 0; $w -lt 20; $w++) {
    try { if ($excel.Ready) { break } } catch {}
    Start-Sleep -Milliseconds 250
  }

  foreach ($filePath in $files) {
    $wb = $null
    try {
      $wb = Invoke-ComRetry { $excel.Workbooks.Open($filePath, 0, $true) }
      Start-Sleep -Milliseconds 300
      Invoke-ComRetry { $wb.ForceFullCalculation = $true }
      Invoke-ComRetry { $excel.CalculateFullRebuild() }
      for ($cWait = 0; $cWait -lt 40; $cWait++) {
        try { if ($excel.CalculationState -eq 0) { break } } catch {}
        Start-Sleep -Milliseconds 250
      }

      $formulaCells = 0
      $formulaErrors = 0
      $errorDetails = @()
      $sheetsChecked = @()

      foreach ($ws in $wb.Worksheets) {
        $sheetsChecked += $ws.Name
        $used = $ws.UsedRange
        if ($null -eq $used) { continue }
        $rows = $used.Rows.Count
        $cols = $used.Columns.Count
        $r0 = $used.Row
        $c0 = $used.Column
        $formulas = $used.Formula
        $vals = $used.Value2

        if ($rows -eq 1 -and $cols -eq 1) {
          $f = [string]$formulas
          $t = [string]$used.Text
          $isComErr = ($vals -is [int] -and $vals -le -2146826200 -and $vals -ge -2146826300)
          if ($f.StartsWith('=')) {
            $formulaCells++
            if ($isComErr -or ($t -match '^#(DIV/0!|N/A|NAME\\?|NULL!|NUM!|REF!|VALUE!|GETTING_DATA|SPILL!|CALC!)')) {
              $formulaErrors++
              $errorDetails += "$($ws.Name)!R$($r0)C$($c0)=$t"
            }
          }
        } else {
          for ($r = 1; $r -le $rows; $r++) {
            for ($c = 1; $c -le $cols; $c++) {
              $fObj = $formulas[$r, $c]
              if ($null -eq $fObj) { continue }
              $fStr = [string]$fObj
              if ($fStr.StartsWith('=')) {
                $formulaCells++
                $vObj = $vals[$r, $c]
                $isComErr = ($vObj -is [int] -and $vObj -le -2146826200 -and $vObj -ge -2146826300)
                if ($isComErr) {
                  $formulaErrors++
                  $addr = $ws.Cells.Item($r0 + $r - 1, $c0 + $c - 1).Address($false, $false)
                  $t = [string]$ws.Cells.Item($r0 + $r - 1, $c0 + $c - 1).Text
                  $errorDetails += "$($ws.Name)!$($addr)=$($t)"
                } else {
                  $cellText = [string]$ws.Cells.Item($r0 + $r - 1, $c0 + $c - 1).Text
                  if ($cellText -match '^#(DIV/0!|N/A|NAME\\?|NULL!|NUM!|REF!|VALUE!|GETTING_DATA|SPILL!|CALC!)') {
                    $formulaErrors++
                    $addr = $ws.Cells.Item($r0 + $r - 1, $c0 + $c - 1).Address($false, $false)
                    $errorDetails += "$($ws.Name)!$($addr)=$($cellText)"
                  }
                }
              }
            }
          }
        }
      }

      $sampleKpis = @{}
      $tab = $wb.Worksheets | Where-Object { $_.Name -eq '0_Tablero_Gerencial' } | Select-Object -First 1
      if ($null -ne $tab) {
        $sampleKpis['av2_utilidadLote1'] = [double]$tab.Range('B39').Value2
        $sampleKpis['av2_utilidad3Lotes'] = [double]$tab.Range('E39').Value2
        $sampleKpis['av2_capitalPicoSem7'] = [double]$tab.Range('E41').Value2
        $sampleKpis['av2_saldoFinalPost4m'] = [double]$tab.Range('E42').Value2
      }

      $rent = $wb.Worksheets | Where-Object { $_.Name -eq '2_Rentabilidad_por_Lote' } | Select-Object -First 1
      if ($null -ne $rent) {
        $sampleKpis['av1_pesoVivoComercial800'] = [double]$rent.Range('B23').Value2
        $sampleKpis['av1_costoCrianzaComercial800'] = [double]$rent.Range('B35').Value2
        $sampleKpis['av1_costoCrianzaPropio800'] = [double]$rent.Range('C35').Value2
      }

      $results += [PSCustomObject]@{
        file = $filePath
        sheetsCount = $sheetsChecked.Count
        formulaCells = $formulaCells
        formulaErrors = $formulaErrors
        errorDetails = $errorDetails
        sampleKpis = $sampleKpis
      }
    } finally {
      if ($null -ne $wb) {
        try { $wb.Close($false) } catch {}
        try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) } catch {}
      }
    }
  }
} finally {
  if ($null -ne $excel) {
    try {
      Start-Sleep -Milliseconds 150
      $excel.Quit()
    } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {}
  }
  [ComMessageFilter]::Revoke()
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
$results | ConvertTo-Json -Depth 6
`;

  const psFile = path.join(tempDir || os.tmpdir(), 'com_audit.ps1');
  fs.writeFileSync(psFile, psScript, 'utf8');

  const res = spawnSync(
    'powershell.exe',
    ['-Sta', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 35000 }
  );

  if (res.status !== 0) {
    throw new Error(`Fallo auditoría Excel COM (exit ${res.status}): ${res.stderr || res.stdout}`);
  }

  const parsed = JSON.parse(res.stdout.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function runPhase2Verification() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'avicola-phase2-'));
  const exportsDir = path.join(tempRoot, 'exports');
  const storeDir = path.join(tempRoot, 'store');
  const bridgeTempDir = path.join(tempRoot, 'bridge');

  try {
    console.log('=== VERIFICACION FASE 2: TRANSUSTANCIADOR EXCEL + BRIDGE 3 VELOCIDADES ===\n');

    // -----------------------------------------------------------------------
    // 1. Preparar estado modificado y compilar Twin -> .xlsx sin tocar canónicos
    // -----------------------------------------------------------------------
    const av1StatBefore = fs.statSync(CANONICAL_AV1_PATH);
    const av2StatBefore = fs.statSync(CANONICAL_AV2_PATH);

    const baseState = TwinEngine.createDefaultTwinState();
    const baseCompiled = await compileTwinToWorkbooks(baseState, {
      exportsDir,
      av1Filename: '_AV1_Base.xlsx',
      av2Filename: '_AV2_Base.xlsx',
      updateCanonical: false
    });

    let modState = TwinEngine.createDefaultTwinState();
    modState = TwinEngine.applyOperationalEvent(modState, {
      type: 'DAILY_LOG',
      payload: {
        dia: 1,
        mortalidad: 2,
        descarte: 0,
        alimRealKg: 7.2,
        tempC: 31.8,
        aguaL: 14.0,
        observacion: 'Día 1 ok'
      }
    });
    modState = TwinEngine.applyOperationalEvent(modState, {
      type: 'DAILY_LOG',
      payload: {
        dia: 2,
        mortalidad: 1,
        descarte: 0,
        alimRealKg: 8.6
      }
    });
    modState = TwinEngine.applyOperationalEvent(modState, {
      type: 'FEED_PURCHASE',
      payload: { fase: 'Nutrepollo Cr SP', bultos: 5 }
    });
    modState = TwinEngine.applyOperationalEvent(modState, {
      type: 'SAMPLE_WEIGHING',
      payload: { dia: 7, muestraAves: 30, pesoMuestraKg: 6.15 }
    });
    modState = TwinEngine.applyOperationalEvent(modState, {
      type: 'PARAM_UPDATE',
      payload: {
        preciosRegionales: { precioCanalKg: 12000 },
        parametrosGenerales: { areaGalponM2: 300 }
      }
    });

    const modCompiled = await compileTwinToWorkbooks(modState, {
      exportsDir,
      av1Filename: '_AV1_Test.xlsx',
      av2Filename: '_AV2_Test.xlsx',
      updateCanonical: false
    });

    assert.strictEqual(modCompiled.ok, true);
    assert(fs.existsSync(modCompiled.files.av1Path), 'Debe existir _AV1_Test.xlsx');
    assert(fs.existsSync(modCompiled.files.av2Path), 'Debe existir _AV2_Test.xlsx');

    const av1StatAfter = fs.statSync(CANONICAL_AV1_PATH);
    const av2StatAfter = fs.statSync(CANONICAL_AV2_PATH);
    assert.strictEqual(av1StatBefore.mtimeMs, av1StatAfter.mtimeMs, 'Canónico AV-1 no debe mutarse');
    assert.strictEqual(av2StatBefore.mtimeMs, av2StatAfter.mtimeMs, 'Canónico AV-2 no debe mutarse');

    console.log('[OK] Compilación Twin -> .xlsx sin mutar archivos canónicos.');

    // -----------------------------------------------------------------------
    // 2. Hidratación inversa (.xlsx -> Twin): cero falsos positivos + round-trip 0 pérdida
    // -----------------------------------------------------------------------
    const baseHydrateAv1 = await hydrateTwinFromWorkbook(
      baseCompiled.files.av1Path,
      TwinEngine.createDefaultTwinState()
    );
    assert.strictEqual(
      baseHydrateAv1.changesCount,
      0,
      `AV1 Base no debe producir diffs falsos: ${JSON.stringify(baseHydrateAv1.diffChanges)}`
    );

    const baseHydrateAv2 = await hydrateTwinFromWorkbook(
      baseCompiled.files.av2Path,
      TwinEngine.createDefaultTwinState()
    );
    assert.strictEqual(
      baseHydrateAv2.changesCount,
      0,
      `AV2 Base no debe producir diffs falsos: ${JSON.stringify(baseHydrateAv2.diffChanges)}`
    );
    console.log('[OK] Hidratación sobre plantilla base sin cambios reportó 0 diffs falsos.');

    const hydratedAv2 = await hydrateTwinFromWorkbook(
      modCompiled.files.av2Path,
      TwinEngine.createDefaultTwinState()
    );
    assert(hydratedAv2.changesCount > 0, 'Debe detectar cambios en _AV2_Test.xlsx');

    const d1 = hydratedAv2.nextState.bitacoraDiariaLote1[0];
    const d2 = hydratedAv2.nextState.bitacoraDiariaLote1[1];
    assert.strictEqual(d1.mortalidad, 2, 'Día 1 mortalidad debe ser 2');
    assertClose(d1.alimRealKg, 7.2, 1e-6, 'Día 1 alimento real');
    assertClose(d1.tempC, 31.8, 1e-6, 'Día 1 temperatura');
    assertClose(d1.aguaL, 14.0, 1e-6, 'Día 1 agua');
    assert.strictEqual(d1.observacion, 'Día 1 ok', 'Día 1 observación');
    assert.strictEqual(d2.mortalidad, 1, 'Día 2 mortalidad debe ser 1');
    assertClose(d2.alimRealKg, 8.6, 1e-6, 'Día 2 alimento real');

    assert.strictEqual(hydratedAv2.nextState.bodegaInicialLote1.nutrepolloBultos, 16, 'Nutrepollo bultos = 16');
    const pes7 = hydratedAv2.nextState.pesajesSemanalesLote1.find((p) => p.dia === 7);
    assertClose(pes7.pesoMuestraKg, 6.15, 1e-6, 'Pesaje día 7 kg');
    assert.strictEqual(hydratedAv2.nextState.preciosRegionales.precioCanalKg, 12000, 'precioCanalKg = 12000');
    assert.strictEqual(hydratedAv2.nextState.parametrosGenerales.areaGalponM2, 300, 'areaGalponM2 = 300');

    assert.strictEqual(
      hydratedAv2.afterComputed.av2.auditoriaBodegaLote1.faltantePpto.nutrepollo,
      0,
      'Faltante de Nutrepollo debe ser 0 al tener 16 bultos'
    );

    assert(hydratedAv2.financialImpact.deltaUtilidadLote1Cop > 0, 'Delta utilidad Lote 1 debe ser > 0');
    assert(hydratedAv2.financialImpact.deltaUtilidad3LotesCop > 0, 'Delta utilidad 3 Lotes debe ser > 0');

    // Reproducibilidad exacta vía HybridTwinStore aplicando generatedEvents
    const store = new HybridTwinStore({ dataDir: storeDir, supabaseUrl: '', supabaseKey: '' });
    await store.init();
    for (const evt of hydratedAv2.generatedEvents) {
      await store.appendEventAndApply(evt);
    }
    const storeSnap = store.getFullSnapshot();
    const expectedModComputed = TwinEngine.computeFullTwin(modState);

    assertClose(
      storeSnap.computed.av2.consolidado3Lotes.utilidadCanal,
      expectedModComputed.av2.consolidado3Lotes.utilidadCanal,
      1e-4,
      'Store vs TwinEngine Consolidado 3 Lotes'
    );
    assertClose(
      storeSnap.computed.av2.lotes[0].utilidadCanal,
      expectedModComputed.av2.lotes[0].utilidadCanal,
      1e-4,
      'Store vs TwinEngine Utilidad Lote 1'
    );
    assertClose(
      storeSnap.computed.av2.capacidadTermica.densidadPicoKgM2,
      expectedModComputed.av2.capacidadTermica.densidadPicoKgM2,
      1e-6,
      'Store vs TwinEngine Densidad Térmica'
    );

    // Edición directa en AV1 (D27 = precioCanalKg = 12500) e hidratación inversa
    const wb1Edit = new ExcelJS.Workbook();
    await wb1Edit.xlsx.load(await sanitizeXlsxBufferForExcelJS(modCompiled.files.av1Path));
    wb1Edit.getWorksheet('1_Precios_Mercado_Regional').getCell('D27').value = 12500;
    const av1EditedPath = path.join(exportsDir, '_AV1_Edited.xlsx');
    await wb1Edit.xlsx.writeFile(av1EditedPath);

    const hydratedAv1Edit = await hydrateTwinFromWorkbook(av1EditedPath, modState);
    assert.strictEqual(hydratedAv1Edit.workbookKind, 'AV1');
    assert.strictEqual(hydratedAv1Edit.nextState.preciosRegionales.precioCanalKg, 12500);
    assert(hydratedAv1Edit.financialImpact.deltaUtilidad800ComercialCop > 0, 'Delta AV1 comercial > 0');

    const wbCheckAv1 = new ExcelJS.Workbook();
    await wbCheckAv1.xlsx.readFile(CANONICAL_AV1_PATH);
    assert.strictEqual(detectWorkbookKind(wbCheckAv1), 'AV1');
    const wbCheckAv2 = new ExcelJS.Workbook();
    await wbCheckAv2.xlsx.readFile(CANONICAL_AV2_PATH);
    assert.strictEqual(detectWorkbookKind(wbCheckAv2), 'AV2');

    console.log(
      `[OK] Round-trip .xlsx -> Twin -> HybridTwinStore con 0 divergencia (delta Lote 1 = $${Math.round(hydratedAv2.financialImpact.deltaUtilidadLote1Cop).toLocaleString('es-CO')}).`
    );

    // -----------------------------------------------------------------------
    // 3. Auditoría en Excel COM real (FormulaErrors = 0 y recálculo en vivo)
    // -----------------------------------------------------------------------
    console.log('Ejecutando auditoría real en Microsoft Excel COM (AV-1 y AV-2 compilados)...');
    const comResults = runExcelComFormulaAudit([modCompiled.files.av1Path, modCompiled.files.av2Path], tempRoot);
    for (const r of comResults) {
      assert.strictEqual(
        r.formulaErrors,
        0,
        `Se detectaron errores de fórmula en ${path.basename(r.file)}: ${JSON.stringify(r.errorDetails)}`
      );
      console.log(
        `  [COM OK] ${path.basename(r.file)} | Hojas: ${r.sheetsCount} | Celdas fórmula: ${r.formulaCells} | FormulaErrors: ${r.formulaErrors}`
      );
    }

    // Contrasta valores recalculados por Excel COM contra TwinEngine en AV-1 y AV-2 compilados
    const comAv1 = comResults.find((x) => x.file === modCompiled.files.av1Path);
    const comAv2 = comResults.find((x) => x.file === modCompiled.files.av2Path);
    assert(comAv1 && comAv1.sampleKpis, 'Debe extraer KPIs recalculados de AV-1');
    assert(comAv2 && comAv2.sampleKpis, 'Debe extraer KPIs recalculados de AV-2');

    assertClose(
      comAv1.sampleKpis.av1_pesoVivoComercial800,
      expectedModComputed.av1.comercial800.pesoVivoTot,
      1e-3,
      'Excel COM AV-1 Peso Vivo Total 800'
    );
    assertClose(
      comAv1.sampleKpis.av1_costoCrianzaComercial800,
      expectedModComputed.av1.comercial800.costoVivoTot,
      1.0,
      'Excel COM AV-1 Costo Crianza Comercial 800'
    );
    assertClose(
      comAv1.sampleKpis.av1_costoCrianzaPropio800,
      expectedModComputed.av1.propio800.costoVivoTot,
      1.0,
      'Excel COM AV-1 Costo Crianza Propio 800'
    );

    assertClose(
      comAv2.sampleKpis.av2_utilidadLote1,
      expectedModComputed.av2.lotes[0].utilidadCanal,
      1.0,
      'Excel COM AV-2 Utilidad Lote 1'
    );
    assertClose(
      comAv2.sampleKpis.av2_utilidad3Lotes,
      expectedModComputed.av2.consolidado3Lotes.utilidadCanal,
      1.0,
      'Excel COM AV-2 Utilidad 3 Lotes'
    );
    assertClose(
      comAv2.sampleKpis.av2_capitalPicoSem7,
      expectedModComputed.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
      1.0,
      'Excel COM AV-2 Capital Pico Sem 7'
    );
    assertClose(
      comAv2.sampleKpis.av2_saldoFinalPost4m,
      expectedModComputed.av2.tesoreriaResumen.saldoFinalPost4m,
      1.0,
      'Excel COM AV-2 Saldo Final Post 4m'
    );
    console.log(
      `  [COM MATCH] AV-2 Utilidad 3 Lotes Excel=$${Math.round(comAv2.sampleKpis.av2_utilidad3Lotes).toLocaleString('es-CO')} === TwinEngine | Capital Pico=$${Math.round(comAv2.sampleKpis.av2_capitalPicoSem7).toLocaleString('es-CO')} === TwinEngine`
    );

    // -----------------------------------------------------------------------
    // 4. Bridge de 3 Velocidades y ciclo completo RFC en AntigravityBridge
    // -----------------------------------------------------------------------
    const rOp1 = classifyAndRouteAction({ eventType: 'DAILY_LOG' });
    const rOp2 = classifyAndRouteAction({ text: 'Hoy murieron 3 pollos por golpe de calor' });
    const rTac1 = classifyAndRouteAction({ eventType: 'PARAM_UPDATE' });
    const rTac2 = classifyAndRouteAction({ text: 'Simula qué pasa si subo el precio canal a 12500' });
    const rStr1 = classifyAndRouteAction({ text: 'Agrega una nueva columna de comisión bancaria al flujo semanal' });

    assert.strictEqual(rOp1.speed, SPEED_LEVELS.SPEED_1_OPERATIONAL);
    assert.strictEqual(rOp2.speed, SPEED_LEVELS.SPEED_1_OPERATIONAL);
    assert.strictEqual(rTac1.speed, SPEED_LEVELS.SPEED_2_TACTICAL);
    assert.strictEqual(rTac2.speed, SPEED_LEVELS.SPEED_2_TACTICAL);
    assert.strictEqual(rStr1.speed, SPEED_LEVELS.SPEED_3_STRUCTURAL_RFC);
    assert.strictEqual(rStr1.requiresHumanRfcApproval, true);
    console.log('[OK] Clasificador de 3 Velocidades enrutó Operación / Táctica / RFC Estructural.');

    const bridgeTest = new AntigravityBridge({
      bridgeDir: bridgeTempDir,
      supabaseUrl: '',
      supabaseKey: ''
    });
    const initRes = bridgeTest.init();
    assert.strictEqual(initRes.rfcsCount, 0);

    const rfc1 = await bridgeTest.createRfcProposal({
      titulo: 'Agregar columna de comisión bancaria al flujo semanal',
      descripcion: 'Incluir retención bancaria del 4x1000 en la semana de liquidación.',
      categoria: 'modelo_financiero',
      sourceChannel: 'telegram',
      proposedByRole: 'CFO-AI',
      archivosAfectados: ['avicola_app/shared/causal-twin-engine.js']
    });
    assert.strictEqual(rfc1.rfcCode, 'RFC-0001');
    assert.strictEqual(rfc1.estado, 'pendiente_aprobacion');
    assert(fs.existsSync(path.join(bridgeTempDir, 'rfcs', 'RFC-0001.json')));
    assert(fs.existsSync(path.join(bridgeTempDir, 'rfcs', 'RFC-0001.md')));

    const approved1 = await bridgeTest.approveRfc('RFC-0001', {
      approvedBy: 'Mauricio Bonilla',
      channel: 'telegram'
    });
    assert.strictEqual(approved1.estado, 'aprobado');
    let inboxText = fs.readFileSync(path.join(bridgeTempDir, 'ANTIGRAVITY_INBOX.md'), 'utf8');
    assert(inboxText.includes('RFC-0001') && inboxText.includes('Mauricio Bonilla'), 'Inbox debe listar RFC aprobado');

    const executed1 = await bridgeTest.markRfcExecuted('RFC-0001', {
      notes: 'Verificado con FormulaErrors=0'
    });
    assert.strictEqual(executed1.estado, 'ejecutado');

    const rfc2 = await bridgeTest.createRfcProposal({
      titulo: 'Cambio experimental de prueba',
      descripcion: 'Propuesta descartada para prueba de rechazo.',
      sourceChannel: 'web'
    });
    assert.strictEqual(rfc2.rfcCode, 'RFC-0002');
    const rejected2 = await bridgeTest.rejectRfc('RFC-0002', {
      rejectedBy: 'Mauricio Bonilla',
      reason: 'No requerido por ahora'
    });
    assert.strictEqual(rejected2.estado, 'rechazado');
    assert.strictEqual(bridgeTest.listRfcs().length, 2);

    console.log('[OK] Ciclo de vida RFC (create -> approve -> execute -> reject) e INBOX verificado.');

    // Inicializar bandeja limpia de producción en avicola_app/antigravity_bridge/
    const prodBridge = new AntigravityBridge();
    const prodInfo = prodBridge.init();
    console.log(
      `[OK] Bandeja de producción inicializada en ${prodInfo.bridgeDir} (RFCs existentes: ${prodInfo.rfcsCount}).`
    );

    console.log('\n=== FASE 2 VERIFICADA CON 0 ERRORES ===');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runPhase2Verification().catch((err) => {
  console.error('ERROR EN VERIFICACION FASE 2:', err);
  process.exit(1);
});
