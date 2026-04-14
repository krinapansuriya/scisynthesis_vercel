import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, FileText, Plus, Zap, BookOpen, Star,
  Sparkles, History, MessageSquare, ChevronRight, Loader2, Trash2
} from 'lucide-react';
import SiteLogo from '../components/SiteLogo';

import api from '../lib/api';

const ProjectDetailsPage: React.FC = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPaper, setSelectedPaper] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    try {
      const res = await api.get(`/projects/${projectId}`);
      setProject(res.data);
    } catch {
      console.error('Failed to fetch project');
      navigate('/projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async (paperId: number) => {
    try {
      const res = await api.get(`/projects/notes/${paperId}`);
      setNotes(res.data);
    } catch {
      console.error('Failed to fetch notes');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedPaper) return;
    try {
      const res = await api.post('/projects/notes', {
        paper_id: selectedPaper.id,
        content: newNote
      });
      setNotes([...notes, res.data]);
      setNewNote('');
    } catch {
      alert('Failed to add note');
    }
  };

  const handleDeletePaper = async (e: React.MouseEvent, paperId: number) => {
    e.stopPropagation();
    if (!confirm('Remove this paper from the project?')) return;
    try {
      await api.delete(`/analysis/${paperId}`);
      setProject({
        ...project,
        papers: project.papers.filter((p: any) => p.id !== paperId)
      });
      if (selectedPaper?.id === paperId) {
        setSelectedPaper(null);
        setNotes([]);
      }
    } catch {
      alert('Failed to delete paper');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="animate-spin text-gray-500 w-12 h-12" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      {/* Dark Navbar */}
      <header className="w-full bg-gray-900 border-b border-gray-800 px-6 md:px-12 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <SiteLogo size="sm" theme="dark" />
          <div className="flex items-center gap-2">
            <Link to="/projects" className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold">
              <ArrowLeft size={16} />
              Back to Projects
            </Link>
            <div className="h-6 w-[1px] bg-gray-700 mx-1" />
            <span className="text-sm font-semibold text-gray-400">{project.name}</span>
          </div>
        </div>
      </header>
      <div className="relative z-10 w-full max-w-7xl px-4 md:px-12 py-8">

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Paper List */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-200">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{project.name}</h2>
              <p className="text-slate-500 text-sm mb-6">{project.description || 'No description provided.'}</p>

              <div className="flex items-center justify-between mb-4 pt-6 border-t border-slate-50">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">Papers ({project.papers?.length || 0})</span>
                <Link to={`/?projectId=${project.id}`} className="text-xs font-bold text-slate-400 hover:text-gray-700 uppercase tracking-widest flex items-center gap-1">
                  <Plus size={14} /> Add New
                </Link>
              </div>

              <div className="space-y-3">
                {project.papers?.map((paper: any) => (
                  <div key={paper.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => { setSelectedPaper(paper); fetchNotes(paper.id); }}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between ${selectedPaper?.id === paper.id ? 'bg-gray-700 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-white'}`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden pr-8">
                        <FileText size={18} className={selectedPaper?.id === paper.id ? 'text-gray-200' : 'text-gray-400'} />
                        <span className="text-sm font-semibold truncate">{paper.title}</span>
                      </div>
                      <ChevronRight size={16} className={`shrink-0 transition-transform group-hover:translate-x-1 ${selectedPaper?.id === paper.id ? 'text-gray-200' : 'text-slate-300'}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeletePaper(e, paper.id)}
                      className={`absolute right-10 top-1/2 -translate-y-1/2 p-2 transition-all opacity-0 group-hover:opacity-100 ${selectedPaper?.id === paper.id ? 'text-gray-300 hover:text-white' : 'text-slate-300 hover:text-red-500'}`}
                      title="Remove Paper"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

                {(!project.papers || project.papers.length === 0) && (
                  <div className="text-center py-12 px-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <History size={24} />
                    </div>
                    <p className="text-slate-400 text-sm italic">No papers in this workspace yet.</p>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/projects/${projectId}/synthesis`)}
              disabled={!project.papers || project.papers.length === 0}
              className="w-full bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl flex items-center justify-between group hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-500 rounded-xl flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold">Synthesize Research</h4>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest">Generate Cross-Paper Insight</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => navigate(`/projects/${projectId}/advanced`)}
              disabled={!project.papers || project.papers.length === 0}
              className="w-full bg-gray-700 text-white p-6 rounded-[2rem] shadow-xl flex items-center justify-between group hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-400 rounded-xl flex items-center justify-center">
                  <Zap size={20} />
                </div>
                <div className="text-left">
                  <h4 className="text-sm font-bold">Advanced RAG Tools</h4>
                  <p className="text-[10px] text-gray-200 uppercase tracking-widest">Chat, Compare, & Cluster</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-gray-300 group-hover:translate-x-1 transition-transform" />
            </button>

          </div>

          {/* Right: Paper Analysis & Notes */}
          <div className="lg:col-span-8">
            {selectedPaper ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white rounded-[2rem] p-10 shadow-sm border border-gray-200">
                  <div className="flex items-center gap-2 mb-4">
                    <Star size={16} className="text-gray-500 fill-gray-500" />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-widest">Analysis View</span>
                  </div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-8 leading-tight">{selectedPaper.title}</h1>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                     <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Confidence</p>
                        <p className="text-2xl font-bold text-slate-900">{selectedPaper.result_json.confidence_score}%</p>
                     </div>
                     <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Evidence</p>
                        <p className="text-2xl font-bold text-slate-900">{(selectedPaper.result_json.evidence_strength * 100).toFixed(0)}%</p>
                     </div>
                     <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Robustness</p>
                        <p className="text-2xl font-bold text-slate-900">{(selectedPaper.result_json.methodological_robustness * 10).toFixed(1)}</p>
                     </div>
                  </div>

                  <div className="space-y-8">
                    <div>
                       <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Zap size={16} className="text-gray-500" /> Key Findings
                       </h3>
                       <div className="grid grid-cols-1 gap-4">
                          {selectedPaper.result_json.key_findings?.map((f: string, i: number) => (
                            <div key={i} className="p-5 bg-gray-50 rounded-2xl border border-gray-200 text-slate-700 leading-relaxed text-sm">
                               {f}
                            </div>
                          ))}
                       </div>
                    </div>

                    <div className="pt-8 border-t border-slate-50">
                       <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <MessageSquare size={16} className="text-gray-500" /> Researcher Notes
                       </h3>

                       <div className="space-y-4 mb-6">
                          {notes.map((note: any) => (
                            <div key={note.id} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100/50 relative group">
                               <p className="text-sm text-slate-700">{note.content}</p>
                               <span className="text-[10px] text-slate-400 mt-2 block uppercase font-bold tracking-tighter">
                                  {new Date(note.created_at).toLocaleString()}
                               </span>
                            </div>
                          ))}
                          {notes.length === 0 && (
                            <p className="text-center py-4 text-slate-400 text-xs italic">No notes for this paper yet.</p>
                          )}
                       </div>

                       <div className="relative">
                          <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Add an observation or question..."
                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-5 text-sm focus:ring-2 focus:ring-gray-500 outline-none transition-all h-24 resize-none"
                          />
                          <button
                            type="button"
                            onClick={handleAddNote}
                            className="absolute bottom-4 right-4 bg-gray-700 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                          >
                            Add Note
                          </button>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[500px] bg-white rounded-[2rem] border border-gray-200 flex flex-col items-center justify-center p-16 text-center border-dashed border-2 bg-white/20">
                <div className="w-20 h-20 bg-white rounded-[2rem] shadow-lg border border-slate-50 flex items-center justify-center text-gray-200 mb-8">
                  <BookOpen size={40} />
                </div>
                <h3 className="text-xl font-semibold text-gray-400 italic">Select a paper from the list to explore intelligence</h3>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetailsPage;
