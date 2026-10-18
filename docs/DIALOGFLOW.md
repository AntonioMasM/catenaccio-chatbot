# Integración con Dialogflow ES

## Fuente del contenido

Los intents, entidades, sinónimos, prompts, contextos y respuestas estáticas se configuran en Dialogflow. El backend no contiene sus JSON ni reproduce el catálogo. Los cambios de bienvenida, menús o rich content se realizan en la consola del agente.

La web solicita WELCOME al abrir y al iniciar una conversación nueva. `/api/chat` conserva el texto y decodifica los payloads recibidos. `DialogflowContent.tsx` presenta imágenes, tarjetas, descripciones, listas, acordeones, chips y botones genéricos, utilizando los valores del payload. No contiene opciones ni textos conversacionales predefinidos. Un payload sin texto se presenta sin añadir una burbuja vacía o un saludo local.

Los eventos recibidos en los botones se envían a Dialogflow con su nombre y parámetros. El agente decide qué intent corresponde al evento; la web no mantiene un catálogo paralelo ni convierte eventos en frases codificadas.

`FootballCards.tsx` presenta estructuras `richResponse` recibidas con los tipos player, team, league, standings, nextMatch, dataTable, results, squad, teamStats, playerStats y playerComparison. Se priorizan sobre su copia genérica en `richContent` para evitar repetir la foto o la tarjeta. Cuando solo llega richContent, una imagen y su descripción con campos se agrupan en una ficha; las filas de clasificación y los datos de partido reconocidos se presentan con sus componentes correspondientes. Las imágenes conservan su proporción.

`FormattedReply.tsx` adapta los formatos de texto de fichas, clasificaciones y próximos partidos a esas mismas vistas cuando no hay una tarjeta en el payload. Conserva cualquier texto adicional de las previas y deja intactas las respuestas que no reconoce. No solicita imágenes adicionales ni inventa campos ausentes. En móvil, las tablas se desplazan horizontalmente y mantienen visibles los puntos.

## Fulfillment de datos

El webhook despacha `queryResult.action` y utiliza `queryResult.parameters`. Dialogflow entrega los valores canónicos y resuelve sus defaults de contexto. Por tanto, todos los intents de datos deben tener configurado su Action y el webhook activado.

| Acción | Parámetros |
| --- | --- |
| `team.info`, `team.nextMatch`, `team.squad`, `preview.start` | equipo |
| `team.results` | equipo, temporada, competicion |
| `team.stats` | equipo, temporada, competicion, metrica_equipo |
| `player.info` | jugador |
| `player.stats` | jugador, temporada, competicion, metrica_jugador |
| `league.info` | competicion |
| `league.standings`, `league.results` | competicion, temporada |
| `compare.teams` | equipo_a, equipo_b, metrica_equipo, temporada, competicion |
| `compare.players` | jugador_a, jugador_b, metrica_jugador (goles, asistencias, partidos), competicion; siempre temporada actual y totales |

Las consultas devuelven texto con los datos obtenidos. Para `team.info`, `team.nextMatch`, `team.results`, `team.squad`, `team.stats`, `player.info`, `player.stats`, `compare.players`, `league.info`, `league.standings`, `league.results` y `preview.start`, el webhook añade también un payload `richResponse` con los datos e imágenes disponibles del proveedor. `responseText` identifica el texto cubierto por la ficha para evitar mostrarlo dos veces; si la estructura no se reconoce, el texto sigue disponible. El webhook sustituye el texto de reserva del intent y conserva sus mensajes enriquecidos y menús. Los intents estáticos deben responder desde Dialogflow; si llaman al webhook, se devuelve su contenido recibido sin reconstruirlo.

La ficha `league` conserva el emblema, ámbito, formato, temporada y jornada del proveedor. Las fechas se muestran en español sin cambiar el día. `standings` conserva el logo de la competición y el escudo de cada fila, junto con todas las estadísticas y grupos. `results` incorpora el emblema y temporada de la competición cuando existen, además de los escudos de ambos equipos. Los marcadores y valores ausentes permanecen desconocidos; los resultados de liga no reciben indicadores V/E/D de un equipo concreto.

La ficha `teamStats` contiene competición, temporada, escudo y la lista de métricas solicitadas, junto con las notas de cobertura y selección de temporada. Los proveedores conservan el escudo al devolver las estadísticas. La interfaz también reconoce la respuesta textual de estadísticas de equipo, manteniendo los ceros, datos ausentes y notas adicionales.

`SquadPitch.tsx` agrupa toda la plantilla por posiciones en el campo lateral y conserva los jugadores sin posición en un grupo adicional. No determina una alineación titular. Las camisetas muestran el dorsal solo cuando lo facilita el proveedor. En pantallas de hasta 720 px, la plantilla se presenta dentro de su ficha en el chat. El panel lateral muestra la plantilla de la última respuesta y vuelve a la mascota al recibir otra consulta o reiniciar.

