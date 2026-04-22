# RayLine shell bootstrap for zsh terminals.

export ZDOTDIR="${RAYLINE_ORIG_ZDOTDIR:-$HOME}"
export CLICOLOR=1
export CLICOLOR_FORCE=1
export COLORTERM=truecolor
export FORCE_COLOR=1
export TERM_PROGRAM="RayLine"
export CONDA_CHANGEPS1=false
export VIRTUAL_ENV_DISABLE_PROMPT=1
export PROMPT_EOL_MARK=""
export DISABLE_AUTO_TITLE=true

if [[ -n "${RAYLINE_ORIG_ZSHRC:-}" && -f "${RAYLINE_ORIG_ZSHRC}" ]]; then
  source "${RAYLINE_ORIG_ZSHRC}"
fi

autoload -Uz colors && colors
setopt PROMPT_SUBST

rayline_git_segment() {
  local branch
  local branch_display
  branch=$(command git branch --show-current 2>/dev/null)
  if [[ -z "$branch" ]]; then
    branch=$(command git rev-parse --short HEAD 2>/dev/null)
  fi
  branch_display="${branch##*/}"
  if (( ${#branch_display} > 18 )); then
    branch_display="${branch_display[1,15]}..."
  fi
  [[ -n "$branch_display" ]] && printf ' %%F{244}[%s]%%f' "$branch_display"
}

if [[ "${RAYLINE_PROMPT_MODE:-compact}" == "minimal" ]]; then
  PROMPT='%B%F{117}%1~%f%b %F{110}›%f '
else
  PROMPT='%F{250}ray%f %B%F{117}%1~%f%b$(rayline_git_segment) %F{110}›%f '
fi

PS1="$PROMPT"
RPROMPT=''
