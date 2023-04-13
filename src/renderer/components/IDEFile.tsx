/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './IDEFile.module.scss';
import EyeIcon from './Icons/EyeIcon';
import IDEFileEntity from '../../main/entity/IDEFile';

type Props = {
  file: IDEFileEntity;
  updateFile: (updatedFile: IDEFileEntity) => void;
};

export default function IDEFile(props: Props) {
  const toggleSelect = (e: React.MouseEvent) => {
    // makes sure IDE is not clicked as well
    e.stopPropagation();

    const updatedFile = props.file;
    updatedFile.isSelected = !props.file.isSelected;
    props.updateFile(updatedFile);
  };

  return (
    <div
      className={`${styles.ideFile} ${
        props.file.isSelected ? styles.isSelected : undefined
      }`}
      onClick={toggleSelect}
    >
      {props.file.isActive ? <EyeIcon className={styles.icon} /> : null}
      <span>{props.file.path}</span>
    </div>
  );
}
