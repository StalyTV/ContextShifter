## Database Schema
### Snapshot Artifacts
| table       | description | most important attributes
| --------    | ------- | ------- |
| snapshot    | Contains general information about a snapshot | name, summary, intent, creation date |
| browser     | Browsers that are part of a snapshot | name, type, path, icon, isSelected, snapshotId, relevance |
| browser_tab | Browser tabs that are part of a browser | title, url, favIconUrl, isActive, isSelected, browserId, relevance|
| ide         | IDEs that are part of a snapshot | name, path, icon, title, git related information, isSelected, snapshotId, relevance |
| ide_file    | Files that are part of an IDE | name, path, isActive, isSelected, ideId, relevance |
| application | All applications that are not browsers or IDEs that are part a snapshot | name, path, icon, title, isSelected, snapshotId, relevance|
| file        | Files that are associated with an application | name, path, isSelected, applicationId |

### Continuous Data Stream for Relevance Calculation
| table       | description | most important attributes
| --------    | ------- | ------- |
| active_browser_tab  | Contains the hashed URL of all browser tabs that were active once | url, timestamp, duration |
| active_file         | Contains all files that were active in the IDE once | path, timestamp, duration |
| active_window       | Contains the output of [WindowsActivityTracker](https://github.com/HASEL-UZH/PA.WindowsActivityTracker) | timestamp, applicationName, applicationPath, processId, windowTitle, activityType,  url, duration |

### Other
| table       | description |
| --------    | ------- | 
| log  | Contains important timestamps (lastEndOfDayPopUp, lastStart, lastDataExport) |
| settings  | Contains the values set in the settings page |
| known_applications  | Maintains a list of applications that is used to define which applications should never be closed |

### Study Related
| table       | description |
| --------    | ------- | 
| usage_data  | Stores interactions of the user with TaskSnap |
| questionnaire_answers  | Stores experience-sampling answers during the user study |
| analysis_open_applications  | Repetitively stores the currently open applications (needed for study analysis) |
