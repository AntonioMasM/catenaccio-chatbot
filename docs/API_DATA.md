# Datos utilizados en las comparaciones

## Onces del último partido

Las acciones `team.results` y `league.results` incorporan `latestLineup` en la tarjeta de resultados. El partido seleccionado es siempre el de fecha más reciente dentro de los resultados solicitados. Se consulta `/matches/{id}` de Football-Data y, si faltan los onces, `/fixtures` y `/fixtures/lineups` de API-SOCCER. La equivalencia exige los nombres normalizados de ambos equipos y la misma hora de inicio; los identificadores de los proveedores son independientes. No se consultan temporadas alternativas para suplir alineaciones ausentes.

Se valida que cada equipo tenga 11 jugadores distintos y se excluyen los suplentes. La vista utiliza `grid` cuando está disponible. Si solo hay formación o posiciones, se muestra una distribución orientativa de los titulares confirmados. Los datos incompletos o las restricciones de acceso mantienen los resultados y muestran la falta de alineaciones, sin utilizar la plantilla actual como sustituto.

Comprobación real del 18/10/2026: Football-Data devolvió AS Roma–Real Madrid CF del 14/10/2026 a las 19:00 UTC, ID 575352, sin alineaciones en la lista ni en el detalle. API-SOCCER rechazó esa fecha e indicó que la clave Free solo permitía fechas del 17 al 19 de octubre. Esto confirma que el último partido no siempre tiene cobertura con las claves actuales; la integración se activa cuando los proveedores sí devuelven los datos.

