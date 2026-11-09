// Interfaz principal: panel de la casa + asistente MIA (texto, voz y avatar animado)
import {
  casa, suscribir, conectarMqtt, conectarBle, desconectarBle, enviarComando, esperar,
  hayDatosRecientes, bluetoothDisponible, iniciarSimulador,
} from "./conexion.js";
import {
  DISPOSITIVOS, SENSORES, UMBRALES, ESCENAS, formatoHora, textoValorDispositivo, textoRegla, validarUmbral,
} from "./modelo.js";
import { conversar, nuevaConversacion, ejecutarAccion, describirAccion } from "./asistente.js";
import { escuchar, detenerEscucha, hablar, callar, reconocimientoDisponible, medirMicrofono } from "./voz.js";
import { icono, pintarIconos } from "./iconos.js";
import { crearMia } from "./mia.js";
import { iniciarFondo } from "./fondo.js";
import { sonar, activarSonidos } from "./sonidos.js";
import { interpretar } from "./local.js";

const $ = (id) => document.getElementById(id);
const reducirMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
const esDemo = new URLSearchParams(location.search).has("demo");
const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));
const horaCorta = () => new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const desplazamiento = reducirMovimiento ? "auto" : "smooth";

document.body.classList.add("cargando");

// ------------------------------ Ajustes y preferencias ------------------------------
const CLAVE_AJUSTES = "casaIA.ajustes";
const CLAVE_PREFS = "casaIA.preferencias";
const PREDETERMINADOS = { mqttUrl: "", mqttUsuario: "", mqttClave: "", idCasa: "casa01", servidorUrl: "", codigoAcceso: "" };
const PREFS_BASE = { voz: true, continua: false, sonidos: true, arranque: true };

function leerJson(clave, base) {
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(clave) || "{}") };
  } catch {
    return { ...base };
  }
}
function guardarJson(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* modo privado: se usan solo durante esta visita */
  }
}
let ajustes = leerJson(CLAVE_AJUSTES, PREDETERMINADOS);
let prefs = leerJson(CLAVE_PREFS, PREFS_BASE);
activarSonidos(prefs.sonidos);

function guardarPrefs(nuevas) {
  prefs = { ...prefs, ...nuevas };
  guardarJson(CLAVE_PREFS, prefs);
  activarSonidos(prefs.sonidos);
}

function abrirAjustes() {
  const form = $("formAjustes");
  for (const [k, v] of Object.entries(ajustes)) if (form.elements[k]) form.elements[k].value = v;
  form.elements.sonidos.checked = prefs.sonidos;
  form.elements.arranque.checked = prefs.arranque;
  cerrarDesplegables();
  sonar("abrir");
  $("dlgAjustes").showModal();
}

// ------------------------------ Avisos ------------------------------
function avisar(texto, opciones = {}) {
  const { error = false, accion = null, ms = 4500 } = typeof opciones === "boolean" ? { error: opciones } : opciones;
  const div = document.createElement("div");
  div.className = `aviso${error ? " error" : ""}`;
  div.style.setProperty("--dur", `${ms}ms`);
  div.innerHTML = `${icono(error ? "alerta" : "chispa")}<span class="a-texto"></span><span class="a-tiempo"></span>`;
  div.querySelector(".a-texto").textContent = texto;
  let reloj = 0;
  const cerrar = () => {
    clearTimeout(reloj);
    div.classList.add("sale");
    setTimeout(() => div.remove(), 300);
  };
  if (accion) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "a-accion";
    b.textContent = accion.texto;
    b.addEventListener("click", () => { accion.fn(); cerrar(); });
    div.insertBefore(b, div.querySelector(".a-tiempo"));
  }
  const cont = $("avisos");
  cont.append(div);
  while (cont.children.length > 3) cont.firstChild.remove();
  reloj = setTimeout(cerrar, ms);
}

// ------------------------------ Notificaciones ------------------------------
const notificaciones = [];
let sinLeer = 0;

function notificar(texto, { peligro = false, iconoN = "campana" } = {}) {
  notificaciones.unshift({ hora: horaCorta(), texto, peligro, iconoN });
  notificaciones.length = Math.min(notificaciones.length, 20);
  if ($("panelNotif").hidden) sinLeer++;
  pintarNotificaciones();
}

function pintarNotificaciones() {
  const ins = $("insignia");
  ins.hidden = sinLeer === 0;
  ins.textContent = sinLeer > 9 ? "9+" : String(sinLeer);
  const lista = $("listaNotif");
  if (!notificaciones.length) {
    lista.innerHTML = '<li class="vacio">Sin novedades por ahora.</li>';
    return;
  }
  lista.innerHTML = "";
  for (const n of notificaciones) {
    const li = document.createElement("li");
    if (n.peligro) li.className = "peligro";
    li.innerHTML = `${icono(n.iconoN)}<div><span></span><small></small></div>`;
    li.querySelector("span").textContent = n.texto;
    li.querySelector("small").textContent = n.hora;
    lista.append(li);
  }
}

// ------------------------------ MIA ------------------------------
let mia = null;
let miaChat = null;
let estadoBase = "reposo";
let dormida = false;
let alarmaSonando = false;
let ultimaActividad = Date.now();

const TEXTO_PIE = {
  reposo: "MIA lista para ayudar", escuchando: "MIA te está escuchando", pensando: "MIA está pensando",
  hablando: "MIA está hablando", ejecutando: "MIA está ejecutando una acción", alerta: "MIA detectó una alarma",
  dormida: "MIA en reposo · toca para despertarla",
};
const TEXTO_ESTADO = {
  reposo: "Lista para ayudarte", escuchando: "Te escucho…", pensando: "Pensando…", hablando: "Hablando…",
  ejecutando: "Ejecutando acción…", alerta: "¡Alarma activa!", dormida: "Descansando…",
};

function ponerEstadoMia(estado) {
  estadoBase = estado;
  refrescarMia();
}

function refrescarMia() {
  let efectivo = estadoBase;
  if (estadoBase === "reposo" && alarmaSonando) efectivo = "alerta";
  else if (estadoBase === "reposo" && dormida) efectivo = "dormida";
  mia.ponerEstado(efectivo);
  miaChat?.ponerEstado(efectivo);
  $("pieMia").textContent = TEXTO_PIE[efectivo];
  $("pieMia").classList.toggle("activo", !["reposo", "dormida"].includes(efectivo));
  $("estadoAsistente").textContent = TEXTO_ESTADO[efectivo];
}

function reaccionMia(tipo, ms = 1500) {
  mia.reaccionar(tipo, ms);
  miaChat?.reaccionar(tipo, ms);
}

function actividad() {
  ultimaActividad = Date.now();
  if (dormida) {
    dormida = false;
    refrescarMia();
    reaccionMia("guino", 1300);
  }
}

// Subtitulo holografico bajo MIA, escrito letra por letra
let relojTexto = 0;
function mostrarTexto(texto, { usuario = false } = {}) {
  const el = $("textoMia");
  clearInterval(relojTexto);
  el.classList.toggle("usuario", usuario);
  if (usuario || reducirMovimiento) {
    el.textContent = usuario ? `“${texto}”` : texto;
    return;
  }
  const cursor = document.createElement("span");
  cursor.className = "cursor";
  let i = 0;
  el.textContent = "";
  relojTexto = setInterval(() => {
    i += 2;
    el.textContent = texto.slice(0, i);
    el.append(cursor);
    if (i >= texto.length) {
      clearInterval(relojTexto);
      el.textContent = texto;
    }
  }, 24);
}

function accionEnPantalla(texto, ok) {
  const cont = $("accionesMia");
  const s = document.createElement("span");
  s.className = `accion-flotante${ok ? "" : " fallo"}`;
  s.innerHTML = icono(ok ? "check" : "alerta");
  s.append(texto);
  cont.append(s);
  while (cont.children.length > 3) cont.firstChild.remove();
  setTimeout(() => s.remove(), 6000);
}

