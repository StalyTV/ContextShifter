/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import React, { useState } from 'react';
import Button from 'renderer/components/Button';

export default function NewSnapshot() {
  const [applications, setApplications] = useState<string[]>([]);

  window.electron.ipcRenderer.once('get-used-applications', (arg) => {
    console.log('received apps', arg);
    const receivedApps = arg as string[];
    setApplications(receivedApps);
  });

  const fetchApplications = () => {
    window.electron.ipcRenderer.sendMessage('get-used-applications', []);
  };

  const openApplication = (app: string) => {
    window.electron.ipcRenderer.sendMessage('open-application', [app]);
  };

  return (
    <>
      <h1>New Task Snap</h1>
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
