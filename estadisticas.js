// estadisticas.js  (OPCIÓN B)
// Lee window.registroProcesado (expuesto por index.renderRegistroEventos)
// Renderiza la UI y calcula todas las métricas solicitadas
// Carga Chart.js dinámicamente

async function ensureChartJs(){
  if(window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
    document.head.appendChild(s);
  });
}

/* ---------- util ---------- */
function pad2(n){ return String(n).padStart(2,"0"); }
function secsToHHMMSS(secs){
  if(secs == null || isNaN(secs)) return "00:00:00";
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}
function dateKeyFromIso(ts){
  if(!ts) return null;
  try { return new Date(ts).toISOString().slice(0,10); } catch(e){ return null; }
}
function localStr(ts){ try { return new Date(ts).toLocaleString(); } catch(e){ return String(ts); } }
function escapeHtml(s){ if(!s && s !== 0) return ""; return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }

/* ---------- cálculo de métricas principales ---------- */
function calcMetricsFromRegistro(reg){

  const dias = Array.isArray(reg.dias) ? reg.dias : [];
  const sessions = Array.isArray(reg.sessions) ? reg.sessions : [];
  const timersMeta = reg.timersMeta || {};

  // total acumulado
  const totalAccumulatedSec = sessions.reduce((s,x)=>s + (Number(x.durationSec)||0), 0);

  // número de días (work days)
  const numDias = dias.length;

  // número de fechas calendario con actividad
  const uniqueDates = new Set(sessions.map(s => s.dateKey).filter(Boolean));
  const numFechas = uniqueDates.size;

  // per-day aggregation
  const perDia = {}; // key = dia (number or 'sin_dia')
  dias.forEach(d => perDia[d.dia] = { dia:d.dia, inicio:d.inicio, fin:d.fin || null, dateKeys: d.dateKeys || [], totalSec:0, sessions:[], objetivosMinTotal:0 });
  if(!perDia["sin_dia"]) perDia["sin_dia"] = { dia:null, totalSec:0, sessions:[], objetivosMinTotal:0, dateKeys:[] };

  sessions.forEach(s => {
    const k = (s.dia === null || s.dia === undefined) ? "sin_dia" : s.dia;
    if(!perDia[k]) perDia[k] = { dia:k, totalSec:0, sessions:[], objetivosMinTotal:0, dateKeys:[] };
    perDia[k].totalSec += (Number(s.durationSec) || 0);
    perDia[k].sessions.push(s);
    if(s.dateKey && !perDia[k].dateKeys.includes(s.dateKey)) perDia[k].dateKeys.push(s.dateKey);
  });

  // compute objetivos por dia (sum targets of timers used that day)
  Object.values(perDia).forEach(d=>{
    const seenTimers = new Set();
    d.sessions.forEach(s => { if(s.timerId) seenTimers.add(s.timerId); });
    let objMin = 0;
    seenTimers.forEach(tid => {
      if(timersMeta && timersMeta[tid] && timersMeta[tid].target) objMin += Number(timersMeta[tid].target);
      else {
        const f = d.sessions.find(x => x.timerId === tid && x.objetivoMin);
        if(f && f.objetivoMin) objMin += Number(f.objetivoMin);
      }
    });
    d.objetivosMinTotal = objMin;
    d.tiempoRestanteSec = Math.max(0, Math.round(objMin*60 - d.totalSec));
    d.exitoso = (objMin > 0) ? (d.totalSec >= Math.round(objetivosMinTotal= Math.round(objMin*60))) : false;
    // note: store numeric objetivo sec for comparisons too
    d.objetivoSecTotal = Math.round(objMin*60);
  });

  // per-date calendar aggregation
  const perDate = {};
  sessions.forEach(s => {
    const k = s.dateKey || dateKeyFromIso(s.startTs);
    if(!perDate[k]) perDate[k] = { dateKey:k, totalSec:0, sessions:[] };
    perDate[k].totalSec += (Number(s.durationSec) || 0);
    perDate[k].sessions.push(s);
  });

  // compute perDate objectives
  const perDateObjetivos = {};
  Object.keys(perDate).forEach(dk => {
    const timersSeen = new Set();
    perDate[dk].sessions.forEach(s => { if(s.timerId) timersSeen.add(s.timerId); });
    let objMin = 0;
    timersSeen.forEach(tid => {
      if(timersMeta && timersMeta[tid] && timersMeta[tid].target) objMin += Number(timersMeta[tid].target);
      else {
        const f = perDate[dk].sessions.find(x => x.timerId === tid && x.objetivoMin);
        if(f && f.objetivoMin) objMin += Number(f.objetivoMin);
      }
    });
    perDateObjetivos[dk] = objMin;
  });

  // compute racha máxima de fechas exitosas (calendar)
  const dateKeysSorted = Object.keys(perDate).sort();
  let maxRacha = 0, curRacha = 0;
  dateKeysSorted.forEach(k=>{
    const objetivoMin = perDateObjetivos[k] || 0;
    const isEx = (objetivoMin > 0) ? (perDate[k].totalSec >= Math.round(objetivoMin*60)) : false;
    if(isEx){ curRacha++; maxRacha = Math.max(maxRacha, curRacha); } else { curRacha = 0; }
  });

  // total dias exitosos (por día de trabajo criterion)
  const diasExitososCount = Object.values(perDia).filter(d => d.dia !== null && d.objetivoSecTotal && d.totalSec >= d.objetivoSecTotal).length;

  // media por sesion / turno
  const sesCount = sessions.length;
  const mediaPorSesion = sesCount ? Math.round(totalAccumulatedSec / sesCount) : 0;
  const mediaPorTurno = mediaPorSesion;

  return {
    totalAccumulatedSec,
    numDias,
    numFechas,
    perDia,
    perDate,
    perDateObjetivos,
    mediaPorSesion,
    mediaPorTurno,
    diasExitososCount,
    maxRacha,
    sessions,
    timersMeta
  };
}

