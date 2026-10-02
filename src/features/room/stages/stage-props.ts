import type { GameAction, RoomView } from '../../../../shared/game';

export interface StageProps {
  room: RoomView;
  disabled: boolean;
  send: (action: GameAction) => Promise<boolean>;
}