function saludoSegunHora() {
  const h = new Date().getHours();
  return h < 12 ? "¡Buenos días!" : h < 19 ? "¡Buenas tardes!" : "¡Buenas noches!";
}

// ------------------------------ Conversación ------------------------------
const chat = $("chat");
let ocupado = false;
let escuchandoAhora = false;
let detenerMedidor = null;

function agregarMensaje(tipo, texto) {
  const div = document.createElement("div");
  div.className = `mensaje ${tipo}`;
  div.textContent = texto;
  chat.append(div);
  chat.scrollTop = chat.scrollHeight;
}

function agregarAccion(texto, ok) {
  const div = document.createElement("div");
  div.className = `accion${ok ? "" : " fallo"}`;
  div.innerHTML = icono(ok ? "check" : "alerta");
  div.append(document.createTextNode(texto));
  chat.append(div);
  chat.scrollTop = chat.scrollHeight;
}

function mostrarEscribiendo() {
  quitarEscribiendo();
  const div = document.createElement("div");
  div.className = "escribiendo";
  div.id = "escribiendo";
  div.innerHTML = "<i></i><i></i><i></i>";
  chat.append(div);
  chat.scrollTop = chat.scrollHeight;
}
function quitarEscribiendo() {
  $("escribiendo")?.remove();
}

function saludar() {
  chat.innerHTML = "";
  agregarMensaje("asistente", "¡Hola! Soy MIA. Puedo controlar la casa, contarte qué está pasando y crear reglas nuevas. Escríbeme o toca el micrófono.");
  if (!ajustes.servidorUrl) {
    agregarMensaje("nota", "Sin servidor configurado entiendo órdenes sencillas. Configura el servidor de MIA en Ajustes para conversar de todo.");
  }
}

function abrirConversacion(prefijo) {
  const panel = $("conversacion");
  panel.classList.add("abierta");
  panel.setAttribute("aria-hidden", "false");
  $("velo").hidden = false;
  cerrarDesplegables();
  sonar("abrir");
  if (prefijo != null) $("textoChat").value = prefijo;
  setTimeout(() => $("textoChat").focus(), 350);
}
function cerrarConversacion() {
  const panel = $("conversacion");
  if (!panel.classList.contains("abierta")) return;
  panel.classList.remove("abierta");
  panel.setAttribute("aria-hidden", "true");
  $("velo").hidden = true;
}

// Ordenes sencillas sin el servidor de Claude
async function conversarLocal(texto, ev) {
  await esperarMs(500);
  const r = interpretar(texto, hayDatosRecientes() ? casa.estado : null);
  if (r.tipo === "respuesta") return ev.alTexto(r.texto);
  if (r.tipo === "escena") return ev.alTexto(await aplicarEscena(r.id, ev));
  ev.alEjecutar(true);
  const textos = [];
  let ok = true;
  for (const ll of r.llamadas) {
    const res = await ejecutarAccion(ll.name, ll.input);
    ev.alAccion(describirAccion(ll), res.ok);
    textos.push(res.texto);
    if (!res.ok) { ok = false; break; }
  }
  ev.alEjecutar(false);
  ev.alTexto(ok ? `Listo. ${textos.join(" ")}` : `No pude hacerlo: ${textos.at(-1)}`);
}

async function preguntar(texto) {
  texto = texto.trim();
  if (!texto || ocupado) return;
  actividad();
  callar();
  ocupado = true;
  agregarMensaje("usuario", texto);
  mostrarTexto(texto, { usuario: true });
  ponerEstadoMia("pensando");
  sonar("pensar");
  mostrarEscribiendo();

  const conVoz = prefs.voz;
  let habla = Promise.resolve();
  const decir = (t) => {
    habla = habla.then(() => {
      ponerEstadoMia("hablando");
      mostrarTexto(t);
      if (!conVoz) return esperarMs(Math.min(5000, 700 + t.length * 28));
      return hablar(t, () => { mia.pulsoVoz(); miaChat?.pulsoVoz(); });
    });
  };
  const eventos = {
    alTexto: (t) => { quitarEscribiendo(); agregarMensaje("asistente", t); decir(t); },
    alAccion: (desc, ok) => {
      agregarAccion(desc, ok);
      accionEnPantalla(desc, ok);
      reaccionMia(ok ? "exito" : "error", 1400);
      sonar(ok ? "exito" : "error");
    },
    alPensar: (p) => { if (p) ponerEstadoMia("pensando"); },
    alEjecutar: (e) => ponerEstadoMia(e ? "ejecutando" : "pensando"),
    alReiniciar: () => agregarMensaje("nota", "La conversación era muy larga; empecé una nueva."),
  };

  try {
    if (ajustes.servidorUrl) await conversar(texto, ajustes, eventos);
    else await conversarLocal(texto, eventos);
  } catch (e) {
    quitarEscribiendo();
    agregarMensaje("error", e.message);
    reaccionMia("error", 2200);
    sonar("error");
    decir(e.message);
  } finally {
    quitarEscribiendo();
    ocupado = false;
  }
  await habla;
  ponerEstadoMia("reposo");
  if (prefs.continua && reconocimientoDisponible) iniciarEscucha();
}

function marcarMic(activo) {
  $("btnMic").classList.toggle("activo", activo);
  $("btnMicChat").classList.toggle("activo", activo);
  $("btnHablar").textContent = activo ? "Escuchando… toca para terminar" : "Presiona para hablar";
}

async function iniciarEscucha() {
  actividad();
  if (escuchandoAhora) {
    detenerEscucha();
    return;
  }
  if (ocupado) return;
  if (!reconocimientoDisponible) {
    reaccionMia("error", 1500);
    avisar("Tu navegador no reconoce voz. Usa Chrome o Edge, o escríbele a MIA.", { error: true, accion: { texto: "Escribir", fn: () => abrirConversacion() } });
    return;
  }
  callar();
  escuchandoAhora = true;
  sonar("escuchar");
  marcarMic(true);
  ponerEstadoMia("escuchando");
  mostrarTexto("Te escucho…");
  medirMicrofono((n) => { mia.ponerNivel(n); miaChat?.ponerNivel(n); }).then((detener) => {
    if (escuchandoAhora) detenerMedidor = detener;
    else detener();
  });
  let texto = "";
  try {
    texto = await escuchar((parcial) => {
      mostrarTexto(parcial, { usuario: true });
      $("textoChat").value = parcial;
    });
  } catch (e) {
    reaccionMia("error", 1500);
    avisar(e.message, { error: true });
  } finally {
    escuchandoAhora = false;
    detenerMedidor?.();
    detenerMedidor = null;
    mia.ponerNivel(0);
    marcarMic(false);
    $("textoChat").value = "";
    ponerEstadoMia("reposo");
    sonar("fin");
  }
  if (texto) await preguntar(texto);
  else mostrarTexto("¿En qué puedo ayudarte hoy?");
}

// Acciones de la interfaz con reaccion de MIA (sin interrumpir si esta conversando)
async function conMia(fn) {
  const libre = !ocupado && !escuchandoAhora;
  if (libre) ponerEstadoMia("ejecutando");
  const r = await fn();
  if (libre) ponerEstadoMia("reposo");
  reaccionMia(r.ok ? "exito" : "error", 1300);
  sonar(r.ok ? "exito" : "error");
  if (!r.ok) avisar(r.texto, { error: true });
  return r;
}

// ------------------------------ Modo ------------------------------
async function cambiarModo(modo) {
  if (!exigirCasa()) return;
  const r = await conMia(() => ejecutarAccion("cambiar_modo", { modo }));
  if (r.ok) accionEnPantalla(`Modo ${modo === "automatico" ? "automático" : "manual"}`, true);
}

