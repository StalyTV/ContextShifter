/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { useState, useEffect } from 'react';
import styles from './TaskResumptionQuestionnaire.module.scss';
import Button from '../components/Button';
import OpenText from 'renderer/components/Questionnaire/OpenText';
import LikertScale from '../components/Questionnaire/LikertScale';
import GalleryFeatureSelection from '../components/Questionnaire/GalleryFeatureSelection';

type Props = {};

export default function TaskResumptionQuestionnaire(props: Props) {
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [answer1, setAnswer1] = useState<string>('');
  const [answer2, setAnswer2] = useState<string[]>([]);
  const [answer2Other, setAnswer2Other] = useState<string>('');
  const [answer3, setAnswer3] = useState<string>('');

  const registerEventListeners = () => {
    window.electron.onSnapshotSelected((e, id) => setSnapshotId(id));
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotSelected();
  };

  const onClickSave = async () => {
    try {
      await window.electron.ipcRenderer.invoke(
        'save-task-resumption-questionnaire',
        getFormattedAnswers(),
        snapshotId
      );
    } catch (err) {
      console.error(err);
    }
  };

  const getFormattedAnswers = (): string => {
    const mergedAnswer2 = [...answer2, answer2Other];
    const answerObj = [
      { question: question1, answer: answer1 },
      { question: question2, answer: mergedAnswer2 },
      { question: question3, answer: answer3 },
    ];
    return JSON.stringify(answerObj);
  };

  // questions
  const question1 =
    'How difficult was it to reidentify this task from the Snapshot Gallery?';
  const question2 =
    'Which features or information helped you to reidentify the snapshot?';
  const question3 =
    'Is there something that could have helped you better reidentify the snapshot? And if so what?';

  // answers
  const likertOptionsDifficulty = [
    'very difficult',
    'difficult',
    'neither difficult nor easy',
    'easy',
    'very easy',
  ];

  useEffect(() => {
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      <h1>Task Resumption Questionnaire</h1>
      <p>
        For the snapshot you just resumed, please answer the following
        questions:
      </p>
      <div>
        <LikertScale
          title={question1}
          options={likertOptionsDifficulty}
          onSelect={setAnswer1}
        />
        <GalleryFeatureSelection
          title={question2}
          onSelectionChange={setAnswer2}
          onOtherChange={setAnswer2Other}
        />
        <OpenText
          title={question3}
          text={answer3}
          onTextChange={setAnswer3}
          rows={3}
        />
      </div>

      <div className={styles.saveContainer}>
        <Button isFilled={true} onClick={() => onClickSave()} disabled={false}>
          Save
        </Button>
      </div>
    </>
  );
}
