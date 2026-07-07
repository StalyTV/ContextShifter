/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import ContextShifter from './ContextShifter';
import Snapshot from './entity/Snapshot';
import Application from './entity/Application';
import BrowserEntity from './entity/Browser';
import BrowserTabEntity from './entity/BrowserTab';
import IDEEntity from './entity/IDE';
import IDEFileEntity from './entity/IDEFile';
import FileEntity from './entity/File';
import ArtifactUsage from './entity/ArtifactUsage';
import { info } from 'electron-log';
import UsageData from './entity/UsageData';
import TrayManager from './TrayManager';
import ActiveTaskSession from './ActiveTaskSession';

export default class SnapshotManager {
  private static _instance: SnapshotManager;

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public async getSnapshotById(id: number) {
    return await Snapshot.getSnapshotById(id);
  }

  public async getLatestNSnapshots(n: number) {
    return await Snapshot.getLatestNSnapshots(n);
  }

  /** Phase 2: list subtasks of a given parent snapshot. */
  public async getChildren(parentId: number) {
    return await Snapshot.getChildrenOf(parentId);
  }

  /** Phase 2: create an empty subtask under `parentId`. */
  public async createSubtask(parentId: number, name: string) {
    const parent = await Snapshot.findOneBy({ id: parentId });
    if (!parent) {
      throw new Error(`Parent snapshot ${parentId} not found`);
    }
    const now = new Date().toISOString();
    const child = Snapshot.create({
      name,
      summary: '',
      intent: '',
      created: now,
      edited: now,
      lastChange: now,
      isArchived: false,
      isReady: true,
      parentId,
    });
    await child.save();
    parent.lastChange = now;
    await parent.save();
    info(
      `[SnapshotManager] Created subtask "${name}" (id ${child.id}) under ${parentId}`
    );
    await TrayManager.updateTray();
    return child;
  }

  /**
   * Delete a task/subtask and everything under it. Child subtasks are removed
   * first; each snapshot's artefacts (browsers/tabs, IDEs/files, apps/files)
   * cascade-delete via their onDelete: 'CASCADE' foreign keys. If the deleted
   * task (or one of its subtasks) is currently active, the active-task session
   * is discarded so the app falls back to "None".
   */
  public async deleteSnapshot(id: number): Promise<void> {
    const snap = await Snapshot.findOneBy({ id });
    if (!snap) {
      info(`[SnapshotManager] deleteSnapshot: ${id} not found`);
      return;
    }

    const children = await Snapshot.findBy({ parentId: id });
    for (const child of children) {
      await Snapshot.delete(child.id);
    }
    await Snapshot.delete(id);

    // Deactivate if we just deleted the active task (or its active subtask).
    const activeId = ActiveTaskSession.getInstance().getActiveTaskId();
    if (activeId === id || children.some((c) => c.id === activeId)) {
      await ActiveTaskSession.getInstance().discard();
    }

    await UsageData.addEntry(
      'delete-snapshot',
      false,
      `id: ${id}, children: ${children.length}`
    );
    info(
      `[SnapshotManager] Deleted snapshot ${id} and ${children.length} subtask(s)`
    );
    await TrayManager.updateTray();
  }

  /** Phase 2: rename a snapshot (used by edit view). */
  public async renameSnapshot(snapshotId: number, name: string) {
    const snap = await Snapshot.findOneBy({ id: snapshotId });
    if (!snap) return;
    snap.name = name;
    snap.lastChange = new Date().toISOString();
    await snap.save();
    await TrayManager.updateTray();
  }