function exigirCasa() {
  if (hayDatosRecientes()) return true;
  reaccionMia("error", 1300);
  avisar("La casa no está conectada. Conéctala por WiFi o Bluetooth.", { error: true, accion: { texto: "Conectar", fn: abrirPanelHogar } });
  return false;
}

function pedirManual(nombre) {
  reaccionMia("curiosa", 1400);
  avisar(`En modo automático, el ESP32 controla: ${nombre.toLowerCase()}.`, { accion: { texto: "Pasar a manual", fn: () => cambiarModo("manual") }, ms: 6000 });
}

// ------------------------------ Dispositivos ------------------------------
function construirDispositivos() {
  const cont = $("dispositivos");
  cont.innerHTML = Object.entries(DISPOSITIVOS)
    .map(([n, d]) => `
      <div class="disp" data-disp="${n}">
        <span class="candado" hidden title="Lo controla el ESP32 en modo automático">${icono("candado")}</span>
        <span class="d-icono">${icono(d.icono)}</span>
        <span class="d-nombre">${d.nombre}</span>
        ${d.soloAlarma
          ? '<button type="button" class="boton-mini" data-silenciar>Armada</button>'
          : `<label class="interruptor" aria-label="${d.nombre}"><input type="checkbox"><span></span></label>`}
        <span class="d-estado">—</span>
      </div>`)
    .join("");
  for (const [n] of Object.entries(DISPOSITIVOS)) {
    const tarjeta = cont.querySelector(`[data-disp="${n}"]`);
    tarjeta.querySelector('input[type="checkbox"]')?.addEventListener("change", (ev) => cambiarDispositivo(n, ev.target.checked ? 1 : 0));
    tarjeta.querySelector("[data-silenciar]")?.addEventListener("click", silenciarAlarma);
  }
}

async function cambiarDispositivo(n, valor) {
  const d = DISPOSITIVOS[n];
  actividad();
  if (!exigirCasa()) return pintarDispositivos();
  if (casa.estado.m === "A" && !d.siempreManual) {
    pedirManual(d.nombre);
    return pintarDispositivos();
  }
  const tarjeta = document.querySelector(`.disp[data-disp="${n}"]`);
  tarjeta.classList.add("pendiente");
  sonar(valor ? "encender" : "apagar");
  const r = await conMia(() => ejecutarAccion("controlar_dispositivo", { dispositivo: n, valor }));
  tarjeta.classList.remove("pendiente");
  if (r.ok) accionEnPantalla(`${d.nombre}: ${textoValorDispositivo(n, valor)}`, true);
  pintarDispositivos();
}

async function silenciarAlarma() {
  actividad();
  if (!exigirCasa()) return;
  const r = await conMia(() => ejecutarAccion("silenciar_alarma"));
  if (r.ok) {
    accionEnPantalla("Alarma silenciada", true);
    mostrarTexto(r.texto);
  }
}

function pintarDispositivos() {
  const e = casa.estado;
  const vivo = Boolean(e) && hayDatosRecientes();
  const auto = e?.m === "A";
  for (const [n, d] of Object.entries(DISPOSITIVOS)) {
    const tarjeta = document.querySelector(`.disp[data-disp="${n}"]`);
    const v = e?.[d.clave];
    const estado = tarjeta.querySelector(".d-estado");
    if (d.soloAlarma) {
      const sonando = vivo && Boolean(v);
      tarjeta.classList.toggle("sonando", sonando);
      const b = tarjeta.querySelector("[data-silenciar]");
      b.textContent = sonando ? "Silenciar" : !e ? "—" : auto ? "Armada" : "Inactiva";
      b.classList.toggle("peligro", sonando);
      b.disabled = !sonando;
      estado.textContent = !e ? "Sin datos" : sonando ? "¡Sonando!" : e.as ? "Silenciada" : auto ? "Vigilando" : "En manual";
    } else {
      tarjeta.classList.toggle("encendido", vivo && Boolean(v));
      const check = tarjeta.querySelector('input[type="checkbox"]');
      if (!tarjeta.classList.contains("pendiente")) check.checked = Boolean(v);
      check.disabled = !vivo;
      estado.textContent = !e ? "Sin datos" : textoValorDispositivo(n, v);
    }
    tarjeta.querySelector(".candado").hidden = !(vivo && auto && !d.siempreManual && !d.soloAlarma);
  }
  $("modoAuto").classList.toggle("activo", e?.m === "A");
  $("modoManual").classList.toggle("activo", e?.m === "M");
  const nota = $("notaModo");
  nota.innerHTML = !e ? "" : auto
    ? `${icono("robot")} Modo automático: la casa decide sola. El foco interior siempre lo controlas tú.`
    : `${icono("usuario")} Modo manual: controlas cada dispositivo. La alarma no se activa sola.`;

  // Accesos rapidos del celular
  const li = document.querySelector('[data-rapido="luz_interior"]');
  li.classList.toggle("encendido", vivo && Boolean(e?.li));
  document.querySelector('[data-rapido="alarma"]').classList.toggle("sonando", vivo && Boolean(e?.al));
}

// ------------------------------ Escenas ------------------------------
let escenaActiva = null;
let escenaEnCurso = null;

function construirEscenas() {
  const cont = $("escenas");
  cont.innerHTML = Object.entries(ESCENAS)
    .map(([id, e]) => `<button type="button" class="escena" data-escena="${id}" title="${e.descripcion}">${icono(e.icono)}<span>${e.nombre}</span></button>`)
    .join("") + `<button type="button" class="escena" data-escena="nueva" title="Pídele a MIA una escena o regla nueva">${icono("mas")}<span>Nueva</span></button>`;
  cont.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-escena]");
    if (!b) return;
    if (b.dataset.escena === "nueva") return abrirConversacion("Crea una regla para que ");
    aplicarEscena(b.dataset.escena);
  });
}

function escenaCumple(id) {
  const e = ESCENAS[id];
  const s = casa.estado;
  if (!s || s.m !== (e.modo === "automatico" ? "A" : "M")) return false;
  return Object.entries(e.dispositivos).every(([d, v]) => s[DISPOSITIVOS[d].clave] === v);
}

function pintarEscenas() {
  if (escenaActiva && !escenaCumple(escenaActiva)) escenaActiva = null;
  for (const b of document.querySelectorAll(".escena")) {
    b.classList.toggle("activa", b.dataset.escena === escenaActiva);
    b.classList.toggle("cargando", b.dataset.escena === escenaEnCurso);
  }
}

/** Aplica una escena con las herramientas de MIA. ev: eventos de la conversacion (si la pidio MIA). */
async function aplicarEscena(id, ev = null) {
  const e = ESCENAS[id];
  if (!e || escenaEnCurso) return "";
  actividad();
  if (!ev && !exigirCasa()) return "";
  const desdeInterfaz = !ev;
  const libre = !ocupado && !escuchandoAhora;
  escenaEnCurso = id;
  pintarEscenas();
  if (desdeInterfaz) {
    sonar("clic");
    if (libre) {
      ponerEstadoMia("ejecutando");
      mostrarTexto(`Activando la escena ${e.nombre}…`);
    }
  } else {
    ev.alEjecutar(true);
  }
  const llamadas = [
    { name: "cambiar_modo", input: { modo: e.modo } },
    ...Object.entries(e.dispositivos).map(([d, v]) => ({ name: "controlar_dispositivo", input: { dispositivo: d, valor: v } })),
  ];
  let error = null;
  for (const ll of llamadas) {
    const s = casa.estado;
    if (ll.name === "cambiar_modo" && s?.m === (e.modo === "automatico" ? "A" : "M")) continue;
    if (ll.name === "controlar_dispositivo" && s?.[DISPOSITIVOS[ll.input.dispositivo].clave] === ll.input.valor) continue;
    const r = await ejecutarAccion(ll.name, ll.input);
    if (ev) ev.alAccion(describirAccion(ll), r.ok);
    if (!r.ok) { error = r.texto; break; }
  }
  escenaEnCurso = null;
  if (!error) escenaActiva = id;
  pintarEscenas();
  const texto = error ? `No pude completar la escena ${e.nombre}: ${error}` : `Escena ${e.nombre} activada. ${e.descripcion}.`;
  if (desdeInterfaz) {
    if (libre) {
      ponerEstadoMia("reposo");
      mostrarTexto(texto);
    }
    reaccionMia(error ? "error" : "exito", 1700);
    sonar(error ? "error" : "exito");
    if (error) avisar(texto, { error: true });
    else accionEnPantalla(`Escena ${e.nombre}`, true);
  } else {
    ev.alEjecutar(false);
  }
  return texto;
}