/* ---------- UI rendering ---------- */

async function buildUI(root){
  root.innerHTML = `
    <div id="stats-ui" style="padding:8px">
      <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
        <div style="background:#fff;padding:12px;border-radius:8px;min-width:240px;box-shadow:0 6px 18px rgba(0,0,0,0.06);">
          <div style="font-weight:700">Estadísticas totales</div>
          <div id="totalAccum">Tiempo total acumulado: --:--:--</div>
          <div id="totalDias" class="small">Número de días totales transcurridos: --</div>
          <div id="totalFechas" class="small">Número de fechas totales transcurridas: --</div>
        </div>
        <div id="filters" style="display:flex; gap:8px;">
          <div style="background:#fff;padding:8px;border-radius:8px;min-width:260px;box-shadow:0 6px 12px rgba(0,0,0,0.04);">
            <div style="font-weight:700">Filtrar por Día de trabajo</div>
            <div id="daysChecklist" style="max-height:140px; overflow:auto; margin-top:6px;"></div>
            <div style="margin-top:8px; display:flex; gap:6px;"><button id="selectAllDaysBtn">Seleccionar todo</button><button id="clearDaysBtn">Limpiar</button></div>
          </div>
          <div style="background:#fff;padding:8px;border-radius:8px;min-width:300px;box-shadow:0 6px 12px rgba(0,0,0,0.04);">
            <div style="font-weight:700">Filtrar por Fecha calendario</div>
            <div style="display:flex; gap:6px; margin-top:6px;">
              <input type="date" id="filterDateFrom"><input type="date" id="filterDateTo">
              <button id="applyDateBtn">Aplicar</button><button id="clearDateBtn">Limpiar</button>
            </div>
            <div style="margin-top:6px;display:flex;gap:6px;"><button id="todayBtn">Hoy</button><button id="thisWeekBtn">Esta semana</button><button id="thisMonthBtn">Este mes</button></div>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 420px; gap:12px;">
        <div style="background:#fff;padding:12px;border-radius:8px;">
          <h3 style="margin-top:0">Historial y estadísticas por día</h3>
          <div id="tableByDay"></div>
          <h3 style="margin-top:12px">Historial y estadísticas por fecha</h3>
          <div id="tableByDate"></div>
        </div>
        <div style="background:#fff;padding:12px;border-radius:8px;">
          <h3 style="margin-top:0">Gráficos</h3>
          <div style="height:220px;"><canvas id="chartTimePerDay"></canvas></div>
          <div style="height:220px;margin-top:12px;"><canvas id="chartByActivity"></canvas></div>
          <div style="margin-top:8px;">
            <div><b>Media por sesión:</b> <span id="mediaSesionText">--</span></div>
            <div><b>Media por turno:</b> <span id="mediaTurnoText">--</span></div>
            <div><b>Días exitosos (tot):</b> <span id="diasExitososText">--</span></div>
            <div><b>Máxima racha:</b> <span id="maxRachaText">--</span></div>
          </div>
          <div style="margin-top:10px;"><button id="exportCsvBtn">Exportar CSV del filtro</button></div>
        </div>
      </div>
    </div>
  `;
}

