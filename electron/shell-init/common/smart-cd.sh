# Shared smart-cd helpers for RayLine shells.

rayline_command_exists() {
  command -v "$1" >/dev/null 2>&1
}

rayline_shorten_path() {
  case "$1" in
    "$HOME")
      printf '~\n'
      ;;
    "$HOME"/*)
      printf '~/%s\n' "${1#"$HOME"/}"
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

rayline_make_tmpfile() {
  mktemp "${TMPDIR:-/tmp}/rayline-cd.XXXXXX"
}

rayline_build_child_candidates() {
  local root="$1"
  local outfile="$2"

  : > "$outfile"
  [ -d "$root" ] || return 0

  find "$root" -mindepth 1 -maxdepth 1 -type d \
    ! -name ".git" \
    ! -name "node_modules" \
    ! -name ".next" \
    ! -name "dist" \
    ! -name "build" \
    ! -name ".cache" \
    ! -name ".turbo" \
    2>/dev/null | LC_ALL=C sort | while IFS= read -r dir_path; do
      [ -n "$dir_path" ] || continue
      printf '%s\t%s\n' "${dir_path##*/}" "$dir_path"
    done > "$outfile"
}

rayline_build_descendant_candidates() {
  local root="$1"
  local maxdepth="$2"
  local outfile="$3"
  local visible_only="${4:-0}"
  local relative_path=""

  : > "$outfile"
  [ -d "$root" ] || return 0

  find "$root" -mindepth 1 -maxdepth "$maxdepth" -type d \
    ! -name ".git" \
    ! -path "*/.git/*" \
    ! -name "node_modules" \
    ! -path "*/node_modules/*" \
    ! -name ".next" \
    ! -path "*/.next/*" \
    ! -name "dist" \
    ! -path "*/dist/*" \
    ! -name "build" \
    ! -path "*/build/*" \
    ! -name ".cache" \
    ! -path "*/.cache/*" \
    ! -name ".turbo" \
    ! -path "*/.turbo/*" \
    ! -name ".Trash" \
    ! -path "*/.Trash/*" \
    ! -name "Library" \
    ! -path "*/Library/*" \
    2>/dev/null | LC_ALL=C sort | while IFS= read -r dir_path; do
      [ -n "$dir_path" ] || continue
      relative_path="${dir_path#"$root"/}"
      if [ "$visible_only" = "1" ]; then
        case "$relative_path" in
          .*|*/.*)
            continue
            ;;
        esac
      fi
      printf '%s\t%s\n' "${dir_path##*/}" "$dir_path"
    done > "$outfile"
}

rayline_pick_descendant_match() {
  local root="$1"
  local maxdepth="$2"
  local query="$3"
  local visible_only="${4:-0}"
  local descendant_candidates=""
  local selected=""

  descendant_candidates=$(rayline_make_tmpfile) || return 1
  rayline_build_descendant_candidates "$root" "$maxdepth" "$descendant_candidates" "$visible_only"
  selected=$(rayline_pick_candidate_from_file "$query" "$descendant_candidates")
  rm -f "$descendant_candidates"

  [ -n "$selected" ] || return 1
  printf '%s\n' "$selected"
}

rayline_pick_unique_pattern_match() {
  local mode="$1"
  local query="$2"
  local file="$3"

  awk -F '\t' -v query="$query" -v mode="$mode" '
    BEGIN {
      q = tolower(query)
      count = 0
    }
    {
      name = tolower($1)
      matched = 0
      if (mode == "exact" && name == q) {
        matched = 1
      } else if (mode == "prefix" && q != "" && index(name, q) == 1) {
        matched = 1
      } else if (mode == "contains" && q != "" && index(name, q) > 0) {
        matched = 1
      }
      if (matched) {
        count += 1
        path = $2
      }
    }
    END {
      if (count == 1) {
        print path
      }
    }
  ' "$file"
}

rayline_pick_unique_fzf_filter_match() {
  local query="$1"
  local file="$2"
  local names
  local count

  [ -n "$query" ] || return 1
  rayline_command_exists fzf || return 1

  names=$(awk -F '\t' '{ print $1 }' "$file" | command fzf --filter "$query" 2>/dev/null) || return 1
  [ -n "$names" ] || return 1

  count=$(printf '%s\n' "$names" | awk 'NF { c += 1 } END { print c + 0 }')
  [ "$count" -eq 1 ] || return 1

  awk -F '\t' -v picked="$names" '
    BEGIN {
      want = tolower(picked)
      count = 0
    }
    tolower($1) == want {
      count += 1
      path = $2
    }
    END {
      if (count == 1) {
        print path
      }
    }
  ' "$file"
}

