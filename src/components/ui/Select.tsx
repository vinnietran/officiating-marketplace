import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

const EMPTY_SELECT_VALUE = "__ui_select_empty__";

function encodeSelectValue(value: string): string {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function decodeSelectValue(value: string): string {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled = false
}: SelectProps<T>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root
      value={encodeSelectValue(value)}
      onValueChange={(nextValue) => onValueChange(decodeSelectValue(nextValue) as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger className={cn("ui-select-trigger", className)}>
        <SelectPrimitive.Value placeholder={placeholder}>
          {selectedOption?.label}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ui-select-icon">
          <ChevronDown aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={8}
        >
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={encodeSelectValue(option.value)}
                className="ui-select-item"
              >
                <SelectPrimitive.ItemIndicator className="ui-select-item-indicator">
                  <Check aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