function buildDaysChecklist(dias){
  const container = document.getElementById("daysChecklist");
  container.innerHTML = "";
  dias.forEach(d=>{
    const id = `dchk_${d.dia}`;
    const div = document.createElement("div");
    div.style.display="flex"; div.style.alignItems="center"; div.style.gap="8px";
    const chk = document.createElement("input"); chk.type="checkbox"; chk.id=id; chk.value=d.dia; chk.checked=true;
    chk.onchange = () => updateViews();
    const lbl = document.createElement("label"); lbl.htmlFor = id; lbl.innerHTML = `Día ${d.dia} — ${localStr(d.inicio)} → ${d.fin?localStr(d.fin):"(en curso)"}`;
    div.appendChild(chk); div.appendChild(lbl); container.appendChild(div);
  });
  document.getElementById("selectAllDaysBtn").onclick = () => { Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i=>i.checked=true); updateViews(); };
  document.getElementById("clearDaysBtn").onclick = () => { Array.from(container.querySelectorAll("input[type=checkbox]")).forEach(i=>i.checked=false); updateViews(); };
}

function getSelectedDays(){
  const checks = Array.from(document.querySelectorAll("#daysChecklist input[type=checkbox]"));
  return checks.filter(c=>c.checked).map(c=>Number(c.value));
}

function getDateRange(){
  const f = document.getElementById("filterDateFrom").value;
  const t = document.getElementById("filterDateTo").value;
  if(!f && !t) return null;
  const from = f ? new Date(f + "T00:00:00") : null;
  const to = t ? new Date(t + "T23:59:59") : null;
  return { from, to };
}

async function renderCharts(metrics, registro, sessionsFiltered){
  await ensureChartJs();
  const Chart = window.Chart;

  // chartTimePerDay
  const selDays = new Set(getSelectedDays());
  const labels = []; const data = [];
  registro.dias.slice().sort((a,b)=>a.dia-b.dia).forEach(d=>{
    if(selDays.size && !selDays.has(d.dia)) return;
    const pd = metrics.perDia[d.dia] || { totalSec:0 };
    // if date range applied, skip days not intersecting
    const dr = getDateRange();
    if(dr && dr.from && dr.to){
      const intersect = (d.dateKeys || []).some(k => { const dd = new Date(k + "T00:00:00"); return dd >= dr.from && dd <= dr.to; });
      if(!intersect) return;
    }
    labels.push(`D${d.dia}`); data.push(Math.round((pd.totalSec||0)/60));
  });

  if(window._chartTimePerDay) window._chartTimePerDay.destroy();
  const ctx1 = document.getElementById("chartTimePerDay").getContext("2d");
  window._chartTimePerDay = new Chart(ctx1, { type:"bar", data:{ labels, datasets:[{ label:"Minutos por día", data }] }, options:{ maintainAspectRatio:false, responsive:true } });

  // chartByActivity (pie) based on sessionsFiltered
  const perAct = {};
  sessionsFiltered.forEach(s => { const name = s.name || s.timerId || "sin_nombre"; perAct[name] = (perAct[name]||0) + (Number(s.durationSec)||0); });
  const actLabels = Object.keys(perAct), actData = actLabels.map(l => Math.round(perAct[l]/60));
  if(window._chartByActivity) window._chartByActivity.destroy();
  const ctx2 = document.getElementById("chartByActivity").getContext("2d");
  window._chartByActivity = new Chart(ctx2, { type:"pie", data:{ labels:actLabels, datasets:[{ data:actData }] }, options:{ maintainAspectRatio:false, responsive:true } });
}

