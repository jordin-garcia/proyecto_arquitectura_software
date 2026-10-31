// Interfaz principal: panel de la casa + asistente Aurora (texto y voz)
import {
  casa, suscribir, conectarMqtt, conectarBle, desconectarBle, enviarComando, esperar,
  hayDatosRecientes, bluetoothDisponible, iniciarSimulador,
} from "./conexion.js";
import { DISPOSITIVOS, SENSORES, UMBRALES, formatoHora, textoValorDispositivo, textoRegla, validarUmbral } from "./modelo.js";
import { conversar, nuevaConversacion } from "./asistente.js";
import { escuchar, detenerEscucha, hablar, callar, reconocimientoDisponible } from "./voz.js";
import { icono, pintarIconos } from "./iconos.js";

const $ = (id) => document.getElementById(id);

// ------------------------------ Ajustes ------------------------------
const CLAVE_AJUSTES = "casaIA.ajustes";
const PREDETERMINADOS = { mqttUrl: "", mqttUsuario: "", mqttClave: "", idCasa: "casa01", servidorUrl: "", codigoAcceso: "" };

function cargarAjustes() {
  try {
    return { ...PREDETERMINADOS, ...JSON.parse(localStorage.getItem(CLAVE_AJUSTES) || "{}") };
  } catch {
    return { ...PREDETERMINADOS };
  }
}
let ajustes = cargarAjustes();

function guardarAjustes(nuevos) {
  ajustes = { ...ajustes, ...nuevos };
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(ajustes));
  } catch {
    /* modo privado: se usan solo durante esta visita */
  }
}

function abrirAjustes() {
  const form = $("formAjustes");
  for (const [k, v] of Object.entries(ajustes)) if (form.elements[k]) form.elements[k].value = v;
  $("dlgAjustes").showModal();
}

// ------------------------------ Avisos ------------------------------
let relojAviso;
function avisar(texto, esError = false) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.toggle("error", esError);
  el.hidden = false;
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => (el.hidden = true), 4500);
}

async function comando(cmd) {
  try {
    await enviarComando(cmd);
  } catch (e) {
    avisar(e.message, true);
  }
}

// ------------------------------ Sensores ------------------------------
function construirSensores() {
  $("sensores").innerHTML = Object.entries(SENSORES)
    .map(([n, s]) => `
      <div class="sensor" data-sensor="${n}">
        <div class="cabeza">${icono(s.icono)}<span>${s.nombre}</span></div>
        <div class="valor">—</div>
        ${s.unidad === "%" ? '<div class="barrita"><span></span></div>' : ""}
      </div>`)
    .join("");
}

function pintarSensores() {
  const e = casa.estado;
  for (const [n, s] of Object.entries(SENSORES)) {
    const tarjeta = document.querySelector(`.sensor[data-sensor="${n}"]`);
    const v = e?.[s.clave];
    let html = "—";
    if (e && v != null) {
      if (n === "presencia") html = v ? "Hay alguien" : "Nadie";
      else if (n === "hora") html = formatoHora(v);
      else html = `${v}<small>${s.unidad}</small>`;
    }
    tarjeta.querySelector(".valor").innerHTML = html;
    const barra = tarjeta.querySelector(".barrita > span");
    if (barra) barra.style.width = `${e && v != null ? v : 0}%`;
    tarjeta.classList.toggle("alerta", n === "temperatura" && e?.t != null && casa.config && e.t >= casa.config.u.tmax);
    tarjeta.classList.toggle("peligro", n === "presencia" && Boolean(e?.al));
  }
}

// ------------------------------ Alarma por presencia ------------------------------
const MAX_ALERTAS = 10;
const alertas = [];          // historial de esta visita: [{hora, texto}]
let ultimoNumAlarmas = null; // contador "na" del ESP32; cuando sube, hubo una alarma nueva