  /**
   * Create a new task with the supplied (already-curated) sets of
   * currently-open browsers / IDEs / applications. Pass `parentId` to
   * create a subtask under an existing parent; otherwise a top-level task
   * is created. The renderer obtains the full open set via
   * `ContextShifter.getCurrentlyOpenApplications()` and filters client-side.
   */
  public async createTask(
    name: string,
    browsers: BrowserEntity[],
    ides: IDEEntity[],
    applications: Application[],
    parentId: number | null = null
  ): Promise<Snapshot> {
    const now = new Date().toISOString();
    const fallbackName = parentId === null
      ? `Task ${await Snapshot.getNextId()}`
      : `Subtask ${await Snapshot.getNextId()}`;
    const snap = Snapshot.create({
      name: name?.trim() || fallbackName,
      summary: '',
      intent: '',
      created: now,
      edited: now,
      lastChange: now,
      isArchived: false,
      isReady: true,
      parentId,
    });
    await snap.save();

    // Persist the chosen artifacts and link them to this snapshot. Mirrors
    // ContextShifter.createNewSnapshot's persistence pattern (cascade saves nested
    // BrowserTab / IDEFile rows).
    if (browsers.length > 0) {
      browsers.forEach((b) => {
        b.snapshot = snap;
      });
      await BrowserEntity.save(browsers);
    }
    if (ides.length > 0) {
      for (const ide of ides) {
        ide.snapshot = snap;
        await IDEEntity.save(ide);

        // Persist any in-memory IDEFile entities provided by the renderer
        // (e.g. files reported by the VS Code extension during the picker).
        const files = ide.ideFiles ?? [];
        if (files.length > 0) {
          for (const file of files) {
            file.ide = ide;
            if (file.isSelected === undefined) file.isSelected = true;
          }
          await IDEFileEntity.save(files);
        }
      }
    }
    if (applications.length > 0) {
      applications.forEach((a) => {
        a.snapshot = snap;
      });
      await Application.save(applications);
    }

    snap.browsers = browsers;
    snap.ides = ides;
    snap.applications = applications;
    await snap.save();

    if (parentId !== null) {
      const parent = await Snapshot.findOneBy({ id: parentId });
      if (parent) {
        parent.lastChange = now;
        await parent.save();
      }
    }

    await UsageData.addEntry(
      'create-task',
      false,
      `id: ${snap.id}, parent: ${parentId ?? 'null'}, browsers: ${browsers.length}, ides: ${ides.length}, apps: ${applications.length}`
    );
    info(
      `[SnapshotManager] Created ${parentId === null ? 'task' : 'subtask'} "${snap.name}" (id ${snap.id}, parent ${parentId ?? 'none'}) with ${browsers.length} browsers / ${ides.length} ides / ${applications.length} apps`
    );
    await TrayManager.updateTray();
    return snap;
  }

  /**
   * Create an empty task (or subtask) with no artefacts attached. Used by
   * the "Start new task" flow where artefact selection is deferred until
   * the user stops or switches tasks.
   */
  public async startEmptyTask(
    name: string,
    parentId: number | null = null
  ): Promise<Snapshot> {
    const now = new Date().toISOString();
    const fallbackName =
      parentId === null
        ? `Task ${await Snapshot.getNextId()}`
        : `Subtask ${await Snapshot.getNextId()}`;
    const snap = Snapshot.create({
      name: name?.trim() || fallbackName,
      summary: '',
      intent: '',
      created: now,
      edited: now,
      lastChange: now,
      isArchived: false,
      isReady: true,
      parentId,
    });
    await snap.save();
    if (parentId !== null) {
      const parent = await Snapshot.findOneBy({ id: parentId });
      if (parent) {
        parent.lastChange = now;
        await parent.save();
      }
    }
    await UsageData.addEntry(
      'start-task',
      false,
      `id: ${snap.id}, parent: ${parentId ?? 'null'}`
    );
    info(
      `[SnapshotManager] Started empty ${parentId === null ? 'task' : 'subtask'} "${snap.name}" (id ${snap.id})`
    );
    await TrayManager.updateTray();
    return snap;
  }

