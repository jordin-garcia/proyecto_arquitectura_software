// =====================================================================
//  Casa inteligente con asistente virtual - Firmware ESP32
//  Curso: Arquitectura del Computador - Universidad Rafael Landivar
//
//  Dispositivos:
//   1. Foco interior: solo se enciende y apaga desde la pagina web.
//   2. Foco exterior: se enciende cuando el LDR no detecta luz.
//   3. Bomba del riego: riega cuando la tierra esta seca.
//   4. Ventilador: se enciende cuando sube la temperatura.
//   5. Alarma: si el PIR detecta a una persona durante 5 s seguidos suena
//      el buzzer y la pagina recibe el aviso. Se apaga cuando ya no hay
//      nadie o cuando la silencian desde la pagina.
//
//  Arquitectura del firmware (doble nucleo con FreeRTOS):
//   - Nucleo 1 (loop): lee sensores, ejecuta la automatizacion y controla
//     los actuadores. Nunca espera a la red, por eso la casa sigue
//     funcionando sola aunque se caiga el WiFi o internet.
//   - Nucleo 0 (tareaComunicaciones): WiFi + MQTT (TLS) y publicacion del
//     estado. El Bluetooth (NimBLE) corre en su propia tarea del sistema.
//   - Los comandos que llegan por WiFi o Bluetooth entran a una COLA de
//     FreeRTOS; el nucleo 1 los consume. El estado compartido se protege
//     con un MUTEX. El sensor de movimiento usa una INTERRUPCION.
//
//  Requisitos (Arduino IDE):
//   - Placa: "ESP32 Dev Module", nucleo esp32 de Espressif version 3.x
//   - Partition Scheme: "Huge APP (3MB No OTA/1MB SPIFFS)"
//   - Librerias: PubSubClient (Nick O'Leary), ArduinoJson 7.x (Benoit Blanchon),
//     DHT sensor library (Adafruit) + Adafruit Unified Sensor,
//     NimBLE-Arduino 2.x (h2zero)
// =====================================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <atomic>
#include <time.h>

#include "config.h"
#include "secrets.h"   // copiar secrets.h.example como secrets.h

#define TOPICO(x) "casa/" ID_CASA "/" x
#define TAM_CMD 256

// ---------------------------------------------------------------------
//  Modelo de datos
// ---------------------------------------------------------------------
// LUZ_INT solo la controla la pagina y ALARMA la maneja el PIR: las reglas no pueden usarlos.
enum Disp { LUZ_INT, LUZ_EXT, VENT, BOMBA, ALARMA, N_DISP };
const char* CLAVE_DISP[N_DISP] = {"li", "le", "f", "b", "al"};
const char* SENSORES_VALIDOS[] = {"t", "h", "s", "l", "p", "hm"};

struct Lecturas {
  float temp = NAN;          // °C
  float humAire = NAN;       // %
  int suelo = 0;             // % de humedad del suelo
  int luz = 0;               // % de luz de afuera
  bool presencia = false;    // el PIR detecta a alguien
  uint32_t presenciaDesde = 0; // millis() desde que la deteccion es continua (0 = nadie)
  int horaMin = -1;          // HHMM (ej. 2215), -1 si no hay hora de internet
};

struct Umbrales {
  float tmax = DEF_TEMP_MAX;
  int smin = DEF_SUELO_MIN, ln = DEF_LUZ_NOCHE, ta = DEF_ALARMA_SEG;
};

// Regla creada por el usuario (o por la asistente):
// "si <sensor> <op> <x> entonces <dispositivo> = <valor>"
struct Regla {
  char id[6];
  char sensor[3];
  char op;
  float x;
  uint8_t disp;
  int valor;
};

// ---------------------------------------------------------------------
//  Estado compartido entre nucleos (protegido por 'mutex')
// ---------------------------------------------------------------------
Lecturas lect;
Umbrales umb;
Regla reglas[MAX_REGLAS];
int nReglas = 0;
bool modoAuto = true;          // al encender, la casa arranca en automatico
int salida[N_DISP] = {0};      // valor deseado de cada actuador (0 o 1)
std::atomic<bool> configCambiada{true};