function pintarAlerta() {
  const e = casa.estado;
  const vivo = Boolean(e && hayDatosRecientes());
  const sonando = vivo && Boolean(e.al);
  const silenciada = vivo && !e.al && Boolean(e.as);
  const caja = $("alertaAlarma");
  caja.hidden = !(sonando || silenciada);
  caja.classList.toggle("activa", sonando);
  if (caja.hidden) return;
  const seg = casa.config?.u?.ta ?? 5;
  if (sonando) {
    $("alertaTitulo").textContent = "¡Persona detectada! La alarma está sonando";
    $("alertaDetalle").textContent = `El sensor de movimiento detectó a alguien durante más de ${seg} segundos. Se apagará sola cuando ya no detecte a nadie.`;
  } else {
    $("alertaTitulo").textContent = "Alarma silenciada";
    $("alertaDetalle").textContent = "El sensor todavía detecta a alguien. La alarma se rearma cuando ya no haya nadie.";
  }
  $("btnSilenciar").hidden = !sonando;
}

// El ESP32 cuenta las alarmas en "na". Si el número sube, se avisa aunque la página
// no haya visto el momento exacto (por ejemplo, si se reconectó).
function revisarNuevaAlarma() {
  const e = casa.estado;
  if (!e || e.na == null) return;
  if (ultimoNumAlarmas === null) { ultimoNumAlarmas = e.na; return; }
  if (e.na < ultimoNumAlarmas) { ultimoNumAlarmas = e.na; return; }   // el ESP32 se reinició
  if (e.na === ultimoNumAlarmas) return;
  ultimoNumAlarmas = e.na;
  const hora = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const texto = "Persona detectada: la alarma se activó";
  alertas.unshift({ hora, texto });
  alertas.length = Math.min(alertas.length, MAX_ALERTAS);
  pintarHistorialAlertas();
  avisar(`¡Alarma! ${texto} (${hora})`, true);
  agregarMensaje("nota", `Alarma activada a las ${hora}: el sensor detectó a una persona.`);
  if ($("optNotificaciones").checked && "Notification" in window && Notification.permission === "granted") {
    try { new Notification("Casa IA: alarma activada", { body: `${texto} a las ${hora}.` }); } catch { /* sin notificaciones */ }
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
    li.innerHTML = `<span class="id"></span><span class="texto"></span>`;
    li.querySelector(".id").textContent = a.hora;
    li.querySelector(".texto").textContent = a.texto;
    lista.append(li);
  }
}

// ------------------------------ Dispositivos ------------------------------
function construirDispositivos() {
  const cont = $("dispositivos");
  cont.innerHTML = Object.entries(DISPOSITIVOS)
    .map(([n, d]) => `
      <div class="dispositivo" data-disp="${n}">
        <div class="burbuja-icono">${icono(d.icono)}</div>
        <div class="nombre">${d.nombre}</div>
        <label class="control interruptor" aria-label="${d.nombre}">
          <input type="checkbox"><span></span>
        </label>
        <div class="estado">—</div>
      </div>`)
    .join("");

  for (const [n, d] of Object.entries(DISPOSITIVOS)) {
    const tarjeta = cont.querySelector(`[data-disp="${n}"]`);
    tarjeta.querySelector('input[type="checkbox"]').addEventListener("change", (ev) => {
      comando({ c: "set", d: d.clave, v: ev.target.checked ? 1 : 0 });
    });
  }
}

function pintarDispositivos() {
  const e = casa.estado;
  const vivo = Boolean(e) && hayDatosRecientes();
  const manual = e?.m === "M" && vivo;
  for (const [n, d] of Object.entries(DISPOSITIVOS)) {
    const tarjeta = document.querySelector(`.dispositivo[data-disp="${n}"]`);
    const v = e?.[d.clave];
    tarjeta.classList.toggle("encendido", Boolean(v));
    let texto = textoValorDispositivo(n, v);
    if (d.siempreManual && e) texto += " · desde la página";
    tarjeta.querySelector(".estado").textContent = e ? texto : "Sin datos";
    const check = tarjeta.querySelector('input[type="checkbox"]');
    check.checked = Boolean(v);
    // El foco interior se maneja en cualquier modo; en automático la alarma solo se puede apagar
    check.disabled = !vivo || !(manual || d.siempreManual || (d.soloAlarma && v));
  }
  $("notaModo").textContent = !e ? "" : manual
    ? "Modo manual: controla cada dispositivo"
    : "Modo automático: la casa decide sola (el foco interior siempre se controla aquí)";
  $("modoAuto").classList.toggle("activo", e?.m === "A");
  $("modoManual").classList.toggle("activo", e?.m === "M");
}

