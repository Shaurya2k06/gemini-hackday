import React, { useEffect, useState, createContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Results from './pages/Results';
import CompanyDive from './pages/CompanyDive';
import { RequireAuth } from './components/auth/RequireAuth';
import { AuthProvider } from './lib/AuthContext';
import Lenis from 'lenis';
import './index.css';

export const ThemeContext = createContext({
  isDark: false,
  toggleTheme: () => {},
});

function AppRoutes() {
  const location = useLocation();
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.5,
      lerp: 0.08,
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;
    if (
      location.pathname === '/chat' ||
      location.pathname === '/results' ||
      location.pathname === '/login' ||
      location.pathname.startsWith('/company/')
    ) {
      lenis.stop();
    } else {
      lenis.start();
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/chat"
        element={
          <RequireAuth>
            <Chat />
          </RequireAuth>
        }
      />
      <Route
        path="/results"
        element={
          <RequireAuth>
            <Results />
          </RequireAuth>
        }
      />
      <Route
        path="/company/:domain"
        element={
          <RequireAuth>
            <CompanyDive />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

function App() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Apply dark mode class
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = (e) => {
    if (!document.startViewTransition) {
      setIsDark(!isDark);
      return;
    }

    const x = e.clientX ?? window.innerWidth / 2;
    const y = e.clientY ?? window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      setIsDark(prev => !prev);
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 600,
          easing: 'ease-in-out',
          pseudoElement: isDark ? '::view-transition-old(root)' : '::view-transition-new(root)',
        }
      );
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ThemeContext.Provider>
  );
}

export default App;
