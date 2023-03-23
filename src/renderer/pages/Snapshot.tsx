/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { useState } from 'react';
import Button from 'renderer/components/Button';

export default function Snapshot() {
  const [applications, setApplications] = useState<string[]>([]);

  const fetchApplications = async () => {
    const applications = await window.electron.ipcRenderer.invoke(
      'get-used-applications'
    );
    setApplications(applications);
  };

  const openApplication = async (app: string) => {
    await window.electron.ipcRenderer.invoke('open-application', app);
  };

  return (
    <>
      <h1>Snapshot</h1>
      <Button onClick={() => fetchApplications()}>Refresh Applications</Button>
      {applications.map((app) => {
        return (
          <div
            key={app}
            className="application"
            onClick={() => openApplication(app)}
          >
            {app}
          </div>
        );
      })}
    </>
  );
}