// ------------------------------ Gráfica ------------------------------
let grafica = null;
let ultimoPunto = 0;
const MAX_PUNTOS = 150; // 150 puntos x 2 s = 5 minutos

function crearGrafica() {
  if (!window.Chart) return;
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim();
  const texto2 = color("--texto-2");
  const borde = color("--borde");
  grafica = new window.Chart($("grafica"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Temperatura (°C)", data: [], yAxisID: "y", borderColor: color("--calido"), backgroundColor: color("--calido"), tension: 0.35, pointRadius: 0, borderWidth: 2 },
        { label: "Humedad del suelo (%)", data: [], yAxisID: "y1", borderColor: color("--ok"), backgroundColor: color("--ok"), tension: 0.35, pointRadius: 0, borderWidth: 2 },
        { label: "Luz (%)", data: [], yAxisID: "y1", borderColor: color("--agua"), backgroundColor: color("--agua"), tension: 0.35, pointRadius: 0, borderWidth: 1.5, borderDash: [4, 4] },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 6, color: texto2 }, grid: { display: false } },
        y: { position: "left", ticks: { color: texto2 }, grid: { color: borde } },
        y1: { position: "right", min: 0, max: 100, ticks: { color: texto2 }, grid: { drawOnChartArea: false } },
      },
      plugins: { legend: { labels: { color: texto2, boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
    },
  });
}

function agregarPunto() {
  const e = casa.estado;
  if (!grafica || !e || Date.now() - ultimoPunto < 2000) return;
  ultimoPunto = Date.now();
  const d = grafica.data;
  d.labels.push(new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  d.datasets[0].data.push(e.t);
  d.datasets[1].data.push(e.s);
  d.datasets[2].data.push(e.l);
  if (d.labels.length > MAX_PUNTOS) {
    d.labels.shift();
    d.datasets.forEach((ds) => ds.data.shift());
  }
  grafica.update("none");
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
    li.querySelector("button").addEventListener("click", () => comando({ c: "regla-", i: r.i }));
    lista.append(li);
  }
}

let umbralesEditados = false;

function construirUmbrales() {
  $("camposUmbrales").innerHTML = Object.entries(UMBRALES)
    .map(([n, u]) => `
      <label>${u.nombre}
        <span class="campo-numero">
          <input type="number" name="${n}" min="${u.min}" max="${u.max}" step="${u.paso}" inputmode="decimal">
          <span>${u.unidad}</span>
        </span>
      </label>`)
    .join("");
  $("formUmbrales").addEventListener("input", () => (umbralesEditados = true));
  $("formUmbrales").addEventListener("submit", guardarUmbrales);
}

function pintarUmbrales() {
  if (umbralesEditados || !casa.config) return;
  const form = $("formUmbrales");
  for (const [n, u] of Object.entries(UMBRALES)) form.elements[n].value = casa.config.u?.[u.clave] ?? "";
}

async function guardarUmbrales(ev) {
  ev.preventDefault();
  const form = ev.target;
  const actuales = { ...(casa.config?.u || {}) };
  try {
    for (const [n, u] of Object.entries(UMBRALES)) {
      const v = Number(form.elements[n].value);
      if (form.elements[n].value === "" || v === Number(actuales[u.clave])) continue;
      validarUmbral(n, v);
      await enviarComando({ c: "cfg", k: u.clave, v });
      if (!(await esperar((k) => Math.abs(Number(k.config?.u?.[u.clave]) - v) < 0.01))) {
        throw new Error(`El ESP32 no aceptó: ${u.nombre}`);
      }
      actuales[u.clave] = v;
    }
    umbralesEditados = false;
    pintarUmbrales();
    avisar("Umbrales guardados en el ESP32");
  } catch (e) {
    avisar(e.message, true);
  }
}

