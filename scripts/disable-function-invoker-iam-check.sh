#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-officiating-marketplace-487319}"
REGION="${REGION:-us-central1}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

read_lines_into_array() {
  local line
  FUNCTIONS=()
  while IFS= read -r line; do
    if [[ -n "$line" ]]; then
      FUNCTIONS+=("$line")
    fi
  done
}

normalize_service_name() {
  local raw_name="$1"
  printf '%s\n' "${raw_name##*/}"
}

require_command gcloud
require_command perl
require_command mktemp

if [[ $# -gt 0 ]]; then
  FUNCTIONS=("$@")
else
  read_lines_into_array < <(
    gcloud functions list \
      --v2 \
      --regions="$REGION" \
      --project="$PROJECT_ID" \
      --format="value(name)"
  )
fi

if [[ ${#FUNCTIONS[@]} -eq 0 ]]; then
  echo "No 2nd gen functions found in project $PROJECT_ID region $REGION." >&2
  exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Functions:"
printf '  - %s\n' "${FUNCTIONS[@]}"

service_supports_no_invoker_flag() {
  gcloud run services update --help 2>/dev/null | grep -q -- "--no-invoker-iam-check"
}

disable_invoker_check_with_yaml() {
  local service_name="$1"
  local temp_file
  temp_file="$(mktemp "${TMPDIR:-/tmp}/run-service.XXXXXX")"

  gcloud run services describe "$service_name" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format=export > "$temp_file"

  if grep -q "run.googleapis.com/invoker-iam-disabled:" "$temp_file"; then
    perl -0pi -e "s/run\\.googleapis\\.com\\/invoker-iam-disabled:\\s*'?[^'\\n]+'?/run.googleapis.com\\/invoker-iam-disabled: 'true'/g" "$temp_file"
  elif grep -q "^  annotations:$" "$temp_file"; then
    perl -0pi -e "s/^  annotations:\\n/  annotations:\\n    run.googleapis.com\\/invoker-iam-disabled: 'true'\\n/m" "$temp_file"
  else
    perl -0pi -e "s/^metadata:\\n/metadata:\\n  annotations:\\n    run.googleapis.com\\/invoker-iam-disabled: 'true'\\n/m" "$temp_file"
  fi

  gcloud run services replace "$temp_file" \
    --region="$REGION" \
    --project="$PROJECT_ID"

  rm -f "$temp_file"
}

USE_DIRECT_FLAG=0
if service_supports_no_invoker_flag; then
  USE_DIRECT_FLAG=1
fi

for function_name in "${FUNCTIONS[@]}"; do
  service_name="$(
    gcloud functions describe "$function_name" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --format="value(serviceConfig.service)"
  )"
  service_name="$(normalize_service_name "$service_name")"

  if [[ -z "$service_name" ]]; then
    echo "Skipping $function_name: backing Cloud Run service not found." >&2
    continue
  fi

  echo "Disabling Invoker IAM check for $function_name -> $service_name"
  if [[ "$USE_DIRECT_FLAG" -eq 1 ]]; then
    gcloud run services update "$service_name" \
      --region="$REGION" \
      --project="$PROJECT_ID" \
      --no-invoker-iam-check
  else
    disable_invoker_check_with_yaml "$service_name"
  fi
done

echo "Done."