  /**
   * Replace the artefacts linked to an existing task with the supplied set.
   * Used by the stop / commit flow. Children of existing rows cascade-delete
   * (see entity onDelete: CASCADE), so we can drop then re-insert without
   * leaving orphans.
   */
  public async commitTaskArtefacts(
    taskId: number,
    browsers: BrowserEntity[],
    ides: IDEEntity[],
    applications: Application[]
  ): Promise<void> {
    const snap = await Snapshot.findOneBy({ id: taskId });
    if (!snap) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Drop existing rows. Cascade onDelete handles BrowserTab / IDEFile / File children.
    await BrowserEntity.createQueryBuilder()
      .delete()
      .where('snapshotId = :id', { id: taskId })
      .execute();
    await IDEEntity.createQueryBuilder()
      .delete()
      .where('snapshotId = :id', { id: taskId })
      .execute();
    await Application.createQueryBuilder()
      .delete()
      .where('snapshotId = :id', { id: taskId })
      .execute();

    // Insert new rows. Strip ids so TypeORM treats them as new entities.
    if (browsers.length > 0) {
      const fresh = browsers.map((b) => {
        const e = BrowserEntity.create({
          windowId: b.windowId,
          name: b.name,
          type: b.type,
          path: b.path,
          icon: b.icon,
          title: b.title,
          isSelected: b.isSelected ?? true,
          relevance: b.relevance ?? 0,
        });
        e.snapshot = snap;
        e.browserTabs = (b.browserTabs ?? []).map((t) =>
          BrowserTabEntity.create({
            url: t.url,
            title: t.title,
            favIconUrl: t.favIconUrl,
            index: t.index ?? 0,
            isActive: t.isActive ?? false,
            isSelected: t.isSelected ?? true,
            relevance: t.relevance ?? 0,
            profileId: t.profileId,
            profileEmail: t.profileEmail,
            groupTitle: t.groupTitle,
            groupColor: t.groupColor,
          })
        );
        return e;
      });
      await BrowserEntity.save(fresh);
    }
    if (ides.length > 0) {
      for (const i of ides) {
        const e = IDEEntity.create({
          name: i.name,
          path: i.path,
          icon: i.icon,
          title: i.title,
          branch: i.branch,
          lastCommitMessage: i.lastCommitMessage,
          workspaceName: i.workspaceName,
          workspacePath: i.workspacePath,
          workspaceSelected: i.workspaceSelected ?? true,
          isSelected: i.isSelected ?? true,
          relevance: i.relevance ?? 0,
        });
        e.snapshot = snap;
        await IDEEntity.save(e);
        const files = (i.ideFiles ?? []).map((f) => {
          const fe = IDEFileEntity.create({
            name: f.name,
            path: f.path,
            isActive: f.isActive ?? false,
            isSelected: f.isSelected ?? true,
            relevance: f.relevance ?? 0,
          });
          fe.ide = e;
          return fe;
        });
        if (files.length > 0) await IDEFileEntity.save(files);
      }
    }
    if (applications.length > 0) {
      for (const a of applications) {
        const e = Application.create({
          name: a.name,
          path: a.path,
          icon: a.icon,
          title: a.title,
          isSelected: a.isSelected ?? true,
          relevance: a.relevance ?? 0,
        });
        e.snapshot = snap;
        await Application.save(e);
        const files = (a.files ?? []).map((f) => {
          const fe = FileEntity.create({
            name: f.name,
            path: f.path,
            isSelected: f.isSelected ?? true,
            relevance: f.relevance ?? 0,
            semanticRelevance: f.semanticRelevance,
          });
          fe.application = e;
          return fe;
        });
        if (files.length > 0) await FileEntity.save(files);
      }
    }

    snap.lastChange = new Date().toISOString();
    await snap.save();
    await UsageData.addEntry(
      'commit-task-artefacts',
      false,
      `id: ${taskId}, browsers: ${browsers.length}, ides: ${ides.length}, apps: ${applications.length}`
    );
    info(
      `[SnapshotManager] Committed artefacts to task ${taskId} (${browsers.length} browsers / ${ides.length} ides / ${applications.length} apps)`
    );
    await TrayManager.updateTray();
  }

  /**
   * Remove one committed artefact from a task and remember the deselection (so
   * it stays out of the auto-selection next time the task is active).
   */
  public async removeArtefact(
    snapshotId: number,
    kind: 'browser' | 'tab' | 'ide' | 'ideFile' | 'app' | 'file',
    artefactId: number
  ): Promise<void> {
    let usageKey: string | null = null;
    if (kind === 'tab') {
      const t = await BrowserTabEntity.findOneBy({ id: artefactId });
      if (t) usageKey = `tab:${t.url}`;
      await BrowserTabEntity.delete(artefactId);
    } else if (kind === 'ideFile') {
      const f = await IDEFileEntity.findOneBy({ id: artefactId });
      if (f) usageKey = `file:${f.path}`;
      await IDEFileEntity.delete(artefactId);
    } else if (kind === 'app') {
      const a = await Application.findOneBy({ id: artefactId });
      if (a) usageKey = `app:${a.path}`;
      await Application.delete(artefactId);
    } else if (kind === 'ide') {
      const i = await IDEEntity.findOneBy({ id: artefactId });
      if (i) usageKey = `ide:${i.path}`;
      await IDEEntity.delete(artefactId);
    } else if (kind === 'browser') {
      await BrowserEntity.delete(artefactId);
    } else if (kind === 'file') {
      const f = await FileEntity.findOneBy({ id: artefactId });
      if (f) usageKey = `file:${f.path}`;
      await FileEntity.delete(artefactId);
    }

    if (usageKey) {
      const row = await ArtifactUsage.findOneBy({ snapshotId, key: usageKey });
      if (row) {
        row.deselected = true;
        await row.save();
      }
    }
    info(
      `[SnapshotManager] Removed ${kind} ${artefactId} from task ${snapshotId}`
    );
  }
}

