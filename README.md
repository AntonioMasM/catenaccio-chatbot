# Catenaccio Chatbot

Servidor webhook local para **Dialogflow ES**, accesible públicamente mediante un túnel HTTPS de ngrok.

## Requisitos

- Node.js 20 o superior.
- Una cuenta gratuita de [ngrok](https://dashboard.ngrok.com/signup) y su authtoken.

## Instalación

```powershell
npm install
Copy-Item .env.example .env
```

Edita `.env` y añade tu authtoken de ngrok y tu clave de API-SOCCER. El archivo `.env` está excluido de Git:

```dotenv
NGROK_AUTHTOKEN=tu_token_de_ngrok
API_SOCCER_KEY=tu_clave_de_api_soccer
FOOTBALL_DATA_API=tu_token_de_football_data
```

## Uso

Abre dos terminales. En la primera inicia el servidor:

```powershell
npm start
```

En la segunda abre el túnel:

```powershell
npm run tunnel
```

La segunda terminal mostrará `URL para Dialogflow: https://xxxx.ngrok-free.app/webhook`.

En Dialogflow ES ve a **Fulfillment**, activa **Webhook**, pega esa URL y guarda. Después activa **Enable webhook call for this intent** en los intents que usarán el servidor.

La URL gratuita suele cambiar al reiniciar ngrok; si cambia, actualízala en Dialogflow.

## Endpoints

- `GET /health`: comprobación de estado.
- `POST /webhook`: fulfillment de Dialogflow ES; como ejemplo, repite el texto recibido.

## Intent de información de equipos

En `Intent-TeamInformation` configura:

- **Action:** `team.info`
- **Parameter name:** `equipo`
- **Entity:** tu entidad de equipos (por ejemplo, `@equipo`)
- **Value:** `$equipo`
- **Fulfillment:** activa **Enable webhook call for this intent**

Cuando Dialogflow envía el action `team.info`, el servidor consulta `/teams?search=...` en API-SOCCER y responde con el país, año de fundación y estadio disponibles.

Prueba rápida local:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/webhook `
  -ContentType application/json `
  -Body '{"queryResult":{"queryText":"Hola"}}'
```

## Acciones adicionales

Configura estos intents y activa el webhook en cada uno:

| Intent | Action | Parámetro | Entidad |
| --- | --- | --- | --- |
| `Intent-NextMatch` | `team.nextMatch` | `equipo` | `@equipo` |
| `Intent-Standings` | `league.standings` | `competición` | `@competición` |
| `Intent-PlayerInformation` | `player.info` | `jugador` | `@jugador` |

`team.nextMatch` usa Football-Data.org para buscar el equipo y su próximo partido. Los demás actions siguen usando API-SOCCER. `league.standings` selecciona la temporada vigente y devuelve las diez primeras posiciones. El código también acepta `competicion` sin tilde como nombre del parámetro.

`player.info` busca el perfil por nombre y devuelve sus datos personales y deportivos disponibles.

El webhook también reconoce los nombres de los cuatro intents si Dialogflow no envía el campo `action`. Aun así, se recomienda configurar explícitamente el action correspondiente en cada intent.

Para ampliar el bot, añade el método de API necesario en `src/apiSoccer.js` y registra su handler en `src/actions.js`; el endpoint HTTP no necesita cambios.

## Tests

```powershell
npm test
```

## Interfaz Next.js

La aplicación web está en `web/` y envía cada mensaje a Dialogflow ES mediante `detectIntent`, usando el proyecto `catenaccio-sqkl`. Dialogflow reconoce el intent y, si tiene activado el fulfillment, llama al webhook Express. La interfaz recibe la respuesta resultante. No hacen falta claves JSON ni variables de entorno en Next.js para el desarrollo local: autentícate con [Application Default Credentials](https://docs.cloud.google.com/dialogflow/es/docs/quick/setup):

```powershell
gcloud auth application-default login
gcloud auth application-default set-quota-project catenaccio-sqkl
```

La cuenta autenticada debe tener acceso al agente y permiso para invocar la API de Dialogflow. Comprueba también que el idioma principal del agente sea `es` y que la API de Dialogflow esté habilitada en el proyecto.

Ejecuta tres procesos en terminales distintas:

```powershell
npm start
```

```powershell
npm run tunnel
```

```powershell
npm run web:dev
```

En Dialogflow ES, configura **Fulfillment → Webhook** con la URL HTTPS que muestra ngrok, terminada en `/webhook`. Activa **Enable webhook call for this intent** en cada intent y guarda. Abre `http://localhost:3001` para usar la interfaz. El navegador nunca recibe las credenciales de Google ni las claves de las APIs de fútbol.

Para producción:

```powershell
npm run web:build
npm run web:start
```
