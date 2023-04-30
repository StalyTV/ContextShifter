/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { useState } from 'react';
import EditIcon from '../Icons/EditIcon';
import styles from './SnapshotPreview.module.scss';
import SnapshotEntity from 'main/entity/Snapshot';
import Button from '../Button';
import ArrowRightIcon from '../Icons/ArrowRightIcon';
import TrashIcon from '../Icons/TrashIcon';
import { toast } from 'react-toastify';
import BrowserPreview from './BrowserPreview';
import IDEPreview from './IDEPreview';
import ApplicationPreview from './ApplicationPreview';
import Artifact from 'types/Artifact';

type Props = {
  snapshot: SnapshotEntity;
  onDelete: () => void;
};

export default function SnapshotPreview(props: Props) {
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const getSelectedApplicationsWithoutFiles = () => {
    return props.snapshot.applications.filter((app) => {
      if (!app.isSelected) {
        return false;
      } else {
        return !app.files.some((file) => file.isSelected);
      }
    });
  };

  const getSelectedApplicationsWithFiles = () => {
    return props.snapshot.applications.filter((app) => {
      if (!app.isSelected) {
        return false;
      } else {
        return app.files.some((file) => file.isSelected);
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

  const onClickApplication = async (e: React.MouseEvent, path: string) => {
    // makes sure Preview is not expanded
    e.stopPropagation();

    const artifact: Artifact = {
      artifact: path,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  const onClickEdit = async () => {
    await window.electron.ipcRenderer.invoke(
      'open-snapshot',
      props.snapshot.id
    );
  };

  const onClickDelete = async () => {
    if (
      confirm(
        `Are you sure that you want to delete "${props.snapshot.name}"?`
      ) === true
    ) {
      try {
        toast.promise(
          async () =>
            await window.electron.ipcRenderer.invoke(
              'delete-snapshot',
              props.snapshot.id
            ),
          {
            pending: 'Deleting Snapshot...',
            success: 'Snapshot Deleted',
            error: 'Something went wrong',
          }
        );
        props.onDelete();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const onClickRestore = async () => {
    await window.electron.ipcRenderer.invoke(
      'restore-snapshot',
      props.snapshot.id
    );
  };

  return (
    <div
      className={styles.singleSnapshot}
      onMouseEnter={() => {
        setIsHovering(true);
      }}
      onMouseLeave={() => {
        setIsHovering(false);
      }}
    >
      <div
        className={styles.snapshotPreviewContainer}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={styles.left}>
          <div className={styles.upper}>
            <div className={styles.timeAndName}>
              <div className={styles.time}>
                {getFormattedTime(props.snapshot.created)}
              </div>
              <div className={styles.name}>{props.snapshot.name}</div>
            </div>
            <div className={styles.applications}>
              {getSelectedApplicationsWithoutFiles().map((app) => {
                return (
                  <img
                    key={app.id}
                    className={styles.icon}
                    src={app.icon}
                    onClick={(e) => onClickApplication(e, app.path)}
                    data-tooltip-id={'task-snap'}
                    data-tooltip-content={app.title}
                  />
                );
              })}
            </div>
          </div>

          <div className={styles.lower}>
            <div className={styles.applicationsWithMoreContext}>
              {getSelectedBrowsers().map((browser) => {
                return (
                  <BrowserPreview
                    key={browser.id}
                    browser={browser}
                    isExpanded={isExpanded}
                  />
                );
              })}
              {getSelectedIDEs().map((ide) => {
                return (
                  <IDEPreview key={ide.id} ide={ide} isExpanded={isExpanded} />
                );
              })}
              {getSelectedApplicationsWithFiles().map((app) => {
                return <ApplicationPreview key={app.id} app={app} />;
              })}
            </div>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.postIt}>⏪ {props.snapshot.summary}</div>
          {isExpanded ? (
            <div className={`${styles.postIt} ${styles.intent}`}>
              💭 {props.snapshot.intent}
            </div>
          ) : null}
        </div>
      </div>
      {isHovering ? (
        <div className={styles.buttonBox}>
          <div
            className={styles.dot}
            onClick={() => {
              onClickEdit();
            }}
          >
            <EditIcon className={styles.icon} />
          </div>
          <div
            className={`${styles.dot} ${styles.delete}`}
            onClick={() => {
              onClickDelete();
            }}
          >
            <TrashIcon className={styles.icon} />
          </div>
          <Button
            className={styles.restore}
            isFilled={true}
            onClick={() => onClickRestore()}
          >
            <span>Restore&nbsp;</span>
            <ArrowRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
