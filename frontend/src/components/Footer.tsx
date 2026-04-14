import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Phone, MapPin,
  Linkedin, Github, Twitter,
  ArrowRight, CheckCircle2,
} from 'lucide-react';
import SiteLogo from './SiteLogo';
import emailjs from '@emailjs/browser';

const EMAILJS_SERVICE_ID  = 'service_scisynthesis';
const EMAILJS_TEMPLATE_ID = 'template_hvefuje';
const EMAILJS_PUBLIC_KEY  = 'rtqUSs90uU3NrX_ai';

// ─── Data ────────────────────────────────────────────────────────────────────

const SERVICES = [
  { label: 'AI Research',       href: '#' },
  { label: 'Document Analysis', href: '#' },
  { label: 'Data Processing',   href: '#' },
  { label: 'Automation',        href: '#' },
];


const SOCIALS = [
  { icon: Github,    href: 'https://github.com/krinapansuriya', label: 'GitHub'    },
  { icon: Twitter,   href: 'https://x.com/krinapansuriaa', label: 'Twitter'   },
  { icon: Linkedin,  href: 'https://www.linkedin.com/in/krina-pansuriya-316b29329/', label: 'LinkedIn'  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const FooterHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-xs font-extrabold text-white uppercase tracking-[0.2em] mb-5">
    {children}
  </h4>
);

const FooterLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => {
  const isInternal = href.startsWith('/');
  const cls =
    'block text-sm text-gray-400 hover:text-white font-medium transition-colors duration-200 mb-3';
  return isInternal
    ? <Link to={href} className={cls}>{children}</Link>
    : <a href={href} className={cls}>{children}</a>;
};

// ─── Main Footer ──────────────────────────────────────────────────────────────

const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError('');
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          name: email,
          message: `New newsletter subscriber: ${email}`,
          scisynthesis: 'SciSynthesis Newsletter',
          time: new Date().toLocaleString(),
        },
        EMAILJS_PUBLIC_KEY
      );
      setSubscribed(true);
      setEmail('');
      setTimeout(() => setSubscribed(false), 5000);
    } catch {
      setError('Failed to subscribe. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <footer className="bg-gray-900 border-t border-gray-800 mt-auto">

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 md:px-12 pt-16 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {/* 1 · Brand + description (spans 2 cols on large screens) */}
          <div className="lg:col-span-2">
            <div className="mb-4">
              <SiteLogo size="sm" linked={false} theme="dark" />
            </div>

            <p className="text-sm text-gray-400 font-medium leading-relaxed max-w-xs mb-6">
              AI-powered scientific research assistant that helps you analyze papers,
              synthesize findings, and accelerate discovery.
            </p>

            {/* Contact info */}
            <div className="space-y-3">
              <a
                href="https://mail.google.com/mail/?view=cm&to=scisynthesis07@gmail.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm text-gray-400 hover:text-white font-medium transition-colors group"
              >
                <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors flex-shrink-0">
                  <Mail size={13} className="text-gray-400 group-hover:text-white" />
                </span>
                scisynthesis07@gmail.com
              </a>
              <a
                href="tel:+919601535552"
                className="flex items-center gap-3 text-sm text-gray-400 hover:text-white font-medium transition-colors group"
              >
                <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors flex-shrink-0">
                  <Phone size={13} className="text-gray-400 group-hover:text-white" />
                </span>
                +91 96015 35552
              </a>
              <div className="flex items-start gap-3 text-sm text-gray-400 font-medium">
                <span className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin size={13} className="text-gray-400" />
                </span>
                <span>Surat, Gujarat, India</span>
              </div>
            </div>
          </div>

          {/* 2 · Services */}
          <div>
            <FooterHeading>Services</FooterHeading>
            {SERVICES.map(s => (
              <FooterLink key={s.label} href={s.href}>{s.label}</FooterLink>
            ))}
          </div>

          {/* 3 · Newsletter */}
          <div className="sm:col-span-2 lg:col-span-1">
            <FooterHeading>Newsletter</FooterHeading>
            <p className="text-sm text-gray-400 font-medium mb-4 leading-relaxed">
              Get the latest AI research insights delivered to your inbox.
            </p>

            {subscribed ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-green-900/40 border border-green-700 rounded-xl text-sm text-green-400 font-semibold">
                <CheckCircle2 size={15} />
                Subscribed successfully!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-sm text-white placeholder:text-gray-600 font-medium focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-gray-600 transition-all"
                  required
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                  {sending ? 'Sending...' : <><span>Subscribe</span> <ArrowRight size={14} /></>}
                </button>
              </form>
            )}
          </div>

        </div>

        {/* ── Divider ────────────────────────────────────────────────────── */}
        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Social icons */}
          <div className="flex items-center gap-2">
            {SOCIALS.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 hover:border-gray-600 transition-all"
              >
                <Icon size={15} />
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-xs text-gray-600 font-medium text-center">
            © {new Date().getFullYear()} SCISYNTHESIS. All rights reserved.
            &nbsp;·&nbsp;
            <Link to="/privacy-policy" className="text-gray-500 hover:text-gray-300 transition-colors">Privacy Policy</Link>
            &nbsp;·&nbsp;
            <span className="text-gray-700">Built with AI for Researchers.</span>
          </p>

        </div>
      </div>

    </footer>
  );
};

export default Footer;
