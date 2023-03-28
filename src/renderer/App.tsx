import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import "./App.scss";
import Snapshot from './pages/Snapshot';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Snapshot />} />
      </Routes>
    </Router>
  );
}
