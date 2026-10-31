// Nombres, rangos y textos compartidos por el panel y la asistente.
// Los rangos coinciden con los del firmware (que vuelve a validarlos).

// siempreManual: se controla desde la página en cualquier modo (no tiene automatización)
// soloAlarma: lo enciende el PIR; desde la página solo se puede silenciar o probar en manual
export const DISPOSITIVOS = {
  luz_interior: { clave: "li", nombre: "Foco interior", icono: "foco", siempreManual: true },
  luz_exterior: { clave: "le", nombre: "Foco exterior", icono: "luna" },
  ventilador: { clave: "f", nombre: "Ventilador", icono: "viento" },
  bomba_riego: { clave: "b", nombre: "Riego", icono: "gota" },
  alarma: { clave: "al", nombre: "Alarma", icono: "campana", soloAlarma: true },
};

// El foco interior (solo página) y la alarma (solo PIR) no se usan en reglas
export const DISPOSITIVOS_REGLAS = ["luz_exterior", "ventilador", "bomba_riego"];

export const SENSORES = {
  temperatura: { clave: "t", nombre: "Temperatura", unidad: "°C", icono: "termometro" },
  humedad_aire: { clave: "h", nombre: "Humedad del aire", unidad: "%", icono: "nube" },
  humedad_suelo: { clave: "s", nombre: "Humedad del suelo", unidad: "%", icono: "brote" },
  luz: { clave: "l", nombre: "Luz exterior", unidad: "%", icono: "sol" },
  presencia: { clave: "p", nombre: "Presencia", unidad: "", icono: "persona" },
  hora: { clave: "hm", nombre: "Hora", unidad: "", icono: "reloj" },
};

export const UMBRALES = {
  temp_max: { clave: "tmax", nombre: "Temperatura para encender el ventilador", unidad: "°C", min: 20, max: 35, paso: 0.5 },
  humedad_suelo_min: { clave: "smin", nombre: "Humedad mínima del suelo (riega abajo de esto)", unidad: "%", min: 10, max: 80, paso: 1 },
  luz_noche: { clave: "ln", nombre: "Luz para encender el foco exterior", unidad: "%", min: 5, max: 60, paso: 1 },
  tiempo_alarma: { clave: "ta", nombre: "Segundos de presencia para sonar la alarma", unidad: "s", min: 2, max: 30, paso: 1 },
};

export const MAX_REGLAS = 6;

export const nombrePorClave = (tabla, clave) => Object.entries(tabla).find(([, v]) => v.clave === clave)?.[0];

export function validarValorDispositivo(dispositivo, valor) {
  const d = DISPOSITIVOS[dispositivo];
  if (!d) throw new Error(`Dispositivo desconocido: ${dispositivo}`);
  const v = Math.round(Number(valor));
  if (v !== 0 && v !== 1) throw new Error(`${d.nombre} solo acepta 0 (apagado) o 1 (encendido)`);
  return v;
}

// Mismas reglas que aplicarUmbral() en el firmware
export function validarUmbral(parametro, valor) {
  const u = UMBRALES[parametro];
  if (!u) throw new Error(`Umbral desconocido: ${parametro}`);
  const v = Number(valor);
  if (!Number.isFinite(v) || v < u.min || v > u.max) {
    throw new Error(`${u.nombre}: el valor debe estar entre ${u.min} y ${u.max} ${u.unidad}`);
  }
  return v;
}

export function formatoHora(hm) {
  if (hm == null || hm < 0) return "—";
  const h = Math.floor(hm / 100);
  const m = hm % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function textoValorDispositivo(dispositivo, valor) {
  if (valor == null) return "—";
  if (dispositivo === "alarma") return valor ? "Sonando" : "En silencio";
  if (dispositivo === "bomba_riego") return valor ? "Regando" : "Apagado";
  return valor ? "Encendido" : "Apagado";
}

export function textoRegla(r) {
  const sensor = nombrePorClave(SENSORES, r.s);
  const disp = nombrePorClave(DISPOSITIVOS, r.d);
  const s = SENSORES[sensor];
  let condicion;
  if (r.s === "p") condicion = r.x >= 0.5 ? "Si hay personas" : "Si no hay nadie";
  else {
    const umbral = r.s === "hm" ? formatoHora(r.x) : `${r.x}${s?.unidad ?? ""}`;
    condicion = `Si ${s?.nombre.toLowerCase() ?? r.s} ${r.o} ${umbral}`;
  }
  const accion = `${DISPOSITIVOS[disp]?.nombre.toLowerCase() ?? r.d}: ${textoValorDispositivo(disp, r.v).toLowerCase()}`;
  return `${condicion} → ${accion}`;
}
