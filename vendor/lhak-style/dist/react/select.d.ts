import { Select as BaseSelect } from '@base-ui/react/select';
import type { ReactNode } from 'react';
export type SelectItem<Value> = {
    value: Value;
    label: string;
    disabled?: boolean;
};
export type SelectProps<Value> = Omit<BaseSelect.Root.Props<Value, false>, 'items' | 'children' | 'multiple'> & {
    items: readonly SelectItem<Value>[];
    /** A visible label. Without it, name the select with `aria-label`. */
    label?: ReactNode;
    'aria-label'?: string;
    /** Shown while no item is chosen. */
    placeholder?: ReactNode;
    /** Classes for the trigger. */
    className?: string;
};
export declare function Select<Value>({ items, label, 'aria-label': ariaLabel, placeholder, className, ...root }: SelectProps<Value>): import("react").JSX.Element;
