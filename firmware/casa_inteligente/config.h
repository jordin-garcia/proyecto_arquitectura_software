// =====================================================================
//  Casa inteligente con asistente virtual - Configuracion de hardware
//  Placa: ESP32-WROOM-32 DevKit (38 pines)
//  Las conexiones coinciden con la maqueta 3D del proyecto.
// =====================================================================
#pragma once

// ---------------- Sensores ----------------
// Solo usamos pines ADC1 (32-39) para lecturas analogicas: los pines ADC2
// dejan de funcionar cuando el WiFi esta encendido.
#define PIN_PIR          27   // Sensor de movimiento HC-SR501 (salida digital de 3.3 V, jumper en H)
#define PIN_DHT          4    // Sensor de temperatura y humedad DHT22 (modulo de 3 pines)
#define PIN_SUELO        34   // Salida AO del sensor de humedad resistivo (ADC1_CH6, solo entrada)
#define PIN_SUELO_VCC    32   // Alimenta el sensor de suelo solo al medir (evita que la sonda se corroa)
#define PIN_LDR          35   // Nodo del divisor LDR + resistencia 10k (ADC1_CH7, solo entrada)

// ---------------- Actuadores ----------------
// Modulo de 4 reles con optoacoplador (se activan con nivel BAJO)
#define PIN_RELE_LUZ_INT 26   // Rele 1 (IN1): foco interior de 12 V (solo se controla desde la pagina)
#define PIN_RELE_VENT    25   // Rele 2 (IN2): ventilador de 5 V
#define PIN_RELE_BOMBA   33   // Rele 3 (IN3): bomba del riego (5 V)
#define PIN_RELE_LUZ_EXT 23   // Rele 4 (IN4): foco exterior de 12 V
#define RELE_ACTIVO_BAJO true // cambiar a false si sus reles se activan con nivel ALTO

#define PIN_BUZZER       18   // Base del transistor 2N2222 (con resistencia de 1k); ALTO = suena

// ---------------- Calibracion de sensores ----------------
// Activen DEPURAR_SENSORES, abran el Monitor Serie (115200) y anoten las
// lecturas crudas con la sonda seca (en el aire) y dentro de un vaso de agua.
#define DEPURAR_SENSORES 0
#define SUELO_SECO       4000 // lectura ADC con la sonda en el aire
#define SUELO_MOJADO     1500 // lectura ADC con la sonda dentro de agua
#define SUELO_CADA_MS    3000 // cada cuanto se mide el suelo
#define SUELO_ESPERA_MS  30   // tiempo encendido antes de medir

// ---------------- Umbrales por defecto (se pueden cambiar desde la web) ----------------
#define DEF_TEMP_MAX     28.0f // °C: desde aqui se enciende el ventilador
#define DEF_SUELO_MIN    35    // %: abajo de esto la tierra esta seca y se riega
#define DEF_LUZ_NOCHE    25    // %: abajo de esto no hay luz y se enciende el foco exterior
#define DEF_ALARMA_SEG   5     // s: tiempo que el PIR debe detectar a alguien sin parar para sonar la alarma

// Histeresis: evita que un dispositivo se encienda y apague sin parar cerca del umbral
#define HIST_TEMP        0.5f  // °C: el ventilador se apaga por debajo de tmax - 0.5
#define HIST_LUZ         10    // %: el foco exterior se apaga por encima de ln + 10
#define HIST_SUELO       10    // %: la tierra esta humeda (se deja de regar) en smin + 10
#define PIR_LIBRE_MS     1500  // ms sin deteccion para considerar que ya no hay nadie

// ---------------- Limites de seguridad ----------------
#define RIEGO_MAX_SEG       15    // riego automatico: maximo encendido por ciclo
#define RIEGO_PAUSA_SEG     60    // riego automatico: espera para que el agua se absorba
#define BOMBA_MANUAL_MAX_S  60    // la bomba se apaga sola despues de esto, incluso en manual
#define MAX_REGLAS          6

// ---------------- Comunicaciones ----------------
#define ID_CASA          "casa01"           // cambia los topicos MQTT: casa/<ID_CASA>/...
#define NOMBRE_BLE       "CasaIA"
#define ZONA_HORARIA     "CST6"             // Guatemala (UTC-6, sin horario de verano)
#define SERVIDOR_NTP     "pool.ntp.org"
#define PERIODO_ESTADO_MS 1000              // cada cuanto se publica el estado

// UUID del servicio Bluetooth (deben coincidir con web/conexion.js)
#define UUID_SERVICIO    "6f1a0001-3c2b-4f5e-9a8d-1b2c3d4e5f60"
#define UUID_ESTADO      "6f1a0002-3c2b-4f5e-9a8d-1b2c3d4e5f60" // READ | NOTIFY
#define UUID_COMANDO     "6f1a0003-3c2b-4f5e-9a8d-1b2c3d4e5f60" // WRITE
#define UUID_CONFIG      "6f1a0004-3c2b-4f5e-9a8d-1b2c3d4e5f60" // READ | NOTIFY (umbrales + reglas)
