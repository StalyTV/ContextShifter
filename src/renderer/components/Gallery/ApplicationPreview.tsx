/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './ApplicationPreview.module.scss';
import ApplicationEntity from '../../../main/entity/Application';
import Artifact from 'types/Artifact';

type Props = {
  app: ApplicationEntity;
};

export default function ApplicationPreview(props: Props) {
  const getFiles = () => {
    return props.app.files.filter((file) => file.isSelected);
  };

  const onClickApplicationIcon = async (e: React.MouseEvent) => {
    // makes sure Preview is not expanded
    e.stopPropagation();

    const artifact: Artifact = {
      artifact: props.app.path,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const onClickFile = async (e: React.MouseEvent, path: string) => {
    // makes sure Preview is not expanded
    e.stopPropagation();

    const artifact: Artifact = {
      artifact: path,
      application: props.app.path,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const hasFiles = (): boolean => {
    return getFiles().length > 0;
  };

  return (
    <div
      className={`${styles.previewContainer} ${
        hasFiles() ? styles.hasFiles : undefined
      }`}
    >
      <img
        className={styles.appIcon}
        src={props.app.icon}
        data-tooltip-id={'task-snap'}
        data-tooltip-content={props.app.title}
        onClick={onClickApplicationIcon}
      />
      {getFiles().map((file) => {
        return (
          <div
            key={file.id}
            className={styles.file}
            onClick={(e) => onClickFile(e, file.path)}
          >
            {file.name}
          </div>
        );
      })}
    </div>
  );
}
