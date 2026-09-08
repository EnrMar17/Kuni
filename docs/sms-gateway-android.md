# Envío por SMS con un número real (SMSGate)

## Decisión y alcance

Se eligió [capcom6/android-sms-gateway](https://github.com/capcom6/android-sms-gateway), publicado como **SMS Gateway for Android / SMSGate**. Convierte un Android con SIM en un gateway HTTP, tiene licencia Apache-2.0, soporta servidor local, nube pública o servidor privado, múltiples SIM, TTL y reportes de entrega.

Kuni integra su API REST como una alternativa **opt-in**. No se copió ni modificó el repositorio externo: el teléfono ejecuta su app y Kuni llama `POST /messages`. La configuración existente se conserva:

- sin `MESSAGE_PROVIDER`, Kuni sigue obedeciendo `WHATSAPP_PROVIDER`;
- `mock` sigue siendo el valor seguro por defecto;
- Twilio y sus webhooks no se modifican;
- `MESSAGE_PROVIDER=smsgate` es el único cambio que activa SMS reales.

Esta primera fase cubre **envío saliente**. La respuesta `202` de SMSGate se guarda como `accepted`, junto con el `id` devuelto. Los webhooks SMS de recibido/enviado/entregado/fallido todavía no están conectados a las tablas clínicas de Kuni; por eso `accepted` no debe presentarse como entrega confirmada. El webhook existente `/api/webhooks/whatsapp` continúa siendo exclusivamente Twilio.

## Flujo

```text
Supabase Cron -> /api/jobs/tick -> cola bot_interactions
             -> adaptador SMSGate -> API SMSGate -> Android -> SIM -> SMS del paciente
```

El materializador, la revalidación justo antes del envío, el consentimiento vigente, la deduplicación y el contenido clínico existente siguen en el mismo flujo. La única diferencia del canal es que el SMS celular no usa la ventana de conversación de 24 horas ni Content SIDs de WhatsApp.

## Requisitos

1. Un teléfono **Android** compatible, encendido, con acceso a Internet o a la red local de Kuni.
2. Una SIM/eSIM activa, con saldo o plan que permita SMS. El remitente será el número asignado por el operador a esa SIM.
3. La app obtenida desde los [releases oficiales del repositorio](https://github.com/capcom6/android-sms-gateway/releases). No instalar APKs de terceros.
4. Permisos Android para SMS y exclusión razonable de optimización de batería; elegir la SIM predeterminada dentro de la app si hay más de una.
5. Para producción, HTTPS y preferentemente el servidor privado del proyecto. El modo Cloud facilita una prueba inicial; el modo Local requiere que el servidor de Kuni pueda alcanzar el teléfono.
6. Aplicar `supabase/migrations/0010_smsgate_provider.sql` después de las migraciones anteriores. Solo amplía los constraints de `provider` con `smsgate`.

La documentación upstream de referencia es: [envío](https://docs.sms-gate.app/features/sending-messages/), [autenticación](https://docs.sms-gate.app/integration/authentication/) y [estados](https://docs.sms-gate.app/features/status-tracking/).

## Credenciales

SMSGate ofrece Basic Auth y JWT. Para una integración nueva recomienda JWT; crear uno con el alcance mínimo `messages:send`. Kuni acepta cualquiera:

- `SMS_GATEWAY_TOKEN`: JWT Bearer; tiene precedencia;
- o `SMS_GATEWAY_USERNAME` + `SMS_GATEWAY_PASSWORD`: ambos son obligatorios.

Kuni no guarda refresh tokens ni renueva el JWT. Si se usa JWT, se debe rotar el secreto del despliegue antes de su vencimiento. Las credenciales son solo de servidor y nunca deben llevar prefijo `NEXT_PUBLIC_`, registrarse en Git o aparecer en capturas/logs.

## Configuración de Kuni

Copiar los valores reales únicamente a `.env.local` o al gestor de secretos del despliegue:

```dotenv
MESSAGE_PROVIDER=smsgate

# Cloud; para Private/Local usar la base que muestra esa instalación.
SMS_GATEWAY_BASE_URL=https://api.sms-gate.app/3rdparty/v1

# Opción recomendada: JWT con messages:send.
SMS_GATEWAY_TOKEN=REEMPLAZAR

# Alternativa legacy, solo si no se usa JWT.
SMS_GATEWAY_USERNAME=
SMS_GATEWAY_PASSWORD=

# Opcionales. Son útiles para no enviar por otro Android/SIM por accidente.
SMS_GATEWAY_DEVICE_ID=
SMS_GATEWAY_SIM_NUMBER=1

SMS_GATEWAY_TTL_SECONDS=3600
SMS_GATEWAY_TIMEOUT_MS=10000
```

`SMS_GATEWAY_BASE_URL` termina antes de `/messages`; Kuni elimina una `/` final si existe. Los destinatarios se envían en E.164, por ejemplo `+525512345678`. En esta fase Kuni reutiliza `patients.whatsapp_e164` como teléfono E.164 de contacto; no se cambió el formulario ni el esquema del paciente para evitar romper el flujo actual.

Reiniciar la aplicación después de cambiar el proveedor. El selector se evalúa al arrancar y el adaptador se conserva en memoria.

## Puesta en marcha controlada

1. Mantener `MESSAGE_PROVIDER=mock` mientras se instala y enlaza el Android.
2. Desde la app de SMSGate, comprobar el dispositivo, SIM, señal y permisos.
3. Probar directamente la API de SMSGate con **un número del equipo y texto sintético**, nunca con información de un paciente. Confirmar que devuelve HTTP `202` y un `id`.
4. Aplicar la migración 0010 y verificar que la base acepta `provider='smsgate'`.
5. Ejecutar `rtk npm run verify`.
6. Confirmar que el aviso de privacidad y el consentimiento autorizan específicamente **SMS**, no solo WhatsApp.
7. Configurar `MESSAGE_PROVIDER=smsgate`, reiniciar Kuni y crear una sola interacción sintética controlada.
8. Confirmar en el teléfono y en SMSGate que el SMS salió. Mientras no existan webhooks SMS en Kuni, corroborar la entrega en SMSGate y no en el estado `accepted` del tablero.
9. Aumentar volumen gradualmente respetando límites del operador y los límites/delays configurables en la app.

Ni las pruebas unitarias ni `npm run verify` transmiten SMS reales.

## Seguridad, privacidad y operación

- SMS no tiene cifrado de extremo a extremo y puede verse en notificaciones o pantallas bloqueadas. Los recordatorios actuales pueden contener nombre de medicamento o datos de monitoreo; revisar y minimizar ese contenido antes de usarlo con pacientes reales.
- El consentimiento actual de la interfaz dice WhatsApp. No asumir que cubre SMS: actualizar aviso/consentimiento y validarlo con el responsable de privacidad antes de activar este transporte en un piloto clínico.
- Usar un teléfono y SIM dedicados, bloqueo de pantalla, actualizaciones del sistema, inventario del dispositivo y borrado remoto.
- Fijar `SMS_GATEWAY_DEVICE_ID` y `SMS_GATEWAY_SIM_NUMBER` cuando haya varios equipos o SIMs.
- Conservar TTL. Si el Android queda fuera de línea, un recordatorio vencido no debe salir horas después.
- No usar prioridad alta para saltarse límites salvo una política operativa explícita. El operador puede cobrar segmentos múltiples o suspender líneas por automatización/volumen.
- Los SMS con Unicode suelen dividirse antes que GSM-7. Mensajes largos pueden costar varios segmentos.
- No registrar cuerpos, credenciales ni números completos. El adaptador solo persiste el código HTTP del error, no la respuesta cruda de SMSGate.

## Fallos y rollback

Los errores HTTP se normalizan al contrato existente:

| SMSGate | Kuni | Reintento |
|---|---|---|
| 400/422 | `invalid_recipient` | no |
| 401/403 | `unauthorized` | no |
| 429 | `rate_limited` | sí |
| 5xx, red o timeout | `provider_unavailable` | sí |

Para detener envíos reales, cambiar `MESSAGE_PROVIDER=mock` y reiniciar. Para regresar a Twilio, usar `MESSAGE_PROVIDER=twilio` con sus credenciales existentes. No eliminar 0010 durante un incidente: es una ampliación compatible y retirarla puede fallar si ya existen filas `smsgate`.

Antes de alternar proveedores con una cola pendiente, inspeccionar `bot_interactions` en estados `queued`, `sending` o `unknown`; el cambio de transporte no debe provocar el reenvío manual de una interacción cuyo resultado externo sea incierto.

## Pendiente para mensajería bidireccional

Una fase posterior debe crear una ruta distinta, por ejemplo `/api/webhooks/sms`, y registrar `sms:received`, `sms:sent`, `sms:delivered` y `sms:failed`. SMSGate firma webhooks con HMAC-SHA256 sobre `rawBody + X-Timestamp`; la implementación debe comparar en tiempo constante, rechazar timestamps fuera de una ventana corta, deduplicar por el `id` del evento y normalizar el remitente antes de llamar al procesador clínico. Hasta entonces, las respuestas SMS no actualizan adherencia, mediciones ni BAJA en Kuni.
