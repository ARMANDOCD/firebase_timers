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

// ---------------- CONTENEDOR ----------------
const statsContainer = document.getElementById("statsGeneralEmbed");

// ---------------- UID DEL USUARIO ----------------
const MY_UID = "C3sby2bvibR0KBGagMXMdB13WMa2"; // tu UID

// ---------------- UTIL ----------------
function formatTime(totalSec){
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

// ---------------- MAIN ----------------
export async function renderStatsGeneral() {
  statsContainer.innerHTML = "<p>Cargando estadísticas...</p>";

  try {
    // ---------------- CARGAR DATOS ----------------
    const userRef = ref(db, `usuarios/${MY_UID}/cronometros`);
    const snapshot = await get(userRef);
    const cron = snapshot.val() || {};

    const rows = [];

    // Historial
    if(cron.historico){
      Object.entries(cron.historico).forEach(([dayid, dayobj])=>{
        const timers = dayobj.timers || [];
        timers.forEach(t=>{
          rows.push({
            dayId: dayid,
            name: t.name,
            target_min: t.target || 0,
            elapsed_sec: t.elapsed || 0,
            completed: t.completed,
            note: t.note || "",
            createdAt: t.createdAt ? new Date(t.createdAt) : null,
            dayStarted: dayobj.dayStarted ? new Date(dayobj.dayStarted) : null,
            dayEnded: dayobj.dayEnded ? new Date(dayobj.dayEnded) : null
          });
        });
      });
    }

    // Día actual
    if(cron.diaActual){
      const dia = cron.diaActual;
      const timers = dia.timers || [];
      timers.forEach(t=>{
        rows.push({
          dayId: "diaActual",
          name: t.name,
          target_min: t.target || 0,
          elapsed_sec: t.elapsed || 0,
          completed: t.completed,
          note: t.note || "",
          createdAt: t.createdAt ? new Date(t.createdAt) : null,
          dayStarted: dia.dayStarted ? new Date(dia.dayStarted) : null,
          dayEnded: dia.dayEnded ? new Date(dia.dayEnded) : null
        });
      });
    }

    if(rows.length === 0){
      statsContainer.innerHTML = "<p>No hay actividades registradas.</p>";
      return;
    }

    // ---------------- ESTADÍSTICAS GENERALES ----------------
    const total_time_sec = rows.reduce((sum,r)=>sum+r.elapsed_sec,0);
    const dayIds = [...new Set(rows.map(r=>r.dayId))];
    const total_days = dayIds.length;
    const dateSet = new Set(rows.map(r=>r.createdAt?.toDateString()).filter(Boolean));
    const total_dates = dateSet.size;

    // Estadísticas por día
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
      dayStats[d] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success, activities: r };
    });

    // Estadísticas por fecha
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
      dateStats[ds] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success, activities: r };
    });

    // ---------------- RENDER GENERAL ----------------
    statsContainer.innerHTML = `
      <div style="background:#222;color:#fff;padding:15px;border-radius:10px;">
        <h3>📘 Estadísticas Totales</h3>
        <p>⏳ Tiempo total acumulado: ${formatTime(total_time_sec)}</p>
        <p>📅 Número total de días: ${total_days}</p>
        <p>📆 Número total de fechas: ${total_dates}</p>
        <hr style="border-color:#555;" />
        <h3>📗 Estadísticas por Día</h3>
        <select id="daySelector">
          <option value="">Selecciona un día</option>
          ${dayIds.map(d=>`<option value="${d}">${d}</option>`).join("")}
        </select>
        <div id="dayDetail"></div>
        <h3>📙 Estadísticas por Fecha</h3>
        <select id="dateSelector">
          <option value="">Selecciona una fecha</option>
          ${[...dateSet].map(d=>`<option value="${d}">${d}</option>`).join("")}
        </select>
        <div id="dateDetail"></div>
      </div>
    `;

    // ---------------- INTERACTIVIDAD ----------------
    const daySelector = document.getElementById("daySelector");
    const dayDetail = document.getElementById("dayDetail");
    daySelector.addEventListener("change", ()=>{
      const selected = daySelector.value;
      if(selected && dayStats[selected]){
        const d = dayStats[selected];
        dayDetail.innerHTML = `
          <p>Tiempo total: ${d.total_min.toFixed(1)} min</p>
          <p>Tiempo restante: ${d.remaining_min.toFixed(1)} min</p>
          <p>Media por turno: ${d.avg_activity_min.toFixed(1)} min</p>
          <p>Cumplió objetivo: ${d.success ? "✔️" : "❌"}</p>
          <ul>
            ${d.activities.map(a=>`<li>${a.name} - ${a.elapsed_sec/60} min</li>`).join("")}
          </ul>
        `;
      } else { dayDetail.innerHTML = ""; }
    });

    const dateSelector = document.getElementById("dateSelector");
    const dateDetail = document.getElementById("dateDetail");
    dateSelector.addEventListener("change", ()=>{
      const selected = dateSelector.value;
      if(selected && dateStats[selected]){
        const d = dateStats[selected];
        dateDetail.innerHTML = `
          <p>Tiempo total: ${d.total_min.toFixed(1)} min</p>
          <p>Tiempo restante: ${d.remaining_min.toFixed(1)} min</p>
          <p>Media por turno: ${d.avg_activity_min.toFixed(1)} min</p>
          <p>Cumplió objetivo: ${d.success ? "✔️" : "❌"}</p>
          <ul>
            ${d.activities.map(a=>`<li>${a.name} - ${a.elapsed_sec/60} min</li>`).join("")}
          </ul>
        `;
      } else { dateDetail.innerHTML = ""; }
    });

  } catch(e){
    console.error("Error cargando estadísticas:", e);
    statsContainer.innerHTML = "<p>Error al cargar estadísticas.</p>";
  }
}









