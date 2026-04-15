import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { UserProfile } from "../types";
import { searchOfficials } from "../lib/officialSearch";

interface SearchableOfficialPickerProps {
  id?: string;
  officials: UserProfile[];
  onSelect: (official: UserProfile) => void;
  placeholder?: string;
  emptyText?: string;
  minSearchChars?: number;
  maxResults?: number;
  debounceMs?: number;
  disabled?: boolean;
  excludeOfficialIds?: Iterable<string>;
  inputAriaLabel?: string;
}

export function SearchableOfficialPicker({
  id,
  officials,
  onSelect,
  placeholder = "Search officials by name",
  emptyText = "No officials found",
  minSearchChars = 2,
  maxResults = 10,
  debounceMs = 300,
  disabled = false,
  excludeOfficialIds,
  inputAriaLabel
}: SearchableOfficialPickerProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [debounceMs, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const trimmedQuery = debouncedQuery.trim();
  const hasMinimumSearch = trimmedQuery.length >= minSearchChars;
  const results = useMemo(
    () =>
      hasMinimumSearch
        ? searchOfficials(officials, trimmedQuery, {
            limit: maxResults,
            excludeOfficialIds
          })
        : [],
    [excludeOfficialIds, hasMinimumSearch, maxResults, officials, trimmedQuery]
  );

  useEffect(() => {
    itemRefs.current = [];
    setHighlightedIndex(0);
  }, [results]);

  function handleSelect(official: UserProfile) {
    onSelect(official);
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
    setHighlightedIndex(0);
  }

  function moveHighlight(direction: 1 | -1) {
    if (results.length === 0) {
      return;
    }

    setOpen(true);
    setHighlightedIndex((current) => {
      const nextIndex =
        direction === 1
          ? (current + 1) % results.length
          : (current - 1 + results.length) % results.length;

      window.setTimeout(() => {
        itemRefs.current[nextIndex]?.scrollIntoView({ block: "nearest" });
      }, 0);

      return nextIndex;
    });
  }

  return (
    <div ref={containerRef} className="official-picker">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={query}
        className="official-picker-input"
        placeholder={placeholder}
        aria-label={inputAriaLabel ?? placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveHighlight(1);
            return;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveHighlight(-1);
            return;
          }

          if (event.key === "Enter" && open && hasMinimumSearch && results[highlightedIndex]) {
            event.preventDefault();
            handleSelect(results[highlightedIndex].official);
            return;
          }

          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />

      {open && !disabled ? (
        <div className="ui-searchable-select-content official-picker-dropdown" role="presentation">
          {!query.trim() ? (
            <div className="ui-searchable-select-empty">
              Type at least {minSearchChars} character{minSearchChars === 1 ? "" : "s"}.
            </div>
          ) : !hasMinimumSearch ? (
            <div className="ui-searchable-select-empty">
              Keep typing to search by official name.
            </div>
          ) : results.length === 0 ? (
            <div className="ui-searchable-select-empty">{emptyText}</div>
          ) : (
            <div id={listboxId} className="ui-searchable-select-list" role="listbox">
              {results.map((result, index) => (
                <button
                  key={result.official.uid}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={highlightedIndex === index}
                  className={`ui-searchable-select-item${
                    highlightedIndex === index ? " ui-searchable-select-item-active" : ""
                  }`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleSelect(result.official);
                  }}
                >
                  <span className="ui-searchable-select-item-label ui-searchable-select-option">
                    <span className="ui-searchable-select-option-title">
                      {result.official.displayName}
                    </span>
                    <span className="ui-searchable-select-option-meta">{result.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