SemaphoreHandle_t mutex;
QueueHandle_t colaComandos;

// Variables internas de la automatizacion (solo nucleo 1)
int ventAuto = 0, luzExtAuto = 0, riegoAuto = 0;
uint32_t inicioRiego = 0, finRiego = 0;
uint32_t bombaEncendidaDesde = 0, bombaBloqueadaHasta = 0;

// Alarma por presencia
bool alarmaActiva = false;      // el buzzer suena
bool alarmaSilenciada = false;  // la silenciaron desde la pagina; se rearma cuando ya no hay nadie
uint32_t numAlarmas = 0;        // alarmas desde el arranque (la pagina lo usa para avisar)

// Sensor de movimiento por interrupcion
volatile bool flancoPir = false;

DHT dht(PIN_DHT, DHT22);
Preferences prefs;
WiFiClientSecure clienteTLS;
PubSubClient mqtt(clienteTLS);
NimBLECharacteristic* chEstado = nullptr;
NimBLECharacteristic* chConfig = nullptr;
std::atomic<int> conexionesBle{0};

// ---------------------------------------------------------------------
//  Interrupcion del sensor PIR (se ejecuta desde la RAM interna)
// ---------------------------------------------------------------------
void IRAM_ATTR isrPir() {
  flancoPir = true;
}

// ---------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------
int indiceDisp(const char* clave) {
  for (int i = 0; i < N_DISP; i++) if (strcmp(clave, CLAVE_DISP[i]) == 0) return i;
  return -1;
}

bool sensorValido(const char* s) {
  for (const char* v : SENSORES_VALIDOS) if (strcmp(s, v) == 0) return true;
  return false;
}

// Todos los dispositivos son de encendido/apagado: 0 o 1.
int limitarValor(float v) {
  return lroundf(v) ? 1 : 0;
}

int leerAnalogPromedio(int pin) {
  long suma = 0;
  for (int i = 0; i < 8; i++) suma += analogRead(pin);
  return suma / 8;
}

void escribirRele(int pin, bool encendido) {
  digitalWrite(pin, (encendido ^ RELE_ACTIVO_BAJO) ? HIGH : LOW);
}

// Salidas con transistor 2N2222: ALTO = encendido
void escribirTransistor(int pin, bool encendido) {
  digitalWrite(pin, encendido ? HIGH : LOW);
}

// ---------------------------------------------------------------------
//  Persistencia de umbrales y reglas en la memoria flash
// ---------------------------------------------------------------------
void reglasAJson(JsonArray arr) {
  for (int i = 0; i < nReglas; i++) {
    JsonObject r = arr.add<JsonObject>();
    r["i"] = reglas[i].id;
    r["s"] = reglas[i].sensor;
    char op[2] = {reglas[i].op, 0};
    r["o"] = op;
    r["x"] = serialized(String(reglas[i].x, 1));
    r["d"] = CLAVE_DISP[reglas[i].disp];
    r["v"] = reglas[i].valor;
  }
}

// Valida una regla en formato JSON y la copia a 'out'. Devuelve false si es invalida.
bool reglaDesdeJson(JsonObjectConst r, Regla& out) {
  const char* id = r["i"] | "";
  const char* s = r["s"] | "";
  const char* o = r["o"] | "";
  const char* d = r["d"] | "";
  int disp = indiceDisp(d);
  if (strlen(id) == 0 || strlen(id) > 5) return false;
  if (!sensorValido(s)) return false;
  if (strlen(o) != 1 || !strchr("<>=", o[0])) return false;
  if (disp < 0 || !r["x"].is<float>() || !r["v"].is<float>()) return false;
  if (disp == LUZ_INT || disp == ALARMA) return false;   // solo pagina / solo PIR
  strncpy(out.id, id, sizeof(out.id));
  out.id[sizeof(out.id) - 1] = 0;
  strncpy(out.sensor, s, sizeof(out.sensor));
  out.sensor[sizeof(out.sensor) - 1] = 0;
  out.op = o[0];
  out.x = r["x"].as<float>();
  out.disp = disp;
  out.valor = limitarValor(r["v"].as<float>());
  return true;
}