// ------------------------------ Conexiones ------------------------------
function pintarConexiones() {
  const wifi = $("btnWifi");
  let estadoWifi = casa.mqtt;
  if (casa.mqtt === "conectado" && !casa.esp32EnLinea) estadoWifi = "sin-casa";
  wifi.dataset.estado = estadoWifi;
  wifi.title = {
    desconectado: "WiFi: sin configurar o desconectado (toca para ajustes)",
    conectando: "WiFi: conectando al servidor MQTT…",
    conectado: "WiFi: conectado, la casa está en línea",
    "sin-casa": "WiFi: conectado al servidor, pero el ESP32 no está en línea",
  }[estadoWifi];
  const ble = $("btnBle");
  ble.dataset.estado = casa.ble;
  ble.title = casa.ble === "conectado" ? "Bluetooth conectado (toca para desconectar)" : "Conectar por Bluetooth";
}

function pintarFrescura() {
  const el = $("frescura");
  const vivo = hayDatosRecientes();
  el.classList.toggle("vivo", vivo);
  el.textContent = vivo ? "En vivo" : casa.estado ? "Sin datos recientes" : "Sin datos";
  pintarDispositivos();
  pintarAlerta();
}

// ------------------------------ Asistente ------------------------------
const chat = $("chat");
let ocupado = false;
let escuchandoAhora = false;

function ponerEstadoOrbe(estado) {
  $("orbe").dataset.estado = estado;
  $("estadoAsistente").textContent = {
    reposo: "Lista para ayudarte",
    escuchando: "Te escucho…",
    pensando: "Pensando…",
    hablando: "Hablando…",
  }[estado];
}

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

function saludar() {
  chat.innerHTML = "";
  agregarMensaje("asistente", "¡Hola! Soy Aurora. Puedo controlar la casa, contarte qué está pasando y crear reglas nuevas. Escríbeme o toca el micrófono.");
  if (!ajustes.servidorUrl) agregarMensaje("nota", "Configura la dirección del servidor de la asistente en Ajustes.");
}

async function preguntar(texto) {
  texto = texto.trim();
  if (!texto || ocupado) return;
  callar();
  ocupado = true;
  agregarMensaje("usuario", texto);
  ponerEstadoOrbe("pensando");
  const conVoz = $("optVoz").checked;
  let habla = Promise.resolve();
  const decir = (t) => {
    if (!conVoz) return;
    habla = habla.then(() => {
      ponerEstadoOrbe("hablando");
      return hablar(t);
    });
  };

  try {
    await conversar(texto, ajustes, {
      alTexto: (t) => { agregarMensaje("asistente", t); decir(t); },
      alAccion: agregarAccion,
      alPensar: (p) => { if (p) ponerEstadoOrbe("pensando"); },
      alReiniciar: () => agregarMensaje("nota", "La conversación era muy larga; empecé una nueva."),
    });
  } catch (e) {
    agregarMensaje("error", e.message);
    decir(e.message);
  } finally {
    ocupado = false;
  }
  await habla;
  ponerEstadoOrbe("reposo");
  if ($("optContinua").checked && reconocimientoDisponible) iniciarEscucha();
}

async function iniciarEscucha() {
  if (escuchandoAhora) {
    detenerEscucha();
    return;
  }
  if (ocupado) return;
  callar();
  escuchandoAhora = true;
  $("btnMic").classList.add("activo");
  ponerEstadoOrbe("escuchando");
  const entrada = $("textoChat");
  let texto = "";
  try {
    texto = await escuchar((parcial) => (entrada.value = parcial));
  } catch (e) {
    agregarMensaje("error", e.message);
  } finally {
    escuchandoAhora = false;
    $("btnMic").classList.remove("activo");
    entrada.value = "";
    ponerEstadoOrbe("reposo");
  }
  if (texto) await preguntar(texto);
}