rayline_pick_unique_distance_match() {
  local query="$1"
  local file="$2"

  awk -F '\t' -v query="$query" '
    function min4(a, b, c, d, out) {
      out = a
      if (b < out) out = b
      if (c < out) out = c
      if (d < out) out = d
      return out
    }
    function damerau(a, b,   i, j, ca, cb, del, ins, subst, trans) {
      a = tolower(a)
      b = tolower(b)
      delete dist
      for (i = 0; i <= length(a); i++) {
        dist[i SUBSEP 0] = i
      }
      for (j = 0; j <= length(b); j++) {
        dist[0 SUBSEP j] = j
      }
      for (i = 1; i <= length(a); i++) {
        ca = substr(a, i, 1)
        for (j = 1; j <= length(b); j++) {
          cb = substr(b, j, 1)
          del = dist[(i - 1) SUBSEP j] + 1
          ins = dist[i SUBSEP (j - 1)] + 1
          subst = dist[(i - 1) SUBSEP (j - 1)] + (ca == cb ? 0 : 1)
          trans = 9999
          if (i > 1 && j > 1 && ca == substr(b, j - 1, 1) && substr(a, i - 1, 1) == cb) {
            trans = dist[(i - 2) SUBSEP (j - 2)] + 1
          }
          dist[i SUBSEP j] = min4(del, ins, subst, trans)
        }
      }
      return dist[length(a) SUBSEP length(b)]
    }
    BEGIN {
      q = tolower(query)
      bestDist = 9999
      secondDist = 9999
      bestCount = 0
      bestPath = ""
    }
    {
      current = damerau(q, $1)
      if (current < bestDist) {
        secondDist = bestDist
        bestDist = current
        bestPath = $2
        bestCount = 1
      } else if (current == bestDist) {
        bestCount += 1
      } else if (current < secondDist) {
        secondDist = current
      }
    }
    END {
      qlen = length(q)
      threshold = (qlen <= 4 ? 1 : (qlen <= 8 ? 2 : 3))
      if (bestCount == 1 && bestDist <= threshold && (secondDist == 9999 || secondDist > bestDist)) {
        print bestPath
      }
    }
  ' "$file"
}

rayline_pick_candidate_from_file() {
  local query="$1"
  local file="$2"
  local selected=""

  selected=$(rayline_pick_unique_pattern_match exact "$query" "$file")
  [ -n "$selected" ] && printf '%s\n' "$selected" && return 0

  selected=$(rayline_pick_unique_pattern_match prefix "$query" "$file")
  [ -n "$selected" ] && printf '%s\n' "$selected" && return 0

  selected=$(rayline_pick_unique_pattern_match contains "$query" "$file")
  [ -n "$selected" ] && printf '%s\n' "$selected" && return 0

  selected=$(rayline_pick_unique_fzf_filter_match "$query" "$file")
  [ -n "$selected" ] && printf '%s\n' "$selected" && return 0

  selected=$(rayline_pick_unique_distance_match "$query" "$file")
  [ -n "$selected" ] && printf '%s\n' "$selected" && return 0

  return 1
}

rayline_resolve_cd_target() {
  local raw="$1"
  local current=""
  local remainder=""
  local segment=""
  local next=""
  local child_candidates=""
  local selected=""
  local single_segment="1"
  local descendant_depth="3"

  case "$raw" in
    /)
      printf '/\n'
      return 0
      ;;
    /*)
      current="/"
      remainder="${raw#/}"
      ;;
    "~")
      printf '%s\n' "$HOME"
      return 0
      ;;
    "~"/*)
      current="$HOME"
      remainder="${raw#~/}"
      ;;
    *)
      current="$PWD"
      remainder="$raw"
      ;;
  esac

  case "$remainder" in
    */*)
      single_segment="0"
      ;;
  esac

  while :; do
    case "$remainder" in
      */*)
        segment="${remainder%%/*}"
        remainder="${remainder#*/}"
        ;;
      *)
        segment="$remainder"
        remainder=""
        ;;
    esac

    [ -n "$segment" ] || {
      [ -n "$remainder" ] && continue
      break
    }

    case "$segment" in
      .)
        ;;
      ..)
        current=$(cd "$current/.." 2>/dev/null && pwd -P) || return 1
        ;;
      *)
        if [ "$current" = "/" ]; then
          next="/$segment"
        else
          next="$current/$segment"
        fi

        if [ -d "$next" ]; then
          current="$next"
        else
          child_candidates=$(rayline_make_tmpfile) || return 1
          rayline_build_child_candidates "$current" "$child_candidates"
          selected=$(rayline_pick_candidate_from_file "$segment" "$child_candidates")
          rm -f "$child_candidates"

          if [ -n "$selected" ]; then
            current="$selected"
          elif [ "$single_segment" = "1" ] && [ "$current" != "/" ]; then
            if [ "$current" = "$PWD" ] || [ "$current" = "$HOME" ]; then
              descendant_depth="3"
            else
              descendant_depth="2"
            fi

            if [ "$current" = "$HOME" ]; then
              selected=$(rayline_pick_descendant_match "$current" "$descendant_depth" "$segment" "1")
            else
              selected=$(rayline_pick_descendant_match "$current" "$descendant_depth" "$segment")
            fi

            if [ -z "$selected" ] && [ "$HOME" != "$current" ] && [ -d "$HOME" ]; then
              selected=$(rayline_pick_descendant_match "$HOME" "3" "$segment" "1")
            fi

            [ -n "$selected" ] || return 1
            current="$selected"
          else
            return 1
          fi
        fi
        ;;
    esac

    [ -n "$remainder" ] || break
  done

  [ -d "$current" ] || return 1
  printf '%s\n' "$current"
}

rayline_smart_cd() {
  local target="$1"
  local resolved=""

  if [ "$#" -ne 1 ]; then
    builtin cd "$@"
    return $?
  fi

  case "$target" in
    -)
      builtin cd "$@"
      return $?
      ;;
    -*)
      builtin cd "$@"
      return $?
      ;;
  esac

  builtin cd -- "$target" 2>/dev/null && return 0

  resolved=$(rayline_resolve_cd_target "$target") || {
    printf 'cd: no such file or directory: %s\n' "$target" >&2
    return 1
  }

  [ -n "$resolved" ] && [ -d "$resolved" ] || {
    printf 'cd: no such file or directory: %s\n' "$target" >&2
    return 1
  }

  printf 'rayline: cd -> %s\n' "$(rayline_shorten_path "$resolved")" >&2
  builtin cd -- "$resolved"
}

cd() {
  rayline_smart_cd "$@"
}
