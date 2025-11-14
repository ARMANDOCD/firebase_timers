// ====================================================
// estadisticas.js
// ====================================================

import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";
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

// ---------------- UTIL ----------------
function formatTime(totalSec){
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return `${h}h ${m}m ${s}s`;
}

// ---------------- MAIN ----------------
const usuariosRef = ref(db, "usuarios");

onValue(usuariosRef, snapshot => {
  const raw = snapshot.val() || {};
  const rows = [];

  // Transformar datos a un array
  Object.entries(raw).forEach(([uid,user])=>{
    const cron = user.cronometros || {};

    if(cron.historico){
      Object.entries(cron.historico).forEach(([dayid, dayobj])=>{
        const day_start = dayobj.dayStarted;
        const day_end   = dayobj.dayEnded;
        const timers    = dayobj.timers || [];
        timers.forEach(t=>{
          rows.push({
            uid, dayId: dayid, name: t.name, target_min: t.target, elapsed_sec: t.elapsed,
            completed: t.completed, note: t.note, createdAt: t.createdAt,
            dayStarted: day_start, dayEnded: day_end
          });
        });
      });
    } else if(cron.diaActual){
      const dia = cron.diaActual;
      const day_start = dia.dayStarted;
      const day_end   = dia.dayEnded;
      const timers = dia.timers || [];
      timers.forEach(t=>{
        rows.push({
          uid, dayId: "diaActual", name: t.name, target_min: t.target, elapsed_sec: t.elapsed,
          completed: t.completed, note: t.note, createdAt: t.createdAt,
          dayStarted: day_start, dayEnded: day_end
        });
      });
    }
  });

  // ---------------- PROCESAMIENTO ----------------
  // Convertir strings a fechas
  rows.forEach(r=>{
    r.dayStarted = r.dayStarted ? new Date(r.dayStarted) : null;
    r.dayEnded = r.dayEnded ? new Date(r.dayEnded) : null;
    r.createdAt = r.createdAt ? new Date(r.createdAt) : null;
    r.elapsed_sec = r.elapsed_sec || 0;
    r.target_min = r.target_min || 0;
  });

  // Total tiempo
  const total_time_sec = rows.reduce((sum,r)=>sum+r.elapsed_sec,0);
  const total_time_str = formatTime(total_time_sec);

  // Días únicos y fechas únicas
  const dayIds = [...new Set(rows.map(r=>r.dayId))];
  const total_days = dayIds.length;

  const dateSet = new Set(rows.map(r=>r.createdAt?.toDateString()).filter(Boolean));
  const total_dates = dateSet.size;

  // ---------------- ESTADÍSTICAS POR DÍA ----------------
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

    dayStats[d] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success };
  });

  // Máxima racha de éxito
  const dayArray = Object.values(dayStats);
  let max_streak = 0, cur_streak = 0;
  dayArray.forEach(d=>{
    if(d.success){ cur_streak++; if(cur_streak>max_streak) max_streak=cur_streak; }
    else cur_streak=0;
  });

  // ---------------- ESTADÍSTICAS POR FECHA ----------------
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

    dateStats[ds] = { total_sec, total_min, target_min, remaining_min, n_turnos, avg_activity_min, success };
  });

  // Máxima racha
  const dateArray = Object.values(dateStats);
  let max_streak_f = 0, cur_streak_f = 0;
  dateArray.forEach(d=>{
    if(d.success){ cur_streak_f++; if(cur_streak_f>max_streak_f) max_streak_f=cur_streak_f; }
    else cur_streak_f=0;
  });

  // ---------------- RENDER ----------------
  statsContainer.innerHTML = `
    <div style="background:#222;color:#fff;padding:15px;border-radius:10px;">
      <h3>📘 Estadísticas Totales</h3>
      <p>⏳ Tiempo total acumulado: ${total_time_str}</p>
      <p>📅 Número total de días: ${total_days}</p>
      <p>📆 Número total de fechas: ${total_dates}</p>
      <hr style="border-color:#555;" />
      <h3>📗 Estadísticas por Día</h3>
      ${Object.entries(dayStats).map(([day, d])=>`
        <div style="background:#1b3320;padding:8px;margin:4px;border-radius:6px;">
          <b>Día ${day}</b> - Tiempo: ${d.total_min.toFixed(1)} min, Restante: ${d.remaining_min.toFixed(1)} min, Media: ${d.avg_activity_min.toFixed(1)} min, Cumplió: ${d.success?"✔️":"❌"}
        </div>
      `).join("")}
      <h3>📙 Estadísticas por Fecha</h3>
      ${Object.entries(dateStats).map(([date, d])=>`
        <div style="background:#3b2c00;padding:8px;margin:4px;border-radius:6px;">
          <b>${date}</b> - Tiempo: ${d.total_min.toFixed(1)} min, Restante: ${d.remaining_min.toFixed(1)} min, Media: ${d.avg_activity_min.toFixed(1)} min, Cumplió: ${d.success?"✔️":"❌"}
        </div>
      `).join("")}
    </div>
  `;

});
