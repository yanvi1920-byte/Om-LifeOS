import React, { useState } from 'react';
import {
  X,
  Download,
  Terminal,
  Check,
  Copy,
  Cpu,
  Github,
  Monitor,
  PackageCheck,
  FileCode,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Zap,
  HelpCircle,
  FileArchive,
  ArrowRight
} from 'lucide-react';
import JSZip from 'jszip';

interface WindowsExeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WindowsExeModal: React.FC<WindowsExeModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'tauri' | 'steps' | 'commands' | 'downloads' | 'local'>('tauri');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const tauriGitCommands = `# 1. Initialize Git in project folder
git init

# 2. Add all project files (including src-tauri/ & .github workflows)
git add .

# 3. Commit your changes
git commit -m "Configure Tauri v2 Windows EXE build via GitHub Actions"

# 4. Set main branch
git branch -M main

# 5. Link to your GitHub repository
git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/<REPO-NAME>.git

# 6. Push to GitHub!
git push -u origin main`;

  const gitReleaseCommands = `# Create a version release tag for instant GitHub Release:
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions will compile and automatically attach the Tauri .exe to your GitHub Releases page!`;

  const tauriWorkflowYamlContent = `name: Build Tauri Windows .exe

on:
  push:
    branches: [ main, master ]
    tags: [ 'v*' ]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-tauri-windows:
    name: Build Tauri Windows Executable (.exe)
    runs-on: windows-latest

    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Rust Cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install Dependencies
        run: npm install

      - name: Build Web Frontend (Vite)
        run: npm run build

      - name: Build Tauri Windows .exe and .msi
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: \${{ github.ref_name }}
          releaseName: 'Om-LifeOS v__VERSION__'
          releaseBody: 'Automated Tauri Windows release.'
          releaseDraft: false
          prerelease: false

      - name: Upload Tauri Windows .exe Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: Om-LifeOS-Tauri-Windows-exe
          path: |
            src-tauri/target/release/bundle/nsis/*.exe
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/*.exe
          retention-days: 30
`;

  const handleDownloadTauriWorkflow = () => {
    const blob = new Blob([tauriWorkflowYamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-tauri-windows-exe.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTauriPackageZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // .github workflow
      const ghWorkflows = zip.folder('.github')?.folder('workflows');
      ghWorkflows?.file('build-tauri-windows-exe.yml', tauriWorkflowYamlContent);

      // src-tauri files
      const tauriFolder = zip.folder('src-tauri');
      tauriFolder?.file('Cargo.toml', `[package]
name = "om-lifeos"
version = "1.0.0"
description = "Om-LifeOS Personal Operating System"
authors = ["Om-LifeOS Team"]
edition = "2021"

[lib]
name = "om_lifeos_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`);

      tauriFolder?.file('build.rs', `fn main() {
    tauri_build::build()
}
`);

      tauriFolder?.file('tauri.conf.json', `{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Om-LifeOS",
  "version": "1.0.0",
  "identifier": "com.om.lifeos",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Om-LifeOS — Personal Operating System",
        "width": 1280,
        "height": 840,
        "minWidth": 960,
        "minHeight": 640,
        "resizable": true,
        "fullscreen": false,
        "maximized": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"]
  }
}
`);

      const tauriSrc = tauriFolder?.folder('src');
      tauriSrc?.file('main.rs', `// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    om_lifeos_lib::run();
}
`);
      tauriSrc?.file('lib.rs', `#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
`);

      const capabilities = tauriFolder?.folder('capabilities');
      capabilities?.file('default.json', `{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default"
  ]
}
`);

      zip.file('GITHUB_TAURI_WINDOWS_EXE_GUIDE.md', `# Om-LifeOS Tauri Windows .exe Guide
Push this repository to GitHub.
GitHub Actions (.github/workflows/build-tauri-windows-exe.yml) will automatically compile Tauri Rust + Vite and create Windows .exe!`);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'om-lifeos-tauri-github-setup.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create Tauri ZIP', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[92vh] rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100">

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 bg-gradient-to-r from-amber-50/60 via-indigo-50/40 to-white dark:from-amber-950/20 dark:via-indigo-950/20 dark:to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-md shadow-amber-500/20">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">
                  GitHub me Tauri se Windows .exe
                </h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Tauri v2 Configured (~4MB)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ultra-lightweight Windows setup (.exe) & MSI built automatically via GitHub Actions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 px-4 gap-1 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('tauri')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'tauri'
                ? 'border-amber-500 text-amber-600 dark:border-amber-400 dark:text-amber-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            ⚡ Tauri Guide (Recommended)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('commands')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'commands'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            Git Commands (1-Click Copy)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('downloads')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'downloads'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            Downloads & Setup ZIP
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'steps'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Github className="h-3.5 w-3.5" />
            Electron Alternative (~90MB)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'local'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Local Build
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">

          {/* TAB: TAURI (HERO) */}
          {activeTab === 'tauri' && (
            <div className="space-y-4 text-xs sm:text-sm">
              {/* Highlight Banner */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5 shadow-xs">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-amber-950 dark:text-amber-200 text-sm">
                      Tauri v2 आपके App का .exe सिर्फ ~4 MB में बनाएगा!
                    </h3>
                    <p className="text-xs text-amber-900/90 dark:text-amber-300 leading-relaxed">
                      Electron का साइज ~100MB होता है, जबकि <strong>Tauri</strong> Windows के नेटिव WebView2 और Rust का उपयोग करता है। इसलिए इसका <strong>.exe साइज़ 95% कम (~4MB)</strong> होता है और यह <strong>सिर्फ 25MB RAM</strong> लेता है!
                    </p>
                  </div>
                </div>
              </div>

              {/* Comparison Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">⚡ Electron vs Tauri तुलना:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Tauri .exe Size</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">~4 MB</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Electron Size</div>
                    <div className="text-sm font-bold text-slate-500">~90 - 120 MB</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">RAM Usage</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">~25 MB</div>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase">Startup Time</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">0.3 sec (Instant)</div>
                  </div>
                </div>
              </div>

              {/* 4 Steps for Tauri */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  GitHub पर Tauri .exe बनाने के 4 आसान Steps:
                </h4>

                <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-white font-bold text-xs shrink-0">
                    1
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 dark:text-white">
                      GitHub पर New Repository बनाएं
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      <a href="https://github.com/new" target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline inline-flex items-center gap-1 font-medium">
                        github.com/new <ExternalLink className="h-3 w-3" />
                      </a> पर जाएं और Repo नाम दें (उदा: <span className="font-mono">om-lifeos-tauri</span>).
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-white font-bold text-xs shrink-0">
                    2
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Git Push करें
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      प्रोजेक्ट में <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">src-tauri/</code> और workflow file पहले से मौजूद है। बस <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">git push -u origin main</code> चलाएं।
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-white font-bold text-xs shrink-0">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 dark:text-white">
                      GitHub Actions अपने आप Rust + Vite कंपाइल करेगा
                    </span>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      GitHub Repo के <strong>Actions</strong> tab में <strong>"Build Tauri Windows .exe"</strong> चलेगा। यह आधिकारिक <code className="font-mono text-amber-600 dark:text-amber-400">tauri-apps/tauri-action</code> से बिल्ड करता है।
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-white font-bold text-xs shrink-0">
                    4
                  </div>
                  <div className="space-y-1">
                    <span className="font-bold text-emerald-950 dark:text-emerald-200">
                      Artifacts से अपना Windows .exe Download करें!
                    </span>
                    <p className="text-xs text-emerald-900/80 dark:text-emerald-300">
                      Workflow run के नीचे <strong>Artifacts</strong> में <strong>`Om-LifeOS-Tauri-Windows-exe`</strong> मिलेगा।
                    </p>
                    <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                      <span className="bg-white/80 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded font-semibold text-emerald-800 dark:text-emerald-300">
                        ✓ Om-LifeOS_1.0.0_x64-setup.exe (~4 MB)
                      </span>
                      <span className="bg-white/80 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 px-2 py-0.5 rounded text-emerald-800 dark:text-emerald-300">
                        ✓ Om-LifeOS_1.0.0_x64.msi (~4 MB)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions for Tauri */}
              <div className="pt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(tauriGitCommands, 'tauri-git')}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors shadow-xs"
                >
                  {copiedKey === 'tauri-git' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'tauri-git' ? 'Commands Copied!' : 'Copy Tauri Git Commands'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTauriWorkflow}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileCode className="h-3.5 w-3.5 text-amber-500" />
                  <span>Download Tauri Workflow YAML</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTauriPackageZip}
                  disabled={isZipping}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileArchive className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{isZipping ? 'Zipping...' : 'Download src-tauri ZIP'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: COMMANDS */}
          {activeTab === 'commands' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold">Terminal / Command Prompt Commands</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    अपने computer में project folder खोलकर ये commands run करें:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(tauriGitCommands, 'git-all')}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm"
                >
                  {copiedKey === 'git-all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey === 'git-all' ? 'Copied!' : 'Copy Commands'}</span>
                </button>
              </div>

              <div className="relative rounded-xl border border-slate-800 bg-slate-950 p-3 sm:p-4 text-slate-200 font-mono text-xs overflow-x-auto">
                <pre>{tauriGitCommands}</pre>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Bonus: GitHub Releases में Direct .exe Button जोड़ने के लिए
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Release Tag push करने पर GitHub Releases में direct download link बन जाएगा:
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(gitReleaseCommands, 'git-release')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {copiedKey === 'git-release' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedKey === 'git-release' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-slate-300 font-mono text-xs overflow-x-auto">
                  <pre>{gitReleaseCommands}</pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DOWNLOADS */}
          {activeTab === 'downloads' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                आप GitHub workflow files, ready setup zip या direct standalone HTML download कर सकते हैं:
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* 1. Standalone Complete HTML */}
                <a
                  href="/om-lifeos-complete.html"
                  download="om-lifeos-complete.html"
                  className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 hover:bg-emerald-100/60 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 transition-colors group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0 shadow-xs">
                    <Download className="h-4 w-4 group-hover:translate-y-0.5 transition-transform" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-emerald-950 dark:text-emerald-200">
                      Direct Download Standalone HTML
                    </div>
                    <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300">
                      100% offline single HTML file (CSS+JS integrated). Double click to open anywhere!
                    </p>
                  </div>
                </a>

                {/* 2. Download Tauri Setup ZIP */}
                <button
                  type="button"
                  onClick={handleDownloadTauriPackageZip}
                  disabled={isZipping}
                  className="flex items-start gap-3 text-left rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 hover:bg-amber-100/60 dark:border-amber-900/50 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 transition-colors group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white shrink-0 shadow-xs">
                    <Zap className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-amber-950 dark:text-amber-200">
                      {isZipping ? 'Creating ZIP...' : 'Download Tauri Setup ZIP'}
                    </div>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300">
                      Contains src-tauri/ folder, Cargo.toml, tauri.conf.json, & GitHub Actions workflow.
                    </p>
                  </div>
                </button>

                {/* 3. Download Tauri Workflow YAML */}
                <button
                  type="button"
                  onClick={handleDownloadTauriWorkflow}
                  className="flex items-start gap-3 text-left rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800 transition-colors group"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-700 text-white shrink-0">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs">
                      Download Tauri Workflow YAML
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      <code className="font-mono">build-tauri-windows-exe.yml</code> to put inside <code className="font-mono">.github/workflows/</code>
                    </p>
                  </div>
                </button>

                {/* 4. Open Guide */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs">
                      GITHUB_TAURI_WINDOWS_EXE_GUIDE.md
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Saved in project root with full instructions and explanations.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ELECTRON STEPS (ALTERNATIVE) */}
          {activeTab === 'steps' && (
            <div className="space-y-3 text-xs sm:text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Electron is an alternative option if you don't want Rust. Its workflow is in <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">.github/workflows/build-windows-exe.yml</code>. It creates a ~90MB .exe.
                </p>
              </div>

              <div className="grid gap-2">
                <div className="flex gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-indigo-600">1.</span>
                  <span>Push to GitHub</span>
                </div>
                <div className="flex gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-indigo-600">2.</span>
                  <span>GitHub Actions builds with <code className="font-mono">electron-builder</code></span>
                </div>
                <div className="flex gap-2.5 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <span className="font-bold text-indigo-600">3.</span>
                  <span>Download <code className="font-mono">Om-LifeOS Setup 1.0.0.exe</code> from Artifacts</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LOCAL BUILD */}
          {activeTab === 'local' && (
            <div className="space-y-4 text-xs sm:text-sm">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                अगर आप अपने खुद के Windows PC में local build करना चाहते हैं (Tauri के लिए Rust और Microsoft C++ Build Tools आवश्यक हैं):
              </p>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-slate-200 font-mono text-xs">
                <div className="text-slate-400 mb-1"># 1. Install dependencies:</div>
                <div className="text-emerald-400">npm install</div>
                <div className="text-slate-400 mt-2 mb-1"># 2. Build Tauri Windows .exe:</div>
                <div className="text-amber-400">npx tauri build</div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white">Output Location:</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Build complete होने के बाद <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">src-tauri/target/release/bundle/nsis/</code> folder में <strong>.exe</strong> तैयार मिलेगा (~4MB)!
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-5 py-3 dark:border-slate-800 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <PackageCheck className="h-4 w-4 text-amber-500" />
            <span>Tauri v2 + GitHub Actions CI/CD Ready</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors shadow-xs"
          >
            Got it / समझ गया
          </button>
        </div>

      </div>
    </div>
  );
};
