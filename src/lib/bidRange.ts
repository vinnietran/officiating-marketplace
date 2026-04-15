import { formatCurrency } from "./format";

export interface BidRangeValueInput {
  minBidAmount?: number | null;
  maxBidAmount?: number | null;
}

export interface BidRangeFormInput {
  minBidAmount: string;
  maxBidAmount: string;
}

export interface BidRangeFormErrors {
  minBidAmount: string | null;
  maxBidAmount: string | null;
}

export interface NormalizedBidRange {
  minBidAmount: number;
  maxBidAmount: number;
}

export interface BidRangeEvaluation {
  hasPreferredRange: boolean;
  isOutsidePreferredRange: boolean;
  direction: "below" | "within" | "above" | "none";
  warning: string | null;
  rangeLabel: string | null;
}

const BOTH_RANGE_VALUES_REQUIRED_MESSAGE =
  "Enter both minimum and maximum preferred bid amounts.";

export function normalizeBidRange(input: BidRangeValueInput): NormalizedBidRange | null {
  const minBidAmount =
    typeof input.minBidAmount === "number" && Number.isFinite(input.minBidAmount)
      ? input.minBidAmount
      : null;
  const maxBidAmount =
    typeof input.maxBidAmount === "number" && Number.isFinite(input.maxBidAmount)
      ? input.maxBidAmount
      : null;

  if (minBidAmount === null || maxBidAmount === null) {
    return null;
  }

  if (minBidAmount < 0 || maxBidAmount <= 0 || maxBidAmount < minBidAmount) {
    return null;
  }

  return { minBidAmount, maxBidAmount };
}

export function getBidRangeFormErrors(input: BidRangeFormInput): BidRangeFormErrors {
  const minValue = input.minBidAmount.trim();
  const maxValue = input.maxBidAmount.trim();

  if (!minValue && !maxValue) {
    return {
      minBidAmount: null,
      maxBidAmount: null
    };
  }

  if (!minValue || !maxValue) {
    return {
      minBidAmount: BOTH_RANGE_VALUES_REQUIRED_MESSAGE,
      maxBidAmount: BOTH_RANGE_VALUES_REQUIRED_MESSAGE
    };
  }

  const parsedMin = Number(minValue);
  const parsedMax = Number(maxValue);

  if (!Number.isFinite(parsedMin)) {
    return {
      minBidAmount: "Enter a valid minimum preferred bid.",
      maxBidAmount: null
    };
  }

  if (!Number.isFinite(parsedMax)) {
    return {
      minBidAmount: null,
      maxBidAmount: "Enter a valid maximum preferred bid."
    };
  }

  if (parsedMin < 0) {
    return {
      minBidAmount: "Minimum preferred bid must be zero or greater.",
      maxBidAmount: null
    };
  }

  if (parsedMax <= 0) {
    return {
      minBidAmount: null,
      maxBidAmount: "Maximum preferred bid must be greater than 0."
    };
  }

  if (parsedMax < parsedMin) {
    return {
      minBidAmount: null,
      maxBidAmount: "Maximum preferred bid must be greater than or equal to the minimum."
    };
  }

  return {
    minBidAmount: null,
    maxBidAmount: null
  };
}

export function buildBidRangeSubmission(input: BidRangeFormInput): BidRangeValueInput {
  const errors = getBidRangeFormErrors(input);

  if (errors.minBidAmount || errors.maxBidAmount) {
    throw new Error(errors.minBidAmount ?? errors.maxBidAmount ?? "Invalid bid range.");
  }

  const minValue = input.minBidAmount.trim();
  const maxValue = input.maxBidAmount.trim();

  if (!minValue && !maxValue) {
    return {};
  }

  return {
    minBidAmount: Number(minValue),
    maxBidAmount: Number(maxValue)
  };
}

export function getExpectedBidRangeLabel(input: BidRangeValueInput): string | null {
  const range = normalizeBidRange(input);
  if (!range) {
    return null;
  }

  return `${formatCurrency(range.minBidAmount)} - ${formatCurrency(range.maxBidAmount)}`;
}

export function evaluateBidAgainstPreferredRange(
  amount: number,
  input: BidRangeValueInput
): BidRangeEvaluation {
  const range = normalizeBidRange(input);
  const rangeLabel = range ? getExpectedBidRangeLabel(range) : null;

  if (!range || !Number.isFinite(amount)) {
    return {
      hasPreferredRange: false,
      isOutsidePreferredRange: false,
      direction: "none",
      warning: null,
      rangeLabel
    };
  }

  if (amount < range.minBidAmount) {
    return {
      hasPreferredRange: true,
      isOutsidePreferredRange: true,
      direction: "below",
      warning: "This bid is outside the creator's preferred range.",
      rangeLabel
    };
  }

  if (amount > range.maxBidAmount) {
    return {
      hasPreferredRange: true,
      isOutsidePreferredRange: true,
      direction: "above",
      warning: "This bid is outside the creator's preferred range.",
      rangeLabel
    };
  }

  return {
    hasPreferredRange: true,
    isOutsidePreferredRange: false,
    direction: "within",
    warning: null,
    rangeLabel
  };
}
