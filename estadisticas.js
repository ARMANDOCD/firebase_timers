// estadisticas.js (versión que lee la tabla #registroTable directamente)
// Reemplaza tu archivo anterior por este. No requiere Firebase ni window.registroProcesado.

async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(s);
  });
}

/* ---------- util ---------- */
const pad2 = n => String(n).padStart(2, "0");
function secsToHHMMSS(secs) {
  secs = Number(secs) || 0;
  if (isNaN(secs) || secs <= 0) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function isoToDateKey(iso) {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return null; }
}
function localStr(iso) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }
function escapeHtml(s) { if (s === null || s === undefined) return ""; return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

/* ---------- PARSEADOR de las celdas de la tabla ---------- */
/*
  Espera fila con columnas:
  0: Día
  1: Cronómetro (nombre)
  2: Acción (tipo)
  3: Marca (hh:mm:ss) - puede estar vacío
  4: Fecha y hora (string local, p.ej "15/11/2025, 2:42:37 a. m.")
  5: Objetivo (min) - puede estar vacío
  6: Creado (fecha) - opcional
*/
function parseTimeStringHMS(hms) {
  if (!hms) return null;
  // formato "hh:mm:ss" o "mm:ss"
  const parts = String(hms).trim().split(":").map(x => Number(x));
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return null;
}

// particular: parsear fechas locales como "15/11/2025, 2:42:37 a. m." (es-PE / es-ES style)
function parseLocalDateString(s) {
  if (!s) return null;
  s = String(s).trim();

  // quick try: Date.parse
  const tryNative = new Date(s);
  if (!isNaN(tryNative.getTime())) return tryNative;

  // Normalizar a formato manejable:
  // Reemplazar "a. m." / "p. m." por AM/PM
  const s2 = s.replace(/\ba\. m\.\b/gi, "AM").replace(/\bp\. m\.\b/gi, "PM").replace(/\bAM\b/gi,"AM").replace(/\bPM\b/gi,"PM");

  // Intentar detectar formato DD/MM/YYYY, HH:MM:SS AM
  const m = s2.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[,\s]+(\d{1,2}:\d{2}:\d{2})(?:\s*(AM|PM))?/i);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]) - 1, year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    let time = m[4];
    const ampm = m[5];
    let [hh, mm, ss] = time.split(":").map(x=>Number(x));
    if (ampm) {
      if (ampm.toUpperCase() === "PM" && hh < 12) hh += 12;
      if (ampm.toUpperCase() === "AM" && hh === 12) hh = 0;
    }
    return new Date(year, month, day, hh, mm, ss);
  }

  // fallback: try replacing comma and swapping to ISO-ish
  const m2 = s2.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  const timeMatch = s2.match(/(\d{1,2}:\d{2}:\d{2})/);
  if (m2 && timeMatch) {
    const day = Number(m2[1]), month = Number(m2[2]) - 1, year = Number(m2[3]) < 100 ? 2000 + Number(m2[3]) : Number(m2[3]);
    const [hh,mm,ss] = timeMatch[1].split(":").map(x=>Number(x));
    return new Date(year, month, day, hh, mm, ss);
  }

  // última oportunidad: Date.parse on modified string
  const try2 = new Date(s2);
  if (!isNaN(try2.getTime())) return try2;

  return null;
}

