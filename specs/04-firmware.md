# 4. Firmware del ESP32

Archivos:
- `firmware/casa_inteligente/casa_inteligente.ino`
- `firmware/casa_inteligente/config.h`
- `firmware/casa_inteligente/secrets.h` (se crea a partir de `secrets.h.example`)

## 4.1 Entorno

| Elemento | Valor |
|---|---|
| Placa | ESP32 Dev Module (`esp32:esp32:esp32`) |
| Núcleo | esp32 de Espressif 3.x (probado con 3.3.12) |
| Partición | **Huge APP (3MB No OTA/1MB SPIFFS)**, obligatoria por WiFi + BLE |
| Bibliotecas | PubSubClient 2.8 · ArduinoJson 7.x · DHT sensor library 1.4.x + Adafruit Unified Sensor · NimBLE-Arduino 2.x |
| Monitor serie | 115200 baudios |

`secrets.h` define `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_PORT` (8883), `MQTT_USUARIO` y `MQTT_CLAVE`. Nunca se sube al repositorio.

## 4.2 Tareas y concurrencia

| Contexto | Núcleo | Qué hace | Período |
|---|---|---|---|
| `loop()` (tarea de Arduino) | 1 | Sensores → comandos → automatización → seguridad → salidas | Continuo, sin bloqueos |
| `tareaComunicaciones` | 0 | WiFi, MQTT, publicar estado y configuración | Ciclo cada 20 ms; pila de 16384 bytes; prioridad 1 |
| Tarea de NimBLE | Sistema | Pila Bluetooth; `onWrite` encola comandos | Por evento |
| `isrPir` (interrupción) | — | Flanco de subida del PIR: marca `flancoPir` | Por evento, en IRAM |

**Sincronización:**
- `mutex`: protege `lect`, `umb`, `reglas`, `nReglas`, `modoAuto`, `salida[]` y las variables de la alarma.
- `colaComandos`: cola de FreeRTOS de **10 × 256 bytes**. Los callbacks de MQTT y BLE solo copian el texto.
- `configCambiada`: variable atómica que pide volver a publicar la configuración.
- `conexionesBle`: variable atómica que cuenta los clientes BLE.

**Ciclo del `loop()`:**
```
leerSensores()        // leerPresencia() y leerSuelo() toman el mutex brevemente
tomar mutex
  vaciar la cola → ejecutarComando()
  si modoAuto → automatizar()
  aplicarSeguridad()  // siempre
  aplicarSalidas()    // relés y buzzer
soltar mutex
```

Nunca se usa `delay()` en el núcleo 1; todo se temporiza con `millis()`.

## 4.3 Modelo de datos

```cpp
enum Disp { LUZ_INT, LUZ_EXT, VENT, BOMBA, ALARMA, N_DISP };
CLAVE_DISP = {"li", "le", "f", "b", "al"};
SENSORES_VALIDOS = {"t", "h", "s", "l", "p", "hm"};

struct Lecturas { float temp, humAire; int suelo, luz; bool presencia; uint32_t presenciaDesde; int horaMin; };
struct Umbrales { float tmax; int smin, ln, ta; };
struct Regla    { char id[6]; char sensor[3]; char op; float x; uint8_t disp; int valor; };
```

`salida[N_DISP]` guarda el valor deseado de cada actuador: siempre 0 o 1.

## 4.4 Sensores

| Sensor | Función | Frecuencia | Procesamiento |
|---|---|---|---|
| PIR | `leerPresencia()` + `isrPir` | Cada vuelta del loop | La señal cuenta como "alto" si el pin está en ALTO o si la interrupción marcó un flanco. `presenciaDesde` guarda el inicio de la detección **continua** y vuelve a 0 tras `PIR_LIBRE_MS` (1.5 s) sin señal. `presencia = presenciaDesde ≠ 0`. |
| Suelo | `leerSuelo()` | Cada `SUELO_CADA_MS` (3 s) | Enciende `PIN_SUELO_VCC`, espera 30 ms sin bloquear, promedia 8 lecturas, apaga. Mapea de `SUELO_SECO`..`SUELO_MOJADO` a 0..100 %. |
| DHT22 | `leerSensores()` | Cada 2 s, fuera del mutex | Tras **5 fallos seguidos**, la temperatura y la humedad quedan en `NAN` ("sin lectura") |
| LDR | `leerSensores()` | Cada 500 ms | Promedio de 8 lecturas, de 0..4095 a 0..100 %. Más luz = número mayor. |
| Hora | `leerSensores()` | Cada 500 ms | NTP (`pool.ntp.org`, zona `CST6`) → `horaMin` HHMM, o −1 si no hay hora |

