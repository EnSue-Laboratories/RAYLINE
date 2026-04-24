const isCi = String(process.env.CI || "").toLowerCase() === "true";

function normalizeMacIdentity(identity) {
  if (!identity) return null;
  return String(identity)
    .replace(/^Developer ID Application:\s*/i, "")
    .trim();
}

const explicitCiMacIdentity = normalizeMacIdentity(
  process.env.APPLE_SIGNING_IDENTITY || process.env.CSC_NAME || null
);
const hasCiMacCodesign = Boolean(process.env.CSC_LINK || explicitCiMacIdentity);
const hasCiMacNotary =
  Boolean(process.env.APPLE_ID) &&
  Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
  Boolean(process.env.APPLE_TEAM_ID);

const enableMacCodesign = !isCi || hasCiMacCodesign;
const enableMacNotarize = !isCi || (hasCiMacCodesign && hasCiMacNotary);

const mac = {
  category: "public.app-category.developer-tools",
  icon: "public/icon.png",
  target: "dmg",
  gatekeeperAssess: false,
  notarize: enableMacNotarize,
};

if (enableMacCodesign) {
  mac.hardenedRuntime = true;
  mac.entitlements = "build/entitlements.mac.plist";
  mac.entitlementsInherit = "build/entitlements.mac.plist";

  // CI can auto-discover the signing identity from CSC_LINK when present.
  if (!isCi || explicitCiMacIdentity) {
    mac.identity = explicitCiMacIdentity || "Yanfei Ding (55VR37C6LP)";
  }
} else {
  mac.identity = null;
  mac.hardenedRuntime = false;
}

module.exports = {
  appId: "com.ensue.rayline",
  productName: "RayLine",
  publish: {
    provider: "github",
    owner: "EnSue-Laboratories",
    repo: "RAYLINE",
    releaseType: "release",
  },
  win: {
    icon: "public/icon.png",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
  },
  mac,
  dmg: {
    title: "RayLine",
    iconSize: 80,
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications",
      },
    ],
  },
  linux: {
    category: "Development",
    icon: "public/icon.png",
    maintainer: "Ensue Laboratories <contact@ensue.dev>",
    target: ["AppImage", "deb", "tar.gz"],
  },
  asarUnpack: [
    "electron/shell-init/**",
    "electron/vendor/**",
  ],
  files: ["dist/**/*", "electron/**/*", "public/**/*"],
  directories: {
    output: "release",
  },
};
