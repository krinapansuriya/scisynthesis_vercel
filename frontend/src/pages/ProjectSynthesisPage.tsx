import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Zap, Sparkles, AlertCircle, Target,
  CheckCircle2, ShieldCheck, Star, Download
} from 'lucide-react';
import SiteLogo from '../components/SiteLogo';
import { jsPDF } from 'jspdf';
import api from '../lib/api';

const ProjectSynthesisPage: React.FC = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [synthesis, setSynthesis] = useState<any>(null);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const handleExport = () => {
    if (!synthesis) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 18;
    const cw = pw - margin * 2;
    let y = 0;

    const checkPage = (need = 10) => {
      if (y + need > ph - 14) {
        doc.addPage();
        y = 16;
        doc.setFillColor(245, 247, 255);
        doc.rect(0, 0, pw, 10, 'F');
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 180);
        doc.text('SCISYNTHESIS — Research Synthesis Report', margin, 7);
      }
    };

    const wrapText = (text: string, fontSize: number, maxW: number) => {
      doc.setFontSize(fontSize);
      return doc.splitTextToSize(text, maxW);
    };

    // ── Cover ──
    doc.setFillColor(30, 27, 75);
    doc.rect(0, 0, pw, 60, 'F');
    doc.setFillColor(99, 102, 241);
    doc.circle(pw - 20, 10, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('SCISYNTHESIS — ENTERPRISE SYNTHESIS ENGINE', margin, 22);
    doc.setFontSize(18);
    const titleLines = wrapText(synthesis.overall_theme || 'Research Synthesis Report', 18, cw);
    doc.text(titleLines, margin, 34);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(199, 210, 254);
    doc.text(`Synthesis Confidence: ${synthesis.confidence_score}%   |   Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, 55);
    y = 72;

    // ── Section helper ──
    const section = (label: string, r: number, g: number, b: number) => {
      checkPage(14);
      doc.setFillColor(r, g, b);
      doc.roundedRect(margin, y, cw, 10, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(label.toUpperCase(), margin + 4, y + 6.8);
      y += 14;
      doc.setTextColor(51, 51, 51);
      doc.setFont('helvetica', 'normal');
    };

    const bullet = (text: string, color: [number, number, number]) => {
      const lines = wrapText(`• ${text}`, 9.5, cw - 8);
      checkPage(lines.length * 5 + 6);
      doc.setFillColor(...color);
      doc.roundedRect(margin, y, cw, lines.length * 5 + 6, 2, 2, 'F');
      doc.setTextColor(40, 40, 60);
      doc.setFontSize(9.5);
      doc.text(lines, margin + 4, y + 5);
      y += lines.length * 5 + 10;
    };

    // ── Consensus Findings ──
    section('Consensus Findings', 22, 163, 74);
    synthesis.consensus_findings?.forEach((f: string) => bullet(f, [240, 253, 244]));
    y += 4;

    // ── Contradictions ──
    section('Research Contradictions', 234, 88, 12);
    if (synthesis.major_contradictions?.length) {
      synthesis.major_contradictions.forEach((c: string) => bullet(c, [255, 247, 237]));
    } else {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text('No significant contradictions identified.', margin + 4, y);
      y += 8;
    }
    y += 4;

    // ── Research Gap ──
    section('Unified Research Frontier', 79, 70, 229);
    const gapLines = wrapText(`"${synthesis.combined_research_gap}"`, 10, cw - 8);
    checkPage(gapLines.length * 5.5 + 10);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, cw, gapLines.length * 5.5 + 8, 2, 2, 'F');
    doc.setTextColor(55, 48, 163);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bolditalic');
    doc.text(gapLines, margin + 4, y + 6);
    y += gapLines.length * 5.5 + 14;
    doc.setFont('helvetica', 'normal');

    // ── Strategic Next Steps ──
    section('Strategic Next Steps', 79, 70, 229);
    synthesis.strategic_next_steps?.forEach((step: string, i: number) => {
      const lines = wrapText(`${i + 1}. ${step}`, 9.5, cw - 8);
      checkPage(lines.length * 5 + 6);
      doc.setFillColor(238, 242, 255);
      doc.roundedRect(margin, y, cw, lines.length * 5 + 6, 2, 2, 'F');
      doc.setTextColor(40, 40, 100);
      doc.setFontSize(9.5);
      doc.text(lines, margin + 4, y + 5);
      y += lines.length * 5 + 10;
    });

    // ── Page numbers ──
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180, 180, 200);
      doc.text(`Page ${i} of ${total}`, pw - margin, ph - 6, { align: 'right' });
    }

    doc.save(`synthesis-report-project-${projectId}.pdf`);
  };

  const fetchData = async () => {
    try {
      const [projRes, synthRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.post(`/synthesis/${projectId}`)
      ]);
      setProject(projRes.data);
      setSynthesis(synthRes.data);
      console.log('[Synthesis] overall_theme:', synthRes.data?.overall_theme);
      console.log('[Project] name:', projRes.data?.name);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      const msg = e?.response?.data?.detail || 'Could not synthesize project. Ensure you have papers uploaded.';
      alert(msg);
      navigate(`/projects/${projectId}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 border-4 border-gray-200 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 border-4 border-gray-700 rounded-full border-t-transparent animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center text-gray-700">
           <Sparkles size={32} />
        </div>
      </div>
      <h2 className="text-xl font-bold text-slate-900 tracking-tight">Cross-Paper Synthesis Active</h2>
      <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.3em] mt-2">Aggregating Neural Intelligence</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      {/* Dark Navbar */}
      <header className="w-full bg-gray-900 border-b border-gray-800 px-6 md:px-12 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <SiteLogo size="sm" theme="dark" />
          <div className="flex items-center gap-2">
            <Link to={`/projects/${projectId}`} className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft size={16} />
              Back to Project
            </Link>
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors text-sm font-semibold"
            >
              <Download size={14} />
              Export Report
            </button>
            <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-700">
              <ShieldCheck size={14} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Enterprise Synthesis Engine</span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-5xl px-4 md:px-12 py-8">
        <div className="space-y-8 animate-in zoom-in-95 duration-700">
           {/* Summary Header */}
           <div className="bg-slate-900 rounded-[2.5rem] p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gray-500/10 rounded-full blur-[80px] -mr-32 -mt-32"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shadow-lg shadow-gray-500/20">
                      <Star size={16} fill="white" />
                   </div>
                   <h3 className="text-xs font-bold uppercase tracking-[0.3em] text-gray-300">Project Theme Analysis</h3>
                </div>
                <h1 className="text-4xl font-bold mb-6 leading-tight text-white">
                  {synthesis.overall_theme
                    && synthesis.overall_theme !== 'str'
                    && synthesis.overall_theme.trim() !== ''
                    ? synthesis.overall_theme
                    : project?.name || 'Research Synthesis Report'}
                </h1>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl backdrop-blur-sm border border-white/10">
                   <Target size={16} className="text-gray-400" />
                   <span className="text-sm font-medium">Synthesis Confidence: {synthesis.confidence_score}%</span>
                </div>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Consensus */}
              <div className="bg-white rounded-[2rem] p-8 border border-gray-200 shadow-sm">
                 <h3 className="text-sm font-bold text-green-600 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <CheckCircle2 size={18} /> Consensus Findings
                 </h3>
                 <div className="space-y-4">
                    {synthesis.consensus_findings.map((f: string, i: number) => (
                       <div key={i} className="p-5 bg-green-50 rounded-2xl text-slate-700 text-sm leading-relaxed font-medium">
                          {f}
                       </div>
                    ))}
                 </div>
              </div>

              {/* Contradictions */}
              <div className="bg-white rounded-[2rem] p-8 border border-gray-200 shadow-sm">
                 <h3 className="text-sm font-bold text-orange-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <AlertCircle size={18} /> Research Contradictions
                 </h3>
                 <div className="space-y-4">
                    {synthesis.major_contradictions.map((c: string, i: number) => (
                       <div key={i} className="p-5 bg-orange-50 rounded-2xl text-slate-700 text-sm leading-relaxed font-medium">
                          {c}
                       </div>
                    ))}
                    {synthesis.major_contradictions.length === 0 && (
                       <p className="text-center py-10 text-slate-400 italic text-sm">No significant contradictions identified.</p>
                    )}
                 </div>
              </div>
           </div>

           {/* The Research Gap */}
           <div className="bg-gray-700 rounded-[2.5rem] p-10 text-white shadow-xl">
              <div className="flex items-center gap-3 mb-6">
                 <Zap size={24} />
                 <h3 className="text-lg font-bold">Unified Research Frontier</h3>
              </div>
              <p className="text-xl font-light leading-relaxed mb-10 text-gray-50">
                "{synthesis.combined_research_gap}"
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {synthesis.strategic_next_steps.map((step: string, i: number) => (
                    <div key={i} className="flex gap-4 p-5 bg-white/10 rounded-2xl backdrop-blur-sm border border-white/10">
                       <div className="shrink-0 w-8 h-8 rounded-full bg-white text-gray-700 flex items-center justify-center font-bold text-sm">{i+1}</div>
                       <p className="text-sm font-medium">{step}</p>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSynthesisPage;
