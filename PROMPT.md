PR #185 WS-G xterm+Aurora+iframe。GPT-5.5 提：23 var 未定 + xterm 主题切换重建丢状态 + iframe stale。**任务**：
1. 补 23 个 var（src/index.css 双侧）
2. xterm 主题切换：不要 dispose+new Terminal()，改为 term.options.theme = newTheme; term.refresh(0, term.rows-1)
3. iframe：监听 ThemeContext 变化，postMessage 给 iframe 让它自己刷 data-theme，不要 reload
git add . && git commit -m 'fix(theme): WS-G 补 23 var + xterm/iframe 平滑切换' && git push fork pf-ws-g-subsystems:theme/ws-g-subsystems
