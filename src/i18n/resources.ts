import { th } from './locales/th.ts';

export const defaultLocale = 'th';
export const resources = { th: { translation: th } } as const;

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type CatalogShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : CatalogShape<T[Key]>;
} & {
  [
    Key in keyof T as T[Key] extends string
      ? `${Key & string}_${PluralCategory}`
      : never
  ]?: string;
};

export type LocaleCatalog = CatalogShape<typeof th>;
