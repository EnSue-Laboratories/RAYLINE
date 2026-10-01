// electron-builder configuration. electron-builder (26+) loads `.ts` configs
// through jiti, so this file is plain ESM TypeScript.
import { execFileSync } from "node:child_process";
import type { Configuration, MacConfiguration } from "electron-builder";

const projectDir = import.meta.dirname;

// Forks can publish to their own repository; packaged builds record where they
// came from (surfaced to the renderer through the get-app-build IPC).
const releaseRepository = process.env.RAYLINE_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "EnSue-Laboratories/RAYLINE";
const releaseMatch = /^([\w.-]+)\/([\w.-]+)$/.exec(releaseRepository);
if (!releaseMatch) throw new Error(`Invalid release repository: ${releaseRepository}`);
const [, releaseOwner = "", releaseRepo = ""] = releaseMatch;

function readBuildCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const isCi = String(process.env.CI || "").toLowerCase() === "true";

function normalizeMacIdentity(identity: string | null | undefined): string | null {
  if (!identity) return null;
  return identity.replace(/^Developer ID Application:\s*/i, "").trim();
}

const explicitCiMacIdentity = normalizeMacIdentity(process.env.APPLE_SIGNING_IDENTITY || process.env.CSC_NAME || null);
const hasCiMacCodesign = Boolean(process.env.CSC_LINK || explicitCiMacIdentity);
const hasCiMacNotary =
  Boolean(process.env.APPLE_ID) &&
  Boolean(process.env.APPLE_APP_SPECIFIC_PASSWORD) &&
  Boolean(process.env.APPLE_TEAM_ID);

const enableMacCodesign = !isCi || hasCiMacCodesign;
const enableMacNotarize = !isCi || (hasCiMacCodesign && hasCiMacNotary);

function macSigning(): Partial<MacConfiguration> {
  if (!enableMacCodesign) return { identity: null, hardenedRuntime: false };
  return {
    hardenedRuntime: true,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    // CI can auto-discover the signing identity from CSC_LINK when present.
    ...(!isCi || explicitCiMacIdentity ? { identity: explicitCiMacIdentity || "Yanfei Ding (55VR37C6LP)" } : {}),
  };
}

const mac: MacConfiguration = {
  category: "public.app-category.developer-tools",
  icon: "public/icon.png",
  target: "dmg",
  gatekeeperAssess: false,
  notarize: enableMacNotarize,
  ...macSigning(),
};

const config: Configuration = {
  appId: "com.ensue.rayline",
  productName: "RayLine",
  extraMetadata: {
    main: "dist-electron/electron/main.cjs",
    raylineBuild: { commit: readBuildCommit(), repository: releaseRepository },
  },
  publish: {
    provider: "github",
    owner: releaseOwner,
    repo: releaseRepo,
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
    artifactName: "${productName}-${version}.${ext}",
    target: ["AppImage", "deb", "rpm", "tar.gz"],
  },
  // Anything executed by an external process (shells, system node) must live
  // outside the asar archive.
  asarUnpack: [
    "dist-electron/electron/shell-init/**",
    "dist-electron/electron/vendor/**",
    "dist-electron/electron/mcp-terminal-server.cjs",
    "dist-electron/scripts/**",
  ],
  files: ["dist/**/*", "dist-electron/**/*", "public/**/*"],
  directories: {
    output: "release",
  },
};

export default config;