`DEPURAR_SENSORES 1` imprime cada 3 s los valores crudos del suelo y del LDR.

## 4.5 Automatización (solo en modo automático)

`automatizar()` corre con el mutex tomado:

| Orden | Dispositivo | Regla |
|---|---|---|
| 1 | Foco interior | **No se toca.** Solo cambia por el comando `set` de la página. |
| 2 | Foco exterior | Enciende si `luz < ln`; apaga si `luz > ln + HIST_LUZ` (10); en medio conserva su valor |
| 3 | Ventilador | Enciende si `temp ≥ tmax`; apaga si `temp < tmax − HIST_TEMP` (0.5). Sin lectura → apagado. |
| 4 | Riego | Ciclos: empieza si `suelo < smin` y pasaron `RIEGO_PAUSA_SEG` (60 s) desde el último ciclo; termina si `suelo ≥ smin + HIST_SUELO` (10) o pasan `RIEGO_MAX_SEG` (15 s) |
| 5 | Alarma | Ver 4.6 |
| 6 | Reglas | Se evalúan en orden y **sobrescriben** lo anterior mientras su condición se cumpla. Si el sensor no tiene lectura válida, la regla se omite. |

**Condición de una regla:** `valor(sensor) <op> x`, donde `=` significa `|v − x| < 0.5`.

En **modo manual** no se ejecuta `automatizar()`: `salida[]` solo cambia por comandos (`set`, `alarma`) y por la seguridad de la bomba.

## 4.6 Alarma por presencia

Variables: `alarmaActiva`, `alarmaSilenciada` y `numAlarmas` (contador desde el arranque).

| Situación | Acción |
|---|---|
| No hay presencia | `alarmaActiva = false` y `alarmaSilenciada = false` (se rearma). Si estaba sonando, imprime "Alarma apagada: ya no se detecta a nadie". |
| Presencia continua ≥ `ta` s, alarma inactiva y no silenciada | `alarmaActiva = true`, `numAlarmas++`, imprime "ALERTA: persona detectada por mas de N s" |
| Comando `{"c":"alarma","v":0}` o `set al 0` (cualquier modo) | `silenciarAlarma()`: `alarmaActiva = false`, `salida[ALARMA] = 0` y `alarmaSilenciada = presencia`, es decir, no vuelve a sonar hasta que la persona se vaya |

- `salida[ALARMA] = alarmaActiva`.
- El buzzer suena de forma intermitente: 400 ms sí, 400 ms no.
- La alarma automática solo funciona en **modo automático**. En manual, `set al 1` la enciende para probarla.

## 4.7 Seguridad (en los dos modos)

`aplicarSeguridad()` solo protege la bomba:
- Si `salida[BOMBA]` lleva más de `BOMBA_MANUAL_MAX_S` (60 s) seguidos, se apaga, se cancela el ciclo automático y queda bloqueada `RIEGO_PAUSA_SEG` (60 s).
- Durante el bloqueo se rechaza `set b 1`.

## 4.8 Actuadores

| Actuador | Detalle |
|---|---|
| Relés 1 a 4 | Nivel = encendido XOR `RELE_ACTIVO_BAJO`. Al arrancar se escribe el nivel de apagado **antes** de `pinMode(OUTPUT)`. |
| Buzzer | `PIN_BUZZER` en ALTO activa el 2N2222. Patrón `(millis()/400) % 2`. |

## 4.9 Persistencia

Se usa NVS (`Preferences`) con el espacio de nombres **`casa`**:

| Clave | Tipo | Contenido |
|---|---|---|
| `tmax` | float | Temperatura para el ventilador |
| `smin`, `ln`, `ta` | int | Suelo mínimo, luz para el foco exterior, segundos para la alarma |
| `reglas` | String | Arreglo JSON de reglas |

- Si una clave no existe, se usan los valores `DEF_*`.
- `cargarConfig()` valida cada regla guardada.

El diseño anterior guardaba también `ld` y `ps`, que ya no se usan. Si quedaron en la flash de la placa, el firmware las ignora.

## 4.10 Validación de comandos

| Función | Valida |
|---|---|
| `aplicarUmbral(k, v)` | Trabaja sobre una copia: `20 ≤ tmax ≤ 35`; `10 ≤ smin ≤ 80`; `5 ≤ ln ≤ 60`; `2 ≤ ta ≤ 30` |
| `reglaDesdeJson(r, out)` | `id` de 1 a 5 caracteres; sensor válido; operador `<`, `>` o `=`; dispositivo `le`, `f` o `b` (**no** `li` ni `al`); `x` y `v` numéricos |
| `limitarValor(v)` | 0 o 1 |
| `ejecutarComando()` | `set li` en cualquier modo; `set al 0` en cualquier modo (silencia); los demás `set` solo en manual. Bomba bloqueada → rechazo. Máximo 6 reglas. |

