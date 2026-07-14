import styles from './StudyInstructions.module.scss';

type Props = {
  onClose: () => void;
};

const REPO_DESKTOP = 'https://github.com/StalyTV/ContextShifter';
const REPO_BROWSER =
  'https://github.com/StalyTV/ContextShifter-browser-extension';
const REPO_VSCODE =
  'https://github.com/StalyTV/ContextShifter-vscode-extension';

/**
 * Full-screen instructions panel for study participants. Opened from Settings.
 * Back button (top-left) closes it.
 */
export default function StudyInstructions({ onClose }: Props) {
  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <button
            type="button"
            className={styles.back}
            onClick={onClose}
            aria-label="Back"
          >
            &larr; Back
          </button>
          <h2 className={styles.title}>Instructions</h2>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3>1. Installation and connection</h3>
            <p>
              ContextShifter works together with a browser extension and a VS
              Code extension. The extensions are optional, but the study relies
              on them, so please install both.
            </p>
            <ul>
              <li>
                <strong>Desktop app:</strong> download and install ContextShifter
                from {REPO_DESKTOP} (You probably have already done that). The app
                is unsigned, so on first launch macOS may say it is "damaged". If
                so, drag it into Applications, then run this once in Terminal and
                open it again:
                <br />
                <code>
                  xattr -dr com.apple.quarantine /Applications/ContextShifter.app
                </code>
                <br />
                Then grant it <strong>Screen Recording</strong>,{' '}
                <strong>Accessibility</strong>, and <strong>Input Monitoring</strong>{' '}
                permission under System Settings &rarr; Privacy &amp; Security, and
                restart the app. (Screen Recording / Accessibility track windows
                and tabs; Input Monitoring counts clicks and keystrokes per
                artefact — only counts, never the keys themselves.)
              </li>
              <li>
                <strong>Browser extension (Chrome):</strong> install it from{' '}
                {REPO_BROWSER}. Open <code>chrome://extensions</code>, enable
                Developer mode, choose "Load unpacked" and select the extension
                folder (or install the published version). Keep Chrome running.
                Verify the connection under Settings &rarr; Connection Status:
                the "Browser Extension" dot turns green.
              </li>
              <li>
                <strong>VS Code extension:</strong> install it from {REPO_VSCODE}.
                In the Extensions view choose "Install from VSIX" and select the
                file (or install from the Marketplace), then reload the VS Code
                window. Verify under Settings &rarr; Connection Status: the
                "VSCode Extension" dot turns green.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3>2. Using ContextShifter</h3>
            <ul>
              <li>
                <strong>Start a task:</strong> click "Start new task" (or use the
                menu-bar icon "Create Task", or press the physical button). Give
                the task a clear title.
              </li>
              <li>
                <strong>Work normally.</strong> While a task is active,
                ContextShifter tracks which applications, browser tabs, and files
                you use.
              </li>
              <li>
                <strong>Pause, stop, or switch:</strong> when you stop working on
                a task, stop it in ContextShifter or switch to another task or
                subtask. When a task stops, a selection screen lists the tracked
                artefacts; tick the ones that belong to the task and confirm.
                What is pre-selected for you depends on the study phase (see
                "The two study phases" below).
              </li>
              <li>
                <strong>Button actions:</strong>
                <ul>
                  <li>
                    Press: starts a new task. When a task is active the button
                    glows; pressing it then stops the current task and opens the
                    selection screen.
                  </li>
                  <li>
                    Turn: opens the widget and lets you move through your tasks.
                    Stay on a task for 3 seconds to select it. Pressing the button
                    while the widget is open opens that task's subtask selection.
                  </li>
                  <li>
                    Light: while a task is active the button glows blue. It is off
                    when no task is active.
                  </li>
                </ul>
              </li>
              <li>
                <strong>Artefacts that should never be tracked:</strong> in
                Settings, the sections "Apps that should never be tracked and
                closed" and "Browser tabs that should never be tracked and
                closed" let you exclude specific applications or tabs. These
                stay open when you switch tasks and are not associated with,
                or scored for, any task.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3>3. In-app controls</h3>
            <p>These actions are available in the app and are not tied to the
              physical button.</p>
            <ul>
              <li>
                <strong>Play:</strong> makes a task active. Its saved artefacts
                reopen and unrelated windows close.
              </li>
              <li>
                <strong>Pause:</strong> stops the active task and opens the
                selection screen.
              </li>
              <li>
                <strong>Delete:</strong> removes a task and its subtasks.
              </li>
              <li>
                <strong>Subtasks</strong> behave like normal tasks and are scored
                separately.
              </li>
              <li>
                <strong>Widget:</strong> open it by turning the physical button or
                from the menu-bar icon ("Open Widget"). Use the arrow keys to move
                through tasks (stay on one for 3 seconds to select it) and Enter to
                open its subtasks — just like turning and pressing the button.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3>4. The two study phases</h3>
            <p>
              The study runs in two phases over about six working days. The
              current phase is set under Settings &rarr; "Study Phase". Please
              switch to Phase 2 only when the researcher tells you to (after the
              first three days).
            </p>
            <ul>
              <li>
                <strong>Phase 1 — baseline (3 working days):</strong> work as
                usual. At each task switch, ContextShifter shows the artefacts it
                tracked with <strong>nothing pre-selected</strong> — you tick the
                artefacts that actually belong to the task and confirm. Your
                selections are the ground truth for evaluating the algorithm.
              </li>
              <li>
                <strong>Phase 2 — assisted (2 working days):</strong> same as
                before, but now ContextShifter <strong>pre-selects</strong> the
                artefacts its algorithm considers relevant, and{' '}
                <strong>restores</strong> them for you when you return to a task.
                Confirm the pre-selection, adding any relevant artefact it missed
                and removing any that were included wrongly.
              </li>
              <li>
                <strong>At the end:</strong> complete the short questionnaire
                (about 10 minutes) about your experience.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h3>5. Data collection</h3>
            <ul>
              <li>
                <strong>At the start of the study:</strong> open Settings, go to
                "Data Collection", and enable the "Data Collection" tickbox.
              </li>
              <li>
                <strong>At the end of the study:</strong> open Settings, go to
                "Data Collection", and click "Export Study Data" to choose where
                to save the collected data.
              </li>
              <li>
                <strong>Anonymize data (optional):</strong> enable the "Anonymize
                Data" tickbox in Data Collection to strip artefact names, paths,
                and URLs from the collected data. Only the artefact kind, usage
                scores, and which artefacts you selected are kept.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