/* ---------- construir registro a partir de la tabla ---------- */
function buildRegistroFromTable() {
  const tbody = document.querySelector("#registroTable tbody");
  if (!tbody) return null;
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const eventos = [];

  rows.forEach(tr => {
    const tds = Array.from(tr.querySelectorAll("td"));
    if (tds.length < 5) return;

    const diaText = tds[0].textContent.trim();
    const nombre = tds[1].textContent.trim();
    const tipo = tds[2].textContent.trim();
    const marcaText = tds[3].textContent.trim();
    const fechaText = tds[4].textContent.trim();
    const objetivoText = tds[5] ? tds[5].textContent.trim() : "";
    const creadoText = tds[6] ? tds[6].textContent.trim() : "";

    const ts = parseLocalDateString(fechaText);
    const tsIso = ts ? ts.toISOString() : null;
    const marcaSec = parseTimeStringHMS(marcaText);

    eventos.push({
      diaCell: diaText === "" ? null : diaText,
      nombre,
      tipo,
      marcaSec,
      timestamp: tsIso,
      objetivoMin: (objetivoText && !isNaN(Number(objetivoText))) ? Number(objetivoText) : null,
      creado: creadoText || null,
      rawRowText: [diaText, nombre, tipo, marcaText, fechaText, objetivoText, creadoText].join(" | ")
    });
  });

  eventos.sort((a,b) => {
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(a.timestamp) - new Date(b.timestamp);
  });

  // Detectar días
  const inicios = eventos.filter(e => e.tipo === "dia_iniciado");
  const finales = eventos.filter(e => e.tipo === "dia_finalizado");
  const dias = [];
  const usedFinalIdx = new Set();
  inicios.forEach((ini) => {
    const iniTs = ini.timestamp ? new Date(ini.timestamp) : null;
    let matchedFinal = null;
    for (let j = 0; j < finales.length; j++) {
      if (usedFinalIdx.has(j)) continue;
      const f = finales[j];
      const fTs = f.timestamp ? new Date(f.timestamp) : null;
      if (iniTs && fTs && fTs >= iniTs) { matchedFinal = { event: f, index: j }; usedFinalIdx.add(j); break; }
    }
    dias.push({
      dia: dias.length + 1,
      inicio: ini.timestamp || null,
      fin: matchedFinal ? matchedFinal.event.timestamp : null,
      rawInicio: ini,
      rawFin: matchedFinal ? matchedFinal.event : null
    });
  });

  // timersMeta por nombre (tomado de timer_creado). NOTE: si quieres identificar por createdAt, se adapta.
  const timersMeta = {};
  eventos.forEach(ev => {
    if (ev.tipo === "timer_creado") {
      const key = ev.nombre || ("timer_" + Math.random().toString(36).slice(2,8));
      if (!timersMeta[key]) timersMeta[key] = { name: key, target: ev.objetivoMin || null, createdAt: ev.timestamp || null };
      else { timersMeta[key].target = ev.objetivoMin || timersMeta[key].target; if (ev.timestamp) timersMeta[key].createdAt = ev.timestamp; }
    }
  });

  // retornamos tanto 'reg' como 'eventos' para que computeMetrics pueda aplicar la regla de "última marca por cronómetro"
  return {
    dias,
    sessions: [], // se sigue manteniendo por compatibilidad (si quieres usar sesiones las recreamos)
    timersMeta,
    eventos
  };
}


