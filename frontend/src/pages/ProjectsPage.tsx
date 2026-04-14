import React, { useState, useEffect } from 'react';
import {
  Plus, Folder, ChevronRight, LogOut, LayoutDashboard,
  Calendar, Loader2, Trash2
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import SiteLogo from '../components/SiteLogo';

interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

const ProjectsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await api.get('/projects/');
      setProjects(res.data);
    } catch {
      console.error('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/projects/', { name: newName, description: newDesc });
      setProjects([...projects, res.data]);
      setIsCreating(false);
      setNewName('');
      setNewDesc('');
    } catch {
      alert('Failed to create project');
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project? All associated papers will be removed.')) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects(projects.filter(p => p.id !== id));
    } catch {
      alert('Failed to delete project');
    }
  };

  const handleOpenProject = (id: number) => {
    navigate(`/projects/${id}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };;


  return (
    <div className="min-h-screen w-full bg-gray-50 flex flex-col items-center">

      {/* Dark Navbar */}
      <header className="w-full bg-gray-900 border-b border-gray-800 px-6 md:px-12 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <SiteLogo size="sm" theme="dark" />
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2 text-sm font-semibold"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
            <div className="h-6 w-[1px] bg-gray-700 mx-1" />
            <Link to="/profile" className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700 hover:bg-gray-700 transition-all">
              <span className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">{user?.full_name || user?.email}</span>
            </Link>
            <button type="button" onClick={handleLogout} className="p-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-900/30 transition-all">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 w-full flex flex-col items-center px-4 md:px-12 py-8">
        <main className="w-full max-w-7xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Your Projects</h2>
              <p className="text-slate-500 mt-1">Organize your research papers into specialized collections.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="bg-gray-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 flex items-center gap-2"
            >
              <Plus size={20} />
              New Project
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-500 w-12 h-12 mb-4" />
              <p className="text-slate-400 font-medium">Loading your workspaces...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div 
                  key={project.id}
                  className="bg-white p-6 rounded-[2rem] border border-gray-200 hover:border-gray-200 hover:shadow-xl hover:shadow-gray-50/50 transition-all group"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-700 mb-4 group-hover:bg-gray-700 group-hover:text-white transition-colors">
                    <Folder size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{project.name}</h3>
                  <p className="text-slate-500 text-sm line-clamp-2 mb-6 h-10">{project.description || 'No description provided.'}</p>
                  
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold uppercase tracking-widest">
                        <Calendar size={14} />
                        {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteProject(project.id)}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenProject(project.id)}
                        className="text-gray-700 hover:text-gray-800 flex items-center gap-1 text-sm font-bold group-hover:translate-x-1 transition-transform"
                      >
                        Open <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                </div>
              ))}

              {projects.length === 0 && !isCreating && (
                <div className="col-span-full bg-white/50 border-2 border-dashed border-gray-200 rounded-[2.5rem] py-20 flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-slate-200 mb-6">
                    <Folder size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-400">No projects yet</h3>
                  <p className="text-slate-400 max-w-xs mt-2 font-light">Create your first project to start organizing your research intelligence.</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-6">Initialize New Project</h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2 px-1">Project Name</label>
                <input 
                  type="text" required value={newName} onChange={e => setNewName(e.target.value)}
                  className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all"
                  placeholder="e.g. Quantum Computing 2026"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2 px-1">Description</label>
                <textarea 
                  value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 outline-none transition-all h-32 resize-none"
                  placeholder="Focus of this research workspace..."
                />
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  type="button" onClick={() => setIsCreating(false)}
                  className="flex-1 px-6 py-3 border border-gray-200 rounded-xl text-slate-600 font-semibold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
