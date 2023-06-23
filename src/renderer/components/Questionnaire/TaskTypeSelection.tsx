/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import { useState } from 'react';
import styles from './TaskTypeSelection.module.scss';

type Props = {
  title: string;
  onSelectionChange: (selection: string[]) => void;
};

export default function TaskTypeSelection(props: Props) {
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
            id="development"
            name="development"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="development">Development</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="coding"
            name="coding"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="coding">Coding</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="debugging"
            name="debugging"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="debugging">Debugging</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="testing"
            name="testing"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="testing">Testing</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="navigation"
            name="navigation"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="navigation">Navigation</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="search"
            name="search"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="search">Search</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="documentation"
            name="documentation"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="documentation">Documentation</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="codeReview"
            name="codeReview"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="codeReview">Code Review</label>
        </div>
        <div className={styles.option}>
          <input
            className={styles.subOption}
            type="checkbox"
            id="specification"
            name="specification"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="specification">Specification</label>
        </div>

        <div className={styles.option}>
          <input
            type="checkbox"
            id="personal"
            name="personal"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="personal">Personal</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="awareness"
            name="awareness"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="awareness">Awareness & Teamwork </label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="administrative"
            name="administrative"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="administrative">Administrative</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="plannedMeeting "
            name="plannedMeeting"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="plannedMeeting">Planned Meeting</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="unplannedMeeting "
            name="unplannedMeeting"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="unplannedMeeting">Unplanned Meeting</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="planning"
            name="planning"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="planning">Planning</label>
        </div>
        <div className={styles.option}>
          <input
            type="checkbox"
            id="study"
            name="study"
            onChange={handleCheckboxChange}
          />
          <label htmlFor="study">Work related to this study </label>
        </div>
      </fieldset>
    </div>
  );
}
