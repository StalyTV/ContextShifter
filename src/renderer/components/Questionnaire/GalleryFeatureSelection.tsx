/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import { useState } from 'react';
import styles from './GalleryFeatureSelection.module.scss';

type Props = {
  title: string;
  onSelectionChange: (selection: string[]) => void;
};

export default function GalleryFeatureSelection(props: Props) {
  const [selection, setSelection] = useState<string[]>([]);

  const handleCheckboxChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const option = e.target.name;
    let updatedSelection = selection;
    if (e.target.checked) {
      updatedSelection.push(option);
    } else {
      updatedSelection = updatedSelection.filter((elem) => elem !== option);
    }
    props.onSelectionChange(updatedSelection);
    setSelection(updatedSelection);
  };

  return (
    <div>
      <h4 className={styles.title}>{props.title}</h4>
      <fieldset>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="snapshotName "
            name="snapshotName"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="snapshotName">Snapshot Name</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="timestamp"
            name="timestamp"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="timestamp">Timestamp</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="search"
            name="search"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="search">Search</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="position"
            name="position"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="position">Position of snapshot in list</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="applicationIcons"
            name="applicationIcons"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="applicationIcons">Application Icons</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="listedArtifacts"
            name="listedArtifacts"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="listedArtifacts">Listed Artifacts</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="summary"
            name="summary"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="summary">
            Task summary text (⏪ What was I doing?)
          </label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="intent"
            name="intent"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="intent">
            Task intent text (💭 What was I about to do?)
          </label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="gitInformation"
            name="gitInformation"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="gitInformation">Git Information</label>
        </div>
      </fieldset>
    </div>
  );
}
