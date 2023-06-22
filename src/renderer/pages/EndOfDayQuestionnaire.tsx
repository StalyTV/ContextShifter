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
import SnapshotEntity from '../../main/entity/Snapshot';
import SnapshotPreview from '../components/Gallery/SnapshotPreview';

type Props = {};

export default function EndOfDayQuestionnaire(props: Props) {
  const [studyPhase, setStudyPhase] = useState<StudyPhase>(StudyPhase.NoStudy);
  const [lastTwoSnapshotsOfToday, setLastTwoSnapshotsOfToday] = useState<
    SnapshotEntity[]
  >([]);
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

  const getLastTwoSnapshotsOfToday = async () => {
    const snapshots = await window.electron.ipcRenderer.invoke(
      'get-last-two-snapshots-of-today'
    );
    setLastTwoSnapshotsOfToday(snapshots);
  };

  const getFormattedTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
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
    getLastTwoSnapshotsOfToday();
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
      {studyPhase === StudyPhase.Intervention ? (
        <div>
          {lastTwoSnapshotsOfToday.map((snapshot) => {
            return (
              <div className={styles.snapshotExample} key={snapshot.id}>
                <h3>
                  You created the following snapshot today at{' '}
                  {getFormattedTime(snapshot.created)}
                </h3>
                <SnapshotPreview snapshot={snapshot} isExpanded={true} />
              </div>
            );
          })}
        </div>
      ) : null}
      <div className={styles.saveContainer}>
        <Button isFilled={true} onClick={() => onClickSave()} disabled={false}>
          Save
        </Button>
      </div>
    </>
  );
}
