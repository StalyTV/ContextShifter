/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './SnapshotGallery.module.scss';
import { useEffect, useState } from 'react';
import SnapshotEntity from '../../main/entity/Snapshot';
import GalleryEntry from '../components/Gallery/GalleryEntry';
import NavBar from '../components/Navigation/NavBar';
import Button from 'renderer/components/Button';
import Input from 'renderer/components/Input';
import SearchIcon from 'renderer/components/Icons/SearchIcon';

export default function SnapshotGallery() {
  const [snapshots, setSnapshots] = useState<SnapshotEntity[]>([]);
  const [snapshotMap, setSnapshotMap] = useState<Map<number, SnapshotEntity[]>>(
    new Map()
  );
  const [totalNumSnapshots, setTotalNumSnapshots] = useState<number>(0);
  const [shownNumSnapshots, setShownNumSnapshots] = useState<number>(20);

  const registerEventListeners = () => {
    window.electron.onSnapshotsUpdated(() => fetchSnapshots());
  };

  const unRegisterEventListeners = () => {
    window.electron.removeOnSnapshotsUpdated();
  };

  const fetchSnapshots = async (amount: number = shownNumSnapshots) => {
    const numSnapshots = await window.electron.ipcRenderer.invoke(
      'get-total-num-snapshots'
    );
    setTotalNumSnapshots(numSnapshots);
    const fetchedSnapshots = await window.electron.ipcRenderer.invoke(
      'get-latest-n-snapshots',
      amount
    );

    setSnapshots(fetchedSnapshots);
    const initialMap = createMap(fetchedSnapshots);
    setSnapshotMap(initialMap);
  };

  const createMap = (
    snapshots: SnapshotEntity[]
  ): Map<number, SnapshotEntity[]> => {
    const map: Map<number, SnapshotEntity[]> = new Map();
    snapshots.forEach((snapshot) => {
      const lastChangeDate = new Date(snapshot.lastChange);
      const key: number = lastChangeDate.setHours(0, 0, 0, 0);
      if (map.has(key)) {
        map.get(key)!.push(snapshot);
      } else {
        map.set(key, [snapshot]);
      }
    });
    return map;
  };

  const onDelete = () => {
    fetchSnapshots();
  };

  const increaseShownNumSnapshots = () => {
    const newAmount = shownNumSnapshots + 20;
    setShownNumSnapshots(newAmount);
    fetchSnapshots(newAmount);
  };

  const onSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchString = e.target.value.toLowerCase();
    const filteredSnapshots = snapshots.filter((snap) => {
      let isMatch = false;
      if (snap.name.toLowerCase().includes(searchString)) {
        isMatch = true;
      }
      if (snap.summary && snap.summary.toLowerCase().includes(searchString)) {
        isMatch = true;
      }
      if (snap.intent && snap.intent.toLowerCase().includes(searchString)) {
        isMatch = true;
      }

      // browser
      snap.browsers.forEach((browser) => {
        if (
          browser.isSelected &&
          browser.name?.toLowerCase().includes(searchString)
        ) {
          isMatch = true;
        }
        browser.browserTabs.forEach((tab) => {
          if (tab.isSelected) {
            if (
              tab.url.includes(searchString) ||
              tab.title?.toLowerCase().includes(searchString)
            ) {
              isMatch = true;
            }
          }
        });
      });

      // ide
      snap.ides.forEach((ide) => {
        if (ide.isSelected && ide.name.toLowerCase().includes(searchString)) {
          isMatch = true;
        }
        ide.ideFiles.forEach((file) => {
          if (
            file.isSelected &&
            file.name.toLowerCase().includes(searchString)
          ) {
            isMatch = true;
          }
        });
      });

      // applications
      snap.applications.forEach((app) => {
        if (
          app.isSelected &&
          (app.name.toLowerCase().includes(searchString) ||
            app.title.toLowerCase().includes(searchString))
        ) {
          isMatch = true;
        }
        app.files.forEach((file) => {
          if (
            file.isSelected &&
            file.name.toLowerCase().includes(searchString)
          ) {
            isMatch = true;
          }
        });
      });

      return isMatch;
    });
    const filteredMap = createMap(filteredSnapshots);
    setSnapshotMap(filteredMap);
  };

  const getFormattedDateFromKey = (key: number): string => {
    const date = new Date(key);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  useEffect(() => {
    fetchSnapshots();
    registerEventListeners();

    return () => {
      unRegisterEventListeners();
    };
  }, []);

  return (
    <>
      <NavBar />
      <h1>Snapshot Gallery</h1>
      <div className={styles.searchContainer}>
        <SearchIcon className={styles.icon} />
        <Input onChange={onSearchChange} />
      </div>
      {[...snapshotMap.keys()].map((key) => {
        return (
          <div key={key} className={styles.groupOfSnapshots}>
            {getFormattedDateFromKey(key)}
            {snapshotMap.get(key)!.map((snapshot) => {
              return (
                <GalleryEntry
                  key={snapshot.id}
                  snapshot={snapshot}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        );
      })}
      {shownNumSnapshots < totalNumSnapshots ? (
        <>
          <Button
            className={styles.loadMoreButton}
            isFilled={false}
            onClick={() => increaseShownNumSnapshots()}
          >
            Load More...
          </Button>
        </>
      ) : null}
    </>
  );
}