/* ---------- METRICS (basado en tu anterior) ---------- */
function computeMetrics(reg) {
  // reg must contain: dias[], sessions[] (opcional), timersMeta{}, eventos[]
  const { dias, sessions, timersMeta, eventos } = reg;

  // Rápidos baselines
  // NOTA: totalAccumulatedSec será recalculado con la nueva regla: suma de últimas marcas por timer en cada día
  const perDia = {};
  dias.forEach(d => {
    perDia[d.dia] = { dia: d.dia, inicio: d.inicio, fin: d.fin || null, dateKeys: d.dateKeys || [], totalSec: 0, sessions: [], objetivosMinTotal: 0, objetivoSecTotal: 0, tiempoRestanteSec: 0, exitoso: false };
  });
  if (!perDia["sin_dia"]) perDia["sin_dia"] = { dia: null, totalSec: 0, sessions: [], objetivosMinTotal: 0, dateKeys: [], objetivoSecTotal: 0, tiempoRestanteSec: 0, exitoso: false };

  // Preindexar eventos por día y por nombre
  // Para cada día, obtener eventos cuyo timestamp esté dentro del intervalo [inicio..fin] (o >= inicio si no hay fin)
  function eventsForDay(d) {
    const sTs = d.inicio ? new Date(d.inicio).getTime() : null;
    const eTs = d.fin ? new Date(d.fin).getTime() : null;
    return eventos.filter(ev => {
      if (!ev.timestamp) return false;
      const t = new Date(ev.timestamp).getTime();
      if (sTs && eTs) return t >= sTs && t <= eTs;
      if (sTs && !eTs) return t >= sTs;
      return false;
    });
  }

  // Para cada día:
  dias.forEach(d => {
    const evs = eventsForDay(d);
    // identificar todos los cronómetros "pertenecientes" al día:
    // definimos "perteneciente" como: existe un evento timer_creado con ese nombre dentro de evs
    const createdInDay = evs.filter(x => x.tipo === "timer_creado");
    const timersInDay = new Set(createdInDay.map(x => x.nombre));

    // Si no hay none creado, aún podríamos tener timers iniciados ese día con creación previa:
    // incluir también nombres que aparecen en eventos del día aunque no se hayan creado en el día
    evs.forEach(x => { if (x.nombre) timersInDay.add(x.nombre); });

    // Para cada timer en timersInDay, buscamos la ÚLTIMA marca dentro del día (última fila con marcaSec no nula)
    let dayTotalSec = 0;
    timersInDay.forEach(timerName => {
      // filtrar eventos del día para ese timer
      const evTimer = evs.filter(x => x.nombre === timerName);
      // ordenar por timestamp asc y tomar la última que tenga marcaSec != null
      evTimer.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
      let lastMarca = null;
      for (let i = evTimer.length - 1; i >= 0; i--) {
        if (evTimer[i].marcaSec !== null && evTimer[i].marcaSec !== undefined) { lastMarca = evTimer[i].marcaSec; break; }
      }
      if (lastMarca === null) lastMarca = 0; // si nunca se inició / no hay marca -> 0
      dayTotalSec += Number(lastMarca || 0);
    });

    perDia[d.dia].totalSec = dayTotalSec;

    // objetivos: sumar objetivos de TODOS los cronómetros que existen en el día
    // definimos "existen en el día" como aquellos con evento timer_creado dentro del día (si no hay creados, intentar buscar createdAt global en timersMeta)
    let objetivoMinSum = 0;
    // tomar createdInDay target
    createdInDay.forEach(c => { if (c.objetivoMin) objetivoMinSum += Number(c.objetivoMin); });
    // si createdInDay vacío, intentar sumar objetivos de timersMeta que tengan createdAt dentro del día
    if (createdInDay.length === 0) {
      Object.entries(timersMeta || {}).forEach(([k,meta]) => {
        if (!meta.createdAt) return;
        const ca = new Date(meta.createdAt).getTime();
        const sTs = d.inicio ? new Date(d.inicio).getTime() : null;
        const eTs = d.fin ? new Date(d.fin).getTime() : null;
        if (sTs && eTs) {
          if (ca >= sTs && ca <= eTs) { if (meta.target) objetivoMinSum += Number(meta.target); }
        } else if (sTs && !eTs) {
          if (ca >= sTs) { if (meta.target) objetivoMinSum += Number(meta.target); }
        }
      });
    }

    perDia[d.dia].objetivosMinTotal = objetivoMinSum;
    perDia[d.dia].objetivoSecTotal = Math.round(objetivoMinSum * 60);
    perDia[d.dia].tiempoRestanteSec = Math.max(0, perDia[d.dia].objetivoSecTotal - perDia[d.dia].totalSec);
    perDia[d.dia].exitoso = perDia[d.dia].objetivoSecTotal > 0 ? (perDia[d.dia].totalSec >= perDia[d.dia].objetivoSecTotal) : false;
  });

  // perDate (calendar): sumar totalSec de todas las marcas de sesiones o usar perDia.dateKeys mapping
  // Construiremos perDate basándonos en sesiones (si hay) o bien a partir de perDia dateKeys
  const perDate = {};
  // recorrer cada día y mapear sus dateKeys a totalSec
  dias.forEach(d => {
    const keys = d.dateKeys && d.dateKeys.length ? d.dateKeys : [ isoToDateKey(d.inicio) ];
    keys.forEach(k => {
      if (!perDate[k]) perDate[k] = { dateKey: k, totalSec: 0, sessions: [] };
      perDate[k].totalSec += perDia[d.dia].totalSec;
    });
  });

  // Objetivos por fecha (sumar objetivos de los días que mapearon a esa fecha)
  const perDateObjetivos = {};
  Object.keys(perDate).forEach(dk => perDateObjetivos[dk] = 0);
  dias.forEach(d => {
    const keys = d.dateKeys && d.dateKeys.length ? d.dateKeys : [ isoToDateKey(d.inicio) ];
    keys.forEach(k => {
      perDateObjetivos[k] = (perDateObjetivos[k] || 0) + (perDia[d.dia].objetivosMinTotal || 0);
    });
  });

  // totales globales
  const totalAccumulatedSec = Object.values(perDia).reduce((s, p) => s + (Number(p.totalSec) || 0), 0);
  const numDias = dias.length;
  const uniqueDates = new Set(Object.keys(perDate).filter(Boolean));
  const numFechas = uniqueDates.size;

  // racha y dias exitosos (por fecha calendario)
  const dateKeysSorted = Object.keys(perDate).sort();
  let maxRacha = 0, curRacha = 0;
  dateKeysSorted.forEach(k => {
    const objetivoMin = perDateObjetivos[k] || 0;
    const isEx = objetivoMin > 0 ? (perDate[k].totalSec >= Math.round(objetivoMin * 60)) : false;
    if (isEx) { curRacha++; maxRacha = Math.max(maxRacha, curRacha); } else { curRacha = 0; }
  });

  const diasExitososCount = Object.values(perDia).filter(d => (d.dia !== null) && d.objetivoSecTotal && d.totalSec >= d.objetivoSecTotal).length;

  // media por sesión (si quieres cambiar la definición, indícamelo)
  const allSessionsCount = 0;
  const mediaPorSesion = 0;

  return {
    totalAccumulatedSec,
    numDias,
    numFechas,
    perDia,
    perDate,
    perDateObjetivos,
    mediaPorSesion,
    diasExitososCount,
    maxRacha,
    sessions, // preservamos
    timerTargets: timersMeta || {}
  };
}


