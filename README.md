# Catenaccio Chatbot

Asistente de fútbol con Dialogflow ES, webhook Express y chat Next.js. **Dialogflow es la fuente de los intents, entidades, respuestas y rich content**. El proyecto no almacena ni carga el export JSON del agente.

## Responsabilidades

- **Dialogflow:** interpreta las consultas, resuelve entidades y parámetros, gestiona contextos y devuelve bienvenida, menús, chips y demás contenido enriquecido.
- **Express:** despacha la acción recibida y consulta las APIs de fútbol. Devuelve los resultados en texto y añade fichas de equipos, jugadores, competiciones, clasificaciones, partidos, resultados, estadísticas, comparativas de jugadores y plantillas con los datos e imágenes del proveedor. Conserva los payloads recibidos del agente.
- **Next.js:** consulta Dialogflow y presenta su texto y rich content con los estilos de la web. Añade una pizarra táctica visual con seis conceptos; las explicaciones del chat siguen procediendo de Dialogflow.

Nueva conversación crea otra sesión y solicita de nuevo WELCOME. Las respuestas se muestran completas al recibirlas, sin temporizadores de escritura ni copias ocultas del texto.

La presentación de datos usa fichas de jugadores y equipos con imágenes contenidas, tablas de clasificación y tarjetas de próximos partidos. Cuando hay una tarjeta válida, se muestra la tarjeta sin la burbuja de texto independiente; esto incluye las tarjetas genéricas de conceptos y menús de Dialogflow. Se conservan sus chips y botones. Si solo llegan opciones o contenido no reconocido, se conserva el texto. Si el payload contiene `richResponse` y `richContent`, se utiliza la estructura específica una sola vez. También se reconocen fichas y tablas dentro de `richContent`, y los formatos de texto de las consultas de datos; los valores proceden siempre de la respuesta recibida.

Las fichas de equipos y próximos partidos incluyen los escudos recibidos de las APIs. Los últimos resultados se presentan con fechas, competiciones, marcadores e indicadores V/E/D. Al consultar una plantilla, el campo izquierdo muestra todos los jugadores en líneas de ataque, centro del campo, defensa y portería, con filas centradas de camisetas, dorsales y nombres. Las posiciones desconocidas tienen su propio grupo. Las filas se adaptan al ancho disponible y el listado tiene desplazamiento para plantillas largas; no representa una alineación titular. En móvil, la plantilla se muestra dentro del chat.

Al pedir los últimos resultados de un equipo o competición, el campo intenta mostrar los 22 titulares del encuentro más reciente de esa respuesta. Football-Data aporta el detalle del partido; si no contiene ambos onces, se intenta API-SOCCER buscando los mismos equipos y la misma fecha y hora. Nunca se reutilizan IDs entre proveedores ni se sustituye el partido por otro anterior. Solo se aceptan dos onces completos, sin duplicados ni suplentes. Se usan las coordenadas del proveedor cuando existen; en su ausencia, se identifica la distribución como orientativa. Si no hay cobertura, el campo informa de que los onces no están disponibles y se conservan los resultados. En móvil, los onces se muestran dentro de la tarjeta de resultados. La consulta adicional tiene un presupuesto de tiempo limitado para no bloquear la respuesta de Dialogflow.

El campo comienza vacío y solo muestra un concepto al solicitarlo en el chat, escribiendo la pregunta o usando los chips recibidos de Dialogflow. Admite fuera de juego, xG, posesión, presión alta, contraataque y 4–3–3. No hay selectores ni accesos a conceptos desde el campo. Incluye pausa, descripciones accesibles y respeto por la preferencia de movimiento reducido. Otra consulta retira el concepto y una conversación nueva vuelve al campo vacío. Las animaciones son esquemas didácticos, no datos de partidos ni estimaciones de xG calculadas.

