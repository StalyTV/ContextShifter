/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './PostIt.module.scss';
import Button from 'renderer/components/Button';
import InfoIcon from './Icons/InfoIcon';

type Props = {
  title: string;
  content: string;
  infoMessage?: string;
  onTextChange: (text: string) => {};
};

export default function PostIt(props: Props) {
  const onTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onTextChange(e.target.value);
  };

  const onClickClear = async () => {
    props.onTextChange('');
  };

  return (
    <div className={styles.postIt}>
      <div className={styles.header}>
        <div className={styles.postItTitle}>
          <span>{props.title}</span>
          {props.infoMessage ? (
            <InfoIcon
              className={styles.infoIcon}
              data-tooltip-id={'task-snap'}
              data-tooltip-html={props.infoMessage}
            />
          ) : null}
        </div>
        <div className={styles.buttonContainer}>
          <Button
            className={styles.clearButton}
            isFilled={false}
            onClick={() => {
              onClickClear();
            }}
          >
            Clear
          </Button>
        </div>
      </div>
      <div className={styles.postItBody}>
        <textarea value={props.content} onChange={onTextChange} />
      </div>
    </div>
  );
}
