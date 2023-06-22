/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import SnapshotEntity from 'main/entity/Snapshot';
import styles from './SnapshotPreview.module.scss';
import CameraIcon from '../Icons/CameraIcon';
import EditIcon from '../Icons/EditIcon';
import BrowserPreview from './BrowserPreview';
import IDEPreview from './IDEPreview';
import ApplicationPreview from './ApplicationPreview';

type Props = {
  snapshot: SnapshotEntity;
  isExpanded: boolean;
};

export default function SnapshotPreview(props: Props) {
  const getSelectedApplications = () => {
    return props.snapshot.applications.filter((app) => {
      if (!app.isSelected) {
        return false;
      } else {
        return true;
      }
    });
  };

  const getSelectedBrowsers = () => {
    return props.snapshot.browsers.filter((browser) => browser.isSelected);
  };

  const getSelectedIDEs = () => {
    return props.snapshot.ides.filter((ide) => ide.isSelected);
  };

  const getFormattedTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  return (
    <div className={styles.snapshotPreviewContainer}>
      <div className={styles.left}>
        <div className={styles.upper}>
          <div className={styles.timeAndName}>
            <div className={styles.time}>
              {getFormattedTime(props.snapshot.lastChange)}
              {props.snapshot.lastChange === props.snapshot.created ? (
                <CameraIcon className={styles.icon} />
              ) : (
                <EditIcon className={styles.icon} />
              )}
            </div>
            <div className={styles.name}>{props.snapshot.name}</div>
          </div>
        </div>

        <div className={styles.lower}>
          <div
            className={`${styles.applications} ${
              props.isExpanded ? styles.isExpanded : undefined
            }`}
          >
            {getSelectedBrowsers().map((browser) => {
              return (
                <BrowserPreview
                  key={browser.id}
                  browser={browser}
                  isExpanded={props.isExpanded}
                />
              );
            })}
            {getSelectedIDEs().map((ide) => {
              return (
                <IDEPreview
                  key={ide.id}
                  ide={ide}
                  isExpanded={props.isExpanded}
                />
              );
            })}
            {getSelectedApplications().map((app) => {
              return <ApplicationPreview key={app.id} app={app} />;
            })}
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.postIt}>
          <span
            className={styles.postItIcon}
            data-tooltip-id={'task-snap'}
            data-tooltip-content={'What was I doing?'}
          >
            ⏪
          </span>
          <span>{props.snapshot.summary}</span>
        </div>
        {props.isExpanded ? (
          <div className={`${styles.postIt} ${styles.intent}`}>
            <span
              className={styles.postItIcon}
              data-tooltip-id={'task-snap'}
              data-tooltip-content={'What was I about to do?'}
            >
              💭
            </span>
            <span>{props.snapshot.intent}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
