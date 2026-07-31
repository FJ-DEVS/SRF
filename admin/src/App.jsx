import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import RollerLayout from './components/RollerLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Salesmen from './pages/Salesmen';
import Customers from './pages/Customers';
import Vendors from './pages/Vendors';
import Items from './pages/Items';
import Cargo from './pages/Cargo';
import Orders from './pages/Orders';
import Consolidation from './pages/Consolidation';
import Schemas from './pages/Schemas';
import SchemaLeaderboard from './pages/SchemaLeaderboard';
import Raks from './pages/Raks';
import Rollers from './pages/Rollers';
import RollerLogin from './pages/roller/RollerLogin';
import RollerOrders from './pages/roller/RollerOrders';
import RollerPlacements from './pages/roller/RollerPlacements';

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

// Where a signed-in account belongs when it lands somewhere it shouldn't
const homeFor = (user) => (user?.role === 'roller' ? '/roller/orders' : '/dashboard');

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'admin') return <Navigate to={homeFor(user)} />;

  return children;
};

const RollerRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/roller/login" />;
  if (user.role !== 'roller') return <Navigate to={homeFor(user)} />;

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;

  return !user ? children : <Navigate to={homeFor(user)} />;
};

const adminPages = [
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/salesmen', element: <Salesmen /> },
  { path: '/rollers', element: <Rollers /> },
  { path: '/customers', element: <Customers /> },
  { path: '/vendors', element: <Vendors /> },
  { path: '/items', element: <Items /> },
  { path: '/raks', element: <Raks /> },
  { path: '/cargo', element: <Cargo /> },
  { path: '/orders', element: <Orders /> },
  { path: '/consolidation', element: <Consolidation /> },
  { path: '/schemas', element: <Schemas /> },
  { path: '/schema-leaderboard', element: <SchemaLeaderboard /> }
];

const rollerPages = [
  { path: '/roller/orders', element: <RollerOrders /> },
  { path: '/roller/placements', element: <RollerPlacements /> }
];

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              <PublicRoute>
                <Landing />
              </PublicRoute>
            }
          />

          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />

          <Route
            path="/roller/login"
            element={
              <PublicRoute>
                <RollerLogin />
              </PublicRoute>
            }
          />

          {adminPages.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <AdminRoute>
                  <Layout>{page.element}</Layout>
                </AdminRoute>
              }
            />
          ))}

          {rollerPages.map((page) => (
            <Route
              key={page.path}
              path={page.path}
              element={
                <RollerRoute>
                  <RollerLayout>{page.element}</RollerLayout>
                </RollerRoute>
              }
            />
          ))}

          <Route path="/roller" element={<Navigate to="/roller/orders" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