void guardarConfig() {
  JsonDocument doc;
  reglasAJson(doc.to<JsonArray>());
  String json;
  serializeJson(doc, json);
  prefs.begin("casa", false);
  prefs.putFloat("tmax", umb.tmax);
  prefs.putInt("smin", umb.smin);
  prefs.putInt("ln", umb.ln);
  prefs.putInt("ta", umb.ta);
  prefs.putString("reglas", json);
  prefs.end();
  configCambiada = true;
}

void cargarConfig() {
  prefs.begin("casa", true);
  umb.tmax = prefs.getFloat("tmax", DEF_TEMP_MAX);
  umb.smin = prefs.getInt("smin", DEF_SUELO_MIN);
  umb.ln = prefs.getInt("ln", DEF_LUZ_NOCHE);
  umb.ta = prefs.getInt("ta", DEF_ALARMA_SEG);
  String json = prefs.getString("reglas", "[]");
  prefs.end();

  JsonDocument doc;
  nReglas = 0;
  if (deserializeJson(doc, json) == DeserializationError::Ok) {
    for (JsonVariantConst r : doc.as<JsonArrayConst>()) {
      if (nReglas < MAX_REGLAS && reglaDesdeJson(r.as<JsonObjectConst>(), reglas[nReglas])) nReglas++;
    }
  }
  Serial.printf("Config cargada: %d reglas\n", nReglas);
}

// ---------------------------------------------------------------------
//  Comandos (llegan por MQTT o Bluetooth y pasan por la cola)
//   {"c":"modo","v":"A"|"M"}
//   {"c":"set","d":"li|le|f|b|al","v":0|1}   li en cualquier modo; los demas solo en manual
//   {"c":"cfg","k":"tmax|smin|ln|ta","v":numero}
//   {"c":"regla+","r":{"i":"r1","s":"l","o":"<","x":30,"d":"le","v":1}}
//   {"c":"regla-","i":"r1"}
//   {"c":"alarma","v":0}                      silencia la alarma hasta que ya no haya nadie
// ---------------------------------------------------------------------
void encolarComando(const char* datos, size_t len) {
  char buf[TAM_CMD];
  if (len >= TAM_CMD) {
    Serial.println("Comando demasiado largo, descartado");
    return;
  }
  memcpy(buf, datos, len);
  buf[len] = 0;
  if (xQueueSend(colaComandos, buf, 0) != pdTRUE) Serial.println("Cola de comandos llena");
}

bool aplicarUmbral(const char* k, float v) {
  Umbrales n = umb;
  if (!strcmp(k, "tmax")) n.tmax = v;
  else if (!strcmp(k, "smin")) n.smin = lroundf(v);
  else if (!strcmp(k, "ln")) n.ln = lroundf(v);
  else if (!strcmp(k, "ta")) n.ta = lroundf(v);
  else return false;
  // Rangos seguros: si el valor no tiene sentido se rechaza
  if (n.tmax < 20 || n.tmax > 35) return false;
  if (n.smin < 10 || n.smin > 80) return false;
  if (n.ln < 5 || n.ln > 60) return false;
  if (n.ta < 2 || n.ta > 30) return false;
  umb = n;
  return true;
}

// Silencia la alarma. Si la persona sigue ahi, no vuelve a sonar hasta que se vaya.
void silenciarAlarma() {
  alarmaActiva = false;
  alarmaSilenciada = lect.presencia;
  salida[ALARMA] = 0;
  Serial.println("Alarma silenciada desde la pagina");
}

