function parameter(parameters, ...names) {
  const value = names.map((name) => parameters?.[name]).find((item) => item != null);
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

function teamDescription({ team, venue }) {
  const facts = [`${team.name} es un equipo de ${team.country}`];
  if (team.founded) facts.push(`fue fundado en ${team.founded}`);
  if (venue?.name) facts.push(`juega en ${venue.name}${venue.city ? `, en ${venue.city}` : ""}`);
  return `${facts.join("; ")}.`;
}

function nextMatchDescription({ utcDate, competition, homeTeam, awayTeam }) {
  const date = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(utcDate));
  return `El próximo partido es ${homeTeam.name} contra ${awayTeam.name}, el ${date}, en ${competition.name}.`;
}

function standingsDescription({ league }) {
  const table = league.standings?.[0] ?? [];
  if (!table.length) return `No hay clasificación disponible para ${league.name}.`;
  const rows = table.slice(0, 10).map(({ rank, team, points }) => `${rank}. ${team.name}, ${points} puntos`);
  return `Clasificación de ${league.name}, temporada ${league.season}: ${rows.join("; ")}.`;
}

function playerDescription(result) {
  const player = result.player ?? result;
  const facts = [player.name];
  if (player.age) facts.push(`tiene ${player.age} años`);
  if (player.nationality) facts.push(`es de nacionalidad ${player.nationality}`);
  if (player.position) facts.push(`juega como ${player.position}`);
  if (player.height) facts.push(`mide ${player.height}`);
  return `${facts.join("; ")}.`;
}

function teamCard({ team, venue }) {
  return {
    type: "team", title: team.name, imageUrl: team.logo || venue?.image || "",
    imageAlt: `Escudo de ${team.name}`,
    fields: [
      team.country && { label: "País", value: team.country },
      team.founded && { label: "Fundación", value: String(team.founded) },
      venue?.name && { label: "Estadio", value: venue.name },
      venue?.city && { label: "Ciudad", value: venue.city },
      venue?.capacity && { label: "Capacidad", value: Number(venue.capacity).toLocaleString("es-ES") },
    ].filter(Boolean),
  };
}

function playerCard(result) {
  const player = result.player ?? result;
  const birth = player.birth ?? {};
  return {
    type: "player", title: player.name, imageUrl: player.photo || "",
    imageAlt: `Foto de ${player.name}`,
    fields: [
      player.firstname && player.lastname && { label: "Nombre completo", value: `${player.firstname} ${player.lastname}` },
      player.age && { label: "Edad", value: `${player.age} años` },
      player.nationality && { label: "Nacionalidad", value: player.nationality },
      player.position && { label: "Posición", value: player.position },
      player.height && { label: "Altura", value: player.height },
      player.weight && { label: "Peso", value: player.weight },
      birth.date && { label: "Nacimiento", value: birth.date },
      birth.place && { label: "Lugar", value: birth.country ? `${birth.place}, ${birth.country}` : birth.place },
    ].filter(Boolean),
  };
}

function createActionHandlers(apiSoccer, footballData) {
  return {
    "team.info": async (parameters) => {
      const name = parameter(parameters, "equipo");
      if (!name) return "¿De qué equipo quieres información?";
      const result = await apiSoccer.findTeam(name);
      return result ? { text: teamDescription(result), richResponse: teamCard(result) } : `No he encontrado información sobre ${name}. Prueba con el nombre completo.`;
    },
    "team.nextMatch": async (parameters) => {
      const name = parameter(parameters, "equipo");
      if (!name) return "¿De qué equipo quieres conocer el próximo partido?";
      const result = await footballData.getNextMatch(name);
      return result ? nextMatchDescription(result) : `No he encontrado próximos partidos para ${name}.`;
    },
    "league.standings": async (parameters) => {
      const name = parameter(parameters, "competición", "competicion");
      if (!name) return "¿De qué competición quieres ver la clasificación?";
      const result = await apiSoccer.getStandings(name);
      return result
        ? standingsDescription(result)
        : `No he encontrado una temporada vigente con clasificación disponible para ${name}.`;
    },
    "player.info": async (parameters) => {
      const name = parameter(parameters, "jugador");
      if (!name) return "¿De qué jugador quieres información?";
      const result = await apiSoccer.findPlayer(name);
      return result
        ? { text: playerDescription(result), richResponse: playerCard(result) }
        : `No he encontrado información sobre ${name}. Prueba con su nombre completo.`;
    },
  };
}

module.exports = {
  createActionHandlers,
  nextMatchDescription,
  parameter,
  playerCard,
  playerDescription,
  standingsDescription,
  teamDescription,
  teamCard,
};
