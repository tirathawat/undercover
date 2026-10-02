import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({
  variant = 'primary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`button ${variant}${className ? ` ${className}` : ''}`}
    />
  );
}
