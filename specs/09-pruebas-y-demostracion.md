# 9. Pruebas y demostración

## 9.1 Pruebas de software (sin hardware)

| # | Prueba | Cómo | Resultado esperado | Estado |
|---|---|---|---|---|
| S1 | Sintaxis de JavaScript | `node --check` sobre `web/js/*.js` y `servidor/src/*.js` | Sin errores | ✅ |
| S2 | Compilación del firmware | `arduino-cli compile` (ver `CLAUDE.md`) con `secrets.h` de ejemplo | 0 errores, 0 advertencias, programa < 3 MB | ✅ 30 oct: programa al 40 % (1 288 894 bytes), RAM global al 18 % (59 552 bytes) |
| S3 | Empaquetado del Worker | `npx wrangler deploy --dry-run` | Se genera el paquete | ✅ |
| S4 | Validaciones del Worker | Peticiones con `OPTIONS`, ruta incorrecta, `Origin` incorrecto, sin código, JSON inválido, formato inválido, clave falsa | 204, 404, 403, 401, 400, 400, 500 | ✅ |
| S5 | Foco interior en automático | `?demo=1`, modo automático, tocar el interruptor del foco interior | Se enciende; su estado dice "Encendido · desde la página"; los demás interruptores siguen deshabilitados | ✅ |
| S6 | Alarma en modo demo | "Simular una persona" | A los 2 s: "Hay alguien", sin alarma. A los 7 s: alarma "Sonando", aviso rojo, mensaje emergente y entrada en el historial. "Desactivar alarma" → "Alarma silenciada". Cuando la persona se va → todo normal. | ✅ |
| S7 | Herramientas de Aurora | Respuestas `tool_use` simuladas | Enciende el foco interior en automático; rechaza el ventilador en automático; cambia el tiempo de alarma; pasa a manual y enciende el ventilador; rechaza una regla con el foco interior; crea una regla con el foco exterior; `silenciar_alarma` sin alarma responde "ya estaba en silencio" | ✅ |
| S8 | Diseño adaptable | Ancho de 375 px, tema claro y oscuro | Sin desplazamiento horizontal; pestañas Casa / Aurora | ✅ (diseño anterior; la estructura no cambió) |
| S9 | Aurora con la API real | Worker desplegado y clave real | Respuestas por voz, acciones confirmadas | ⏳ Pendiente |

## 9.2 Puesta en marcha del hardware

Se sigue el orden de los 12 pasos de la maqueta 3D. Medir **antes** de conectar cada etapa.

| Paso | Qué se arma | Verificación | Valor esperado |
|---|---|---|---|
| 1 | Base, casa, pasos de cables | Visual | 5 pasacables en la pared del fondo y un agujero pequeño en el techo de la cocina para el LDR |
| 2 | Jack y 3 buses | Continuidad con todo desenchufado | Los 4 tornillos de un bus pitan entre sí; entre buses no pita |
| 3 | LM2596 + capacitor | Voltaje con el adaptador y **sin cargas** | IN = 12 V. OUT = **5.0 V** tras ajustar. |
| 4 | MB102 + plug | Voltaje en los rieles | Atrás: 3.3 V. Adelante: 5 V. |
| 5 | ESP32 | USB a la laptop; monitor serie a 115200 | "Casa inteligente - iniciando", "Bluetooth listo: CasaIA", "WiFi conectado", "MQTT: conectando... OK" |
| 6 | Relés (sin jumper) | En manual, mover cada interruptor | Clic y LED de cada canal; ninguno se activa al arrancar |
| 7 | Foco interior | Interruptor en la página, en automático y en manual | Enciende y apaga en los dos modos |
| 8 | Foco exterior + LDR | Tapar y destapar el LDR (en automático) | Enciende con luz < 25 %; apaga con luz > 35 %; encender el foco no cambia la lectura de luz |
| 9 | DHT22 + ventilador | Calentar el DHT22 | Arranca a ≥ 28 °C; se apaga a < 27.5 °C |
| 10 | Sensor de suelo + bomba + manguera | Calibrar (9.3); sacar la sonda de la tierra | Riega ciclos de ≤ 15 s con 60 s de pausa hasta llegar a 45 % |
| 11 | PIR + transistor + buzzer | Moverse frente al PIR | Con 5 s de presencia suena la alarma y la página avisa; al irse se apaga; "Desactivar alarma" la silencia |
| 12 | Revisión final | Continuidad y voltajes otra vez; luego el USB | Sin cortos; 12 V, 5.0 V y 3.3 V correctos |

## 9.3 Calibración

1. **Sensor de suelo:**
   1. Poner `DEPURAR_SENSORES 1`, compilar y subir.
   2. Anotar "Crudo suelo" con la sonda en el aire (→ `SUELO_SECO`) y dentro de agua (→ `SUELO_MOJADO`).
   3. Volver a `0` y subir otra vez.
2. **LDR:**
   1. Con `DEPURAR_SENSORES 1`, anotar el valor con la luz del salón y tapado.
   2. Ajustar `luz_noche` desde la página para que quede entre los dos.
   3. Encender el foco exterior y comprobar que la lectura no cambia.
