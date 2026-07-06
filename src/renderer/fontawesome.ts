/*
 * Font Awesome icon map.
 * ----------------------
 * Mirrors the shape of a Font Awesome Kit's `byPrefixAndName` export so icons
 * can be referenced as `byPrefixAndName.fas['circle-play']` /
 * `byPrefixAndName.far['trash-can']`. We build it from the free packages (no
 * kit token required); add more icons here as needed.
 */
import {
  faCirclePlay,
  faArrowUpFromBracket,
  faBackward,
} from '@fortawesome/free-solid-svg-icons';
import {
  faTrashCan,
  faCirclePause,
} from '@fortawesome/free-regular-svg-icons';

export const byPrefixAndName = {
  fas: {
    'circle-play': faCirclePlay,
    'arrow-up-from-bracket': faArrowUpFromBracket,
    backward: faBackward,
  },
  far: {
    'trash-can': faTrashCan,
    'circle-pause': faCirclePause,
  },
} as const;

export default byPrefixAndName;
