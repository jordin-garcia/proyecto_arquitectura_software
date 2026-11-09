# Especificaciones — Casa IA

Especificaciones completas del proyecto final de **Arquitectura del Computador** (Ingeniería en Sistemas, Universidad Rafael Landívar, catedrático Ing. Marlon Romeo Estrada Gordillo).

Describen **qué debe hacer** el sistema y **cómo está construido**. Cuando el código y una especificación no coincidan, se corrige el que esté mal y se actualiza el otro en el mismo cambio.

## Documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [Visión y requisitos](01-vision-y-requisitos.md) | Objetivo, requisitos del curso, cómo se cumple cada uno, alcance |
| 2 | [Arquitectura](02-arquitectura.md) | Componentes, flujos de datos, decisiones de diseño |
| 3 | [Hardware](03-hardware.md) | Componentes, maqueta, alimentación, pines y cada cable |
| 4 | [Firmware del ESP32](04-firmware.md) | Tareas, sensores, automatización, alarma, memoria |
| 5 | [Protocolo](05-protocolo.md) | MQTT, Bluetooth, JSON de estado, configuración y comandos |
| 6 | [Página web](06-pagina-web.md) | Módulos, interfaz, avisos de la alarma, simulador, voz |
| 7 | [Asistente MIA](07-asistente-mia.md) | Servidor, modelo, herramientas, ciclo de conversación |
| 8 | [Seguridad](08-seguridad.md) | Amenazas, secretos, validación y límites físicos |
| 9 | [Pruebas y demostración](09-pruebas-y-demostracion.md) | Plan de pruebas, puesta en marcha, guion y fallas comunes |

## Resumen en una página

- **Placa:** ESP32-WROOM-32 DevKit de 38 pines con USB-C, núcleo Arduino esp32 3.x, partición "Huge APP".
- **5 dispositivos:**

  | # | Dispositivo | Sensor | Actuador | Comportamiento |
  |---|---|---|---|---|
  | 1 | Foco interior | — | Relé + foco de 120 V | Solo desde la página, en cualquier modo |
  | 2 | Foco exterior | LDR | Relé + foco de 120 V | Enciende sin luz; apaga con luz |
  | 3 | Riego | Humedad del suelo | Transistor 2N2222 + bomba de 5 V | Riega con la tierra seca; para cuando está húmeda |
  | 4 | Ventilador | DHT22 | Transistor 2N2222 + ventilador de 5 V | Enciende con calor; apaga cuando baja la temperatura |
  | 5 | Alarma | PIR | Buzzer activo con transistor | Persona detectada 5 s seguidos: suena y avisa a la página. Se apaga cuando ya no hay nadie o desde la página. |

- **Modos:**
  - Automático: el ESP32 decide solo, incluso sin internet.
  - Manual: órdenes desde la PC o el celular, con botones o con voz.
  - El foco interior se controla desde la página en los dos modos.
- **Conexiones:**
  - WiFi: MQTT con TLS a EMQX Cloud Serverless.
  - Bluetooth: BLE GATT con Web Bluetooth.
  - La página prefiere Bluetooth cuando está conectada.
- **Interfaz:** una sola página web estática en GitHub Pages, adaptada a PC y celular.
- **IA:** MIA usa Claude Haiku 5.5 (esfuerzo alto) a través de un Cloudflare Worker. Claude decide; la página ejecuta en el ESP32; el ESP32 valida.
- **Referencia visual:** la [maqueta 3D interactiva](https://claude.ai/artifact/YVD5HeXeccF4JXbPQwJwjb) muestra cada pieza y cada cable de pin a pin.

## Estado actual (9 de noviembre de 2026)

| Parte | Estado |
|---|---|
| Firmware | Probado en la placa real con el cableado de la maqueta. Se conecta al WiFi, a EMQX y por Bluetooth. Sensores calibrados. Compila sin errores ni advertencias: programa al 40 %, RAM global al 18 %. |
| Página web | Conectada a la casa real por WiFi (EMQX) y Bluetooth al mismo tiempo |
| MIA | Probada con la API real a través del servidor publicado |
| Servidor | Publicado en Cloudflare: `https://casa-ia-asistente.sistente.workers.dev` |
| Broker MQTT | EMQX Cloud Serverless (HiveMQ dejó de crear brokers gratuitos) |
| Hardware | Armado y probado. Pendiente: aislar empalmes de 120 V, diodos en ventilador y bomba, confirmar 3.3 V en el sensor de suelo. La maqueta 3D todavía muestra el diseño anterior. |

## Historial de cambios de diseño

| Fecha | Cambio |
|---|---|
| 29 oct 2026 | Diseño anterior: luces por presencia, clima, riego, cortinas con servo y detector de llama con rociador |
| 30 oct 2026 | Diseño actual: foco interior manual, foco exterior con LDR, riego, ventilador y alarma por presencia (PIR + buzzer). Se retiraron el servo, la cortina, el detector de llama y la bomba del rociador. |
| 8 nov 2026 | Cableado real de la maqueta: focos de 120 V por relé (foco interior en GPIO 19, exterior en GPIO 22); ventilador, bomba y buzzer por transistor 2N2222; DHT22 en GPIO 21; LDR en 34; suelo en 35, alimentado siempre. |
