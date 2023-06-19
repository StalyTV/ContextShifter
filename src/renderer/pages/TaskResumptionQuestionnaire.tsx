/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { useState, useEffect } from 'react';
import styles from './TaskResumptionQuestionnaire.module.scss';
import Button from '../components/Button';
import OpenText from 'renderer/components/Questionnaire/OpenText';

type Props = {};

export default function TaskResumptionQuestionnaire(props: Props) {
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [answerQ1, setAnswerQ1] = useState<string>('');

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
    const answerObj = [{ question: question01, answer: answerQ1 }];
    return JSON.stringify(answerObj);
  };

  // questions
  const question01 = 'How did you re-identify the selected snapshot?';

  const setQ1 = async (text: string) => {
    setAnswerQ1(text);
  };

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
        <OpenText
          title={question01}
          text={answerQ1}
          onTextChange={setQ1}
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
