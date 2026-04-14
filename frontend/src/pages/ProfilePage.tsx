import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import {
  User as UserIcon, Mail, Building, FileText,
  Save, Loader2, ArrowLeft, CheckCircle, Lock,
  Eye, EyeOff, BookOpen, FolderOpen, MessageSquare,
  Calendar, Shield, Zap, AlertCircle, ChevronRight,
  Clock, Star, Camera, Trash2, Phone, LogOut
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import SiteLogo from '../components/SiteLogo';

const BACKEND = '';   // Vite proxy handles /avatars → backend

interface Stats {
  papers_analyzed: number;
  projects_created: number;
  notes_written: number;
}

interface RecentPaper {
  id: number;
  title: string;
  filename: string;
  created_at: string;
}

type Tab = 'profile' | 'security' | 'activity';

const ProfilePage: React.FC = () => {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Profile form
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [institution, setInstitution] = useState(user?.institution || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('');
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Password form
  const [_currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState('');

  // Stats & activity
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentPapers, setRecentPapers] = useState<RecentPaper[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Avatar
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Image must be under 5MB.'); return; }
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/auth/me/avatar', form);
      updateUser(res.data);
    } catch {
      setAvatarError('Upload failed. Please try again.');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const res = await api.delete('/auth/me/avatar');
      updateUser(res.data);
    } catch {
      setAvatarError('Failed to remove photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const avatarUrl = user?.profile_picture ? `${BACKEND}/avatars/${user.profile_picture}` : null;

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    fetchStats();
    fetchRecentPapers();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get('/auth/stats');
      setStats(res.data);
    } catch {
      setStats({ papers_analyzed: 0, projects_created: 0, notes_written: 0 });
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchRecentPapers = async () => {
    try {
      const res = await api.get('/analysis/history');
      setRecentPapers(res.data.slice(0, 5));
    } catch {
      setRecentPapers([]);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError('');

    const emailChanged = newEmail.trim() !== user?.email;
    if (emailChanged && !emailConfirmPassword) {
      setError('Please enter your password to confirm the email change.');
      setLoading(false);
      return;
    }

    try {
      const payload: Record<string, string> = { full_name: fullName, institution, bio, phone_number: phoneNumber };
      if (emailChanged) payload.email = newEmail.trim();

      const res = await api.put('/auth/me', payload);
      updateUser(res.data);
      setSuccess(true);
      setEmailConfirmPassword('');
      setShowEmailConfirm(false);

      if (emailChanged) {
        // Email changed — JWT is now invalid, force re-login
        setTimeout(async () => {
          await logout();
          navigate('/login');
        }, 2000);
      } else {
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: string } } };
      setError(e2.response?.data?.detail || 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await api.put('/auth/me', { password: newPassword });
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError('Failed to update password. Please try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const getInitials = () => {
    if (user?.full_name) {
      return user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user?.email?.[0]?.toUpperCase() || 'U';
  };

  const parseUTC = (dateStr: string) => {
    if (!dateStr) return new Date();
    const s = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
    return new Date(s);
  };

  const formatDate = (dateStr: string) => {
    return parseUTC(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr: string) => {
    const d = parseUTC(dateStr);
    const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
  };

  const memberSince = user?.created_at ? formatDateTime(user.created_at) : null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile', label: 'Edit Profile', icon: <UserIcon size={16} /> },
    { id: 'security', label: 'Security', icon: <Shield size={16} /> },
    { id: 'activity', label: 'Activity', icon: <Clock size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dark Navbar */}
      <header className="w-full bg-gray-900 border-b border-gray-800 px-6 md:px-12 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft size={16} />
              Dashboard
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Researcher Profile</span>
            <button
              type="button"
              onClick={handleLogout}
              title="Log Out"
              className="p-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-900/30 transition-all"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 md:px-8 py-8">

        {/* Banner + Avatar */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="h-36 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-500 relative">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_20%_50%,white_1px,transparent_1px)] bg-[size:24px_24px]" />
          </div>

          <div className="px-8 pb-8">
            {/* Avatar */}
            <div className="flex items-end justify-between -mt-10 mb-6">
              <div className="relative group">
                {/* Avatar image or initials */}
                <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-xl overflow-hidden flex items-center justify-center bg-gray-700 text-white text-2xl font-black">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                    : getInitials()
                  }
                </div>

                {/* Upload overlay on hover */}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer"
                >
                  {avatarUploading
                    ? <Loader2 size={18} className="text-white animate-spin" />
                    : <Camera size={18} className="text-white" />
                  }
                  <span className="text-white text-[10px] font-bold">{avatarUploading ? 'Uploading' : 'Change'}</span>
                </button>

                {/* Hidden file input */}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  title="Upload profile picture"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="flex items-center gap-2 mb-1">
                {/* Remove photo button */}
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleAvatarDelete}
                    disabled={avatarUploading}
                    className="flex items-center gap-1.5 text-red-400 hover:text-red-600 text-xs font-bold px-3 py-1.5 rounded-full border border-red-100 hover:border-red-300 bg-red-50 transition-all disabled:opacity-50"
                  >
                    <Trash2 size={12} /> Remove Photo
                  </button>
                )}
                <div className="flex items-center gap-1.5 bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-full border border-green-100">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Active Researcher
                </div>
              </div>
            </div>

            {/* Avatar error */}
            {avatarError && (
              <p className="text-xs text-red-500 font-semibold mb-3 flex items-center gap-1">
                <AlertCircle size={13} /> {avatarError}
              </p>
            )}

            {/* Name & Info */}
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900">{user?.full_name || 'Anonymous Researcher'}</h2>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                  <Mail size={13} /> {user?.email}
                </span>
                {user?.institution && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                    <Building size={13} /> {user.institution}
                  </span>
                )}
                {user?.phone_number && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                    <Phone size={13} /> {user.phone_number}
                  </span>
                )}
                {memberSince && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-sm">
                    <Calendar size={13} /> Member since {memberSince.date}
                  </span>
                )}
              </div>
              {user?.bio && (
                <p className="mt-3 text-slate-500 text-sm leading-relaxed max-w-2xl">{user.bio}</p>
              )}
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Papers Analyzed', value: stats?.papers_analyzed, icon: <BookOpen size={18} /> },
                { label: 'Projects Created', value: stats?.projects_created, icon: <FolderOpen size={18} /> },
                { label: 'Notes Written', value: stats?.notes_written, icon: <MessageSquare size={18} /> },
              ].map((stat, idx) => (
                <div key={stat.label} className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                  <div className={`mb-2 ${idx === 0 ? 'text-gray-500' : idx === 1 ? 'text-gray-500' : 'text-blue-500'}`}>{stat.icon}</div>
                  <div className="text-2xl font-black text-slate-900">
                    {statsLoading ? <Loader2 size={20} className="animate-spin text-slate-300" /> : stat.value ?? 0}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-0.5">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-gray-500 text-gray-700 bg-gray-50/50'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-8">

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="mb-2">
                  <h3 className="font-bold text-slate-800">Personal Information</h3>
                  <p className="text-xs text-slate-400">Update your researcher profile details</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Dr. Jane Doe"
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => { setNewEmail(e.target.value); setShowEmailConfirm(e.target.value !== user?.email); }}
                        placeholder="your@email.com"
                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                      />
                    </div>
                    {showEmailConfirm && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-700 font-medium">Changing your email will log you out. You'll need to sign in again with your new email.</p>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                          <input
                            type="password"
                            value={emailConfirmPassword}
                            onChange={(e) => setEmailConfirmPassword(e.target.value)}
                            placeholder="Enter your password to confirm"
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-400 outline-none transition-all text-sm"
                          />
                        </div>
                      </div>
                    )}
                    {!showEmailConfirm && <p className="text-[11px] text-slate-400 px-1">Click to edit your email address</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Institution / Organization</label>
                  <div className="relative">
                    <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="text"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="University of Intelligence"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Research Bio</label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-4 text-slate-300" size={16} />
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Briefly describe your research interests, expertise, and goals..."
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all h-28 resize-none text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 px-1">{bio.length}/500 characters</p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                  {error && (
                    <div className="flex items-center gap-2 text-red-500 text-sm font-semibold">
                      <AlertCircle size={16} /> {error}
                    </div>
                  )}
                  {success && (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-bold">
                      <CheckCircle size={16} />
                      {newEmail !== user?.email ? 'Email updated! Redirecting to login...' : 'Profile updated successfully!'}
                    </div>
                  )}
                  {!error && !success && <div />}
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-gray-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* ── SECURITY TAB ── */}
            {activeTab === 'security' && (
              <div className="space-y-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-gray-100 rounded-xl text-gray-600"><Shield size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-800">Change Password</h3>
                    <p className="text-xs text-slate-400">Update your account password for security</p>
                  </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                      />
                      <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-widest px-1">Confirm New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                      />
                      <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                        {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {newPassword && confirmPassword && (
                      <p className={`text-[11px] px-1 font-semibold ${newPassword === confirmPassword ? 'text-green-500' : 'text-red-400'}`}>
                        {newPassword === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                      </p>
                    )}
                  </div>

                  {/* Password strength */}
                  {newPassword && (
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 font-semibold px-1">Password strength</p>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${
                            newPassword.length >= i * 3
                              ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-yellow-400' : i <= 3 ? 'bg-blue-400' : 'bg-green-400'
                              : 'bg-slate-100'
                          }`} />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-400 px-1">
                        {newPassword.length < 4 ? 'Weak' : newPassword.length < 7 ? 'Fair' : newPassword.length < 10 ? 'Good' : 'Strong'}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                    {pwError && (
                      <div className="flex items-center gap-2 text-red-500 text-sm font-semibold">
                        <AlertCircle size={16} /> {pwError}
                      </div>
                    )}
                    {pwSuccess && (
                      <div className="flex items-center gap-2 text-green-600 text-sm font-bold">
                        <CheckCircle size={16} /> Password updated successfully!
                      </div>
                    )}
                    {!pwError && !pwSuccess && <div />}
                    <button
                      type="submit"
                      disabled={pwLoading}
                      className="bg-gray-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 flex items-center gap-2 disabled:opacity-50"
                    >
                      {pwLoading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
                      Update Password
                    </button>
                  </div>
                </form>

                {/* Account Info */}
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account Information</h4>
                  {[
                    { label: 'Account ID', value: `#${user?.id || '—'}` },
                    { label: 'Email', value: user?.email || '—' },
                    { label: 'Member Since', value: memberSince ? `${memberSince.date} at ${memberSince.time}` : '—' },
                    { label: 'Authentication', value: 'JWT / bcrypt' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                      <span className="text-sm text-slate-400">{item.label}</span>
                      <span className="text-sm font-semibold text-slate-700">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── ACTIVITY TAB ── */}
            {activeTab === 'activity' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><Clock size={18} /></div>
                  <div>
                    <h3 className="font-bold text-slate-800">Recent Activity</h3>
                    <p className="text-xs text-slate-400">Your last 5 analyzed papers</p>
                  </div>
                </div>

                {recentPapers.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">No papers analyzed yet</p>
                    <p className="text-sm mt-1">Go to the Dashboard to upload and analyze your first paper</p>
                    <Link to="/" className="inline-flex items-center gap-2 mt-4 bg-gray-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-all">
                      Go to Dashboard <ChevronRight size={16} />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentPapers.map((paper, idx) => (
                      <div key={paper.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200 hover:border-gray-200 hover:bg-gray-50/30 transition-all group">
                        <div className="w-9 h-9 rounded-xl bg-gray-200 text-gray-700 flex items-center justify-center font-black text-sm flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{paper.title || paper.filename}</p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Clock size={11} /> {formatDate(paper.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Star size={14} className="text-yellow-400" />
                          <span className="text-xs font-bold text-slate-400 group-hover:text-gray-700 transition-colors">Analyzed</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary card */}
                {stats && (
                  <div className="bg-gradient-to-r from-gray-700 to-gray-600 rounded-2xl p-5 text-white mt-4">
                    <h4 className="font-black text-sm mb-3 opacity-80 uppercase tracking-widest">Overall Research Impact</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-3xl font-black">{stats.papers_analyzed}</div>
                        <div className="text-xs opacity-70 mt-0.5">Papers</div>
                      </div>
                      <div className="text-center border-x border-white/20">
                        <div className="text-3xl font-black">{stats.projects_created}</div>
                        <div className="text-xs opacity-70 mt-0.5">Projects</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-black">{stats.notes_written}</div>
                        <div className="text-xs opacity-70 mt-0.5">Notes</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
