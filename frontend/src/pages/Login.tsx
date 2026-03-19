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
      <div
        className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
        style={{
          background: 'var(--bg-primary)',
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(79, 70, 229, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(217, 119, 6, 0.05) 0%, transparent 70%)
          `,
        }}
      >
        <div className="max-w-md w-full animate-fade-in">
          {/* Decorative elements */}
          <div className="absolute top-10 left-10 w-20 h-20 rounded-full opacity-20"
            style={{ background: 'var(--primary-gradient)', filter: 'blur(40px)' }}
          ></div>
          <div className="absolute bottom-10 right-10 w-32 h-32 rounded-full opacity-20"
            style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', filter: 'blur(60px)' }}
          ></div>

          <div className="card-premium">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="flex justify-center mb-5">
                <div
                  className="h-20 w-20 rounded-2xl flex items-center justify-center shadow-xl animate-float"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
                    boxShadow: '0 8px 32px rgba(79, 70, 229, 0.3)',
                  }}
                >
                  <img
                    src="/logo.png"
                    alt="ICAN Logo"
                    className="h-12 w-12 object-contain"
                  />
                </div>
              </div>
              <h2 className="text-3xl font-bold gradient-text">
                Create Account
              </h2>
              <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Register for an account. Your registration will need HR approval.
              </p>
            </div>

            {registerSuccess ? (
              <div className="text-center">
                <div
                  className="mb-6 p-5 rounded-xl"
                  style={{
                    background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                    border: '2px solid #6ee7b7',
                  }}
                >
                  <svg className="h-12 w-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="#059669">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-semibold" style={{ color: '#065f46' }}>
                    Registration successful! Your account is pending approval from HR.
                  </p>
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
              <form onSubmit={handleRegister} className="space-y-5">
                {registerError && (
                  <div
                    className="p-4 rounded-xl text-sm font-medium"
                    style={{
                      background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      border: '2px solid #f87171',
                      color: '#991b1b',
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

                <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setShowRegister(false)}
                    className="font-bold hover:underline"
                    style={{ color: 'var(--primary)' }}
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
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden"
      style={{
        background: 'var(--bg-primary)',
        backgroundImage: `
          radial-gradient(circle at 20% 20%, rgba(79, 70, 229, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(168, 85, 247, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(217, 119, 6, 0.05) 0%, transparent 70%)
        `,
      }}
    >
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-30"
        style={{ background: 'var(--primary-gradient)', filter: 'blur(100px)', transform: 'translate(-50%, -50%)' }}
      ></div>
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-20"
        style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)', filter: 'blur(100px)', transform: 'translate(50%, 50%)' }}
      ></div>

      <div className="max-w-md w-full animate-fade-in relative z-10">
        <div className="card-premium">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-6">
              <div
                className="h-24 w-24 rounded-2xl flex items-center justify-center shadow-xl animate-float"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
                  boxShadow: '0 12px 40px rgba(79, 70, 229, 0.4)',
                }}
              >
                <img
                  src="/logo.png"
                  alt="ICAN Logo"
                  className="h-14 w-14 object-contain"
                />
              </div>
            </div>
            <h2 className="text-3xl font-bold gradient-text">
              ICAN Attendance & Payroll
            </h2>
            <p className="mt-3" style={{ color: 'var(--text-secondary)' }}>
              Sign in to manage attendance and payroll
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div
                className="p-4 rounded-xl text-sm font-medium"
                style={{
                  background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                  border: '2px solid #f87171',
                  color: '#991b1b',
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="form-label">
                Email Address
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
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full text-lg py-4"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-3 border-white border-t-transparent"></div>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>

            <div className="divider my-6"></div>

            <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="font-bold hover:underline"
                style={{ color: 'var(--primary)' }}
              >
                Register
              </button>
            </p>
          </form>
        </div>

        <p className="mt-8 text-center text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          ICAN Language Center - Internal Use Only
        </p>
      </div>
    </div>
  );
}