/* ---------- UI builder (basado en tu UI existente) ---------- */
function buildBaseUI(root) {
  root.innerHTML = `
    <div id="stats-root" style="padding:12px;">
      <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:12px;">
        <div style="background:#fff;padding:12px;border-radius:8px;min-width:260px;box-shadow:0 8px 22px rgba(0,0,0,0.06);">
          <div style="font-weight:800; margin-bottom:6px;">Estadísticas totales</div>
          <div id="totalAccum" style="font-size:1.05rem; margin-bottom:6px;">Tiempo total acumulado: --:--:--</div>
          <div id="totalDias" class="small">Número de días totales transcurridos: --</div>
          <div id="totalFechas" class="small">Número de fechas totales transcurridas: --</div>
        </div>

        <div style="background:#fff;padding:10px;border-radius:8px;min-width:340px;box-shadow:0 6px 18px rgba(0,0,0,0.04);">
          <div style="font-weight:700; margin-bottom:8px;">Filtros</div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <div style="flex:1">
              <div style="font-weight:600; margin-bottom:6px;">Día de trabajo</div>
              <div id="daysChecklist" style="max-height:140px; overflow:auto; border:1px solid #eee; padding:8px; border-radius:6px;"></div>
              <div style="margin-top:8px; display:flex; gap:6px;">
                <button id="selectAllDaysBtn">Seleccionar todo</button>
                <button id="clearDaysBtn">Limpiar</button>
              </div>
            </div>
            <div style="width:220px;">
              <div style="font-weight:600; margin-bottom:6px;">Fecha calendario</div>
              <div style="display:flex; gap:6px;">
                <input type="date" id="filterDateFrom" style="width:100px;">
                <input type="date" id="filterDateTo" style="width:100px;">
              </div>
              <div style="margin-top:8px; display:flex; gap:6px;">
                <button id="applyDateBtn">Aplicar</button>
                <button id="clearDateBtn">Limpiar</button>
              </div>
              <div style="margin-top:8px; display:flex; gap:6px;">
                <button id="todayBtn">Hoy</button>
                <button id="thisWeekBtn">Semana</button>
                <button id="thisMonthBtn">Mes</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 420px; gap:14px;">
        <div style="background:#fff;padding:12px;border-radius:8px; box-shadow:0 8px 22px rgba(0,0,0,0.04);">
          <h3 style="margin:6px 0;">Historial y estadísticas por día</h3>
          <div id="tableByDay"></div>

          <h3 style="margin:10px 0 6px 0;">Historial y estadísticas por fecha</h3>
          <div id="tableByDate"></div>
        </div>

        <div style="background:#fff;padding:12px;border-radius:8px; box-shadow:0 8px 22px rgba(0,0,0,0.04);">
          <h3 style="margin:6px 0;">Gráficos</h3>
          <div style="height:220px;"><canvas id="chartTimePerDay" style="width:100%; height:100%;"></canvas></div>
          <div style="height:220px; margin-top:12px;"><canvas id="chartRacha" style="width:100%; height:100%;"></canvas></div>
          <div style="margin-top:12px;"><canvas id="chartByActivity" style="width:100%; height:160px;"></canvas></div>

          <div style="margin-top:10px;">
            <div><b>Media por sesión:</b> <span id="mediaSesionText">--</span></div>
            <div><b>Días exitosos (tot):</b> <span id="diasExitososText">--</span></div>
            <div><b>Máxima racha:</b> <span id="maxRachaText">--</span></div>
          </div>

          <div style="margin-top:12px;"><button id="exportCsvBtn">Exportar CSV (filtro actual)</button></div>
        </div>
      </div>
    </div>
  `;
}

