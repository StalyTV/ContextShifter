import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import NewTaskSnap from './pages/NewSnapshot';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NewTaskSnap />} />
      </Routes>
    </Router>
  );
}
