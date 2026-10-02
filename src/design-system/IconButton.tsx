import type { ComponentProps } from 'react';

type IconButtonProps = ComponentProps<'button'> & {
  'aria-label': string;
};

export function IconButton({
  type = 'button',
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`icon-button${className ? ` ${className}` : ''}`}
    />
  );
}
