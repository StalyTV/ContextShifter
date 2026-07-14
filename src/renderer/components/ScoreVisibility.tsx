/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

import { createContext, useContext } from 'react';

// Whether relevance / semantic scores (and the "Sem." embedding-info button)
// are shown in the artefact lists. Driven by the "Show relevance scores"
// setting; defaults OFF so the scoring internals stay hidden unless enabled.
const ScoreVisibilityContext = createContext<boolean>(false);

export const ScoreVisibilityProvider = ScoreVisibilityContext.Provider;

export function useScoresVisible(): boolean {
  return useContext(ScoreVisibilityContext);
}