3. **PIR:**
   - Jumper en **H**, tiempo al mínimo y sensibilidad media.
   - Al encender necesita **30 a 60 s** para estabilizarse.
   - Si se activa con gente fuera de la maqueta, poner un tubo de cartulina negra alrededor de la cúpula.
   - Si la alarma tarda en activarse, bajar `tiempo_alarma`.

## 9.4 Pruebas de aceptación (requisitos del curso)

| Requisito | Prueba | Aprobada si… |
|---|---|---|
| R1 PC | Abrir la página en la laptop | Sensores y dispositivos en vivo |
| R2 Celular | Abrir la página en un Android con Chrome | Pestañas Casa / Aurora funcionando |
| R3 WiFi | Controlar con el Bluetooth apagado | Los cambios se aplican en ≤ 3.5 s |
| R4 Bluetooth | Celular sin internet → conectar Bluetooth | Se controla la casa y se ven los sensores |
| R5 Autonomía | Desconectar el internet del ESP32 | Foco exterior, ventilador, riego, alarma y reglas siguen funcionando |
| R6 Manual | Cambiar a manual y mover cada dispositivo | Cada dispositivo responde; el foco interior también en automático |
| R7 Tiempo real | Observar el panel, la gráfica y el aviso de la alarma | Se actualizan cada 1 a 2 s |
| R9 Sin LEDs | Revisar los actuadores | 2 focos de 12 V por relé, ventilador, bomba y buzzer |
| R10 5 dispositivos | Pasos 7 a 11 de 9.2 | Los 5 funcionan como se describe |

## 9.5 Guion de la presentación (≈8 minutos)

1. **Introducción (30 s):** ESP32 con doble núcleo + página web + WiFi y Bluetooth + Aurora con Claude.
2. **Autonomía (2 min), en automático:**
   - tapar el LDR → se enciende el foco exterior; destapar → se apaga;
   - calentar el DHT22 → arranca el ventilador;
   - sacar la sonda → riega la maceta.
3. **Alarma (1.5 min):**
   - una persona se para frente al PIR y se mueve 5 s → suena la alarma;
   - en la página aparece el aviso rojo, el mensaje y la entrada en el historial;
   - desactivarla desde la página; luego la persona se aleja.
4. **Foco interior y control manual por WiFi (1 min):** encender el foco interior desde la PC en automático; cambiar a manual y mover los demás.
5. **Bluetooth (1 min):** celular sin internet → conectar por Bluetooth → controlar.
6. **Aurora por voz (1.5 min):**
   - "¿Cómo está la casa?";
   - "Enciende el foco de la sala";
   - "Después de las 10 de la noche apaga el foco de afuera".
7. **Sin internet (30 s):** desconectar el internet y mostrar que la alarma y la automatización siguen funcionando.
8. **Arquitectura del Computador (opcional):** doble núcleo, cola y mutex, interrupción del PIR, temporizadores sin bloqueo, histéresis, ADC1, NVS y particiones.

**Antes de presentar:**
- Encender la maqueta 1 minuto antes (el PIR se estabiliza).
- Llenar el tanque.
- Cargar la laptop y el celular.
- Abrir la página y activar las notificaciones.
- Probar Aurora una vez.
- Revisar que el modo sea automático.

## 9.6 Fallas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El ESP32 se reinicia al encender la bomba o el ventilador | Motores conectados al MB102 o sin el capacitor | Motores al LM2596 (OUT−) con capacitor de 470 µF |
| Un relé no se apaga | El jumper VCC–JD-VCC sigue puesto, o la lógica está invertida | Quitar el jumper; revisar `RELE_ACTIVO_BAJO` |
| El foco exterior se enciende y apaga sin parar | El foco ilumina el LDR | Separarlos más o poner una visera; subir la histéresis (`HIST_LUZ`) |
| La alarma nunca suena aunque haya alguien | PIR con jumper en L (la salida baja aunque la persona siga), o tiempo de alarma alto | Jumper en H; bajar `tiempo_alarma` |
| La alarma suena sola | PIR demasiado sensible, o detecta a la gente fuera de la maqueta | Bajar la sensibilidad; tubo de cartulina; subir `tiempo_alarma` |
| El buzzer no suena | Transistor al revés o sin la resistencia de base | Revisar E · B · C y la resistencia de 1 kΩ |
| La página no muestra el aviso | La página no estaba conectada cuando sonó, o el ESP32 se reinició | El aviso usa el contador `na`; si el ESP32 se reinició, el contador vuelve a 0 |
| No llegan notificaciones | Permiso negado o la página cerrada | Volver a activar la opción y permitir en el navegador |
| Temperatura "sin lectura" | DHT22 mal conectado | + a 3.3 V, out a GPIO 4, − a GND |
| Humedad del suelo siempre en 0 o en 100 | Sin calibrar, o VCC no viene de GPIO 32 | Calibrar; revisar el cable |
| La página dice "sin-casa" | El ESP32 no se conectó a MQTT | Revisar `secrets.h`, el WiFi y el monitor serie |
| Bluetooth no aparece | Navegador no compatible o sin HTTPS | Chrome o Edge; usar la dirección de GitHub Pages |
| Aurora: "Código de acceso incorrecto" | Ajustes distintos al secreto del Worker | Corregir el código en Ajustes |
| La compilación falla con `secrets.h: No such file` | Falta el archivo | Copiar `secrets.h.example` como `secrets.h` |
| El programa no cabe | Partición normal | Elegir "Huge APP" |