void ejecutarComando(const char* texto) {
  JsonDocument doc;
  if (deserializeJson(doc, texto)) {
    Serial.printf("JSON invalido: %s\n", texto);
    return;
  }
  const char* c = doc["c"] | "";
  uint32_t ahora = millis();

  if (!strcmp(c, "modo")) {
    const char* v = doc["v"] | "";
    if (!strcmp(v, "A")) modoAuto = true;
    else if (!strcmp(v, "M")) modoAuto = false;
    Serial.printf("Modo: %s\n", modoAuto ? "AUTOMATICO" : "MANUAL");

  } else if (!strcmp(c, "set")) {
    int d = indiceDisp(doc["d"] | "");
    if (d < 0 || !doc["v"].is<float>()) return;
    int v = limitarValor(doc["v"].as<float>());
    // Apagar la alarma se permite en cualquier modo (es lo mismo que silenciarla)
    if (d == ALARMA && !v) { silenciarAlarma(); return; }
    // El foco interior se controla desde la pagina en cualquier modo
    if (d != LUZ_INT && modoAuto) { Serial.println("Rechazado: la casa esta en modo automatico"); return; }
    if (d == BOMBA && v && ahora < bombaBloqueadaHasta) {
      Serial.println("Rechazado: bomba en pausa de seguridad");
      return;
    }
    salida[d] = v;

  } else if (!strcmp(c, "alarma")) {
    silenciarAlarma();

  } else if (!strcmp(c, "cfg")) {
    if (doc["v"].is<float>() && aplicarUmbral(doc["k"] | "", doc["v"].as<float>())) guardarConfig();
    else Serial.println("Umbral rechazado (fuera de rango)");

  } else if (!strcmp(c, "regla+")) {
    Regla r;
    if (!reglaDesdeJson(doc["r"].as<JsonObjectConst>(), r)) { Serial.println("Regla invalida"); return; }
    for (int i = 0; i < nReglas; i++) {
      if (!strcmp(reglas[i].id, r.id)) { reglas[i] = r; guardarConfig(); return; }
    }
    if (nReglas >= MAX_REGLAS) { Serial.println("Maximo de reglas alcanzado"); return; }
    reglas[nReglas++] = r;
    guardarConfig();

  } else if (!strcmp(c, "regla-")) {
    const char* id = doc["i"] | "";
    for (int i = 0; i < nReglas; i++) {
      if (!strcmp(reglas[i].id, id)) {
        for (int j = i; j < nReglas - 1; j++) reglas[j] = reglas[j + 1];
        nReglas--;
        guardarConfig();
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------
//  Sensores
// ---------------------------------------------------------------------
// PIR: se revisa en cada vuelta. La interrupcion atrapa el flanco aunque el pulso sea corto.
// 'presenciaDesde' marca el inicio de una deteccion continua; se reinicia tras PIR_LIBRE_MS sin senal.
void leerPresencia() {
  static uint32_t ultimoAlto = 0;
  uint32_t ahora = millis();
  bool alto = digitalRead(PIN_PIR) == HIGH;
  if (flancoPir) { flancoPir = false; alto = true; }
  if (alto) ultimoAlto = ahora;

  xSemaphoreTake(mutex, portMAX_DELAY);
  if (alto && !lect.presenciaDesde) lect.presenciaDesde = ahora ? ahora : 1;
  if (!alto && lect.presenciaDesde && ahora - ultimoAlto > PIR_LIBRE_MS) lect.presenciaDesde = 0;
  lect.presencia = lect.presenciaDesde != 0;
  xSemaphoreGive(mutex);
}

// Sensor de suelo: cada SUELO_CADA_MS se mide. Si tiene PIN_SUELO_VCC, se enciende,
// espera un momento, mide y se apaga.
void leerSuelo() {
  static uint32_t ultimoSuelo = 0, encendidoDesde = 0;
  static bool encendido = false;
  uint32_t ahora = millis();
  if (!encendido && ahora - ultimoSuelo >= SUELO_CADA_MS) {
#if PIN_SUELO_VCC >= 0
    digitalWrite(PIN_SUELO_VCC, HIGH);
#endif
    encendido = true;
    encendidoDesde = ahora;
  } else if (encendido && ahora - encendidoDesde >= SUELO_ESPERA_MS) {
    int crudo = leerAnalogPromedio(PIN_SUELO);
#if PIN_SUELO_VCC >= 0
    digitalWrite(PIN_SUELO_VCC, LOW);
#endif
    encendido = false;
    ultimoSuelo = ahora;
#if DEPURAR_SENSORES
    Serial.printf("Crudo suelo: %d | crudo LDR: %d\n", crudo, leerAnalogPromedio(PIN_LDR));
#endif
    xSemaphoreTake(mutex, portMAX_DELAY);
    lect.suelo = constrain(map(crudo, SUELO_SECO, SUELO_MOJADO, 0, 100), 0, 100);
    xSemaphoreGive(mutex);
  }
}

void leerSensores() {
  static uint32_t ultimaLectura = 0, ultimoDht = 0;
  static int fallosDht = 0;
  leerPresencia();
  leerSuelo();
  uint32_t ahora = millis();
  if (ahora - ultimaLectura < 500) return;
  ultimaLectura = ahora;

  // El DHT22 solo se puede leer cada 2 s (y tarda ~5 ms, fuera del mutex)
  float t = NAN, h = NAN;
  bool leyoDht = false;
  if (ahora - ultimoDht >= 2000) {
    ultimoDht = ahora;
    t = dht.readTemperature();
    h = dht.readHumidity();
    leyoDht = true;
  }
  int crudoLuz = leerAnalogPromedio(PIN_LDR);
  struct tm ti;
  int horaMin = getLocalTime(&ti, 0) ? ti.tm_hour * 100 + ti.tm_min : -1;

  xSemaphoreTake(mutex, portMAX_DELAY);
  if (leyoDht) {
    if (!isnan(t) && !isnan(h)) { lect.temp = t; lect.humAire = h; fallosDht = 0; }
    else if (++fallosDht >= 5) { lect.temp = NAN; lect.humAire = NAN; }
  }
  if (!LDR_SUBE_CON_LUZ) crudoLuz = 4095 - crudoLuz;
  lect.luz = constrain(map(crudoLuz, 0, LDR_MAX, 0, 100), 0, 100);
  lect.horaMin = horaMin;
  xSemaphoreGive(mutex);
}

// ---------------------------------------------------------------------
//  Automatizacion (modo automatico). Se llama con el mutex tomado.
// ---------------------------------------------------------------------
float valorSensor(const char* s, bool& valido) {
  valido = true;
  if (!strcmp(s, "t")) { valido = !isnan(lect.temp); return lect.temp; }
  if (!strcmp(s, "h")) { valido = !isnan(lect.humAire); return lect.humAire; }
  if (!strcmp(s, "s")) return lect.suelo;
  if (!strcmp(s, "l")) return lect.luz;
  if (!strcmp(s, "p")) return lect.presencia ? 1 : 0;
  if (!strcmp(s, "hm")) { valido = lect.horaMin >= 0; return lect.horaMin; }
  valido = false;
  return 0;
}

void automatizar() {
  uint32_t ahora = millis();

  // 1. Foco interior: no se automatiza, solo lo cambia la pagina.

  // 2. Foco exterior: se enciende sin luz y se apaga cuando vuelve la luz
  if (lect.luz < umb.ln) luzExtAuto = 1;
  else if (lect.luz > umb.ln + HIST_LUZ) luzExtAuto = 0;
  salida[LUZ_EXT] = luzExtAuto;

  // 3. Ventilador: se enciende cuando sube la temperatura y se apaga cuando baja
  if (!isnan(lect.temp)) {
    if (lect.temp >= umb.tmax) ventAuto = 1;
    else if (lect.temp < umb.tmax - HIST_TEMP) ventAuto = 0;
  } else {
    ventAuto = 0;
  }
  salida[VENT] = ventAuto;

  // 4. Riego: con la tierra seca riega por ciclos hasta que esta humeda
  if (riegoAuto) {
    if (lect.suelo >= umb.smin + HIST_SUELO || ahora - inicioRiego > RIEGO_MAX_SEG * 1000UL) {
      riegoAuto = 0;
      finRiego = ahora;
    }
  } else if (lect.suelo < umb.smin && ahora - finRiego > RIEGO_PAUSA_SEG * 1000UL) {
    riegoAuto = 1;
    inicioRiego = ahora;
  }
  salida[BOMBA] = riegoAuto;

  // 5. Alarma: una persona detectada 'ta' segundos seguidos
  if (!lect.presencia) {
    if (alarmaActiva) Serial.println("Alarma apagada: ya no se detecta a nadie");
    alarmaActiva = false;
    alarmaSilenciada = false;   // se rearma para la siguiente deteccion
  } else if (!alarmaActiva && !alarmaSilenciada && ahora - lect.presenciaDesde >= (uint32_t)umb.ta * 1000UL) {
    alarmaActiva = true;
    numAlarmas++;
    Serial.printf("ALERTA: persona detectada por mas de %d s\n", umb.ta);
  }
  salida[ALARMA] = alarmaActiva ? 1 : 0;

  // 6. Reglas personalizadas: se aplican despues y tienen prioridad
  for (int i = 0; i < nReglas; i++) {
    bool valido;
    float v = valorSensor(reglas[i].sensor, valido);
    if (!valido) continue;
    bool cumple = (reglas[i].op == '<' && v < reglas[i].x) ||
                  (reglas[i].op == '>' && v > reglas[i].x) ||
                  (reglas[i].op == '=' && fabsf(v - reglas[i].x) < 0.5f);
    if (cumple) salida[reglas[i].disp] = reglas[i].valor;
  }
}

// Limites que se aplican siempre, en modo automatico y manual
void aplicarSeguridad() {
  uint32_t ahora = millis();
  if (ahora < bombaBloqueadaHasta) salida[BOMBA] = 0;
  if (salida[BOMBA] && bombaEncendidaDesde && ahora - bombaEncendidaDesde > BOMBA_MANUAL_MAX_S * 1000UL) {
    salida[BOMBA] = 0;
    riegoAuto = 0;
    bombaBloqueadaHasta = ahora + RIEGO_PAUSA_SEG * 1000UL;
    Serial.println("Seguridad: bomba apagada por tiempo maximo");
  }
}

// ---------------------------------------------------------------------
//  Actuadores
// ---------------------------------------------------------------------
void aplicarSalidas() {
  uint32_t ahora = millis();
  escribirRele(PIN_RELE_LUZ_INT, salida[LUZ_INT]);
  escribirRele(PIN_RELE_LUZ_EXT, salida[LUZ_EXT]);
  escribirTransistor(PIN_VENT, salida[VENT]);

  if (salida[BOMBA] && !bombaEncendidaDesde) bombaEncendidaDesde = ahora;
  if (!salida[BOMBA]) bombaEncendidaDesde = 0;
  escribirTransistor(PIN_BOMBA, salida[BOMBA]);

  // Alarma intermitente: 400 ms sonando, 400 ms en silencio
  digitalWrite(PIN_BUZZER, salida[ALARMA] && (ahora / 400) % 2 == 0 ? HIGH : LOW);
}

// ---------------------------------------------------------------------
//  Serializacion del estado y la configuracion (llamar con el mutex tomado)
//  Las claves son cortas para que quepan en un paquete Bluetooth.
// ---------------------------------------------------------------------
size_t estadoJson(char* out, size_t tam) {
  JsonDocument d;
  if (isnan(lect.temp)) d["t"] = nullptr; else d["t"] = serialized(String(lect.temp, 1));
  if (isnan(lect.humAire)) d["h"] = nullptr; else d["h"] = (int)lroundf(lect.humAire);
  d["s"] = lect.suelo;
  d["l"] = lect.luz;
  d["p"] = lect.presencia ? 1 : 0;
  d["hm"] = lect.horaMin;
  d["m"] = modoAuto ? "A" : "M";
  for (int i = 0; i < N_DISP; i++) d[CLAVE_DISP[i]] = salida[i];
  d["as"] = alarmaSilenciada ? 1 : 0;   // alarma silenciada mientras la persona sigue ahi
  d["na"] = numAlarmas;                 // contador de alarmas: la pagina avisa cuando sube
  return serializeJson(d, out, tam);
}

size_t configJson(char* out, size_t tam) {
  JsonDocument d;
  JsonObject u = d["u"].to<JsonObject>();
  u["tmax"] = serialized(String(umb.tmax, 1));
  u["smin"] = umb.smin;
  u["ln"] = umb.ln;
  u["ta"] = umb.ta;
  reglasAJson(d["r"].to<JsonArray>());
  return serializeJson(d, out, tam);
}

// ---------------------------------------------------------------------
//  Bluetooth (BLE con NimBLE)
// ---------------------------------------------------------------------
class CallbacksServidor : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    conexionesBle++;
    Serial.println("Bluetooth: dispositivo conectado");
    NimBLEDevice::startAdvertising();   // permite conectar un segundo dispositivo
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int razon) override {
    if (conexionesBle > 0) conexionesBle--;
    Serial.println("Bluetooth: dispositivo desconectado");
    NimBLEDevice::startAdvertising();
  }
};

class CallbacksComando : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    NimBLEAttValue v = c->getValue();
    encolarComando((const char*)v.data(), v.length());
  }
};

