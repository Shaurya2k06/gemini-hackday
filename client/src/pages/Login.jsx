import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TextAnimate } from '../components/ui/text-animate';
import { useAuth } from '../lib/AuthContext';
import { clearDiscoveryState } from '../lib/discoveryStorage';

/**
 * Full-screen login — Overlook BusinessLogin layout/animation,
 * scaled down on the landing page background.
 */
export default function Login() {
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const goToNewScreening = () => {
    clearDiscoveryState();
    navigate('/chat', { replace: true });
  };

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'Advercase';
        src: url('/Advercase Font.otf') format('opentype');
        font-weight: normal;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);

    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading && user) {
      goToNewScreening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only redirect once session is known
  }, [loading, user]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const isFormComplete = () => {
    return formData.username.trim() !== '' && formData.password.trim() !== '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await login(formData.username.trim(), formData.password);
      goToNewScreening();
    } catch (error) {
      console.error('Login error:', error);
      setErrorMsg(error.message || 'Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && formData.username && formData.password) {
      handleSubmit(e);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm" style={{ fontFamily: 'Advercase, monospace' }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex items-center justify-center transition-colors duration-300">
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        <Link
          to="/"
          className="absolute top-8 right-8 text-foreground hover:opacity-60 text-2xl font-bold no-underline"
          style={{ fontFamily: 'Advercase, monospace' }}
          aria-label="Close"
        >
          ×
        </Link>

        <div
          className="flex flex-col items-center justify-center space-y-8 max-w-sm mx-auto px-8 w-full origin-center"
          style={{ transform: 'scale(0.92)' }}
        >
          <div className="text-center">
            <div
              className="text-3xl text-foreground mb-2"
              style={{ fontFamily: 'Advercase, monospace' }}
            >
              <TextAnimate animation="slideUp" by="word" key="login-title">
                Welcome Back
              </TextAnimate>
            </div>
            <p
              className="text-muted-foreground text-sm mt-3"
              style={{ fontFamily: 'Advercase, monospace' }}
            >
              Sign in to your Zoron account
            </p>
            {errorMsg ? (
              <div
                className="mt-4 text-sm bg-red-600/15 border border-red-500/70 text-red-700 dark:text-red-300 px-4 py-2 rounded"
                style={{ fontFamily: 'Advercase, monospace' }}
                role="alert"
              >
                {errorMsg}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-6">
            <div className="w-full">
              <input
                type="text"
                autoComplete="username"
                value={formData.username}
                onChange={(e) => handleInputChange('username', e.target.value)}
                placeholder="Username"
                className="w-full px-5 py-3 bg-transparent border-0 border-b-2 border-foreground text-foreground text-lg text-center placeholder:text-muted-foreground focus:outline-none focus:opacity-80 transition-colors"
                style={{ fontFamily: 'Advercase, monospace' }}
                onKeyPress={handleKeyPress}
                required
              />
            </div>

            <div className="w-full">
              <input
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                placeholder="Password"
                className="w-full px-5 py-3 bg-transparent border-0 border-b-2 border-foreground text-foreground text-lg text-center placeholder:text-muted-foreground focus:outline-none focus:opacity-80 transition-colors"
                style={{ fontFamily: 'Advercase, monospace' }}
                onKeyPress={handleKeyPress}
                required
              />
            </div>

            <button
              type="submit"
              disabled={!isFormComplete() || isSubmitting}
              className={`w-full px-6 py-3 text-base uppercase tracking-wider transition-colors border-none ${
                isFormComplete() && !isSubmitting
                  ? 'bg-foreground text-background hover:opacity-90 cursor-pointer'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
              style={{ fontFamily: 'Advercase, monospace' }}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
