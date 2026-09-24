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

Configura estos intents y activa el webhook en ambos:

| Intent | Action | Parámetro | Entidad |
| --- | --- | --- | --- |
| `Intent-NextMatch` | `team.nextMatch` | `equipo` | `@equipo` |
| `Intent-Standings` | `league.standings` | `competición` | `@competición` |

`team.nextMatch` devuelve el próximo partido del equipo. `league.standings` selecciona la temporada vigente y devuelve las diez primeras posiciones. El código también acepta `competicion` sin tilde como nombre del parámetro.

Para ampliar el bot, añade el método de API necesario en `src/apiSoccer.js` y registra su handler en `src/actions.js`; el endpoint HTTP no necesita cambios.

## Tests

```powershell
npm test
```
