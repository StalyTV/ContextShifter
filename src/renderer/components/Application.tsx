/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Application.module.scss';
import Artifact from '../../types/Artifact';
import ApplicationEntity from '../../main/entity/Application';
import File from './File';
import FileEntity from 'main/entity/File';

type Props = {
  app: ApplicationEntity;
  updateApplication: (updatedApp: ApplicationEntity) => void;
};

export default function Application(props: Props) {
  const openApplication = async (app: string) => {
    const artifact: Artifact = { artifact: app };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const toggleSelect = () => {
    const updatedApp = props.app;
    updatedApp.isSelected = !props.app.isSelected;
    props.updateApplication(updatedApp);
  };

  const updateFile = (updatedFile: FileEntity) => {
    const updatedApp = props.app;
    const fileToUpdate = updatedApp.files.find((f) => f.id === updatedFile.id);
    if (fileToUpdate) {
      fileToUpdate.isSelected = updatedFile.isSelected;
      props.updateApplication(updatedApp);
    }
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
        <File
          key={file.id}
          applicationPath={props.app.path}
          file={file}
          updateFile={updateFile}
        />
      ))}
    </div>
  );
}
