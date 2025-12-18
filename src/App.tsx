import { useState, useEffect } from 'react';
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
import CreateLead from './pages/CreateLead';
import CreateCustomer from './pages/CreateCustomer';
import CreateStaff from './pages/CreateStaff';
import CreateService from './pages/CreateService';
import CreateWork from './pages/CreateWork';
import CreateInvoice from './pages/CreateInvoice';
import CreateVoucher from './pages/CreateVoucher';
import ServiceCategoryManager from './components/ServiceCategoryManager';
import AdminDashboard from './pages/AdminDashboard';
import StaffDashboard from './pages/StaffDashboard';
import WorkCalendar from './pages/WorkCalendar';
import StaffPermissions from './pages/StaffPermissions';
import AdminWorkMonitoring from './pages/AdminWorkMonitoring';
import Layout from './components/Layout';
import { ConfirmationProvider } from './contexts/ConfirmationContext';
import { ToastProvider } from './contexts/ToastContext';


function AppContent() {
  const { user, loading } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  // No persistence of current page to ensure dashboard on refresh
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageParams, setPageParams] = useState<any>({});

  // Reset to dashboard when user logs out so next login starts fresh
  useEffect(() => {
    if (!user) {
      setCurrentPage('dashboard');
    }
  }, [user]);

  // Save current page to sessionStorage whenever it changes
  const handleNavigate = (page: string, params?: any) => {
    setCurrentPage(page);
    setPageParams(params || {});
  };

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
        return <Dashboard onNavigate={handleNavigate} />;
      case 'services':
        return <Services onNavigate={handleNavigate} />;
      case 'service-details':
        return <Services isDetailsView serviceId={pageParams.id} onNavigate={handleNavigate} />;
      case 'leads':
        return <Leads onNavigate={handleNavigate} />;
      case 'lead-details':
        return <Leads isDetailsView leadId={pageParams.id} onNavigate={handleNavigate} />;
      case 'customers':
        return <Customers onNavigate={handleNavigate} />;
      case 'customer-details':
        return <Customers isDetailsView customerId={pageParams.id} onNavigate={handleNavigate} />;
      case 'staff':
        return <Staff onNavigate={handleNavigate} />;
      case 'staff-details':
        return <Staff isDetailsView staffId={pageParams.id} onNavigate={handleNavigate} />;
      case 'works':
        return <Works onNavigate={handleNavigate} />;
      case 'work-details':
        return <Works isDetailsView workId={pageParams.id} onNavigate={handleNavigate} />;
      case 'create-lead':
        return <CreateLead onNavigate={handleNavigate} editLeadId={pageParams.id} />;
      case 'create-customer':
        return <CreateCustomer onNavigate={handleNavigate} editCustomerId={pageParams.id} />;
      case 'create-staff':
        return <CreateStaff onNavigate={handleNavigate} editStaffId={pageParams.id} />;
      case 'create-service':
        return <CreateService onNavigate={handleNavigate} editServiceId={pageParams.id} />;
      case 'create-work':
        return <CreateWork onNavigate={handleNavigate} initialCustomerId={pageParams.customerId} initialServiceId={pageParams.serviceId} editWorkId={pageParams.id} />;
      case 'create-invoice':
        return <CreateInvoice onNavigate={handleNavigate} initialCustomerId={pageParams.customerId} editInvoiceId={pageParams.id} />;
      case 'create-voucher':
        return <CreateVoucher onNavigate={handleNavigate} initialType={pageParams.type} editVoucherId={pageParams.id} />;
      case 'accounting':
        return <Accounting onNavigate={handleNavigate} initialTab="invoices" />;
      case 'invoices':
        return <Accounting onNavigate={handleNavigate} initialTab="invoices" />;
      case 'invoices-list': // Legacy catch
        return <Accounting onNavigate={handleNavigate} initialTab="invoices" />;
      case 'vouchers':
        return <Accounting onNavigate={handleNavigate} initialTab="vouchers" />;
      case 'chart-of-accounts':
        return <Accounting onNavigate={handleNavigate} initialTab="chart-of-accounts" />;
      case 'ledger':
        return <Ledger onNavigate={handleNavigate} />;
      case 'accounting-masters':
        return <AccountingMasters />;
      case 'reminders':
        return <Reminders />;
      case 'reports':
        return <Reports onNavigate={handleNavigate} />;
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      case 'service-categories':
        return <ServiceCategoryManager onClose={() => handleNavigate('services')} onCategoryUpdate={() => { }} />;
      case 'admin':
        return <AdminDashboard onNavigate={handleNavigate} />;
      case 'staff-permissions':
        return <StaffPermissions staffId={pageParams.id} onBack={() => handleNavigate('admin')} />;
      case 'staff-dashboard':
        return <StaffDashboard onNavigate={handleNavigate} />;
      case 'calendar':
        return <WorkCalendar onNavigate={handleNavigate} />;
      case 'work-monitoring':
        return <AdminWorkMonitoring />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <Routes>
      {/* Explicit Route for permissions to allow URL parameters easily if needed, but here we use renderPage mainly. 
           However, renderPage uses local state. StaffPermissions expects useParams if using Router.
           But since we are wrapping everything in a catch-all Route *, useParams logic inside StaffPermissions 
           might not work if the URL isn't changing in the browser bar due to our single-page render approach.
           
           Wait, Layout children render based on currentPage. 
           If I want to use useParams(), I must actually change the router URL. 
           But this app seems to use a custom navigation state `currentPage`.
           
           If I use `pageParams` state, I can pass the ID.
           So inside StaffPermissions, I should read ID from props or context?
           Let's update StaffPermissions to accept `staffId` prop OR read from `pageParams` in App.tsx.
           
           Actually, let's fix StaffPermissions to take props.
       */}
      <Route path="*" element={
        <Layout currentPage={currentPage} onNavigate={handleNavigate}>
          {renderPage()}
        </Layout>
      } />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      {/* ... providers ... */}
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
