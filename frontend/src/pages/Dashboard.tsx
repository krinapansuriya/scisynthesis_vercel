import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import {
  FileUp, Search, Zap, BookOpen, AlertCircle,
  ArrowRight, Loader2, CheckCircle2, Star, Sparkles, LogOut,
  History, ChevronRight, FolderPlus, Info, Trash2,
  Download, Copy, Globe, CheckCheck, X
} from 'lucide-react';

import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import SiteLogo from '../components/SiteLogo';

const parseUTC = (dateStr: string) => {
  if (!dateStr) return new Date();
  // SQLite returns naive UTC strings — append Z so browser converts to local time correctly
  const s = dateStr.endsWith('Z') || dateStr.includes('+') ? dateStr : dateStr + 'Z';
  return new Date(s);
};

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate('/login'); };
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResult, setGlobalResult] = useState<any>(null);
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchProjects();

    const params = new URLSearchParams(location.search);
    const pId = params.get('projectId');
    if (pId) {
      setSelectedProjectId(pId);
    }
  }, [location]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/analysis/history');
      setHistory(res.data);
    } catch { console.error('History fetch failed'); }
  };

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects/');
      setProjects(res.data);
    } catch { console.error('Projects fetch failed'); }
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Permanently remove this analysis from your history?')) return;
    try {
      await api.delete(`/analysis/${id}`);
      setHistory(history.filter(h => h.id !== id));
      if (result && history.find(h => h.id === id)?.result_json === result) {
        setResult(null);
      }
    } catch {
      alert('Failed to delete history item');
    }
  };

  const handleExport = () => {
    if (!result) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pw - margin * 2;
    let y = 0;

    const checkPage = (needed = 8) => {
      if (y + needed > ph - 14) {
        doc.addPage();
        y = 16;
        // repeat subtle header stripe
        doc.setFillColor(245, 247, 255);
        doc.rect(0, 0, pw, 10, 'F');
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 180);
        doc.text('AI-Powered Scientific Research Assistant — SCISYNTHESIS', margin, 7);
        y = 16;
      }
    };

    const addSection = (title: string, accentR: number, accentG: number, accentB: number) => {
      checkPage(14);
      doc.setFillColor(accentR, accentG, accentB);
      doc.roundedRect(margin, y, contentW, 7, 1.5, 1.5, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(title.toUpperCase(), margin + 4, y + 4.8);
      y += 10;
    };

    const addText = (text: string, indent = 0, color: [number,number,number] = [55,65,81]) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...color);
      const lines = doc.splitTextToSize(text, contentW - indent - 4);
      lines.forEach((line: string) => {
        checkPage(6);
        doc.text(line, margin + indent, y);
        y += 5.2;
      });
    };

    const addBullet = (text: string, num?: number) => {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(55, 65, 81);
      const prefix = num !== undefined ? `${num}.  ` : '•  ';
      const lines = doc.splitTextToSize(prefix + text, contentW - 8);
      lines.forEach((line: string, li: number) => {
        checkPage(6);
        doc.text(li === 0 ? line : `    ${line.trimStart()}`, margin + 4, y);
        y += 5.2;
      });
    };

    const addMetricRow = (label: string, value: string) => {
      checkPage(7);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(99, 102, 241);
      doc.text(label, margin + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(value, margin + 60, y);
      y += 5.5;
    };

    const now = new Date().toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    // ── COVER HEADER ──
    doc.setFillColor(67, 56, 202);
    doc.rect(0, 0, pw, 38, 'F');
    doc.setFillColor(109, 40, 217, 0.4);
    doc.circle(pw - 20, 5, 32, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(199, 210, 254);
    doc.text('SCISYNTHESIS  ·  ENTERPRISE INTELLIGENCE PLATFORM', margin, 12);

    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('Research Paper Summarization', margin, 22);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(199, 210, 254);
    doc.text(`Generated: ${now}`, margin, 30);

    y = 46;

    // ── TOPIC ──
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(99, 102, 241);
    doc.text('RESEARCH TOPIC', margin + 4, y + 5.5);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    const topicLines = doc.splitTextToSize(result.research_topic || 'N/A', contentW - 8);
    doc.text(topicLines[0], margin + 4, y + 12);
    y += 22;

    // ── METRICS ──
    addSection('Analysis Metrics', 99, 102, 241);
    addMetricRow('Confidence Score', `${result.confidence_score}%`);
    addMetricRow('Evidence Strength', `${(result.evidence_strength * 100).toFixed(0)}%`);
    addMetricRow('Methodological Robustness', `${(result.methodological_robustness * 10).toFixed(1)} / 10`);
    addMetricRow('Citation Frequency', result.citation_frequency ? `${(result.citation_frequency * 100).toFixed(0)}%` : 'N/A');
    y += 3;

    // ── HYPOTHESES ──
    addSection('Extracted Hypotheses', 79, 70, 229);
    if (result.extracted_hypotheses?.length) {
      result.extracted_hypotheses.forEach((h: string, i: number) => addBullet(h, i + 1));
    } else { addText('None identified.', 4, [150,150,170]); }
    y += 3;

    // ── METHODS ──
    addSection('Methodology Summary', 109, 40, 217);
    addText(result.methods_summary || 'N/A', 4);
    y += 3;

    // ── DATASETS ──
    addSection('Datasets Identified', 16, 185, 129);
    if (result.datasets_identified?.length) {
      result.datasets_identified.forEach((d: string) => addBullet(d));
    } else { addText('None identified.', 4, [150,150,170]); }
    y += 3;

    // ── KEY FINDINGS ──
    addSection('Key Findings', 37, 99, 235);
    if (result.key_findings?.length) {
      result.key_findings.forEach((f: string, i: number) => addBullet(f, i + 1));
    } else { addText('None.', 4, [150,150,170]); }
    y += 3;

    // ── LIMITATIONS ──
    addSection('Limitations & Critical Gaps', 245, 158, 11);
    if (result.limitations?.length) {
      result.limitations.forEach((l: string) => addBullet(l));
    } else { addText('None.', 4, [150,150,170]); }
    y += 3;

    // ── CONTRADICTIONS ──
    addSection('Contradictions Detected', 239, 68, 68);
    if (result.contradictions?.length) {
      result.contradictions.forEach((c: string) => addBullet(c));
    } else { addText('No contradictions detected.', 4, [150,150,170]); }
    y += 3;

    // ── RESEARCH GAP ──
    addSection('Research Gap Identified', 99, 102, 241);
    addText(result.research_gap_identified || 'N/A', 4);
    y += 3;

    // ── NOVEL DIRECTION ──
    checkPage(20);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, contentW, 4, 1, 1, 'F');
    addSection('Suggested Novel Direction', 67, 56, 202);
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(9.5);
    doc.setTextColor(55, 48, 163);
    const ndLines = doc.splitTextToSize(`"${result.suggested_novel_direction || 'N/A'}"`, contentW - 8);
    ndLines.forEach((line: string) => { checkPage(6); doc.text(line, margin + 4, y); y += 5.5; });
    y += 3;

    // ── CITATIONS ──
    addSection('Citation References', 75, 85, 99);
    if (result.citation_references?.length) {
      result.citation_references.forEach((r: string, i: number) => addBullet(r, i + 1));
    } else { addText('None listed.', 4, [150,150,170]); }

    // ── FOOTER on last page ──
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(245, 247, 255);
      doc.rect(0, ph - 10, pw, 10, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(160, 160, 180);
      doc.text('AI-Powered Scientific Research Assistant — SCISYNTHESIS', margin, ph - 4);
      doc.text(`Page ${p} of ${totalPages}`, pw - margin, ph - 4, { align: 'right' });
    }

    const safeName = (result.research_topic || 'analysis').replace(/[^a-z0-9]/gi, '_').slice(0, 40);
    doc.save(`summarization_${safeName}.pdf`);
  };

  const handleCopyFindings = async () => {
    if (!result) return;
    const text = result.key_findings?.join('\n') || '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGlobalSearch = async () => {
    if (!globalQuery.trim()) return;
    setGlobalLoading(true);
    setGlobalResult(null);
    try {
      const res = await api.post('/analysis/global-search', { query: globalQuery, top_k: 5 });
      setGlobalResult(res.data);
    } catch {
      alert('Global search failed. Upload some papers first.');
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleAnalyze = async () => {

    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (query) formData.append('query', query);
    if (selectedProjectId) formData.append('project_id', selectedProjectId);
    
    try {
      const res = await api.post('/analysis/analyze', formData);
      setResult(res.data);
      fetchHistory();
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      const detail = e?.response?.data?.detail || e?.message || 'Unknown error';
      alert(`Analysis failed: ${detail}`);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col items-center selection:bg-gray-200">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-gray-200/30 rounded-full blur-[160px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gray-200/20 rounded-full blur-[140px]"></div>
      </div>

      {/* ── Dark Navbar ───────────────────────────────────────────────── */}
      <header className="relative z-20 w-full bg-gray-900 border-b border-gray-800 px-6 md:px-12 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <SiteLogo size="sm" theme="dark" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setGlobalSearchOpen(!globalSearchOpen); setResult(null); setGlobalResult(null); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-colors border ${globalSearchOpen ? 'bg-white text-gray-900 border-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'}`}
            >
              <Globe size={16} />
              Global Search
            </button>
            <Link
              to="/projects"
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold"
            >
              <FolderPlus size={16} />
              Projects
            </Link>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:bg-gray-700 hover:text-white transition-colors relative"
            >
              <History size={18} />
              {history.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-gray-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full">{history.length}</span>}
            </button>
            <div className="h-6 w-[1px] bg-gray-700 mx-1" />
            <Link to="/profile" className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700 hover:bg-gray-700 transition-all group">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                {user?.profile_picture
                  ? <img src={`/avatars/${user.profile_picture}`} alt="avatar" className="w-full h-full object-cover" />
                  : (user?.full_name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || user?.email?.[0]?.toUpperCase() || 'U')
                }
              </div>
              <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors max-w-[140px] truncate">
                {user?.full_name || user?.email}
              </span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-red-400 hover:border-red-900 hover:bg-red-900/30 transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full flex flex-col items-center px-4 md:px-12 py-8">
        <div className="w-full max-w-[1400px] grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
          <div className="xl:col-span-4 flex flex-col gap-6">
            {showHistory ? (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-8 flex-1 animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Analysis History</h3>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-gray-500"><ChevronRight /></button>
                </div>
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {history.length === 0 ? (
                    <div className="text-center py-10 text-slate-300 font-light italic">No previous analyses</div>
                  ) : history.map((h) => (
                    <div 
                      key={h.id} onClick={() => { setResult(h.result_json); setShowHistory(false); }}
                      className="p-4 bg-gray-50 border border-gray-200 rounded-2xl hover:border-gray-400 hover:bg-white hover:shadow-md transition-all cursor-pointer group flex items-center justify-between"
                    >
                      <div className="overflow-hidden pr-2">
                        <h4 className="text-sm font-semibold text-slate-800 line-clamp-1 mb-1 group-hover:text-gray-700">{h.title}</h4>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          {parseUTC(h.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          {' · '}
                          {parseUTC(h.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteHistory(e, h.id)}
                        className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete Analysis"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-8 md:p-10 flex flex-col justify-center">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`
                    relative border-2 border-dashed rounded-[2.5rem] p-12 text-center cursor-pointer 
                    transition-all duration-500
                    ${file ? 'border-gray-400 bg-gray-50/50 scale-[1.02]' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50/30'}
                  `}
                >
                  <input type="file" title="Upload research paper" ref={fileInputRef} onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" />
                  <div className="mb-4 inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-md border border-slate-50">
                    {file ? <CheckCircle2 className="text-gray-500" size={32} /> : <FileUp className="text-gray-300" size={32} />}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 mb-1 w-full truncate px-2 text-center" title={file?.name}>
                    {file ? file.name : 'Ingest Document'}
                  </h3>
                  <p className="text-sm text-slate-400 font-light">{file ? `${(file.size/1024/1024).toFixed(2)} MB` : 'Drop PDF here'}</p>
                </div>

                <div className="mt-8 space-y-4">
                  <div className="relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      title="Research focus or query"
                      placeholder="Research focus or query..."
                      value={query} onChange={e => setQuery(e.target.value)}
                      className="w-full px-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm"
                    />
                  </div>
                  
                  {projects.length > 0 && (
                    <div className="relative">
                      <select 
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all text-sm appearance-none cursor-pointer text-slate-600 font-medium"
                      >
                        <option value="">Select Project (Optional)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronRight className="rotate-90" size={16} />
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleAnalyze} disabled={!file || loading}
                    className="w-full bg-gray-700 text-white py-3 rounded-xl font-semibold hover:bg-gray-800 shadow-xl flex items-center justify-center gap-2 group text-base"
                  >

                    {loading ? <Loader2 className="animate-spin" size={20} /> : (
                      <><span>Analyze</span><ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            <div className="bg-white/50 backdrop-blur-sm p-6 rounded-2xl border border-white flex flex-col gap-4">
              <div className="flex items-center gap-3 text-slate-600">
                <Info size={18} className="text-gray-500" />
                <span className="text-xs font-bold uppercase tracking-widest">Enterprise Features</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Unlock collaborative tools, cross-paper synthesis, and graph-based citation mapping with our pro workspace.
              </p>
            </div>
          </div>

          <div className="xl:col-span-8">
            {!result && !loading && !globalSearchOpen && (
              <div className="h-full min-h-[500px] bg-white rounded-[2rem] border border-gray-200 flex flex-col items-center justify-center p-16 text-center border-dashed border-2 bg-white/20">
                <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg border border-slate-50 flex items-center justify-center text-gray-200 mb-8 rotate-3">
                  <BookOpen size={40} />
                </div>
                <h3 className="text-xl font-semibold text-gray-400 italic">Select a paper to begin intelligence extraction</h3>
              </div>
            )}

            {globalSearchOpen && !result && (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-10 md:p-12 space-y-8 animate-in zoom-in-95 duration-500">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe size={14} className="text-gray-500" />
                    <h3 className="text-xs font-bold text-gray-700 uppercase tracking-[0.25em]">Global Search</h3>
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">Search Across All Papers</h2>
                  <p className="text-sm text-slate-400 font-light">Query your entire paper library using AI-powered retrieval.</p>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      value={globalQuery}
                      onChange={e => setGlobalQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                      placeholder="Ask anything across all your papers..."
                      className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none text-sm"
                    />
                  </div>
                  <button
                    onClick={handleGlobalSearch}
                    disabled={globalLoading || !globalQuery.trim()}
                    className="px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2 text-sm"
                  >
                    {globalLoading ? <Loader2 className="animate-spin" size={18} /> : <><Search size={18} /><span>Search</span></>}
                  </button>
                </div>
                {globalResult && (
                  <div className="space-y-6">
                    <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">AI Answer</span>
                        <span className="text-xs font-semibold text-slate-400">Confidence: {(globalResult.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{globalResult.answer}</p>
                      {globalResult.explanation && (
                        <p className="mt-3 text-xs text-slate-500 italic">"{globalResult.explanation}"</p>
                      )}
                    </div>
                    {globalResult.sources?.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sources</h4>
                        {globalResult.sources.map((src: any, i: number) => (
                          <div key={i} className="flex gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-200 transition-all">
                            <div className="shrink-0 w-6 h-6 rounded-lg bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-xs">{i + 1}</div>
                            <div>
                              <p className="text-xs text-slate-600 leading-relaxed">{src.text_snippet}</p>
                              <p className="text-[10px] text-slate-400 mt-1">Paper {src.paper_id} · Page {src.page_number} · Match {(src.relevance_score * 100).toFixed(1)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setGlobalResult(null)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X size={12} /> Clear results
                    </button>
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="h-full min-h-[500px] bg-white rounded-[2rem] border border-gray-200 flex flex-col items-center justify-center p-16 text-center">
                <div className="relative w-32 h-32 mb-10">
                  <div className="absolute inset-0 border-4 border-gray-50 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 border-4 border-gray-500 rounded-full border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <Sparkles size={32} />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Synthesizing Paper Intelligence</h3>
                <p className="text-base text-gray-400 mt-2 font-light animate-pulse tracking-widest uppercase">AI Engine Active</p>
              </div>
            )}

            {result && !loading && (
              <div className="bg-white rounded-[2rem] shadow-sm border border-gray-200 p-10 md:p-12 space-y-10 animate-in zoom-in-95 duration-700 overflow-y-auto max-h-[85vh] custom-scrollbar">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star size={14} className="text-gray-500 fill-gray-500" />
                      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-[0.25em]">Automated Synthesis</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyFindings}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-white text-slate-600 hover:border-gray-300 hover:text-gray-700 transition-all shadow-sm"
                      >
                        {copied ? <CheckCheck size={13} className="text-green-500" /> : <Copy size={13} />}
                        {copied ? 'Copied!' : 'Copy Findings'}
                      </button>
                      <button
                        type="button"
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-white text-slate-600 hover:border-gray-300 hover:text-gray-700 transition-all shadow-sm"
                      >
                        <Download size={13} />
                        PDF
                      </button>
                    </div>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 leading-tight">{result.research_topic}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-700 p-6 rounded-[1.5rem] text-white shadow-lg">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Confidence</p>
                    <div className="text-3xl font-bold">{result.confidence_score}%</div>
                  </div>
                  <div className="bg-white border-2 border-gray-200 p-6 rounded-[1.5rem]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Evidence</p>
                    <div className="text-3xl font-bold text-slate-900">{(result.evidence_strength * 100).toFixed(0)}%</div>
                  </div>
                  <div className="bg-slate-900 p-6 rounded-[1.5rem] text-white">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Robustness</p>
                    <div className="text-3xl font-bold">{(result.methodological_robustness * 10).toFixed(1)}</div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={16} className="text-gray-400" />
                    Key Findings
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {result.key_findings?.map((finding: string, i: number) => (
                      <div key={i} className="flex gap-4 p-5 bg-gray-50 border border-gray-100/50 rounded-2xl hover:bg-white hover:border-gray-200 transition-all">
                        <div className="shrink-0 w-8 h-8 rounded-xl bg-gray-200 flex items-center justify-center text-gray-700 font-bold text-sm">{i + 1}</div>
                        <p className="text-base text-slate-700 leading-relaxed font-light">{finding}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-8 border-t border-gray-200">
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2"><AlertCircle size={12} />Critical Gaps</h3>
                    <div className="bg-orange-50/50 p-5 rounded-2xl space-y-1.5">
                      {result.limitations?.slice(0, 3).map((l: string, i: number) => (
                        <p key={i} className="text-xs text-orange-800/70 font-light flex gap-2"><span className="text-orange-300">•</span> {l}</p>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2"><Zap size={12} />Future Vector</h3>
                    <div className="bg-gray-500/10 p-5 rounded-2xl">
                      <p className="text-xs text-gray-900 font-semibold italic">"{result.suggested_novel_direction}"</p>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
      `}</style>
    </div>
  );
};

export default Dashboard;
