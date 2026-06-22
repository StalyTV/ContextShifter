/*
 * StudyDataCollector
 * ------------------
 * Captures study data whenever a task ends and its artefact selection is saved.
 * For the ended task it gathers every scored artefact (from ArtifactUsage) and
 * flags which ones the participant manually kept in their final selection, then
 * persists one StudyDataRecord. The export side serialises all collected
 * records to a JSON file the researcher picks a location for.
 */

import { info, warn } from 'electron-log';
import { writeFile } from 'fs/promises';
import ArtifactUsage from './entity/ArtifactUsage';
import StudyDataRecord from './entity/StudyDataRecord';
import Snapshot from './entity/Snapshot';

/** The committed (manually selected) artefacts, as sent to commit-task-artefacts. */
export type CommittedSelection = {
  browsers: Array<{
    type?: string;
    browserTabs?: Array<{ url: string }>;
  }>;
  ides: Array<{
    path?: string;
    workspacePath?: string;
    workspaceSelected?: boolean;
    ideFiles?: Array<{ path: string }>;
  }>;
  applications: Array<{ path?: string }>;
};

type ArtefactRow = {
  key: string;
  kind: string;
  name: string;
  path: string;
  url: string;
  title: string;
  browserType: string;
  totalDurationMs: number;
  accessCount: number;
  lastAccessTs: string;
  score: number;
  selected: boolean;
};

export default class StudyDataCollector {
  /**
   * Record the ended task: all scored artefacts + which were manually selected.
   * Best-effort; never throws into the commit path.
   */
  public static async record(
    taskId: number,
    taskName: string,
    selection: CommittedSelection
  ): Promise<void> {
    try {
      const usage = await ArtifactUsage.getForSnapshot(taskId);

      // Natural identifiers of the manually-kept artefacts.
      const selectedTabUrls = new Set<string>();
      selection.browsers?.forEach((b) =>
        (b.browserTabs ?? []).forEach((t) => t.url && selectedTabUrls.add(t.url))
      );
      const selectedFilePaths = new Set<string>();
      const selectedIdePaths = new Set<string>();
      selection.ides?.forEach((i) => {
        if (i.path) selectedIdePaths.add(i.path);
        (i.ideFiles ?? []).forEach((f) => f.path && selectedFilePaths.add(f.path));
      });
      const selectedAppPaths = new Set<string>();
      selection.applications?.forEach((a) => a.path && selectedAppPaths.add(a.path));

      const isSelected = (r: ArtifactUsage): boolean => {
        switch (r.kind) {
          case 'tab':
            return selectedTabUrls.has(r.url);
          case 'file':
            return selectedFilePaths.has(r.path);
          case 'ide':
            return selectedIdePaths.has(r.path);
          case 'app':
            return selectedAppPaths.has(r.path);
          default:
            return false;
        }
      };

      const artefacts: ArtefactRow[] = usage
        .map((r) => ({
          key: r.key,
          kind: r.kind,
          name: r.name ?? '',
          path: r.path ?? '',
          url: r.url ?? '',
          title: r.title ?? '',
          browserType: r.browserType ?? '',
          totalDurationMs: r.totalDurationMs ?? 0,
          accessCount: r.accessCount ?? 0,
          lastAccessTs: r.lastAccessTs ?? '',
          score: r.score ?? 0,
          selected: isSelected(r),
        }))
        .sort((a, b) => b.score - a.score);

      const snap = await Snapshot.findOneBy({ id: taskId });
      const recordedAt = new Date().toISOString();

      const payload = {
        taskId,
        taskName,
        recordedAt,
        accumulatedActiveMs: snap?.activeMs ?? 0,
        artefactCount: artefacts.length,
        selectedCount: artefacts.filter((a) => a.selected).length,
        artefacts,
      };

      const row = StudyDataRecord.create({
        snapshotId: taskId,
        taskName,
        recordedAt,
        payload: JSON.stringify(payload),
      });
      await row.save();
      info(
        `[StudyDataCollector] Recorded task ${taskId} "${taskName}" — ${payload.artefactCount} artefacts, ${payload.selectedCount} selected`
      );
    } catch (err) {
      warn(`[StudyDataCollector] Failed to record study data: ${String(err)}`);
    }
  }

  /**
   * Serialise all collected records to a JSON file. Returns the number of
   * records written.
   */
  public static async exportAll(filePath: string): Promise<number> {
    const rows = await StudyDataRecord.getAllOrdered();
    const records = rows.map((r) => {
      try {
        return JSON.parse(r.payload);
      } catch {
        return {
          taskId: r.snapshotId,
          taskName: r.taskName,
          recordedAt: r.recordedAt,
          payloadParseError: true,
          raw: r.payload,
        };
      }
    });
    const out = {
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      records,
    };
    await writeFile(filePath, JSON.stringify(out, null, 2), 'utf8');
    info(
      `[StudyDataCollector] Exported ${records.length} records to ${filePath}`
    );
    return records.length;
  }

  public static async count(): Promise<number> {
    return StudyDataRecord.count();
  }
}
