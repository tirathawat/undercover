import type { Settings } from '../../../shared/game';

export function minimumPlayers(settings: Settings): number {
  return 2 * (settings.undercovers + settings.whiteGuys) + 1;
}
