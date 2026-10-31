// Conexion con el ESP32 por WiFi (MQTT sobre WebSocket seguro) y por Bluetooth (Web Bluetooth).
// Ambos canales entregan el mismo estado y aceptan los mismos comandos JSON.

const UUID_SERVICIO = "6f1a0001-3c2b-4f5e-9a8d-1b2c3d4e5f60";
const UUID_ESTADO = "6f1a0002-3c2b-4f5e-9a8d-1b2c3d4e5f60";
const UUID_COMANDO = "6f1a0003-3c2b-4f5e-9a8d-1b2c3d4e5f60";
const UUID_CONFIG = "6f1a0004-3c2b-4f5e-9a8d-1b2c3d4e5f60";

export const casa = {
  estado: null,          // ultimo estado recibido del ESP32
  config: null,          // umbrales y reglas
  actualizado: 0,        // hora (ms) del ultimo estado
  mqtt: "desconectado",  // desconectado | conectando | conectado
  ble: "desconectado",
  esp32EnLinea: false,   // reportado por el broker MQTT
};

const oyentes = new Set();
export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
function emitir(tipo) {
  for (const fn of oyentes) fn(tipo, casa);
}

function recibirEstado(texto) {
  try {
    casa.estado = JSON.parse(texto);
    casa.actualizado = Date.now();
    emitir("estado");
  } catch {
    console.warn("Estado invalido:", texto);
  }
}
function recibirConfig(texto) {
  try {
    casa.config = JSON.parse(texto);
    emitir("config");
  } catch {
    console.warn("Config invalida:", texto);
  }
}

export function hayDatosRecientes() {
  return casa.estado && Date.now() - casa.actualizado < 5000;
}

// ------------------------------- MQTT (WiFi) -------------------------------
let clienteMqtt = null;
let topicos = null;

export function conectarMqtt({ mqttUrl, mqttUsuario, mqttClave, idCasa }) {
  desconectarMqtt();
  if (!mqttUrl || !window.mqtt) return;
  topicos = {
    estado: `casa/${idCasa}/estado`,
    config: `casa/${idCasa}/config`,
    online: `casa/${idCasa}/online`,
    cmd: `casa/${idCasa}/cmd`,
  };
  casa.mqtt = "conectando";
  emitir("conexion");
  clienteMqtt = window.mqtt.connect(mqttUrl, {
    username: mqttUsuario,
    password: mqttClave,
    clientId: "web-" + Math.random().toString(16).slice(2, 10),
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    clean: true,
  });
  clienteMqtt.on("connect", () => {
    casa.mqtt = "conectado";
    clienteMqtt.subscribe([topicos.estado, topicos.config, topicos.online]);
    emitir("conexion");
  });
  clienteMqtt.on("reconnect", () => {
    casa.mqtt = "conectando";
    emitir("conexion");
  });
  clienteMqtt.on("close", () => {
    if (casa.mqtt !== "desconectado") casa.mqtt = "conectando";
    emitir("conexion");
  });
  clienteMqtt.on("error", (e) => console.warn("MQTT:", e.message));
  clienteMqtt.on("message", (topico, datos) => {
    const texto = new TextDecoder().decode(datos);
    if (topico === topicos.estado) recibirEstado(texto);
    else if (topico === topicos.config) recibirConfig(texto);
    else if (topico === topicos.online) {
      casa.esp32EnLinea = texto === "1";
      emitir("conexion");
    }
  });
}

export function desconectarMqtt() {
  if (clienteMqtt) {
    casa.mqtt = "desconectado";
    clienteMqtt.end(true);
    clienteMqtt = null;
    emitir("conexion");
  }
}

// ---------------------------- Bluetooth (BLE) ----------------------------
let dispositivoBle = null;
let chComando = null;
let colaBle = Promise.resolve(); // Web Bluetooth no permite dos escrituras a la vez

export const bluetoothDisponible = "bluetooth" in navigator;

export async function conectarBle() {
  if (!bluetoothDisponible) {
    throw new Error("Este navegador no soporta Bluetooth. Usa Chrome o Edge (en Android o PC).");
  }
  dispositivoBle = await navigator.bluetooth.requestDevice({ filters: [{ services: [UUID_SERVICIO] }] });
  dispositivoBle.addEventListener("gattserverdisconnected", () => {
    casa.ble = "desconectado";
    chComando = null;
    emitir("conexion");
  });
  casa.ble = "conectando";
  emitir("conexion");
  try {
    const servidor = await dispositivoBle.gatt.connect();
    const servicio = await servidor.getPrimaryService(UUID_SERVICIO);
    const chEstado = await servicio.getCharacteristic(UUID_ESTADO);
    const chConfig = await servicio.getCharacteristic(UUID_CONFIG);
    chComando = await servicio.getCharacteristic(UUID_COMANDO);
    const decodificar = (vista) => new TextDecoder().decode(vista);

    chEstado.addEventListener("characteristicvaluechanged", (e) => recibirEstado(decodificar(e.target.value)));
    chConfig.addEventListener("characteristicvaluechanged", (e) => recibirConfig(decodificar(e.target.value)));
    await chEstado.startNotifications();
    await chConfig.startNotifications();
    recibirConfig(decodificar(await chConfig.readValue()));

    casa.ble = "conectado";
    emitir("conexion");
  } catch (e) {
    casa.ble = "desconectado";
    emitir("conexion");
    if (dispositivoBle.gatt.connected) dispositivoBle.gatt.disconnect();
    throw e;
  }
}

export function desconectarBle() {
  if (dispositivoBle?.gatt.connected) dispositivoBle.gatt.disconnect();
}

// ------------------------------- Comandos -------------------------------
// ------------------------------- Simulador -------------------------------
let simulador = null;
export async function iniciarSimulador() {
  const { crearSimulador } = await import("./simulador.js");
  simulador = crearSimulador(recibirEstado, recibirConfig);
  casa.simulador = true;
  emitir("conexion");
}

// Prefiere Bluetooth (local, sin internet); si no hay, usa WiFi/MQTT.
export async function enviarComando(comando) {
  if (simulador) {
    simulador.enviar(comando);
    return "simulador";
  }
  const texto = JSON.stringify(comando);
  if (casa.ble === "conectado" && chComando) {
    const datos = new TextEncoder().encode(texto);
    const envio = colaBle.then(() => chComando.writeValueWithResponse(datos));
    colaBle = envio.catch(() => {});
    await envio;
    return "bluetooth";
  }
  if (casa.mqtt === "conectado" && clienteMqtt) {
    clienteMqtt.publish(topicos.cmd, texto);
    return "wifi";
  }
  throw new Error("La casa no está conectada. Conéctala por WiFi o Bluetooth.");
}

// Espera hasta que el ESP32 confirme un cambio (o se acabe el tiempo).
export function esperar(condicion, ms = 3500) {
  return new Promise((resolver) => {
    if (condicion(casa)) return resolver(true);
    const quitar = suscribir(() => {
      if (condicion(casa)) {
        quitar();
        clearTimeout(reloj);
        resolver(true);
      }
    });
    const reloj = setTimeout(() => {
      quitar();
      resolver(false);
    }, ms);
  });
}
