import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SiteLogo from '../components/SiteLogo';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <h2 className="text-lg font-bold text-white mb-3">{title}</h2>
    <div className="text-sm text-gray-400 leading-relaxed space-y-2">{children}</div>
  </div>
);

const PrivacyPolicyPage: React.FC = () => (
  <div className="min-h-screen bg-gray-950 text-white">
    {/* Header */}
    <div className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
        <SiteLogo size="sm" linked theme="dark" />
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </Link>
      </div>
    </div>

    {/* Content */}
    <div className="max-w-3xl mx-auto px-6 py-14">
      <h1 className="text-3xl font-extrabold text-white mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-10">
        Effective date: January 1, 2025 &nbsp;·&nbsp; Last updated: April 1, 2026
      </p>

      <Section title="1. Overview">
        <p>
          SciSynthesis ("we", "our", or "us") is committed to protecting your privacy. This Privacy
          Policy explains how we collect, use, and safeguard information when you use our
          AI-powered scientific research assistant platform.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>We may collect the following types of information:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li><span className="text-gray-300 font-medium">Account data</span> — name, email address, and password (stored as a secure hash).</li>
          <li><span className="text-gray-300 font-medium">Research data</span> — documents, queries, and project content you upload or create.</li>
          <li><span className="text-gray-300 font-medium">Usage data</span> — pages visited, features used, and interaction logs for improving the service.</li>
          <li><span className="text-gray-300 font-medium">Newsletter data</span> — email address if you subscribe to our newsletter.</li>
        </ul>
      </Section>

      <Section title="3. How We Use Your Information">
        <ul className="list-disc list-inside space-y-1">
          <li>To provide and improve our research assistant features.</li>
          <li>To authenticate your account and keep it secure.</li>
          <li>To send product updates and newsletters (only if you opted in).</li>
          <li>To analyze usage patterns and fix issues.</li>
        </ul>
      </Section>

      <Section title="4. Data Sharing">
        <p>
          We do not sell your personal data. We may share data with trusted third-party services
          (e.g., cloud hosting, email delivery) solely to operate the platform. These providers
          are contractually bound to protect your data.
        </p>
      </Section>

      <Section title="5. Data Retention">
        <p>
          We retain your account and project data for as long as your account is active. You may
          request deletion of your data at any time by contacting us.
        </p>
      </Section>

      <Section title="6. Security">
        <p>
          We use industry-standard security measures including encrypted connections (HTTPS),
          hashed passwords, and access controls. No system is 100% secure, so we encourage you
          to use a strong, unique password.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>You have the right to:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>Withdraw consent for newsletter communications at any time.</li>
        </ul>
      </Section>

      <Section title="8. Contact">
        <p>
          For any privacy-related questions, please reach out to us at{' '}
          <a
            href="https://mail.google.com/mail/?view=cm&to=scisynthesis07@gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-white underline underline-offset-2 transition-colors"
          >
            scisynthesis07@gmail.com
          </a>
          .
        </p>
      </Section>
    </div>
  </div>
);

export default PrivacyPolicyPage;
