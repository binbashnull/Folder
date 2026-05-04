import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './components/AuthPage';
import ChatRoom from './components/ChatRoom';

function AppContent() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center">
            <span className="text-black font-bold">KF</span>
          </div>
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!session) return <AuthPage />;
  return <ChatRoom />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
