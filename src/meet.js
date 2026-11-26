export const racesPerMeet = 6;
export const pointsByRank = [10, 6, 4, 3, 2, 1];

export const meetNumber = raceNumber => Math.ceil(raceNumber / racesPerMeet);
export const meetRound = raceNumber => (raceNumber - 1) % racesPerMeet + 1;

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