## 4.11 Comunicaciones

### WiFi
Modo estación. Si se desconecta, reintenta cada 15 s. Al arrancar llama a `configTzTime("CST6", "pool.ntp.org")`.

### MQTT
| Parámetro | Valor |
|---|---|
| Cliente | `WiFiClientSecure` con `setInsecure()` (solo para la demo) |
| Servidor | `MQTT_HOST:8883` |
| ID de cliente | `esp32-casa01-<aleatorio>` |
| Último deseo (LWT) | `casa/casa01/online = "0"`, retenido |
| Al conectar | Publica `online = "1"`, se suscribe a `cmd` y vuelve a publicar la configuración |
| Reintento | Cada 5 s |
| Búfer | 768 bytes · keep-alive de 30 s |
| Estado | Cada 1 s, sin retener |
| Configuración | Al cambiar, retenida |

### Bluetooth (NimBLE)
| Parámetro | Valor |
|---|---|
| Nombre | `CasaIA` |
| MTU | 247 |
| Servicio | `6f1a0001-…` |
| Estado | `…0002`, READ \| NOTIFY |
| Comando | `…0003`, WRITE \| WRITE_NR |
| Configuración | `…0004`, READ \| NOTIFY |
| Anuncio | Se reinicia al conectar y al desconectar |

## 4.12 Arranque

1. Abre el monitor serie.
2. Configura los relés en apagado, el buzzer en BAJO y el sensor de suelo apagado.
3. Configura el PIR con su interrupción (`RISING`) e inicia el DHT22.
4. Crea el mutex y la cola, y carga la configuración.
5. Inicia BLE.
6. Crea `tareaComunicaciones` en el núcleo 0.

La casa arranca en **automático**, con todo apagado.

## 4.13 Constantes de `config.h`

| Constante | Valor | Uso |
|---|---|---|
| `PIN_PIR`, `PIN_DHT`, `PIN_SUELO`, `PIN_SUELO_VCC`, `PIN_LDR` | 27, 4, 34, 32, 35 | Sensores |
| `PIN_RELE_LUZ_INT`, `PIN_RELE_VENT`, `PIN_RELE_BOMBA`, `PIN_RELE_LUZ_EXT` | 26, 25, 33, 23 | Relés 1 a 4 |
| `PIN_BUZZER` | 18 | Alarma |
| `RELE_ACTIVO_BAJO` | true | Polaridad de los relés |
| `DEPURAR_SENSORES` | 0 | Calibración |
| `SUELO_SECO`, `SUELO_MOJADO` | 4000, 1500 | **Calibrar con el sensor real** |
| `SUELO_CADA_MS`, `SUELO_ESPERA_MS` | 3000, 30 | Medición del suelo |
| `DEF_TEMP_MAX`, `DEF_SUELO_MIN`, `DEF_LUZ_NOCHE`, `DEF_ALARMA_SEG` | 28.0, 35, 25, 5 | Umbrales por defecto |
| `HIST_TEMP`, `HIST_LUZ`, `HIST_SUELO` | 0.5, 10, 10 | Histéresis |
| `PIR_LIBRE_MS` | 1500 | Tiempo sin señal para "ya no hay nadie" |
| `RIEGO_MAX_SEG`, `RIEGO_PAUSA_SEG`, `BOMBA_MANUAL_MAX_S` | 15, 60, 60 | Riego |
| `MAX_REGLAS` | 6 | Reglas |
| `ID_CASA`, `NOMBRE_BLE`, `ZONA_HORARIA`, `SERVIDOR_NTP`, `PERIODO_ESTADO_MS` | "casa01", "CasaIA", "CST6", "pool.ntp.org", 1000 | Comunicaciones |

## 4.14 Conceptos del curso que muestra

- Doble núcleo y afinidad de tareas (`xTaskCreatePinnedToCore`).
- FreeRTOS: cola, mutex y variables atómicas.
- Interrupción del PIR con rutina en IRAM (`IRAM_ATTR`), combinada con lectura periódica.
- Temporizadores sin bloqueo (`millis()`) para contar los 5 s de presencia.
- Histéresis como técnica de control.
- ADC de 12 bits y la limitación de ADC2 con WiFi.
- GPIO como fuente de energía controlada (sensor de suelo) y para manejar un transistor (buzzer).
- Memoria flash (NVS), esquema de particiones y RAM limitada (claves JSON cortas).
- Pilas de comunicación BLE GATT, TLS y MQTT.
