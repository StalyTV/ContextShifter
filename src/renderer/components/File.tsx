/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

type Props = {
  path: string;
};

export default function File(props: Props) {
  const openFile = async (app: string) => {
    await window.electron.ipcRenderer.invoke('open-application', app);
  };

  return (
    <div className={'file'} onClick={() => openFile(props.path)}>
      {props.path}
    </div>
  );
}
