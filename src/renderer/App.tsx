import { Routes, Route, HashRouter } from 'react-router-dom';
import './App.scss';
import Toast from './components/Toast/Toast';
import Snapshot from './pages/Snapshot';
import InstantCuration from './pages/InstantCuration';
import SnapshotGallery from './pages/SnapshotGallery';
import TaskSnapTooltip from './components/Tooltip/TaskSnapTooltip';

export default function App() {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/instantCuration" element={<InstantCuration />} />
          <Route path="/snapshotGallery" element={<SnapshotGallery />} />
          <Route path="/" element={<Snapshot />} />
        </Routes>
      </HashRouter>
      <Toast />
      <TaskSnapTooltip />
    </>
  );
}
