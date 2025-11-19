// estadisticas.js  (OPCIÓN B: lee window.registroProcesado)
// Exporta: renderStatsGeneral()

/* global currentUid */ // asumimos currentUid provisto por index.html
// Dependencias: Chart.js (se carga dinámicamente)

async function ensureChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(s);
  });
}

/* ---------- utilidades ---------- */
function pad2(n){ return String(n).padStart(2,"0"); }
function secsToHHMMSS(secs){
  if(secs == null || isNaN(secs)) return "00:00:00";
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function dateKey(ts){
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = pad2(d.getMonth()+1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}
function localStr(ts){ try { return new Date(ts).toLocaleString(); } catch(e){ return String(ts); } }
function escapeHtml(s){ if(!s && s !== 0) return ""; return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

/* ---------- helpers para registroProcesado ---------- */
function getRegistroSafe(){
  return window.registroProcesado || null;
}

// Normalize registro shape to ensure dias[], sessions[], timersMeta{}
function normalizeRegistro(raw){
  const reg = raw || {};
  const dias = Array.isArray(reg.dias) ? reg.dias : [];
  const sessions = Array.isArray(reg.sessions) ? reg.sessions : [];
  const timersMeta = reg.timersMeta || {};
  // Ensure sessions have expected fields and dateKey/durationSec/dia
  sessions.forEach(s=>{
    if(!s.startTs && s.timestamp) s.startTs = s.timestamp;
    if(!s.dateKey && s.startTs) s.dateKey = dateKey(s.startTs);
    if(typeof s.durationSec !== "number" && s.startTs && s.endTs){
      s.durationSec = Math.max(0, Math.round((new Date(s.endTs) - new Date(s.startTs))/1000));
    }
    if(!('dia' in s) && s.startTs){
      // try to find dia by comparing with dias
      for(const d of dias){
        const st = new Date(s.startTs);
        const s0 = new Date(d.inicio);
        const e0 = d.fin ? new Date(d.fin) : null;
        if(e0){
          if(st >= s0 && st <= e0){ s.dia = d.dia; break;}
        } else {
          if(st >= s0){ s.dia = d.dia; break;}
        }
      }
      if(!('dia' in s)) s.dia = null;
    }
    // objective per session in minutes (optional)
    if(!('objetivoMin' in s)){
      // try timersMeta by timerId
      if(s.timerId && timersMeta[s.timerId] && timersMeta[s.timerId].target !== undefined){
        s.objetivoMin = Number(timersMeta[s.timerId].target) || null;
      } else {
        s.objetivoMin = s.objetivoMin || null;
      }
    }
  });
  return { dias, sessions, timersMeta };
}

/* ---------- cálculo de métricas ---------- */
function calculateAllMetrics(reg){
  // reg: { dias:[], sessions:[], timersMeta:{} }
  const { dias, sessions, timersMeta } = reg;

  // total accumulated sec
  const totalAccumulatedSec = sessions.reduce((sum,s)=>sum + (s.durationSec || 0), 0);

  // number of dias (work days)
  const numDias = dias.length;

  // unique calendar dates with activity
  const uniqueDates = new Set(sessions.map(s => s.dateKey).filter(Boolean));
  const numFechas = uniqueDates.size;

  // per-day totals (by dia index)
  const perDia = {}; // diaNumber -> { totalSec, sessions:[], objetivosMinTotal }
  dias.forEach(d => perDia[d.dia] = { dia:d.dia, inicio:d.inicio, fin:d.fin || null, totalSec:0, sessions:[], objetivosMinTotal:0 });

  sessions.forEach(s=>{
    const k = s.dia === null || s.dia === undefined ? "sin_dia" : s.dia;
    if(k === "sin_dia"){
      if(!perDia["sin_dia"]) perDia["sin_dia"] = { dia:null, totalSec:0, sessions:[], objetivosMinTotal:0 };
      perDia["sin_dia"].sessions.push(s);
      perDia["sin_dia"].totalSec += (s.durationSec || 0);
    } else {
      if(!perDia[k]) perDia[k] = { dia:k, totalSec:0, sessions:[], objetivosMinTotal:0 };
      perDia[k].sessions.push(s);
      perDia[k].totalSec += (s.durationSec || 0);
    }
  });

  // compute objective per day: sum of target minutes of timers active that day
  // heuristic: a timer is "active" in a day if any session for that timerId exists in that day
  const timerTargets = {}; // timerId -> targetMin (from timersMeta)
  Object.entries(timersMeta || {}).forEach(([id,meta])=>{
    const t = meta && meta.target ? Number(meta.target) : null;
    if(t) timerTargets[id] = t;
  });

  Object.values(perDia).forEach(d=>{
    const seenTimers = new Set();
    d.sessions.forEach(s=>{
      if(s.timerId) seenTimers.add(s.timerId);
      // also if s has objetivoMin, use it by timerId
    });
    let objMin = 0;
    seenTimers.forEach(tid => {
      if(timerTargets[tid]) objMin += Number(timerTargets[tid]);
      else {
        // fallback: find first session for this timerId and check objetivoMin
        const find = d.sessions.find(x => x.timerId === tid && x.objetivoMin);
        if(find && find.objetivoMin) objMin += Number(find.objetivoMin);
      }
    });
    d.objetivosMinTotal = objMin;
    d.tiempoRestanteSec = Math.max(0, Math.round(objMin*60 - d.totalSec));
    d.exitoso = (d.totalSec >= Math.round(objMin*60)) && (objMin > 0); // only consider success if there was some objective
  });

  // per-date (calendar) aggregation
  const perDate = {}; // dateKey -> { totalSec, sessions:[] }
  sessions.forEach(s=>{
    const k = s.dateKey || dateKey(s.startTs);
    if(!perDate[k]) perDate[k] = { dateKey:k, totalSec:0, sessions:[] };
    perDate[k].totalSec += (s.durationSec || 0);
    perDate[k].sessions.push(s);
  });

  // average time per session overall
  const mediaPorSesion = sessions.length ? Math.round(totalAccumulatedSec / sessions.length) : 0;

  // average per turno (same as mediaPorSesion logically)
  const mediaPorTurno = mediaPorSesion;

  // dias exitosos count and rachas por fecha
  const diasExitososCount = Object.values(perDia).filter(d => d.exitoso).length;

  // For racha by dates: consider date successful if totalSec >= sum(objectives on that date)
  // compute objectives per date by mapping session timerIds to targets if available
  const perDateObjetivos = {};
  Object.keys(perDate).forEach(dateK=>{
    const timersSeen = new Set();
    perDate[dateK].sessions.forEach(s=>{ if(s.timerId) timersSeen.add(s.timerId); });
    let objMin = 0;
    timersSeen.forEach(tid=>{
      if(timerTargets[tid]) objMin += Number(timerTargets[tid]);
      else {
        const find = perDate[dateK].sessions.find(x => x.timerId === tid && x.objetivoMin);
        if(find && find.objetivoMin) objMin += Number(find.objetivoMin);
      }
    });
    perDateObjetivos[dateK] = objMin;
  });

  // compute racha máxima de fechas exitosas (calendar)
  const dateKeysSorted = Object.keys(perDate).sort();
  let maxRacha = 0, curRacha = 0;
  dateKeysSorted.forEach(dk=>{
    const isEx = perDate[dk].totalSec >= Math.round((perDateObjetivos[dk]||0)*60) && (perDateObjetivos[dk]||0) > 0;
    if(isEx){ curRacha++; maxRacha = Math.max(maxRacha, curRacha); }
    else curRacha = 0;
  });

  // final assembly
  return {
    totalAccumulatedSec,
    numDias,
    numFechas,
    perDia,
    perDate,
    mediaPorSesion,
    mediaPorTurno,
    diasExitososCount,
    maxRacha,
    sessions,
    timerTargets,
    perDateObjetivos
  };
}

/* ---------- UI y renderizado ---------- */

async function buildBaseUI(container){
  container.innerHTML = `
    <div id="statsTop" style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
      <div id="summaryBox" style="background:#fff; padding:12px; border-radius:8px; min-width:260px; box-shadow:0 6px 18px rgba(0,0,0,0.06);">
        <div style="font-weight:700; margin-bottom:6px;">Estadísticas totales</div>
        <div id="totalAccum" style="font-size:1.15rem;">Tiempo total acumulado: --:--:--</div>
        <div id="totalDias" class="small">Número de días totales transcurridos: --</div>
        <div id="totalFechas" class="small">Número de fechas totales transcurridas: --</div>
      </div>

      <div id="filtersBox" style="display:flex; gap:10px; flex-direction:column;">
        <div style="background:#fff; padding:10px; border-radius:8px; box-shadow:0 6px 12px rgba(0,0,0,0.04);">
          <div style="font-weight:700; margin-bottom:6px;">Filtro por Día de trabajo</div>
          <div id="daysChecklist" style="max-height:140px; overflow:auto; min-width:220px;"></div>
          <div style="margin-top:8px; display:flex; gap:6px;">
            <button id="selectAllDaysBtn">Seleccionar todo</button>
            <button id="clearDaysBtn">Limpiar</button>
          </div>
        </div>

        <div style="background:#fff; padding:10px; border-radius:8px; box-shadow:0 6px 12px rgba(0,0,0,0.04);">
          <div style="font-weight:700; margin-bottom:6px;">Filtro por Fecha calendario</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="date" id="filterDateFrom">
            <input type="date" id="filterDateTo">
            <button id="applyDateRangeBtn">Aplicar</button>
            <button id="clearDateRangeBtn">Limpiar</button>
          </div>
          <div style="margin-top:8px; display:flex; gap:6px;">
            <button id="todayBtn">Hoy</button>
            <button id="thisWeekBtn">Esta semana</button>
            <button id="thisMonthBtn">Este mes</button>
          </div>
        </div>
      </div>
    </div>

    <div id="statsBody" style="display:grid; grid-template-columns:1fr 420px; gap:12px;">
      <div id="mainStats" style="background:#fff; padding:12px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.04);">
        <h3 style="margin-top:0;">Historial y estadísticas por día (work-days)</h3>
        <div id="tableByDay"></div>
        <h3 style="margin-top:18px;">Historial y estadísticas por fecha (calendar)</h3>
        <div id="tableByDate"></div>
      </div>

      <div id="chartsBox" style="background:#fff; padding:12px; border-radius:8px; box-shadow:0 6px 18px rgba(0,0,0,0.04);">
        <h3 style="margin-top:0;">Gráficos</h3>
        <div style="height:220px;"><canvas id="chartTimePerDay" style="width:100%; height:100%"></canvas></div>
        <div style="height:220px; margin-top:12px;"><canvas id="chartByActivity" style="width:100%; height:100%"></canvas></div>
        <div style="margin-top:8px;">
          <div><b>Media por sesión:</b> <span id="mediaSesionText">--</span></div>
          <div><b>Media por turno:</b> <span id="mediaTurnoText">--</span></div>
          <div><b>Días exitosos (tot):</b> <span id="diasExitososText">--</span></div>
          <div><b>Máxima racha de éxito:</b> <span id="maxRachaText">--</span></div>
        </div>
        <div style="margin-top:10px;">
          <button id="exportCsvBtn">Exportar CSV del filtro</button>
        </div>
      </div>
    </div>
  `;
}

function buildDaysChecklistUI(dias){
  const container = document.getElementById("daysChecklist");
  container.innerHTML = "";
  dias.forEach(d=>{
    const id = `day_chk_${d.dia}`;
    const div = document.createElement("div");
    div.style.display = "flex"; div.style.alignItems = "center"; div.style.gap = "8px";
    const inpt = document.createElement("input");
    inpt.type = "checkbox"; inpt.id = id; inpt.value = d.dia; inpt.checked = true;
    inpt.onchange = () => updateViews();
    const lbl = document.createElement("label");
    lbl.htmlFor = id;
    // show start and end as local strings
    const start = localStr(d.inicio); const end = d.fin ? localStr(d.fin) : "(en curso)";
    lbl.innerHTML = `Día ${d.dia} — ${start} → ${end}`;
    div.appendChild(inpt); div.appendChild(lbl);
    container.appendChild(div);
  });

  document.getElementById("selectAllDaysBtn").onclick = () => {
    Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i => i.checked = true);
    updateViews();
  };
  document.getElementById("clearDaysBtn").onclick = () => {
    Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i => i.checked = false);
    updateViews();
  };
}

/* ---------- render principal ---------- */
export async function renderStatsGeneral(){
  await ensureChartJs();
  const root = document.getElementById("statsGeneralEmbed");
  if(!root){ console.error("No existe #statsGeneralEmbed"); return; }
  root.innerHTML = "<div style='padding:12px'>Cargando interfaz de estadísticas...</div>";
  await buildBaseUI(root);

  // Poll for registroProcesado (OPCIÓN B)
  function onRegistroReady(reg){
    // normalize
    const registro = normalizeRegistro(reg);
    // compute metrics
    const metrics = calculateAllMetrics(registro);
    // update summary
    document.getElementById("totalAccum").textContent = `Tiempo total acumulado: ${secsToHHMMSS(metrics.totalAccumulatedSec)}`;
    document.getElementById("totalDias").textContent = `Número de días totales transcurridos: ${metrics.numDias}`;
    document.getElementById("totalFechas").textContent = `Número de fechas totales transcurridas: ${metrics.numFechas}`;
    document.getElementById("mediaSesionText").textContent = secsToHHMMSS(metrics.mediaPorSesion);
    document.getElementById("mediaTurnoText").textContent = secsToHHMMSS(metrics.mediaPorTurno);
    document.getElementById("diasExitososText").textContent = metrics.diasExitososCount;
    document.getElementById("maxRachaText").textContent = metrics.maxRacha;

    // build checklist UI
    buildDaysChecklistUI(registro.dias || []);

    // wire date inputs default values
    const dates = Object.keys(metrics.perDate).sort();
    const dateFromInput = document.getElementById("filterDateFrom");
    const dateToInput = document.getElementById("filterDateTo");
    if(dates.length){
      dateFromInput.value = dates[0];
      dateToInput.value = dates[dates.length-1];
    } else {
      const today = new Date().toISOString().slice(0,10);
      dateFromInput.value = today; dateToInput.value = today;
    }

    document.getElementById("applyDateRangeBtn").onclick = () => updateViews();
    document.getElementById("clearDateRangeBtn").onclick = () => { document.getElementById("filterDateFrom").value = ""; document.getElementById("filterDateTo").value = ""; updateViews(); };
    document.getElementById("todayBtn").onclick = () => { const t = new Date().toISOString().slice(0,10); document.getElementById("filterDateFrom").value = t; document.getElementById("filterDateTo").value = t; updateViews(); };
    document.getElementById("thisWeekBtn").onclick = () => {
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 sun - 6 sat
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // monday
      const monday = new Date(now.setDate(diff));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      document.getElementById("filterDateFrom").value = monday.toISOString().slice(0,10);
      document.getElementById("filterDateTo").value = sunday.toISOString().slice(0,10);
      updateViews();
    };
    document.getElementById("thisMonthBtn").onclick = () => {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
      document.getElementById("filterDateFrom").value = first.toISOString().slice(0,10);
      document.getElementById("filterDateTo").value = last.toISOString().slice(0,10);
      updateViews();
    };

    document.getElementById("exportCsvBtn").onclick = () => exportCsvFiltered(registro, metrics);
    document.getElementById("exportCsvBtn").addEventListener("click", ()=>{}); // noop to ensure exists

    // initial draw
    updateViews();

    /* ---------- inner functions (depend on registro & metrics) ---------- */
    function getSelectedDayNumbers(){
      const checks = Array.from(document.querySelectorAll("#daysChecklist input[type=checkbox]"));
      return checks.filter(c => c.checked).map(c => Number(c.value));
    }

    function getSelectedDateRange(){
      const f = document.getElementById("filterDateFrom").value;
      const t = document.getElementById("filterDateTo").value;
      if(!f && !t) return null;
      const from = f ? new Date(f + "T00:00:00") : null;
      const to = t ? new Date(t + "T23:59:59") : null;
      return { from, to };
    }

    async function updateViews(){
      // compute filtered sessions
      const selDayNums = new Set(getSelectedDayNumbers());
      const dateRange = getSelectedDateRange();
      const sessionsFiltered = registro.sessions.filter(s => {
        const okDay = (selDayNums.size === 0) ? true : (s.dia !== null && selDayNums.has(Number(s.dia)));
        const okDate = (() => {
          if(!dateRange) return true;
          const d = new Date(s.dateKey + "T00:00:00");
          if(dateRange.from && d < dateRange.from) return false;
          if(dateRange.to && d > dateRange.to) return false;
          return true;
        })();
        return okDay && okDate;
      });

      // compute aggregated metrics for this filter view
      const totalSecFiltered = sessionsFiltered.reduce((sum,s)=>sum + (s.durationSec||0), 0);
      const sessionsCount = sessionsFiltered.length;
      const avgPerSession = sessionsCount ? Math.round(totalSecFiltered / sessionsCount) : 0;

      // compute objectives within filter: sum of unique timers' targetMin across sessionsFiltered
      const timersSeen = new Set();
      sessionsFiltered.forEach(s => { if(s.timerId) timersSeen.add(s.timerId); });
      let objetivosMinSum = 0;
      timersSeen.forEach(tid => {
        if(registro.timersMeta && registro.timersMeta[tid] && registro.timersMeta[tid].target) objetivosMinSum += Number(registro.timersMeta[tid].target);
        else {
          const first = sessionsFiltered.find(x => x.timerId === tid && x.objetivoMin);
          if(first && first.objetivoMin) objetivosMinSum += Number(first.objetivoMin);
        }
      });
      const objetivoTotalSec = Math.round(objetivosMinSum * 60);
      const tiempoRestanteSec = Math.max(0, objetivoTotalSec - totalSecFiltered);

      // update some summary UI
      document.getElementById("mediaSesionText").textContent = secsToHHMMSS(avgPerSession);
      document.getElementById("mediaTurnoText").textContent = secsToHHMMSS(avgPerSession);
      // dias exitosos & maxRacha reflect overall metrics (not only filtered)
      // but we also show counts for filtered selection:
      const diasExitososFiltrados = Object.values(metrics.perDia).filter(d => {
        if(d.dia === null) return false;
        if(selDayNums.size && !selDayNums.has(Number(d.dia))) return false;
        // also ensure at least one dateKey in selected range if dateRange present
        if(dateRange && dateRange.from && dateRange.to){
          const intersect = d.dateKeys.some(k => {
            const dd = new Date(k + "T00:00:00");
            return dd >= dateRange.from && dd <= dateRange.to;
          });
          if(!intersect) return false;
        }
        return d.exitoso;
      }).length;
      document.getElementById("diasExitososText").textContent = diasExitososFiltrados;

      // render tables
      renderTableByDay(registro, sessionsFiltered, selDayNums, dateRange);
      renderTableByDate(registro, sessionsFiltered, selDayNums, dateRange);

      // render charts (time per day & by activity)
      await renderCharts(registro, sessionsFiltered);
    }

    function renderTableByDay(registro, sessionsFiltered, selDayNums, dateRange){
      const wrapper = document.getElementById("tableByDay");
      wrapper.innerHTML = "";
      const tbl = document.createElement("table");
      tbl.style.width = "100%"; tbl.style.borderCollapse = "collapse";
      tbl.innerHTML = `<thead>
        <tr style="background:#f9f9f9"><th style="padding:8px">Día</th><th style="padding:8px">Fechas</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo (min)</th><th style="padding:8px">Restante</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Éxito</th></tr>
      </thead><tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      const diasList = registro.dias.slice().sort((a,b)=>a.dia - b.dia);
      diasList.forEach(d => {
        // apply day filter
        if(selDayNums.size && !selDayNums.has(Number(d.dia))) return;
        // apply dateRange filter: if dateRange set, only include day if its dateKeys intersect
        if(dateRange && dateRange.from && dateRange.to){
          const intersect = (d.dateKeys || []).some(k => {
            const dd = new Date(k + "T00:00:00");
            return dd >= dateRange.from && dd <= dateRange.to;
          });
          if(!intersect) return;
        }
        const pd = (metrics.perDia && metrics.perDia[d.dia]) ? metrics.perDia[d.dia] : { totalSec:0, sessions:[], objetivosMinTotal:0, tiempoRestanteSec:0, exitoso:false, dateKeys: d.dateKeys || [] };
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="padding:8px; border-bottom:1px solid #eee">${d.dia}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${(d.dateKeys||[]).join(", ")}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${secsToHHMMSS(pd.totalSec || 0)}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${pd.objetivosMinTotal || 0}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${secsToHHMMSS(pd.tiempoRestanteSec || 0)}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${(pd.sessions && pd.sessions.length) || 0}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${pd.exitoso ? "✅" : "—"}</td>`;
        tbody.appendChild(tr);
      });

      wrapper.appendChild(tbl);
    }

    function renderTableByDate(registro, sessionsFiltered, selDayNums, dateRange){
      const wrapper = document.getElementById("tableByDate");
      wrapper.innerHTML = "";
      const tbl = document.createElement("table");
      tbl.style.width = "100%"; tbl.style.borderCollapse = "collapse";
      tbl.innerHTML = `<thead>
        <tr style="background:#f9f9f9"><th style="padding:8px">Fecha</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo (min)</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Top actividades</th></tr>
      </thead><tbody></tbody>`;
      const tbody = tbl.querySelector("tbody");

      const mapDate = {};
      // build per-date from sessionsFiltered
      sessionsFiltered.forEach(s => {
        const k = s.dateKey || dateKey(s.startTs);
        if(!mapDate[k]) mapDate[k] = { dateKey:k, totalSec:0, sessions:[] };
        mapDate[k].totalSec += (s.durationSec || 0);
        mapDate[k].sessions.push(s);
      });
      const dates = Object.keys(mapDate).sort();
      dates.forEach(dk => {
        const pd = mapDate[dk];
        // compute objetivos for this calendar date
        const timersSeen = new Set();
        pd.sessions.forEach(s => { if(s.timerId) timersSeen.add(s.timerId); });
        let objMin = 0;
        timersSeen.forEach(tid => {
          if(registro.timersMeta && registro.timersMeta[tid] && registro.timersMeta[tid].target) objMin += Number(registro.timersMeta[tid].target);
          else {
            const f = pd.sessions.find(x => x.timerId === tid && x.objetivoMin);
            if(f && f.objetivoMin) objMin += Number(f.objetivoMin);
          }
        });
        // top activities
        const perAct = {};
        pd.sessions.forEach(s => { const n = s.name || s.timerId || "sin_nombre"; perAct[n] = (perAct[n]||0) + (s.durationSec||0); });
        const topActs = Object.entries(perAct).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>`${x[0]} (${secsToHHMMSS(x[1])})`).join(", ");

        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="padding:8px; border-bottom:1px solid #eee">${dk}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${secsToHHMMSS(pd.totalSec)}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${objMin}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${pd.sessions.length}</td>
          <td style="padding:8px; border-bottom:1px solid #eee">${escapeHtml(topActs)}</td>`;
        tbody.appendChild(tr);
      });

      wrapper.appendChild(tbl);
    }

    // charts
    async function renderCharts(registro, sessionsFiltered){
      await ensureChartJs();
      const Chart = window.Chart;

      // time per day: use registro.dias and perDia totals (respecting day selection)
      const selDayNums = new Set(getSelectedDayNumbers());
      const labels = [];
      const data = [];
      registro.dias.slice().sort((a,b)=>a.dia-b.dia).forEach(d=>{
        if(selDayNums.size && !selDayNums.has(d.dia)) return;
        const pd = metrics.perDia[d.dia] || { totalSec:0 };
        // if a dateRange is set, ensure intersection
        const dateRangeLocal = getSelectedDateRange();
        if(dateRangeLocal && dateRangeLocal.from && dateRangeLocal.to){
          const intersect = (d.dateKeys || []).some(k => {
            const dd = new Date(k + "T00:00:00");
            return dd >= dateRangeLocal.from && dd <= dateRangeLocal.to;
          });
          if(!intersect) return;
        }
        labels.push(`D${d.dia}`);
        data.push(Math.round((pd.totalSec||0)/60)); // minutes
      });

      // destroy if exists
      if(window._chartTimePerDay) window._chartTimePerDay.destroy();
      const ctx1 = document.getElementById("chartTimePerDay").getContext("2d");
      window._chartTimePerDay = new Chart(ctx1, {
        type: "bar",
        data: { labels, datasets: [{ label: "Minutos por día", data }] },
        options: { maintainAspectRatio:false, responsive:true }
      });

      // by activity distribution for filtered sessions
      const perAct = {};
      sessionsFiltered.forEach(s => {
        const name = s.name || s.timerId || "sin_nombre";
        perAct[name] = (perAct[name] || 0) + (s.durationSec || 0);
      });
      const actLabels = Object.keys(perAct);
      const actData = actLabels.map(l => Math.round(perAct[l]/60));
      if(window._chartByActivity) window._chartByActivity.destroy();
      const ctx2 = document.getElementById("chartByActivity").getContext("2d");
      window._chartByActivity = new Chart(ctx2, {
        type: "pie",
        data: { labels: actLabels, datasets: [{ label: "Minutos por actividad", data: actData }] },
        options: { maintainAspectRatio:false, responsive:true }
      });
    }

    // export CSV for current filtered selection
    function exportCsvFiltered(registro, metricsGlobal){
      const selDayNums = new Set(getSelectedDayNumbers());
      const dateRange = getSelectedDateRange();
      // create rows from registro.sessions filtered
      const rows = [];
      rows.push(["Día","Cronómetro","Inicio","Fin","Duración (s)","Duración (HH:MM:SS)","Fecha clave","Objetivo(min)"]);
      registro.sessions.forEach(s=>{
        // apply same filters
        if(selDayNums.size && (s.dia === null || !selDayNums.has(Number(s.dia)))) return;
        if(dateRange && dateRange.from && dateRange.to){
          const dd = new Date(s.dateKey + "T00:00:00");
          if(dd < dateRange.from || dd > dateRange.to) return;
        }
        rows.push([
          s.dia === null ? "" : s.dia,
          s.name || s.timerId || "",
          localStr(s.startTs),
          localStr(s.endTs),
          s.durationSec || 0,
          secsToHHMMSS(s.durationSec || 0),
          s.dateKey,
          s.objetivoMin || ""
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

  } // end onRegistroReady

  // Poll until window.registroProcesado is available
  let pollHandle = null;
  function startPolling(){
    if(getRegistroSafe()){
      onRegistroReady(getRegistroSafe());
      return;
    }
    const notice = root;
    notice.innerHTML = "<div style='padding:12px;'>Esperando datos procesados por 'Registro de eventos'... (asegúrate de que la vista Registro exponga window.registroProcesado)</div>";
    pollHandle = setInterval(()=>{
      const r = getRegistroSafe();
      if(r){
        clearInterval(pollHandle);
        onRegistroReady(r);
      }
    },800);
  }
  startPolling();
} // end renderStatsGeneral

// export function for non-module environments (optional)
if(typeof window !== "undefined") window.renderStatsGeneral = window.renderStatsGeneral || renderStatsGeneral;
export { renderStatsGeneral };