Referencias: [Football-Data, detalle del partido](https://docs.football-data.org/general/v4/match.html), [API-FOOTBALL, alineaciones](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

## Comprobación de tu cuenta

El 6 de octubre de 2026, `/status` de API-SOCCER confirmó el plan Free con 100 consultas diarias. La propia respuesta de `/players` indica que esta cuenta permite estadísticas de las temporadas 2022, 2023 y 2024. El catálogo de temporadas de un jugador incluye años adicionales, por lo que no representa por sí solo la cobertura de la suscripción.

El código obtiene el rango permitido del error del proveedor; no fija esos años en constantes. Conserva esa información cinco minutos y evita repetir consultas a años bloqueados. Los resultados correctos mantienen la caché existente.

## Jugadores

El 7 de octubre de 2026 se comprobó que la cuenta de Football-Data permite consultar la tabla de goleadores de La Liga 2026/27. La respuesta incluye goles, asistencias y partidos jugados. El recurso de partidos de una persona responde con una lista, pero indica que sus agregados (incluidos los minutos) requieren una suscripción de pago.

Las comparativas utilizan exclusivamente las tablas actuales de goleadores de Football-Data con `limit=100`, sin enviar `season`. Se ignora una temporada anterior recibida o conservada en el contexto. Las estadísticas individuales intentan primero Football-Data y respetan el año solicitado. Sin competición, se busca de forma acotada en las competiciones accesibles de La Liga, Premier League, Bundesliga, Serie A y Ligue 1, deteniéndose al encontrar a los participantes. Se muestra el ámbito concreto; una competición por jugador no representa toda su actividad. No se interpreta la ausencia en una tabla limitada como cero goles.

Las comparativas muestran únicamente goles, asistencias y partidos, sin minutos ni ratios, y no recurren a API-SOCCER cuando faltan datos actuales. Las consultas individuales de estadísticas conservan la cobertura de API-SOCCER para jugadores o métricas que falten en Football-Data. La tabla siguiente recoge los campos de ambos clientes; las métricas de minutos y tasas solo se usan en estadísticas individuales.

| Métrica | Football-Data / API-SOCCER |
| --- | --- |
| Goles | `scorers[].goals` / `statistics[].goals.total` |
| Asistencias | `scorers[].assists` / `statistics[].goals.assists` |
| Partidos | `scorers[].playedMatches` / `statistics[].games.appearences` |
| Minutos | No disponibles en goleadores / `statistics[].games.minutes` |
| Goles por 90 | Goles × 90 / minutos |
| Asistencias por 90 | Asistencias × 90 / minutos |

Se resuelve el ID desde `/players/profiles` utilizando todos los términos del nombre, con prioridad al nombre exacto. La búsqueda del apellido omite acentos para admitir nombres como Mbappé; la resolución conserva el nombre completo. Football-Data usa la misma lógica de identidad sobre los registros de goleadores. Una coincidencia parcial de apellido no sustituye al jugador solicitado. Los homónimos sin una resolución inequívoca requieren un nombre más preciso. Se comprueba también el ID y el año de los registros de estadísticas cuando esos campos están presentes.

El cliente de API-SOCCER conserva su selección de temporadas accesibles para otras consultas, pero no se utiliza para estadísticas en la acción `compare.players`. La temporada actual de Football-Data se guarda en el parámetro temporada de los contextos recibidos que lo contienen, conservando sus duraciones.

En las comparativas actuales se indican las competiciones y los periodos facilitados por Football-Data: una liga por año natural y otra por temporada partida pueden utilizar el mismo año inicial y abarcar fechas distintas.

Los ceros conocidos se conservan. Los valores ausentes permanecen como no disponibles. No se calcula un ratio con cero minutos ni se sustituye una asistencia desconocida por cero. Los agregados de varias participaciones usan el total de minutos, no la media de ratios individuales. Se evita declarar una diferencia que no se aprecia al redondear los valores presentados.

El proveedor puede entregar otros campos, como tiros, pases, duelos o tarjetas, dependiendo de la cobertura. Este proyecto utiliza las métricas de la tabla; no anuncia esas otras métricas como consultas implementadas.

## Equipos

Football-Data es la primera fuente. Se obtienen los datos de la clasificación general para la competición y temporada indicadas. Si falta cobertura, se consulta API-SOCCER para ambos participantes: no se combinan los datos de un equipo de una fuente con los del otro de una fuente distinta.

| Métrica | Fuente |
| --- | --- |
| Puntos | Tabla de clasificación; nunca se estiman |
| Partidos, victorias, empates y derrotas | Tabla o estadísticas agregadas del equipo |
| Goles a favor y en contra | Tabla o totales de goles de la competición |
| Diferencia de goles | Tabla o diferencia calculada de dos totales conocidos |

Los puntos requieren una tabla común. Para competiciones sin clasificación o grupos no compartidos, API-SOCCER permite utilizar `/teams/statistics` con equipo, competición y temporada. En ese caso se comparan los totales de partidos y goles y los puntos quedan como no disponibles. Se comprueba que las estadísticas correspondan al equipo, competición y año solicitados.

Football-Data ofrece una lista de goleadores con goles, asistencias y partidos, utilizada para las consultas de jugadores con cobertura. No equivale a un catálogo de estadísticas completo de todos los futbolistas ni proporciona los minutos necesarios para los ratios utilizados aquí. No se asigna un cero a un jugador porque no aparezca en esa lista. Las fotos proceden de API-SOCCER y se incorporan a fichas, estadísticas y comparativas sin mezclar métricas entre fuentes; se comprueba la fecha de nacimiento cuando ambas fuentes la proporcionan.

## Previas

Se obtiene el siguiente partido y hasta cinco resultados recientes por equipo. La interfaz muestra el encuentro, marcadores y forma reciente en bloques separados. Los indicadores V/E/D se calculan de los marcadores recibidos y de la identidad del equipo; no son predicciones. Los datos ausentes se presentan explícitamente. Las respuestas antiguas con más resultados conservan los restantes en un bloque desplegable.

## Límites prácticos

El webhook conserva su presupuesto de 4,2 segundos y cada petición tiene un timeout de 1,8 segundos. Las búsquedas se agrupan y reutilizan cachés; una consulta fría con cambio de fuente puede agotar ese presupuesto. Autenticación, cuotas, datos ausentes y restricciones de temporada producen respuestas distintas. No hay reintentos de otros años ante un error de cuota o autenticación.

Referencias: [guía oficial de API-FOOTBALL](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [clasificaciones y goleadores de Football-Data](https://docs.football-data.org/general/v4/competition.html).
