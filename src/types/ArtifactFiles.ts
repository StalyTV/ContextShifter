/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Valentin Hollenstein <valentin.hollenstein@uzh.ch>, October 2023
 */

// "application" specifies the app the artifact should be opened with
type ArtifactFiles = {
  artifact: string[],
  application?: string,
};

export default ArtifactFiles;
