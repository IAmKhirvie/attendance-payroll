import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const { login, isAuthenticated, user, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      const from = (location.state as any)?.from?.pathname ||
        (user.role === 'admin' ? '/admin' : '/employee');
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(email, password);
    } catch (err) {
      // Error is already set in the store
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');

    if (registerData.password !== registerData.confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerData.email,
          password: registerData.password,
          first_name: registerData.firstName,
          last_name: registerData.lastName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Registration failed');
      }

      setRegisterSuccess(true);
      setRegisterData({
        email: '',
        password: '',
        confirmPassword: '',
        firstName: '',
        lastName: '',
      });
    } catch (err: any) {
      setRegisterError(err.message || 'Registration failed');
    }
  };

  if (showRegister) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 grid-pattern">
        <div className="max-w-md w-full animate-fade-in">
          <div className="card">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div
                  className="h-16 w-16 rounded-xl flex items-center justify-center animate-glow"
                  style={{ background: 'var(--accent)' }}
                >
                  <img
                    src="/logo.png"
                    alt="ICAN Logo"
                    className="h-10 w-10 object-contain"
                  />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white">
                Create Account
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Register for an account. Your registration will need HR approval.
              </p>
            </div>

            {registerSuccess ? (
              <div className="text-center">
                <div
                  className="mb-4 p-4 rounded-lg text-emerald-300"
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                  }}
                >
                  Registration successful! Your account is pending approval from HR.
                </div>
                <button
                  onClick={() => {
                    setShowRegister(false);
                    setRegisterSuccess(false);
                  }}
                  className="btn-primary"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                {registerError && (
                  <div
                    className="p-3 rounded-lg text-red-300 text-sm"
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    {registerError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="form-label">
                      First Name
                    </label>
                    <input
                      id="firstName"
                      type="text"
                      required
                      value={registerData.firstName}
                      onChange={(e) => setRegisterData({ ...registerData, firstName: e.target.value })}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="form-label">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      type="text"
                      required
                      value={registerData.lastName}
                      onChange={(e) => setRegisterData({ ...registerData, lastName: e.target.value })}
                      className="form-input"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="registerEmail" className="form-label">
                    Email
                  </label>
                  <input
                    id="registerEmail"
                    type="email"
                    required
                    value={registerData.email}
                    onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div>
                  <label htmlFor="registerPassword" className="form-label">
                    Password
                  </label>
                  <input
                    id="registerPassword"
                    type="password"
                    required
                    value={registerData.password}
                    onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="form-label">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={registerData.confirmPassword}
                    onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                    className="form-input"
                  />
                </div>

                <button type="submit" className="btn-primary w-full">
                  Register
                </button>

                <p className="text-center text-sm text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="text-indigo-400 hover:text-indigo-300 font-medium"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 grid-pattern">
      <div className="max-w-md w-full animate-fade-in">
        <div className="card">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div
                className="h-20 w-20 rounded-xl flex items-center justify-center animate-glow"
                style={{ background: 'var(--accent)' }}
              >
                <img
                  src="/logo.png"
                  alt="ICAN Logo"
                  className="h-12 w-12 object-contain"
                />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white">
              ICAN Attendance & Payroll
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Sign in to manage attendance and payroll
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div
                className="p-3 rounded-lg text-red-300 text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="form-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="admin@ican.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>

            <p className="text-center text-sm text-slate-400">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Register
              </button>
            </p>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          ICAN Language Center - Internal Use Only
        </p>
      </div>
    </div>
  );
}
