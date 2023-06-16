/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import { useState, useEffect } from 'react';
import styles from './EndOfDayQuestionnaire.module.scss';
import PostponeButton from '../components/PostponeButton';
import Button from '../components/Button';
import LikertScale from '../components/Questionnaire/LikertScale';
import { StudyPhase } from '../../types/StudyPhase';

type Props = {};

export default function EndOfDayQuestionnaire(props: Props) {
  const [studyPhase, setStudyPhase] = useState<StudyPhase>(StudyPhase.NoStudy);
  const [answerQ1, setAnswerQ1] = useState<string>('');

  const onClickSave = async () => {
    try {
      await window.electron.ipcRenderer.invoke(
        'save-end-of-day-questionnaire',
        getFormattedAnswers()
      );
    } catch (err) {
      console.error(err);
    }
  };

  const postponeQuestionnaire = async (minutes: number) => {
    try {
      await window.electron.ipcRenderer.invoke(
        'postpone-end-of-day-questionnaire',
        minutes
      );
    } catch (err) {
      console.error(err);
    }
  };

  const getFormattedAnswers = (): string => {
    const answerObj = [{ question: question01, answer: answerQ1 }];
    return JSON.stringify(answerObj);
  };

  const getStudyPhase = async () => {
    const phase = await window.electron.ipcRenderer.invoke('get-study-phase');
    setStudyPhase(phase);
  };

  // questions
  const question01 = 'Overall, how satisfied are you with your workday?';

  // answers
  const likertOptions = [
    'not at all',
    'rarely',
    'sometimes',
    'often',
    'all the time',
  ];

  const setQ1 = (answer: string): void => {
    setAnswerQ1(answer);
  };

  useEffect(() => {
    getStudyPhase();
  }, []);

  return (
    <>
      <h1>End-of-Workday Questionnaire</h1>
      <div className={styles.postponeContainer}>
        <PostponeButton
          isFilled={false}
          title={'Postpone Questionnaire'}
          onSelect={postponeQuestionnaire}
        />
      </div>
      <p>
        For the following questions and statements, please consider{' '}
        <b>only this past work day</b>:
      </p>
      <div>
        <LikertScale
          title={question01}
          options={likertOptions}
          onSelect={setQ1}
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
