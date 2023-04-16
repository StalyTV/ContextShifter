/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './IDE.module.scss';
import IDEEntity from '../../main/entity/IDE';
import IDEFileEntity from '../../main/entity/IDEFile';
import IDEFile from './IDEFile';
import GitInfo from './GitInfo';
import { useState } from 'react';

type Props = {
  ide: IDEEntity;
  updateIDE: (updatedIDE: IDEEntity) => void;
};

export default function IDE(props: Props) {
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const toggleSelect = () => {
    const updatedIDE = props.ide;
    updatedIDE.isSelected = !props.ide.isSelected;

    // if ide gets deselected, deselect all associated files
    if (!updatedIDE.isSelected) {
      for (const file of updatedIDE.ideFiles) {
        file.isSelected = false;
      }
    }
    props.updateIDE(updatedIDE);
  };

  const updateFile = (updatedFile: IDEFileEntity) => {
    const updatedIDE = props.ide;
    const fileToUpdate = updatedIDE.ideFiles.find(
      (f) => f.id === updatedFile.id
    );
    if (fileToUpdate) {
      fileToUpdate.isSelected = updatedFile.isSelected;

      // if file gets selected, also ide is selected
      if (fileToUpdate.isSelected) {
        updatedIDE.isSelected = true;
      }
      props.updateIDE(updatedIDE);
    }
  };

  return (
    <div
      className={`${styles.ide} ${
        props.ide.isSelected ? styles.isSelected : undefined
      }`}
      onClick={() => toggleSelect()}
      onMouseEnter={() => {
        setIsHovering(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
      }}
    >
      <div className={styles.info}>
        <span>{props.ide.name}</span>
        {isHovering ? (
          <GitInfo
            branch={props.ide.branch}
            lastCommitMessage={props.ide.lastCommitMessage}
          />
        ) : null}
      </div>

      <div className={styles.fileContainer}>
        {props.ide.ideFiles.map((file) => (
          <IDEFile key={file.id} file={file} updateFile={updateFile} />
        ))}
      </div>
    </div>
  );
}
