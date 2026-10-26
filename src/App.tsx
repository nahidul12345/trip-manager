import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LangProvider } from './contexts/LangContext';
import { LoginPage } from './pages/LoginPage';
import { RolePage } from './pages/RolePage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateTripPage } from './pages/CreateTripPage';
import { JoinTripPage } from './pages/JoinTripPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { SharePage } from './pages/SharePage';

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/role" element={<RolePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/trips/new" element={<CreateTripPage />} />
            <Route path="/trips/join" element={<JoinTripPage />} />
            <Route path="/trips/:tripId" element={<TripDetailPage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/trips" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  );
}