/* ---------- render principal (expuesto) ---------- */
export async function renderStatsGeneral(){
  await ensureChartJs();
  const root = document.getElementById("statsGeneralEmbed");
  if(!root){ console.error("No existe #statsGeneralEmbed"); return; }
  await buildUI(root);

  // when registroProcesado ready -> compute and render
  function onRegistro(registro){
    try{
      // normalize inputs
      const reg = registro || window.registroProcesado || { dias:[], sessions:[], timersMeta:{} };
      // ensure dateKeys on dias
      reg.dias = Array.isArray(reg.dias) ? reg.dias : [];
      reg.sessions = Array.isArray(reg.sessions) ? reg.sessions : [];
      reg.timersMeta = reg.timersMeta || {};

      const metrics = calcMetricsFromRegistro(reg);

      // update summary
      document.getElementById("totalAccum").textContent = `Tiempo total acumulado: ${secsToHHMMSS(metrics.totalAccumulatedSec)}`;
      document.getElementById("totalDias").textContent = `Número de días totales transcurridos: ${metrics.numDias}`;
      document.getElementById("totalFechas").textContent = `Número de fechas totales transcurridas: ${metrics.numFechas}`;
      document.getElementById("mediaSesionText").textContent = secsToHHMMSS(metrics.mediaPorSesion);
      document.getElementById("mediaTurnoText").textContent = secsToHHMMSS(metrics.mediaPorTurno);
      document.getElementById("diasExitososText").textContent = metrics.diasExitososCount;
      document.getElementById("maxRachaText").textContent = metrics.maxRacha;

      // build UI controls
      buildDaysChecklist(reg.dias || []);

      // set default date inputs (first..last)
      const dateKeys = Object.keys(metrics.perDate || {}).sort();
      if(dateKeys.length){
        document.getElementById("filterDateFrom").value = dateKeys[0];
        document.getElementById("filterDateTo").value = dateKeys[dateKeys.length-1];
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
        const monday = new Date(now.setDate(diff));
        const sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
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

      document.getElementById("exportCsvBtn").onclick = () => exportCsvFiltered(reg, metrics);

      // initial draw
      updateViews();

      // functions used inside
      function getSelectedDaySet(){ return new Set(getSelectedDays().map(x=>Number(x))); }
      function updateViews(){
        const selDays = getSelectedDaySet();
        const dr = getDateRange();
        const sessionsFiltered = reg.sessions.filter(s => {
          const okDay = (selDays.size === 0) ? true : (s.dia !== null && selDays.has(Number(s.dia)));
          const okDate = (() => {
            if(!dr) return true;
            const d = new Date(s.dateKey + "T00:00:00");
            if(dr.from && d < dr.from) return false;
            if(dr.to && d > dr.to) return false;
            return true;
          })();
          return okDay && okDate;
        });

        // update summary for filtered selection
        const totalSecFiltered = sessionsFiltered.reduce((a,b)=>a + (Number(b.durationSec)||0), 0);
        const sessionsCount = sessionsFiltered.length;
        const avgPerSession = sessionsCount ? Math.round(totalSecFiltered / sessionsCount) : 0;
        document.getElementById("mediaSesionText").textContent = secsToHHMMSS(avgPerSession);
        document.getElementById("mediaTurnoText").textContent = secsToHHMMSS(avgPerSession);

        // dias exitosos en filtro
        const diasExitososFiltrados = Object.values(metrics.perDia).filter(d => {
          if(d.dia === null) return false;
          if(selDays.size && !selDays.has(Number(d.dia))) return false;
          if(dr && dr.from && dr.to){
            const intersect = (d.dateKeys || []).some(k => { const dd = new Date(k + "T00:00:00"); return dd >= dr.from && dd <= dr.to; });
            if(!intersect) return false;
          }
          return (d.objetivoSecTotal && d.totalSec >= d.objetivoSecTotal);
        }).length;
        document.getElementById("diasExitososText").textContent = diasExitososFiltrados;

        // render tables
        renderTableByDay(reg, metrics, sessionsFiltered);
        renderTableByDate(reg, metrics, sessionsFiltered);

        // charts
        renderCharts(metrics, reg, sessionsFiltered);
      }

      function renderTableByDay(reg, metrics, sessionsFiltered){
        const wrap = document.getElementById("tableByDay"); wrap.innerHTML = "";
        const tbl = document.createElement("table"); tbl.style.width="100%"; tbl.style.borderCollapse="collapse";
        tbl.innerHTML = `<thead><tr style="background:#f9f9f9"><th style="padding:8px">Día</th><th style="padding:8px">Fechas</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo (min)</th><th style="padding:8px">Restante</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Éxito</th></tr></thead><tbody></tbody>`;
        const tbody = tbl.querySelector("tbody");
        const diasList = reg.dias.slice().sort((a,b)=>a.dia-b.dia);
        diasList.forEach(d=>{
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
        wrap.appendChild(tbl);
      }

      function renderTableByDate(reg, metrics, sessionsFiltered){
        const wrap = document.getElementById("tableByDate"); wrap.innerHTML = "";
        const tbl = document.createElement("table"); tbl.style.width="100%"; tbl.style.borderCollapse="collapse";
        tbl.innerHTML = `<thead><tr style="background:#f9f9f9"><th style="padding:8px">Fecha</th><th style="padding:8px">Tiempo acumulado</th><th style="padding:8px">Objetivo (min)</th><th style="padding:8px">Sesiones</th><th style="padding:8px">Top actividades</th></tr></thead><tbody></tbody>`;
        const tbody = tbl.querySelector("tbody");
        // aggregate by date from sessionsFiltered
        const map = {};
        sessionsFiltered.forEach(s => {
          const k = s.dateKey || dateKeyFromIso(s.startTs);
          if(!map[k]) map[k] = { dateKey:k, totalSec:0, sessions:[] };
          map[k].totalSec += (Number(s.durationSec)||0);
          map[k].sessions.push(s);
        });
        const dates = Object.keys(map).sort();
        dates.forEach(dk => {
          const pd = map[dk];
          // compute objetivoMin for this date
          const timersSeen = new Set();
          pd.sessions.forEach(s => { if(s.timerId) timersSeen.add(s.timerId); });
          let objMin = 0;
          timersSeen.forEach(tid => {
            if(reg.timersMeta && reg.timersMeta[tid] && reg.timersMeta[tid].target) objMin += Number(reg.timersMeta[tid].target);
            else {
              const f = pd.sessions.find(x => x.timerId === tid && x.objetivoMin);
              if(f && f.objetivoMin) objMin += Number(f.objetivoMin);
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
        wrap.appendChild(tbl);
      }

      function exportCsvFiltered(reg, metrics){
        const selDays = new Set(getSelectedDays().map(x=>Number(x)));
        const dr = getDateRange();
        const rows = [];
        rows.push(["Día","Cronómetro","Inicio","Fin","Duración(s)","Duración(HH:MM:SS)","Fecha clave","Objetivo(min)"]);
        reg.sessions.forEach(s => {
          if(selDays.size && (s.dia === null || !selDays.has(Number(s.dia)))) return;
          if(dr && dr.from && dr.to){
            const dd = new Date(s.dateKey + "T00:00:00");
            if(dd < dr.from || dd > dr.to) return;
          }
          rows.push([ s.dia === null ? "" : s.dia, s.name || s.timerId || "", localStr(s.startTs), localStr(s.endTs), s.durationSec||0, secsToHHMMSS(s.durationSec||0), s.dateKey||"", s.objetivoMin||"" ]);
        });
        const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `estadisticas_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"_")}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      }

    } catch(err){
      console.error("Error procesando registro:", err);
    }
  }

  // wait for registroProcesado: either already present, or wait for event
  if(window.registroProcesado){
    onRegistro(window.registroProcesado);
  } else {
    // listen for event fired by index
    window.addEventListener('registroProcesadoReady', e => { onRegistro(e.detail || window.registroProcesado); }, { once:true });
    // fallback polling short time
    const poll = setInterval(()=>{
      if(window.registroProcesado){
        clearInterval(poll);
        onRegistro(window.registroProcesado);
      }
    },700);
  }
}

// expose for non-module usage
if(typeof window !== "undefined") window.renderStatsGeneral = renderStatsGeneral;
export { renderStatsGeneral };