// ------------------------------ Inicio ------------------------------
function iniciar() {
  pintarIconos();
  construirSensores();
  construirDispositivos();
  construirUmbrales();
  crearGrafica();
  pintarReglas();
  pintarConexiones();
  pintarFrescura();
  pintarAlerta();
  pintarHistorialAlertas();
  saludar();

  suscribir((tipo) => {
    if (tipo === "estado") {
      pintarSensores();
      pintarDispositivos();
      pintarAlerta();
      revisarNuevaAlarma();
      agregarPunto();
    } else if (tipo === "config") {
      pintarReglas();
      pintarUmbrales();
      pintarSensores();
    } else if (tipo === "conexion") {
      pintarConexiones();
    }
  });
  setInterval(pintarFrescura, 1000);

  // Alarma
  $("btnSilenciar").addEventListener("click", () => comando({ c: "alarma", v: 0 }));
  $("optNotificaciones").addEventListener("change", async (ev) => {
    if (!ev.target.checked) return;
    if (!("Notification" in window)) {
      ev.target.checked = false;
      return avisar("Este navegador no permite notificaciones.", true);
    }
    const permiso = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permiso !== "granted") {
      ev.target.checked = false;
      avisar("El navegador no dio permiso para mostrar notificaciones.", true);
    }
  });

  // Modo
  $("modoAuto").addEventListener("click", () => comando({ c: "modo", v: "A" }));
  $("modoManual").addEventListener("click", () => comando({ c: "modo", v: "M" }));

  // Conexiones
  $("btnWifi").addEventListener("click", () => {
    if (!ajustes.mqttUrl) abrirAjustes();
    else conectarMqtt(ajustes);
  });
  $("btnBle").addEventListener("click", async () => {
    if (casa.ble === "conectado") return desconectarBle();
    if (!bluetoothDisponible) return avisar("Este navegador no soporta Bluetooth. Usa Chrome o Edge.", true);
    try {
      await conectarBle();
      avisar("Bluetooth conectado");
    } catch (e) {
      if (e.name !== "NotFoundError") avisar(`Bluetooth: ${e.message}`, true);
    }
  });

  // Ajustes
  $("btnAjustes").addEventListener("click", abrirAjustes);
  $("btnCancelarAjustes").addEventListener("click", () => $("dlgAjustes").close());
  $("formAjustes").addEventListener("submit", (ev) => {
    const datos = Object.fromEntries(new FormData(ev.target));
    for (const k of Object.keys(datos)) datos[k] = String(datos[k]).trim();
    if (!datos.idCasa) datos.idCasa = "casa01";
    guardarAjustes(datos);
    conectarMqtt(ajustes);
    nuevaConversacion();
    saludar();
  });

  // Asistente
  $("formChat").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entrada = $("textoChat");
    const texto = entrada.value;
    entrada.value = "";
    preguntar(texto);
  });
  $("btnMic").addEventListener("click", iniciarEscucha);
  if (!reconocimientoDisponible) $("btnMic").title = "Tu navegador no reconoce voz (usa Chrome o Edge)";
  for (const b of $("sugerencias").querySelectorAll("button")) {
    b.addEventListener("click", () => preguntar(b.textContent));
  }
  $("btnNueva").addEventListener("click", () => {
    callar();
    nuevaConversacion();
    saludar();
  });

  // Pestañas en el celular
  for (const b of document.querySelectorAll(".pestanas button")) {
    b.addEventListener("click", () => {
      document.querySelectorAll(".pestanas button").forEach((x) => x.classList.toggle("activa", x === b));
      document.body.classList.toggle("ver-asistente", b.dataset.panel === "asistente");
    });
  }

  if (new URLSearchParams(location.search).has("demo")) {
    iniciarSimulador();
    avisar("Modo simulador: la casa es simulada en el navegador");
    $("btnDemoPersona").hidden = false;
    $("btnDemoPersona").addEventListener("click", () => comando({ c: "demo-persona" }));
  } else if (ajustes.mqttUrl) {
    conectarMqtt(ajustes);
  } else if (!ajustes.servidorUrl) {
    abrirAjustes();
  }
}

iniciar();
