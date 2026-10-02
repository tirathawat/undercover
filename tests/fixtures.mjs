export const session = {
  code: 'ABC234',
  playerId: 'player-1',
  token: 'private-token',
};
export const room = {
  code: session.code,
  hostId: session.playerId,
  stageId: 'stage-1',
  phase: 'lobby',
  game: 0,
  round: 0,
  settings: { category: 'mix', undercovers: 1, whiteGuys: 0 },
  players: [
    {
      id: session.playerId,
      name: 'Player',
      avatar: 0,
      connected: true,
      alive: true,
      ready: false,
    },
  ],
  self: { id: session.playerId, word: null, hasVoted: false },
  speakerId: null,
  voteCount: 0,
  voteCandidates: [],
  result: null,
  winner: null,
  words: null,
  history: [],
};