// ------------------------------ Sensores ------------------------------
const TARJETAS_SENSORES = [
  { n: "presencia", nombre: "Movimiento (PIR)", icono: "correr" },
  { n: "temperatura", nombre: "Temperatura", dec: 1 },
  { n: "humedad_aire", nombre: "Humedad", dec: 0 },
  { n: "humedad_suelo", nombre: "Humedad del suelo", dec: 0, compacto: true },
  { n: "luz", nombre: "Luz exterior", dec: 0, compacto: true },
  { n: "hora", nombre: "Hora del ESP32", compacto: true },
];

function construirSensores() {
  $("sensores").innerHTML = TARJETAS_SENSORES.map((t) => {
    const s = SENSORES[t.n];
    const barra = s.unidad === "%" && t.compacto ? '<div class="barrita"><span></span></div>' : "";
    const ok = t.n === "presencia" ? `<span class="s-ok">${icono("check")}</span>` : "";
    return `
      <div class="sensor${t.compacto ? " compacto" : ""}" data-sensor="${t.n}">
        ${ok}
        <div class="s-cab">${icono(t.icono || s.icono)}<span>${t.nombre}</span></div>
        <div class="s-valor">—</div>
        ${t.n === "presencia" ? '<div class="s-detalle">—</div>' : ""}
        ${barra}
      </div>`;
  }).join("");
}

