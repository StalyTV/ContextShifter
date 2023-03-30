/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './File.module.scss';
import Artifact from '../../types/Artifact';
import FileEntity from 'main/entity/File';

type Props = {
  applicationPath: string;
  file: FileEntity;
};

export default function File(props: Props) {
  const openFile = async () => {
    const artifact: Artifact = {
      artifact: props.file.path,
      application: props.applicationPath,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  return (
    <div
      className={`${styles.file} ${
        props.file.isSelected ? styles.isSelected : undefined
      }`}
      onContextMenu={() => openFile()}
    >
      {props.file.path}
    </div>
  );
}
