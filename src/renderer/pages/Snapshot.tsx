/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import SnapshotEntity from 'main/entity/Snapshot';
import { useEffect, useState } from 'react';
import File from 'renderer/components/File';

export default function Snapshot() {
  const [latestSnapshot, setLatestSnapshot] = useState<SnapshotEntity | null>(
    null
  );

  const fetchLatestSnapshot = async () => {
    const snapshot = await window.electron.ipcRenderer.invoke(
      'get-latest-snapshot'
    );
    setLatestSnapshot(snapshot);
  };

  const openApplication = async (app: string) => {
    await window.electron.ipcRenderer.invoke('open-artifact', app);
  };

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  return (
    <>
      {latestSnapshot ? (
        <>
          <h1>{latestSnapshot.name}</h1>
          {latestSnapshot.applications.map((app) => {
            return (
              <div
                key={app.name}
                className="application"
                onClick={() => openApplication(app.path)}
              >
                {app.name}
                {app.files.map((file) => (
                  <File path={file.path} />
                ))}
              </div>
            );
          })}
        </>
      ) : (
        <p>Error: No Snapshot found</p>
      )}
    </>
  );
}
