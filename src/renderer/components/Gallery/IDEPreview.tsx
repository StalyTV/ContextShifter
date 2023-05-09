/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './IDEPreview.module.scss';
import IDEEntity from '../../../main/entity/IDE';
import ReactDOMServer from 'react-dom/server';
import GitInfo from '../GitInfo';
import IDEFileEntity from '../../../main/entity/IDEFile';
import Artifact from 'types/Artifact';
import EyeIcon from '../Icons/EyeIcon';

type Props = {
  ide: IDEEntity;
  isExpanded: boolean;
};

export default function IDEPreview(props: Props) {
  const getFiles = () => {
    if (props.isExpanded) {
      return props.ide.ideFiles.filter((file) => file.isSelected);
    } else {
      return props.ide.ideFiles.filter(
        (file) => file.isSelected && file.isActive
      );
    }
  };

  const hasFiles = (): boolean => {
    return getFiles().length > 0;
  };

  const onClickApplicationIcon = async (e: React.MouseEvent) => {
    // makes sure Preview is not expanded
    e.stopPropagation();

    const artifact: Artifact = {
      artifact: props.ide.workspacePath
        ? props.ide.workspacePath
        : props.ide.path,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const onClickFile = async (e: React.MouseEvent, file: IDEFileEntity) => {
    // makes sure Preview is not expanded
    e.stopPropagation();
    await window.electron.ipcRenderer.invoke('open-ide-file', props.ide, file);
  };

  const tooltip =
    props.ide.branch ||
    props.ide.lastCommitMessage ||
    props.ide.workspaceName ? (
      <GitInfo
        branch={props.ide.branch}
        lastCommitMessage={props.ide.lastCommitMessage}
        workspaceName={props.ide.workspaceName}
      />
    ) : (
      <></>
    );

  return (
    <div
      className={`${styles.previewContainer} ${
        hasFiles() ? styles.hasFiles : undefined
      }`}
      data-tooltip-id={'task-snap'}
      data-tooltip-html={ReactDOMServer.renderToStaticMarkup(tooltip)}
    >
      <img
        className={styles.ideIcon}
        src={props.ide.icon}
        data-tooltip-id={'task-snap'}
        data-tooltip-content={props.ide.title}
        onClick={onClickApplicationIcon}
      />
      {getFiles().map((file) => {
        return (
          <div
            key={file.id}
            className={styles.file}
            onClick={(e) => onClickFile(e, file)}
          >
            <span>{file.name}</span>
            {file.isActive ? <EyeIcon className={styles.eyeIcon} /> : null}
          </div>
        );
      })}
    </div>
  );
}
