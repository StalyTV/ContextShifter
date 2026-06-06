# ContextShifter
ContextShifter is a cross platform application that supports software developers and data scientists in switching and resuming tasks. In ContextShifter, by clicking a physical or virtual button, the user can create a snapshot of the currently active task context. Then, the user can curate it, summarize just finished actions, express intents, and finally clean up no longer needed artifacts (applications, files, folders, and web pages). Later, artifacts captured by a snapshot can automatically be reopened and information is displayed that should help users to restore their mental task context.

ContextShifter is based on TaskSnap and extends it with new context-switching capabilities.

The application was initially created by [Remy Egloff](https://github.com/regloff) as part of his Master Thesis at the [HASEL Lab](https://hasel.dev/) at the University of Zurich (UZH).

## ⬇️ Download
The latest version of the TaskSnap desktop application can be downloaded [here](https://tasksnap-updater.vercel.app/). Updates are installed automatically. Further, the desktop application is accompanied by an [extension](https://marketplace.visualstudio.com/items?itemName=regloff.tasksnap-vscode) for Visual Studio Code and a [browser extension](https://www.royru.ch/gstell/installation) for Chromium based browsers and Firefox. Both extensions are not required for the approach to work, but makes it more useful as more data sources are available.

The GitHub project of the VS Code extension can be found [here](https://github.com/HASEL-UZH/TaskSnap-vscode-extension), the browser extension project was created by [royru](https://github.com/royru) and is available [here](https://github.com/HASEL-UZH/context-browser-extension).


## 🔘 Supported USB-Buttons
Currently, only a single product is supported, the [**Luxafor Mute Button**](https://luxafor.com/product/luxafor-mute-button) (ca 35 USD). However, more products could be easily added in the future.

## 🚀 Getting Started
Make sure that you use node version 18

```
git clone https://github.com/HASEL-UZH/TaskSnap.git
cd TaskSnap
git submodule init
git submodule update
node -v
npm i
npm run start
```

## 🏗 Build locally
```
npm run build
npm exec electron-builder
```

## 🏛 Architecture
- The application is written in TypeScript using the Electron framework. The frontend is react-based.
- As a starting point, the [electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate) was used.
- The main components of the application are described [here](./docs/mainComponents.md).
- Data is **only** stored locally in an SQLite database using the package [better-sqlite3](https://github.com/WiseLibs/better-sqlite3). The database schema is described [here](./docs/databaseSchema.md).

## 💫 Credits
Special thanks to the developers contributing to the following libraries:
- https://github.com/node-hid/node-hid
- https://github.com/WiseLibs/better-sqlite3
- https://github.com/sindresorhus/active-win
