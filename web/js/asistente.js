// Conversacion con Claude (a traves del servidor intermedio) y ejecucion de herramientas.
// Claude decide QUE hacer; esta pagina lo ejecuta en el ESP32 y le devuelve el resultado.
import { casa, enviarComando, esperar, hayDatosRecientes } from "./conexion.js";
import {
  DISPOSITIVOS, DISPOSITIVOS_REGLAS, SENSORES, UMBRALES, MAX_REGLAS,
  validarValorDispositivo, validarUmbral, formatoHora, textoValorDispositivo, textoRegla,
} from "./modelo.js";

const MAX_MENSAJES = 100;   // al llegar aqui se inicia una conversacion nueva
const MAX_VUELTAS = 8;      // limite de llamadas seguidas a herramientas por turno

// Historial completo en el formato de la API de Claude. Solo se agregan mensajes
// al final (nunca se editan los anteriores) porque asi lo exige la API.
let historial = [];

export function nuevaConversacion() {
  historial = [];
}

// --------------------------- Contexto en vivo ---------------------------
function contextoCasa() {
  const e = casa.estado;
  const lineas = [`Fecha y hora: ${new Date().toLocaleString("es-GT", { dateStyle: "full", timeStyle: "short" })}`];
  if (!e || !hayDatosRecientes()) {
    lineas.push("Conexión con la casa: SIN DATOS (la maqueta no está conectada).");
  } else {
    const canales = [
      casa.simulador && "simulador (demostración sin hardware)",
      casa.ble === "conectado" && "Bluetooth",
      casa.mqtt === "conectado" && "WiFi",
    ].filter(Boolean);
    lineas.push(`Conexión: ${canales.join(" y ") || "ninguna"}`);
    lineas.push(`Modo: ${e.m === "A" ? "automatico" : "manual"}`);
    const s = [
      `temperatura ${e.t ?? "sin lectura"}${e.t != null ? " °C" : ""}`,
      `humedad_aire ${e.h ?? "sin lectura"}${e.h != null ? " %" : ""}`,
      `humedad_suelo ${e.s} %`,
      `luz ${e.l} %`,
      `presencia ${e.p ? "sí (1)" : "no (0)"}`,
      `hora ${e.hm >= 0 ? `${formatoHora(e.hm)} (HHMM ${e.hm})` : "sin hora"}`,
    ];
    lineas.push(`Sensores: ${s.join("; ")}`);
    if (e.al) lineas.push("ALERTA: la alarma está sonando porque el sensor de movimiento detectó a una persona. Se puede desactivar con silenciar_alarma.");
    else if (e.as) lineas.push("Alarma silenciada: el sensor todavía detecta a alguien; se rearma cuando ya no haya nadie.");
    const d = Object.entries(DISPOSITIVOS).map(([n, info]) => `${n} ${e[info.clave]} (${textoValorDispositivo(n, e[info.clave])})`);
    lineas.push(`Dispositivos: ${d.join("; ")}`);
  }
  const c = casa.config;
  if (c) {
    const u = Object.entries(UMBRALES).map(([n, info]) => `${n} ${c.u?.[info.clave]} ${info.unidad}`);
    lineas.push(`Umbrales: ${u.join("; ")}`);
    const r = (c.r || []).map((x) => `${x.i}: ${textoRegla(x)}`);
    lineas.push(`Reglas (${r.length}/${MAX_REGLAS}): ${r.length ? r.join(" | ") : "ninguna"}`);
  }
  return `<estado_casa>\n${lineas.join("\n")}\n</estado_casa>`;
}

function resumenEstado() {
  if (!hayDatosRecientes()) throw new Error("No hay datos recientes de la casa: la maqueta no está conectada.");
  return contextoCasa();
}

// ------------------------------ Herramientas ------------------------------
function exigirConexion() {
  if (!hayDatosRecientes()) throw new Error("La casa no está conectada (sin datos recientes del ESP32).");
}

