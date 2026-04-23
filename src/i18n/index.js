const DEFAULT_LOCALE = "en-US";

const STRINGS = {
  "en-US": {
    "chromeRail.collapseSidebar": "Collapse sidebar",
    "chromeRail.expandSidebar": "Expand sidebar",
    "chromeRail.newChat": "New chat",
    "sidebar.newChat": "New Chat",
    "sidebar.dispatch": "Dispatch",
    "sidebar.newProject": "New Project",
    "sidebar.githubProjects": "GitHub Projects",
    "sidebar.search": "Search",
    "sidebar.searchPlaceholder": "Search...",
    "sidebar.noConversations": "NO CONVERSATIONS",
    "sidebar.noConversationsHint": "Start typing to begin",
    "sidebar.drafts": "DRAFTS",
    "settings.title": "Settings",
    "settings.appearance": "APPEARANCE",
    "settings.language": "Language",
    "settings.languageDescription": "Switch the app interface language.",
    "settings.languageEnglish": "English",
    "settings.languageChinese": "简体中文",
    "settings.wallpaper": "Wallpaper",
    "settings.wallpaperDescription": "Set a custom background image",
    "settings.chooseImage": "Choose Image",
    "settings.remove": "Remove",
    "settings.imageBlurValue": "Image Blur: {value}",
    "settings.imageOpacityValue": "Image Opacity: {value}",
    "settings.imageOpacityDescription": "Controls wallpaper transparency.",
    "settings.appBlurValue": "Application Blur: {value}",
    "settings.appBlurDescription": "Blurs the window background only.",
    "settings.appOpacityValue": "Application Opacity: {value}",
    "settings.appOpacityDescription": "Makes the entire window transparent.",
    "settings.typography": "TYPOGRAPHY",
    "settings.fontSizeValue": "Font Size: {value}px",
    "settings.integrations": "INTEGRATIONS",
    "settings.multica": "Multica",
    "settings.multicaDescription": "Configure the default Multica server used for setup and agent discovery.",
    "settings.multicaConnected": "Connected",
    "settings.multicaAuthenticatedNoWorkspace": "Authenticated, workspace not selected",
    "settings.multicaServerConfigured": "Server configured",
    "settings.multicaNotConfigured": "Not configured",
    "settings.email": "Email: {value}",
    "settings.workspace": "Workspace: {value}",
    "settings.serverUrl": "Server URL",
    "settings.serverUrlDescription": "Changing the server clears the current Multica auth and workspace selection.",
    "settings.serverUrlPlaceholder": "https://your-multica-server",
    "settings.saveServer": "Save Server",
    "settings.clearServer": "Clear Server",
    "settings.manageConnection": "Manage Connection",
    "settings.openSetup": "Open Setup",
    "settings.disconnect": "Disconnect",
    "settings.advanced": "ADVANCED",
    "settings.developerMode": "Developer mode",
    "settings.developerModeDescription": "Show developer-related settings such as Git",
    "settings.notifications": "NOTIFICATIONS",
    "settings.completionChime": "Completion chime",
    "settings.completionChimeDescription": "Plays each time a run finishes, even if multiple sessions complete back-to-back.",
    "settings.preview": "Preview",
    "settings.muteCompletionChime": "Mute completion chime",
    "settings.git": "GIT",
    "settings.defaultPrBranch": "Default PR branch",
    "settings.defaultPrBranchDescription": "Target branch used when creating a pull request",
    "settings.autoCoauthor": "Auto coauthor",
    "settings.autoCoauthorDescription": "Append a Co-Authored-By trailer to every commit",
  },
  "zh-CN": {
    "chromeRail.collapseSidebar": "收起侧栏",
    "chromeRail.expandSidebar": "展开侧栏",
    "chromeRail.newChat": "新建对话",
    "sidebar.newChat": "新建对话",
    "sidebar.dispatch": "分发任务",
    "sidebar.newProject": "新建项目",
    "sidebar.githubProjects": "GitHub 项目",
    "sidebar.search": "搜索",
    "sidebar.searchPlaceholder": "搜索...",
    "sidebar.noConversations": "暂无对话",
    "sidebar.noConversationsHint": "输入内容即可开始",
    "sidebar.drafts": "草稿",
    "settings.title": "设置",
    "settings.appearance": "外观",
    "settings.language": "语言",
    "settings.languageDescription": "切换应用界面语言。",
    "settings.languageEnglish": "English",
    "settings.languageChinese": "简体中文",
    "settings.wallpaper": "壁纸",
    "settings.wallpaperDescription": "设置自定义背景图片",
    "settings.chooseImage": "选择图片",
    "settings.remove": "移除",
    "settings.imageBlurValue": "图片模糊：{value}",
    "settings.imageOpacityValue": "图片透明度：{value}",
    "settings.imageOpacityDescription": "控制壁纸透明程度。",
    "settings.appBlurValue": "应用模糊：{value}",
    "settings.appBlurDescription": "仅模糊窗口背景。",
    "settings.appOpacityValue": "应用透明度：{value}",
    "settings.appOpacityDescription": "调整整个窗口的透明程度。",
    "settings.typography": "字体",
    "settings.fontSizeValue": "字体大小：{value}px",
    "settings.integrations": "集成",
    "settings.multica": "Multica",
    "settings.multicaDescription": "配置默认 Multica 服务端，用于初始化和代理发现。",
    "settings.multicaConnected": "已连接",
    "settings.multicaAuthenticatedNoWorkspace": "已认证，但尚未选择工作区",
    "settings.multicaServerConfigured": "已配置服务器",
    "settings.multicaNotConfigured": "未配置",
    "settings.email": "邮箱：{value}",
    "settings.workspace": "工作区：{value}",
    "settings.serverUrl": "服务地址",
    "settings.serverUrlDescription": "修改服务器后会清除当前的 Multica 认证和工作区选择。",
    "settings.serverUrlPlaceholder": "https://your-multica-server",
    "settings.saveServer": "保存服务器",
    "settings.clearServer": "清除服务器",
    "settings.manageConnection": "管理连接",
    "settings.openSetup": "打开设置向导",
    "settings.disconnect": "断开连接",
    "settings.advanced": "高级",
    "settings.developerMode": "开发者模式",
    "settings.developerModeDescription": "显示 Git 等开发相关设置",
    "settings.notifications": "通知",
    "settings.completionChime": "完成提示音",
    "settings.completionChimeDescription": "每次运行结束时播放，即使多个会话连续完成也会触发。",
    "settings.preview": "试听",
    "settings.muteCompletionChime": "静音完成提示音",
    "settings.git": "Git",
    "settings.defaultPrBranch": "默认 PR 分支",
    "settings.defaultPrBranchDescription": "创建拉取请求时使用的目标分支",
    "settings.autoCoauthor": "自动共同署名",
    "settings.autoCoauthorDescription": "为每次提交自动附加 Co-Authored-By 尾注",
  },
};

export function normalizeLocale(locale) {
  if (typeof locale !== "string") return DEFAULT_LOCALE;
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_LOCALE;
}

export function detectDefaultLocale() {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  return normalizeLocale(navigator.language || DEFAULT_LOCALE);
}

export function createTranslator(locale) {
  const normalized = normalizeLocale(locale);
  const active = STRINGS[normalized] || STRINGS[DEFAULT_LOCALE];
  const fallback = STRINGS[DEFAULT_LOCALE];

  return (key, vars = {}) => {
    let template = active[key] ?? fallback[key] ?? key;
    for (const [name, value] of Object.entries(vars)) {
      template = template.replaceAll(`{${name}}`, String(value));
    }
    return template;
  };
}
