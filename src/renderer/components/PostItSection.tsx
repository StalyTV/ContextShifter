/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import PostIt from './PostIt';

type Props = {
  summary: string;
  onSummaryChange: (text: string) => void;
  intent: string;
  onIntentChange: (text: string) => void;
  isEditable: boolean;
};

export default function PostItSection(props: Props) {
  return (
    <>
      <PostIt
        title={'Now what was I doing?'}
        content={props.summary}
        onTextChange={props.onSummaryChange}
        isEditable={props.isEditable}
      />
      <PostIt
        title={'What was I about to do?'}
        content={props.intent}
        infoMessage={`Uncommitted TODOs are automatically added to this section`}
        onTextChange={props.onIntentChange}
        isEditable={props.isEditable}
      />
    </>
  );
}