const mostrados = new WeakMap();
function animarNumero(el, valor, dec, unidad) {
  const desde = mostrados.get(el);
  mostrados.set(el, valor);
  const pintar = (v) => (el.innerHTML = `${v.toFixed(dec)}<small>${unidad}</small>`);
  if (desde == null || reducirMovimiento || desde === valor) return pintar(valor);
  const t0 = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / 650);
    pintar(desde + (valor - desde) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function pintarSensores() {
  const e = casa.estado;
  for (const t of TARJETAS_SENSORES) {
    const s = SENSORES[t.n];
    const tarjeta = document.querySelector(`.sensor[data-sensor="${t.n}"]`);
    const valorEl = tarjeta.querySelector(".s-valor");
    const v = e?.[s.clave];
    if (t.n === "presencia") {
      const hay = Boolean(e?.p);
      valorEl.textContent = !e ? "Sin datos" : hay ? "Movimiento detectado" : "Sin movimiento";
      tarjeta.classList.toggle("hay", hay && !e?.al);
      tarjeta.classList.toggle("peligro", Boolean(e?.al));
      tarjeta.querySelector(".s-ok").innerHTML = icono(hay ? "alerta" : "check");
      tarjeta.querySelector(".s-detalle").textContent = !e ? "—"
        : e.al ? "La alarma está sonando" : e.as ? "Alarma silenciada" : e.m === "A" ? "Alarma armada" : "Alarma inactiva (manual)";
    } else if (t.n === "hora") {
      valorEl.textContent = e ? formatoHora(v) : "—";
    } else if (e && v != null) {
      animarNumero(valorEl, Number(v), t.dec, s.unidad === "°C" ? " °C" : ` ${s.unidad}`);
    } else {
      valorEl.textContent = "—";
      mostrados.delete(valorEl);
    }
    const barra = tarjeta.querySelector(".barrita > span");
    if (barra) barra.style.setProperty("--v", e && v != null ? v / 100 : 0);
  }
  const temp = document.querySelector('.sensor[data-sensor="temperatura"]');
  temp.classList.toggle("alerta", e?.t != null && casa.config && e.t >= casa.config.u.tmax);
}

// ------------------------------ Estado de la ESP32 ------------------------------
let ultimoVivo = null;

function pintarConexiones() {
  const vivo = hayDatosRecientes();
  let estadoWifi = casa.mqtt;
  if (casa.mqtt === "conectado" && !casa.esp32EnLinea) estadoWifi = "sin-casa";
  const textoWifi = {
    desconectado: ajustes.mqttUrl ? "Desconectado (toca para reconectar)" : "Sin configurar",
    conectando: "Conectando al servidor MQTT…",
    conectado: "Conectado, la casa está en línea",
    "sin-casa": "Conectado, pero el ESP32 no responde",
  }[estadoWifi];
  const wifi = $("btnWifi");
  wifi.dataset.estado = estadoWifi;
  wifi.querySelector("small").textContent = textoWifi;
  const ble = $("btnBle");
  ble.dataset.estado = casa.ble;
  ble.querySelector("small").textContent = casa.ble === "conectado" ? "Conectado (toca para desconectar)" : casa.ble === "conectando" ? "Conectando…" : bluetoothDisponible ? "Toca para conectar" : "No disponible en este navegador";

  const espWifi = $("espWifi");
  espWifi.dataset.estado = casa.simulador ? "conectado" : estadoWifi;
  espWifi.querySelector("span").textContent = casa.simulador ? "Simulador" : { desconectado: "Sin WiFi", conectando: "Conectando…", conectado: "Conectada", "sin-casa": "ESP32 fuera" }[estadoWifi];
  const espBle = $("espBle");
  espBle.dataset.estado = casa.ble;
  espBle.querySelector("span").textContent = casa.ble === "conectado" ? "Bluetooth" : casa.ble === "conectando" ? "Enlazando…" : "Sin Bluetooth";

  const enLinea = vivo;
  const conectando = casa.mqtt === "conectando" || casa.ble === "conectando";
  $("puntoHogar").dataset.estado = enLinea ? "conectado" : conectando ? "conectando" : "desconectado";
  pintarEsp();
}

function pintarEsp() {
  const e = casa.estado;
  const vivo = hayDatosRecientes();
  const conectando = casa.mqtt === "conectando" || casa.ble === "conectando";
  const pill = $("pillEsp");
  pill.dataset.estado = vivo ? "si" : conectando ? "espera" : "no";
  pill.textContent = vivo ? "En línea" : conectando ? "Conectando" : "Sin conexión";
  const chip = $("espChip");
  chip.classList.toggle("vivo", vivo);
  chip.querySelector("span").textContent = e && e.hm >= 0 ? `ESP32 · ${formatoHora(e.hm)}` : "ESP32";
  const salud = $("espSalud");
  salud.classList.toggle("vivo", vivo);
  salud.lastElementChild.textContent = vivo ? "Funcionando correctamente" : e ? "Sin datos recientes" : "Esperando datos";
  $("pieConexion").textContent = vivo ? (casa.simulador ? "Simulador conectado" : "Conectado") : conectando ? "Conectando…" : "Sin conexión";

  if (ultimoVivo !== null && ultimoVivo !== vivo) {
    notificar(vivo ? "La casa está en línea" : "Se perdió la conexión con la casa", { iconoN: vivo ? "wifi" : "alerta", peligro: !vivo });
    if (!ocupado && !escuchandoAhora) reaccionMia(vivo ? "exito" : "error", 1400);
  }
  ultimoVivo = vivo;
}

// ------------------------------ Historial ------------------------------
const METRICAS = {
  t: { nombre: "Temperatura", unidad: "°C", dec: 1, paso: 0.5, icono: "termometro" },
  h: { nombre: "Humedad del aire", unidad: "%", dec: 0, paso: 2, icono: "nube" },
  s: { nombre: "Humedad del suelo", unidad: "%", dec: 0, paso: 2, icono: "brote" },
  l: { nombre: "Luz exterior", unidad: "%", dec: 0, paso: 5, icono: "sol" },
};
const ETIQUETAS = ["-60 s", "-50 s", "-40 s", "-30 s", "-20 s", "-10 s", "Ahora"];
const muestras = [];

function construirHistorial() {
  $("barras").innerHTML = ETIQUETAS.map((t) => `<div class="barra vacia"><div class="b-col"></div><span>${t}</span><b class="b-tip"></b></div>`).join("");
  $("selMetrica").addEventListener("change", () => { sonar("clic"); pintarHistorial(); });
}

function registrarMuestra() {
  const e = casa.estado;
  if (!e) return;
  const ahora = Date.now();
  if (muestras.length && ahora - muestras.at(-1).ms < 900) return;
  muestras.push({ ms: ahora, t: e.t, h: e.h, s: e.s, l: e.l });
  while (muestras.length && ahora - muestras[0].ms > 75000) muestras.shift();
}

function pintarHistorial() {
  const k = $("selMetrica").value;
  const m = METRICAS[k];
  const ahora = Date.now();
  const valores = ETIQUETAS.map((_, i) => {
    const desde = ahora - (7 - i) * 10000;
    const hasta = ahora - (6 - i) * 10000;
    const grupo = muestras.filter((x) => x.ms > desde && x.ms <= hasta && x[k] != null).map((x) => Number(x[k]));
    return grupo.length ? grupo.reduce((a, b) => a + b, 0) / grupo.length : null;
  });
  const validos = valores.filter((v) => v != null);
  let lo = 0, hi = 1;
  if (validos.length) {
    const min = Math.min(...validos), max = Math.max(...validos);
    const margen = Math.max((max - min) * 0.4, m.paso);
    lo = Math.floor((min - margen) / m.paso) * m.paso;
    hi = Math.ceil((max + margen) / m.paso) * m.paso;
    if (m.unidad === "%") { lo = Math.max(0, lo); hi = Math.min(100, hi); }
    if (hi <= lo) hi = lo + m.paso;
  }
  const decEje = m.dec && hi - lo < 4 ? 1 : 0;
  $("ejeY").innerHTML = [0, 1, 2, 3, 4].map((i) => `<span>${(hi - ((hi - lo) * i) / 4).toFixed(decEje)}</span>`).join("");
  const iMax = validos.length ? valores.indexOf(Math.max(...validos)) : -1;
  document.querySelectorAll("#barras .barra").forEach((b, i) => {
    const v = valores[i];
    b.classList.toggle("vacia", v == null);
    b.classList.toggle("max", i === iMax);
    b.style.setProperty("--alto", v == null ? 0 : Math.max(3, ((v - lo) / (hi - lo)) * 100).toFixed(1));
    b.querySelector(".b-tip").textContent = v == null ? "" : `${v.toFixed(m.dec)} ${m.unidad}`;
  });

  $("histNombre").textContent = m.nombre;
  const e = casa.estado;
  const actual = e?.[k];
  $("histValor").innerHTML = actual == null ? "—" : `${Number(actual).toFixed(m.dec)}<small>${m.unidad}</small>`;
  const antes = muestras.find((x) => x[k] != null)?.[k];
  const tend = $("histTendencia");
  if (actual == null || antes == null || muestras.length < 5) {
    tend.textContent = "Midiendo…";
    tend.className = "tendencia";
  } else {
    const d = Number(actual) - Number(antes);
    tend.className = `tendencia${d > 0 ? " sube" : ""}`;
    tend.innerHTML = `${icono("flecha")}${d > 0 ? "+" : ""}${d.toFixed(m.dec)} ${m.unidad}`;
  }
}

// ------------------------------ Alarma ------------------------------
const MAX_ALERTAS = 10;
const alertas = [];
let ultimoNumAlarmas = null;
let fondo = null;

function pintarAlerta() {
  const e = casa.estado;
  const vivo = Boolean(e && hayDatosRecientes());
  const sonando = vivo && Boolean(e.al);
  const silenciada = vivo && !e.al && Boolean(e.as);
  if (sonando !== alarmaSonando) {
    alarmaSonando = sonando;
    document.body.classList.toggle("en-alarma", sonando);
    fondo?.tono(sonando ? "alerta" : "normal");
    if (sonando) { dormida = false; sonar("alerta"); }
    refrescarMia();
  }
  const caja = $("alertaAlarma");
  caja.hidden = !(sonando || silenciada);
  caja.classList.toggle("activa", sonando);
  if (caja.hidden) return;
  const seg = casa.config?.u?.ta ?? 5;
  if (sonando) {
    $("alertaTitulo").textContent = "¡Persona detectada! La alarma está sonando";
    $("alertaDetalle").textContent = `El sensor detectó a alguien más de ${seg} segundos. Se apaga sola cuando ya no hay nadie.`;
  } else {
    $("alertaTitulo").textContent = "Alarma silenciada";
    $("alertaDetalle").textContent = "El sensor todavía detecta a alguien. Se rearma cuando ya no haya nadie.";
  }
  $("btnSilenciar").hidden = !sonando;
}

// El ESP32 cuenta las alarmas en "na": si sube, hubo una alarma nueva aunque la pagina no la viera
function revisarNuevaAlarma() {
  const e = casa.estado;
  if (!e || e.na == null) return;
  if (ultimoNumAlarmas === null || e.na < ultimoNumAlarmas) { ultimoNumAlarmas = e.na; return; }
  if (e.na === ultimoNumAlarmas) return;
  ultimoNumAlarmas = e.na;
  const hora = horaCorta();
  const texto = "Persona detectada: la alarma se activó";
  alertas.unshift({ hora, texto });
  alertas.length = Math.min(alertas.length, MAX_ALERTAS);
  pintarHistorialAlertas();
  notificar(`${texto} (${hora})`, { peligro: true, iconoN: "sirena" });
  avisar(`¡Alarma! ${texto} (${hora})`, { error: true, accion: { texto: "Silenciar", fn: silenciarAlarma }, ms: 8000 });
  agregarMensaje("nota", `Alarma activada a las ${hora}: el sensor detectó a una persona.`);
  if (!ocupado) mostrarTexto("¡Detecté a una persona en casa! La alarma está sonando.");
  if ($("optNotificaciones").checked && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("MIA: alarma activada", { body: `${texto} a las ${hora}.` }); } catch { /* sin notificaciones */ }
  }
}

function pintarHistorialAlertas() {
  const lista = $("historialAlertas");
  if (!alertas.length) {
    lista.innerHTML = '<li class="vacio">Sin alarmas desde que abriste la página.</li>';
    return;
  }
  lista.innerHTML = "";
  for (const a of alertas) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="id"></span><span class="texto"></span>';
    li.querySelector(".id").textContent = a.hora;
    li.querySelector(".texto").textContent = a.texto;
    lista.append(li);
  }
}

