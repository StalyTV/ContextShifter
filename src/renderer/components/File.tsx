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
  updateFile: (updatedFile: FileEntity) => void;
};

export default function File(props: Props) {
  const toggleSelect = (e: React.MouseEvent) => {
    // makes sure Application is not clicked as well
    e.stopPropagation();

    const updatedFile = props.file;
    updatedFile.isSelected = !props.file.isSelected;
    props.updateFile(updatedFile);
  };

  return (
    <div
      className={`${styles.file} ${
        props.file.isSelected ? styles.isSelected : undefined
      }`}
      onClick={toggleSelect}
    >
      {props.file.name}
    </div>
  );
}
