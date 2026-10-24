import { Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Evaluation from './pages/Evaluation';
import Home from './pages/Home';
import Insights from './pages/Insights';
import Newsroom from './pages/Newsroom';
import Outlets from './pages/Outlets';
import SingleDetail from './pages/SingleDetail';
import Singles from './pages/Singles';
import Story from './pages/Story';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/story/:id" element={<Story />} />
      <Route path="/single/:id" element={<SingleDetail />} />
      <Route path="/singles" element={<Singles />} />
      <Route path="/outlets" element={<Outlets />} />
      <Route path="/newsroom" element={<Newsroom />} />
      <Route path="/evaluation" element={<Evaluation />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/insights" element={<Insights />} />
    </Routes>
  );
}