/* ---------- helpers UI (copiadas/adaptadas) ---------- */
function buildDaysChecklist(dias) {
  const container = document.getElementById("daysChecklist");
  container.innerHTML = "";
  (dias || []).slice().sort((a,b)=>a.dia - b.dia).forEach(d => {
    const id = `dchk_${d.dia}`;
    const row = document.createElement("div");
    row.style.display="flex"; row.style.alignItems="center"; row.style.gap="8px"; row.style.marginBottom="6px";
    const chk = document.createElement("input"); chk.type="checkbox"; chk.id=id; chk.value=d.dia; chk.checked=true;
    chk.onchange = () => updateViews(); // updateViews se define luego por closure
    const lbl = document.createElement("label"); lbl.htmlFor = id; lbl.innerHTML = `Día ${d.dia} — ${localStr(d.inicio)} → ${d.fin?localStr(d.fin):"(en curso)"}`;
    row.appendChild(chk); row.appendChild(lbl); container.appendChild(row);
  });

  const selectAll = document.getElementById("selectAllDaysBtn");
  const clearAll = document.getElementById("clearDaysBtn");
  if (selectAll) selectAll.onclick = () => { Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i=>i.checked=true); updateViews(); };
  if (clearAll) clearAll.onclick = () => { Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i=>i.checked=false); updateViews(); };
}

function getSelectedDays() {
  return Array.from(document.querySelectorAll("#daysChecklist input[type=checkbox]:checked")).map(i=>Number(i.value));
}

function getDateRange() {
  const f = document.getElementById("filterDateFrom").value;
  const t = document.getElementById("filterDateTo").value;
  if (!f && !t) return null;
  const from = f ? new Date(f + "T00:00:00") : null;
  const to = t ? new Date(t + "T23:59:59") : null;
  return { from, to };
}

/* ---------- charts (usamos Chart.js) ---------- */
let chartTimePerDay = null;
let chartRacha = null;
let chartByActivity = null;

