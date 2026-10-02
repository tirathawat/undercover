import type { StageProps } from './stage-props';
import { ClueStage } from './ClueStage';
import { FinishedStage } from './FinishedStage';
import { GuessStage } from './GuessStage';
import { LobbyStage } from './LobbyStage';
import { ResultStage } from './ResultStage';
import { RevealStage } from './RevealStage';
import { VoteStage } from './VoteStage';

export type { StageProps } from './stage-props';

export function Stage(props: StageProps) {
  switch (props.room.phase) {
    case 'lobby':
      return <LobbyStage {...props} />;
    case 'reveal':
      return <RevealStage {...props} />;
    case 'clue':
      return <ClueStage {...props} />;
    case 'vote':
      return <VoteStage {...props} />;
    case 'guess':
      return <GuessStage {...props} />;
    case 'result':
      return <ResultStage {...props} />;
    case 'finished':
      return <FinishedStage {...props} />;
  }
  const phase: never = props.room.phase;
  return phase;
}
