import SignupPage from './pages/SignupPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import { createBrowserRouter, RouterProvider, Route, Routes } from 'react-router-dom'
import WelcomePage from './pages/WelcomePage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import AuthProvider from './auth/AuthProvider'
import AccountPage from './pages/AccountPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PortalProvider from './auth/PortalProvider'
import PortalGuard from './auth/PortalGuard'
import { CustomerDashboard, TailorDashboard, AdminDashboard } from './pages/Dashboards'
import BecomeTailorPage from './pages/BecomeTailorPage'
import AdminApplicationsPage from './pages/AdminApplicationsPage'
import TailorProfilePage from './pages/TailorProfilePage'
import TailorDirectoryPage from './pages/TailorDirectoryPage'
import DesignerPage from './pages/DesignerPage'
import MeasurementsPage from './pages/MeasurementsPage'
import RequestsPage from './pages/RequestsPage'
import PublicTailorPage from './pages/PublicTailorPage'

function AppRoutes() {
  return (
    <>
      <AuthProvider>
      <PortalProvider>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<PortalGuard />} />
        <Route path="/customer/dashboard" element={<PortalGuard role="customer"><CustomerDashboard /></PortalGuard>} />
        <Route path="/tailor/dashboard" element={<PortalGuard role="tailor"><TailorDashboard /></PortalGuard>} />
        <Route path="/admin/dashboard" element={<PortalGuard role="admin"><AdminDashboard /></PortalGuard>} />
        <Route path="/become-a-tailor" element={<PortalGuard role="customer"><BecomeTailorPage /></PortalGuard>} />
        <Route path="/admin/tailor-applications" element={<PortalGuard role="admin"><AdminApplicationsPage /></PortalGuard>} />
        <Route path="/tailor/profile" element={<PortalGuard role="tailor"><TailorProfilePage /></PortalGuard>} />
        <Route path="/customer/designer/:id?" element={<PortalGuard role="customer"><DesignerPage /></PortalGuard>} />
        <Route path="/customer/measurements" element={<PortalGuard role="customer"><MeasurementsPage /></PortalGuard>} />
        <Route path="/customer/requests" element={<PortalGuard role="customer"><RequestsPage key="customer" /></PortalGuard>} />
        <Route path="/customer/requests/:id" element={<PortalGuard role="customer"><RequestsPage key="customer/:id" /></PortalGuard>} />
        <Route path="/tailor/requests" element={<PortalGuard role="tailor"><RequestsPage key="tailor" /></PortalGuard>} />
        <Route path="/tailor/requests/:id" element={<PortalGuard role="tailor"><RequestsPage key="tailor/:id" /></PortalGuard>} />
        <Route path="/tailor/orders" element={<PortalGuard role="tailor"><RequestsPage key="tailor-orders" orders /></PortalGuard>} />
        <Route path="/tailor/orders/:id" element={<PortalGuard role="tailor"><RequestsPage key="tailor-orders/:id" orders /></PortalGuard>} />
        <Route path="/tailors" element={<PortalGuard authenticatedOnly><TailorDirectoryPage /></PortalGuard>} />
        <Route path="/tailors/:id" element={<PortalGuard authenticatedOnly><PublicTailorPage /></PortalGuard>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </PortalProvider>
      </AuthProvider>
    </>
  )
}

const router=createBrowserRouter([{path:'*',element:<AppRoutes/>}])
export default function App(){return <RouterProvider router={router}/>}
