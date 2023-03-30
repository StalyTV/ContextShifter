/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Application.module.scss';
import Artifact from '../../types/Artifact';
import ApplicationEntity from '../../main/entity/Application';
import File from './File';

type Props = {
  app: ApplicationEntity;
  toggleSelect: (appId: number) => void;
};

export default function Application(props: Props) {
  const openApplication = async (app: string) => {
    const artifact: Artifact = { artifact: app };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const toggleSelect = () => {
    props.toggleSelect(props.app.id);
  };

  return (
    <div
      key={props.app.name}
      className={`${styles.application} ${
        props.app.isSelected ? styles.isSelected : undefined
      }`}
      onClick={() => toggleSelect()}
      onContextMenu={() => openApplication(props.app.path)}
    >
      {props.app.name}
      {props.app.files.map((file) => (
        <File applicationPath={props.app.path} file={file} />
      ))}
    </div>
  );
}
