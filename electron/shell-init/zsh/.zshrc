# RayLine shell bootstrap for zsh terminals.

RAYLINE_BOOTSTRAP_ZDOTDIR="${ZDOTDIR:-}"
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

if (( ! ${+functions[compdef]} )); then
  autoload -Uz compinit
  compinit -d "${XDG_CACHE_HOME:-$HOME/.cache}/rayline-zcompdump"
fi

rayline_source_first_existing() {
  local candidate
  for candidate in "$@"; do
    if [[ -f "$candidate" ]]; then
      source "$candidate"
      return 0
    fi
  done
  return 1
}

rayline_source_first_existing \
  "${RAYLINE_FZF_SHELL_ROOT:-}/completion.zsh" \
  /opt/homebrew/opt/fzf/shell/completion.zsh \
  /usr/local/opt/fzf/shell/completion.zsh

rayline_source_first_existing \
  "${RAYLINE_FZF_SHELL_ROOT:-}/key-bindings.zsh" \
  /opt/homebrew/opt/fzf/shell/key-bindings.zsh \
  /usr/local/opt/fzf/shell/key-bindings.zsh

: "${FZF_DEFAULT_OPTS:=--height=40% --layout=reverse --border=rounded --color=bg+:#111318,bg:#0d0d10,spinner:#8fd6c2,hl:#89b4fa,fg:#e6edf3,header:#7ed7b9,info:#f5c97a,pointer:#8fd6c2,marker:#f38ba8,fg+:#f5f7fb,hl+:#a6c9ff,prompt:#8fd6c2}"

if [[ -n "${RAYLINE_BOOTSTRAP_ZDOTDIR:-}" && -f "${RAYLINE_BOOTSTRAP_ZDOTDIR:h}/common/smart-cd.sh" ]]; then
  source "${RAYLINE_BOOTSTRAP_ZDOTDIR:h}/common/smart-cd.sh"
fi

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
  PROMPT='%F{250}rayline%f %B%F{117}%1~%f%b$(rayline_git_segment) %F{110}›%f '
fi

PS1="$PROMPT"
RPROMPT=''
