// estadisticas.js
// Módulo: genera estadísticas generales a partir de usuarios/{uid}/historialEventos
// Exporta: renderStatsGeneral()

import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

// carga dinámica de Chart.js si no existe
async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ---------------- utilidades ---------------- */
function pad2(n){ return String(n).padStart(2,"0"); }
function secsToHHMMSS(secs){
  if(secs == null || isNaN(secs)) return "";
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function dateKey(ts){ // yyyy-mm-dd local
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}
function localStr(ts){
  try { return new Date(ts).toLocaleString(); } catch(e){ return ts; }
}
function clamp(n, min=0){ return Math.max(min, n); }

/* ---------------- lógica para construir días (pares) ----------------
  entrada: eventosArr (ordenados por timestamp asc)
  salida: dias = [{ dia:1, inicio: iso, fin: iso|null, rawInicio, rawFin }]
*/
function buildDiasFromEvents(eventosArr){
  const inicios = eventosArr.filter(e => e.tipo === "dia_iniciado");
  const finales = eventosArr.filter(e => e.tipo === "dia_finalizado");
  const dias = [];
  let finalIndex = 0;
  for(let i=0;i<inicios.length;i++){
    const inicio = inicios[i];
    let matchedFinal = null;
    for(let j=finalIndex;j<finales.length;j++){
      const f = finales[j];
      if(new Date(f.timestamp) >= new Date(inicio.timestamp)){
        matchedFinal = f;
        finalIndex = j + 1;
        break;
      }
    }
    dias.push({
      dia: dias.length + 1,
      inicio: inicio.timestamp,
      fin: matchedFinal ? matchedFinal.timestamp : null,
      rawInicio: inicio,
      rawFin: matchedFinal || null
    });
  }
  return dias;
}

/* ---------------- extraer sesiones (inicio-pausa) por cronómetro ----------------
 Input:
  eventosArr sorted asc
 Behavior:
  - Cuando vemos timer_iniciado -> marca un start para timerId (si ya había un start sin cierre lo ignora o lo reemplaza)
  - Cierres: timer_pausado, timer_reseteado, timer_completado, timer_borrado actúan como endpoint
  - Si no hay elapsed en eventos, calculamos por diferencia de timestamps
  - Devuelve lista de sesiones:
    { timerId, name, startTs, endTs, startElapsedSec, endElapsedSec, durationSec, dia (number|null), dateKey }
*/
function extractSessions(eventosArr, dias){
  // mapa timerId -> last open session (start)
  const open = {};
  const sessions = [];

  // helper to close open session
  const closeSession = (timerId, endEvent, closingType) => {
    const o = open[timerId];
    if(!o) return;
    const startTs = o.startTs;
    const startElapsed = o.startElapsed;
    const endTs = endEvent.timestamp;
    // end elapsed might be in event
    const endElapsed = (endEvent.elapsed !== undefined && endEvent.elapsed !== null) ? endEvent.elapsed
                      : (endEvent.elapsedAntes !== undefined && endEvent.elapsedAntes !== null) ? endEvent.elapsedAntes
                      : (endEvent.prevElapsed !== undefined && endEvent.prevElapsed !== null) ? endEvent.prevElapsed
                      : null;

    // duration prefer endElapsed - startElapsed if both present, else diff timestamps
    let durationSec = null;
    if(typeof startElapsed === "number" && typeof endElapsed === "number"){
      durationSec = clamp(Math.round(endElapsed - startElapsed), 0);
    } else {
      const diffMs = new Date(endTs) - new Date(startTs);
      durationSec = clamp(Math.round(diffMs/1000), 0);
    }

    // determine day number for this session
    let diaNum = null;
    for(const d of dias){
      const s = new Date(d.inicio);
      const e = d.fin ? new Date(d.fin) : null;
      const tStart = new Date(startTs);
      // we assign a session to the day if the start happens within the day's interval
      if(e){
        if(tStart >= s && tStart <= e){ diaNum = d.dia; break; }
      } else {
        if(tStart >= s){ diaNum = d.dia; break; }
      }
    }

    sessions.push({
      timerId,
      name: o.name || timerId,
      startTs,
      endTs,
      startElapsed,
      endElapsed,
      durationSec,
      dia: diaNum,
      dateKey: dateKey(startTs),
      closingType
    });

    delete open[timerId];
  };

  // Walk through events
  eventosArr.forEach(ev => {
    const tipo = ev.tipo;
    const timerId = ev.timerId || null;
    // normalize name if present
    const name = ev.name || (ev.timerId ? ev.timerId : null);

    if(tipo === "timer_iniciado" && timerId){
      // open a session
      open[timerId] = {
        startTs: ev.timestamp,
        startElapsed: (ev.elapsedAntes !== undefined && ev.elapsedAntes !== null) ? ev.elapsedAntes : null,
        name
      };
    } else if(timerId && (tipo === "timer_pausado" || tipo === "timer_reseteado" || tipo === "timer_completado" || tipo === "timer_borrado")){
      closeSession(timerId, ev, tipo);
    } else if(tipo === "timer_creado" && timerId){
      // metadata only; we don't act
    } else if(tipo === "timer_editado" && timerId){
      // do nothing for sessions
    }
    // other event types ignored
  });

  // If some open sessions remain (started but no pause), close them at "now"
  const nowIso = new Date().toISOString();
  Object.keys(open).forEach(timerId => {
    const fakeEndEvent = { timestamp: nowIso, elapsed: null };
    closeSession(timerId, fakeEndEvent, "open_closed_now");
  });

  return sessions;
}

/* ---------------- calcular métricas ----------------
 returns object with:
  totalAccumulatedSec, numDias, numFechas, perDia map, perDate map, averages, rachas, diasExitosos count, maxRacha, etc.
*/
function calculateMetrics(sessions, dias){
  // aggregate totals
  const totalAccumulatedSec = sessions.reduce((s,ss) => s + (ss.durationSec || 0), 0);

  // unique days (by dia number)
  const diasSet = new Set(sessions.map(s => s.dia).filter(v => v !== null));
  const numDias = diasSet.size;

  // unique dates (calendar)
  const fechasSet = new Set(sessions.map(s => s.dateKey));
  const numFechas = fechasSet.size;

  // per-day totals (by dia number)
  const perDia = {}; // dia -> { totalSec, sessions: [...] }
  sessions.forEach(s => {
    const k = s.dia === null ? "sin_dia" : `dia_${s.dia}`;
    if(!perDia[k]) perDia[k] = { key: k, dia: s.dia, totalSec:0, sessions:[], dateKeys: new Set() };
    perDia[k].totalSec += s.durationSec;
    perDia[k].sessions.push(s);
    perDia[k].dateKeys.add(s.dateKey);
  });
  // convert Set to Array
  Object.values(perDia).forEach(x => x.dateKeys = Array.from(x.dateKeys));

  // per-date totals (calendar date)
  const perDate = {}; // dateKey -> { totalSec, sessions: [...] }
  sessions.forEach(s => {
    const k = s.dateKey;
    if(!perDate[k]) perDate[k] = { key:k, totalSec:0, sessions:[] };
    perDate[k].totalSec += s.durationSec;
    perDate[k].sessions.push(s);
  });

  // media de tiempo para actividad cualquiera (media por sesión)
  const mediaPorSesion = sessions.length ? Math.round(totalAccumulatedSec / sessions.length) : 0;

  // media de tiempo por turno: (same as mediaPorSesion) but we compute average grouped by timerId as well
  const perTimerSessions = {};
  sessions.forEach(s => {
    const k = s.timerId || "noid";
    if(!perTimerSessions[k]) perTimerSessions[k] = { totalSec:0, count:0, name: s.name || k };
    perTimerSessions[k].totalSec += s.durationSec;
    perTimerSessions[k].count += 1;
  });
  const mediaPorTurno = sessions.length ? Math.round(totalAccumulatedSec / sessions.length) : 0;

  // Días exitosos: definimos éxito = tener totalSec >= sumTargets? 
  // Como no tenemos un objetivo por día global (a menos que lo calcules), usaremos criterio: día exitoso = totalSec > 0 y no hay sesiones incompletas (esto es arbitrario).
  // Mejor: considerar día exitoso cuando la suma de duración alcanzó o superó la suma de objetivos de timers creados ese día, pero eso requiere metas asociadas.
  // Implementaré: "día exitoso" = aquel en el que totalSec >= mediana diaria o > 0. (Puedo ajustar si me das criterio exacto.)
  // Para ahora: marcaré exitoso si totalSec > 0 y no hay sesiones abiertas en ese día (ya cerramos todas).
  const diasExitosos = Object.values(perDia).filter(d => d.dia !== null && d.totalSec > 0).map(d => d.dia);
  const totalDiasExitosos = diasExitosos.length;

  // rachas por fecha (fechas exitosas): consideramos fecha exitosa si perDate totalSec > 0
  const fechasOrdenadas = Object.keys(perDate).sort();
  let maxRacha = 0, currentRacha = 0;
  const rachasFechas = {};
  fechasOrdenadas.forEach(k => {
    const ex = perDate[k].totalSec > 0;
    if(ex){
      currentRacha++;
      maxRacha = Math.max(maxRacha, currentRacha);
    } else {
      currentRacha = 0;
    }
    rachasFechas[k] = currentRacha;
  });

  // Return structured
  return {
    totalAccumulatedSec,
    numDias,
    numFechas,
    perDia,
    perDate,
    mediaPorSesion,
    mediaPorTurno,
    totalDiasExitosos,
    maxRacha,
    sesionesCount: sessions.length,
    sesiones: sessions
  };
}

/* ---------------- UI Render ----------------
 Renders into container #statsGeneralEmbed
*/
export async function renderStatsGeneral(){
  // ensure Chart.js
  await ensureChartJs();

  const container = document.getElementById("statsGeneralEmbed");
  container.innerHTML = `
    <div id="statsTop" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
      <div id="summaryBox" style="background:#fff; padding:12px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.06); min-width:220px;">
        <div style="font-weight:700; margin-bottom:6px;">Estadísticas totales</div>
        <div id="totalAccum" style="font-size:1.2rem;">Tiempo total acumulado: --:--:--</div>
        <div id="totalDias" class="small">Número de días totales transcurridos: --</div>
        <div id="totalFechas" class="small">Número de fechas totales transcurridas: --</div>
      </div>

      <div id="controlsBox" style="display:flex; flex-direction:column; gap:8px;">
        <div id="filterDatesBox" style="background:#fff; padding:12px; border-radius:8px;">
          <div style="font-weight:700; margin-bottom:6px;">Filtrar por Fecha</div>
          <div id="datesChecklist" style="max-height:160px; overflow:auto; min-width:260px;"></div>
          <div style="margin-top:8px; display:flex; gap:8px;">
            <button id="selectAllDatesBtn">Seleccionar todo</button>
            <button id="clearDatesBtn">Limpiar</button>
            <button id="exportCsvBtn">Exportar CSV</button>
          </div>
        </div>
      </div>
    </div>

    <div id="statsBody" style="display:grid; grid-template-columns: 1fr 420px; gap:14px;">
      <div id="statsMain" style="background:#fff; padding:12px; border-radius:8px;">
        <h3 style="margin-top:0;">Historial y estadísticas por día</h3>
        <div id="tableByDayWrapper"></div>

        <h3>Historial y estadísticas por fecha</h3>
        <div id="tableByDateWrapper"></div>
      </div>

      <div id="chartsColumn" style="background:#fff; padding:12px; border-radius:8px;">
        <h3 style="margin-top:0;">Gráficos</h3>
        <canvas id="chartTimePerDay" style="width:100%; height:200px;"></canvas>
        <canvas id="chartByActivity" style="width:100%; height:200px; margin-top:12px;"></canvas>
        <div style="margin-top:8px;">
          <div><b>Media por sesión:</b> <span id="mediaSesionText">--</span></div>
          <div><b>Media por turno:</b> <span id="mediaTurnoText">--</span></div>
          <div><b>Días exitosos (tot):</b> <span id="diasExitososText">--</span></div>
          <div><b>Máxima racha de éxito:</b> <span id="maxRachaText">--</span></div>
        </div>
      </div>
    </div>
  `;

  // prepare data listener
  // Note: currentUid is expected to be global (from your index.html onAuthStateChanged)
  if(typeof currentUid === "undefined" || !currentUid){
    container.prepend(document.createElement("div")).textContent = "Inicia sesión para ver estadísticas.";
    return;
  }

  const eventosRef = ref(getDatabase(), `usuarios/${currentUid}/historialEventos`);
  // subscribe
  onValue(eventosRef, snap => {
    const raw = snap.val() || {};
    const eventosArr = Object.entries(raw).map(([k,v]) => ({ id:k, ...v }));
    eventosArr.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

    // build dias
    const dias = buildDiasFromEvents(eventosArr);

    // extract sessions
    const sessions = extractSessions(eventosArr, dias);

    // calculate metrics
    const metrics = calculateMetrics(sessions, dias);

    // render summary
    document.getElementById("totalAccum").textContent = `Tiempo total acumulado: ${secsToHHMMSS(metrics.totalAccumulatedSec)}`;
    document.getElementById("totalDias").textContent = `Número de días totales transcurridos: ${metrics.numDias}`;
    document.getElementById("totalFechas").textContent = `Número de fechas totales transcurridas: ${metrics.numFechas}`;
    document.getElementById("mediaSesionText").textContent = secsToHHMMSS(metrics.mediaPorSesion);
    document.getElementById("mediaTurnoText").textContent = secsToHHMMSS(metrics.mediaPorTurno);
    document.getElementById("diasExitososText").textContent = metrics.totalDiasExitosos;
    document.getElementById("maxRachaText").textContent = metrics.maxRacha;

    // build date checklist
    const datesChecklist = document.getElementById("datesChecklist");
    const allDates = Object.keys(metrics.perDate).sort();
    datesChecklist.innerHTML = "";
    allDates.forEach(dk => {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.gap = "8px";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = dk;
      input.checked = true;
      input.onchange = () => updateViewsBasedOnSelectedDates();
      const label = document.createElement("label");
      label.textContent = `${dk} (${secsToHHMMSS(metrics.perDate[dk].totalSec)})`;
      div.appendChild(input);
      div.appendChild(label);
      datesChecklist.appendChild(div);
    });

    document.getElementById("selectAllDatesBtn").onclick = () => {
      Array.from(datesChecklist.querySelectorAll("input[type=checkbox]")).forEach(i => i.checked = true);
      updateViewsBasedOnSelectedDates();
    };
    document.getElementById("clearDatesBtn").onclick = () => {
      Array.from(datesChecklist.querySelectorAll("input[type=checkbox]")).forEach(i => i.checked = false);
      updateViewsBasedOnSelectedDates();
    };
    document.getElementById("exportCsvBtn").onclick = () => exportCsv(metrics);

    // initial render
    updateViewsBasedOnSelectedDates();

    // local functions
    function getSelectedDates(){
      const inputs = Array.from(datesChecklist.querySelectorAll("input[type=checkbox]"));
      const sel = inputs.filter(i => i.checked).map(i => i.value);
      return new Set(sel);
    }

    // update views (tables + charts) filtered by selected dates
    async function updateViewsBasedOnSelectedDates(){
      const selDates = getSelectedDates();
      // filtered sessions by dateKey
      const filteredSessions = metrics.sesiones ? metrics.sesiones.filter(s => selDates.has(s.dateKey)) : metrics.sesiones || [];
      // But metrics.sesiones might be 'sessions' in returned metrics
      const sessionsToUse = metrics.sesiones ? metrics.sesiones.filter(s => selDates.has(s.dateKey)) : metrics.sesiones || metrics.sesions || [];

      // create per-day summary table
      renderTableByDay(metrics, selDates);
      renderTableByDate(metrics, selDates);
      await renderCharts(metrics, selDates);
    }

    // renderTableByDay
    function renderTableByDay(metricsObj, selDatesSet){
      const wrapper = document.getElementById("tableByDayWrapper");
      wrapper.innerHTML = "";
      // header
      const tbl = document.createElement("table");
      tbl.style.width = "100%";
      tbl.style.borderCollapse = "collapse";
      tbl.innerHTML = `<thead>
        <tr style="background:#f1f1f1">
          <th style="padding:8px">Día</th>
          <th style="padding:8px">Fechas involucradas</th>
          <th style="padding:8px">Tiempo acumulado</th>
          <th style="padding:8px">Número de sesiones</th>
        </tr></thead><tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      const perDiaVals = Object.values(metricsObj.perDia).sort((a,b) => (a.dia||0) - (b.dia||0));
      perDiaVals.forEach(d => {
        // check if any of d.dateKeys intersect selDatesSet
        const intersects = d.dateKeys.some(k => selDatesSet.has(k));
        if(!intersects) return;
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="padding:8px; border-bottom:1px solid #eee">${d.dia}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${d.dateKeys.join(", ")}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${secsToHHMMSS(d.totalSec)}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${d.sessions.length}</td>`;
        tbody.appendChild(tr);
      });

      wrapper.appendChild(tbl);
    }

    // renderTableByDate
    function renderTableByDate(metricsObj, selDatesSet){
      const wrapper = document.getElementById("tableByDateWrapper");
      wrapper.innerHTML = "";
      const tbl = document.createElement("table");
      tbl.style.width = "100%";
      tbl.style.borderCollapse = "collapse";
      tbl.innerHTML = `<thead>
        <tr style="background:#f1f1f1">
          <th style="padding:8px">Fecha</th>
          <th style="padding:8px">Tiempo acumulado</th>
          <th style="padding:8px">Número de sesiones</th>
          <th style="padding:8px">Actividades (top)</th>
        </tr></thead><tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      const dates = Object.keys(metricsObj.perDate).sort();
      dates.forEach(dateKey => {
        if(!selDatesSet.has(dateKey)) return;
        const pd = metricsObj.perDate[dateKey];
        // top activities that day
        const perAct = {};
        pd.sessions.forEach(s => {
          const k = s.name || s.timerId || "sin_nombre";
          if(!perAct[k]) perAct[k] = 0;
          perAct[k] += s.durationSec;
        });
        const topActs = Object.entries(perAct).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x => `${x[0]} (${secsToHHMMSS(x[1])})`).join(", ");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="padding:8px; border-bottom:1px solid #eee">${dateKey}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${secsToHHMMSS(pd.totalSec)}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${pd.sessions.length}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${escapeHtml(topActs)}</td>`;
        tbody.appendChild(tr);
      });

      wrapper.appendChild(tbl);
    }

    // renderCharts
    async function renderCharts(metricsObj, selDatesSet){
      await ensureChartJs();
      const Chart = window.Chart;

      // Time per day chart (bar) -> based on perDia filtered by selDates
      const perDiaVals = Object.values(metricsObj.perDia).sort((a,b) => (a.dia||0) - (b.dia||0));
      const labels = [];
      const dataVals = [];
      perDiaVals.forEach(d => {
        const intersects = d.dateKeys.some(k => selDatesSet.has(k));
        if(!intersects) return;
        labels.push(`Día ${d.dia}`);
        dataVals.push(Math.round(d.totalSec/60)); // minutes
      });

      // destroy previous chart if exists
      if(window._chartTimePerDay) window._chartTimePerDay.destroy();
      const ctx1 = document.getElementById("chartTimePerDay").getContext("2d");
      window._chartTimePerDay = new Chart(ctx1, {
        type: "bar",
        data: { labels, datasets: [{ label: "Minutos por día", data: dataVals }] },
        options: { responsive: true, maintainAspectRatio: false }
      });

      // By activity distribution (pie) for selected dates
      const perActAgg = {};
      Object.keys(metricsObj.perDate).forEach(dateKey => {
        if(!selDatesSet.has(dateKey)) return;
        metricsObj.perDate[dateKey].sessions.forEach(s => {
          const name = s.name || s.timerId || "sin_nombre";
          if(!perActAgg[name]) perActAgg[name] = 0;
          perActAgg[name] += s.durationSec;
        });
      });
      const actLabels = Object.keys(perActAgg);
      const actData = actLabels.map(l => Math.round(perActAgg[l]/60)); // minutes

      if(window._chartByActivity) window._chartByActivity.destroy();
      const ctx2 = document.getElementById("chartByActivity").getContext("2d");
      window._chartByActivity = new Chart(ctx2, {
        type: "pie",
        data: { labels: actLabels, datasets: [{ label: "Minutos por actividad", data: actData }] },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // export CSV
    function exportCsv(metricsObj){
      const sel = Array.from(document.querySelectorAll("#datesChecklist input[type=checkbox]:checked")).map(i => i.value);
      if(sel.length === 0) return alert("Selecciona al menos una fecha para exportar.");
      // collect sessions for those dates
      const rows = [];
      rows.push(["Día","Cronómetro","Acción (closing)","Marca (HH:MM:SS)","Duración(s)","Fecha inicio","Fecha fin","Fecha clave"]);
      metricsObj.sesiones.forEach(s => {
        if(!sel.includes(s.dateKey)) return;
        rows.push([
          s.dia === null ? "" : s.dia,
          s.name || s.timerId || "",
          s.closingType || "",
          secsToHHMMSS(s.durationSec || 0),
          s.durationSec || 0,
          localStr(s.startTs),
          localStr(s.endTs),
          s.dateKey
        ]);
      });
      const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estadisticas_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

  }); // end onValue
} // end renderStatsGeneral