const herramientas = {
  async consultar_estado() {
    return resumenEstado();
  },

  async cambiar_modo({ modo }) {
    exigirConexion();
    const v = modo === "automatico" ? "A" : "M";
    await enviarComando({ c: "modo", v });
    if (!(await esperar((k) => k.estado?.m === v))) throw new Error("La casa no confirmó el cambio de modo.");
    return `Modo cambiado a ${modo}.`;
  },

  async controlar_dispositivo({ dispositivo, valor }) {
    exigirConexion();
    const v = validarValorDispositivo(dispositivo, valor);
    const info = DISPOSITIVOS[dispositivo];
    // Apagar la alarma es silenciarla, y se puede en cualquier modo
    if (dispositivo === "alarma" && v === 0) return herramientas.silenciar_alarma();
    // El foco interior se controla desde la página en cualquier modo
    if (casa.estado.m === "A" && !info.siempreManual) {
      throw new Error("La casa está en modo automático. Primero cambia a modo manual con cambiar_modo.");
    }
    const clave = info.clave;
    await enviarComando({ c: "set", d: clave, v });
    if (!(await esperar((k) => k.estado?.[clave] === v))) {
      const extra = dispositivo === "bomba_riego" ? " La bomba puede estar en su pausa de seguridad de un minuto." : "";
      throw new Error(`El ESP32 no aplicó el cambio.${extra}`);
    }
    return `${DISPOSITIVOS[dispositivo].nombre}: ${textoValorDispositivo(dispositivo, v)}.`;
  },

  async silenciar_alarma() {
    exigirConexion();
    if (!casa.estado.al) return "La alarma ya estaba en silencio.";
    await enviarComando({ c: "alarma", v: 0 });
    if (!(await esperar((k) => k.estado?.al === 0))) throw new Error("El ESP32 no silenció la alarma.");
    return casa.estado?.p ? "Alarma silenciada. El sensor todavía detecta a alguien; se rearma cuando ya no haya nadie." : "Alarma silenciada.";
  },

  async ajustar_umbral({ parametro, valor }) {
    exigirConexion();
    const v = validarUmbral(parametro, valor);
    const clave = UMBRALES[parametro].clave;
    await enviarComando({ c: "cfg", k: clave, v });
    if (!(await esperar((k) => Math.abs(Number(k.config?.u?.[clave]) - v) < 0.01))) {
      throw new Error("El ESP32 rechazó el valor (fuera de rango).");
    }
    return `${UMBRALES[parametro].nombre} ahora es ${v} ${UMBRALES[parametro].unidad}.`;
  },

  async crear_regla({ sensor, operador, umbral, dispositivo, valor }) {
    exigirConexion();
    const reglas = casa.config?.r || [];
    if (reglas.length >= MAX_REGLAS) throw new Error(`Ya hay ${MAX_REGLAS} reglas, que es el máximo. Elimina una primero.`);
    if (!SENSORES[sensor]) throw new Error(`Sensor desconocido: ${sensor}`);
    if (!DISPOSITIVOS_REGLAS.includes(dispositivo)) {
      throw new Error("Las reglas solo pueden usar el foco exterior, el ventilador y el riego. El foco interior solo se controla desde la página y la alarma solo la activa el sensor de movimiento.");
    }
    const v = validarValorDispositivo(dispositivo, valor);
    let id = "";
    for (let n = 1; n < 100; n++) if (!reglas.some((r) => r.i === `r${n}`)) { id = `r${n}`; break; }
    const regla = { i: id, s: SENSORES[sensor].clave, o: operador, x: Number(umbral), d: DISPOSITIVOS[dispositivo].clave, v };
    await enviarComando({ c: "regla+", r: regla });
    if (!(await esperar((k) => k.config?.r?.some((r) => r.i === id)))) throw new Error("El ESP32 no guardó la regla.");
    const nota = casa.estado?.m === "M" ? " Nota: la casa está en manual; la regla actuará cuando vuelva a automático." : "";
    return `Regla ${id} creada: ${textoRegla(regla)}.${nota}`;
  },

  async eliminar_regla({ id }) {
    exigirConexion();
    if (!casa.config?.r?.some((r) => r.i === id)) throw new Error(`No existe la regla ${id}.`);
    await enviarComando({ c: "regla-", i: id });
    if (!(await esperar((k) => !k.config?.r?.some((r) => r.i === id)))) throw new Error("El ESP32 no eliminó la regla.");
    return `Regla ${id} eliminada.`;
  },
};

async function ejecutarHerramienta(bloque) {
  try {
    const funcion = herramientas[bloque.name];
    if (!funcion) throw new Error(`Herramienta desconocida: ${bloque.name}`);
    const resultado = await funcion(bloque.input || {});
    return { type: "tool_result", tool_use_id: bloque.id, content: String(resultado) };
  } catch (e) {
    return { type: "tool_result", tool_use_id: bloque.id, content: e.message, is_error: true };
  }
}

/**
 * Ejecuta una herramienta desde la pagina (escenas, interruptores y ordenes locales),
 * con las mismas validaciones que cuando la pide Claude.
 */
