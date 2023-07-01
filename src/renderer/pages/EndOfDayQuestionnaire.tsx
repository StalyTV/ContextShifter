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
import BooleanQuestion from '../components/Questionnaire/BooleanQuestion';
import OpenText from '../components/Questionnaire/OpenText';
import TaskTypeSelection from '../components/Questionnaire/TaskTypeSelection';

type Props = {};

export default function EndOfDayQuestionnaire(props: Props) {
  const [studyPhase, setStudyPhase] = useState<StudyPhase>(StudyPhase.NoStudy);
  const [snapshot1, setSnapshot1] = useState<SnapshotEntity | null>(null);
  const [snapshot2, setSnapshot2] = useState<SnapshotEntity | null>(null);
  const [answerCommon1, setAnswerCommon1] = useState<boolean | null>(null);
  const [answerCommon2, setAnswerCommon2] = useState<string>('');
  const [answerCommon3, setAnswerCommon3] = useState<string>('');
  const [answerCommon4, setAnswerCommon4] = useState<string>('');
  const [answerCommon5, setAnswerCommon5] = useState<string>('');
  const [answerCommon6, setAnswerCommon6] = useState<string>('');
  const [answerBaseline1, setAnswerBaseline1] = useState<string>('');
  const [answerBaseline2, setAnswerBaseline2] = useState<string>('');
  const [answerIntervention1_1, setAnswerIntervention1_1] =
    useState<string>('');
  const [answerIntervention1_2, setAnswerIntervention1_2] = useState<string[]>(
    []
  );
  const [answerIntervention1_2Other, setAnswerIntervention1_2Other] =
    useState<string>('');
  const [answerIntervention2_1, setAnswerIntervention2_1] =
    useState<string>('');
  const [answerIntervention2_2, setAnswerIntervention2_2] = useState<string[]>(
    []
  );
  const [answerIntervention2_2Other, setAnswerIntervention2_2Other] =
    useState<string>('');
  const [answerIntervention3, setAnswerIntervention3] = useState<string>('');
  const [answerComments, setAnswerComments] = useState<string>('');

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
    if (studyPhase === StudyPhase.Baseline) {
      const answerObj = [
        { question: questionCommon1, answer: answerCommon1 },
        { question: questionCommon2, answer: answerCommon2 },
        { question: questionCommon3, answer: answerCommon3 },
        { question: questionCommon4, answer: answerCommon4 },
        { question: questionCommon5, answer: answerCommon5 },
        { question: questionCommon6, answer: answerCommon6 },
        { question: questionBaseline1, answer: answerBaseline1 },
        { question: questionBaseline2, answer: answerBaseline2 },
        { question: questionComments, answer: answerComments },
      ];
      return JSON.stringify(answerObj);
    } else {
      const mergedAnswer1_2 = [
        ...answerIntervention1_2,
        answerIntervention1_2Other,
      ];
      const mergedAnswer2_2 = [
        ...answerIntervention2_2,
        answerIntervention2_2Other,
      ];
      const consideredSnapshots: number[] = [];
      if (snapshot1) consideredSnapshots.push(snapshot1.id);
      if (snapshot2) consideredSnapshots.push(snapshot2.id);

      const answerObj = [
        { question: questionCommon1, answer: answerCommon1 },
        { question: questionCommon2, answer: answerCommon2 },
        { question: questionCommon3, answer: answerCommon3 },
        { question: questionCommon4, answer: answerCommon4 },
        { question: questionCommon5, answer: answerCommon5 },
        { question: questionCommon6, answer: answerCommon6 },
        { question: questionIntervention1, answer: answerIntervention1_1 },
        { question: questionIntervention2, answer: mergedAnswer1_2 },
        { question: questionIntervention1, answer: answerIntervention2_1 },
        { question: questionIntervention2, answer: mergedAnswer2_2 },
        { question: questionIntervention3, answer: answerIntervention3 },
        { question: questionComments, answer: answerComments },
        { consideredSnapshots: consideredSnapshots },
      ];
      return JSON.stringify(answerObj);
    }
  };

  const getStudyPhase = async () => {
    const phase = await window.electron.ipcRenderer.invoke('get-study-phase');
    setStudyPhase(phase);
  };

  const getLastTwoSnapshotsOfToday = async () => {
    const snapshots = await window.electron.ipcRenderer.invoke(
      'get-last-two-snapshots-of-today'
    );
    if (snapshots.length > 0) {
      setSnapshot1(snapshots[0]);
    }
    if (snapshots.length > 1) {
      setSnapshot2(snapshots[1]);
    }
  };

  const getFormattedTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // questions
  const questionCommon1 = 'Did you work on multiple tasks today?';
  const questionCommon2 =
    'Did you have to _instantly_ switch from one task to another today? If yes, what triggered that particular task switch?';
  const questionCommon2HTML = (
    <span>
      Did you have to <u>instantly</u> switch from one task to another today? If
      yes, what triggered that particular task switch?
    </span>
  );
  const questionCommon3 = 'Briefly describe your _most recent_ task switch';
  const questionCommon3HTML = (
    <span>
      Briefly describe your <u>most recent</u> task switch
    </span>
  );
  const questionCommon4 =
    'For your _most recent_ task switch today, how much time did you need to restore the _working context_ (apps, windows, files…) of the task?';
  const questionCommon4HTML = (
    <span>
      For your <u>most recent</u> task switch today, how much time did you need
      to restore the <u>working context</u> (apps, windows, files…) of the task?
    </span>
  );
  const questionCommon5 =
    'For your _most recent_ task switch today, how much time did you need to restore the _mental context_ (goals, plans, mental model…) of the task?';
  const questionCommon5HTML = (
    <span>
      For your <u>most recent</u> task switch today, how much time did you need
      to restore the <u>mental context</u> (goals, plans, mental model…) of the
      task?
    </span>
  );
  const questionCommon6 = 'Overall, I felt that my workspace was...';

  const questionBaseline1 = `Today, how did you keep track of important task information that might be needed later? (if it's the same method that you described yesterday in detail, please state so instead)`;
  const questionBaseline2 =
    'Was there a situation today where a tool to support your task switching and resumption would have been helpful? If yes, how could it have helped you?';

  const questionIntervention1 =
    'What was your motivation to create a snapshot at this point?';
  const questionIntervention2 = 'What was this task about?';
  const questionIntervention3 =
    'Have there been additional task switches that you did not capture by a snapshot? What was the reason for not creating one?';

  const questionComments = 'Additional Comments';

  // answers
  const likertOptionsTime = [
    'almost no time',
    'little time',
    'moderate amount of time',
    'quite a bit of time',
    'much time',
  ];

  const likertOptionsClutter = [
    'less cluttered than usual',
    'slightly less cluttered than usual',
    'as cluttered as usual',
    'slightly more cluttered than usual',
    'more cluttered than usual',
  ];

  useEffect(() => {
    getStudyPhase();
    getLastTwoSnapshotsOfToday();
  }, []);

  const commonPart = () => (
    <div className={styles.section}>
      <div>
        <BooleanQuestion title={questionCommon1} onSelect={setAnswerCommon1} />
      </div>
      {answerCommon1 ? (
        <>
          <OpenText
            title={questionCommon2}
            htmlTitle={questionCommon2HTML}
            text={answerCommon2}
            onTextChange={setAnswerCommon2}
            rows={3}
          />
          <p className={styles.questionIntro}>
            Please consider your most recent task switch of the day...
          </p>
          <OpenText
            title={questionCommon3}
            text={answerCommon3}
            htmlTitle={questionCommon3HTML}
            onTextChange={setAnswerCommon3}
            rows={2}
          />
          <LikertScale
            title={questionCommon4}
            htmlTitle={questionCommon4HTML}
            options={likertOptionsTime}
            onSelect={setAnswerCommon4}
          />
          <LikertScale
            title={questionCommon5}
            htmlTitle={questionCommon5HTML}
            options={likertOptionsTime}
            onSelect={setAnswerCommon5}
          />
        </>
      ) : null}
      <LikertScale
        title={questionCommon6}
        options={likertOptionsClutter}
        onSelect={setAnswerCommon6}
      />
    </div>
  );

  const baselinePart = () => (
    <div className={`${styles.section} ${styles.noMarginTop}`}>
      <OpenText
        title={questionBaseline1}
        text={answerBaseline1}
        onTextChange={setAnswerBaseline1}
        rows={3}
      />
      <OpenText
        title={questionBaseline2}
        text={answerBaseline2}
        onTextChange={setAnswerBaseline2}
        rows={3}
      />
    </div>
  );

  const interventionPart = () => (
    <>
      {snapshot1 ? (
        <div className={styles.section}>
          <h3>
            You created the following snapshot today at{' '}
            {getFormattedTime(snapshot1.created)}
          </h3>
          <SnapshotPreview snapshot={snapshot1} isExpanded={true} />
          <OpenText
            title={questionIntervention1}
            text={answerIntervention1_1}
            onTextChange={setAnswerIntervention1_1}
            rows={3}
          />
          <TaskTypeSelection
            title={questionIntervention2}
            onSelectionChange={setAnswerIntervention1_2}
            onOtherChange={setAnswerIntervention1_2Other}
          />
        </div>
      ) : null}
      {snapshot2 ? (
        <div className={styles.section}>
          <h3>
            You created the following snapshot today at{' '}
            {getFormattedTime(snapshot2.created)}
          </h3>
          <SnapshotPreview snapshot={snapshot2} isExpanded={true} />
          <OpenText
            title={questionIntervention1}
            text={answerIntervention2_1}
            onTextChange={setAnswerIntervention2_1}
            rows={3}
          />
          <TaskTypeSelection
            title={questionIntervention2}
            onSelectionChange={setAnswerIntervention2_2}
            onOtherChange={setAnswerIntervention2_2Other}
          />
        </div>
      ) : null}

      <div className={`${styles.section} ${styles.noMarginTop}`}>
        <OpenText
          title={questionIntervention3}
          text={answerIntervention3}
          onTextChange={setAnswerIntervention3}
          rows={3}
        />
      </div>
    </>
  );

  return (
    <>
      <div className={styles.header}>
        <h1>End-of-Workday Questionnaire</h1>
        <div className={styles.postponeContainer}>
          <PostponeButton
            isFilled={false}
            title={'Postpone Questionnaire'}
            onSelect={postponeQuestionnaire}
          />
        </div>
      </div>
      <p className={styles.introText}>
        For the following questions and statements, please consider{' '}
        <b>only this past work day</b>:
      </p>
      {commonPart()}
      {studyPhase === StudyPhase.Baseline ? baselinePart() : interventionPart()}
      <div className={`${styles.section} ${styles.noMarginTop}`}>
        <OpenText
          title={questionComments}
          text={answerComments}
          onTextChange={setAnswerComments}
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