async function renderCharts(metrics, registro, sessionsFiltered) {
  await ensureChartJs();
  const Chart = window.Chart;

  const selDays = new Set(getSelectedDays());
  const labels = []; const data = [];
  (registro.dias || []).slice().sort((a,b)=>a.dia - b.dia).forEach(d=>{
    if (selDays.size && !selDays.has(d.dia)) return;
    const pd = metrics.perDia[d.dia] || { totalSec:0 };
    const dr = getDateRange();
    if (dr && dr.from && dr.to) {
      const intersects = (d.dateKeys || []).some(k => {
        const dd = new Date(k + "T00:00:00");
        return dd >= dr.from && dd <= dr.to;
      });
      if (!intersects) return;
    }
    labels.push(`D${d.dia}`); data.push(Math.round((pd.totalSec||0)/60));
  });

  if (chartTimePerDay) chartTimePerDay.destroy();
  const ctx1 = document.getElementById("chartTimePerDay").getContext("2d");
  chartTimePerDay = new Chart(ctx1, {
    type: "bar",
    data: { labels, datasets: [{ label: "Minutos por día", data }] },
    options: { maintainAspectRatio:false, responsive:true }
  });

  // Racha (línea)
  const perDate = metrics.perDate || {};
  const dateKeys = Object.keys(metrics.perDate || {}).sort();
  const rachaLabels = [], rachaData = [];
  dateKeys.forEach(k => {
    rachaLabels.push(k);
    const objetivoMin = (metrics.perDateObjetivos && metrics.perDateObjetivos[k]) || 0;
    const isEx = objetivoMin > 0 ? ((metrics.perDate && metrics.perDate[k] && metrics.perDate[k].totalSec >= Math.round(objetivoMin*60)) ? 1 : 0) : 0;
    rachaData.push(isEx);
  });

  if (chartRacha) chartRacha.destroy();
  const ctx2 = document.getElementById("chartRacha").getContext("2d");
  chartRacha = new Chart(ctx2, {
    type: "line",
    data: { labels: rachaLabels, datasets: [{ label: "Fechas exitosas (1=éxito)", data: rachaData, fill:false, tension:0.2 }] },
    options: { maintainAspectRatio:false, responsive:true, scales: { y: { ticks: { stepSize: 1 }, min: 0, max: 1 } } }
  });

  // By activity (pie/doughnut)
  const perAct = {};
  (sessionsFiltered || []).forEach(s => {
    const name = s.name || s.timerId || "sin_nombre";
    perAct[name] = (perAct[name] || 0) + (Number(s.durationSec) || 0);
  });
  const actLabels = Object.keys(perAct);
  const actData = actLabels.map(l => Math.round(perAct[l]/60));
  if (chartByActivity) chartByActivity.destroy();
  const ctx3 = document.getElementById("chartByActivity").getContext("2d");
  chartByActivity = new Chart(ctx3, {
    type: "doughnut",
    data: { labels: actLabels, datasets: [{ data: actData }] },
    options: { maintainAspectRatio:false, responsive:true }
  });
}

