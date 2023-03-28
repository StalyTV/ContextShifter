/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Artifact from '../../types/Artifact';

type Props = {
  applicationPath: string;
  path: string;
};

export default function File(props: Props) {
  const openFile = async () => {
    const artifact: Artifact = {
      artifact: props.path,
      application: props.applicationPath,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  return (
    <div className={'file'} onClick={() => openFile()}>
      {props.path}
    </div>
  );
}