El catálogo tipado está en `web/lib/tactics.ts`; `TacticalScene.tsx` dibuja las escenas SVG y `TacticalBoard.tsx` gestiona los controles. Los estilos se aíslan en `TacticalBoard.module.css`. Para ampliar el catálogo se añade una entrada con posiciones, trayectorias, pregunta, descripción y patrón de reconocimiento. No se necesitan librerías de animación ni peticiones adicionales para los dibujos. Las referencias didácticas de fuera de juego y xG son [IFAB, Regla 11](https://www.theifab.com/laws/latest/offside/) y [StatsBomb, factores del xG](https://blogarchive.statsbomb.com/articles/soccer/understanding-statsbomb-radars/).

Las estadísticas del equipo tienen una ficha propia con escudo, competición, temporada y bloques para cada métrica, destacando los puntos. También se reconoce su formato de texto para presentar respuestas anteriores. Los ceros se conservan y los datos ausentes se indican como no disponibles.

Las consultas de jugadores incluyen su foto. Las estadísticas y comparativas tienen fichas propias con imágenes, fuente, competición, temporada y notas de cobertura. Las comparativas de jugadores utilizan exclusivamente los datos actuales de Football-Data: goles, asistencias y partidos. Las estadísticas individuales mantienen su cobertura adicional con API-SOCCER.

Las comparativas consultan la temporada actual del proveedor sin enviar el parámetro `season`, aunque Dialogflow conserve una temporada anterior. No muestran minutos ni tasas por 90 y no recurren a estadísticas históricas de API-SOCCER si faltan jugadores. Las fotos pueden seguir procediendo de API-SOCCER. Si no hay datos actuales comunes, se indica su falta de disponibilidad.

Verificación de acceso del 18/10/2026: la clave configurada de API-SOCCER rechaza 2026 por su plan gratuito y permite 2022–2024. Una consulta real a `/players?id=278&season=2024&league=140` devolvió para Kylian Mbappé 2917 minutos, 31 goles y 3 asistencias. La disponibilidad depende del plan, jugador, competición y temporada. Referencias: [API-FOOTBALL, estadísticas de jugadores](https://www.api-football.com/documentation-v3#tag/Players) y [Football-Data, tabla de goleadores](https://docs.football-data.org/general/v4/competition.html#_top_scorers).

Los datos de liga tienen una ficha con emblema, ámbito, formato, temporada, jornada y fechas de inicio y fin. Las clasificaciones conservan todas las filas y grupos, con el escudo de cada equipo. Los resultados de competiciones muestran ambos escudos, la fecha y el marcador de cada encuentro, además del emblema de la competición. Los datos ausentes mantienen su indicación y las tablas pueden desplazarse horizontalmente en móvil.

## Entorno

El backend utiliza `.env`: `PORT`, `NGROK_AUTHTOKEN`, `API_SOCCER_KEY` y `FOOTBALL_DATA_API`.

La web utiliza `web/.env.local`: `DIALOGFLOW_PROJECT_ID`, `DIALOGFLOW_LANGUAGE_CODE` y `DIALOGFLOW_AUTH_MODE=adc`. Este modo usa las credenciales locales de Google e ignora `GOOGLE_CLIENT_EMAIL` y `GOOGLE_PRIVATE_KEY`. Los secretos existentes se conservan.

Para autenticar otro equipo con una cuenta que tenga acceso al agente:

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project catenaccio-sqkl
```

Consulta `.env.example` y `web/.env.example`. Las credenciales se mantienen en el servidor, fuera de variables `NEXT_PUBLIC_*`.

## Arranque

Node.js 22.18 o superior. Instala las dependencias si faltan:

```powershell
npm install
npm --prefix web install
```

En tres terminales independientes, desde la raíz:

```powershell
npm start
```

```powershell
npm run tunnel
```

```powershell
npm run web:dev
```

Guarda en **Dialogflow → Fulfillment → Webhook** la URL HTTPS del túnel terminada en `/webhook`. Abre **http://localhost:3001**. Express y ngrok deben mantenerse activos. Para cargar cambios del servidor iniciado con `npm start`, reinícialo; `npm run dev` los recarga automáticamente.

## Consultas de datos

Equipos y jugadores, próximos partidos, resultados, plantillas, previas, competiciones, clasificaciones, estadísticas y comparativas por métrica y temporada. Football-Data es la primera fuente de tablas, partidos y competiciones; API-SOCCER amplía su cobertura y proporciona perfiles y estadísticas de jugadores.

Las comparativas de equipos usan una competición y una fuente comunes; las copas sin clasificación utilizan estadísticas agregadas y no inventan puntos. Las de jugadores consultan siempre la temporada actual de Football-Data, enumeran las ligas incluidas y actualizan ese año en el contexto. Las demás consultas respetan una temporada solicitada. Los valores ausentes se conservan como no disponibles; cuotas, autenticación y cobertura se comunican por separado. Los nombres de proveedores se adaptan sin copiar entidades de Dialogflow.

Las previas muestran el próximo partido y los últimos resultados de cada equipo en tarjetas, con forma reciente calculada de los marcadores. Consulta [los campos y criterios de las APIs](docs/API_DATA.md) para conocer los límites de los datos disponibles.

## Comprobaciones

```powershell
npm test
npm --prefix web run lint
npm run web:build
```

Las pruebas verifican las acciones de datos, parámetros y contextos recibidos, preservación de payloads, fichas con escudos, resultados y plantillas completas, presentación de opciones sin duplicaciones y repetición por sesión. Se ha comprobado la ruta web con bienvenida, menú de equipos, repetición y reinicio del agente real.

Para servir la compilación:

```powershell
npm --prefix web run start -- -p 3001
```

Detalles en [la guía de integración](docs/DIALOGFLOW.md).
