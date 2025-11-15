// ====================================================
// estadisticas.js
// ====================================================

import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

// ---------------- CONFIG ----------------
const firebaseConfig = {
  apiKey: "AIzaSyCby9oxzPzBDllkzuW21ZoGNJh67UgYZ8E",
  authDomain: "notion-timers-2a3bb.firebaseapp.com",
  databaseURL: "https://notion-timers-2a3bb-default-rtdb.firebaseio.com",
  projectId: "notion-timers-2a3bb",
  storageBucket: "notion-timers-2a3bb.firebasestorage.app",
  messagingSenderId: "78500747038",
  appId: "1:78500747038:web:2b5fdec3731a203c7f1b0f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const statsContainer = document.getElementById("statsGeneralEmbed");
const MY_UID = "C3sby2bvibR0KBGagMXMdB13WMa2";

// ---------------- UTIL ----------------
function formatTime(totalSec){
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ---------------- MAIN ----------------
export async function renderStatsGeneral(){
  statsContainer.innerHTML = "<p>Cargando estadísticas...</p>";

  try{
    const userRef = ref(db, `usuarios/${MY_UID}/cronometros`);
    const snapshot = await get(userRef);
    const cron = snapshot.val() || {};
    const rows = [];

    // --- RECOLECCIÓN DE DATOS ---
    const processTimers = (timers, dayId, day_start, day_end)=>{
      timers.forEach(t=>{
        rows.push({
          dayId,
          name: t.name,
          target_min: t.target || 0,
          elapsed_sec: t.elapsed || 0,
          completed: t.completed,
          note: t.note || "",
          createdAt: t.createdAt ? new Date(t.createdAt) : null,
          dayStarted: day_start ? new Date(day_start) : null,
          dayEnded: day_end ? new Date(day_end) : null
        });
      });
    }

    if(cron.historico){
      Object.entries(cron.historico).forEach(([dayid, dayobj])=>{
        processTimers(dayobj.timers || [], dayid, dayobj.dayStarted, dayobj.dayEnded);
      });
    }

    if(cron.diaActual){
      processTimers(cron.diaActual.timers || [], "diaActual", cron.diaActual.dayStarted, cron.diaActual.dayEnded);
    }

    // --- NORMALIZAR DATOS ---
    rows.forEach(r=>{
      r.elapsed_sec = r.elapsed_sec || 0;
      r.target_min = r.target_min || 0;
    });

    // --- ESTADÍSTICAS TOTALES ---
    const total_time_sec = rows.reduce((sum,r)=>sum+r.elapsed_sec,0);
    const total_time_str = formatTime(total_time_sec);
    const dayIds = [...new Set(rows.map(r=>r.dayId))];
    const total_days = dayIds.length;
    const dateSet = new Set(rows.map(r=>r.createdAt?.toDateString()).filter(Boolean));
    const total_dates = dateSet.size;

    // --- ESTADÍSTICAS POR DÍA ---
    const dayStats = {};
    dayIds.forEach(d=>{
      const r = rows.filter(x=>x.dayId === d);
      const total_sec = r.reduce((sum,x)=>sum+x.elapsed_sec,0);
      const target_min = r.reduce((sum,x)=>sum+x.target_min,0);
      const n_turnos = r.length;
      const total_min = total_sec/60;
      const remaining_min = target_min - total_min;
      const avg_activity_min = total_min/n_turnos;
      const success = total_min >= target_min;
      dayStats[d] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success, timers:r };
    });

    // --- ESTADÍSTICAS POR FECHA ---
    const dateStats = {};
    dateSet.forEach(ds=>{
      const r = rows.filter(x=>x.createdAt && x.createdAt.toDateString()===ds);
      const total_sec = r.reduce((sum,x)=>sum+x.elapsed_sec,0);
      const target_min = r.reduce((sum,x)=>sum+x.target_min,0);
      const n_turnos = r.length;
      const total_min = total_sec/60;
      const remaining_min = target_min - total_min;
      const avg_activity_min = total_min/n_turnos;
      const success = total_min >= target_min;
      dateStats[ds] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success, timers:r };
    });

    // --- RENDERS ---
    statsContainer.innerHTML = `
      <div style="background:#222;color:#fff;padding:15px;border-radius:10px;">
        <h3>📘 Estadísticas Totales</h3>
        <p>⏳ Tiempo total acumulado: ${total_time_str}</p>
        <p>📅 Número total de días: ${total_days}</p>
        <p>📆 Número total de fechas: ${total_dates}</p>
        <hr style="border-color:#555;" />
        <div style="display:flex; gap:20px;">
          <div style="flex:1;">
            <h3>📗 Historial por Día</h3>
            <div id="checklistDias"></div>
            <div id="detalleDia"></div>
            <canvas id="chartDias" style="margin-top:10px;"></canvas>
          </div>
          <div style="flex:1;">
            <h3>📙 Historial por Fecha</h3>
            <div id="checklistFechas"></div>
            <div id="detalleFecha"></div>
            <canvas id="chartFechas" style="margin-top:10px;"></canvas>
          </div>
        </div>
        <button id="refreshStats" style="margin-top:10px;padding:6px 12px;border-radius:6px;">🔄 Actualizar</button>
      </div>
    `;

    // --- CHECKLIST POR DÍA ---
    const checklistDias = document.getElementById("checklistDias");
    Object.keys(dayStats).forEach(d=>{
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.cursor = "pointer";
      label.innerHTML = `<input type="checkbox" value="${d}" checked> ${d}`;
      checklistDias.appendChild(label);
    });

    // --- CHECKLIST POR FECHA ---
    const checklistFechas = document.getElementById("checklistFechas");
    Object.keys(dateStats).forEach(ds=>{
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.cursor = "pointer";
      label.innerHTML = `<input type="checkbox" value="${ds}" checked> ${ds}`;
      checklistFechas.appendChild(label);
    });

    // --- FUNCIONES DE RENDER DETALLES ---
    function renderDetalleDia(selectedDays){
      const cont = document.getElementById("detalleDia");
      cont.innerHTML = selectedDays.map(d=>{
        const s = dayStats[d];
        return `<div style="background:#1b3320;margin:4px;padding:6px;border-radius:6px;">
          <b>${d}</b> - Tiempo: ${s.total_min.toFixed(1)} min, Restante: ${s.remaining_min.toFixed(1)} min, Media: ${s.avg_activity_min.toFixed(1)} min, Cumplió: ${s.success?"✔️":"❌"}
          <ul>${s.timers.map(t=>`<li>${t.name}: ${formatTime(t.elapsed_sec)}</li>`).join("")}</ul>
        </div>`;
      }).join("");
    }

    function renderDetalleFecha(selectedDates){
      const cont = document.getElementById("detalleFecha");
      cont.innerHTML = selectedDates.map(ds=>{
        const s = dateStats[ds];
        return `<div style="background:#3b2c00;margin:4px;padding:6px;border-radius:6px;">
          <b>${ds}</b> - Tiempo: ${s.total_min.toFixed(1)} min, Restante: ${s.remaining_min.toFixed(1)} min, Media: ${s.avg_activity_min.toFixed(1)} min, Cumplió: ${s.success?"✔️":"❌"}
          <ul>${s.timers.map(t=>`<li>${t.name}: ${formatTime(t.elapsed_sec)}</li>`).join("")}</ul>
        </div>`;
      }).join("");
    }

    // --- EVENTOS DE CHECKLIST ---
    checklistDias.querySelectorAll("input").forEach(ch=>{
      ch.onchange = ()=> {
        const selected = Array.from(checklistDias.querySelectorAll("input:checked")).map(c=>c.value);
        renderDetalleDia(selected);
        renderChartDias(selected);
      }
    });
    checklistFechas.querySelectorAll("input").forEach(ch=>{
      ch.onchange = ()=> {
        const selected = Array.from(checklistFechas.querySelectorAll("input:checked")).map(c=>c.value);
        renderDetalleFecha(selected);
        renderChartFechas(selected);
      }
    });

    renderDetalleDia(Object.keys(dayStats));
    renderDetalleFecha(Object.keys(dateStats));

    // --- GRÁFICOS ---
    function renderChartDias(selected){
      const ctx = document.getElementById("chartDias").getContext("2d");
      if(window.chartDias) window.chartDias.destroy();
      window.chartDias = new Chart(ctx,{
        type:'bar',
        data:{
          labels:selected,
          datasets:[{
            label:'Tiempo total (min)',
            data:selected.map(d=>dayStats[d].total_min.toFixed(1)),
            backgroundColor:'rgba(59,93,209,0.6)',
            borderColor:'rgba(59,93,209,1)',
            borderWidth:1
          }]
        },
        options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
      });
    }

    function renderChartFechas(selected){
      const ctx = document.getElementById("chartFechas").getContext("2d");
      if(window.chartFechas) window.chartFechas.destroy();
      window.chartFechas = new Chart(ctx,{
        type:'line',
        data:{
          labels:selected,
          datasets:[{
            label:'Tiempo total (min)',
            data:selected.map(ds=>dateStats[ds].total_min.toFixed(1)),
            fill:true,
            backgroundColor:'rgba(26,47,122,0.2)',
            borderColor:'rgba(26,47,122,1)',
            tension:0.3
          }]
        },
        options:{responsive:true, plugins:{legend:{display:true}}, scales:{y:{beginAtZero:true}}}
      });
    }

    renderChartDias(Object.keys(dayStats));
    renderChartFechas(Object.keys(dateStats));

    // --- BOTÓN ACTUALIZAR ---
    document.getElementById("refreshStats").onclick = ()=> renderStatsGeneral();

  } catch(e){
    console.error("Error cargando estadísticas:", e);
    statsContainer.innerHTML = "<p>Error al cargar estadísticas.</p>";
  }
}