export async function ejecutarAccion(nombre, input = {}) {
  const r = await ejecutarHerramienta({ id: "local", name: nombre, input });
  return { ok: !r.is_error, texto: r.content };
}

// Texto corto para mostrar en el chat lo que hizo la asistente
export function describirAccion(bloque) {
  const i = bloque.input || {};
  switch (bloque.name) {
    case "cambiar_modo": return `Modo ${i.modo === "automatico" ? "automático" : "manual"}`;
    case "controlar_dispositivo": return `${DISPOSITIVOS[i.dispositivo]?.nombre ?? i.dispositivo}: ${textoValorDispositivo(i.dispositivo, i.valor)}`;
    case "ajustar_umbral": return `${UMBRALES[i.parametro]?.nombre ?? i.parametro}: ${i.valor} ${UMBRALES[i.parametro]?.unidad ?? ""}`;
    case "crear_regla": return `Nueva regla: ${textoRegla({ s: SENSORES[i.sensor]?.clave, o: i.operador, x: i.umbral, d: DISPOSITIVOS[i.dispositivo]?.clave, v: i.valor })}`;
    case "eliminar_regla": return `Regla ${i.id} eliminada`;
    case "silenciar_alarma": return "Alarma silenciada";
    case "consultar_estado": return "Revisando sensores";
    default: return bloque.name;
  }
}

// ------------------------------ Conversacion ------------------------------
async function llamarServidor(config) {
  if (!config.servidorUrl) throw new Error("Falta la dirección del servidor de la asistente (en Ajustes).");
  const url = config.servidorUrl.replace(/\/+$/, "") + "/chat";
  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Codigo-Acceso": config.codigoAcceso || "" },
      body: JSON.stringify({ mensajes: historial }),
    });
  } catch {
    throw new Error("No hay conexión con el servidor de la asistente. Revisa el internet.");
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error del servidor (${r.status})`);
  return datos;
}

/**
 * Envia un mensaje del usuario y resuelve todo el turno (incluidas las acciones).
 * eventos: { alTexto(texto), alAccion(descripcion, ok), alPensar(bool), alEjecutar(bool), alReiniciar() }
 */
export async function conversar(textoUsuario, config, eventos = {}) {
  if (historial.length > MAX_MENSAJES) {
    nuevaConversacion();
    eventos.alReiniciar?.();
  }
  const inicio = historial.length;
  historial.push({
    role: "user",
    content: [
      { type: "text", text: contextoCasa() },
      { type: "text", text: textoUsuario },
    ],
  });

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      eventos.alPensar?.(true);
      const respuesta = await llamarServidor(config);
      eventos.alPensar?.(false);

      if (respuesta.stop_reason === "refusal") {
        historial.length = inicio;   // descartar este turno
        eventos.alTexto?.("Prefiero no ayudar con eso. ¿Te ayudo con algo de la casa?");
        return;
      }

      // Se guarda la respuesta completa y sin cambios (incluye bloques internos de Claude)
      historial.push({ role: "assistant", content: respuesta.content });

      const texto = respuesta.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
      if (texto) eventos.alTexto?.(texto);

      if (respuesta.stop_reason === "tool_use") {
        const resultados = [];
        eventos.alEjecutar?.(true);
        for (const bloque of respuesta.content.filter((b) => b.type === "tool_use")) {
          const resultado = await ejecutarHerramienta(bloque);
          if (bloque.name !== "consultar_estado") eventos.alAccion?.(describirAccion(bloque), !resultado.is_error);
          resultados.push(resultado);
        }
        eventos.alEjecutar?.(false);
        historial.push({ role: "user", content: resultados });
        continue;
      }
      if (respuesta.stop_reason === "pause_turn") continue;
      if (respuesta.stop_reason === "max_tokens") eventos.alTexto?.("(La respuesta se cortó por ser muy larga.)");
      return;
    }
    eventos.alTexto?.("Hice varias acciones seguidas y me detuve por seguridad. ¿Continúo?");
  } catch (e) {
    eventos.alPensar?.(false);
    eventos.alEjecutar?.(false);
    // Si el turno quedo a medias, se descarta para que el historial siga siendo valido
    const ultimo = historial[historial.length - 1];
    const turnoIncompleto = ultimo?.role === "user" || ultimo?.content?.some?.((b) => b.type === "tool_use");
    if (turnoIncompleto) historial.length = inicio;
    throw e;
  }
}
