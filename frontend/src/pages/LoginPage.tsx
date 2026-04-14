import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Loader2, Mail, Phone, KeyRound, ArrowRight, RefreshCw } from 'lucide-react';
import SiteLogo from '../components/SiteLogo';
import LoginDarkPremium from '../components/LoginDarkPremium';

type LoginTab = 'email' | 'phone';

const LoginPage: React.FC = () => {
  const [tab, setTab] = useState<LoginTab>('email');

  // Email login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  // ── Email login ──
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);
      const response = await api.post('/auth/login', formData);
      await login(response.data.access_token);
      navigate('/');
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      setError(e2.response?.data?.detail || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!phone.trim()) { setError('Please enter your phone number.'); return; }
    setOtpLoading(true);
    setError('');
    
    try {
      const res = await api.post('/auth/send-otp', { phone_number: phone.trim() });
      setOtpSent(true);
      // Dev mode: backend returns the OTP so it can be tested without SMS
      if (res.data.dev_otp) {
        setOtp(res.data.dev_otp);
      }
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      setError(e2.response?.data?.detail || 'Failed to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Verify OTP ──
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) { setError('Please enter the OTP.'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-otp', { phone_number: phone.trim(), otp: otp.trim() });
      // Server set httpOnly cookie — just refresh the user profile
      await login();
      navigate('/');
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      setError(e2.response?.data?.detail || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: LoginTab) => {
    setTab(t);
    setError('');
    setOtpSent(false);
    
    setOtp('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <LoginDarkPremium />
      <div className="dark-premium-card-wrapper max-w-md w-full bg-white rounded-2xl shadow-xl p-8">

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <SiteLogo size="lg" linked={false} centered />
          <p className="text-slate-500 mt-4 text-center">Sign in to your research portal</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 mb-6">
          <button
            type="button"
            onClick={() => switchTab('email')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'email' ? 'bg-white text-gray-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Mail size={15} /> Email & Password
          </button>
          <button
            type="button"
            onClick={() => switchTab('phone')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === 'phone' ? 'bg-white text-gray-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Phone size={15} /> Phone OTP
          </button>
        </div>

        {/* ── EMAIL TAB ── */}
        {tab === 'email' && (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none transition-all"
                placeholder="name@university.edu"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-700 text-white py-2.5 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><ArrowRight size={16} /> Sign In</>}
            </button>
          </form>
        )}

        {/* ── PHONE OTP TAB ── */}
        {tab === 'phone' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            {/* Step 1: Phone number */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setOtpSent(false); }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none transition-all"
                  placeholder="+91 98765 43210"
                  disabled={otpSent}
                />
                <button
                  type="button"
                  onClick={otpSent ? () => { setOtpSent(false); setOtp(''); setError(''); } : handleSendOtp}
                  disabled={otpLoading}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    otpSent
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-gray-700 text-white hover:bg-gray-800'
                  }`}
                >
                  {otpLoading ? <Loader2 size={15} className="animate-spin" /> : otpSent ? <><RefreshCw size={14} /> Resend</> : 'Send OTP'}
                </button>
              </div>
            </div>

            {/* OTP sent confirmation */}
            {otpSent && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <KeyRound size={16} className="text-gray-500 flex-shrink-0" />
                <p className="text-sm text-gray-600 font-medium">OTP sent to your phone. Valid for 5 minutes.</p>
              </div>
            )}

            {/* Step 2: OTP input */}
            {otpSent && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Enter OTP</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-500 outline-none transition-all text-center text-2xl font-black tracking-[0.5em]"
                  placeholder="------"
                  maxLength={6}
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            {otpSent && (
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-gray-700 text-white py-2.5 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <><KeyRound size={16} /> Verify & Login</>}
              </button>
            )}

            {!otpSent && !error && (
              <p className="text-xs text-slate-400 text-center">
                Make sure your phone number is added in your Profile settings.
              </p>
            )}
          </form>
        )}

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-600">
            Don't have an account? <Link to="/register" className="text-gray-700 font-semibold hover:text-gray-900">Register now</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
