import { Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

export interface SearchableSelectOption<T extends string> {
  value: T;
  label: ReactNode;
  searchText?: string;
}

interface SearchableSelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SearchableSelectOption<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  minSearchChars?: number;
  maxResults?: number;
}

function getOptionSearchText(option: SearchableSelectOption<string>): string {
  if (option.searchText) {
    return option.searchText.toLowerCase();
  }

  if (typeof option.label === "string" || typeof option.label === "number") {
    return String(option.label).toLowerCase();
  }

  return option.value.toLowerCase();
}

export function SearchableSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  disabled = false,
  minSearchChars = 0,
  maxResults
}: SearchableSelectProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < minSearchChars) {
      return maxResults ? options.slice(0, maxResults) : options;
    }

    const matchedOptions = options.filter((option) =>
      getOptionSearchText(option).includes(normalizedQuery)
    );
    return maxResults ? matchedOptions.slice(0, maxResults) : matchedOptions;
  }, [maxResults, minSearchChars, options, query]);

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(0);
      return;
    }

    const selectedIndex = filteredOptions.findIndex((option) => option.value === value);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [filteredOptions, open, value]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, [open]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSelect(nextValue: T) {
    onValueChange(nextValue);
    setQuery("");
    setOpen(false);
  }

  function moveHighlight(direction: 1 | -1) {
    if (filteredOptions.length === 0) {
      return;
    }

    setHighlightedIndex((current) =>
      direction === 1
        ? (current + 1) % filteredOptions.length
        : (current - 1 + filteredOptions.length) % filteredOptions.length
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("ui-searchable-select", className)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          moveHighlight(1);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          moveHighlight(-1);
          return;
        }

        if (event.key === "Enter" && open && filteredOptions[highlightedIndex]) {
          event.preventDefault();
          handleSelect(filteredOptions[highlightedIndex].value);
          return;
        }

        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="ui-select-trigger ui-searchable-select-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        role="combobox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn(!selectedOption && "ui-searchable-select-placeholder")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span className="ui-select-icon">
          <ChevronDown aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <div className="ui-searchable-select-content" role="presentation">
          <div className="ui-searchable-select-search">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlightedIndex(0);
              }}
              placeholder={searchPlaceholder}
            />
          </div>
          <div className="ui-searchable-select-list" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="ui-searchable-select-empty">{emptyText}</div>
            ) : (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                const highlighted = filteredOptions[highlightedIndex]?.value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "ui-searchable-select-item",
                      highlighted && "ui-searchable-select-item-active"
                    )}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() =>
                      setHighlightedIndex(
                        filteredOptions.findIndex((candidate) => candidate.value === option.value)
                      )
                    }
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSelect(option.value);
                    }}
                  >
                    <span className="ui-searchable-select-item-label">{option.label}</span>
                    {selected ? (
                      <span className="ui-searchable-select-item-indicator">
                        <Check aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