// ------------------------------ Reglas y umbrales ------------------------------
function pintarReglas() {
  const lista = $("reglas");
  const reglas = casa.config?.r || [];
  if (!reglas.length) {
    lista.innerHTML = '<li class="vacio">Aún no hay reglas.</li>';
    return;
  }
  lista.innerHTML = "";
  for (const r of reglas) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="id"></span><span class="texto"></span><button type="button" aria-label="Eliminar regla">${icono("basura")}</button>`;
    li.querySelector(".id").textContent = r.i;
    li.querySelector(".texto").textContent = textoRegla(r);
    li.querySelector("button").addEventListener("click", () => conMia(() => ejecutarAccion("eliminar_regla", { id: r.i })));
    lista.append(li);
  }
}

let umbralesEditados = false;

function pintarRango(input) {
  const u = UMBRALES[input.name];
  input.style.setProperty("--p", `${((input.value - u.min) / (u.max - u.min)) * 100}%`);
  input.closest(".umbral").querySelector("output").textContent = `${input.value} ${u.unidad}`;
}

function construirUmbrales() {
  $("camposUmbrales").innerHTML = Object.entries(UMBRALES)
    .map(([n, u]) => `
      <label class="umbral">
        <span class="u-cab"><span>${u.nombre}</span><output>—</output></span>
        <input type="range" name="${n}" min="${u.min}" max="${u.max}" step="${u.paso}" value="${u.min}">
      </label>`)
    .join("");
  const form = $("formUmbrales");
  form.addEventListener("input", (ev) => {
    umbralesEditados = true;
    if (ev.target.type === "range") pintarRango(ev.target);
  });
  form.addEventListener("submit", guardarUmbrales);
}

function pintarUmbrales() {
  if (umbralesEditados || !casa.config) return;
  const form = $("formUmbrales");
  for (const [n, u] of Object.entries(UMBRALES)) {
    const v = casa.config.u?.[u.clave];
    if (v == null) continue;
    form.elements[n].value = v;
    pintarRango(form.elements[n]);
  }
}

async function guardarUmbrales(ev) {
  ev.preventDefault();
  if (!exigirCasa()) return;
  const form = ev.target;
  const actuales = { ...(casa.config?.u || {}) };
  ponerEstadoMia("ejecutando");
  try {
    for (const [n, u] of Object.entries(UMBRALES)) {
      const v = Number(form.elements[n].value);
      if (v === Number(actuales[u.clave])) continue;
      validarUmbral(n, v);
      await enviarComando({ c: "cfg", k: u.clave, v });
      if (!(await esperar((k) => Math.abs(Number(k.config?.u?.[u.clave]) - v) < 0.01))) {
        throw new Error(`El ESP32 no aceptó: ${u.nombre}`);
      }
      actuales[u.clave] = v;
    }
    umbralesEditados = false;
    pintarUmbrales();
    reaccionMia("exito", 1500);
    sonar("exito");
    avisar("Umbrales guardados en el ESP32");
  } catch (e) {
    reaccionMia("error", 1500);
    sonar("error");
    avisar(e.message, { error: true });
  } finally {
    ponerEstadoMia("reposo");
  }
}

// ------------------------------ Navegación ------------------------------
const PANELES = { dispositivos: "panelDispositivos", escenas: "panelEscenas", sensores: "panelSensores", historial: "panelHistorial" };

function mostrarVista(v) {
  for (const el of document.querySelectorAll(".vista")) el.hidden = el.dataset.vista !== v;
}
function marcarNav(destino) {
  for (const b of document.querySelectorAll(".lateral > button, .tabs-movil button")) b.classList.toggle("activo", b.dataset.ir === destino);
}

function irA(destino) {
  cerrarMenu();
  cerrarDesplegables();
  if (destino === "ajustes") return abrirAjustes();
  sonar("clic");
  marcarNav(destino);
  if (destino === "automatizaciones") {
    mostrarVista("automatizaciones");
    $("columna").scrollIntoView({ behavior: desplazamiento, block: "start" });
    return;
  }
  mostrarVista("inicio");
  if (destino === "inicio") return window.scrollTo({ top: 0, behavior: desplazamiento });
  const p = $(PANELES[destino]);
  p.scrollIntoView({ behavior: desplazamiento, block: "center" });
  p.classList.remove("destacar");
  void p.offsetWidth;
  p.classList.add("destacar");
}

function cerrarMenu() {
  document.body.classList.remove("menu-abierto");
}

// ------------------------------ Desplegables ------------------------------
function alternarDesplegable(boton, panel) {
  const abrir = panel.hidden;
  cerrarDesplegables();
  if (!abrir) return;
  panel.hidden = false;
  boton.setAttribute("aria-expanded", "true");
  sonar("abrir");
}
function cerrarDesplegables() {
  for (const [b, p] of [["btnNotif", "panelNotif"], ["btnHogar", "panelHogar"]]) {
    $(p).hidden = true;
    $(b).setAttribute("aria-expanded", "false");
  }
}
function abrirPanelHogar() {
  cerrarConversacion();
  window.scrollTo({ top: 0, behavior: desplazamiento });
  alternarDesplegable($("btnHogar"), $("panelHogar"));
}

// ------------------------------ Buscador / comandos ------------------------------
let resultados = [];
let seleccionado = 0;

function entradasComando() {
  const e = casa.estado;
  const lista = [];
  for (const [n, d] of Object.entries(DISPOSITIVOS)) {
    const v = e?.[d.clave];
    if (d.soloAlarma) {
      lista.push({ icono: d.icono, titulo: v ? "Silenciar la alarma" : "Alarma", sub: textoValorDispositivo(n, v), tipo: "Dispositivo", claves: "alarma buzzer sirena silenciar pir", accion: () => (v ? silenciarAlarma() : irA("dispositivos")) });
      continue;
    }
    lista.push({
      icono: d.icono, titulo: `${v ? "Apagar" : "Encender"} ${d.nombre.toLowerCase()}`, sub: `Ahora: ${textoValorDispositivo(n, v)}`,
      tipo: "Dispositivo", claves: `${d.nombre} dispositivo luz foco prender`, accion: () => cambiarDispositivo(n, v ? 0 : 1),
    });
  }
  for (const [id, es] of Object.entries(ESCENAS)) {
    lista.push({ icono: es.icono, titulo: `Escena ${es.nombre}`, sub: es.descripcion, tipo: "Escena", claves: "escena activar", accion: () => aplicarEscena(id) });
  }
  lista.push({ icono: "robot", titulo: "Modo automático", sub: "La casa decide sola", tipo: "Modo", claves: "modo auto", accion: () => cambiarModo("automatico") });
  lista.push({ icono: "usuario", titulo: "Modo manual", sub: "Tú controlas cada dispositivo", tipo: "Modo", claves: "modo", accion: () => cambiarModo("manual") });
  for (const t of TARJETAS_SENSORES) {
    const s = SENSORES[t.n];
    const v = e?.[s.clave];
    const valor = v == null ? "Sin datos" : t.n === "presencia" ? (v ? "Movimiento detectado" : "Sin movimiento") : t.n === "hora" ? formatoHora(v) : `${v} ${s.unidad}`;
    lista.push({ icono: t.icono || s.icono, titulo: t.nombre, sub: valor, tipo: "Sensor", claves: "sensor clima", accion: () => irA("sensores") });
  }
  lista.push({ icono: "grafica", titulo: "Historial de sensores", sub: "Gráfica del último minuto", tipo: "Vista", claves: "grafica energia", accion: () => irA("historial") });
  lista.push({ icono: "robot", titulo: "Automatizaciones", sub: "Reglas, umbrales y alertas", tipo: "Vista", claves: "reglas umbrales alertas", accion: () => irA("automatizaciones") });
  lista.push({ icono: "chat", titulo: "Conversación con MIA", sub: "Abrir el chat", tipo: "MIA", claves: "chat hablar escribir", accion: () => abrirConversacion() });
  lista.push({ icono: "ajustes", titulo: "Ajustes", sub: "Servidor MQTT, MIA y sonidos", tipo: "Ajustes", claves: "configuracion conexion servidor sonido", accion: abrirAjustes });
  lista.push({ icono: "bluetooth", titulo: casa.ble === "conectado" ? "Desconectar Bluetooth" : "Conectar por Bluetooth", sub: "Conexión local con el ESP32", tipo: "Ajustes", claves: "ble bluetooth", accion: alternarBle });
  lista.push({ icono: "wifi", titulo: "Conectar por WiFi", sub: "Servidor MQTT", tipo: "Ajustes", claves: "wifi mqtt internet", accion: conectarWifi });
  return lista;
}

function filtrarComandos(q) {
  const palabras = normalizar(q.trim()).split(/\s+/).filter(Boolean);
  const todas = entradasComando();
  let lista = palabras.length
    ? todas.filter((x) => { const h = normalizar(`${x.titulo} ${x.sub} ${x.claves} ${x.tipo}`); return palabras.every((p) => h.includes(p)); })
    : todas.filter((x) => ["Dispositivo", "Escena"].includes(x.tipo));
  lista = lista.slice(0, 7);
  if (q.trim()) {
    const preguntarMia = { icono: "chispa", titulo: `Pedírselo a MIA: “${q.trim()}”`, sub: "MIA entiende lenguaje natural", tipo: "MIA", mia: true, accion: () => preguntar(q) };
    if (lista.length) lista.push(preguntarMia);
    else lista.unshift(preguntarMia);
  }
  return lista;
}

function pintarComandos() {
  const ul = $("resultadosComando");
  const entrada = $("entradaComando");
  resultados = filtrarComandos(entrada.value);
  seleccionado = Math.min(seleccionado, Math.max(0, resultados.length - 1));
  ul.hidden = !resultados.length;
  entrada.setAttribute("aria-expanded", String(!ul.hidden));
  ul.innerHTML = "";
  resultados.forEach((r, i) => {
    const li = document.createElement("li");
    li.role = "option";
    li.id = `cmd-${i}`;
    li.className = r.mia ? "r-mia" : "";
    li.setAttribute("aria-selected", String(i === seleccionado));
    li.innerHTML = `<span class="r-icono">${icono(r.icono)}</span><span class="r-texto"><strong></strong><small></small></span><span class="r-tipo"></span>`;
    li.querySelector("strong").textContent = r.titulo;
    li.querySelector("small").textContent = r.sub;
    li.querySelector(".r-tipo").textContent = r.tipo;
    li.addEventListener("pointerdown", (ev) => { ev.preventDefault(); ejecutarComando(i); });
    ul.append(li);
  });
  if (resultados.length) entrada.setAttribute("aria-activedescendant", `cmd-${seleccionado}`);
}

function ejecutarComando(i) {
  const r = resultados[i];
  if (!r) return;
  const entrada = $("entradaComando");
  entrada.value = "";
  entrada.blur();
  cerrarComandos();
  r.accion();
}
function cerrarComandos() {
  $("resultadosComando").hidden = true;
  $("entradaComando").setAttribute("aria-expanded", "false");
  $("comando").classList.remove("abierto");
}

// ------------------------------ Conexiones ------------------------------
function conectarWifi() {
  if (!ajustes.mqttUrl) return abrirAjustes();
  conectarMqtt(ajustes);
  avisar("Conectando por WiFi…");
}

async function alternarBle() {
  if (casa.ble === "conectado") return desconectarBle();
  if (!bluetoothDisponible) return avisar("Este navegador no soporta Bluetooth. Usa Chrome o Edge.", { error: true });
  try {
    await conectarBle();
    avisar("Bluetooth conectado");
    notificar("Bluetooth conectado con la ESP32", { iconoN: "bluetooth" });
    reaccionMia("exito", 1400);
    sonar("exito");
  } catch (e) {
    if (e.name !== "NotFoundError") avisar(`Bluetooth: ${e.message}`, { error: true });
  }
}

function pintarFrescura() {
  pintarEsp();
  pintarDispositivos();
  pintarAlerta();
}

// ------------------------------ Efectos ------------------------------
function construirOndas() {
  const alturas = [0.25, 0.45, 0.7, 0.4, 0.95, 0.6, 1, 0.55, 0.8, 0.4, 0.6, 0.3, 0.2];
  for (const lado of document.querySelectorAll(".voz-control .onda")) {
    const lista = lado.classList.contains("izq") ? alturas : [...alturas].reverse();
    lado.innerHTML = lista.map((h, i) => `<i style="--h:${h};--d:${(-i * 0.13).toFixed(2)}s"></i>`).join("");
  }
}

function efectosPuntero() {
  const host = $("miaPrincipal");
  const escenario = $("escenario");
  let pendiente = false;
  let ultimo = null;
  window.addEventListener("pointermove", (ev) => {
    ultimo = ev;
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      const e = ultimo;
      if (Date.now() - ultimaActividad > 1000) actividad();
      // MIA sigue al puntero con la mirada y se inclina un poco
      const r = host.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
      const y = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
      mia.mirar(x * 1.4, y * 1.4);
      host.style.setProperty("--mx", Math.max(-1, Math.min(1, x)).toFixed(3));
      host.style.setProperty("--my", Math.max(-1, Math.min(1, y)).toFixed(3));
      const re = escenario.getBoundingClientRect();
      escenario.style.setProperty("--px", ((e.clientX - re.left) / re.width - 0.5).toFixed(3));
      escenario.style.setProperty("--py", ((e.clientY - re.top) / re.height - 0.5).toFixed(3));
      // Luz que sigue al puntero en paneles y tarjetas
      const tarjeta = e.target.closest?.(".panel, .disp");
      if (tarjeta) {
        const rt = tarjeta.getBoundingClientRect();
        tarjeta.style.setProperty("--mx", `${e.clientX - rt.left}px`);
        tarjeta.style.setProperty("--my", `${e.clientY - rt.top}px`);
      }
    });
  }, { passive: true });
  document.addEventListener("pointerleave", () => mia.mirar(null));

  // Onda al tocar botones
  document.addEventListener("pointerdown", (ev) => {
    const b = ev.target.closest(".boton, .chip-sug, .escena, .pastilla-hablar, .lateral > button, .tabs-movil button, .rapidos button, .segmento");
    if (!b || reducirMovimiento) return;
    const r = b.getBoundingClientRect();
    const tam = Math.max(r.width, r.height);
    const s = document.createElement("span");
    s.className = "onda-toque";
    s.style.cssText = `width:${tam}px;height:${tam}px;left:${ev.clientX - r.left - tam / 2}px;top:${ev.clientY - r.top - tam / 2}px`;
    if (getComputedStyle(b).position === "static") b.style.position = "relative";
    b.style.overflow = "hidden";
    b.append(s);
    setTimeout(() => s.remove(), 650);
  });
}

// ------------------------------ Arranque ------------------------------
function yaArranco() {
  try { return sessionStorage.getItem("mia.arranco") === "1"; } catch { return false; }
}

async function arrancar() {
  const mostrar = prefs.arranque && !reducirMovimiento && !yaArranco();
  if (!mostrar) {
    requestAnimationFrame(() => document.body.classList.replace("cargando", "listo"));
    return;
  }
  const el = $("arranque");
  el.hidden = false;
  let saltar = false;
  el.addEventListener("click", () => (saltar = true), { once: true });
  const lineas = ["Inicializando núcleo de MIA", "Enlazando con la ESP32", "Calibrando sensores", "Cargando escenas", "Sistemas en línea"];
  for (let i = 0; i < lineas.length && !saltar; i++) {
    await esperarMs(i ? 360 : 700);
    const li = document.createElement("li");
    li.textContent = lineas[i];
    $("arrLineas").append(li);
    $("arrProgreso").style.setProperty("--v", (i + 1) / lineas.length);
  }
  $("arrProgreso").style.setProperty("--v", 1);
  await esperarMs(saltar ? 0 : 380);
  el.classList.add("fuera");
  document.body.classList.replace("cargando", "listo");
  sonar("arranque");
  setTimeout(() => (el.hidden = true), 750);
  try { sessionStorage.setItem("mia.arranco", "1"); } catch { /* sin almacenamiento */ }
}

// ------------------------------ Inicio ------------------------------
async function iniciar() {
  pintarIconos();
  construirOndas();
  fondo = iniciarFondo($("fondo"));
  mia = crearMia($("miaPrincipal"), { alNivel: (n) => $("vozControl").style.setProperty("--nivel", n.toFixed(3)) });
  miaChat = crearMia($("miaChat"), { mini: true });
  construirDispositivos();
  construirEscenas();
  construirSensores();
  construirHistorial();
  construirUmbrales();
  pintarReglas();
  pintarConexiones();
  pintarFrescura();
  pintarSensores();
  pintarHistorial();
  pintarHistorialAlertas();
  pintarNotificaciones();
  saludar();
  refrescarMia();
  $("optVoz").checked = prefs.voz;
  $("optContinua").checked = prefs.continua;

  suscribir((tipo) => {
    if (tipo === "estado") {
      registrarMuestra();
      pintarSensores();
      pintarDispositivos();
      pintarEscenas();
      pintarAlerta();
      revisarNuevaAlarma();
      pintarHistorial();
      pintarEsp();
    } else if (tipo === "config") {
      pintarReglas();
      pintarUmbrales();
      pintarSensores();
    } else if (tipo === "conexion") {
      pintarConexiones();
    }
  });
  setInterval(pintarFrescura, 1000);

  // MIA se duerme si nadie interactua un rato
  setInterval(() => {
    if (!dormida && estadoBase === "reposo" && !alarmaSonando && Date.now() - ultimaActividad > 75000) {
      dormida = true;
      refrescarMia();
    }
  }, 3000);
  window.addEventListener("keydown", actividad);
  window.addEventListener("pointerdown", actividad);

  // MIA
  const host = $("miaPrincipal");
  host.addEventListener("click", () => {
    if (dormida) return actividad();
    iniciarEscucha();
  });
  host.addEventListener("pointerenter", () => {
    if (mia.estado === "reposo") mia.reaccionar("curiosa", 1100);
  });
  $("btnMic").addEventListener("click", iniciarEscucha);
  $("btnHablar").addEventListener("click", iniciarEscucha);
  $("btnMicChat").addEventListener("click", iniciarEscucha);
  $("btnTeclado").addEventListener("click", () => abrirConversacion());
  for (const b of document.querySelectorAll(".chip-sug")) b.addEventListener("click", () => preguntar(b.dataset.frase));

  // Conversacion
  $("formChat").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entrada = $("textoChat");
    const texto = entrada.value;
    entrada.value = "";
    preguntar(texto);
  });
  $("btnCerrarConv").addEventListener("click", cerrarConversacion);
  $("velo").addEventListener("click", cerrarConversacion);
  $("btnNueva").addEventListener("click", () => {
    callar();
    nuevaConversacion();
    saludar();
    reaccionMia("guino", 1200);
  });
  $("optVoz").addEventListener("change", (ev) => { guardarPrefs({ voz: ev.target.checked }); if (!ev.target.checked) callar(); });
  $("optContinua").addEventListener("change", (ev) => guardarPrefs({ continua: ev.target.checked }));
  $("btnCrearRegla").addEventListener("click", () => abrirConversacion("Crea una regla para que "));

  // Alarma
  $("btnSilenciar").addEventListener("click", silenciarAlarma);
  $("optNotificaciones").addEventListener("change", async (ev) => {
    if (!ev.target.checked) return;
    if (!("Notification" in window)) {
      ev.target.checked = false;
      return avisar("Este navegador no permite notificaciones.", { error: true });
    }
    const permiso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permiso !== "granted") {
      ev.target.checked = false;
      avisar("El navegador no dio permiso para mostrar notificaciones.", { error: true });
    }
  });

  // Modo y accesos rapidos
  $("modoAuto").addEventListener("click", () => cambiarModo("automatico"));
  $("modoManual").addEventListener("click", () => cambiarModo("manual"));
  document.querySelector('[data-rapido="luz_interior"]').addEventListener("click", () => cambiarDispositivo("luz_interior", casa.estado?.li ? 0 : 1));
  document.querySelector('[data-rapido="alarma"]').addEventListener("click", () => (casa.estado?.al ? silenciarAlarma() : irA("dispositivos")));

  // Navegacion
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-ir]");
    if (!b) return;
    ev.preventDefault();
    irA(b.dataset.ir);
  });
  $("btnMenu").addEventListener("click", () => { document.body.classList.toggle("menu-abierto"); sonar("abrir"); });
  document.addEventListener("click", (ev) => {
    if (document.body.classList.contains("menu-abierto") && !ev.target.closest("#lateral, #btnMenu")) cerrarMenu();
    if (!ev.target.closest(".ancla")) cerrarDesplegables();
  });

  // Encabezado
  $("btnNotif").addEventListener("click", () => {
    alternarDesplegable($("btnNotif"), $("panelNotif"));
    sinLeer = 0;
    pintarNotificaciones();
  });
  $("btnLimpiarNotif").addEventListener("click", () => { notificaciones.length = 0; pintarNotificaciones(); });
  $("btnHogar").addEventListener("click", () => alternarDesplegable($("btnHogar"), $("panelHogar")));
  $("btnWifi").addEventListener("click", conectarWifi);
  $("btnBle").addEventListener("click", alternarBle);
  $("espWifi").addEventListener("click", conectarWifi);
  $("espBle").addEventListener("click", alternarBle);

  // Buscador
  const entrada = $("entradaComando");
  entrada.addEventListener("focus", () => { seleccionado = 0; pintarComandos(); });
  entrada.addEventListener("input", () => { seleccionado = 0; pintarComandos(); });
  entrada.addEventListener("blur", () => setTimeout(cerrarComandos, 120));
  entrada.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!resultados.length) return;
      seleccionado = (seleccionado + (ev.key === "ArrowDown" ? 1 : -1) + resultados.length) % resultados.length;
      pintarComandos();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      ejecutarComando(seleccionado);
    } else if (ev.key === "Escape") {
      entrada.blur();
    }
  });
  $("btnBuscar").addEventListener("click", () => {
    $("comando").classList.add("abierto");
    entrada.focus();
  });

  // Atajos de teclado: Ctrl+K busca, M habla, Esc cierra
  window.addEventListener("keydown", (ev) => {
    const escribiendo = ev.target.closest?.("input, textarea, select, [contenteditable]");
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
      ev.preventDefault();
      $("comando").classList.add("abierto");
      entrada.focus();
    } else if (ev.key === "Escape") {
      cerrarConversacion();
      cerrarDesplegables();
      cerrarMenu();
    } else if (!escribiendo && ev.key.toLowerCase() === "m" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      iniciarEscucha();
    }
  });

  // Ajustes
  $("btnCancelarAjustes").addEventListener("click", () => $("dlgAjustes").close());
  $("formAjustes").addEventListener("submit", (ev) => {
    const datos = Object.fromEntries(new FormData(ev.target));
    const nuevos = {};
    for (const k of Object.keys(PREDETERMINADOS)) nuevos[k] = String(datos[k] ?? "").trim();
    if (!nuevos.idCasa) nuevos.idCasa = "casa01";
    ajustes = { ...ajustes, ...nuevos };
    guardarJson(CLAVE_AJUSTES, ajustes);
    guardarPrefs({ sonidos: ev.target.elements.sonidos.checked, arranque: ev.target.elements.arranque.checked });
    if (!esDemo) conectarMqtt(ajustes);
    nuevaConversacion();
    saludar();
    pintarConexiones();
    reaccionMia("exito", 1400);
    sonar("exito");
  });

  efectosPuntero();
  await arrancar();
  reaccionMia("guino", 1400);
  mostrarTexto(`${saludoSegunHora()} ¿En qué puedo ayudarte hoy?`);

  if (esDemo) {
    iniciarSimulador();
    avisar("Modo simulador: la casa es simulada en el navegador");
    $("btnDemoPersona").hidden = false;
    $("btnDemoPersona").addEventListener("click", () => {
      enviarComando({ c: "demo-persona" });
      avisar("Simulando una persona frente al sensor durante 12 segundos");
    });
  } else if (ajustes.mqttUrl) {
    conectarMqtt(ajustes);
  } else if (!ajustes.servidorUrl) {
    abrirAjustes();
  }
}

iniciar();
