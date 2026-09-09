# SMS8 en iPhone para la demo

## Alcance real

Esta integración conserva todos los proveedores existentes. Sólo se activa con
`MESSAGE_PROVIDER=sms8`.

En iPhone, SMS8 no es un gateway desatendido: Kuni envía el texto a la API de
SMS8, SMS8 lo pone en la cola del teléfono y iOS muestra el compositor nativo.
Una persona debe elegir la línea/SIM y pulsar **Enviar**. Por eso:

- `delivery_status='accepted'` significa "aceptado por la API de SMS8", no
  "enviado por la SIM" ni "entregado al paciente";
- esta primera integración es sólo de salida y no procesa respuestas SMS;
- no debe usarse para producción ni para mensajes urgentes;
- no se deben incluir diagnósticos, resultados ni otros datos sensibles en la
  demo. SMS8 es un tercero que procesa el número y el cuerpo del mensaje.

## Lo que necesita quien configura la demo

1. La app SMS8 instalada y vinculada al panel.
2. El dispositivo y la SIM visibles como activos en **Devices & SIMs**.
3. Una API key creada desde **Developers** en el panel. No compartirla por chat,
   capturas de pantalla ni commits.
4. La migración `supabase/migrations/0011_sms8_provider.sql` aplicada después de
   `0010_smsgate_provider.sql`.

## Variables de servidor

Agregar a `.env.local` o a los secretos del despliegue:

```dotenv
MESSAGE_PROVIDER=sms8
SMS8_API_KEY=la_clave_generada_en_sms8
SMS8_BASE_URL=https://app.sms8.io/services
SMS8_DEVICE=
SMS8_TIMEOUT_MS=10000
```

Con un solo teléfono, dejar `SMS8_DEVICE` vacío. Si después se conectan varios,
copiar el identificador desde **Devices & SIMs**; el adaptador también acepta el
formato `ID|SIM` documentado por SMS8. Reiniciar Kuni después de cambiar las
variables.

## Prueba controlada

1. Mantener `MESSAGE_PROVIDER=mock` mientras se prepara el escenario.
2. Verificar que existe una sola interacción sintética pendiente y que el
   destinatario es un número de prueba autorizado, no un paciente real.
3. Aplicar la migración 0011.
4. Cambiar a `MESSAGE_PROVIDER=sms8` y reiniciar Kuni.
5. Disparar una sola ejecución de `/api/jobs/tick` o esperar un único ciclo del
   cron. No repetir: la primera solicitud puede estar esperando en el iPhone.
6. En el iPhone, abrir SMS8 o su notificación. Cuando aparezca el compositor,
   revisar destinatario y texto, elegir la línea correcta y pulsar **Enviar**.
7. Confirmar el SMS en la app Mensajes y en el teléfono receptor.
8. Al terminar, regresar inmediatamente a `MESSAGE_PROVIDER=mock` y reiniciar.

El endpoint de SMS8 usado por Kuni es `POST /services/send.php`, con cuerpo
`application/x-www-form-urlencoded`. La API key viaja en el cuerpo porque ése es
el contrato del proveedor; nunca se registra en logs ni en la base de datos.

## Riesgos operativos de la demo

- El cron puede encolar más de un mensaje mientras SMS8 está activo. Antes de
  habilitarlo, dejar una sola interacción vencida y supervisar el iPhone.
- Cerrar o ignorar el compositor no revierte el `accepted` ya registrado en
  Kuni. Para la demo, la verificación final es visual/manual.
- Con dos líneas, iOS puede preguntar cuál usar en cada mensaje aunque se haya
  indicado un dispositivo en la API.
- SMS8 mantiene sus propios límites/créditos; un HTTP 402 se registra como fallo
  del proveedor y un HTTP 429 queda como reintentable.

## Rollback

Cambiar `MESSAGE_PROVIDER=mock` y reiniciar detiene nuevas solicitudes reales.
La migración 0011 puede permanecer aplicada: sólo amplía un constraint y no
cambia el comportamiento de `mock`, Twilio ni SMSGate. Si la clave se expone,
rotarla desde SMS8 y reemplazarla en los secretos del servidor.

## Referencias del proveedor

- [SMS8 en la App Store de México](https://apps.apple.com/mx/app/sms8-io/id6795346999)
- [Documentación de la API REST](https://sms8.io/sms8-api-documentation)
- [Política de privacidad y retención](https://sms8.io/privacy-policy)