/* ---------- CSV export ---------- */
function exportCsvFiltered(registro) {
  const selDays = new Set(getSelectedDays().map(x => Number(x)));
  const dr = getDateRange();
  const rows = [];
  rows.push(["Día","Cronómetro","Inicio","Fin","Duración(s)","Duración(HH:MM:SS)","Fecha clave","Objetivo(min)"]);
  (registro.sessions || []).forEach(s => {
    if (selDays.size && (s.dia === null || !selDays.has(Number(s.dia)))) return;
    if (dr && dr.from && dr.to) {
      const dd = new Date((s.dateKey || isoToDateKey(s.startTs)) + "T00:00:00");
      if (dd < dr.from || dd > dr.to) return;
    }
    rows.push([ s.dia === null ? "" : s.dia, s.name || s.timerId || "", localStr(s.startTs), localStr(s.endTs), s.durationSec || 0, secsToHHMMSS(s.durationSec || 0), s.dateKey || "", s.objetivoMin || "" ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `estadisticas_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"_")}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

/* ---------- render tables ---------- */
function renderTableByDay(registro, metrics, sessionsFiltered) {
  const wrap = document.getElementById("tableByDay");
  wrap.innerHTML = "";
  const table = document.createElement("table");
  table.style.width = "100%"; table.style.borderCollapse = "collapse";
  table.innerHTML = `<thead><tr style="background:#f5f5f5"><th style="padding:8px">Día</th><th style="padding:8px">Fechas</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo(min)</th><th style="padding:8px">Restante</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Éxito</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  (registro.dias || []).slice().sort((a,b)=>a.dia - b.dia).forEach(d => {
    const pd = metrics.perDia[d.dia] || { totalSec:0, sessions:[], objetivosMinTotal:0, tiempoRestanteSec:0, exitoso:false, dateKeys: d.dateKeys || [] };
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee">${d.dia}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${(d.dateKeys||[]).join(", ")}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${secsToHHMMSS(pd.totalSec||0)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${pd.objetivosMinTotal||0}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${secsToHHMMSS(pd.tiempoRestanteSec||0)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${(pd.sessions && pd.sessions.length) || 0}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${pd.exitoso ? "✅" : "—"}</td>`;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
}

function renderTableByDate(registro, metrics, sessionsFiltered) {
  const wrap = document.getElementById("tableByDate");
  wrap.innerHTML = "";
  const table = document.createElement("table");
  table.style.width = "100%"; table.style.borderCollapse = "collapse";
  table.innerHTML = `<thead><tr style="background:#f5f5f5"><th style="padding:8px">Fecha</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo(min)</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Top actividades</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  // aggregate by date from sessionsFiltered
  const map = {};
  (sessionsFiltered || []).forEach(s => {
    const k = s.dateKey || isoToDateKey(s.startTs);
    if(!map[k]) map[k] = { dateKey:k, totalSec:0, sessions:[] };
    map[k].totalSec += (Number(s.durationSec) || 0);
    map[k].sessions.push(s);
  });

  const dates = Object.keys(map).sort();
  dates.forEach(dk => {
    const pd = map[dk];
    // compute objective for this calendar date
    const timersSeen = new Set();
    pd.sessions.forEach(s => { if (s.timerId) timersSeen.add(s.timerId); });
    let objMin = 0;
    timersSeen.forEach(tid => {
      if (registro.timersMeta && registro.timersMeta[tid] && registro.timersMeta[tid].target) objMin += Number(registro.timersMeta[tid].target);
      else {
        const f = pd.sessions.find(x => x.timerId === tid && x.objetivoMin);
        if (f && f.objetivoMin) objMin += Number(f.objetivoMin);
      }
    });

    const perAct = {};
    pd.sessions.forEach(s => { const n = s.name || s.timerId || "sin_nombre"; perAct[n] = (perAct[n]||0) + (Number(s.durationSec)||0); });
    const topActs = Object.entries(perAct).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>`${x[0]} (${secsToHHMMSS(x[1])})`).join(", ");

    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee">${dk}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${secsToHHMMSS(pd.totalSec)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${objMin}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${pd.sessions.length}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(topActs)}</td>`;
    tbody.appendChild(tr);
  });

  wrap.appendChild(table);
}

/* ---------- función principal exportada ---------- */
export async function renderStatsGeneral() {
  await ensureChartJs();
  const root = document.getElementById("statsGeneralEmbed");
  if (!root) { console.error("No existe #statsGeneralEmbed"); return; }

  // Construir UI base
  buildBaseUI(root);

  // Extraer registro desde la tabla
  const registro = buildRegistroFromTable();
  if (!registro) {
    root.innerHTML = `<div style="padding:12px; background:#fff; border-radius:8px;">No encontré la tabla de registro. Abre la sección "Registro de eventos" y pulsa "Refrescar ahora" para poblarla.</div>`;
    return;
  }

  // Normalizar y calcular métricas
  const metrics = computeMetrics(registro);

  // rellenar resumen
  document.getElementById("totalAccum").textContent = `Tiempo total acumulado: ${secsToHHMMSS(metrics.totalAccumulatedSec)}`;
  document.getElementById("totalDias").textContent = `Número de días totales transcurridos: ${metrics.numDias}`;
  document.getElementById("totalFechas").textContent = `Número de fechas totales transcurridas: ${metrics.numFechas}`;
  document.getElementById("mediaSesionText").textContent = secsToHHMMSS(metrics.mediaPorSesion);
  document.getElementById("diasExitososText").textContent = metrics.diasExitososCount;
  document.getElementById("maxRachaText").textContent = metrics.maxRacha;

  // build checklist
  buildDaysChecklist(registro.dias || []);

  // set date inputs default range
  const dateKeys = Object.keys(metrics.perDate || {}).sort();
  if (dateKeys.length) {
    document.getElementById("filterDateFrom").value = dateKeys[0];
    document.getElementById("filterDateTo").value = dateKeys[dateKeys.length - 1];
  } else {
    const t = new Date().toISOString().slice(0,10);
    document.getElementById("filterDateFrom").value = t;
    document.getElementById("filterDateTo").value = t;
  }

  // wire buttons
  document.getElementById("applyDateBtn").onclick = () => updateViews();
  document.getElementById("clearDateBtn").onclick = () => { document.getElementById("filterDateFrom").value=""; document.getElementById("filterDateTo").value=""; updateViews(); };
  document.getElementById("todayBtn").onclick = () => { const t = new Date().toISOString().slice(0,10); document.getElementById("filterDateFrom").value=t; document.getElementById("filterDateTo").value=t; updateViews(); };
  document.getElementById("thisWeekBtn").onclick = () => {
    const now = new Date(); const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff)); const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    document.getElementById("filterDateFrom").value = monday.toISOString().slice(0,10);
    document.getElementById("filterDateTo").value = sunday.toISOString().slice(0,10);
    updateViews();
  };
  document.getElementById("thisMonthBtn").onclick = () => {
    const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
    document.getElementById("filterDateFrom").value = first.toISOString().slice(0,10);
    document.getElementById("filterDateTo").value = last.toISOString().slice(0,10);
    updateViews();
  };

  document.getElementById("exportCsvBtn").onclick = () => exportCsvFiltered(registro);

  // initial draw
  updateViews();

  /* closure helpers */
  function getSelectedDaySet(){ return new Set(getSelectedDays().map(x=>Number(x))); }

  function updateViews(){
    const selDays = getSelectedDaySet();
    const dr = getDateRange();
    const sessionsFiltered = (registro.sessions || []).filter(s => {
      const okDay = (selDays.size === 0) ? true : (s.dia !== null && selDays.has(Number(s.dia)));
      const okDate = (() => {
        if(!dr) return true;
        const d = new Date((s.dateKey || isoToDateKey(s.startTs)) + "T00:00:00");
        if(dr.from && d < dr.from) return false;
        if(dr.to && d > dr.to) return false;
        return true;
      })();
      return okDay && okDate;
    });

    // update filtered metrics summary
    const totalSecFiltered = sessionsFiltered.reduce((a,b)=>a + (Number(b.durationSec)||0), 0);
    const sessionsCount = sessionsFiltered.length;
    const avgPerSession = sessionsCount ? Math.round(totalSecFiltered / sessionsCount) : 0;
    document.getElementById("mediaSesionText").textContent = secsToHHMMSS(avgPerSession);

    // dias exitosos filtrados
    const diasExitososFiltrados = Object.values(metrics.perDia).filter(d => {
      if (d.dia === null) return false;
      if (selDays.size && !selDays.has(Number(d.dia))) return false;
      if (dr && dr.from && dr.to) {
        const intersect = (d.dateKeys || []).some(k => { const dd = new Date(k + "T00:00:00"); return dd >= dr.from && dd <= dr.to; });
        if (!intersect) return false;
      }
      return (d.objetivoSecTotal && d.totalSec >= d.objetivoSecTotal);
    }).length;
    document.getElementById("diasExitososText").textContent = diasExitososFiltrados;

    // tables
    renderTableByDay(registro, metrics, sessionsFiltered);
    renderTableByDate(registro, metrics, sessionsFiltered);

    // charts
    renderCharts(metrics, registro, sessionsFiltered);
  }
}














