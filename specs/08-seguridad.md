# 8. Seguridad

## 8.1 Activos

| Activo | Por qué importa |
|---|---|
| Clave de la API de Claude | Cuesta dinero; si se filtra, otros la usan |
| Credenciales de EMQX | Permiten mandar comandos a la casa |
| Código de acceso del Worker | Protege el uso de la IA |
| Integridad física de la maqueta | Agua, motores, fuente de 12 V |

## 8.2 Amenazas y controles

| Amenaza | Control | Dónde |
|---|---|---|
| Robo de la clave de la API | Solo vive como secreto en Cloudflare; nunca en la página, el ESP32 ni el repositorio | `servidor/`, `.gitignore` |
| Uso del Worker por terceros | Código de acceso en `X-Codigo-Acceso`; CORS y verificación de `Origin` con `ORIGEN_PERMITIDO` limitado a la página publicada, GitHub Pages y la prueba local | `src/index.js` |
| Peticiones enormes o malformadas al Worker | Límite de 400 000 caracteres y 120 mensajes; roles válidos; el primero debe ser `user` | `src/index.js` |
| Credenciales en el repositorio | `secrets.h`, `.dev.vars`, `node_modules`, `.wrangler` y `dist` en `.gitignore`; los ajustes de la página solo en `localStorage` | `.gitignore`, `app.js` |
| La IA pide algo fuera de rango | Tres capas: esquema `strict` → validación en la página (`modelo.js`) → validación en el ESP32 (`aplicarUmbral`, `reglaDesdeJson`, `limitarValor`) | [04](04-firmware.md), [07](07-asistente-mia.md) |
| La IA o un usuario usan mal los dispositivos especiales | El foco interior y la alarma no se pueden usar en reglas; la alarma solo la enciende el PIR en automático; la bomba tiene límites de tiempo en `aplicarSeguridad()`, que se aplica después de cualquier orden | Firmware |
| Instrucciones maliciosas dentro de la conversación | MIA solo dispone de 7 herramientas acotadas; el ESP32 valida; no hay herramientas de red ni de archivos | [07](07-asistente-mia.md) |
| Falsas alarmas | La presencia debe durar 5 s seguidos (ajustable); se desactiva desde la página y no vuelve a sonar mientras la persona siga ahí | Firmware |
| Notificaciones del navegador | Solo con permiso explícito del usuario y sin datos personales en el texto | `app.js` |
| Rechazo erróneo de un filtro de seguridad del modelo | Haiku 5.5 no tiene respaldo automático de modelo; la página descarta el turno y responde con amabilidad | Worker, `asistente.js` |
| Comandos MQTT de terceros | Usuarios con clave en EMQX (uno para el ESP32 y otro para la página) | EMQX |
| Suplantación del broker (ataque de intermediario) | **Riesgo aceptado para la demo:** `setInsecure()`. Para mitigarlo: `clienteTLS.setCACert(ISRG Root X1)` | Firmware |
| Bluetooth sin emparejamiento | **Riesgo aceptado:** cualquiera cerca puede conectarse. Alcance corto y uso en el aula. | Firmware |

## 8.3 Seguridad física

| Riesgo | Medida |
|---|---|
| 120 V en la maqueta (los dos focos) | Relés de 10 A / 250 VAC: un foco consume menos de 1 A. Los empalmes van con termoencogible o conector, sin cobre expuesto. La bornera de los relés va cubierta. Siempre se desenchufa antes de mover un cable. Los focos van en el contacto NO, para que queden apagados si el ESP32 se reinicia. La parte de 120 V queda separada de la protoboard de 3.3 V y 5 V. |
| Bomba en seco | Tanque siempre con agua. La bomba se apaga sola a los 60 s y descansa 1 minuto. |
| Agua sobre la electrónica | La base técnica está detrás de la casa y la placa del sensor de suelo lejos del agua. |
| Motores con la tierra de los sensores | El ventilador y la bomba van al LM2596 (OUT−), con un capacitor de 470 µF; los sensores al MB102. |
| LM2596 sin ajustar (puede dar 12 V) | Ajustar a 5.0 V **antes** de conectar cargas (paso 3 de armado). |
| Cortocircuitos entre buses | Una columna vacía entre buses; prueba de continuidad antes de enchufar; termoencogible en las soldaduras. |
| Relés que se activan al arrancar | El firmware escribe el nivel de apagado antes de configurar los pines como salida. |
| Corriente del buzzer sobre el GPIO | Transistor 2N2222 con resistencia de 1 kΩ: el GPIO solo da unos 2.6 mA. |
| 5 V en entradas de 3.3 V | Los sensores con salida al ESP32 se alimentan con 3.3 V; la salida del PIR ya es de 3.3 V. |
