import { avatars } from '../../shared/game';

export function Avatar({
  index,
  large = false,
}: {
  index: number;
  large?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${index % 6} ${large ? 'avatar-large' : ''}`}
      aria-hidden="true"
    >
      {avatars[index]}
    </span>
  );
}
