
import type { SVGProps } from 'react';
import type { IconName } from './provider-icons/types';

const sprite = `${import.meta.env.BASE_URL}provider-icons/sprite.svg`;

export type ProviderIconProps = Omit<SVGProps<SVGSVGElement>, 'id'> & {
  id: IconName;
};

export function ProviderIcon({ id, className, ...rest }: ProviderIconProps) {
  return (
    <svg data-component="provider-icon" {...rest} className={className}>
      <use href={`${sprite}#${id}`} />
    </svg>
  );
}
