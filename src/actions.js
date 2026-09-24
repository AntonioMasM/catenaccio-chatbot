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

function nextMatchDescription({ fixture, league, teams }) {
  const date = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(fixture.date));
  return `El próximo partido es ${teams.home.name} contra ${teams.away.name}, el ${date}, en ${league.name}.`;
}

function standingsDescription({ league }) {
  const table = league.standings?.[0] ?? [];
  if (!table.length) return `No hay clasificación disponible para ${league.name}.`;
  const rows = table.slice(0, 10).map(({ rank, team, points }) => `${rank}. ${team.name}, ${points} puntos`);
  return `Clasificación de ${league.name}, temporada ${league.season}: ${rows.join("; ")}.`;
}

function createActionHandlers(apiSoccer) {
  return {
    "team.info": async (parameters) => {
      const name = parameter(parameters, "equipo");
      if (!name) return "¿De qué equipo quieres información?";
      const result = await apiSoccer.findTeam(name);
      return result ? teamDescription(result) : `No he encontrado información sobre ${name}. Prueba con el nombre completo.`;
    },
    "team.nextMatch": async (parameters) => {
      const name = parameter(parameters, "equipo");
      if (!name) return "¿De qué equipo quieres conocer el próximo partido?";
      const result = await apiSoccer.getNextMatch(name);
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
  };
}

module.exports = { createActionHandlers, nextMatchDescription, parameter, standingsDescription, teamDescription };
