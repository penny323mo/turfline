export const racesPerMeet = 6;
export const pointsByRank = [10, 6, 4, 3, 2, 1];

export const meetNumber = raceNumber => Math.ceil(raceNumber / racesPerMeet);
export const meetRound = raceNumber => (raceNumber - 1) % racesPerMeet + 1;

export function playerCard(game, day) {
  const rounds = Array.from({ length: racesPerMeet }, (_, i) => {
    const number = (day - 1) * racesPerMeet + i + 1;
    const result = game.history.find(race => race.number === number);
    const runner = game.meetPicks?.[number];
    const rank = result && runner != null ? result.order.indexOf(runner) + 1 : 0;
    const net = result ? result.paid - result.stake + (result.latePick?.paid ?? 0) : null;
    return { number, runner, rank, points: pointsByRank[rank - 1] ?? 0, net };
  });
  return {
    rounds,
    points: rounds.reduce((sum, round) => sum + round.points, 0),
    net: rounds.reduce((sum, round) => sum + (round.net ?? 0), 0),
  };
}

export function selectMeetRunner(game, runner) {
  const { number, phase } = game.race;
  if (phase !== "open") throw Error("今場已封盤，心水已鎖定。");
  if (runner !== null && (!Number.isInteger(runner) || runner < 0 || runner >= pointsByRank.length))
    throw Error("請揀一匹出賽馬。");
  const day = meetNumber(number);
  const picks = game.meetPicks ??= {};
  if (runner !== null && Object.entries(picks).some(([key, value]) =>
    Number(key) !== number && meetNumber(Number(key)) === day && value === runner))
    throw Error("呢匹馬今個賽日已用過。");
  for (const key of Object.keys(picks))
    if (Number(key) !== number && !game.history.some(race => race.number === Number(key))) delete picks[key];
  if (runner === null) delete picks[number];
  else picks[number] = runner;
}

export function meetStandings(history, meet) {
  const results = history
    .filter(race => meetNumber(race.number) === meet)
    .sort((a, b) => a.number - b.number);
  const latestOrder = results.at(-1)?.order;
  const rows = pointsByRank.map((_, runner) => {
    let points = 0, wins = 0;
    for (const race of results) {
      const rank = race.order.indexOf(runner);
      points += pointsByRank[rank];
      if (rank === 0) wins++;
    }
    return { runner, points, wins };
  });
  if (latestOrder) rows.sort((a, b) =>
    b.points - a.points || b.wins - a.wins ||
    latestOrder.indexOf(a.runner) - latestOrder.indexOf(b.runner)
  );
  return { rows, completed: results.length, champion: results.length === racesPerMeet ? rows[0] : null };
}

export function availableMeets(history, current) {
  const counts = new Map();
  for (const race of history) {
    const meet = meetNumber(race.number);
    counts.set(meet, (counts.get(meet) ?? 0) + 1);
  }
  return [current, ...[...counts.keys()]
    .filter(meet => meet < current && counts.get(meet) === racesPerMeet)
    .sort((a, b) => b - a)];
}