void iniciarBLE() {
  NimBLEDevice::init(NOMBRE_BLE);
  NimBLEDevice::setMTU(247);   // paquetes grandes para el JSON de estado
  NimBLEServer* servidor = NimBLEDevice::createServer();
  servidor->setCallbacks(new CallbacksServidor());

  NimBLEService* servicio = servidor->createService(UUID_SERVICIO);
  chEstado = servicio->createCharacteristic(UUID_ESTADO, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  chConfig = servicio->createCharacteristic(UUID_CONFIG, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* chComando =
      servicio->createCharacteristic(UUID_COMANDO, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  chComando->setCallbacks(new CallbacksComando());
  // En NimBLE 2.x los servicios arrancan solos al iniciar el servidor

  NimBLEAdvertising* anuncio = NimBLEDevice::getAdvertising();
  anuncio->setName(NOMBRE_BLE);
  anuncio->addServiceUUID(UUID_SERVICIO);
  anuncio->enableScanResponse(true);
  anuncio->start();
  Serial.println("Bluetooth listo: " NOMBRE_BLE);
}

// ---------------------------------------------------------------------
//  WiFi + MQTT (tarea en el nucleo 0)
// ---------------------------------------------------------------------
void alRecibirMqtt(char* topico, byte* datos, unsigned int len) {
  encolarComando((const char*)datos, len);
}

void conectarMqtt() {
  // ID fijo: al reconectar, el broker cierra la sesion vieja en ese momento y su
  // ultimo deseo ("0") sale antes del "1" nuevo. Con un ID al azar, el "0" de la
  // sesion vieja llegaba ~45 s despues y dejaba la casa como desconectada.
  const char* id = "esp32-" ID_CASA;
  Serial.print("MQTT: conectando... ");
  if (mqtt.connect(id, MQTT_USUARIO, MQTT_CLAVE, TOPICO("online"), 0, true, "0")) {
    Serial.println("OK");
    mqtt.publish(TOPICO("online"), "1", true);
    mqtt.subscribe(TOPICO("cmd"));
    configCambiada = true;   // re-publicar la configuracion
  } else {
    Serial.printf("fallo (estado %d)\n", mqtt.state());
  }
}

void publicar(const char* topico, NimBLECharacteristic* ch, const char* json, size_t len, bool retener) {
  if (mqtt.connected()) mqtt.publish(topico, (const uint8_t*)json, len, retener);
  if (ch) {
    ch->setValue((const uint8_t*)json, len);
    if (conexionesBle > 0) ch->notify();
  }
}

void tareaComunicaciones(void*) {
  static char buf[600];
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTzTime(ZONA_HORARIA, SERVIDOR_NTP);
  // Para la demo se omite la verificacion del certificado del broker.
  // Para mas seguridad: clienteTLS.setCACert(<certificado raiz ISRG Root X1>);
  clienteTLS.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(alRecibirMqtt);
  mqtt.setBufferSize(768);
  mqtt.setKeepAlive(30);

  uint32_t ultimoWifi = 0, ultimoMqtt = 0, ultimoEstado = 0, ultimoOnline = 0;
  bool wifiAvisado = false;
  for (;;) {
    uint32_t ahora = millis();
    if (WiFi.status() != WL_CONNECTED) {
      wifiAvisado = false;
      if (ahora - ultimoWifi > 15000) {
        ultimoWifi = ahora;
        Serial.println("WiFi: reintentando conexion...");
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
    } else {
      if (!wifiAvisado) {
        wifiAvisado = true;
        Serial.printf("WiFi conectado, IP %s\n", WiFi.localIP().toString().c_str());
      }
      if (!mqtt.connected()) {
        if (ahora - ultimoMqtt > 5000) { ultimoMqtt = ahora; conectarMqtt(); }
      } else {
        mqtt.loop();
        // Repite "en linea" cada minuto por si un ultimo deseo atrasado lo cambio a "0"
        if (ahora - ultimoOnline >= 60000) {
          ultimoOnline = ahora;
          mqtt.publish(TOPICO("online"), "1", true);
        }
      }
    }

    if (ahora - ultimoEstado >= PERIODO_ESTADO_MS) {
      ultimoEstado = ahora;
      xSemaphoreTake(mutex, portMAX_DELAY);
      size_t n = estadoJson(buf, sizeof(buf));
      xSemaphoreGive(mutex);
      publicar(TOPICO("estado"), chEstado, buf, n, false);
    }
    if (configCambiada.exchange(false)) {
      xSemaphoreTake(mutex, portMAX_DELAY);
      size_t n = configJson(buf, sizeof(buf));
      xSemaphoreGive(mutex);
      publicar(TOPICO("config"), chConfig, buf, n, true);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

// ---------------------------------------------------------------------
//  Programa principal (nucleo 1)
// ---------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Casa inteligente - iniciando ===");

  // Primero el nivel de apagado y despues OUTPUT, para que nada se encienda al arrancar
  const int reles[] = {PIN_RELE_LUZ_INT, PIN_RELE_LUZ_EXT};
  for (int p : reles) { escribirRele(p, false); pinMode(p, OUTPUT); escribirRele(p, false); }
  const int transistores[] = {PIN_VENT, PIN_BOMBA, PIN_BUZZER};
  for (int p : transistores) { digitalWrite(p, LOW); pinMode(p, OUTPUT); digitalWrite(p, LOW); }
#if PIN_SUELO_VCC >= 0
  pinMode(PIN_SUELO_VCC, OUTPUT);
  digitalWrite(PIN_SUELO_VCC, LOW);
#endif
  pinMode(PIN_PIR, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_PIR), isrPir, RISING);
  dht.begin();

  mutex = xSemaphoreCreateMutex();
  colaComandos = xQueueCreate(10, TAM_CMD);
  cargarConfig();
  iniciarBLE();

  // Comunicaciones en el nucleo 0; el loop() de Arduino corre en el nucleo 1
  xTaskCreatePinnedToCore(tareaComunicaciones, "comunicaciones", 16384, nullptr, 1, nullptr, 0);
}

void loop() {
  leerSensores();

  char cmd[TAM_CMD];
  xSemaphoreTake(mutex, portMAX_DELAY);
  while (xQueueReceive(colaComandos, cmd, 0) == pdTRUE) ejecutarComando(cmd);
  if (modoAuto) automatizar();
  aplicarSeguridad();
  aplicarSalidas();
  xSemaphoreGive(mutex);
}
