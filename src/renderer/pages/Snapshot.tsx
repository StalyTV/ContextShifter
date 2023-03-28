/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import SnapshotEntity from 'main/entity/Snapshot';
import { useEffect, useState } from 'react';
import Application from 'renderer/components/Application';

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

  useEffect(() => {
    fetchLatestSnapshot();
  }, []);

  return (
    <>
      {latestSnapshot ? (
        <>
          <h1>{latestSnapshot.name}</h1>
          {latestSnapshot.applications.map((app) => (
            <Application app={app} />
          ))}
        </>
      ) : (
        <p>Error: No Snapshot found</p>
      )}
    </>
  );
}
