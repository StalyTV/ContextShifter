# ContextShifter
ContextShifter is a cross platform application that supports software developers and data scientists in switching and resuming tasks. In ContextShifter, by clicking a physical or virtual button, the user can create a snapshot of the currently active task context. Then, the user can curate it, summarize just finished actions, express intents, and finally clean up no longer needed artifacts (applications, files, folders, and web pages). Later, artifacts captured by a snapshot can automatically be reopened and information is displayed that should help users to restore their mental task context.

ContextShifter is based on TaskSnap and extends it with new context-switching capabilities.

The application was initially created by [Remy Egloff](https://github.com/regloff) as part of his Master Thesis at the [HASEL Lab](https://hasel.dev/) at the University of Zurich (UZH).

## ⬇️ Download
ContextShifter is built from source (see [Getting Started](#-getting-started)). It is accompanied by two optional companion extensions that add data sources (open browser tabs and IDE files):

- VS Code extension: https://github.com/StalyTV/ContextShifter-vscode-extension
- Browser extension (Chromium based browsers and Firefox): https://github.com/StalyTV/ContextShifter-browser-extension

Neither extension is required for the core approach to work, but each makes it more useful as more data sources become available.


## 🔘 Supported USB-Buttons
Currently, only a single product is supported, the [**TimeBuzzer**]((https://timebuzzer.com/de/?utm_source=google%20ads%20&utm_medium=brand%20de&customclick=CjwKCAjwl97RBhBWEiwAa9rbXV_wDZRhhAmOzkGj7witZheG3xAvUrvKOqquD8A3hnQdjk4_oCBerhoCW9YQAvD_BwE&gad_source=1&gad_campaignid=21737448887&gbraid=0AAAAADfzrp_Ax3TrMKJ-NoLe2UnP5Bdh9&gclid=CjwKCAjwl97RBhBWEiwAa9rbXV_wDZRhhAmOzkGj7witZheG3xAvUrvKOqquD8A3hnQdjk4_oCBerhoCW9YQAvD_BwE)). However, more products could be easily added in the future.

## 🚀 Getting Started
Use Node.js 18 or newer.

```
git clone https://github.com/StalyTV/ContextShifter.git
cd ContextShifter
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

