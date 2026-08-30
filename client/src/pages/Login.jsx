import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TextAnimate } from '../components/ui/text-animate';
import { Monogram } from '../components/brand/Brand';
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
      <div className="fixed inset-0 z-50 bg-cream flex items-center justify-center">
        <p className="text-secondary font-mono text-[12px] uppercase tracking-[0.08em]">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-cream text-ink font-sans antialiased flex items-center justify-center">
      <div className="w-full h-full flex flex-col items-center justify-center relative px-6">
        <Link
          to="/"
          className="absolute top-6 left-6 flex items-center gap-2.5 no-underline"
          aria-label="Meredian home"
        >
          <Monogram />
          <span className="font-sans font-bold text-[15px] tracking-tight text-ink">Meredian</span>
        </Link>
        <Link
          to="/"
          className="absolute top-6 right-6 text-secondary hover:text-ink text-2xl font-light no-underline leading-none"
          aria-label="Close"
        >
          ×
        </Link>

        <div className="flex flex-col items-center justify-center space-y-8 max-w-sm mx-auto w-full">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-red">
                Member Access
              </span>
            </div>
            <div className="font-sans text-[34px] font-semibold tracking-[-0.02em] leading-[1.05] mb-2">
              <TextAnimate animation="slideUp" by="word" key="login-title">
                Welcome back
              </TextAnimate>
            </div>
            <p className="text-secondary text-[14px] mt-2">
              Sign in to your Meredian account
            </p>
            {errorMsg ? (
              <div
                className="mt-4 text-[13px] font-mono bg-accent-red/10 border border-accent-red/40 text-accent-red px-4 py-2"
                role="alert"
              >
                {errorMsg}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <input
              type="text"
              autoComplete="username"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              placeholder="Username"
              className="w-full h-[46px] px-4 bg-[#fbf7ec] border border-ink/20 text-ink text-[15px] placeholder:text-[#8f8b80] focus:outline-none focus:border-ink/50 transition-colors"
              onKeyPress={handleKeyPress}
              required
            />

            <input
              type="password"
              autoComplete="current-password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              placeholder="Password"
              className="w-full h-[46px] px-4 bg-[#fbf7ec] border border-ink/20 text-ink text-[15px] placeholder:text-[#8f8b80] focus:outline-none focus:border-ink/50 transition-colors"
              onKeyPress={handleKeyPress}
              required
            />

            <button
              type="submit"
              disabled={!isFormComplete() || isSubmitting}
              className={`w-full h-[46px] px-6 font-mono text-[12px] uppercase tracking-[0.06em] font-medium transition-all border-none ${
                isFormComplete() && !isSubmitting
                  ? 'bg-accent-red text-white hover:brightness-105 cursor-pointer'
                  : 'bg-ink/10 text-secondary cursor-not-allowed'
              }`}
            >
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
