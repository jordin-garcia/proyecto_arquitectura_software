# 5. Protocolo

WiFi (MQTT) y Bluetooth (BLE) transportan **exactamente las mismas cadenas JSON**, en UTF-8 y sin terminador. Los nombres son cortos para que el estado quepa en un paquete BLE (MTU 247).

## 5.1 Canales

### MQTT (HiveMQ Cloud)
| Tópico | Sentido | Retenido | Contenido |
|---|---|---|---|
| `casa/<ID_CASA>/estado` | ESP32 → página | No | Estado, cada 1 s |
| `casa/<ID_CASA>/config` | ESP32 → página | **Sí** | Umbrales y reglas, al cambiar y al reconectar |
| `casa/<ID_CASA>/online` | ESP32 → página | **Sí** | `"1"` al conectar; `"0"` como último deseo (LWT) |
| `casa/<ID_CASA>/cmd` | página → ESP32 | No | Un comando por mensaje |

- `ID_CASA` es `casa01` por defecto.
- El ESP32 usa TLS en el puerto 8883.
- La página usa `wss://<host>:8884/mqtt` con mqtt.js 5.10.1.
- Todo se publica con QoS 0.
- Hay dos usuarios en HiveMQ: `esp32-casa` y `web-casa`.

### Bluetooth LE (GATT)
| Característica | UUID | Propiedades |
|---|---|---|
| Servicio | `6f1a0001-3c2b-4f5e-9a8d-1b2c3d4e5f60` | — |
| Estado | `6f1a0002-3c2b-4f5e-9a8d-1b2c3d4e5f60` | READ, NOTIFY (cada 1 s) |
| Comando | `6f1a0003-3c2b-4f5e-9a8d-1b2c3d4e5f60` | WRITE, WRITE_NR |
| Configuración | `6f1a0004-3c2b-4f5e-9a8d-1b2c3d4e5f60` | READ, NOTIFY |

- Nombre del dispositivo: `CasaIA`.
- La página filtra por el UUID del servicio, activa las notificaciones y lee la configuración una vez.
- Las escrituras van de una en una, con una cola de promesas.

### Prioridad de envío en la página
1. Simulador (`?demo=1`).
2. Bluetooth.
3. MQTT.
4. Error "La casa no está conectada. Conéctala por WiFi o Bluetooth."

## 5.2 Estado

```json
{"t":24.5,"h":60,"s":45,"l":70,"p":1,"hm":2215,"m":"A","li":1,"le":0,"f":0,"b":0,"al":1,"as":0,"na":3}
```

| Clave | Tipo | Rango | Significado |
|---|---|---|---|
| `t` | número o `null` | °C, 1 decimal | Temperatura (`null` = sin lectura) |
| `h` | entero o `null` | 0–100 | Humedad del aire, % |
| `s` | entero | 0–100 | Humedad del suelo, % |
| `l` | entero | 0–100 | Luz de afuera, % (0 oscuro) |
| `p` | 0 o 1 | — | El PIR detecta a alguien (con 1.5 s de margen) |
| `hm` | entero | −1 o HHMM | Hora local; −1 si no hay hora de internet |
| `m` | `"A"` o `"M"` | — | Modo automático o manual |
| `li` | 0 o 1 | — | Foco interior |
| `le` | 0 o 1 | — | Foco exterior |
| `f` | 0 o 1 | — | Ventilador |
| `b` | 0 o 1 | — | Bomba del riego |
| `al` | 0 o 1 | — | Alarma sonando |
| `as` | 0 o 1 | — | Alarma silenciada mientras la persona sigue presente |
| `na` | entero | ≥ 0 | Número de alarmas desde que arrancó el ESP32. **Cuando sube, la página avisa.** |

Los valores de los dispositivos son los que el ESP32 está aplicando (después de la seguridad).

## 5.3 Configuración

```json
{"u":{"tmax":28.0,"smin":35,"ln":25,"ta":5},
 "r":[{"i":"r1","s":"hm","o":">","x":2200.0,"d":"le","v":0}]}
```

### Umbrales (`u`)
| Clave | Nombre en la interfaz | Nombre para Aurora | Unidad | Rango | Paso | Por defecto |
|---|---|---|---|---|---|---|
| `tmax` | Temperatura para encender el ventilador | `temp_max` | °C | 20–35 | 0.5 | 28 |
| `smin` | Humedad mínima del suelo (riega abajo de esto) | `humedad_suelo_min` | % | 10–80 | 1 | 35 |
| `ln` | Luz para encender el foco exterior | `luz_noche` | % | 5–60 | 1 | 25 |
| `ta` | Segundos de presencia para sonar la alarma | `tiempo_alarma` | s | 2–30 | 1 | 5 |

### Reglas (`r`, máximo 6)
| Clave | Tipo | Valores |
|---|---|---|
| `i` | texto de 1 a 5 caracteres | Identificador; la página usa `r1`…`r99` |
| `s` | texto | Sensor: `t`, `h`, `s`, `l`, `p`, `hm` |
| `o` | texto | `<`, `>` o `=` (\|v − x\| < 0.5) |
| `x` | número | Umbral; para `hm` en formato HHMM; para `p`, 0 o 1 |
| `d` | texto | `le`, `f` o `b` (**nunca** `li` ni `al`) |
| `v` | entero | 0 o 1 |

Las reglas se evalúan solo en modo automático, después de la automatización normal, y tienen prioridad mientras su condición se cumple.

## 5.4 Comandos (página → ESP32)

| Comando | Ejemplo | Efecto | Se ignora si… |
|---|---|---|---|
| Modo | `{"c":"modo","v":"M"}` | `A` automático, `M` manual | `v` no es `A` ni `M` |
| Encender o apagar | `{"c":"set","d":"li","v":1}` | Cambia el valor deseado | Dispositivo desconocido o `v` no numérico; `d` distinto de `li` en modo automático (excepto `al` con `v = 0`); bomba en pausa de seguridad |
| Desactivar alarma | `{"c":"alarma","v":0}` | Apaga el buzzer; si la persona sigue, `as = 1` hasta que se vaya | — |
| Umbral | `{"c":"cfg","k":"ta","v":8}` | Cambia, guarda y vuelve a publicar la configuración | Clave desconocida o fuera de rango |
| Crear o reemplazar regla | `{"c":"regla+","r":{"i":"r1","s":"hm","o":">","x":2200,"d":"le","v":0}}` | Agrega o reemplaza la regla y la guarda | Regla inválida o ya hay 6 |
| Borrar regla | `{"c":"regla-","i":"r1"}` | La elimina | El `i` no existe |
| Simular persona | `{"c":"demo-persona"}` | Presencia durante 12 s | **Solo existe en el simulador** |

- **No hay respuesta de error.** La página confirma esperando hasta 3.5 s a que cambie el estado o la configuración.
- Los comandos de más de 255 bytes se descartan.

## 5.5 Secuencias típicas

### Encender el foco interior en modo automático
```
página → {"c":"set","d":"li","v":1}     espera estado.li == 1
```

### Alarma
```
t=0      el PIR pasa a ALTO; p=1
t=5 s    al=1, na=na+1           → la página muestra el aviso
página → {"c":"alarma","v":0}    → al=0, as=1 (la persona sigue ahí)
...      la persona se va: 1.5 s sin señal → p=0, as=0 (alarma rearmada)
```

### Aurora enciende el ventilador estando en automático
```
página → {"c":"modo","v":"M"}          espera estado.m == "M"
página → {"c":"set","d":"f","v":1}     espera estado.f == 1
```