## Contextos y repetición

El webhook conserva los contextos recibidos, incluyendo sus nombres y duraciones. No añade copias con otros nombres ni reconstruye las reglas del agente. Si una comparación elige automáticamente un año común, completa el parámetro temporada de los contextos activos que ya contienen ese campo. Dialogflow controla la caducidad y el borrado. Los parámetros vacíos y los campos `.original` no se utilizan como valores de consulta.

El único contexto técnico propio es `ultimo_resultado`, que guarda el último texto de datos para `session.repeat`, con límite de tamaño. `session.reset` limpia ese recuerdo y los contextos recibidos de la misma sesión. La ruta web recuerda también la última respuesta recibida y sus payloads para repetir menús y contenido estático, con caducidad de 30 minutos y un máximo de 250 sesiones por proceso. No se comparte contenido entre conversaciones. Varias réplicas necesitarían un almacenamiento compartido para esta repetición.

## Proveedores y formatos

Los adaptadores de APIs utilizan traducciones de nombres específicos de cada proveedor, independientes de las entidades de Dialogflow. La normalización común está en `src/normalize.js`; parámetros, temporadas y formato numérico están en `src/footballQuery.js`.

`2023/2024`, `2023-2024`, `2023/24` y `2023` se convierten al año inicial 2023. Se rechazan temporadas no consecutivas. Una temporada solicitada no se sustituye por otra.

Football-Data es la primera fuente para partidos, tablas, competiciones y plantillas. Las comparativas de jugadores consultan exclusivamente sus tablas de goleadores actuales: goles, asistencias y partidos. Ignoran temporadas anteriores recibidas o guardadas en contextos y no recurren a estadísticas de API-SOCCER. Las consultas individuales de estadísticas mantienen su cobertura adicional con API-SOCCER. Los perfiles y las fotos de jugadores usan API-SOCCER. En los menús de comparativas de Dialogflow deben ofrecerse únicamente goles, asistencias y partidos, sin selección de temporada ni criterio por 90.

Las clasificaciones incluyen todos los equipos. Los resultados muestran hasta diez encuentros finalizados por fecha descendente. El próximo partido incluye los estados SCHEDULED/TIMED y se selecciona por fecha ascendente. La previa resume calendario y resultados disponibles.

Las comparaciones de jugadores muestran totales actuales de Football-Data y enumeran las competiciones y sus periodos disponibles. No muestran minutos ni tasas por 90. Si faltan datos actuales comunes, se informa de su ausencia. Los equipos utilizan una fuente y competición comunes; en copas sin tabla se obtienen estadísticas agregadas sin inventar puntos. Las consultas de equipos y estadísticas individuales respetan una temporada explícita. Los errores de cuota, autenticación y cobertura se distinguen.

`AssistantResponse.tsx` presenta las previas con el partido, dos bloques de resultados recientes y los indicadores V/E/D derivados de los marcadores. Conserva botones recibidos y evita duplicar la tarjeta del partido. Las comparaciones de texto se presentan en tablas con notas de ámbito, periodo y fuente. Detalles y campos consultados en [API_DATA.md](API_DATA.md).

## Autenticación y rendimiento

Se conservan `.env` y `web/.env.local`. `DIALOGFLOW_AUTH_MODE=adc` usa las credenciales locales de Google y omite la clave privada, según la configuración actual. El cliente de Google se reutiliza y realiza una llamada detectIntent por envío, sin reintentos automáticos.

Los proveedores mantienen cachés de datos y agrupan peticiones iguales en curso. Perfiles/equipos de API-SOCCER: una hora; ligas: 24 horas; estadísticas de jugadores: diez minutos; partidos/tablas: un minuto. Football-Data conserva catálogos 24 horas y peticiones un minuto. Los errores no se cachean.

Timeout de proveedor: 1,8 segundos por petición; presupuesto de webhook: 4,2 segundos. Las consultas frías o con cambio de proveedor pueden superar ese presupuesto. Fechas en Europe/Madrid y cifras en español.

## Validación y conexión

`npm test`, `npm --prefix web run lint`, `npm run web:build`. Las pruebas simulan datos y mensajes recibidos, sin cargar el export del agente. Comprueban acciones, filtros, cálculos, payloads intactos y opciones presentadas una sola vez.

La ruta web se ha comprobado con el agente real: WELCOME devuelve cinco opciones distintas; el menú de equipos devuelve siete; repetición conserva ese payload; reinicio devuelve el menú del agente. La comprobación usa ADC y no modifica la configuración remota.

Arranca Express, ngrok y Next.js y guarda la URL actual del túnel en Fulfillment para comprobar el recorrido completo. Los pasos están en el README.

Referencia oficial del contrato: [WebhookResponse de Dialogflow ES](https://docs.cloud.google.com/dialogflow/es/docs/reference/rest/v2/WebhookResponse).
