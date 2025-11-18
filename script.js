// install: npm i neo4j-driver node-fetch
import fetch from 'node-fetch';
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password')
);

const TEAM_PLAYER_IDS = [123456789, 987654321]; // твои 5–7 ID

async function fetchPlayerMatches(accountId, limit = 50) {
  const url = `https://api.opendota.com/api/players/${accountId}/matches?limit=${limit}`;
  const res = await fetch(url);
  return await res.json();
}

async function upsertMatchAndPlayer(session, accountId, match) {
  const { match_id, hero_id, kills, deaths, assists, duration, start_time, player_slot, radiant_win } = match;

  const win =
    (player_slot < 128 && radiant_win === true) ||
    (player_slot >= 128 && radiant_win === false);

  await session.writeTransaction(tx =>
    tx.run(
      `
      MERGE (p:Player {account_id: $accountId})
      MERGE (m:Match {match_id: $matchId})
        ON CREATE SET m.duration = $duration,
                      m.start_time = datetime({epochSeconds: $startTime}),
                      m.radiant_win = $radiantWin
      MERGE (p)-[r:PLAYED_IN]->(m)
        ON CREATE SET r.kills = $kills,
                      r.deaths = $deaths,
                      r.assists = $assists,
                      r.hero_id = $heroId,
                      r.win = $win
      `,
      {
        accountId,
        matchId: neo4j.int(match_id),
        duration: neo4j.int(duration),
        startTime: neo4j.int(start_time),
        radiantWin: radiant_win,
        kills: neo4j.int(kills),
        deaths: neo4j.int(deaths),
        assists: neo4j.int(assists),
        heroId: neo4j.int(hero_id),
        win
      }
    )
  );
}

async function main() {
  const session = driver.session();

  try {
    for (const accountId of TEAM_PLAYER_IDS) {
      const matches = await fetchPlayerMatches(accountId, 50);
      for (const m of matches) {
        await upsertMatchAndPlayer(session, accountId, m);
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
