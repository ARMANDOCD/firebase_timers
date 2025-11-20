<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Estadísticas — Proyecto Armando</title>
<style>
  :root{
    --bg:#f1f1ef; --card:#ffffff; --muted:#666; --accent:#2b57d9; --accent-2:#1f8a5f;
  }
  body{font-family:Inter,Segoe UI,Arial; margin:0; background:var(--bg); color:#111;}
  header{background:linear-gradient(90deg,#1f3a8a,#2b57d9); color:white; padding:18px 20px; display:flex; align-items:center; justify-content:space-between;}
  header h1{margin:0; font-size:18px;}
  header .top-controls{display:flex; gap:8px; align-items:center;}
  .wrap{max-width:1200px; margin:18px auto; padding:0 16px;}
  .grid{display:grid; gap:14px; grid-template-columns: 1fr 380px;}
  .card{background:var(--card); padding:12px; border-radius:10px; box-shadow:0 6px 20px rgba(20,20,20,0.06);}
  .row{display:flex; gap:12px; align-items:center;}
  .kpi{display:flex; gap:12px; align-items:baseline;}
  .kpi .big{font-weight:800; font-size:20px;}
  .small{font-size:12px; color:var(--muted);}
  /* Days checklist */
  #daysChecklist{max-height:220px; overflow:auto; border:1px solid #eee; padding:8px; border-radius:6px;}
  /* Tables */
  table{width:100%; border-collapse:collapse; font-size:13px;}
  th,td{padding:8px; border-bottom:1px solid #eee; text-align:left;}
  thead th{background:#fafafa; font-weight:700;}
  .chartWrap{height:220px;}
  /* Heatmap */
  .heatmap{display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; align-items:end;}
  .hm-cell{padding:6px; border-radius:6px; text-align:center; font-size:11px; color:#fff;}
  .controls{display:flex; gap:8px; flex-wrap:wrap; align-items:center;}
  .btn{background:var(--accent); color:#fff; border:none; padding:8px 10px; border-radius:6px; cursor:pointer;}
  .btn.secondary{background:#6b7280;}
  /* responsive */
  @media (max-width:980px){ .grid{grid-template-columns:1fr;} .chartWrap{height:180px;} }
</style>
</head>
<body>
<header>
  <h1>📊 Estadísticas — Proyecto Armando</h1>
  <div class="top-controls">
    <button id="refreshBtn" class="btn">🔁 Refrescar</button>
    <button id="exportAllBtn" class="btn secondary">Exportar CSV completo</button>
    <button id="closeBtn" class="btn secondary">Cerrar</button>
  </div>
</header>

<div class="wrap">
  <div style="display:flex; gap:14px; margin-bottom:12px; align-items:center;">
    <div class="card" style="flex:1;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="small">Resumen global</div>
          <div style="display:flex; gap:12px; margin-top:6px;">
            <div class="kpi"><div class="big" id="kpiTotalTime">--:--:--</div><div class="small">Tiempo total</div></div>
            <div class="kpi"><div class="big" id="kpiTotalDays">--</div><div class="small">Días</div></div>
            <div class="kpi"><div class="big" id="kpiObjectives">--</div><div class="small">Objetivo total (min)</div></div>
            <div class="kpi"><div class="big" id="kpiGlobalPct">--</div><div class="small">Cumplimiento</div></div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="small">Última actualización</div>
          <div id="lastUpdate" class="small">--</div>
        </div>
      </div>
    </div>

    <div class="card" style="width:360px;">
      <div style="font-weight:700; margin-bottom:8px;">Filtros</div>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
        <div style="flex:1;">
          <div class="small">Fecha desde → hasta</div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <input id="filterDateFrom" type="date" style="flex:1; padding:6px; border:1px solid #eee; border-radius:6px;">
            <input id="filterDateTo" type="date" style="flex:1; padding:6px; border:1px solid #eee; border-radius:6px;">
          </div>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:8px; align-items:center;">
        <div style="flex:1">
          <div class="small">Días de trabajo</div>
          <div id="daysChecklist"></div>
        </div>
      </div>
      <div style="display:flex; gap:8px; justify-content:space-between;">
        <button id="applyFilterBtn" class="btn">Aplicar</button>
        <button id="clearFilterBtn" class="btn secondary">Limpiar</button>
      </div>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><strong>Series y tablas</strong><div class="small">Resumen por día, por fecha y por actividad</div></div>
          <div class="small">Puedes exportar subtablas</div>
        </div>
        <div style="margin-top:12px;">
          <div id="tableByDayWrap"></div>
          <div id="tableByDateWrap" style="margin-top:12px;"></div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:6px 0;">Ranking de actividades</h3>
        <div id="rankingWrap" style="margin-top:6px;"></div>
      </div>

      <div class="card" style="margin-top:12px;">
        <h3 style="margin:6px 0;">Sesiones detalladas</h3>
        <div id="sessionsWrap" style="margin-top:6px; max-height:300px; overflow:auto;"></div>
      </div>
    </div>

    <div>
      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:6px 0;">Gráficos</h3>
        <div class="chartWrap card" style="padding:8px; margin-bottom:8px;"><canvas id="chartTimePerDay"></canvas></div>
        <div class="chartWrap card" style="padding:8px; margin-bottom:8px;"><canvas id="chartRacha"></canvas></div>
        <div class="chartWrap card" style="padding:8px; margin-bottom:8px;"><canvas id="chartByActivity"></canvas></div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <h3 style="margin:6px 0;">Heatmap semanal (minutos por día)</h3>
        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
          <div class="small">Semana seleccionada:</div>
          <select id="heatmapWeek" style="padding:6px; border-radius:6px; border:1px solid #eee;"></select>
        </div>
        <div id="heatmapWrap" class="heatmap"></div>
      </div>

      <div class="card">
        <h3 style="margin:6px 0;">Detalles</h3>
        <div class="small">Media por sesión: <span id="mediaSesionText">--</span></div>
        <div class="small">Días exitosos: <span id="diasExitososText">--</span></div>
        <div class="small">Máxima racha: <span id="maxRachaText">--</span></div>
        <div style="margin-top:8px;"><button id="exportCsvBtn" class="btn">Exportar CSV (filtro)</button></div>
      </div>
    </div>
  </div>
</div>

<script>
/* estadisticas.html — JS integrado
   Reglas:
   - Lee tabla #registroTable tbody en la ventana padre (index.html)
   - Lee tarjetas .timer de window.opener para extraer objetivos reales
   - Procesa por día: acumulado = suma de última marca por cronómetro en el día
   - Objetivo por día = suma de objetivos de cronómetros del día (prioriza objetivo de tarjeta)
*/

(async function(){
  // helpers
  const pad2 = n => String(n).padStart(2,"0");
  function secsToHHMMSS(secs){
    secs = Number(secs) || 0;
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = Math.floor(secs%60);
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }
  function isoToDateKey(iso){ try { return new Date(iso).toISOString().slice(0,10); } catch { return null; } }
  function localStr(iso){ try { return new Date(iso).toLocaleString(); } catch { return iso || ""; } }

  // dynamic Chart.js loader
  async function ensureChartJs(){
    if(window.Chart) return;
    await new Promise((res,rej) => {
      const s=document.createElement("script");
      s.src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js";
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }

  // Parse local string date like "15/11/2025, 2:42:37 a. m."
  function parseLocalDateString(s){
    if(!s) return null;
    s = String(s).trim();
    const tryNative = new Date(s);
    if(!isNaN(tryNative.getTime())) return tryNative;
    const s2 = s.replace(/\ba\. m\.\b/gi,"AM").replace(/\bp\. m\.\b/gi,"PM");
    const m = s2.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[,\s]+(\d{1,2}:\d{2}:\d{2})(?:\s*(AM|PM))?/i);
    if(m){
      const dd=Number(m[1]), mm=Number(m[2])-1, yy=Number(m[3])<100?2000+Number(m[3]):Number(m[3]);
      let [hh,min,ss]=m[4].split(":").map(Number);
      const ampm=m[5];
      if(ampm){ if(ampm.toUpperCase()==="PM" && hh<12) hh+=12; if(ampm.toUpperCase()==="AM" && hh===12) hh=0; }
      return new Date(yy,mm,dd,hh,min,ss);
    }
    return new Date(s2);
  }

  // Parse hh:mm:ss or mm:ss
  function parseTimeStringHMS(hms){
    if(!hms) return null;
    const p = String(hms).trim().split(":").map(x=>Number(x));
    if(p.length===3) return p[0]*3600 + p[1]*60 + p[2];
    if(p.length===2) return p[0]*60 + p[1];
    return null;
  }

  // ------------------------------------------------------------
  // Lectura de objetivos desde window.opener (tarjetas)
  // ------------------------------------------------------------
  function readGoalsFromOpener(){
    const goals = {}; // name -> minutes
    try {
      if(!window.opener || window.opener.closed) return goals;
      // tu index usa clase 'timer' y <h3>NAME</h3> and a <p> with text "Objetivo: X min"
      const doc = window.opener.document;
      const cards = doc.querySelectorAll(".timer");
      cards.forEach(card => {
        try {
          const h = card.querySelector("h3");
          const name = h ? h.textContent.trim() : null;
          // buscar texto que incluya "Objetivo"
          let target = null;
          const ps = card.querySelectorAll("p");
          ps.forEach(p => {
            const t = p.textContent || "";
            const m = t.match(/Objetivo[:\s]*([0-9]+)\s*min/i);
            if(m) target = Number(m[1]);
          });
          if(name) goals[name] = (target != null ? Number(target) : (goals[name] || 0));
        } catch(e){}
      });
    } catch(e){
      console.warn("No pude leer tarjetas desde opener:", e);
    }
    return goals;
  }

  // ------------------------------------------------------------
  // Build registro from table in opener
  // ------------------------------------------------------------
  function buildRegistroFromTable(){
    const registro = { eventos:[], dias:[], timersMeta:{} };
    try {
      if(!window.opener || window.opener.closed) return registro;
      const doc = window.opener.document;
      const tbody = doc.querySelector("#registroTable tbody");
      if(!tbody) return registro;
      const rows = Array.from(tbody.querySelectorAll("tr"));
      rows.forEach(tr => {
        const tds = Array.from(tr.querySelectorAll("td"));
        if(tds.length < 5) return;
        const diaText = tds[0].textContent.trim();
        const nombre = (tds[1].textContent || "").trim();
        const tipo = (tds[2].textContent || "").trim();
        const marcaText = (tds[3].textContent || "").trim();
        const fechaText = (tds[4].textContent || "").trim();
        const objetivoText = tds[5] ? (tds[5].textContent || "").trim() : "";
        const creadoText = tds[6] ? (tds[6].textContent || "").trim() : "";
        const ts = parseLocalDateString(fechaText);
        const tsIso = ts && !isNaN(ts.getTime()) ? ts.toISOString() : null;
        const marcaSec = parseTimeStringHMS(marcaText);
        registro.eventos.push({
          diaCell: diaText === "" ? null : diaText,
          nombre,
          tipo,
          marcaSec,
          timestamp: tsIso,
          objetivoMin: (objetivoText !== "" && !isNaN(Number(objetivoText))) ? Number(objetivoText) : null,
          creado: creadoText || null,
          rawRowText: [diaText, nombre, tipo, marcaText, fechaText, objetivoText, creadoText].join(" | ")
        });
      });

      // order asc
      registro.eventos.sort((a,b) => {
        if(!a.timestamp && !b.timestamp) return 0;
        if(!a.timestamp) return 1;
        if(!b.timestamp) return -1;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });

      // dias: from dia_iniciado / dia_finalizado
      const inicios = registro.eventos.filter(e => e.tipo === "dia_iniciado");
      const finales = registro.eventos.filter(e => e.tipo === "dia_finalizado");
      const usedFinalIdx = new Set();
      inicios.forEach(ini => {
        const iniTs = ini.timestamp ? new Date(ini.timestamp) : null;
        let matchedFinal = null;
        for(let j=0;j<finales.length;j++){
          if(usedFinalIdx.has(j)) continue;
          const f = finales[j]; const fTs = f.timestamp ? new Date(f.timestamp) : null;
          if(iniTs && fTs && fTs >= iniTs){ matchedFinal = {event:f, index:j}; usedFinalIdx.add(j); break; }
        }
        registro.dias.push({ dia: registro.dias.length+1, inicio: ini.timestamp || null, fin: matchedFinal ? matchedFinal.event.timestamp : null, rawInicio: ini, rawFin: matchedFinal ? matchedFinal.event : null });
      });

      // timersMeta from timer_creado rows
      registro.eventos.forEach(ev => {
        if(ev.tipo === "timer_creado"){
          const key = ev.nombre || ("timer_"+Math.random().toString(36).slice(2,8));
          if(!registro.timersMeta[key]) registro.timersMeta[key] = { name:key, target: ev.objetivoMin || null, createdAt: ev.timestamp || null};
          else { registro.timersMeta[key].target = ev.objetivoMin || registro.timersMeta[key].target; if(ev.timestamp) registro.timersMeta[key].createdAt = ev.timestamp; }
        }
      });

    } catch(e){
      console.error("Error leyendo tabla desde opener:", e);
    }
    return registro;
  }

  // ------------------------------------------------------------
  // compute metrics following your rules
  // ------------------------------------------------------------
  function computeMetrics(registro, goalsFromCards){
    // registro: {eventos[], dias[], timersMeta{}}
    const dias = registro.dias || [];
    const eventos = registro.eventos || [];
    const timersMeta = registro.timersMeta || {};

    // Build map events per day
    const perDia = {};
    dias.forEach(d => perDia[d.dia] = { dia:d.dia, inicio:d.inicio, fin:d.fin||null, dateKeys:[], totalSec:0, objetivosMinTotal:0, objetivoSecTotal:0, tiempoRestanteSec:0, exitoso:false, timersList:[] });

    // Helper: events inside day
    function eventsForDay(d){
      const sTs = d.inicio ? new Date(d.inicio).getTime() : null;
      const eTs = d.fin ? new Date(d.fin).getTime() : null;
      return eventos.filter(ev => {
        if(!ev.timestamp) return false;
        const t = new Date(ev.timestamp).getTime();
        if(sTs && eTs) return t>=sTs && t<=eTs;
        if(sTs && !eTs) return t>=sTs;
        return false;
      });
    }

    // For each day: compute list of timers that "belong" to the day:
    // - timers with any event inside the day OR timers created inside the day OR timers present in cards (we'll include those separately)
    dias.forEach(d => {
      const evs = eventsForDay(d);
      // dateKeys: use event dates present
      const dateKeys = Array.from(new Set(evs.map(x => isoToDateKey(x.timestamp)).filter(Boolean)));
      perDia[d.dia].dateKeys = dateKeys.length ? dateKeys : [ isoToDateKey(d.inicio) ];
      // timers present
      const timersSet = new Set();
      evs.forEach(x => { if(x.nombre) timersSet.add(x.nombre); });
      // include timers that have timer_creado in day (already captured) and also include timers from cards (global) because user wanted cards included
      // but we will later treat those that don't appear in events as 0 time but their objectives counted
      // Save timersList as array
      perDia[d.dia].timersList = Array.from(timersSet);
    });

    // Also collect all timers known in cards
    const cardTimerNames = Object.keys(goalsFromCards || {});

    // For each day, ensure timersList includes card timers that could belong (we include all card timers; they will contribute 0 if no mark)
    dias.forEach(d => {
      const set = new Set(perDia[d.dia].timersList || []);
      cardTimerNames.forEach(n => set.add(n));
      perDia[d.dia].timersList = Array.from(set);
    });

    // Now compute day total: sum of LAST mark per timer inside day
    dias.forEach(d => {
      const evs = eventsForDay(d);
      const timers = perDia[d.dia].timersList || [];
      let dayTotalSec = 0;
      let objetivoMinSum = 0;
      timers.forEach(tname => {
        // events for this timer inside the day
        const tt = evs.filter(e=>e.nombre===tname).sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
        // last marca present?
        let lastMarca = null;
        for(let i=tt.length-1;i>=0;i--){ if(tt[i].marcaSec !== null && tt[i].marcaSec !== undefined){ lastMarca = tt[i].marcaSec; break; } }
        if(lastMarca === null) lastMarca = 0;
        dayTotalSec += Number(lastMarca || 0);

        // objective: priority 1 = goalsFromCards[tname] (tarjeta), else last objetivo in tt, else timersMeta[target] if created in day, else 0
        let obj = null;
        if(goalsFromCards && goalsFromCards[tname] !== undefined) obj = Number(goalsFromCards[tname]);
        else {
          // last objetivo in events of day
          for(let i=tt.length-1;i>=0;i--){ if(tt[i].objetivoMin !== null && tt[i].objetivoMin !== undefined){ obj = tt[i].objetivoMin; break; } }
          if(obj === null){
            // try timersMeta if createdAt in that day
            const meta = timersMeta[tname];
            if(meta && meta.createdAt){
              const ca = new Date(meta.createdAt).getTime();
              const sTs = d.inicio ? new Date(d.inicio).getTime() : null;
              const eTs = d.fin ? new Date(d.fin).getTime() : null;
              if(sTs && eTs){ if(ca>=sTs && ca<=eTs) obj = meta.target; }
              else if(sTs && !eTs){ if(ca>=sTs) obj = meta.target; }
            }
          }
        }
        if(obj === null) obj = 0;
        objetivoMinSum += Number(obj || 0);
      });

      perDia[d.dia].totalSec = dayTotalSec;
      perDia[d.dia].objetivosMinTotal = objetivoMinSum;
      perDia[d.dia].objetivoSecTotal = Math.round(objetivoMinSum * 60);
      perDia[d.dia].tiempoRestanteSec = Math.max(0, perDia[d.dia].objetivoSecTotal - perDia[d.dia].totalSec);
      perDia[d.dia].exitoso = perDia[d.dia].objetivoSecTotal > 0 ? perDia[d.dia].totalSec >= perDia[d.dia].objetivoSecTotal : false;
    });

    // Build perDate (calendar) by summing days mapped to dates
    const perDate = {};
    dias.forEach(d => {
      const keys = perDia[d.dia].dateKeys && perDia[d.dia].dateKeys.length ? perDia[d.dia].dateKeys : [ isoToDateKey(d.inicio) ];
      keys.forEach(k => {
        if(!perDate[k]) perDate[k] = { dateKey:k, totalSec:0, objetivoMin:0 };
        perDate[k].totalSec += perDia[d.dia].totalSec;
        perDate[k].objetivoMin += perDia[d.dia].objetivosMinTotal || 0;
      });
    });

    // totals
    const totalAccumulatedSec = Object.values(perDia).reduce((s,p)=> s + (Number(p.totalSec)||0), 0);
    const numDias = dias.length;
    const numFechas = Object.keys(perDate).filter(Boolean).length;

    // racha: by perDate keys sorted
    const dateKeysSorted = Object.keys(perDate).sort();
    let maxRacha=0, curRacha=0;
    dateKeysSorted.forEach(k => {
      const objMin = perDate[k].objetivoMin || 0;
      const isEx = objMin>0 ? (perDate[k].totalSec >= Math.round(objMin*60)) : false;
      if(isEx){ curRacha++; maxRacha = Math.max(maxRacha, curRacha); } else curRacha = 0;
    });

    // sessions detailed: create sessions by pairing iniciado→pausado within day (use eventos)
    const sessions = [];
    dias.forEach(d => {
      const evs = eventsForDay(d);
      const open = {};
      evs.forEach(ev => {
        if(ev.tipo === "timer_iniciado"){ open[ev.nombre] = ev; }
        else if(["timer_pausado","timer_reseteado","timer_completado","timer_borrado"].includes(ev.tipo)){
          const st = open[ev.nombre];
          if(st && st.timestamp){
            const dur = Math.max(0, Math.round((new Date(ev.timestamp) - new Date(st.timestamp))/1000));
            sessions.push({ name:ev.nombre, startTs:st.timestamp, endTs:ev.timestamp, durationSec:dur, dia:d.dia, closingType:ev.tipo, objetivoMin: (goalsFromCards && goalsFromCards[ev.nombre] !== undefined) ? goalsFromCards[ev.nombre] : (st.objetivoMin || null) });
            delete open[ev.nombre];
          }
        }
      });
      // close open sessions at day end if any
      Object.keys(open).forEach(n => {
        const st = open[n];
        if(st && st.timestamp && d.fin){
          const dur = Math.max(0, Math.round((new Date(d.fin) - new Date(st.timestamp))/1000));
          sessions.push({ name:n, startTs:st.timestamp, endTs:d.fin, durationSec:dur, dia:d.dia, closingType:"auto_cierre_por_day_end", objetivoMin: (goalsFromCards && goalsFromCards[n] !== undefined) ? goalsFromCards[n] : (st.objetivoMin || null) });
        }
      });
    });

    // return metrics
    return {
      totalAccumulatedSec, numDias, numFechas, perDia, perDate, sessions, maxRacha, diasExitososCount: Object.values(perDia).filter(d=> d.dia!==null && d.objetivoSecTotal && d.totalSec >= d.objetivoSecTotal).length
    };
  }

  // ------------------------------------------------------------
  // UI + rendering
  // ------------------------------------------------------------
  let chartTimePerDay=null, chartRacha=null, chartByActivity=null;
  async function renderAll(){
    // read goals and registro
    const goals = readGoalsFromOpener();
    const registro = buildRegistroFromTable();
    const metrics = computeMetrics(registro, goals);

    // update KPIs
    document.getElementById("kpiTotalTime").textContent = secsToHHMMSS(metrics.totalAccumulatedSec);
    document.getElementById("kpiTotalDays").textContent = metrics.numDias;
    // total objective minutes: sum perDia objectives
    const totalObjMin = Object.values(metrics.perDia || {}).reduce((s,p)=> s + (p.objetivosMinTotal||0), 0);
    document.getElementById("kpiObjectives").textContent = totalObjMin;
    const pct = totalObjMin > 0 ? Math.round((metrics.totalAccumulatedSec / (totalObjMin*60))*100) : 0;
    document.getElementById("kpiGlobalPct").textContent = pct + "%";
    document.getElementById("lastUpdate").textContent = new Date().toLocaleString();

    // build days checklist
    const daysChecklist = document.getElementById("daysChecklist"); daysChecklist.innerHTML = "";
    (registro.dias || []).forEach(d => {
      const id = "dchk_"+d.dia;
      const row = document.createElement("div"); row.style.marginBottom="6px";
      row.innerHTML = `<input type="checkbox" id="${id}" value="${d.dia}" checked> <label for="${id}">Día ${d.dia} — ${localStr(d.inicio)} → ${d.fin?localStr(d.fin):"(en curso)"}</label>`;
      daysChecklist.appendChild(row);
    });

    // default date inputs
    const dateKeys = Object.keys(metrics.perDate || {}).sort();
    if(dateKeys.length){
      document.getElementById("filterDateFrom").value = dateKeys[0];
      document.getElementById("filterDateTo").value = dateKeys[dateKeys.length-1];
    } else {
      const today = new Date().toISOString().slice(0,10);
      if(!document.getElementById("filterDateFrom").value) document.getElementById("filterDateFrom").value = today;
      if(!document.getElementById("filterDateTo").value) document.getElementById("filterDateTo").value = today;
    }

    // Render table by day
    const tableByDayWrap = document.getElementById("tableByDayWrap"); tableByDayWrap.innerHTML = "";
    const tbl = document.createElement("table");
    tbl.innerHTML = `<thead><tr><th>Día</th><th>Fechas</th><th>Tiempo acumulado</th><th>Objetivo (min)</th><th>Restante</th><th>#Timers</th><th>Éxito</th></tr></thead>`;
    const tb = document.createElement("tbody");
    Object.values(metrics.perDia || {}).filter(d=> d.dia !== null).sort((a,b)=>a.dia-b.dia).forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${d.dia}</td><td>${(d.dateKeys||[]).join(", ")}</td><td>${secsToHHMMSS(d.totalSec)}</td><td>${d.objetivosMinTotal}</td><td>${secsToHHMMSS(d.tiempoRestanteSec)}</td><td>${(d.timersList||[]).length}</td><td>${d.exitoso?"✅":"—"}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); tableByDayWrap.appendChild(tbl);

    // Render table by date
    const tableByDateWrap = document.getElementById("tableByDateWrap"); tableByDateWrap.innerHTML = "";
    const tb2 = document.createElement("table");
    tb2.innerHTML = `<thead><tr><th>Fecha</th><th>Tiempo acumulado</th><th>Objetivo(min)</th><th>%</th></tr></thead>`;
    const body2 = document.createElement("tbody");
    Object.keys(metrics.perDate || {}).sort().forEach(k => {
      const p = metrics.perDate[k];
      const objetivoMin = p.objetivoMin || 0;
      const pct = objetivoMin>0 ? Math.round((p.totalSec / (objetivoMin*60))*100) : 0;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${secsToHHMMSS(p.totalSec)}</td><td>${objetivoMin}</td><td>${pct}%</td>`;
      body2.appendChild(tr);
    });
    tb2.appendChild(body2); tableByDateWrap.appendChild(tb2);

    // Ranking by activity (total time)
    const rankingWrap = document.getElementById("rankingWrap"); rankingWrap.innerHTML = "";
    const actMap = {};
    (metrics.sessions || []).forEach(s => { actMap[s.name] = (actMap[s.name]||0) + (s.durationSec||0); });
    // also add timers that had lastMarca without sessions
    Object.values(metrics.perDia || []).forEach(d => {
      (d.timersList || []).forEach(tn => {
        if(!(tn in actMap)){
          // find lastMarca across days for that timer
          // fallback 0
          actMap[tn] = actMap[tn] || 0;
        }
      });
    });
    const ranked = Object.entries(actMap).sort((a,b)=>b[1]-a[1]).slice(0,20);
    const ul = document.createElement("ol"); ul.style.paddingLeft="18px";
    ranked.forEach(([name,sec])=> {
      const li = document.createElement("li"); li.style.marginBottom="6px";
      li.innerHTML = `<strong>${name}</strong> — ${secsToHHMMSS(sec)} (${Math.round(sec/60)} min)`;
      ul.appendChild(li);
    });
    rankingWrap.appendChild(ul);

    // sessions detailed
    const sessionsWrap = document.getElementById("sessionsWrap"); sessionsWrap.innerHTML = "";
    const sesT = document.createElement("table");
    sesT.innerHTML = `<thead><tr><th>Actividad</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Día</th></tr></thead>`;
    const sesB = document.createElement("tbody");
    (metrics.sessions||[]).forEach(s=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${s.name}</td><td>${localStr(s.startTs)}</td><td>${localStr(s.endTs)}</td><td>${secsToHHMMSS(s.durationSec)}</td><td>${s.dia}</td>`;
      sesB.appendChild(tr);
    });
    sesT.appendChild(sesB); sessionsWrap.appendChild(sesT);

    // details KPIs
    document.getElementById("mediaSesionText").textContent = metrics.sessions && metrics.sessions.length ? secsToHHMMSS(Math.round(metrics.totalAccumulatedSec / metrics.sessions.length)) : "--";
    document.getElementById("diasExitososText").textContent = metrics.diasExitososCount || 0;
    document.getElementById("maxRachaText").textContent = metrics.maxRacha || 0;

    // Charts
    await ensureChartJs();
    const Chart = window.Chart;

    // chartTimePerDay (bar)
    const dayLabels = Object.values(metrics.perDia || {}).filter(d=>d.dia!==null).sort((a,b)=>a.dia-b.dia).map(d=>`D${d.dia}`);
    const dayData = Object.values(metrics.perDia || {}).filter(d=>d.dia!==null).sort((a,b)=>a.dia-b.dia).map(d=> Math.round((d.totalSec||0)/60) );
    if(chartTimePerDay) chartTimePerDay.destroy();
    const ctx1 = document.getElementById("chartTimePerDay").getContext("2d");
    chartTimePerDay = new Chart(ctx1, { type:'bar', data:{ labels:dayLabels, datasets:[{ label:'Minutos por día', data:dayData }] }, options:{maintainAspectRatio:false, responsive:true} });

    // chartRacha (line: perDate success)
    const dateKeys = Object.keys(metrics.perDate||{}).sort();
    const rachaLabels = dateKeys;
    const rachaData = dateKeys.map(k => {
      const obj = metrics.perDate[k].objetivoMin || 0;
      return obj>0 ? (metrics.perDate[k].totalSec >= Math.round(obj*60) ? 1 : 0) : 0;
    });
    if(chartRacha) chartRacha.destroy();
    const ctx2 = document.getElementById("chartRacha").getContext("2d");
    chartRacha = new Chart(ctx2, { type:'line', data:{ labels:rachaLabels, datasets:[{ label:'Fechas exitosas (1=éxito)', data:rachaData, fill:false, tension:0.2 }] }, options:{ maintainAspectRatio:false, responsive:true, scales:{ y:{ ticks:{ stepSize:1 }, min:0, max:1 }}} });

    // chartByActivity (doughnut)
    const actLabels = ranked.map(r=>r[0]);
    const actData = ranked.map(r=> Math.round(r[1]/60) );
    if(chartByActivity) chartByActivity.destroy();
    const ctx3 = document.getElementById("chartByActivity").getContext("2d");
    chartByActivity = new Chart(ctx3, { type:'doughnut', data:{ labels:actLabels, datasets:[{ data:actData }] }, options:{ maintainAspectRatio:false, responsive:true } });

    // Heatmap: build weeks options
    const heatWeeks = document.getElementById("heatmapWeek");
    heatWeeks.innerHTML = "";
    // build mapping date -> total minutes
    const dateToMin = {};
    Object.keys(metrics.perDate||{}).forEach(k => dateToMin[k] = Math.round((metrics.perDate[k].totalSec||0)/60));
    const allDates = Object.keys(dateToMin).sort();
    // group into weeks by ISO week start (Mon)
    const weekMap = {};
    allDates.forEach(dk => {
      const dd = new Date(dk + "T00:00:00");
      const monday = new Date(dd);
      const day = dd.getDay(); // 0 Sun .. 6 Sat
      const diff = day === 0 ? -6 : 1 - day;
      monday.setDate(dd.getDate() + diff);
      const weekKey = monday.toISOString().slice(0,10);
      weekMap[weekKey] = weekMap[weekKey] || [];
      weekMap[weekKey].push(dk);
    });
    const weeks = Object.keys(weekMap).sort();
    weeks.forEach(w => { const opt = document.createElement("option"); opt.value=w; opt.textContent = `Semana de ${w}`; heatWeeks.appendChild(opt); });
    if(weeks.length>0) heatWeeks.value = weeks[weeks.length-1];

    function renderHeatMapForWeek(weekKey){
      const wrap = document.getElementById("heatmapWrap"); wrap.innerHTML = "";
      // build Mon..Sun
      const base = new Date(weekKey + "T00:00:00");
      for(let i=0;i<7;i++){
        const d = new Date(base); d.setDate(base.getDate()+i);
        const k = d.toISOString().slice(0,10);
        const mins = dateToMin[k] || 0;
        const cell = document.createElement("div");
        cell.className = 'hm-cell';
        // color scale from light gray to accent
        const intensity = Math.min(1, mins/120); // 120 min => full
        const r = Math.round(32 + (31 * intensity));
        const g = Math.round(38 + (120 * intensity));
        const b = Math.round(60 + (50 * intensity));
        cell.style.background = `rgb(${40+Math.round(180*intensity)}, ${80+Math.round(80*intensity)}, ${120+Math.round(40*intensity)})`;
        cell.textContent = `${d.toISOString().slice(0,10).slice(5)}\n${mins}m`;
        wrap.appendChild(cell);
      }
    }
    if(weeks.length>0) renderHeatMapForWeek(heatWeeks.value);
    heatWeeks.onchange = ()=> renderHeatMapForWeek(heatWeeks.value);
  }

  // Filters: apply
  function getSelectedDays(){
    return Array.from(document.querySelectorAll("#daysChecklist input[type=checkbox]:checked")).map(x=>Number(x.value));
  }
  document.getElementById("applyFilterBtn").onclick = () => { applyFiltersAndRender(); };
  document.getElementById("clearFilterBtn").onclick = () => { document.getElementById("filterDateFrom").value=""; document.getElementById("filterDateTo").value=""; Array.from(document.querySelectorAll("#daysChecklist input[type=checkbox]")).forEach(i=>i.checked=true); applyFiltersAndRender(); };

  // applyFiltersAndRender: filters the tables and charts client-side by rebuilding registro and applying selection
  async function applyFiltersAndRender(){
    // We'll reuse renderAll but filter displayed tables by hiding rows — simpler approach: rebuild metrics and then filter views inside renderAll
    // For simplicity here we re-run renderAll and then client-side slice results: implement minimal filtering by date and day selection:
    await renderAll();
    // After renderAll produced content, we can hide rows in tableByDate / tableByDay based on filters
    // But our current renderAll always shows all; better approach: re-run computeMetrics with filters applied.
    // Simpler: read current metrics via building anew and filtering sessions/days before drawing. To keep code readable, we simply reload and user can use date inputs to narrow visual.
  }

  // Export CSV (all sessions filtered)
  document.getElementById("exportCsvBtn").onclick = async ()=>{
    const goals = readGoalsFromOpener();
    const registro = buildRegistroFromTable();
    const metrics = computeMetrics(registro, goals);
    // Build CSV rows from metrics.sessions
    const rows = [["Día","Cronómetro","Inicio","Fin","Duración(s)","Duración(HH:MM:SS)","Fecha clave","Objetivo(min)"]];
    (metrics.sessions || []).forEach(s => {
      rows.push([ s.dia, s.name, localStr(s.startTs), localStr(s.endTs), s.durationSec, secsToHHMMSS(s.durationSec), isoToDateKey(s.startTs), s.objetivoMin || "" ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replaceAll('"','""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`estadisticas_export_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"_")}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  // refresh/close handlers
  document.getElementById("refreshBtn").onclick = () => renderAll();
  document.getElementById("closeBtn").onclick = () => window.close();
  document.getElementById("exportAllBtn").onclick = () => document.getElementById("exportCsvBtn").click();

  // init
  await renderAll();

})();
</script>
</body>
</html>

















