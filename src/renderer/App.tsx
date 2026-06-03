import { Routes, Route, HashRouter } from 'react-router-dom';
import './App.scss';
import Toast from './components/Toast/Toast';
import TaskList from './pages/TaskList';
import TaskEditView from './pages/TaskEditView';
import TaskSnapTooltip from './components/Tooltip/TaskSnapTooltip';
import Settings from './pages/Settings';
import TaskSwitcher from './pages/TaskSwitcher';

export default function App() {
  return (
    <>
      <HashRouter>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/taskSwitcher" element={<TaskSwitcher />} />
          <Route path="/task/:id" element={<TaskEditView />} />
          <Route path="/" element={<TaskList />} />
        </Routes>
      </HashRouter>
      <Toast />
      <TaskSnapTooltip />
    </>
  );
}
