import { Routes, Route, HashRouter } from 'react-router-dom';
import './App.scss';
import Toast from './components/Toast/Toast';
import Snapshot from './pages/Snapshot';
import InstantCuration from './pages/InstantCuration';
import SnapshotGallery from './pages/SnapshotGallery';
import MentalContext from './pages/MentalContext';
import EndOfDayQuestionnaire from './pages/EndOfDayQuestionnaire';
import TaskSnapTooltip from './components/Tooltip/TaskSnapTooltip';
import TaskResumptionQuestionnaire from './pages/TaskResumptionQuestionnaire';
import Settings from './pages/Settings';
import TaskSwitcher from './pages/TaskSwitcher';

export default function App() {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/instantCuration" element={<InstantCuration />} />
          <Route path="/snapshotGallery" element={<SnapshotGallery />} />
          <Route path="/mentalContext" element={<MentalContext />} />
          <Route path="/endOfDay" element={<EndOfDayQuestionnaire />} />
          <Route
            path="/taskResumption"
            element={<TaskResumptionQuestionnaire />}
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/taskSwitcher" element={<TaskSwitcher />} />
          <Route path="/" element={<Snapshot />} />
        </Routes>
      </HashRouter>
      <Toast />
      <TaskSnapTooltip />
    </>
  );
}
