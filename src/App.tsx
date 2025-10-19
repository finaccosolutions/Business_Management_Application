import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Login from './pages/Login';
import Register from './pages/Register';
import EmailVerified from './pages/EmailVerified';
import Dashboard from './pages/Dashboard';
import Services from './pages/Services';
import Leads from './pages/Leads';
import Customers from './pages/Customers';
import Works from './pages/Works';
import Invoices from './pages/Invoices';
import InvoicesList from './pages/InvoicesList';
import Reminders from './pages/Reminders';
import Staff from './pages/Staff';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import ChartOfAccounts from './pages/ChartOfAccounts';
import Vouchers from './pages/Vouchers';
import Ledger from './pages/Ledger';
import AccountingMasters from './pages/AccountingMasters';
import Accounting from './pages/Accounting';
import Layout from './components/Layout';
import { ConfirmationProvider } from './contexts/ConfirmationContext';
import { ToastProvider } from './contexts/ToastContext';


function AppContent() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/email-verified" element={<EmailVerified />} />
        <Route path="*" element={
          showRegister ? (
            <Register onToggle={() => setShowRegister(false)} />
          ) : (
            <Login onToggle={() => setShowRegister(true)} />
          )
        } />
      </Routes>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'services':
        return <Services />;
      case 'leads':
        return <Leads />;
      case 'customers':
        return <Customers />;
      case 'staff':
        return <Staff />;
      case 'works':
        return <Works />;
      case 'accounting':
        return <Accounting onNavigate={setCurrentPage} />;
      case 'invoices':
        return <Invoices />;
      case 'invoices-list':
        return <InvoicesList onBack={() => setCurrentPage('vouchers')} />;
      case 'vouchers':
        return <Vouchers onNavigate={setCurrentPage} />;
      case 'chart-of-accounts':
        return <ChartOfAccounts onNavigate={setCurrentPage} />;
      case 'ledger':
        return <Ledger onNavigate={setCurrentPage} />;
      case 'accounting-masters':
        return <AccountingMasters />;
      case 'reminders':
        return <Reminders />;
      case 'reports':
        return <Reports onNavigate={setCurrentPage} />;
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <Routes>
      <Route path="*" element={
        <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
          {renderPage()}
        </Layout>
      } />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ConfirmationProvider>
        <ToastProvider>
          <AuthProvider>
            <ThemeProvider>
              <AppContent />
            </ThemeProvider>
          </AuthProvider>
        </ToastProvider>
      </ConfirmationProvider>
    </BrowserRouter>
  );
}

export default App;
