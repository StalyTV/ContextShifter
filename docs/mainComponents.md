# Main Components
- [main.ts](../src/main/main.ts) Starting point of the application. Handles the initialization of the app on launch. Notably, initializes the [AppUpdater](../src/main/AppUpdater.ts) and the [database](../src/main/database.ts) connection.
- [TaskSnap.ts](../src/main/TaskSnap.ts) Main class of the application. Handles starting and pausing of all algorithms, snapshot creation and restoring snapshots.
- [SnapshotManager.ts](../src/main/SnapshotManager.ts) Contains all other interaction with snapshots (updating, postponing, merging, closing artifacts...).
- [osCommands.ts](../src/main/helpers/osCommands.ts) Contains all functions that interact with the OS that are not provided by a npm package. Generally, commands executed on Windows use powershell commands and on macOS, AppleScripts are used.
- [FDACalculator.ts](../src/main/FDACalculator.ts) Calculates the relevance of artifacts on snapshot creation based on an [approach proposed by Maalej et al. (2017)](https://doi.org/10.1016/j.jss.2016.11.033).
- [DeviceManager.ts](../src/main/HID/DeviceManager.ts) Handles interaction with USB-Button.
- [Exporter](../src//main/Exporter.ts) Creates a text export of recent snapshots each day to have a backup at hand in case the database gets corrupted.
- [StudyManager.ts](../src/main/StudyManager.ts) Contains all additional functionality needed for the user study.

### Data Trackers
- [WindowTracker.ts](../src/main/trackers/WindowTracker.ts) Access point to the [WindowsActivityTracker](https://github.com/HASEL-UZH/PA.WindowsActivityTracker).
- [BrowserTracker.ts](../src/main/trackers/BrowserTracker.ts) Manages connection and data flow to the browser extension.
- [VSCodeTracker.ts](../src/main/trackers/VSCodeTracker.ts) Manages connection and data flow to the VS Code extension
